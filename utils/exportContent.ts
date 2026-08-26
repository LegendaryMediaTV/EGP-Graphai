import fs from "fs";
import path from "path";
import Content, {
  ContentBibleLink,
  ContentHeading,
  ContentNested,
  ContentObject,
} from "../types/Content";
import { writeFileAtomic } from "../functions/writeJsonFile";
import VerseSchema from "../types/VerseSchema";

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
  escapeSourceText: (text: string) => string; // Escapes this format's own delimiter characters when they appear in text taken verbatim from content, so a source-written character is never misread as a delimiter this renderer emits (see `escapeMarkdownDelimiters`)
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
  // The text export has no delimiter grammar of its own to collide with —
  // "_"/"*" are ordinary printable characters here, so nothing is escaped.
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

/**
 * `RenderOptions` for a subtitle's own inner content, with the italic
 * wrapper suppressed — the subtitle wrapper (`> _..._`) already italicizes
 * the whole line, so an inner "i" mark would nest a redundant, colliding
 * delimiter. A no-op for plain text, since `TEXT_OPTIONS.italicWrapper` is
 * already the identity function. Shared by every place a subtitle renders
 * its own content: `renderContent`'s "subtitle" branch, the chapter-hoist
 * duplicate in `convertBibleVersionToMarkdown`, and the verse-level fallback
 * in `convertVerseToMarkdown`.
 */
function subtitleInnerOptions(options: RenderOptions): RenderOptions {
  return { ...options, italicWrapper: (text) => text };
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
  subtitleWrapper: (text) => `> _${text}_`,
  footnoteMarker: (index) => `<sup>${footnoteLabel(index)}</sup>`,
  boldWrapper: (text) => `**${text}**`,
  italicWrapper: (text) => `_${text}_`,
  escapeSourceText: escapeMarkdownDelimiters,
};

// ============================================================================
// Core Rendering Functions
// ============================================================================

/** Threaded through every render call in a single conversion pass. */
interface RenderContext {
  options: RenderOptions; // Active TEXT_OPTIONS or MARKDOWN_OPTIONS
  footnotes: string[]; // Collected reference-style footnote lines (populated only when footnoteStyle is "reference"); the caller reads this back after rendering
  verseNum?: number; // Current verse number; falls back to this as the footnote prefix ("N.") when footnotePrefix isn't set
  footnotePrefix?: string; // "Subtitle." or "Heading." for special contexts
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
 * object — this shape's marks should be judged against the surrounding
 * emphasis run rather than rendered as an opaque span (see
 * `isMarkRunCandidate`, `renderBibleLinkParts`). Every other override shape
 * — a plain string, none at all, or a single-element array — falls through
 * unchanged to the existing opaque `"bibleLink" in content` render further
 * below. Keep this predicate's scope exactly this narrow: an array override
 * carrying marks is untested, and widening to include it could self-wrap in
 * a way this fix never checked for.
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
 * Whether `item` is a plain mark-bearing renderable — `ContentObject`/
 * `ContentNested`, or a `bibleLink` whose override qualifies per
 * `markedBibleLinkOverride` — rather than one of the array's other legal
 * shapes: a bare string, a `heading`/`subtitle`/an unqualified `bibleLink`
 * (each renders in its own context and must never share the surrounding
 * items' open "b"/"i" state), or the `paragraph`-wrapper object
 * (`content.paragraph` holding nested content, not the boolean
 * start-of-paragraph flag). Only these ever carry a `marks` array, so only
 * they participate in the array branch's emphasis-state walk (see
 * `emphasisTransition`).
 */
function isMarkRunCandidate(item: Content): item is ContentObject | ContentNested {
  if (markedBibleLinkOverride(item) !== undefined) return true;
  if (typeof item === "string" || Array.isArray(item) || item === null || typeof item !== "object") return false;
  if ("heading" in item || "subtitle" in item || "bibleLink" in item) return false;
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
 * text that happens to contain `_`/`*` (e.g. manuscript sigla in Beta-code,
 * like "_*M*B") is not this renderer's own emphasis markup, so it must be
 * escaped before CommonMark can read it — a backslash escape is CommonMark's
 * standard answer, rendering back to the literal character in any reader.
 *
 * Wired in as `RenderOptions.escapeSourceText`, applied only where a node's
 * own text enters the render — never to a delimiter this renderer emits
 * itself, so a `**`/`_` it just produced is never re-escaped.
 */
function escapeMarkdownDelimiters(text: string): string {
  return text.replace(/[_*]/g, "\\$&");
}

/**
 * Splits `text` into leading whitespace, trimmed core, and trailing
 * whitespace. Shared by `wrapEmphasisMarks` and the array branch's
 * per-transition emission, both of which must keep a delimiter off adjacent
 * whitespace — CommonMark won't parse "** foo**" as bold — and real text
 * items routinely carry a leading or trailing join-space (e.g. KJV1769 JUD
 * 1:1's " the servant").
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
 * Applies "b"/"i" wrapping to `text`, bold innermost then italic outermost —
 * matching `web/public/js/ContentNode.js`, which `emphasisTransition` below
 * also relies on for its own close/open order. Only the trimmed core is
 * wrapped, with whitespace reattached outside the delimiters (see
 * `splitWhitespace`); an empty core is left unwrapped rather than producing
 * a meaningless "****".
 */
function wrapEmphasisMarks(
  text: string,
  marks: ContentObject["marks"],
  options: RenderOptions
): string {
  if (!marks?.includes("b") && !marks?.includes("i")) return text;

  const { leading, core, trailing } = splitWhitespace(text);
  if (!core) return text;

  let wrapped = core;
  if (marks.includes("b")) wrapped = options.boldWrapper(wrapped);
  if (marks.includes("i")) wrapped = options.italicWrapper(wrapped);

  return leading + wrapped + trailing;
}

/**
 * The opening/closing strings a wrapper emits, recovered by wrapping a
 * sentinel no real content contains and splitting on it. Lets
 * `emphasisTransition` open/close "b"/"i" independently at a transition,
 * rather than always wrapping a whole string at once — so `RenderOptions`
 * can stay plain text-wrapping functions, with no separate open/close
 * fields needed.
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
 * first: "i" before "b"), and leaving a mark present in both untouched. See
 * {@link EmphasisState} for why "b"/"i" must be tracked independently rather
 * than compared as a whole set.
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
 * kept apart rather than joined into a single string so that `renderContent`
 * (the array branch) can track adjacent same-marked nodes' own open "b"/"i"
 * state and emit a shared delimiter across several of them instead of one
 * pair per node — see `emphasisTransition`. A lone node still renders as
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
 * array elements as it goes — see `isTextlessFootnoteSibling` for why a
 * second footnote on one word rides as a separate sibling instead of a
 * second `foot` on the same node. Left in array order, that sibling's
 * marker would land after the Strong's number simply by array position, not
 * because that's where it belongs. Returns the updated suffix and the last
 * index consumed (`startIndex` when nothing was spliced).
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
 * The live state an emphasis run carries across loop iterations —
 * `openMarks` (see `EmphasisState`) plus `pendingWhitespace`, the last
 * core's trailing whitespace held back so a close delimiter can land before
 * it, not after (producing "to** Abraham", not the CommonMark-breaking
 * "to **Abraham"). Threaded through `emphasisRunContinuation` as both seed
 * and result, which is what lets a `ContentNested` node's own inner array
 * continue the SAME run its outer siblings are part of — see that
 * function's own doc comment.
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
 * top-level "b"/"i" marks (see `nestedArrayCandidate` below) — seeding the
 * recursive call with the outer array's live state lets the nested
 * content's leading edge merge with a same-marked sibling right before it,
 * instead of forcing a close+reopen at the boundary (e.g. `_which_
 * _ye have_ to` becomes `_which ye have_ to`).
 *
 * A `ContentNested` node that DOES carry its own top-level marks is
 * untouched by this: its marks wrap the whole self-contained inner render
 * from outside (e.g. `**_great joy_**`), so `renderNestedContentParts`'s
 * existing `core = renderContent(obj.content, ctx)` still runs for that
 * shape, exactly as it always has.
 *
 * Every other branch mirrors `renderContent`'s own array-branch handling
 * below, parameterized by `seed` and its returned state so a continuation
 * can pick up and leave off mid-run.
 */
function emphasisRunContinuation(
  content: Content,
  ctx: RenderContext,
  seed: EmphasisRunState
): { text: string; state: EmphasisRunState } {
  const bold = delimitersOf(ctx.options.boldWrapper);
  const italic = delimitersOf(ctx.options.italicWrapper);

  if (!Array.isArray(content)) {
    // No internal run to continue — seal the seed state (matching the array
    // branch's own hard-boundary handling) and render independently.
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

    if (!isMarkRunCandidate(item)) {
      // A whitespace-only bare string is transparent to the open "b"/"i"
      // state, same as a whitespace-only object core below (`isBlank`) — a
      // same-marked node on either side still merges into one span. Held in
      // `pendingWhitespace` rather than emitted immediately (see
      // `EmphasisRunState`'s doc comment): emitting it here would produce
      // "_the _foo" once the next node's marks differ, which CommonMark
      // won't parse as closing emphasis. This can happen even when the two
      // neighboring nodes disagree in mark sets (e.g. `["i"]` next to
      // `["i","sc"]`) — `auditNodes.ts` deliberately leaves such a gap alone
      // at the JSON level, so it has to be handled here instead.
      if (typeof item === "string" && item !== "" && item.trim() === "") {
        pendingWhitespace += item;
        continue;
      }
      // A bare string, heading/subtitle/bibleLink, or paragraph-wrapper —
      // each renders in its own context, so any open marks close first.
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
    // outer wrap to apply — its leading/trailing emphasis state comes from
    // its own inner content's edges instead, joining this run exactly as a
    // flat node's marks would (see this function's doc comment).
    // `emphasisStateOf`, not a raw `marks?.length` check, decides
    // eligibility, so a node marked only `["woc"]` or `["sc"]` is just as
    // eligible as one with no marks — consistent with `desired` below
    // treating those marks as inert.
    const override = markedBibleLinkOverride(item);
    const ownMarks = !override && "content" in item ? emphasisStateOf(item.marks) : undefined;
    const nestedArrayCandidate =
      ownMarks !== undefined && !ownMarks.b && !ownMarks.i && Array.isArray((item as ContentNested).content);

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

    // A qualifying bibleLink's own display override supplies both the
    // rendered core and the marks driving this run's open/close state (see
    // `markedBibleLinkOverride`/`renderBibleLinkParts`); every other shape
    // reports marks from `item` itself. Re-checked here rather than
    // threading `isMarkRunCandidate`'s internal check through as a value,
    // because its type predicate already narrowed `item` to `ContentObject
    // | ContentNested` — safe since every other `item`-typed access below
    // (`.strong`, `.paragraph`) degrades to a harmless `undefined` read on a
    // real bibleLink node, and `markedBibleLinkOverride` is cheap and pure.
    let parts = override
      ? renderBibleLinkParts(override, ctx)
      : "content" in item
        ? renderNestedContentParts(item, ctx)
        : renderTextObjectParts(item, ctx);

    if (isTextlessFootnoteSibling(item) && pendingWhitespace !== "" && parts.suffix.endsWith(" ")) {
      // A real word with its own trailing space already precedes this
      // textless footnote-only node — that space is about to flush before
      // `parts.suffix` is appended, so the defensive trailing space this
      // node's own suffix carries (see `renderTextObjectParts`'s own "next
      // content item is spaced correctly" comment) would be a second,
      // redundant space. Real CLV1880 Numbers 20:28 shape, once the
      // footnote-marker-spacing check's fixer (`fixFootnoteMarkerSpacing.ts`) extracts the marker into its
      // own node: without this, the marker renders with a stray space before
      // the next word it's meant to introduce with none. A verse-initial
      // textless footnote (real NUM 20:29) has no pendingWhitespace queued
      // here and keeps its own defensive space untouched.
      parts = { ...parts, suffix: parts.suffix.slice(0, -1) };
    }
    const spliced = spliceTrailingFootnoteSiblings(item, parts, content, index, ctx);
    parts = { ...parts, suffix: spliced.suffix };
    index = spliced.lastIndex;

    // A node opening a new paragraph is a hard boundary too: its own
    // marker renders before its text, so whatever was open before it must
    // already be closed, and it never inherits the previous paragraph's
    // open marks.
    if (item.paragraph) closeOpenMarks();
    result += parts.prefix;

    // A whitespace-only or absent core is never wrapped (matching
    // `wrapEmphasisMarks`'s own "meaningless ****" avoidance) and is
    // transparent to the open/close state — it neither opens nor closes a
    // mark, so a same-marked node on either side of it still merges into
    // one continuous span. This holds even for a whitespace-only *object*
    // core that carries its own marks: this path only writes `parts.core`
    // directly when `desired` equals `openMarks` exactly, i.e. nothing is
    // transitioning at this node at all, so there is no close/open ordering
    // for the write to get wrong.
    const isBlank = parts.core.trim() === "";
    const desired = isBlank ? openMarks : emphasisStateOf(override ? override.marks : item.marks);
    const transition = emphasisTransition(openMarks, desired, bold, italic);

    result += transition.close + pendingWhitespace;
    pendingWhitespace = "";

    if (isBlank) {
      result += parts.core;
    } else {
      const { leading, core, trailing } = splitWhitespace(parts.core);
      result += leading + transition.open + core;
      pendingWhitespace = trailing;
    }
    openMarks = desired;

    // Interruption: a footnote marker, Strong's number, morph code, or
    // line break renders next, so nothing can legitimately still be open
    // once we cross it — the render-time mirror of the "does this boundary
    // carry a flag" test `contentFromPieces` already uses at the
    // JSON-node-merging layer.
    if (parts.suffix !== "") {
      closeOpenMarks();
      result += parts.suffix;
    }

    // A tagged node's text can legitimately end mid-word-space — an attach
    // pass folds a leaf's trailing join-space backward into the tagged node
    // when the following text is marked, leaving the *next* sibling
    // without its usual leading space and fusing words in the plain-text
    // export ("darkness H2822was"). Testing the next sibling's own
    // rendered text, rather than guessing from this item alone, keeps the
    // end of an array correct and leaves a textless footnote-only sibling
    // alone (its render opens with "°", which must stay unspaced for
    // °{...} to remain a clean search/replace target). Checked against
    // `item` itself, never `content[index]` after splicing, since a
    // trailing textless-footnote sibling consumed by
    // `spliceTrailingFootnoteSiblings` never carries the tag this check
    // looks for.
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
    const italic = delimitersOf(ctx.options.italicWrapper);
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
    // Suppress the inner italic wrap — see `subtitleInnerOptions`.
    const inner = renderContent(content.subtitle, {
      ...ctx,
      options: subtitleInnerOptions(ctx.options),
      footnotePrefix: "Subtitle.",
    });
    return ctx.options.subtitleWrapper(inner);
  }

  // Bible reference link - render content override when provided, else the reference text
  if ("bibleLink" in content) {
    if (content.content !== undefined) {
      return renderContent(content.content, ctx);
    }
    return content.bibleLink;
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

  const suffixParts: string[] = [];

  // Footnote marker and content come before Strong's/morph so users can
  // search/replace °{...} cleanly without affecting Strong's spacing
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    suffixParts.push(ctx.options.footnoteMarker(footIndex));

    const footnoteContent = renderContent(obj.foot.content, {
      ...ctx,
      options: { ...ctx.options, includeStrongs: false, includeMorph: false },
      footnotePrefix: undefined, // Don't propagate prefix to footnote content
    });

    if (ctx.options.footnoteStyle === "inline") {
      // No space before { so °{...} stays a clean search/replace target
      suffixParts.push(`{${footnoteContent}}`);
      // A textless footnote-only element needs a trailing space so the next
      // content item is spaced correctly
      if (!text && !obj.strong) {
        suffixParts.push(" ");
      }
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
  return prefix + wrapEmphasisMarks(core, obj.marks, ctx.options) + suffix;
}

/**
 * `RenderedParts` for a `bibleLink` node whose display override qualifies
 * per `markedBibleLinkOverride` — the override is already a `ContentObject`,
 * so this reuses `renderTextObjectParts` directly instead of duplicating its
 * logic. Routing through here rather than the opaque `"bibleLink" in
 * content` branch defers the override's "b"/"i" wrap to the caller, so
 * `emphasisTransition` can supply shared delimiters across this node and
 * its same-marked neighbors, exactly as for a plain `ContentObject`.
 * Self-wrapping would instead produce `_In the_ _1. Chro. 17.6__. any of the
 * judges_` (redundant `_ _`, broken `__`); merging it into the run produces
 * one continuous span.
 */
function renderBibleLinkParts(override: ContentObject, ctx: RenderContext): RenderedParts {
  return renderTextObjectParts(override, ctx);
}

/**
 * A ContentNested's own paragraph-marker prefix — independent of its
 * `content`, so `emphasisRunContinuation`'s merge-eligible branch can reuse
 * it without rendering `obj.content` a second time (which would double-fire
 * any footnote a node inside it carries — see `renderNestedSuffix`'s own
 * doc comment for why the ordering there matters for the same reason).
 */
function renderNestedPrefix(obj: ContentNested, ctx: RenderContext): string {
  if (!obj.paragraph) return "";
  // Same paragraph-prefix rationale as `renderTextObjectParts`.
  return ctx.options.footnoteStyle === "inline"
    ? " " + ctx.options.paragraphMarker
    : ctx.options.paragraphMarker;
}

/**
 * A ContentNested's own footnote/Strong's/morph/lemma/break suffix —
 * independent of `obj.content` except for the inline-footnote-style check,
 * which needs to know whether the already-rendered `core` came out empty,
 * so the caller passes it in rather than this function rendering
 * `obj.content` itself. Kept separate from `renderNestedContentParts` so
 * `emphasisRunContinuation`'s merge-eligible branch can call it too, after
 * computing `core` its own way — both callers must push `obj.foot`'s
 * reference-style line into `ctx.footnotes` in the same relative order,
 * which is why each computes `core` first and calls this function after.
 */
function renderNestedSuffix(obj: ContentNested, ctx: RenderContext, core: string): string {
  const suffixParts: string[] = [];

  // Same footnote/Strong's ordering rationale as `renderTextObjectParts`'s
  // own suffix (kept in one place there).
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    suffixParts.push(ctx.options.footnoteMarker(footIndex));

    const footnoteContent = renderContent(obj.foot.content, {
      ...ctx,
      options: { ...ctx.options, includeStrongs: false, includeMorph: false },
      footnotePrefix: undefined,
    });

    if (ctx.options.footnoteStyle === "inline") {
      suffixParts.push(`{${footnoteContent}}`);
      if (!core && !obj.strong) {
        suffixParts.push(" ");
      }
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
 * recursive render rather than a `text` property. Recursing through
 * `renderContent` lets the array branch's emphasis-state tracking apply
 * automatically inside the inner array too, merging same-marked siblings
 * before this node's own "b"/"i" wrap is applied by the caller. Used for the
 * lone-node path (`renderNestedContent`) and for any nested node
 * `emphasisRunContinuation` doesn't treat as merge-eligible (own top-level
 * marks, or non-array content) — both render `obj.content` self-contained
 * and sealed.
 */
function renderNestedContentParts(obj: ContentNested, ctx: RenderContext): RenderedParts {
  const core = renderContent(obj.content, ctx);
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
  return prefix + wrapEmphasisMarks(core, obj.marks, ctx.options) + suffix;
}

// ============================================================================
// Verse Conversion Functions
// ============================================================================

/**
 * Convert a verse to plain text with Strong's numbers and morph codes.
 */
function convertVerseToText(verse: VerseSchema): string {
  const chapter = verse.chapter.toString().padStart(3, "0");
  const verseNum = verse.verse.toString().padStart(3, "0");

  const ctx: RenderContext = {
    options: TEXT_OPTIONS,
    footnotes: [],
    verseNum: verse.verse,
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
  chapterFootnotes: string[]
): string {
  const ctx: RenderContext = {
    options: MARKDOWN_OPTIONS,
    footnotes: chapterFootnotes,
    verseNum: verse.verse,
  };

  let leadingPrefix = "";
  let processedContent = verse.content;

  // A leading heading or subtitle renders above the verse number rather
  // than inline — the fallback for whatever
  // `convertBibleVersionToMarkdown`'s chapter-level hoist didn't already
  // consume: the second heading of a chapter-opening [heading, heading]
  // run, or any subtitle that doesn't open a chapter. Previously a leading
  // subtitle rendered stranded inside the verse line with a meaningless
  // mid-line "> " marker; hoisting it here avoids that.
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
        options: subtitleInnerOptions(ctx.options),
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

  return `${leadingPrefix}${paragraphPrefix}<sup>${verse.verse}</sup> ${text}`;
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
    const textLines = data.map((verse) => convertVerseToText(verse));

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
      // appear rather than a fixed subtitle-then-heading order — a fixed
      // order would silently miss a [heading, subtitle] leading run and
      // leave a stray mid-line "> " blockquote marker in verse 1. At most
      // one heading and one subtitle are consumed here, never a second of
      // the same kind, so a [heading, heading] chapter opening (e.g. an
      // acrostic Psalm's stanza headings) still hoists only its first
      // heading and leaves the second for `convertVerseToMarkdown`'s own
      // verse-level fallback.
      let hoistedHeading = false;
      let hoistedSubtitle = false;
      while (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (!Array.isArray(firstContent) || firstContent.length === 0) break;
        const firstItem = firstContent[0];
        if (typeof firstItem !== "object") break;

        if (!hoistedSubtitle && "subtitle" in firstItem) {
          const ctx: RenderContext = {
            options: subtitleInnerOptions({ ...MARKDOWN_OPTIONS, includeFootnotes: true }),
            footnotes: chapterFootnotes,
            verseNum: chapterVerses[0].verse,
            footnotePrefix: "Subtitle.",
          };
          const subtitleText = renderContent(firstItem.subtitle, ctx);
          markdownLines.push("");
          markdownLines.push(`> _${subtitleText}_`);
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
        const verseText = convertVerseToMarkdown(verse, chapterFootnotes);
        markdownLines.push(verseText);
      }

      if (chapterFootnotes.length > 0) {
        markdownLines.push("");
        for (const footnote of chapterFootnotes) {
          markdownLines.push(`> ${footnote}`);
        }
      }
    }

    const outputPath = path.join(outputDir, file.replace(".json", ".md"));
    await writeFileAtomic(outputPath, markdownLines.join("\n") + "\n");
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
