#!/usr/bin/env ts-node
/**
 * Corpus-wide sweep for ways a node's own placement can drift from this
 * repo's leading-vs-trailing-space convention (see `utils/validate.ts`'s
 * `findStrongTrailingWhitespaceNodes`):
 *
 * 1. **Unmerged node pairs** — an ordinary, untagged connector left split
 *    from the neighbor immediately after it that carries a `strong`
 *    number, a `foot`, or a `break`, when it should have folded forward
 *    into that neighbor instead. One-directional: a trailing connector
 *    with nothing tagged after it is simply untagged text, not a pair this
 *    check recommends merging. See {@link canJoinForward} and {@link
 *    scanArrayForUnmergedPairs}.
 * 2. **Trailing whitespace** — a `strong`-carrying node's own `text` ending
 *    in a space, when the convention puts a joining space on the *leading*
 *    edge of whatever follows, never the trailing edge of what precedes it.
 * 3. **Leading punctuation** — a `strong`-carrying node's own `text`
 *    *starting* with tight punctuation that reads as glued to the word
 *    before it, not to the word this node itself carries. See {@link
 *    scanArrayForLeadingPunctuation}.
 * 4. **Mark-boundary spaces** — a bare, untagged whitespace-only node
 *    sandwiched between two real nodes that agree in `marks`/`script` with
 *    each other, instead of leading the word after it. See {@link
 *    isBlankConnector} and {@link scanArrayForMarkBoundarySpaces}.
 * 5. **Verse-initial spaces** — a verse's own outermost content starting
 *    with a space, paragraph-opening or not: there is nothing before the
 *    first word of a verse for a joining space to belong to. See {@link
 *    checkVerseInitialSpace}.
 * 6. **Heading/subtitle not followed by a paragraph** — a heading- or
 *    subtitle-type node (any consecutive run of the two collapsed into one)
 *    whose own real next node fails to carry `paragraph: true`. Flat and
 *    corpus-wide: every heading or subtitle followed by anything that is
 *    not itself a heading or subtitle opens a paragraph, in every version
 *    and every book. See {@link findHeadingParagraphMismatches}.
 * 7. **Un-normalized fraction** — a node's own `text` still carrying a real
 *    fraction shape (an ASCII `N/M` slash, a precomposed vulgar-fraction
 *    glyph, or plain digits already separated by U+2044 but not yet
 *    raised/lowered) rather than this repo's own superscript/U+2044/
 *    subscript convention. Unlike checks 1-6, this one isn't about a node's
 *    own *placement* relative to its neighbors — it's a project-wide content
 *    standard ({@link normalizeFractionText}, `utils/usfm/fractions.ts`)
 *    checked here so any version's content, however it was built, can be
 *    measured against it independent of the USFM importer that first applies
 *    it. See {@link hasUnnormalizedFraction}.
 *
 * A general-purpose, version-controlled tool any future import can reach
 * for, rather than a one-off diagnostic scoped to whichever translation
 * happens to be mid-import at the time.
 *
 * Checks 1-4 recurse into `content` (a `ContentNested` wrapper's own inner
 * array) in addition to `heading`/`subtitle`/`foot.content` — recursing
 * into `foot.content` costs nothing today (no version currently tags
 * `strong` inside a footnote) and is a safe default if a future import
 * ever does.
 *
 * **No curated version list.** With no version named on the command line,
 * this audits every directory under `bible-versions/` — whatever this repo
 * happens to carry, not a hardcoded set. A version with no `strong` values
 * at all (most of them) simply reports zero findings, cheaply.
 *
 * Read-only. Detects; does not fix.
 */

import * as fs from "fs";
import * as path from "path";
import { getVersionDirectories } from "../functions/getBibleVersions";
import Content from "../types/Content";
import { normalizeFractionText } from "./usfm/fractions";

/** Root directory holding one subfolder per Bible version. */
const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");

/** A verse-file's own name: two-digit book order + book id (e.g. `01-GEN.json`) — never `_version.json` or a schema file. */
const VERSE_FILE_NAME = /^\d{2}-[A-Z0-9]+\.json$/;

/** One shape as it exists on disk: a verse's own identifying fields plus its content tree. */
export interface VerseRecord {
  /** The verse's own book id (e.g. `GEN`, `MAT`). */
  book: string;
  /** The verse's own chapter number. */
  chapter: number;
  /** The verse's own verse number. */
  verse: number;
  /** The verse's own content tree — any shape `Content` permits. */
  content: Content;
}

// ---------------------------------------------------------------------------
// One node's own shape, read once and shared by every check below
// ---------------------------------------------------------------------------

export interface NodeShape {
  /** This node's own text, or `undefined` when it has no `text` key at all — a `{heading}`/`{subtitle}`/`{bibleLink}` wrapper, a `ContentNested` wrapper, or a multi-number tag's own textless sibling. */
  text: string | undefined;
  /** This node's own `marks` array, normalized to `[]` when absent so two nodes can be compared for formatting agreement without null-checking first. */
  marks: readonly unknown[];
  /** This node's own `script` value (e.g. `"G"`/`"H"`), or `undefined` when it doesn't carry one. */
  script: unknown;
  /** This node's own `strong` number, or `undefined` when it doesn't carry one. */
  strong: string | undefined;
  /** Whether this node carries a `foot`. */
  hasFoot: boolean;
  /** A `ContentNested` wrapper (`{content: [...], strong: "..."}`) — has rendered text one level down but no top-level `text` of its own, so it's never itself an eligible donor, merge target, or attachment point at this array level. */
  hasNestedContent: boolean;
  /** A multi-number `<st>` tag's own textless sibling (`{strong: "H853"}`, no `text`, no nested `content` either) — renders nothing at all, so a backward scan for an attachment point passes straight through it rather than stopping there. Distinct from `hasNestedContent`: both lack top-level `text`, but only one of them is actually invisible. */
  isTextlessStrongSibling: boolean;
  /** Whether this node's own `paragraph` is `true`. */
  opensParagraph: boolean;
  /** Whether this node's own `break` is `true`. */
  endsBreak: boolean;
  /** A `{heading}`/`{subtitle}`/`{bibleLink}` wrapper, or any other non-plain-object shape — opaque to every check here, a hard boundary none of them cross. */
  isBoundary: boolean;
}

/**
 * Reads any raw content-tree node into the shared {@link NodeShape} every
 * check in this module is built on — a `{heading}`/`{subtitle}`/`{bibleLink}`
 * wrapper, `null`, or any non-plain-object value all read as a boundary;
 * everything else reads its own `text`/`marks`/`script`/`strong`/`foot`/
 * `paragraph`/`break` straight off the node.
 */
export function describeNode(node: unknown): NodeShape {
  const empty = {
    marks: [] as readonly unknown[],
    script: undefined,
    strong: undefined,
    hasFoot: false,
    hasNestedContent: false,
    isTextlessStrongSibling: false,
    opensParagraph: false,
    endsBreak: false,
  };

  if (typeof node === "string") {
    return { ...empty, text: node, isBoundary: false };
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return { ...empty, text: undefined, isBoundary: true };
  }

  const record = node as Record<string, unknown>;
  if ("heading" in record || "subtitle" in record || "bibleLink" in record) {
    return { ...empty, text: undefined, isBoundary: true };
  }

  const text = typeof record.text === "string" ? record.text : undefined;
  const strong = typeof record.strong === "string" ? record.strong : undefined;
  const hasNestedContent = "content" in record;

  return {
    text,
    marks: Array.isArray(record.marks) ? record.marks : [],
    script: record.script,
    strong,
    hasFoot: record.foot !== undefined && record.foot !== null,
    hasNestedContent,
    isTextlessStrongSibling:
      text === undefined && strong !== undefined && !hasNestedContent,
    opensParagraph: record.paragraph === true,
    endsBreak: record.break === true,
    isBoundary: false,
  };
}

/** True when two nodes agree closely enough on `marks`/`script` that a mismatch could not be the reason they stayed split — the same "stays split, not nested" rule that keeps a small-caps divine name (`marks: ["sc"]`) split from an ordinary, unmarked connector word sitting beside it. */
function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
  return (
    a.script === b.script &&
    a.marks.length === b.marks.length &&
    a.marks.every((mark, at) => mark === b.marks[at])
  );
}

/**
 * Real, non-blank, untagged, footnote-less, break-free text — the only shape
 * a merge (check 1) may treat as the "plain" half of a pair. `endsBreak` is
 * excluded alongside `strong`/`hasFoot` because a break-carrying node is
 * itself a valid {@link canJoinForward} target; without the exclusion the
 * scanning loop would sweep past it instead of stopping to treat it as the
 * target.
 */
export function isMergeableConnector(shape: NodeShape): boolean {
  return (
    shape.text !== undefined &&
    shape.text.trim() !== "" &&
    shape.strong === undefined &&
    !shape.hasFoot &&
    !shape.endsBreak
  );
}

/** A real, text-bearing node some other node's stray text might legitimately belong on — `strong`-carrying, footnoted, or plain, it does not matter which; only a `ContentNested` wrapper (no top-level `text`) or a hard boundary is disqualified. */
function isRealAttachmentPoint(shape: NodeShape): boolean {
  return (
    !shape.isBoundary && shape.text !== undefined && shape.text.trim() !== ""
  );
}

// ---------------------------------------------------------------------------
// Check 1 — an ordinary connector word left un-merged beside a strong/foot/break-carrying neighbor
// ---------------------------------------------------------------------------

/** One un-merged pair found within a single array level. */
interface PairFinding {
  /** The array level this pair was found in (e.g. `content`, `content.heading`, `content.content` for a `ContentNested` descent). */
  where: string;
  /** The untagged connector node this rule says should have merged. */
  plain: unknown;
  /** The `strong`-, `foot`-, or `break`-carrying node it should have merged into. */
  target: unknown;
}

/**
 * True when every node in a candidate run of consecutive mergeable
 * connectors should merge forward as a unit into `target`. `target` is
 * eligible whenever it carries a `strong` number, a `foot`, or a `break` —
 * any one of these is a suffix that attaches to the end of accumulated text
 * and is exactly why `target` had to stay its own node; the connectors
 * before it, carrying none of these themselves, have no such reason and
 * should have folded forward into it first. Requires `target.text !==
 * undefined` in addition — checking `strong`/`hasFoot`/`endsBreak` alone
 * would wrongly accept a `ContentNested` wrapper, which can carry `strong`
 * with no top-level `text` of its own, so "merging" a connector's text into
 * it would have nowhere to actually land. The run's own first member may
 * carry `opensParagraph`; no later member may — a `paragraph: true` on any
 * member after the first marks a piece boundary strictly inside the run
 * (Genesis 13:11's real corpus case).
 *
 * Concrete case: `{ paragraph: true, text: "In the beginning, " }, { text:
 * "God", foot: {...} }` should merge into one node — the paragraph-opening
 * connector carries no `strong`/`foot`/`break` of its own and belongs
 * folded into the node that does.
 */
export function canJoinForward(run: readonly NodeShape[], target: NodeShape): boolean {
  return (
    run.length > 0 &&
    (target.strong !== undefined || target.hasFoot || target.endsBreak) &&
    target.text !== undefined &&
    !target.opensParagraph &&
    run.every(
      (shape, at) =>
        !shape.endsBreak &&
        (at === 0 || !shape.opensParagraph) &&
        agreesInFormatting(shape, target),
    )
  );
}

/**
 * Scan one array level for adjacent node pairs that should have merged into
 * one node but did not: every maximal run of consecutive mergeable
 * connectors immediately *before* a node carrying a `strong` number, a
 * `foot`, or a `break` — any of the three counts as `target`, per {@link
 * canJoinForward}.
 *
 * Deliberately one-directional: a run of untagged connectors with no
 * suffix-carrying node following it — the tail end of a span, or of the
 * verse — is never a finding, no matter how well it agrees in formatting
 * with what precedes it. There's nothing tagged for it to fold into, so
 * it's simply untagged text, not an unmerged pair. A corpus case that looks
 * identical either direction makes the asymmetry concrete: Genesis 1:15
 * KJV1769 ends `{ text: " upon the earth:", strong: "H776" }, " and it was
 * so."` — untagged, trailing, nothing suffix-carrying after it. Folding it
 * backward into `H776` would claim that Strong's number covers "and it was
 * so," which it does not; the identical phrase in Genesis 1:7 carries its
 * own tag (`strong: "H3651"`) — the real defect, when there is one, is a
 * missing tag on the connector, never something this check could recommend
 * merging away.
 */
function scanArrayForUnmergedPairs(
  nodes: readonly unknown[],
  where: string,
): PairFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: PairFinding[] = [];

  let at = 0;
  while (at < nodes.length) {
    let end = at;
    while (end < nodes.length && isMergeableConnector(shapes[end])) end++;
    const target = shapes[end];
    const run = shapes.slice(at, end);
    if (end > at && target !== undefined && canJoinForward(run, target)) {
      for (let i = at; i < end; i++) {
        findings.push({ where, plain: nodes[i], target: nodes[end] });
      }
      at = end + 1;
    } else {
      at++;
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 3 — leading punctuation glued to the wrong side of a strong-carrying node
// ---------------------------------------------------------------------------

/**
 * True for a character that is not a letter, not a digit, not whitespace,
 * not a dash, and not an *opening* mark (an opening bracket/parenthesis or
 * an initial quotation mark).
 *
 * Dashes (Unicode category `Pd`) are excluded because this corpus has an
 * established, deliberate convention for gluing a dash to the *following*
 * piece of a compound word with no space at all (Psalm 56:1's real
 * "yonath"/H3123 + "-elem"/H482 + "-rekhoqim"/H7350). Opening marks
 * (`Ps`/`Pi`) are excluded for the identical reason: an opening
 * parenthesis/bracket/quote attaches to whatever it introduces, the reverse
 * of a *closing* mark (`Pe`/`Pf`), which is this check's own real target.
 */
function isTightPunctuationChar(ch: string): boolean {
  return !/[\p{L}\p{N}\s\p{Pd}\p{Ps}\p{Pi}]/u.test(ch);
}

/** Splits `text` at the boundary between its own leading run of {@link isTightPunctuationChar} characters and everything after — `undefined` when `text` does not start with one at all. */
function leadingTightPunctuationSplit(
  text: string,
): { before: string; after: string } | undefined {
  let i = 0;
  while (i < text.length && isTightPunctuationChar(text[i])) i++;
  if (i === 0) return undefined;
  return { before: text.slice(0, i), after: text.slice(i) };
}

/** One misplaced leading-punctuation node found within a single array level. */
interface LeadingPunctuationFinding {
  /** The array level this was found in. */
  where: string;
  /** The `strong`-carrying node whose own text starts with punctuation that does not belong to it. */
  node: unknown;
  /** The leading run of tight-punctuation characters that should have moved. */
  leading: string;
  /** The earlier node — `strong`-carrying, footnoted, or plain — the leading punctuation should have attached to instead. */
  attachTo: unknown;
}

/**
 * Scan one array level for a `strong`-carrying node whose own `text` starts
 * with tight punctuation that reads as glued to the word before it —
 * illustrative shape: `"Look"`/G2400 + `"! The"`/G3588.
 *
 * A finding requires a genuine attachment point immediately before the
 * offending node (see {@link isRealAttachmentPoint}), agreeing in
 * `marks`/`script` (see {@link agreesInFormatting}), with no `break` at the
 * join and no `paragraph` opening on the offending node itself.
 *
 * **A textless Strong's sibling in between is skipped over, not treated as
 * a boundary** — it renders zero characters (`{strong: "H853"}`, no `text`
 * at all), so the *visual* neighbor is whatever precedes it: a real corpus
 * case has a node ending "... and female"/H5347, immediately followed by a
 * bare `{strong: "H1961"}` sibling, immediately followed by a node starting
 * ", to keep ..."/H2421 — the comma is visually glued to "female," not to
 * the textless sibling between them.
 *
 * A genuine `marks`/`script` mismatch is not a finding: a small-caps divine
 * name followed by unmarked punctuation correctly stays split rather than
 * take on formatting it doesn't carry.
 */
function scanArrayForLeadingPunctuation(
  nodes: readonly unknown[],
  where: string,
): LeadingPunctuationFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: LeadingPunctuationFinding[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const shape = shapes[i];
    if (
      shape.strong === undefined ||
      shape.text === undefined ||
      shape.text.length === 0
    )
      continue;

    const split = leadingTightPunctuationSplit(shape.text);
    if (split === undefined) continue;

    let j = i - 1;
    while (j >= 0 && shapes[j].isTextlessStrongSibling) j--;
    if (j < 0) continue;

    const target = shapes[j];
    if (
      !isRealAttachmentPoint(target) ||
      target.endsBreak ||
      shape.opensParagraph ||
      !agreesInFormatting(target, shape)
    )
      continue;

    findings.push({
      where,
      node: nodes[i],
      leading: split.before,
      attachTo: nodes[j],
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 2 — trailing whitespace on a strong-carrying node
// ---------------------------------------------------------------------------

/** True when a node carries a `strong` value and its own `text` ends in whitespace — the mirror image of check 3, and a violation of this corpus's leading-space convention (see the top of this file). */
function hasTrailingWhitespace(shape: NodeShape): boolean {
  return (
    shape.strong !== undefined &&
    shape.text !== undefined &&
    /\s$/.test(shape.text)
  );
}

// ---------------------------------------------------------------------------
// Check 7 — a node's own text still carrying an un-normalized fraction
// ---------------------------------------------------------------------------

/**
 * True when a node's own `text` still carries a real fraction shape
 * {@link normalizeFractionText} would rewrite — an ASCII `N/M` slash, a
 * precomposed vulgar-fraction glyph, or plain digits already separated by
 * U+2044 but not yet raised/lowered. Unlike every other check in this
 * module, this one has nothing to do with a node's placement relative to its
 * neighbors and applies to any text-bearing node, `strong`-carrying or not —
 * it's the same project-wide fraction convention the USFM importer applies
 * on the way in (`utils/usfm/fractions.ts`), reachable here so any version's
 * already-built content can be checked against it too.
 */
function hasUnnormalizedFraction(shape: NodeShape): boolean {
  return shape.text !== undefined && normalizeFractionText(shape.text).changes > 0;
}

// ---------------------------------------------------------------------------
// Check 4 — a bare joining space stranded between two same-formatting nodes
// ---------------------------------------------------------------------------

/**
 * True for a node whose own `text` is nonempty but entirely whitespace.
 *
 * A blank has no lexical content, so {@link isMergeableConnector} (check 1)
 * excludes it — leaving a separate real shape uncovered: a `<woc>` (Words
 * of Christ) or italics span built one word at a time, with the joining
 * space between each word pulled out as its own node instead of leading the
 * word that follows. Illustrative shape, Matthew 6:32 KJV1769: `{text:
 * "after", marks: ["woc"], strong: "G1934"}, " ", {text: "all", marks:
 * ["woc"], strong: "G3956"}` — repeated for essentially every word of the
 * verse.
 */
function isBlankConnector(shape: NodeShape): boolean {
  return (
    shape.text !== undefined &&
    shape.text.length > 0 &&
    shape.text.trim() === "" &&
    shape.strong === undefined &&
    !shape.hasFoot
  );
}

/** One stranded joining-space finding within a single array level. */
interface MarkBoundarySpaceFinding {
  /** The array level this was found in. */
  where: string;
  /** The real node immediately before the space — left untouched by the fix, kept here only for context. */
  left: unknown;
  /** The blank node itself — removed once the fix runs. */
  space: unknown;
  /** The real node immediately after the space — the one the space's own text should roll onto the front of. */
  target: unknown;
}

/**
 * Scan one array level for a bare, untagged whitespace-only node sandwiched
 * between two real, non-blank nodes that agree in `marks`/`script` with each
 * other — the one condition that makes rolling the space forward safe: with
 * identical formatting on both sides, the space carries no boundary meaning
 * of its own, so its only correct home is the leading edge of the node after
 * it.
 *
 * A run of textless Strong's siblings immediately after the space is
 * skipped through to find that real node (the same skip-through check 3
 * uses for its own backward attachment point) — a textless sibling renders
 * zero characters, so it isn't a visual boundary the formatting-agreement
 * check needs to cross. Real Matthew 3:15 KJV1769 shape: `{text: " it
 * becometh", marks: ["woc"]}, " ", {strong: "G2076"}, {text: "us", marks:
 * ["woc"]}` — the textless `G2076` sibling carries no `marks` at all (moot,
 * since it renders nothing) and would otherwise cause a false `marks`
 * mismatch.
 *
 * `endsBreak`/`opensParagraph` guard the same way they do in check 1: a break
 * on the space itself or a paragraph opening on the target both mark a real
 * piece boundary that a bare space's own formatting agreement cannot paper
 * over. A footnote on either real neighbor does not block the finding — the
 * footnote stays attached to whichever node already carries it; only the
 * space itself moves.
 */
function scanArrayForMarkBoundarySpaces(
  nodes: readonly unknown[],
  where: string,
): MarkBoundarySpaceFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: MarkBoundarySpaceFinding[] = [];

  for (let i = 1; i < nodes.length - 1; i++) {
    const shape = shapes[i];
    if (!isBlankConnector(shape) || shape.endsBreak) continue;

    const left = shapes[i - 1];
    if (!isRealAttachmentPoint(left)) continue;

    let j = i + 1;
    while (j < nodes.length && shapes[j].isTextlessStrongSibling) j++;
    if (j >= nodes.length) continue;

    const target = shapes[j];
    if (!isRealAttachmentPoint(target) || target.opensParagraph) continue;
    if (!agreesInFormatting(left, target)) continue;

    findings.push({
      where,
      left: nodes[i - 1],
      space: nodes[i],
      target: nodes[j],
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 5 — a verse whose own content starts with a space
// ---------------------------------------------------------------------------

/**
 * One verse-initial-space finding: `first` is the verse's own opening node,
 * `next` is whatever immediately follows it. Both are always present — the
 * fix branches on whether `first`'s own text is *entirely* whitespace
 * (collapse `next` into `first`) or merely *starts* with it (trim `first` in
 * place, `next` untouched) — but that decision belongs to the fix, not the
 * audit (this module only detects; see the top doc comment).
 */
interface VerseInitialSpaceFinding {
  /** The verse's own opening content node — the one whose text starts with whitespace. */
  first: unknown;
  /** Whatever immediately follows `first` in the verse's content array. */
  next: unknown;
}

/**
 * True when a verse's own top-level content starts with a space — never
 * valid, paragraph-opening or not: there is nothing before the first word of
 * a verse for a joining space to belong to.
 *
 * Unlike checks 1-4, this one looks only at a verse's own outermost content
 * array — never a `ContentNested` wrapper's inner array (an expected shape
 * there: `{content: [" ", {text: "is", marks: ["i"]}, " precious,"],
 * strong: "..."}` is an ordinary mid-sentence insertion) and never past a
 * `heading`/`subtitle` boundary — no heading-prefixed verse in this corpus
 * needs that today.
 *
 * Two distinct shapes, both WEBUS2020-only in this corpus's current state: a
 * first node that is *entirely* whitespace (a bare `" "`, or Revelation's own
 * recurring `{paragraph: true, text: " "}`, one per chapter-opening verse)
 * and a first node whose own text merely *starts* with whitespace before real
 * content continues (`{paragraph: true, text: " Jesus went out from the
 * temple..."}`, Matthew 24:1).
 */
function checkVerseInitialSpace(
  content: unknown,
): VerseInitialSpaceFinding | undefined {
  const nodes = asArray(content);
  const shape = describeNode(nodes[0]);
  if (shape.text === undefined || !/^\s/.test(shape.text)) return undefined;

  return { first: nodes[0], next: nodes[1] };
}

// ---------------------------------------------------------------------------
// Check 6 — a heading/subtitle run not immediately followed by a paragraph start
// ---------------------------------------------------------------------------

/** True for a `{heading: ...}` or `{subtitle: ...}` wrapper — the two boundary shapes this check collapses into one run before looking at what comes after. */
function isHeadingOrSubtitle(node: unknown): boolean {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  return "heading" in record || "subtitle" in record;
}

/**
 * True for a node that renders no visible text of its own — carrying
 * neither a top-level `text` nor a nested `content` to read one from, and
 * not itself a `heading`/`subtitle`/`bibleLink` boundary — *and* that does
 * not itself carry `paragraph: true`. Skipped when looking for the real node
 * after a heading/subtitle run, the same way checks 3/4's own backward/
 * forward scans skip through a textless Strong's sibling
 * (`isTextlessStrongSibling`) rather than stopping there: a node that
 * renders zero characters isn't really "the thing after the heading" from a
 * reader's standpoint, so testing *it* for `paragraph: true` tests the wrong
 * node.
 *
 * Real YLT1898 case this exists for: 1 Corinthians 7:1's heading is
 * immediately followed by a chapter-summary `{foot: {...}}` node with no
 * `text` of its own (Young's own "Chapter VII. may be divided into five
 * parts…" note), and only *after* that does the verse's real
 * `{paragraph: true, text: "And concerning…"}` appear. Without this skip,
 * `next` would be the footnote-only node itself — never `paragraph: true`
 * by construction, since it carries no text for a paragraph flag to open —
 * producing a false finding on a run that is correctly flagged in the real
 * next visible node.
 *
 * **The `paragraph: true` exclusion is load-bearing, not defensive
 * padding.** Real KJV1769 Matthew 13:1 puts `{paragraph: true, strong:
 * "G1161"}` — a textless multi-word Strong's connector, the untranslated
 * half of a two-word Greek phrase rendered as one English word elsewhere —
 * directly after its heading, with the real visible text (`{text: "The
 * same", strong: "G1722"}`) only the node *after* that. The paragraph flag
 * genuinely lives on the textless node here; skipping straight past it
 * because it renders nothing would silently lose the very signal this check
 * exists to find, and flag a run that is already correctly marked. A node
 * with no visible text can still be the real paragraph boundary, so this
 * only ever skips a node that is both textless *and* not the boundary
 * itself.
 */
function skipsPastHeadingRun(node: unknown): boolean {
  const shape = describeNode(node);
  return !shape.isBoundary && shape.text === undefined && !shape.hasNestedContent && !shape.opensParagraph;
}

/** One heading/subtitle run whose own real next node fails to open a paragraph. */
export interface HeadingParagraphFinding {
  /** The book id this finding belongs to (e.g. `AMS`). */
  book: string;
  /** The chapter this run belongs to. */
  chapter: number;
  /** The verse this run belongs to. */
  verse: number;
  /** The collapsed run of one or more consecutive heading/subtitle nodes. */
  run: readonly unknown[];
  /** The node immediately after the run — the one that should have carried `paragraph: true` and didn't. */
  next: unknown;
  /** Where the offending node sits in the verse's own outermost content, so a fixer can reach it without rediscovering the run. */
  nextIndex: number;
}

/**
 * Every heading/subtitle run in one verse's own outermost content whose own
 * real next node fails to open a paragraph.
 *
 * Consecutive heading/subtitle nodes collapse into a single run before the
 * node after them is judged — real WEBUS2020 Psalm 90:1 shape (`heading` →
 * `subtitle` → real content) needs both boundary nodes treated as one:
 * checking each one's own literal next sibling separately would treat the
 * subtitle itself as the heading's own "next node" (never `paragraph:
 * true`) and produce a spurious finding, instead of judging the run as a
 * whole against the one real node that actually follows it.
 *
 * "The node right after the run" skips forward past any {@link
 * skipsPastHeadingRun} node before landing on `next` — real YLT1898 1
 * Corinthians 7:1 puts a footnote-only chapter-summary node between the
 * heading and the real, correctly-flagged paragraph text, and that
 * in-between node renders nothing a reader would ever see.
 *
 * Never recurses past a verse's own outermost array: a heading/subtitle
 * never occurs nested inside a `ContentNested` wrapper's own content or a
 * footnote body in this corpus. A run with nothing after it at all reports
 * nothing — there is no node for the convention to apply to.
 */
function findVerseHeadingParagraphMismatches(verse: VerseRecord): HeadingParagraphFinding[] {
  const nodes = asArray(verse.content);
  const findings: HeadingParagraphFinding[] = [];

  let at = 0;
  while (at < nodes.length) {
    if (!isHeadingOrSubtitle(nodes[at])) {
      at++;
      continue;
    }
    let end = at;
    while (end < nodes.length && isHeadingOrSubtitle(nodes[end])) end++;
    let nextIndex = end;
    while (nextIndex < nodes.length && skipsPastHeadingRun(nodes[nextIndex])) nextIndex++;

    if (nextIndex < nodes.length && !describeNode(nodes[nextIndex]).opensParagraph) {
      findings.push({
        book: verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
        run: nodes.slice(at, end),
        next: nodes[nextIndex],
        nextIndex,
      });
    }
    at = nextIndex + 1;
  }

  return findings;
}

/**
 * Every heading/subtitle-run finding across one whole book's own verses.
 *
 * The convention is flat and corpus-wide: a heading or subtitle followed by
 * anything that is not itself a heading or subtitle opens a paragraph, in
 * every version and every book. No per-book judgment, no evidence
 * gathering, no allowlist — a run either pairs or it is a finding.
 *
 * @param verses - One whole book's own verses, in their real on-disk order (matches {@link auditVersion}'s own per-file loop).
 */
export function findHeadingParagraphMismatches(
  verses: readonly VerseRecord[],
): HeadingParagraphFinding[] {
  return verses.flatMap(findVerseHeadingParagraphMismatches);
}

// ---------------------------------------------------------------------------
// Recursion — one array level, plus every node's own heading/subtitle/content/foot.content
// ---------------------------------------------------------------------------

/** Normalizes a single node or an already-array value into an array — several schema fields (e.g. `heading`, `foot.content`) may hold either shape. */
function asArray(content: unknown): unknown[] {
  return Array.isArray(content) ? content : [content];
}

/** All six checks' findings for one array level (and everything nested beneath it) — the shape {@link findStrongsNodeIssues} returns. */
interface LevelFindings {
  /** Check 1's findings. */
  unmergedPairs: PairFinding[];
  /** Check 2's findings — each entry is the offending node's own path (e.g. `content[3]`), not a full finding object. */
  trailingWhitespace: string[];
  /** Check 3's findings. */
  leadingPunctuation: LeadingPunctuationFinding[];
  /** Check 4's findings. */
  markBoundarySpaces: MarkBoundarySpaceFinding[];
  /** Check 5's finding for this verse, or `undefined` when its content doesn't start with whitespace — at most one per verse. */
  verseInitialSpace: VerseInitialSpaceFinding | undefined;
  /** Check 7's findings — each entry is the offending node's own path (e.g. `content[3]`), not a full finding object, matching Check 2's own shape. */
  fractionFindings: string[];
}

/**
 * Walk one array level and every node's own nested levels — `heading`,
 * `subtitle`, a `ContentNested` wrapper's own `content`, and a footnote
 * body's own `foot.content` — collecting all five per-node checks' findings
 * into `sink` as it goes.
 */
function walkLevel(
  nodes: readonly unknown[],
  where: string,
  sink: LevelFindings,
): void {
  sink.unmergedPairs.push(...scanArrayForUnmergedPairs(nodes, where));
  sink.leadingPunctuation.push(...scanArrayForLeadingPunctuation(nodes, where));
  sink.markBoundarySpaces.push(...scanArrayForMarkBoundarySpaces(nodes, where));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const shape = describeNode(node);
    if (hasTrailingWhitespace(shape))
      sink.trailingWhitespace.push(`${where}[${i}]`);
    if (hasUnnormalizedFraction(shape))
      sink.fractionFindings.push(`${where}[${i}]`);

    if (node === null || typeof node !== "object" || Array.isArray(node))
      continue;
    const record = node as Record<string, unknown>;

    if (record.heading !== undefined)
      walkLevel(asArray(record.heading), `${where}.heading`, sink);
    if (record.subtitle !== undefined)
      walkLevel(asArray(record.subtitle), `${where}.subtitle`, sink);
    if (
      record.heading === undefined &&
      record.subtitle === undefined &&
      record.bibleLink === undefined &&
      record.content !== undefined
    ) {
      walkLevel(asArray(record.content), `${where}.content`, sink);
    }
    const foot = record.foot as { content?: unknown } | undefined;
    if (foot?.content !== undefined)
      walkLevel(asArray(foot.content), `${where}.foot.content`, sink);
  }
}

/**
 * Walk one verse's whole content tree for checks 1-5 and 7 at once (six
 * checks total).
 *
 * Check 5 is not recursive like the other five — it only ever looks at this
 * verse's own outermost content, so it runs once here rather than inside
 * {@link walkLevel}. Check 6 ({@link findHeadingParagraphMismatches}) is not
 * included here at all — it needs a whole book's own verse sequence to
 * decide anything, not one verse in isolation, so it runs separately.
 *
 * @param content - A verse's own `content` value, any shape the schema permits.
 * @param where - The array level's own label, threaded through recursion; callers pass nothing and get `"content"`.
 */
export function findStrongsNodeIssues(
  content: Content,
  where = "content",
): LevelFindings {
  const sink: LevelFindings = {
    unmergedPairs: [],
    trailingWhitespace: [],
    leadingPunctuation: [],
    markBoundarySpaces: [],
    verseInitialSpace: checkVerseInitialSpace(content),
    fractionFindings: [],
  };
  walkLevel(asArray(content), where, sink);
  return sink;
}

// ---------------------------------------------------------------------------
// Disk scanning and CLI
// ---------------------------------------------------------------------------

/** One offending unmerged pair, with its file/verse identity attached. */
export interface UnmergedStrongPairFinding extends PairFinding {
  /** The version id this finding belongs to (e.g. `KJV1769`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `01-GEN.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `GEN`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** One node with trailing whitespace, with its file/verse identity attached. */
export interface StrongTrailingWhitespaceFinding {
  /** The version id this finding belongs to (e.g. `KJV1769`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `01-GEN.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `GEN`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
  /** The offending node's own path within the verse's content tree (e.g. `content[3]`). */
  path: string;
}

/** One node whose own text still carries an un-normalized fraction, with its file/verse identity attached. */
export interface FractionFinding {
  /** The version id this finding belongs to (e.g. `WEBUS2020`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `02-EXO.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `EXO`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
  /** The offending node's own path within the verse's content tree (e.g. `content[3]`). */
  path: string;
}

/** One misplaced-leading-punctuation node, with its file/verse identity attached. */
export interface StrongLeadingPunctuationFinding extends LeadingPunctuationFinding {
  /** The version id this finding belongs to (e.g. `KJV1769`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `01-GEN.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `GEN`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** One stranded joining-space finding, with its file/verse identity attached. */
export interface MarkBoundarySpaceFileFinding extends MarkBoundarySpaceFinding {
  /** The version id this finding belongs to (e.g. `KJV1769`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `01-GEN.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `GEN`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** One verse-initial-space finding, with its file/verse identity attached. */
export interface VerseInitialSpaceFileFinding extends VerseInitialSpaceFinding {
  /** The version id this finding belongs to (e.g. `KJV1769`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `01-GEN.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `GEN`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** Every verse-JSON file for one version id, sorted, excluding `_version.json` and any schema file. */
function verseFiles(version: string): string[] {
  return fs
    .readdirSync(path.join(BIBLE_VERSIONS_DIR, version))
    .filter((file) => VERSE_FILE_NAME.test(file))
    .sort();
}

/** One {@link HeadingParagraphFinding}, with its version/file identity attached — matches every other check's own file-finding wrapper. */
export interface HeadingParagraphFileFinding extends HeadingParagraphFinding {
  /** The version id this finding belongs to (e.g. `WEBUS2020`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `19-PSA.json`). */
  file: string;
}

/** One version's own audit: its id, and every finding {@link auditVersion} found, across all seven checks. */
export interface VersionAudit {
  /** The version id audited (e.g. `KJV1769`). */
  version: string;
  /** Check 1's findings, corpus-wide for this version. */
  unmergedPairs: readonly UnmergedStrongPairFinding[];
  /** Check 2's findings, corpus-wide for this version. */
  trailingWhitespace: readonly StrongTrailingWhitespaceFinding[];
  /** Check 3's findings, corpus-wide for this version. */
  leadingPunctuation: readonly StrongLeadingPunctuationFinding[];
  /** Check 4's findings, corpus-wide for this version. */
  markBoundarySpaces: readonly MarkBoundarySpaceFileFinding[];
  /** Check 5's findings, corpus-wide for this version. */
  verseInitialSpaces: readonly VerseInitialSpaceFileFinding[];
  /** Check 6's findings, corpus-wide for this version — a heading/subtitle run not immediately followed by a real paragraph start. */
  headingParagraphMismatches: readonly HeadingParagraphFileFinding[];
  /** Check 7's findings, corpus-wide for this version — a node whose own text still carries a fraction shape not yet normalized to this repo's own convention. */
  fractionFindings: readonly FractionFinding[];
}

/**
 * Audit one version's whole corpus, as it sits on disk right now — read-only,
 * writes nothing.
 *
 * @param version - A version id, matching its directory name under `bible-versions/` (e.g. `KJV1769`).
 */
export function auditVersion(version: string): VersionAudit {
  const unmergedPairs: UnmergedStrongPairFinding[] = [];
  const trailingWhitespace: StrongTrailingWhitespaceFinding[] = [];
  const leadingPunctuation: StrongLeadingPunctuationFinding[] = [];
  const markBoundarySpaces: MarkBoundarySpaceFileFinding[] = [];
  const verseInitialSpaces: VerseInitialSpaceFileFinding[] = [];
  const headingParagraphMismatches: HeadingParagraphFileFinding[] = [];
  const fractionFindings: FractionFinding[] = [];

  for (const file of verseFiles(version)) {
    const verses = JSON.parse(
      fs.readFileSync(path.join(BIBLE_VERSIONS_DIR, version, file), "utf8"),
    ) as VerseRecord[];

    for (const verse of verses) {
      const identity = {
        version,
        file,
        book: verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
      };
      const findings = findStrongsNodeIssues(verse.content);
      for (const pair of findings.unmergedPairs)
        unmergedPairs.push({ ...identity, ...pair });
      for (const at of findings.trailingWhitespace)
        trailingWhitespace.push({ ...identity, path: at });
      for (const finding of findings.leadingPunctuation)
        leadingPunctuation.push({ ...identity, ...finding });
      for (const finding of findings.markBoundarySpaces)
        markBoundarySpaces.push({ ...identity, ...finding });
      if (findings.verseInitialSpace)
        verseInitialSpaces.push({ ...identity, ...findings.verseInitialSpace });
      for (const at of findings.fractionFindings)
        fractionFindings.push({ ...identity, path: at });
    }

    for (const finding of findHeadingParagraphMismatches(verses))
      headingParagraphMismatches.push({ version, file, ...finding });
  }

  return {
    version,
    unmergedPairs,
    trailingWhitespace,
    leadingPunctuation,
    markBoundarySpaces,
    verseInitialSpaces,
    headingParagraphMismatches,
    fractionFindings,
  };
}

/**
 * Audit each named version, or every version directory under
 * `bible-versions/` when none are named — deliberately not a curated list
 * (see this module's own top doc comment): a version with no `strong`
 * values and no un-normalized fraction at all just reports zero findings
 * across all seven checks.
 *
 * @param versionIds - Versions to audit; defaults to {@link getVersionDirectories}.
 */
export function auditVersions(
  versionIds: readonly string[] = getVersionDirectories(),
): VersionAudit[] {
  return versionIds.map((version) => auditVersion(version));
}

/** The exit code this check should report — non-zero when any version carries any finding across any of the seven checks. */
export function exitCodeFor(summaries: readonly VersionAudit[]): number {
  return summaries.some(
    (summary) =>
      summary.unmergedPairs.length > 0 ||
      summary.trailingWhitespace.length > 0 ||
      summary.leadingPunctuation.length > 0 ||
      summary.markBoundarySpaces.length > 0 ||
      summary.verseInitialSpaces.length > 0 ||
      summary.headingParagraphMismatches.length > 0 ||
      summary.fractionFindings.length > 0,
  )
    ? 1
    : 0;
}

/**
 * Prints one version's own findings across all seven checks — the first `cap`
 * per check, or every one when `verbose`.
 *
 * Exported so `validate.ts` can render the same per-check breakdown inline in
 * its own report instead of maintaining a second copy of this formatting.
 */
export function printFindingLines(summary: VersionAudit, verbose: boolean): void {
  const cap = verbose ? Infinity : 10;

  console.log(
    `  ${summary.unmergedPairs.length} adjacent node pair(s) that should have merged into one strong-, foot-, or break-carrying node but didn't`,
  );
  for (const finding of summary.unmergedPairs.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} plain=${JSON.stringify(finding.plain)} target=${JSON.stringify(finding.target)}`,
    );
  }
  if (!verbose && summary.unmergedPairs.length > cap)
    console.log(
      `    … ${summary.unmergedPairs.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.trailingWhitespace.length} strong-carrying node(s) whose own text ends in trailing whitespace`,
  );
  for (const finding of summary.trailingWhitespace.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path}`,
    );
  }
  if (!verbose && summary.trailingWhitespace.length > cap)
    console.log(
      `    … ${summary.trailingWhitespace.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.leadingPunctuation.length} strong-carrying node(s) whose own text starts with punctuation glued to the wrong node`,
  );
  for (const finding of summary.leadingPunctuation.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} leading=${JSON.stringify(finding.leading)} node=${JSON.stringify(finding.node)} attachTo=${JSON.stringify(finding.attachTo)}`,
    );
  }
  if (!verbose && summary.leadingPunctuation.length > cap)
    console.log(
      `    … ${summary.leadingPunctuation.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.markBoundarySpaces.length} bare joining space(s) stranded between two same-formatting nodes instead of leading the second`,
  );
  for (const finding of summary.markBoundarySpaces.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} space=${JSON.stringify(finding.space)} target=${JSON.stringify(finding.target)}`,
    );
  }
  if (!verbose && summary.markBoundarySpaces.length > cap)
    console.log(
      `    … ${summary.markBoundarySpaces.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.verseInitialSpaces.length} verse(s) whose own content starts with a space`,
  );
  for (const finding of summary.verseInitialSpaces.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) first=${JSON.stringify(finding.first)} next=${JSON.stringify(finding.next)}`,
    );
  }
  if (!verbose && summary.verseInitialSpaces.length > cap)
    console.log(
      `    … ${summary.verseInitialSpaces.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.headingParagraphMismatches.length} heading/subtitle run(s) not immediately followed by a real paragraph start`,
  );
  for (const finding of summary.headingParagraphMismatches.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) run=${JSON.stringify(finding.run)} next=${JSON.stringify(finding.next)}`,
    );
  }
  if (!verbose && summary.headingParagraphMismatches.length > cap)
    console.log(
      `    … ${summary.headingParagraphMismatches.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.fractionFindings.length} node(s) whose own text still carries an un-normalized fraction`,
  );
  for (const finding of summary.fractionFindings.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path}`,
    );
  }
  if (!verbose && summary.fractionFindings.length > cap)
    console.log(
      `    … ${summary.fractionFindings.length - cap} more (--verbose to list all)`,
    );
}

/**
 * True when a version's audit found nothing across any of the seven checks —
 * printed as a single skipped line rather than an empty block, so a report
 * over every version on disk stays readable.
 *
 * Exported so `validate.ts` can reuse this same clean/dirty test rather than
 * re-deriving it from `VersionAudit`'s seven finding arrays itself.
 */
export function isClean(summary: VersionAudit): boolean {
  return (
    summary.unmergedPairs.length === 0 &&
    summary.trailingWhitespace.length === 0 &&
    summary.leadingPunctuation.length === 0 &&
    summary.markBoundarySpaces.length === 0 &&
    summary.verseInitialSpaces.length === 0 &&
    summary.headingParagraphMismatches.length === 0 &&
    summary.fractionFindings.length === 0
  );
}

/** Prints the whole report: every clean version collapsed into one line, then each version carrying any finding in full via {@link printFindingLines}. */
function printReport(
  summaries: readonly VersionAudit[],
  verbose: boolean,
): void {
  const clean = summaries.filter(isClean).map((summary) => summary.version);
  if (clean.length > 0)
    console.log(`Clean (no findings): ${clean.join(", ")}\n`);

  for (const summary of summaries) {
    if (isClean(summary)) continue;
    console.log(`${summary.version}:`);
    printFindingLines(summary, verbose);
    console.log("");
  }
}

/**
 * `npm run audit-nodes KJV1769 --verbose` (no `--` before the script's own
 * args) never reaches here as `--verbose` at all: npm's own CLI consumes
 * any `--flag` before a literal `--` separator as its *own* config (here,
 * `--loglevel verbose`) and forwards only `KJV1769` to `process.argv`. npm
 * does expose that consumed setting as the `npm_config_loglevel` env var,
 * so that's checked as a fallback alongside a literal `--verbose` (present
 * when run directly, via `ts-node`, or via `npm run ... -- --verbose`).
 */
function main(): void {
  const args = process.argv.slice(2);
  const verbose =
    args.includes("--verbose") ||
    /^(verbose|silly)$/.test(process.env.npm_config_loglevel ?? "");
  const versionIds = args.filter((arg) => arg !== "--verbose");

  const summaries = auditVersions(
    versionIds.length > 0 ? versionIds : undefined,
  );
  printReport(summaries, verbose);
  process.exit(exitCodeFor(summaries));
}

if (require.main === module) {
  main();
}
