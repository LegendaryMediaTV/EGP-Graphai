import fs from "fs";
import path from "path";
import Content, {
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
};

/**
 * Letter label for the nth footnote (0-based) in a chapter: a, b, ... z, aa,
 * ab, ... Chapters routinely carry more than 26 footnotes: CLV1880 PSA 119
 * has 176, reaching "ft".
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
  subtitleWrapper: (text) => `> _${text}_`,
  footnoteMarker: (index) => `<sup>${footnoteLabel(index)}</sup>`,
  boldWrapper: (text) => `**${text}**`,
  italicWrapper: (text) => `_${text}_`,
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
 * A node carrying only a footnote of its own — no text, no Strong's number,
 * no nested content. Two real corpus shapes take this form. The first is a
 * *second* footnote on one word: `content-schema.json` allows only one
 * `foot` per node, so it rides as a textless sibling immediately after the
 * word it annotates rather than living on that word's own node. The second
 * is a `{foot}` node that is the *sole* note on a phrase, sitting
 * immediately before the phrase rather than trailing a second note after
 * it — ASV1901 Matthew 1:23 opens its content array with exactly this: a
 * lone footnote node ahead of the "Behold, the virgin..." text it
 * annotates.
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
 * Whether `item` is a plain mark-bearing renderable — a `ContentObject` or
 * `ContentNested` — rather than one of the array's other legal shapes: a
 * bare string, a `heading`/`subtitle`/`bibleLink` item (each renders in its
 * own context and must never be treated as sharing the surrounding items'
 * open "b"/"i" state), or the `paragraph`-wrapper object (`content.paragraph`
 * holding nested content, not the boolean start-of-paragraph flag). Only
 * `ContentObject` and `ContentNested` ever carry a `marks` array, so only
 * these two shapes ever participate in the array branch's emphasis-state
 * walk (see `emphasisTransition`).
 */
function isMarkRunCandidate(item: Content): item is ContentObject | ContentNested {
  if (typeof item === "string" || Array.isArray(item) || item === null || typeof item !== "object") return false;
  if ("heading" in item || "subtitle" in item || "bibleLink" in item) return false;
  if ("paragraph" in item && item.paragraph !== undefined && typeof item.paragraph !== "boolean") return false;
  return true;
}

/**
 * Which of "b"/"i" a node's own `marks` array requests, as two independent
 * booleans rather than one combined key — see `emphasisTransition`, which is
 * what actually needs them independent (a shared mark can stay open across a
 * neighbor that only changes the other one; e.g. italic staying open while
 * bold alone drops for just a supplied/implied word in the middle of an
 * otherwise bold+italic quotation). Ignores any other mark (e.g. "sc" doesn't
 * affect emphasis wrapping, only whether the text is uppercased).
 */
interface EmphasisState {
  /** Whether "b" (bold) is currently open. */
  b: boolean;
  /** Whether "i" (italic) is currently open. */
  i: boolean;
}

function emphasisStateOf(marks: ContentObject["marks"]): EmphasisState {
  return { b: !!marks?.includes("b"), i: !!marks?.includes("i") };
}

/**
 * Splits `text` into its leading whitespace, trimmed core, and trailing
 * whitespace. Shared by `wrapEmphasisMarks` (wraps a single node's whole
 * text at once) and the array branch's per-transition emission (wraps only
 * the piece between two adjacent nodes' emphasis-state changes) — both need
 * to keep a delimiter off of adjacent whitespace, since CommonMark won't
 * parse a delimiter run immediately touching whitespace as opening/closing
 * emphasis (e.g. "** foo**" renders as literal asterisks, not bold), and
 * real corpus text items routinely carry a leading or trailing join-space
 * (e.g. KJV1769 JUD 1:1's " the servant").
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
 * Applies "b"/"i" mark wrapping to `text`, bold innermost then italic
 * outermost (matching web/public/js/ContentNode.js — `emphasisTransition`
 * below relies on this same order for its own close/open sequencing). Only
 * the trimmed core is wrapped, with the original leading/trailing whitespace
 * reattached outside the delimiters (see `splitWhitespace`). A core that's
 * empty (whitespace-only or absent `text`) is left unwrapped rather than
 * producing a meaningless "****".
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
 * The opening and closing strings a wrapper function emits, recovered by
 * wrapping a sentinel no real content ever contains and splitting on it.
 * Lets `emphasisTransition` open/close "b"/"i" independently — closing only
 * the mark that's leaving and opening only the mark that's arriving at a
 * transition, rather than always wrapping a whole string at once — while
 * `RenderOptions` stays a pair of plain text-wrapping functions rather than
 * needing separate open/close string fields of its own.
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
 * Splices any trailing textless-footnote-only siblings' own markers into
 * `parts.suffix`, right before `item`'s own Strong's tag, consuming those
 * sibling array elements as it goes. A second footnote on the same word
 * can't live on that word's own node (`content-schema.json` allows only one
 * `foot` per node — see `isTextlessFootnoteSibling`), so it rides as a
 * textless sibling immediately after; left in plain array order, that
 * sibling's own marker would land after this node's Strong's number simply
 * because it comes later in the array, not because that is where it belongs.
 * Returns the updated suffix and the true last array index consumed
 * (`startIndex` itself when there was nothing to splice).
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
 * Render any Content to a string based on options. Shape checks run from
 * most specific (heading, subtitle, bibleLink, paragraph wrapper) to most
 * generic (nested content, then a bare text object), returning at the
 * first match.
 */
function renderContent(content: Content, ctx: RenderContext): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    let result = "";

    // The running "b"/"i" open state, carried across loop iterations rather
    // than collected into a run ahead of time — see `emphasisTransition`.
    // `pendingWhitespace` is the last-rendered core's own trailing whitespace,
    // held back rather than emitted immediately so a close delimiter that
    // belongs at THIS transition can land before it instead of after (e.g.
    // closing bold right after "to", not after its trailing space, is what
    // produces "to** Abraham" rather than the CommonMark-breaking
    // "to **Abraham" with the close delimiter preceded by whitespace).
    let openMarks: EmphasisState = { b: false, i: false };
    let pendingWhitespace = "";
    const bold = delimitersOf(ctx.options.boldWrapper);
    const italic = delimitersOf(ctx.options.italicWrapper);

    const closeOpenMarks = () => {
      const { close } = emphasisTransition(openMarks, { b: false, i: false }, bold, italic);
      result += close + pendingWhitespace;
      pendingWhitespace = "";
      openMarks = { b: false, i: false };
    };

    for (let index = 0; index < content.length; index++) {
      const item = content[index];

      if (!isMarkRunCandidate(item)) {
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

      let parts = "content" in item
        ? renderNestedContentParts(item, ctx)
        : renderTextObjectParts(item, ctx);
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
      // one continuous span.
      const isBlank = parts.core.trim() === "";
      const desired = isBlank ? openMarks : emphasisStateOf(item.marks);
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

    closeOpenMarks();
    return result;
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
 * Computes a ContentNested's three `RenderedParts` — like
 * `renderTextObjectParts`, but the core is the nested content's own
 * recursive render rather than a `text` property. Recursing through
 * `renderContent` here is what makes the array branch's emphasis-state
 * tracking apply automatically inside a `ContentNested`'s own inner array
 * too: the recursive call hits the array branch again and merges
 * same-marked siblings there before this node's own "b"/"i" wrap (applied by
 * the caller) ever sees the result.
 */
function renderNestedContentParts(obj: ContentNested, ctx: RenderContext): RenderedParts {
  let prefix = "";
  if (obj.paragraph) {
    // Text format needs a space before the marker to separate it from the
    // previous word's Strong's/morph
    prefix = ctx.options.footnoteStyle === "inline"
      ? " " + ctx.options.paragraphMarker
      : ctx.options.paragraphMarker;
  }

  const core = renderContent(obj.content, ctx);

  const suffixParts: string[] = [];

  // Footnote marker and content come before Strong's/morph so °{...} stays a
  // clean search/replace target
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    suffixParts.push(ctx.options.footnoteMarker(footIndex));

    const footnoteContent = renderContent(obj.foot.content, {
      ...ctx,
      options: { ...ctx.options, includeStrongs: false, includeMorph: false },
      footnotePrefix: undefined,
    });

    if (ctx.options.footnoteStyle === "inline") {
      // No space before { so °{...} stays a clean search/replace target
      suffixParts.push(`{${footnoteContent}}`);
      // A textless footnote-only element needs a trailing space so the next
      // content item is spaced correctly
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

  return { prefix, core, suffix: suffixParts.join("") };
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

  let headingPrefix = "";
  let processedContent = verse.content;

  // A leading heading renders above the verse number rather than inline with the verse text
  if (Array.isArray(verse.content) && verse.content.length > 0) {
    const firstItem = verse.content[0];
    if (typeof firstItem === "object" && "heading" in firstItem) {
      const headingText = renderContent(firstItem.heading, {
        ...ctx,
        footnotePrefix: "Heading.",
      });
      const marker = markdownHeadingMarker((firstItem as ContentHeading).type);
      headingPrefix = `\n${marker} ${headingText}\n`;
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

  return `${headingPrefix}${paragraphPrefix}<sup>${verse.verse}</sup> ${text}`;
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

      // A leading subtitle prints above the chapter rather than inside verse 1
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "subtitle" in firstItem) {
            const ctx: RenderContext = {
              options: { ...MARKDOWN_OPTIONS, includeFootnotes: true },
              footnotes: chapterFootnotes,
              verseNum: chapterVerses[0].verse,
              footnotePrefix: "Subtitle.",
            };
            const subtitleText = renderContent(firstItem.subtitle, ctx);
            markdownLines.push("");
            markdownLines.push(`> _${subtitleText}_`);
            chapterVerses[0].content = firstContent.slice(1);
          }
        }
      }

      // A leading heading prints above the chapter rather than inside verse 1
      if (chapterVerses.length > 0) {
        const firstContent = chapterVerses[0].content;
        if (Array.isArray(firstContent) && firstContent.length > 0) {
          const firstItem = firstContent[0];
          if (typeof firstItem === "object" && "heading" in firstItem) {
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
          }
        }
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
