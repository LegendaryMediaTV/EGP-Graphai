import fs from "fs";
import path from "path";
import Content, {
  ContentAbbreviation,
  ContentBibleLink,
  ContentHeading,
  ContentNested,
  ContentObject,
} from "../types/Content";
import { writeFileAtomic } from "../functions/writeJsonFile";
import VerseSchema from "../types/VerseSchema";
import BibleVersion from "../types/Version";

// ============================================================================
// Core Content Rendering Options
// ============================================================================

/**
 * Per-format rendering knobs shared by every rendering function below.
 * `TEXT_OPTIONS` and `MARKDOWN_OPTIONS` are the two concrete configurations.
 */
interface RenderOptions {
  includeStrongs: boolean; // Whether to append Strong's numbers after words
  includeMorph: boolean; // Whether to append morphology codes after words
  includeFootnotes: boolean; // Whether footnote markers/content render at all
  footnoteStyle: "inline" | "reference"; // inline = °{...} at point of reference; reference = collected into a footer list
  paragraphMarker: string; // Text inserted at the start of a new paragraph
  lineBreakMarker: string; // Text inserted at an explicit line break
  headingWrapper: (text: string, type?: "standard" | "acrostic") => string; // Wraps rendered heading text; type selects standard vs. acrostic styling
  subtitleWrapper: (text: string) => string; // Wraps rendered subtitle text
  footnoteMarker: (index: number) => string; // Renders the marker for the footnote at the given 0-based index within the current footnotes list
  boldWrapper: (text: string) => string; // Wraps text carrying a "b" mark
  italicWrapper: (text: string) => string; // Wraps text carrying an "i" mark
  superscriptWrapper: (text: string) => string; // Wraps text carrying a "sup" mark
  escapeSourceText: (text: string) => string; // Escapes this format's own delimiter characters when they appear in text taken verbatim from content (see `escapeMarkdownDelimiters`)
}

/** Rendering configuration for the plain-text export (`exports/text-vbv-strongs`). */
const TEXT_OPTIONS: RenderOptions = {
  includeStrongs: true,
  includeMorph: true,
  includeFootnotes: true,
  footnoteStyle: "inline",
  paragraphMarker: "¶ ",
  lineBreakMarker: "␤",
  headingWrapper: (text, type) =>
    type === "acrostic" ? `[[[${text}]]] ` : `[[${text}]] `,
  subtitleWrapper: (text) => `«${text}» `,
  footnoteMarker: () => "°",
  boldWrapper: (text) => text,
  italicWrapper: (text) => text,
  // Plain text has no way to raise a baseline, so a superscript siglum
  // modifier prints inline: "NA27", "1143vid". Losing the distinction beats
  // inventing a caret notation this format's readers would have to learn.
  superscriptWrapper: (text) => text,
  // The text export has no delimiter grammar of its own to collide with.
  escapeSourceText: (text) => text,
};

/**
 * Letter label for the nth footnote (0-based) in a chapter: a, b, ... z, aa,
 * ab, ... Chapters routinely carry more than 26 footnotes, so the label must
 * keep extending rather than wrapping back to "a".
 */
function footnoteLabel(index: number): string {
  let remaining = index;
  let label = "";
  do {
    label = String.fromCharCode(97 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

/**
 * Markdown heading marker for a heading's type: one level smaller for
 * acrostic (Hebrew acrostic stanza marker, e.g. Psalm 119) than standard.
 */
function markdownHeadingMarker(type?: "standard" | "acrostic"): string {
  return type === "acrostic" ? "####" : "###";
}

/** Rendering configuration for the markdown export (`exports/markdown-par`). */
const MARKDOWN_OPTIONS: RenderOptions = {
  includeStrongs: false,
  includeMorph: false,
  includeFootnotes: true,
  footnoteStyle: "reference",
  paragraphMarker: "\n\n",
  lineBreakMarker: "<br>",
  headingWrapper: (text, type) => `\n${markdownHeadingMarker(type)} ${text}\n`,
  // "> " is a block marker, not part of the emphasis span, so it stays
  // outside the italic wrap.
  subtitleWrapper: (text) => `> ${wrapDelimitersOffWhitespace(text, "_")}`,
  footnoteMarker: (index) => `<sup>${footnoteLabel(index)}</sup>`,
  boldWrapper: (text) => wrapDelimitersOffWhitespace(text, "**"),
  italicWrapper: (text) => wrapDelimitersOffWhitespace(text, "_"),
  superscriptWrapper: (text) => `<sup>${text}</sup>`,
  escapeSourceText: escapeMarkdownDelimiters,
};

// ============================================================================
// Core Rendering Functions
// ============================================================================

/** Threaded through every render call in a single conversion pass. */
interface RenderContext {
  options: RenderOptions; // Active TEXT_OPTIONS or MARKDOWN_OPTIONS
  footnotes: string[]; // Reference-style footnote lines collected during the render (populated only when footnoteStyle is "reference")
  verseNum?: number; // Current verse number; falls back to this as the footnote prefix ("N.") when footnotePrefix isn't set
  footnotePrefix?: string; // "Subtitle." or "Heading." for special contexts
  withinItalicWrapper?: boolean; // Whether the text this render returns lands inside an italic wrapper its caller applies (see `italicWrapperFor`)
  abbreviations?: ReadonlyMap<string, Content>; // Display names from the version's `abbr` registry, keyed by id, resolving `{ abbr }` nodes
}

/**
 * Applies a "sup" mark, leaving any whitespace on either side outside the
 * wrapper. The array branch reads a core's leading and trailing whitespace
 * to decide spacing between siblings, so burying a space inside `<sup>`
 * would hide it from that logic and fuse two words.
 */
function wrapSuperscript(
  text: string,
  marks: ContentObject["marks"],
  ctx: RenderContext
): string {
  if (!marks?.includes("sup") || text.trim() === "") return text;
  const [, leading, core, trailing] = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return leading + ctx.options.superscriptWrapper(core) + trailing;
}

/** Wraps nothing, for a mark whose delimiters would be redundant where the text lands. */
const NO_EMPHASIS_WRAP = (text: string) => text;

/**
 * The italic wrapper to apply to text rendered under `ctx` — the format's own
 * wrapper, unless the text lands inside an italic wrapper the caller applies
 * anyway, in which case a second "i" mark would nest a redundant, colliding
 * delimiter.
 *
 * The subtitle path is the only caller that sets the flag: `subtitleWrapper`
 * italicizes the whole line (`> _..._`). It is a fact about where the text
 * lands, not about the output format, which is why it lives on the context
 * beside `footnotePrefix` rather than in `RenderOptions`.
 */
function italicWrapperFor(ctx: RenderContext): (text: string) => string {
  return ctx.withinItalicWrapper ? NO_EMPHASIS_WRAP : ctx.options.italicWrapper;
}

/**
 * Whether `item`'s render ends with a Strong's/morph/lemma tag that has nothing
 * after it to separate it from a following sibling. `break` disqualifies: a line
 * break already separates, and by established convention the tag is rendered
 * glued straight to it ("H2400␤").
 */
function endsWithUnseparatedTag(item: Content, ctx: RenderContext): boolean {
  if (typeof item === "string" || Array.isArray(item) || item === null || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  if (record.break === true) return false;
  return (
    (typeof record.strong === "string" && ctx.options.includeStrongs) ||
    (typeof record.morph === "string" && ctx.options.includeMorph) ||
    (typeof record.lemma === "string" && ctx.options.includeStrongs)
  );
}

/** Whether rendered text opens with a letter (any script) — the signature of a real word starting with no leading space of its own. */
function startsWithLetter(text: string): boolean {
  return /^\p{L}/u.test(text);
}

/**
 * A node carrying only a footnote — no text, Strong's number, or nested
 * content. Two real corpus shapes take this form: a *second* footnote on
 * one word, riding as a textless sibling right after it since
 * `content-schema.json` allows only one `foot` per node; or a `{foot}` that
 * is the *sole* note on a phrase, sitting before it instead of after.
 */
function isTextlessFootnoteSibling(item: Content): boolean {
  if (typeof item === "string" || Array.isArray(item) || item === null || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  if (record.foot === undefined) return false;
  if (record.strong !== undefined) return false;
  if ("content" in record || "heading" in record || "subtitle" in record || "bibleLink" in record) return false;
  return typeof record.text !== "string" || record.text.length === 0;
}

/**
 * A `bibleLink` node's own display override, when it's a single mark-bearing
 * object — the one override shape whose marks are judged against the
 * surrounding emphasis run rather than rendered as an opaque span (see
 * `isMarkRunCandidate`, `renderBibleLinkParts`). Every other shape — a plain
 * string, none at all, an array — falls through to the opaque `"bibleLink"
 * in content` render below. Deliberately this narrow: an array override
 * carrying marks is untested, and admitting it could self-wrap.
 */
function markedBibleLinkOverride(item: Content): ContentObject | undefined {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
  if (!("bibleLink" in item)) return undefined;
  const override = (item as ContentBibleLink).content;
  if (override === undefined || typeof override === "string" || Array.isArray(override)) return undefined;
  if (typeof override !== "object" || override === null) return undefined;
  if ("heading" in override || "subtitle" in override || "bibleLink" in override || "content" in override) {
    return undefined;
  }
  const obj = override as ContentObject;
  return obj.marks && obj.marks.length > 0 ? obj : undefined;
}

/**
 * An `abbr` node's registry name, when that name is a single mark-bearing
 * object — the one name shape whose marks are judged against the surrounding
 * emphasis run rather than rendered as an opaque span (see
 * `isMarkRunCandidate`, `renderAbbreviationParts`). BYZ2026's registry has
 * two such entries, the italic `om.` and `txt`; every other name is a bare
 * string (`CT`) or an array (`NA` plus a superscript `27`), carries no
 * "b"/"i" to share, and keeps falling through to the opaque `"abbr" in
 * content` render below.
 *
 * Narrow for the same reason `markedBibleLinkOverride` is: an array name
 * mixing marks across its elements has no single state to hand the run.
 */
function markedAbbreviationName(item: Content, ctx: RenderContext): ContentObject | undefined {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
  if (!("abbr" in item)) return undefined;
  const name = ctx.abbreviations?.get((item as ContentAbbreviation).abbr);
  if (name === undefined || typeof name === "string" || Array.isArray(name)) return undefined;
  if (typeof name !== "object" || name === null) return undefined;
  if ("heading" in name || "subtitle" in name || "bibleLink" in name || "abbr" in name || "content" in name) {
    return undefined;
  }
  const obj = name as ContentObject;
  return obj.marks && obj.marks.length > 0 ? obj : undefined;
}

/**
 * Whether `item` is a plain mark-bearing renderable — `ContentObject`/
 * `ContentNested`, a `bibleLink` whose override qualifies per
 * `markedBibleLinkOverride`, or an `abbr` whose registry name qualifies per
 * `markedAbbreviationName`. The array's other legal shapes are excluded: a
 * bare string, a `heading`/`subtitle`/unqualified `bibleLink`/unqualified
 * `abbr` (each renders in its own context and must never share the
 * surrounding items' open "b"/"i" state), and the `paragraph`-wrapper object
 * (`content.paragraph` holding nested content, not the boolean
 * start-of-paragraph flag). Only candidates carry a `marks` array, so only
 * they take part in the array branch's emphasis-state walk (see
 * `emphasisTransition`).
 */
function isMarkRunCandidate(item: Content, ctx: RenderContext): item is ContentObject | ContentNested {
  if (markedBibleLinkOverride(item) !== undefined) return true;
  if (markedAbbreviationName(item, ctx) !== undefined) return true;
  if (typeof item === "string" || Array.isArray(item) || item === null || typeof item !== "object") return false;
  if ("heading" in item || "subtitle" in item || "bibleLink" in item || "abbr" in item) return false;
  if ("paragraph" in item && item.paragraph !== undefined && typeof item.paragraph !== "boolean") return false;
  return true;
}

/**
 * Which of "b"/"i" a node's own `marks` array requests, kept as two
 * independent booleans — `emphasisTransition` needs them independent so a
 * shared mark (e.g. italic) can stay open across a neighbor that only
 * toggles the other (bold), as in a supplied word mid-quotation. Other marks
 * like "sc" are ignored here; they don't affect emphasis wrapping.
 */
interface EmphasisState {
  /** Whether "b" (bold) is currently open. */
  b: boolean;
  /** Whether "i" (italic) is currently open. */
  i: boolean;
}

/** Reads which of "b"/"i" `marks` requests — see {@link EmphasisState}. */
function emphasisStateOf(marks: ContentObject["marks"]): EmphasisState {
  return { b: !!marks?.includes("b"), i: !!marks?.includes("i") };
}

/**
 * Escapes a literal `_` or `*` in text taken verbatim from content. The same
 * character means two different things depending on who wrote it: source
 * text containing `_`/`*` (manuscript sigla in Beta-code, say) is not this
 * renderer's own emphasis markup, and a backslash escape is what CommonMark
 * reads back as the literal character.
 *
 * Wired in as `RenderOptions.escapeSourceText`, applied only where a node's
 * own text enters the render — never to a delimiter this renderer emits, so
 * a `**`/`_` it just produced is never re-escaped.
 */
function escapeMarkdownDelimiters(text: string): string {
  return text.replace(/[_*]/g, "\\$&");
}

/**
 * Splits `text` into leading whitespace, trimmed core, and trailing
 * whitespace — both callers write a delimiter next to text that may carry a
 * leading or trailing join-space, which real content items routinely do.
 */
function splitWhitespace(text: string): { leading: string; core: string; trailing: string } {
  const leading = text.length - text.trimStart().length;
  const trailing = text.length - text.trimEnd().length;
  return {
    leading: text.slice(0, leading),
    core: text.trim(),
    trailing: text.slice(text.length - trailing),
  };
}

/**
 * Wraps `text` in a paired inline `delimiter` — "_", "**" — with the
 * delimiters against the trimmed core and any leading or trailing
 * whitespace reattached outside them. CommonMark reads a delimiter's inner
 * neighbor to decide whether the run opens or closes at all: whitespace
 * there disqualifies it, so "** foo**" and "_bar _" render as literal
 * characters rather than emphasis.
 *
 * An all-whitespace `text` returns unchanged: `splitWhitespace` reports the
 * same characters as both leading and trailing when there is no core
 * between them, so reassembling would emit them twice.
 */
function wrapDelimitersOffWhitespace(text: string, delimiter: string): string {
  const { leading, core, trailing } = splitWhitespace(text);
  if (!core) return text;
  return leading + delimiter + core + delimiter + trailing;
}

/** Unicode whitespace, as CommonMark's flanking rules define it. */
const FLANKING_WHITESPACE = /[\t\n\f\r \p{Zs}]/u;
/** Unicode punctuation, as CommonMark's flanking rules define it — the spec's own character classes, which are wider than `\W`. */
const FLANKING_PUNCTUATION =
  /[\p{Pc}\p{Pd}\p{Pe}\p{Pf}\p{Pi}\p{Po}\p{Ps}\p{Sc}\p{Sk}\p{Sm}\p{So}]/u;

/** One unescaped run of a repeated delimiter character. */
interface DelimiterRun {
  /** Index in the line where the run starts. */
  at: number;
  /** How many characters the run spans. */
  length: number;
}

/**
 * Every unescaped run of `character` in `line`, left to right. An escaped
 * character is stepped over rather than counted: pairing a real closing
 * delimiter against an escaped one would report a span that is not there.
 */
function delimiterRuns(line: string, character: string): DelimiterRun[] {
  const runs: DelimiterRun[] = [];
  for (let index = 0; index < line.length; index++) {
    if (line[index] === "\\") {
      index++;
      continue;
    }
    if (line[index] !== character) continue;
    let end = index;
    while (end < line.length && line[end] === character) end++;
    runs.push({ at: index, length: end - index });
    index = end - 1;
  }
  return runs;
}

/**
 * Whether `run` may open and may close a span, per CommonMark's left- and
 * right-flanking definitions and Rules 1 to 8. Both answers come back
 * together because the "_" rules read both sides — a clause "*" does not
 * carry, which is why "foo*bar*" is emphasis and "foo_bar_" is not. A
 * neighbor off the end of the line is `undefined`, which the spec counts as
 * whitespace.
 */
function delimiterRunRoles(
  line: string,
  run: DelimiterRun,
  character: string
): { opens: boolean; closes: boolean } {
  const before: string | undefined = line[run.at - 1];
  const after: string | undefined = line[run.at + run.length];
  const beforeIsSpace = before === undefined || FLANKING_WHITESPACE.test(before);
  const afterIsSpace = after === undefined || FLANKING_WHITESPACE.test(after);
  const beforeIsPunctuation =
    before !== undefined && FLANKING_PUNCTUATION.test(before);
  const afterIsPunctuation =
    after !== undefined && FLANKING_PUNCTUATION.test(after);

  const left =
    !afterIsSpace &&
    (!afterIsPunctuation || beforeIsSpace || beforeIsPunctuation);
  const right =
    !beforeIsSpace &&
    (!beforeIsPunctuation || afterIsSpace || afterIsPunctuation);

  if (character === "*") return { opens: left, closes: right };
  return {
    opens: left && (!right || beforeIsPunctuation),
    closes: right && (!left || afterIsPunctuation),
  };
}

/**
 * Re-expresses every emphasis span CommonMark would not parse as an `<i>` or
 * `<b>` tag, leaving every span it would parse exactly as it stands. A tag
 * rather than the other delimiter character: switching "_" to "*" rescues
 * well under half of these spans, and a tag adds no delimiter run of its own
 * for a neighboring one to merge with. The decision is per span, since a
 * span uses the same character at both ends and a failure at either end has
 * to move both.
 *
 * It takes an assembled line because the rules read the characters *outside*
 * both delimiters: a wrapper sees only the text it wraps, a span can open in
 * one recursive `emphasisRunContinuation` call and close in another, and
 * `convertVerseToMarkdown` rewrites those very neighbors afterwards. Lines
 * are split because the spec counts the beginning and the end of a *line* as
 * whitespace, so neighbors are line-local.
 */
function resolveUnparsableEmphasisSpans(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const rewrites: Array<DelimiterRun & { text: string }> = [];

      for (const [character, tag] of [
        ["_", "i"],
        ["*", "b"],
      ] as const) {
        const runs = delimiterRuns(line, character);
        for (let index = 0; index + 1 < runs.length; index += 2) {
          const open = runs[index];
          const close = runs[index + 1];
          if (
            delimiterRunRoles(line, open, character).opens &&
            delimiterRunRoles(line, close, character).closes
          ) {
            continue;
          }
          rewrites.push(
            { ...open, text: `<${tag}>` },
            { ...close, text: `</${tag}>` }
          );
        }
      }

      // Applied right to left so the offsets still address the same
      // characters. Every role was read from the untouched line, and a tag's
      // angle brackets are punctuation exactly as the delimiters they replace
      // were — which is also what makes a second pass over an already-resolved
      // line a no-op.
      let resolved = line;
      for (const rewrite of rewrites.sort((a, b) => b.at - a.at)) {
        resolved =
          resolved.slice(0, rewrite.at) +
          rewrite.text +
          resolved.slice(rewrite.at + rewrite.length);
      }
      return resolved;
    })
    .join("\n");
}

/**
 * Applies "b"/"i" wrapping to `text`, bold innermost then italic outermost —
 * matching `web/public/js/ContentNode.js`, which `emphasisTransition` below
 * also relies on for its close/open order. Where the delimiters land
 * relative to whitespace is each wrapper's own business; applying italic to
 * the already-bolded string re-reads the same edges, since bold left the
 * whitespace outside itself. Only italic routes through `italicWrapperFor`:
 * it is the one mark whose delimiters can be redundant where the text lands.
 */
function wrapEmphasisMarks(
  text: string,
  marks: ContentObject["marks"],
  ctx: RenderContext
): string {
  let wrapped = text;
  if (marks?.includes("b")) wrapped = ctx.options.boldWrapper(wrapped);
  if (marks?.includes("i")) wrapped = italicWrapperFor(ctx)(wrapped);
  return wrapped;
}

/**
 * The opening/closing strings a wrapper emits, recovered by wrapping a
 * sentinel no real content contains and splitting on it. Lets
 * `emphasisTransition` open and close "b"/"i" independently, so
 * `RenderOptions` can stay plain text-wrapping functions with no separate
 * open/close fields.
 */
function delimitersOf(wrapper: (text: string) => string): { open: string; close: string } {
  const SENTINEL = "\u0000";
  const wrapped = wrapper(SENTINEL);
  const at = wrapped.indexOf(SENTINEL);
  return { open: wrapped.slice(0, at), close: wrapped.slice(at + SENTINEL.length) };
}

/**
 * The close/open delimiters for moving the array branch's running "b"/"i"
 * open-state from `from` to `to` — closing marks present in `from` but not
 * `to` (innermost first: "b" before "i", matching `wrapEmphasisMarks`'s own
 * nesting order), opening marks present in `to` but not `from` (outermost
 * first: "i" before "b"), and leaving a mark present in both untouched — see
 * {@link EmphasisState} for why the two are tracked independently.
 */
function emphasisTransition(
  from: EmphasisState,
  to: EmphasisState,
  bold: { open: string; close: string },
  italic: { open: string; close: string }
): { close: string; open: string } {
  let close = "";
  if (from.b && !to.b) close += bold.close;
  if (from.i && !to.i) close += italic.close;

  let open = "";
  if (!from.i && to.i) open += italic.open;
  if (!from.b && to.b) open += bold.open;

  return { close, open };
}

/**
 * The three renderable pieces of one `ContentObject`/`ContentNested` node,
 * kept apart rather than joined so the array branch can emit one shared
 * "b"/"i" delimiter across several same-marked nodes instead of a pair per
 * node (see `emphasisTransition`). A lone node still renders as
 * `prefix + wrap(core) + suffix`.
 */
interface RenderedParts {
  /** The paragraph marker when the node opens a new paragraph — rendered before `core`, so it never falls inside the "b"/"i" wrapper. */
  prefix: string;
  /** The node's own text (or, for `ContentNested`, its already-rendered nested content), before any "b"/"i" wrapping. */
  core: string;
  /** Everything that renders after `core` and is never wrapped — footnote marker (+ inline body), Strong's number, morph code, lemma, line break. */
  suffix: string;
}

/**
 * Splices trailing textless-footnote-only siblings' markers into
 * `parts.suffix`, right before `item`'s own Strong's tag, consuming those
 * array elements as it goes (see `isTextlessFootnoteSibling`). Left in array
 * order, such a marker would land after the Strong's number by array
 * position rather than because that is where it belongs. Returns the updated
 * suffix and the last index consumed — `startIndex` when nothing was
 * spliced.
 */
function spliceTrailingFootnoteSiblings(
  item: ContentObject | ContentNested,
  parts: RenderedParts,
  content: Content[],
  startIndex: number,
  ctx: RenderContext
): { suffix: string; lastIndex: number } {
  let suffix = parts.suffix;
  let lastIndex = startIndex;

  if (!ctx.options.includeStrongs || typeof item.strong !== "string") {
    return { suffix, lastIndex };
  }

  const tagOffset = suffix.lastIndexOf(" " + item.strong);
  if (tagOffset === -1) return { suffix, lastIndex };

  let insertAt = tagOffset;
  while (lastIndex + 1 < content.length && isTextlessFootnoteSibling(content[lastIndex + 1])) {
    lastIndex++;
    const siblingNode = content[lastIndex] as ContentObject;
    const siblingRendered = renderContent(siblingNode, ctx);
    const hasBreak = siblingNode.break === true;
    const breakMarker = hasBreak ? ctx.options.lineBreakMarker : "";
    // The sibling's own render always ends in exactly one separating space
    // (`renderTextObjectParts`'s own rule for a textless, strong-less
    // footnote node) and, rarely, its own line break after that — both stay
    // at the very end of the merged unit; only the marker+body core moves.
    let core = hasBreak
      ? siblingRendered.slice(0, siblingRendered.length - breakMarker.length)
      : siblingRendered;
    if (core.endsWith(" ")) core = core.slice(0, -1);
    suffix = suffix.slice(0, insertAt) + core + suffix.slice(insertAt);
    insertAt += core.length;
    if (hasBreak) suffix += breakMarker;
  }
  return { suffix, lastIndex };
}

/**
 * The live state an emphasis run carries across loop iterations. Threaded
 * through `emphasisRunContinuation` as both seed and result, which is what
 * lets a `ContentNested` node's own inner array continue the SAME run its
 * outer siblings are part of.
 *
 * The invariant every writer of `result` maintains: held whitespace stays
 * held until text is written that it can sit next to, and is released only
 * *after* whatever close delimiter precedes that text. A node contributing
 * no text of its own — a whitespace-only core, or one rendering only a
 * footnote marker or line break — therefore adds to the hold. Release it
 * early and the closing delimiter lands on the far side of the whitespace
 * ("_b _"), which CommonMark's right-flanking rule rejects outright.
 */
interface EmphasisRunState {
  openMarks: EmphasisState; // "b"/"i" marks currently open in this run
  pendingWhitespace: string; // trailing whitespace held back from the last-rendered core (see above)
}

/**
 * Renders `content` as a continuation of an already-open emphasis run:
 * `seed` is the live open-mark/whitespace state when `content` begins, and
 * the returned state is what's left open for the caller to carry forward.
 * Used by `renderContent`'s array branch (seeded closed, sealed after) and
 * by a `ContentNested` node's own inner array when that node carries no
 * top-level "b"/"i" marks — seeding the recursive call with the outer
 * array's live state lets the nested content's leading edge merge with a
 * same-marked sibling right before it, instead of forcing a close+reopen at
 * the boundary (`_which_ _ye have_ to` becomes `_which ye have_ to`).
 *
 * A `ContentNested` node that DOES carry its own top-level marks is
 * untouched by this: its marks wrap the whole self-contained inner render
 * from outside (`**_great joy_**`), so `renderNestedContentParts` handles
 * that shape instead.
 */
function emphasisRunContinuation(
  content: Content,
  ctx: RenderContext,
  seed: EmphasisRunState
): { text: string; state: EmphasisRunState } {
  const bold = delimitersOf(ctx.options.boldWrapper);
  const italic = delimitersOf(italicWrapperFor(ctx));

  if (!Array.isArray(content)) {
    // No internal run to continue — seal the seed state and render
    // independently.
    const { close } = emphasisTransition(seed.openMarks, { b: false, i: false }, bold, italic);
    return {
      text: close + seed.pendingWhitespace + renderContent(content, ctx),
      state: { openMarks: { b: false, i: false }, pendingWhitespace: "" },
    };
  }

  let result = "";
  let openMarks = seed.openMarks;
  let pendingWhitespace = seed.pendingWhitespace;

  const closeOpenMarks = () => {
    const { close } = emphasisTransition(openMarks, { b: false, i: false }, bold, italic);
    result += close + pendingWhitespace;
    pendingWhitespace = "";
    openMarks = { b: false, i: false };
  };

  for (let index = 0; index < content.length; index++) {
    const item = content[index];

    if (!isMarkRunCandidate(item, ctx)) {
      // A whitespace-only bare string is transparent to the open "b"/"i"
      // state, same as a whitespace-only object core below (`isBlank`) — a
      // same-marked node on either side still merges into one span, held per
      // `EmphasisRunState`'s invariant rather than emitted here. They merge
      // even when the two neighbors disagree in mark sets (`["i"]` next to
      // `["i","sc"]`), a gap `auditNodes.ts` deliberately leaves alone at the
      // JSON level, so it has to be handled here instead.
      if (typeof item === "string" && item !== "" && item.trim() === "") {
        pendingWhitespace += item;
        continue;
      }
      // A bare string, heading/subtitle/bibleLink/abbr, or paragraph-wrapper
      // — each renders in its own context, so any open marks close first.
      closeOpenMarks();
      let rendered = renderContent(item, ctx);
      const next = content[index + 1];
      if (next !== undefined && endsWithUnseparatedTag(item, ctx) && startsWithLetter(renderContent(next, ctx))) {
        rendered += " ";
      }
      result += rendered;
      continue;
    }

    // A ContentNested item with no top-level "b"/"i" marks has no separate
    // outer wrap to apply — its emphasis state comes from its own inner
    // content's edges instead. `emphasisStateOf`, not a raw `marks?.length`
    // check, decides eligibility, so a node marked only `["woc"]` or `["sc"]`
    // is as eligible as one with no marks.
    const override = markedBibleLinkOverride(item);
    const abbreviationName = override ? undefined : markedAbbreviationName(item, ctx);
    // The object supplying this item's core text and its marks when the item
    // is not itself a text object: a qualifying bibleLink display override,
    // or a qualifying abbreviation name.
    const resolved = override ?? abbreviationName;
    const ownMarks = !resolved && "content" in item ? emphasisStateOf(item.marks) : undefined;
    // A "sup" mark disqualifies the node the same way "b"/"i" do: this
    // branch builds its own core out of the continuation text and never
    // reaches `renderNestedContentParts`, where the superscript wrap lives.
    const nestedArrayCandidate =
      ownMarks !== undefined &&
      !ownMarks.b &&
      !ownMarks.i &&
      !item.marks?.includes("sup") &&
      Array.isArray((item as ContentNested).content);

    if (nestedArrayCandidate) {
      const nested = item as ContentNested;
      if (nested.paragraph) closeOpenMarks();
      result += renderNestedPrefix(nested, ctx);

      const continuation = emphasisRunContinuation(nested.content, ctx, { openMarks, pendingWhitespace });
      result += continuation.text;
      openMarks = continuation.state.openMarks;
      pendingWhitespace = continuation.state.pendingWhitespace;

      const parts: RenderedParts = {
        prefix: "",
        core: continuation.text,
        suffix: renderNestedSuffix(nested, ctx, continuation.text),
      };
      const spliced = spliceTrailingFootnoteSiblings(nested, parts, content, index, ctx);
      index = spliced.lastIndex;
      if (spliced.suffix !== "") {
        closeOpenMarks();
        result += spliced.suffix;
      }

      const next = content[index + 1];
      if (next !== undefined && endsWithUnseparatedTag(nested, ctx) && startsWithLetter(renderContent(next, ctx))) {
        result += " ";
      }
      continue;
    }

    // A qualifying bibleLink's display override, or a qualifying
    // abbreviation name, supplies both the rendered core and the marks
    // driving this run's open/close state; every other shape reports marks
    // from `item` itself. Re-checked here rather than threaded through from
    // `isMarkRunCandidate`, whose type predicate has already narrowed
    // `item` — safe because the other `item` accesses below (`.strong`,
    // `.paragraph`) read a harmless `undefined` on a real bibleLink or abbr
    // node, and both resolvers are cheap and pure.
    let parts: RenderedParts;
    if (override) parts = renderBibleLinkParts(override, ctx);
    else if (abbreviationName) parts = renderAbbreviationParts(abbreviationName, ctx);
    else if ("content" in item) parts = renderNestedContentParts(item, ctx);
    else parts = renderTextObjectParts(item, ctx);

    const spliced = spliceTrailingFootnoteSiblings(item, parts, content, index, ctx);
    parts = { ...parts, suffix: spliced.suffix };
    index = spliced.lastIndex;

    // A node opening a new paragraph is a hard boundary too: its own
    // marker renders before its text, so whatever was open before it must
    // already be closed, and it never inherits the previous paragraph's
    // open marks.
    if (item.paragraph) closeOpenMarks();
    result += parts.prefix;

    // A whitespace-only or absent core is never wrapped and is transparent
    // to the open/close state — it neither opens nor closes a mark, so a
    // same-marked node on either side of it still merges into one continuous
    // span. This holds even for a whitespace-only *object* core that carries
    // its own marks: such a core joins the hold rather than being written,
    // per `EmphasisRunState`'s invariant. Dropping `transition.close` from
    // that path is safe by construction, not merely convenient — `desired`
    // is forced to `openMarks` whenever the core is blank, so the transition
    // is empty on it.
    const isBlank = parts.core.trim() === "";
    const desired = isBlank ? openMarks : emphasisStateOf(resolved ? resolved.marks : item.marks);
    const transition = emphasisTransition(openMarks, desired, bold, italic);

    if (isBlank) {
      pendingWhitespace += parts.core;
    } else {
      const { leading, core, trailing } = splitWhitespace(parts.core);
      result += transition.close + pendingWhitespace + leading + transition.open + core;
      pendingWhitespace = trailing;
    }
    openMarks = desired;

    // Interruption: a footnote marker, Strong's number, morph code, or line
    // break renders next, so nothing can legitimately still be open once we
    // cross it — the render-time mirror of the boundary-flag test
    // `contentFromPieces` uses at the JSON-node-merging layer.
    if (parts.suffix !== "") {
      closeOpenMarks();
      result += parts.suffix;
    }

    // A tagged node's text can legitimately end mid-word-space — an attach
    // pass folds a leaf's trailing join-space backward into the tagged node
    // when the following text is marked, leaving the next sibling without
    // its usual leading space and fusing words ("darkness H2822was").
    // Testing the next sibling's own rendered text keeps the end of an array
    // correct and leaves a textless footnote-only sibling alone, whose
    // render opens with "°" and must stay unspaced for °{...} to remain a
    // clean search/replace target. Checked against `item`, never
    // `content[index]` after splicing, since a consumed textless-footnote
    // sibling never carries the tag this check looks for.
    const next = content[index + 1];
    if (next !== undefined && endsWithUnseparatedTag(item, ctx) && startsWithLetter(renderContent(next, ctx))) {
      result += " ";
    }
  }

  return { text: result, state: { openMarks, pendingWhitespace } };
}

/**
 * Render any Content to a string based on options. Shape checks run from
 * most specific (heading, subtitle, bibleLink, paragraph wrapper) to most
 * generic (nested content, then a bare text object), returning at the
 * first match.
 */
function renderContent(content: Content, ctx: RenderContext): string {
  if (typeof content === "string") {
    return ctx.options.escapeSourceText(content);
  }

  if (Array.isArray(content)) {
    const bold = delimitersOf(ctx.options.boldWrapper);
    const italic = delimitersOf(italicWrapperFor(ctx));
    const { text, state } = emphasisRunContinuation(content, ctx, {
      openMarks: { b: false, i: false },
      pendingWhitespace: "",
    });
    const { close } = emphasisTransition(state.openMarks, { b: false, i: false }, bold, italic);
    return text + close + state.pendingWhitespace;
  }

  if ("heading" in content) {
    const inner = renderContent(content.heading, {
      ...ctx,
      footnotePrefix: "Heading.",
    });
    return ctx.options.headingWrapper(inner, (content as ContentHeading).type);
  }

  if ("subtitle" in content) {
    const inner = renderContent(content.subtitle, {
      ...ctx,
      withinItalicWrapper: true,
      footnotePrefix: "Subtitle.",
    });
    return ctx.options.subtitleWrapper(inner);
  }

  // A bibleLink's own `content` is a display override for the reference text.
  if ("bibleLink" in content) {
    if (content.content !== undefined) {
      return renderContent(content.content, ctx);
    }
    return content.bibleLink;
  }

  // An abbreviation renders as its registry entry's display name. Falling
  // back to the bare id keeps an export readable when the registry is
  // missing or incomplete; `validate` is what reports the unknown id.
  if ("abbr" in content) {
    const name = ctx.abbreviations?.get(content.abbr);
    return name === undefined ? content.abbr : renderContent(name, ctx);
  }

  // Paragraph wrapper object - contains nested paragraph content (not a flag)
  if (
    "paragraph" in content &&
    content.paragraph !== undefined &&
    typeof content.paragraph !== "boolean"
  ) {
    return renderContent(content.paragraph, ctx);
  }

  // Nested content object (content property with optional strong, morph, foot, etc.)
  if (
    "content" in content &&
    !("heading" in content) &&
    !("subtitle" in content)
  ) {
    return renderNestedContent(content as ContentNested, ctx);
  }

  // Text object (may have paragraph flag, strong, morph, etc.)
  return renderTextObject(content as ContentObject, ctx);
}

/**
 * The context a footnote body renders under. A body is its own piece of prose
 * rather than a continuation of the text carrying the marker, so it inherits
 * none of that text's destination facts. The italic wrapper is the conditional
 * one: a reference-style body is emitted later on its own line, outside the
 * caller's wrapper, while an inline body (`°{...}`) is spliced back into the
 * very text it came from and stays inside it.
 */
function footnoteBodyContext(ctx: RenderContext): RenderContext {
  return {
    ...ctx,
    options: { ...ctx.options, includeStrongs: false, includeMorph: false },
    footnotePrefix: undefined,
    withinItalicWrapper:
      ctx.options.footnoteStyle === "inline" && ctx.withinItalicWrapper,
  };
}

/**
 * Computes a ContentObject's three `RenderedParts` (text with optional
 * strong, morph, foot, paragraph, break) without applying its own "b"/"i"
 * wrap — deferred to the caller, either the thin `renderTextObject` wrapper
 * below (a lone node) or the array branch's per-transition emission (several
 * adjacent nodes sharing delimiters via `emphasisTransition`).
 */
function renderTextObjectParts(obj: ContentObject, ctx: RenderContext): RenderedParts {
  let prefix = "";
  if (obj.paragraph) {
    // Text format needs a space before the marker to separate it from the
    // previous word's Strong's/morph
    prefix = ctx.options.footnoteStyle === "inline"
      ? " " + ctx.options.paragraphMarker
      : ctx.options.paragraphMarker;
  }

  let text = obj.text || "";

  // Small caps render as uppercase in the text and markdown exports
  if (obj.marks?.includes("sc")) {
    text = text.toUpperCase();
  }

  // Escape source-written "_"/"*" last, so downstream steps
  // (wrapEmphasisMarks, the array branch's splitWhitespace) operate on text
  // already safe to emit.
  text = ctx.options.escapeSourceText(text);

  // Superscript wraps here rather than in `wrapEmphasisMarks`, because the
  // array branch takes this function's `core` and never calls that one.
  text = wrapSuperscript(text, obj.marks, ctx);

  const suffixParts: string[] = [];

  // Footnote marker and content come before Strong's/morph so users can
  // search/replace °{...} cleanly without affecting Strong's spacing
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    suffixParts.push(ctx.options.footnoteMarker(footIndex));

    const footnoteContent = renderContent(obj.foot.content, footnoteBodyContext(ctx));

    if (ctx.options.footnoteStyle === "inline") {
      // No space before { so °{...} stays a clean search/replace target
      suffixParts.push(`{${footnoteContent}}`);
    } else {
      const prefixLabel = ctx.footnotePrefix || `${ctx.verseNum}.`;
      ctx.footnotes.push(
        `- ${ctx.options.footnoteMarker(footIndex)} ${prefixLabel} ${footnoteContent}`
      );
    }
  }

  if (obj.strong && ctx.options.includeStrongs) {
    suffixParts.push(" " + obj.strong);
  }

  if (obj.morph && ctx.options.includeMorph) {
    suffixParts.push(` (${obj.morph})`);
  }

  if (obj.break) {
    suffixParts.push(ctx.options.lineBreakMarker);
  }

  return { prefix, core: text, suffix: suffixParts.join("") };
}

/**
 * Render a ContentObject (text with optional strong, morph, foot, paragraph, break)
 */
function renderTextObject(obj: ContentObject, ctx: RenderContext): string {
  const { prefix, core, suffix } = renderTextObjectParts(obj, ctx);
  return prefix + wrapEmphasisMarks(core, obj.marks, ctx) + suffix;
}

/**
 * `RenderedParts` for a `bibleLink` node whose display override qualifies
 * per `markedBibleLinkOverride`. Routing through here rather than the opaque
 * `"bibleLink" in content` branch defers the override's "b"/"i" wrap to the
 * caller, so `emphasisTransition` can share delimiters across this node and
 * its same-marked neighbors; self-wrapping would instead emit a redundant
 * `_ _` and a broken `__` where the two spans meet.
 */
function renderBibleLinkParts(override: ContentObject, ctx: RenderContext): RenderedParts {
  return renderTextObjectParts(override, ctx);
}

/**
 * `RenderedParts` for an `abbr` node whose registry name qualifies per
 * `markedAbbreviationName`. Same routing and same reason as
 * `renderBibleLinkParts` above: the name's "b"/"i" wrap is deferred to the
 * caller so the siglum shares delimiters with the prose beside it. The
 * source edition prints one italic run, `_om. here but add at 16:25–27_`,
 * and self-wrapping would split it into `_om._ _here but add at 16:25–27_`.
 */
function renderAbbreviationParts(name: ContentObject, ctx: RenderContext): RenderedParts {
  return renderTextObjectParts(name, ctx);
}

/**
 * A ContentNested's own paragraph-marker prefix — independent of its
 * `content`, so `emphasisRunContinuation`'s merge-eligible branch can reuse
 * it without rendering `obj.content` a second time, which would double-fire
 * any footnote a node inside it carries.
 */
function renderNestedPrefix(obj: ContentNested, ctx: RenderContext): string {
  if (!obj.paragraph) return "";
  // Same paragraph-prefix rationale as `renderTextObjectParts`.
  return ctx.options.footnoteStyle === "inline"
    ? " " + ctx.options.paragraphMarker
    : ctx.options.paragraphMarker;
}

/**
 * A ContentNested's own footnote/Strong's/morph/lemma/break suffix, kept
 * separate from `renderNestedContentParts` so `emphasisRunContinuation`'s
 * merge-eligible branch can call it after computing `core` its own way. Both
 * callers must push `obj.foot`'s reference-style line into `ctx.footnotes`
 * in the same relative order, which is why each computes `core` first and
 * calls this function after. The already-rendered `core` is passed in but
 * not read.
 */
function renderNestedSuffix(obj: ContentNested, ctx: RenderContext, core: string): string {
  const suffixParts: string[] = [];

  // Same footnote/Strong's ordering rationale as `renderTextObjectParts`'s
  // own suffix (kept in one place there).
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    suffixParts.push(ctx.options.footnoteMarker(footIndex));

    const footnoteContent = renderContent(obj.foot.content, footnoteBodyContext(ctx));

    if (ctx.options.footnoteStyle === "inline") {
      suffixParts.push(`{${footnoteContent}}`);
    } else {
      const prefixLabel = ctx.footnotePrefix || `${ctx.verseNum}.`;
      ctx.footnotes.push(
        `- ${ctx.options.footnoteMarker(footIndex)} ${prefixLabel} ${footnoteContent}`
      );
    }
  }

  if (obj.strong && ctx.options.includeStrongs) {
    suffixParts.push(" " + obj.strong);
  }

  if (obj.morph && ctx.options.includeMorph) {
    suffixParts.push(` (${obj.morph})`);
  }

  // Lemma is included when Strong's are shown, since the two are related
  if (obj.lemma && ctx.options.includeStrongs) {
    suffixParts.push(` [${obj.lemma}]`);
  }

  if (obj.break) {
    suffixParts.push(ctx.options.lineBreakMarker);
  }

  return suffixParts.join("");
}

/**
 * Computes a ContentNested's three `RenderedParts` — like
 * `renderTextObjectParts`, but the core is the nested content's own
 * recursive render rather than a `text` property, so the array branch's
 * emphasis-state tracking applies inside the inner array too. Used for the
 * lone-node path and for any nested node `emphasisRunContinuation` does not
 * treat as merge-eligible (own top-level marks, or non-array content), both
 * of which render `obj.content` self-contained and sealed.
 */
function renderNestedContentParts(obj: ContentNested, ctx: RenderContext): RenderedParts {
  const core = wrapSuperscript(renderContent(obj.content, ctx), obj.marks, ctx);
  return {
    prefix: renderNestedPrefix(obj, ctx),
    core,
    suffix: renderNestedSuffix(obj, ctx, core),
  };
}

/**
 * Render a ContentNested — like renderTextObject, but the payload is nested
 * content rather than a text property.
 */
function renderNestedContent(obj: ContentNested, ctx: RenderContext): string {
  const { prefix, core, suffix } = renderNestedContentParts(obj, ctx);
  return prefix + wrapEmphasisMarks(core, obj.marks, ctx) + suffix;
}

// ============================================================================
// Verse Conversion Functions
// ============================================================================

/**
 * Display names from a version's `abbr` registry, keyed by id, or undefined
 * when the version declares none. Read once per version rather than per
 * verse: a 10,000-footnote book would otherwise re-parse `_version.json`
 * for every siglum it prints.
 */
function readAbbreviations(
  versionDir: string
): ReadonlyMap<string, Content> | undefined {
  const versionPath = path.join(versionDir, "_version.json");
  if (!fs.existsSync(versionPath)) return undefined;
  const version: BibleVersion = JSON.parse(fs.readFileSync(versionPath, "utf-8"));
  if (!version.abbr?.length) return undefined;
  return new Map(version.abbr.map((entry) => [entry._id, entry.name]));
}

/**
 * Convert a verse to plain text with Strong's numbers and morph codes.
 */
function convertVerseToText(
  verse: VerseSchema,
  abbreviations?: ReadonlyMap<string, Content>
): string {
  const chapter = verse.chapter.toString().padStart(3, "0");
  const verseNum = verse.verse.toString().padStart(3, "0");

  const ctx: RenderContext = {
    options: TEXT_OPTIONS,
    footnotes: [],
    verseNum: verse.verse,
    abbreviations,
  };

  let text = renderContent(verse.content, ctx);

  text = text.replace(/^ +/, "");
  text = text.replace(/ +$/, "");
  text = text.replace(/ +/g, " ");

  return `${chapter}:${verseNum} ${text}`;
}

/**
 * Convert a verse to markdown format. Any footnotes it renders are appended
 * to chapterFootnotes, which the caller shares across every verse in a
 * chapter.
 */
function convertVerseToMarkdown(
  verse: VerseSchema,
  chapterFootnotes: string[],
  abbreviations?: ReadonlyMap<string, Content>
): string {
  const ctx: RenderContext = {
    options: MARKDOWN_OPTIONS,
    footnotes: chapterFootnotes,
    verseNum: verse.verse,
    abbreviations,
  };

  // Footnote bodies this call is about to append. They never appear in the
  // returned string, so the delimiter-form rule below has to reach them here.
  const firstOwnFootnote = chapterFootnotes.length;

  let leadingPrefix = "";
  let processedContent = verse.content;

  // A leading heading or subtitle renders above the verse number rather than
  // inline — the fallback for whatever `convertBibleVersionToMarkdown`'s
  // chapter-level hoist didn't already consume: the second heading of a
  // chapter-opening [heading, heading] run, or any subtitle that doesn't open
  // a chapter. Left inline, a subtitle would strand a meaningless mid-line
  // "> " blockquote marker in the verse.
  if (Array.isArray(verse.content) && verse.content.length > 0) {
    const firstItem = verse.content[0];
    if (typeof firstItem === "object" && "heading" in firstItem) {
      const headingText = renderContent(firstItem.heading, {
        ...ctx,
        footnotePrefix: "Heading.",
      });
      const marker = markdownHeadingMarker((firstItem as ContentHeading).type);
      leadingPrefix = `\n${marker} ${headingText}\n`;
      processedContent = verse.content.slice(1);
    } else if (typeof firstItem === "object" && "subtitle" in firstItem) {
      const subtitleText = renderContent(firstItem.subtitle, {
        ...ctx,
        withinItalicWrapper: true,
        footnotePrefix: "Subtitle.",
      });
      leadingPrefix = `\n${ctx.options.subtitleWrapper(subtitleText)}\n`;
      processedContent = verse.content.slice(1);
    }
  }

  // Whether the verse (after any heading is pulled out) opens its own paragraph, which decides the blank line below
  let hasLeadingParagraph = false;
  if (Array.isArray(processedContent) && processedContent.length > 0) {
    const first = processedContent[0];
    if (
      typeof first === "object" &&
      ("paragraph" in first || (first as ContentObject).paragraph)
    ) {
      hasLeadingParagraph = true;
    }
  } else if (
    typeof processedContent === "object" &&
    !Array.isArray(processedContent)
  ) {
    if (
      "paragraph" in processedContent ||
      (processedContent as ContentObject).paragraph
    ) {
      hasLeadingParagraph = true;
    }
  }

  let text = renderContent(processedContent, ctx);

  // For leading paragraphs, strip the leading \n\n since paragraphPrefix handles it
  if (hasLeadingParagraph) {
    text = text.replace(/^\n\n/, "");
  }

  text = text.replace(/^ +/, "");
  text = text.replace(/ +/g, " ");
  text = text.replace(/ ([.,;:!?])/g, "$1"); // Remove space before punctuation

  const paragraphPrefix = hasLeadingParagraph ? "\n" : "";

  // Last, after the two rewrites above: collapsing spaces and dropping a
  // space before punctuation both change the neighbors the flanking rules
  // read, so deciding a delimiter's form any earlier would decide it on
  // characters that are about to move.
  for (let index = firstOwnFootnote; index < chapterFootnotes.length; index++) {
    chapterFootnotes[index] = resolveUnparsableEmphasisSpans(
      chapterFootnotes[index]
    );
  }

  return resolveUnparsableEmphasisSpans(
    `${leadingPrefix}${paragraphPrefix}<sup>${verse.verse}</sup> ${text}`
  );
}

// ============================================================================
// File I/O Functions
// ============================================================================

/**
 * Converts every book in a Bible version to plain text and writes the
 * results under `exports/text-vbv-strongs/<version>/`. Pass `bookId` to
 * limit the run to a single book's file.
 */
async function convertBibleVersion(
  version: string,
  bookId?: string
): Promise<void> {
  const inputDir = path.join(
    path.dirname(__dirname),
    "bible-versions",
    version
  );
  const outputDir = path.join(
    path.dirname(__dirname),
    "exports",
    "text-vbv-strongs",
    version
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const abbreviations = readAbbreviations(inputDir);

  const files = fs
    .readdirSync(inputDir)
    .filter(
      (file: string) => file.endsWith(".json") && file !== "_version.json"
    )
    .filter((file: string) => !bookId || file.includes(`-${bookId}.json`));

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file.replace(".json", ".txt"));

    console.log(`Converting ${inputPath} to ${outputPath}`);

    const data: VerseSchema[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
    const textLines = data.map((verse) => convertVerseToText(verse, abbreviations));

    await writeFileAtomic(outputPath, textLines.join("\n"));
  }
}

/**
 * Converts every book in a Bible version to markdown, grouped by chapter,
 * and writes the results under `exports/markdown-par/<version>/`. Pulls a
 * chapter-opening subtitle and/or heading out of verse 1 to print above the
 * chapter heading rather than inline, and collects "reference"-style
 * footnotes into a per-chapter list at the end of each chapter. Pass
 * `bookId` to limit the run to a single book's file.
 */
async function convertBibleVersionToMarkdown(
  version: string,
  bookId?: string
): Promise<void> {
  const inputDir = path.join(
    path.dirname(__dirname),
    "bible-versions",
    version
  );
  const outputDir = path.join(
    path.dirname(__dirname),
    "exports",
    "markdown-par",
    version
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const abbreviations = readAbbreviations(inputDir);

  const files = fs
    .readdirSync(inputDir)
    .filter(
      (file: string) => file.endsWith(".json") && file !== "_version.json"
    )
    .filter((file: string) => !bookId || file.includes(`-${bookId}.json`));

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const verses: VerseSchema[] = JSON.parse(
      fs.readFileSync(inputPath, "utf-8")
    );

    if (verses.length === 0) continue;

    const chapters = new Map<number, VerseSchema[]>();
    for (const verse of verses) {
      if (!chapters.has(verse.chapter)) {
        chapters.set(verse.chapter, []);
      }
      chapters.get(verse.chapter)!.push(verse);
    }

    const sortedChapters = Array.from(chapters.entries()).sort(
      ([a], [b]) => a - b
    );
    const markdownLines: string[] = [];

    for (const [chapterNum, chapterVerses] of sortedChapters) {
      if (chapterNum > 1) {
        markdownLines.push("");
      }
      markdownLines.push(`## Chapter ${chapterNum}`);

      const chapterFootnotes: string[] = [];

      // A leading run of heading/subtitle wrappers prints above the chapter
      // rather than inside verse 1, hoisted in the order they actually
      // appear — a fixed subtitle-then-heading order would silently miss a
      // [heading, subtitle] leading run and leave a stray mid-line "> "
      // blockquote marker in verse 1. At most one heading and one subtitle
      // are consumed here, never a second of the same kind, so a [heading,
      // heading] chapter opening still leaves its second heading to
      // `convertVerseToMarkdown`'s own verse-level fallback.
      let hoistedHeading = false;
      let hoistedSubtitle = false;
      while (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (!Array.isArray(firstContent) || firstContent.length === 0) break;
        const firstItem = firstContent[0];
        if (typeof firstItem !== "object") break;

        if (!hoistedSubtitle && "subtitle" in firstItem) {
          const ctx: RenderContext = {
            options: { ...MARKDOWN_OPTIONS, includeFootnotes: true },
            footnotes: chapterFootnotes,
            verseNum: chapterVerses[0].verse,
            withinItalicWrapper: true,
            footnotePrefix: "Subtitle.",
          };
          const subtitleText = renderContent(firstItem.subtitle, ctx);
          markdownLines.push("");
          markdownLines.push(MARKDOWN_OPTIONS.subtitleWrapper(subtitleText));
          chapterVerses[0].content = firstContent.slice(1);
          hoistedSubtitle = true;
          continue;
        }

        if (!hoistedHeading && "heading" in firstItem) {
          const ctx: RenderContext = {
            options: { ...MARKDOWN_OPTIONS, includeFootnotes: true },
            footnotes: chapterFootnotes,
            footnotePrefix: "Heading.",
          };
          const headingText = renderContent(firstItem.heading, ctx);
          const marker = markdownHeadingMarker(
            (firstItem as ContentHeading).type
          );
          markdownLines.push("");
          markdownLines.push(`${marker} ${headingText}`);
          chapterVerses[0].content = firstContent.slice(1);
          hoistedHeading = true;
          continue;
        }

        break;
      }

      // Whether verse 1 opens its own paragraph, which decides the blank line
      let firstVerseHasLeadingParagraph = false;
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (typeof firstContent === "object" && !Array.isArray(firstContent)) {
          firstVerseHasLeadingParagraph =
            "paragraph" in firstContent ||
            !!(firstContent as ContentObject).paragraph;
        } else if (Array.isArray(firstContent) && firstContent.length > 0) {
          const first = firstContent[0];
          firstVerseHasLeadingParagraph =
            typeof first === "object" &&
            ("paragraph" in first || !!(first as ContentObject).paragraph);
        }
      }

      if (!firstVerseHasLeadingParagraph) {
        markdownLines.push("");
      }

      for (const verse of chapterVerses) {
        const verseText = convertVerseToMarkdown(
          verse,
          chapterFootnotes,
          abbreviations
        );
        markdownLines.push(verseText);
      }

      if (chapterFootnotes.length > 0) {
        markdownLines.push("");
        for (const footnote of chapterFootnotes) {
          markdownLines.push(`> ${footnote}`);
        }
      }
    }

    // The `.map` below catches the chapter-hoisted subtitle and heading
    // lines, built here and never passed through `convertVerseToMarkdown`; a
    // second pass over an already-resolved verse line changes nothing.
    const outputPath = path.join(outputDir, file.replace(".json", ".md"));
    await writeFileAtomic(
      outputPath,
      markdownLines.map(resolveUnparsableEmphasisSpans).join("\n") + "\n"
    );
    console.log(`Markdown conversion complete: ${outputPath}`);
  }
}

/**
 * CLI entry point: converts one version (argv[2]) or every version under
 * `bible-versions/`, and one book (argv[3]) or every book, to both plain
 * text and markdown.
 */
async function main(): Promise<void> {
  const translation = process.argv[2];
  const bookId = process.argv[3];

  const versionsDir = path.join(path.dirname(__dirname), "bible-versions");

  let versions: string[];
  if (translation) {
    versions = [translation];
  } else {
    versions = fs.readdirSync(versionsDir).filter((item: string) => {
      const itemPath = path.join(versionsDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
  }

  for (const version of versions) {
    console.log(`Processing version: ${version}`);
    await convertBibleVersion(version, bookId);
    await convertBibleVersionToMarkdown(version, bookId);
  }

  console.log("Conversion complete!");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Export failed with error:", error.message);
    process.exit(1);
  });
}

export { convertVerseToText, convertVerseToMarkdown };
