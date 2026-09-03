/**
 * Corpus-wide sweep for ways a node's own placement can drift from this
 * repo's leading-vs-trailing-space convention, plus a few project-wide
 * content standards checked here so any version can be measured against them
 * however it was built. Each check's reasoning, and the real shape it exists
 * for, live on its own predicate or scanner below rather than being restated
 * here:
 *
 * 1. Unmerged node pairs — {@link scanArrayForUnmergedPairs}
 * 2. Trailing whitespace on a `strong`-carrying node — {@link hasTrailingWhitespace}
 * 3. Leading punctuation glued to the wrong side — {@link scanArrayForLeadingPunctuation}
 * 4. Mark-boundary spaces — {@link scanArrayForMarkBoundarySpaces}
 * 5. Verse-initial spaces — {@link checkVerseInitialSpace}
 * 6. Heading/subtitle not followed by a paragraph — {@link findHeadingParagraphMismatches}
 * 7. Un-normalized fraction — {@link hasUnnormalizedFraction}
 * 8. Footnote punctuation order — {@link scanArrayForFootnotePunctuationOrder}
 * 9. Mark-boundary embedded spaces — {@link scanArrayForMarkBoundaryEmbeddedSpaces}
 * 10. Un-normalized ellipsis — {@link hasUnnormalizedEllipsis}
 * 11. ASCII straight quote or apostrophe — {@link hasStraightQuote}
 * 11a. Misplaced Greek dialytika — {@link hasMisplacedDialytikaText}
 * 12. Footnote marker after whitespace — {@link scanArrayForFootnoteMarkerAfterWhitespace}
 * 13. Untagged script run — {@link hasUntaggedScriptRun}
 * 14. Duplicate footnote anchor — {@link scanArrayForDuplicateFootnoteAnchors}
 * 15. Mergeable siblings — {@link scanArrayForMergeableSiblings}
 * 16. Non-standard whitespace — {@link hasNonStandardWhitespace}
 *
 * Checks 5 and 6 look only at a verse's own outermost content — one is
 * defined as a verse-level convention, the other needs a whole book's verse
 * sequence to decide anything. Every other check recurses into `heading`,
 * `subtitle`, `foot.content`, and a `ContentNested` wrapper's own inner
 * array, so a future import that tags `strong` or `foot` inside a footnote is
 * covered by default.
 *
 * **Detection only.** Nothing here writes to `bible-versions/`, and this
 * module carries no `main()`, no argument parsing, and no npm script;
 * `utils/validate.ts` is the only caller. Nine of these checks do get
 * repaired — by transforms in `utils/fix*.ts` and `functions/` that
 * `validate.ts` runs in its own auto-fix pass, most of them importing their
 * eligibility from here rather than keeping a second copy of the judgment. A
 * reader looking for the fix half of a check should look there, not here.
 *
 * A general-purpose, version-controlled tool any future import can reach for,
 * rather than a one-off diagnostic scoped to whichever translation happens to
 * be mid-import at the time.
 */

import * as fs from "fs";
import * as path from "path";
import _ from "lodash";
import { getVersionDirectories } from "../functions/getBibleVersions";
import Content from "../types/Content";
import { normalizeFractionText } from "../functions/normalizeFractions";
import { hasEllipsisIndicator } from "../functions/normalizeEllipses";
import { hasMixedScriptText } from "../functions/tagScriptRunsInContent";
import { hasMisplacedDialytika } from "../functions/normalizeGreekDiacritics";

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

/** The normalized shape every check in this module reads instead of a raw content-tree node — produced once per node by {@link describeNode} and passed to every predicate/scanner below. */
export interface NodeShape {
  /** This node's own text, or `undefined` when it has no `text` key at all — a `{heading}`/`{subtitle}`/`{bibleLink}`/`{abbr}` wrapper, a `ContentNested` wrapper, or a multi-number tag's own textless sibling. */
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
  /** A footnote-only sibling that renders no *text* of its own — a bare `{foot: {...}}` node, or a not-yet-normalized `{text: "", foot: {...}}` husk (`utils/exportContent.ts`'s own `isTextlessFootnoteSibling`); a run of two or more riding one word is ordinary. **It still renders its own marker**, unlike {@link isTextlessStrongSibling}, so the two are interchangeable only when the question is which node's formatting must agree — never when the question is where characters or markers may land ({@link findFirstRenderedIndex}). */
  isTextlessFootSibling: boolean;
  /** Whether this node's own `paragraph` is `true`. */
  opensParagraph: boolean;
  /** Whether this node's own `break` is `true`. */
  endsBreak: boolean;
  /** A `{heading}`/`{subtitle}`/`{bibleLink}`/`{abbr}` wrapper, or any other non-plain-object shape — opaque to every check here, a hard boundary none of them cross. */
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
    isTextlessFootSibling: false,
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
  if (
    "heading" in record ||
    "subtitle" in record ||
    "bibleLink" in record ||
    "abbr" in record
  ) {
    return { ...empty, text: undefined, isBoundary: true };
  }

  const text = typeof record.text === "string" ? record.text : undefined;
  const strong = typeof record.strong === "string" ? record.strong : undefined;
  const hasNestedContent = "content" in record;
  const hasFoot = record.foot !== undefined && record.foot !== null;

  return {
    text,
    marks: Array.isArray(record.marks) ? record.marks : [],
    script: record.script,
    strong,
    hasFoot,
    hasNestedContent,
    isTextlessStrongSibling:
      text === undefined && strong !== undefined && !hasNestedContent,
    isTextlessFootSibling:
      (text === undefined || text === "") && hasFoot && !hasNestedContent,
    opensParagraph: record.paragraph === true,
    endsBreak: record.break === true,
    isBoundary: false,
  };
}

/** True when two nodes agree closely enough on `marks`/`script` that a mismatch could not be the reason they stayed split — the same "stays split, not nested" rule that keeps a small-caps divine name (`marks: ["sc"]`) split from an ordinary, unmarked connector word sitting beside it. */
export function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
  return (
    a.script === b.script &&
    a.marks.length === b.marks.length &&
    a.marks.every((mark, at) => mark === b.marks[at])
  );
}

/**
 * Real, non-blank, untagged, footnote-less, break-free text — the only shape
 * a merge (the unmerged-connector check) may treat as the "plain" half of a pair. `endsBreak` is
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
export function isRealAttachmentPoint(shape: NodeShape): boolean {
  return (
    !shape.isBoundary && shape.text !== undefined && shape.text.trim() !== ""
  );
}

/**
 * The first index at or after `from` whose node renders something — text of
 * its own, or a footnote marker of its own — or `undefined` when the array
 * runs out first. A caller holding whitespace or a marker asks for this slot
 * and places nothing beyond it: a marker's rendered position is defined by
 * which side of it the whitespace sits on, so moving either across a rendered
 * marker re-points that marker at a different word.
 *
 * This is *not* the question "which node's formatting must agree", which may
 * also walk past a textless footnote sibling, since a node with no text of
 * its own shows no marks anyone can see. Three call sites conflated the two
 * and each landed what it carried on the far side of a rendered marker —
 * hence one exported answer, the same reason {@link findWhitespaceSourceIndex}
 * is exported.
 *
 * The walk tests what a node renders rather than which {@link NodeShape} flag
 * is set: `isTextlessStrongSibling` is a near-match for "renders nothing",
 * not a definition of it, and a node satisfying it while also carrying a
 * `foot` renders its marker. No such node exists in the corpus today; the
 * `hasFoot` clause is here anyway, so that reading the flag alone cannot
 * repeat the same conflation one level further down.
 */
export function findFirstRenderedIndex(
  shapes: readonly NodeShape[],
  from: number,
): number | undefined {
  for (let at = from; at < shapes.length; at++) {
    const shape = shapes[at];
    if (!shape.isTextlessStrongSibling || shape.hasFoot) return at;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The unmerged-connector check — an ordinary connector word left un-merged beside a strong/foot/break-carrying neighbor
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
 * True when every node in a candidate run of consecutive mergeable connectors
 * should merge forward as a unit into `target`. `target` is eligible whenever
 * it carries a `strong` number, a `foot`, or a `break` — each is a suffix
 * attaching to the end of accumulated text, and is exactly why `target` had
 * to stay its own node; the connectors before it carry no such reason.
 *
 * `target.text !== undefined` is required in addition: checking
 * `strong`/`hasFoot`/`endsBreak` alone would accept a `ContentNested`
 * wrapper, which can carry `strong` with no top-level `text` for a
 * connector's own text to land in. The run's first member may carry
 * `opensParagraph`; a later one may not, since that marks a piece boundary
 * strictly inside the run.
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
 * Deliberately one-directional. A run of untagged connectors with nothing
 * suffix-carrying after it — the tail of a span, or of the verse — is never a
 * finding, however well it agrees in formatting with what precedes it.
 * Folding it *backward* would claim the preceding node's Strong's number
 * covers words it does not; the real defect there, when there is one, is a
 * missing tag on the connector, never a merge this check could recommend.
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
// The leading-punctuation check — leading punctuation glued to the wrong side of a strong-carrying node
// ---------------------------------------------------------------------------

/**
 * True for a character that is not a letter, not a digit, not whitespace,
 * not a dash, and not an *opening* mark (an opening bracket/parenthesis or
 * an initial quotation mark).
 *
 * Dashes (`Pd`) are excluded because this corpus deliberately glues a dash to
 * the *following* piece of a transliterated compound word with no space at
 * all. Opening marks (`Ps`/`Pi`) are excluded for the mirror reason: they
 * attach to whatever they introduce, the reverse of a *closing* mark
 * (`Pe`/`Pf`), which is this check's real target.
 */
function isTightPunctuationChar(ch: string): boolean {
  return !/[\p{L}\p{N}\s\p{Pd}\p{Ps}\p{Pi}]/u.test(ch);
}

/** Splits `text` at the boundary between its own leading run of {@link isTightPunctuationChar} characters and everything after — `undefined` when `text` does not start with one at all. */
export function leadingTightPunctuationSplit(
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
 * **A textless Strong's sibling in between is skipped over, not treated as a
 * boundary** — it renders zero characters, so the *visual* neighbor is
 * whatever precedes it, and the punctuation is glued to that word rather than
 * to the invisible sibling between them.
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
// The trailing-whitespace check — trailing whitespace on a strong-carrying node
// ---------------------------------------------------------------------------

/** True when a node carries a `strong` value and its own `text` ends in whitespace — the mirror image of the leading-punctuation check, and a violation of this corpus's leading-space convention (see the top of this file). */
function hasTrailingWhitespace(shape: NodeShape): boolean {
  return (
    shape.strong !== undefined &&
    shape.text !== undefined &&
    /\s$/.test(shape.text)
  );
}

// ---------------------------------------------------------------------------
// The fraction check — a node's own text still carrying an un-normalized fraction
// ---------------------------------------------------------------------------

/**
 * True when a node's own `text` still carries a real fraction shape
 * {@link normalizeFractionText} would rewrite — an ASCII `N/M` slash, a
 * precomposed vulgar-fraction glyph, or plain digits already separated by
 * U+2044 but not yet raised/lowered. Unlike every other check in this
 * module, this one has nothing to do with a node's placement relative to its
 * neighbors and applies to any text-bearing node, `strong`-carrying or not —
 * it's the same project-wide fraction convention the USFM importer applies
 * on the way in (`functions/normalizeFractions.ts`), reachable here so any
 * version's already-built content can be checked against it too.
 */
function hasUnnormalizedFraction(shape: NodeShape): boolean {
  return shape.text !== undefined && normalizeFractionText(shape.text).changes > 0;
}

// ---------------------------------------------------------------------------
// The ellipsis check — a node's own text still carrying an un-normalized ellipsis
// ---------------------------------------------------------------------------

/**
 * True when a node's own `text` still carries a dot run
 * {@link hasEllipsisIndicator} flags — everything the shipped ellipsis
 * auto-fix rewrites (`functions/normalizeEllipses.ts`), plus the one
 * two-period shape that rewriter deliberately never touches. Built on the
 * detector, not on `normalizeEllipsisText(shape.text).changes > 0`: the
 * rewriter reports no change for a two-period run by design, so a check
 * built on it could never report one either. This check reporting more than
 * the auto-fix rewrites is the detect/auto-fix/report split working as
 * intended, not a bug to reconcile — a future reader must not "align" the
 * two by narrowing this check to match the rewriter.
 */
function hasUnnormalizedEllipsis(shape: NodeShape): boolean {
  return shape.text !== undefined && hasEllipsisIndicator(shape.text);
}

// ---------------------------------------------------------------------------
// The straight-quote check — an ASCII straight quote or apostrophe in content text
// ---------------------------------------------------------------------------

/** The two ASCII characters this repo's punctuation convention never writes into prose content — a straight apostrophe and a straight double quote, each with a curly counterpart already in use corpus-wide (U+2018/U+2019, U+201C/U+201D). A backtick is deliberately absent: it has no legitimate prose use here at all, so it carries no direction to get right or wrong, and a version whose import introduces one belongs in that import's own script rather than in a corpus-wide convention check. */
const STRAIGHT_QUOTE = /['"]/;

/** How many characters of context this check prints on each side of the offending character in a finding's own excerpt — enough to see whether it opens a word, closes one, or sits mid-word, without dumping a node's entire text into a report line. */
const EXCERPT_RADIUS = 20;

/** One un-normalized ASCII straight-quote/apostrophe found within a single array level. */
interface StraightQuoteFinding {
  /** The offending node's own path within its verse (e.g. `content[3]`, `content.foot.content[1]`). */
  path: string;
  /** The single offending character — `'` or `"`. */
  character: string;
  /** A short excerpt of the node's own text centered on the offending character, marked with a leading and/or trailing `…` where it was truncated, so a reader can tell an apostrophe from an opening or closing quote without opening the file. */
  excerpt: string;
}

/**
 * True when a node's own `text` carries an ASCII `'` or `"`.
 *
 * Auto-fixed as its own step in `validate.ts`'s pass, via
 * `functions/normalizeStraightQuotes.ts`, which resolves each character's
 * direction from what surrounds it rather than treating `'` as always an
 * apostrophe. This detector stays on after that fixer exists for the same
 * reason the fraction and ellipsis checks keep theirs: it proves the fixer
 * reached a fixed point, and it still catches a finding on a version whose
 * text this corpus hasn't seen yet.
 */
function hasStraightQuote(shape: NodeShape): boolean {
  return shape.text !== undefined && STRAIGHT_QUOTE.test(shape.text);
}

/**
 * True when a node own text carries a Greek dialytika written after the
 * accent it belongs before, or left uncomposed.
 *
 * Both spellings look right on screen and neither matches the properly
 * spelled word, so a search, a diff, or a word alignment against another
 * edition treats the two as unrelated. Auto-fixed as its own step in
 * validate.ts pass, via functions/normalizeGreekDiacritics.ts; this detector
 * stays on for the same reason the fraction, ellipsis and straight-quote
 * checks keep theirs.
 */
function hasMisplacedDialytikaText(shape: NodeShape): boolean {
  return shape.text !== undefined && hasMisplacedDialytika(shape.text);
}

/**
 * Builds the report detail behind one straight-quote finding — which
 * character it was, and a short excerpt of the surrounding text — for a
 * node's own `text` already known to satisfy {@link hasStraightQuote}. Kept
 * separate from the predicate so the per-node loop below can test cheaply
 * with a boolean first, matching every other check in this module, and only
 * pay for building the excerpt on an actual finding.
 */
function describeStraightQuoteFinding(text: string, path: string): StraightQuoteFinding {
  const at = text.search(STRAIGHT_QUOTE);
  const character = text[at];
  const start = Math.max(0, at - EXCERPT_RADIUS);
  const end = Math.min(text.length, at + EXCERPT_RADIUS + 1);
  const excerpt = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  return { path, character, excerpt };
}

// ---------------------------------------------------------------------------
// The mark-boundary-space check — a bare joining space stranded between two same-formatting nodes
// ---------------------------------------------------------------------------

/**
 * True for a node whose own `text` is nonempty but entirely whitespace.
 *
 * A blank has no lexical content, so {@link isMergeableConnector} excludes it
 * — leaving a separate real shape uncovered: a Words-of-Christ or italics
 * span built one word at a time, with the joining space between each word
 * pulled out as its own node instead of leading the word that follows.
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
 * between two real, non-blank nodes that agree in `marks`/`script`, or where
 * one side's marks are a non-empty subset of the other's ({@link
 * isFormattingSubsetOf}) — either way not a genuine disagreement, so the
 * space carries no boundary meaning of its own. Its correct home is whichever
 * real side is the *smaller* mark set; see `fixMarkBoundarySpaces.ts`'s own
 * top doc comment for that direction rule and the fixer half.
 *
 * A run of textless Strong's or textless foot siblings after the space is
 * skipped through to find that real node, since such a sibling shows no marks
 * of its own and is therefore not a formatting boundary — without the skip,
 * an invisible sibling between two identically-marked words would read as a
 * disagreement purely for carrying no `marks` key.
 *
 * `endsBreak`/`opensParagraph` guard as they do elsewhere in this file: a
 * break on the space, or a paragraph opening on the target, is a real piece
 * boundary that formatting agreement cannot paper over. A footnote on the
 * *target* doesn't block a finding — the space has a safe home on its own
 * leading edge regardless. The two shapes that are settled rather than
 * findings are marked inline below.
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
    while (j < nodes.length && (shapes[j].isTextlessStrongSibling || shapes[j].isTextlessFootSibling)) j++;
    if (j >= nodes.length) continue;

    const target = shapes[j];
    if (!isRealAttachmentPoint(target) || target.opensParagraph) continue;

    const exact = agreesInFormatting(left, target);
    if (!exact && !isFormattingSubsetOf(left, target)) continue;

    /** Whether the blank's own home is `left` rather than `target` — a subset boundary whose smaller (wrapper) side sits first. Same name, same test, as the direction decision `fixMarkBoundarySpaces.ts` makes from this finding. */
    const wantsBackward = !exact && left.marks.length < target.marks.length;

    // Settled, not a finding: the blank's home is `left`, but appending it
    // there would violate the trailing-whitespace rule (`strong`) or
    // manufacture a footnote-marker-spacing finding (`foot`), while rolling
    // it onto `target` instead would bundle a plain joining space into that
    // side's *larger*, unrelated mark set. Neither direction is safe, and a
    // blank already tagged with the wrapper's own marks renders correctly
    // exactly where it sits.
    if (wantsBackward && (left.strong !== undefined || left.hasFoot)) {
      continue;
    }

    // Settled, not a finding: the only route to `target` runs past a
    // rendered footnote marker. The skip-through above answers the
    // formatting question and is right to walk past such a sibling, but it
    // is not where the blank's own characters could go — carrying them
    // across the marker decides whether it hugs the word before or after it,
    // and deleting the blank instead would fuse the two real words together.
    // Left alone it already renders as a marker with a word glued to each
    // side. Not a guard against a hypothetical: the footnote-marker-spacing
    // fixer's own extraction produces this shape in quantity. A `target`
    // carrying its own leading whitespace is deliberately not exempt — that
    // is the marker-with-whitespace-on-both-sides case, resolved by dropping
    // the blank, with no crossing involved.
    if (
      !wantsBackward &&
      !/^\s/.test(target.text as string) &&
      findFirstRenderedIndex(shapes, i + 1) !== j
    ) {
      continue;
    }

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
// The verse-initial-space check — a verse whose own content starts with a space
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
 * Looks only at a verse's own outermost content array — never a
 * `ContentNested` wrapper's inner array, where a leading space is an ordinary
 * mid-sentence insertion, and never past a `heading`/`subtitle` boundary.
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
// The heading-paragraph check — a heading/subtitle run not immediately followed by a paragraph start
// ---------------------------------------------------------------------------

/** True for a `{heading: ...}` or `{subtitle: ...}` wrapper — the two boundary shapes this check collapses into one run before looking at what comes after. */
function isHeadingOrSubtitle(node: unknown): boolean {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  return "heading" in record || "subtitle" in record;
}

/**
 * True for a node that renders no visible text — no top-level `text`, no
 * nested `content`, not itself a boundary — and that doesn't carry
 * `paragraph: true`. Skipped when looking for the real node after a
 * heading/subtitle run: a node rendering zero characters isn't "the thing
 * after the heading" from a reader's standpoint, so testing *it* for
 * `paragraph: true` tests the wrong node and reports a false finding on a run
 * that is correctly written.
 *
 * **The `paragraph: true` exclusion is load-bearing, not defensive padding.**
 * A textless connector carrying the flag does occur directly after a heading,
 * with the real visible text only on the node after that. Skipping past it
 * because it renders nothing would lose the very signal this check looks for.
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
 * node after them is judged. A heading followed by a subtitle followed by
 * real content is an ordinary shape, and checking each boundary node's own
 * literal next sibling separately would treat the subtitle as the heading's
 * "next node" — never `paragraph: true` — and report a spurious finding.
 *
 * "The node right after the run" skips forward past any {@link
 * skipsPastHeadingRun} node before landing on `next`.
 *
 * Never recurses past a verse's own outermost array: this is a verse-level
 * convention, not one that reaches into nested content. A run with nothing
 * after it reports nothing — there is no node for the convention to apply to.
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
// The footnote-punctuation-order check — a footnote marker rendering before punctuation that belongs to the same span
// ---------------------------------------------------------------------------

/** One misplaced-footnote-marker finding within a single array level. */
interface FootnotePunctuationOrderFinding {
  /** The array level this was found in. */
  where: string;
  /** The foot-carrying node whose own marker renders before punctuation that belongs to the same span. */
  node: unknown;
  /** The leading run of tight-punctuation characters on `next` that the footnote marker should have rendered after instead of before. */
  leading: string;
  /** The real sibling immediately after `node` (skipping any textless Strong's sibling in between) whose own text starts with `leading`. */
  next: unknown;
}

/**
 * Scan one array level for a `foot`-carrying, text-bearing node immediately
 * followed by a real sibling whose own text starts with tight punctuation
 * ({@link leadingTightPunctuationSplit}, the leading-punctuation check's own
 * definition, reused verbatim). Rendered, the marker lands before punctuation
 * it should have followed, since `utils/exportContent.ts`'s renderer always
 * places a node's marker after that node's own full text — which also bounds
 * this check's scope: punctuation embedded in the *footed* node's own text is
 * invisible to it, because it only ever inspects the node *after* the footed
 * one.
 *
 * The offending punctuation need not be `next`'s entire text; a leading run
 * with real content continuing after it is enough, which is why the split is
 * reused rather than a whole-string test. A footed node with no `text` of its
 * own never fires, and the remaining guards mirror the leading-punctuation
 * check's: a textless Strong's sibling in between is skipped through, and
 * `next` opening a paragraph is a piece boundary a marker cannot cross.
 */
function scanArrayForFootnotePunctuationOrder(
  nodes: readonly unknown[],
  where: string,
): FootnotePunctuationOrderFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: FootnotePunctuationOrderFinding[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const shape = shapes[i];
    if (!shape.hasFoot || shape.text === undefined || shape.text.length === 0) continue;

    let j = i + 1;
    while (j < nodes.length && shapes[j].isTextlessStrongSibling) j++;
    if (j >= nodes.length) continue;

    const next = shapes[j];
    if (!isRealAttachmentPoint(next) || next.opensParagraph || next.text === undefined) continue;

    const split = leadingTightPunctuationSplit(next.text);
    if (split === undefined) continue;

    findings.push({ where, node: nodes[i], leading: split.before, next: nodes[j] });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The mark-boundary-embedded-space check — a mark-boundary space embedded inside a node's own text at a boundary where the two real sides disagree
// ---------------------------------------------------------------------------

/**
 * True when a node's own `marks`/`script` are non-empty — the gate the
 * mark-boundary-embedded-space check needs, since only a node that itself
 * carries formatting can wrongly extend it onto an adjacent,
 * differently-formatted node's own joining space.
 *
 * One-directional on purpose. Where a marked node and an unmarked node meet,
 * the marked node's own leading or trailing space is a finding and the
 * unmarked node's is not: there is nothing on the unmarked side for the space
 * to wrongly extend. A symmetric "the two sides disagree" rule would flag
 * both, and future readers should re-read that asymmetry before "fixing" it.
 */
export function carriesFormatting(shape: NodeShape): boolean {
  return shape.marks.length > 0 || shape.script !== undefined;
}

/**
 * True when two nodes share the same script and one's marks are a non-empty
 * subset of the other's — a nesting relationship, not a disagreement. The
 * real shape is a Words-of-Christ span bordering a translator-supplied word
 * that is also part of that discourse, so the supplied word carries `woc`
 * plus one more mark; `exportContent.ts` renders either ordering identically,
 * so nothing hinges on which side is "outer".
 *
 * Deliberately not folded into {@link agreesInFormatting}: the
 * unmerged-connector and leading-punctuation checks want that function's
 * exact equality, and no real corpus case has asked them for this leniency,
 * so widening it there would be a larger blast radius than either has earned.
 * Do not generalize this.
 */
function isFormattingSubsetOf(a: NodeShape, b: NodeShape): boolean {
  if (a.script !== b.script) return false;
  const [smaller, larger] = a.marks.length <= b.marks.length ? [a.marks, b.marks] : [b.marks, a.marks];
  return smaller.length > 0 && smaller.every((mark) => larger.includes(mark));
}

/** One mark-boundary-embedded-space finding within a single array level. */
interface MarkBoundaryEmbeddedSpaceFinding {
  /** The array level this was found in. */
  where: string;
  /** `"leading"` when `node`'s own text starts with the misplaced space; `"trailing"` when it ends with it. */
  side: "leading" | "trailing";
  /** The node whose own non-empty `marks`/`script` don't match `neighbor`'s, yet whose own text carries a leading/trailing space reaching across that boundary anyway. */
  node: unknown;
  /** The real node immediately across the space (predecessor for a leading space, successor for a trailing space; skipping any textless Strong's sibling in between) the space should belong to instead. */
  neighbor: unknown;
}

/**
 * Scan one array level for a node whose own `marks`/`script` are non-empty
 * and whose own `text` starts or ends with a whitespace character that
 * disagrees in formatting (see {@link agreesInFormatting}) with the real
 * node immediately across that boundary — the space should belong on the
 * *other*, agreeing node's own leading/trailing edge instead, not embedded
 * inside the marked node's own text.
 *
 * Asymmetric by design (see {@link carriesFormatting}) and lenient toward a
 * strict formatting subset (see {@link isFormattingSubsetOf}), which is why
 * both guards below test that alongside `agreesInFormatting`.
 *
 * Distinct from {@link scanArrayForMarkBoundarySpaces}: that check catches a
 * *standalone* whitespace-only node between two agreeing real nodes; this one
 * catches whitespace *embedded* inside an otherwise-real node's own text at a
 * boundary where the two real sides *disagree*.
 *
 * Both directions reuse the guards established elsewhere in this file: a
 * textless Strong's sibling in between is skipped through rather than treated
 * as a boundary, and a `break` or `paragraph`-opening neighbor is a piece
 * boundary a stray embedded space cannot cross.
 */
function scanArrayForMarkBoundaryEmbeddedSpaces(
  nodes: readonly unknown[],
  where: string,
): MarkBoundaryEmbeddedSpaceFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: MarkBoundaryEmbeddedSpaceFinding[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const shape = shapes[i];
    if (shape.text === undefined || shape.text.trim() === "" || !carriesFormatting(shape)) continue;

    if (/^\s/.test(shape.text) && !shape.opensParagraph) {
      let j = i - 1;
      while (j >= 0 && shapes[j].isTextlessStrongSibling) j--;
      if (j >= 0) {
        const neighbor = shapes[j];
        if (
          isRealAttachmentPoint(neighbor) &&
          !neighbor.endsBreak &&
          !agreesInFormatting(shape, neighbor) &&
          !isFormattingSubsetOf(shape, neighbor)
        ) {
          findings.push({ where, side: "leading", node: nodes[i], neighbor: nodes[j] });
        }
      }
    }

    if (/\s$/.test(shape.text) && !shape.endsBreak) {
      let j = i + 1;
      while (j < nodes.length && shapes[j].isTextlessStrongSibling) j++;
      if (j < nodes.length) {
        const neighbor = shapes[j];
        if (
          isRealAttachmentPoint(neighbor) &&
          !neighbor.opensParagraph &&
          !agreesInFormatting(shape, neighbor) &&
          !isFormattingSubsetOf(shape, neighbor)
        ) {
          findings.push({ where, side: "trailing", node: nodes[i], neighbor: nodes[j] });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The footnote-marker-spacing check — a footnote marker rendering immediately after whitespace
// ---------------------------------------------------------------------------

/**
 * Walks backward from `at` (inclusive) through every node contributing no
 * rendered characters of its own to find the node whose trailing text a
 * footnote marker at index `at` actually renders immediately after. A node's
 * marker always renders after that node's own full text, so a node with real
 * text is its own answer; a bare `{foot: {...}}` anchor or a `{text: ""}`
 * husk renders nothing, so its marker follows whatever the nearest real text
 * before it left behind.
 *
 * Returns that index only when the text found ends in whitespace, so
 * `undefined` covers three cases: nothing before `at` contributes any text,
 * the nearest real text ends in a word rather than a joining space, or a
 * `ContentNested` wrapper blocks the walk — this array level cannot see such
 * a wrapper's last rendered character, the same boundary drawn for it
 * everywhere else in this file.
 *
 * Exported so {@link scanArrayForFootnoteMarkerAfterWhitespace} and its fixer
 * share one answer to where the whitespace actually lives; the fixer needs
 * the source node's index to strip the run from, not just a boolean.
 */
export function findWhitespaceSourceIndex(
  shapes: readonly NodeShape[],
  at: number,
): number | undefined {
  for (let i = at; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.hasNestedContent) return undefined;
    if (shape.text === undefined || shape.text === "") continue;
    return /\s$/.test(shape.text) ? i : undefined;
  }
  return undefined;
}

/** One footnote-marker-after-whitespace finding within a single array level. */
interface FootnoteMarkerAfterWhitespaceFinding {
  /** The array level this was found in. */
  where: string;
  /** The `foot`-carrying node whose own marker renders immediately after whitespace — either its own trailing edge, or (for a node rendering no text of its own) an earlier node's trailing edge, per {@link findWhitespaceSourceIndex}. */
  node: unknown;
  /** The real node immediately after `node`, skipping any textless Strong's or textless foot sibling in between, the joining space should relocate onto — `undefined` when `node` sits at the end of its own array level, with nothing to relocate onto. */
  next: unknown;
}

/**
 * Scan one array level for a `foot`-carrying node whose marker renders
 * immediately after whitespace — the leading-space convention the
 * trailing-whitespace check enforces for `strong`, extended to `foot`. The
 * marker ends up hard against the word that follows instead of hugging the
 * word it annotates.
 *
 * A node whose own `text` ends in whitespace is the ordinary case, but a
 * node rendering no text of its own still renders its marker, immediately
 * after whatever the accumulated visible text already ends in; {@link
 * findWhitespaceSourceIndex} is the backward walk that answers this.
 *
 * **A bare `{foot: {...}}` node — no `text` key at all — is exempt once a
 * real next attachment point genuinely follows it**, skipping any run of
 * textless siblings in between and regardless of what its own `foot` says.
 * Such a node already sits in its final, settled shape, which is exactly what
 * `fixFootnoteMarkerSpacing.ts` produces when it splits a combined node
 * apart. **Not exempt when nothing real follows**: a textless anchor at the
 * true end of a verse has nothing to have settled into place alongside, so it
 * stays a finding and its predecessor's dangling trailing whitespace still
 * gets caught.
 *
 * A `hasNestedContent` node is never a finding: whether *its* marker renders
 * after whitespace depends on its nested content's last rendered character,
 * invisible from this array level.
 */
function scanArrayForFootnoteMarkerAfterWhitespace(
  nodes: readonly unknown[],
  where: string,
): FootnoteMarkerAfterWhitespaceFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: FootnoteMarkerAfterWhitespaceFinding[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const shape = shapes[i];
    if (!shape.hasFoot || shape.hasNestedContent) continue;

    let j = i + 1;
    while (j < nodes.length && (shapes[j].isTextlessStrongSibling || shapes[j].isTextlessFootSibling)) j++;
    const next = j < nodes.length ? shapes[j] : undefined;

    if (shape.text === undefined && next !== undefined && isRealAttachmentPoint(next)) continue;
    if (findWhitespaceSourceIndex(shapes, i) === undefined) continue;

    findings.push({ where, node: nodes[i], next: j < nodes.length ? nodes[j] : undefined });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The script-run check — a non-Latin letter embedded in Latin text with no script tag
// ---------------------------------------------------------------------------

/**
 * True when a node's own `text` mixes a Latin letter with a Hebrew or Greek
 * letter and the node carries no `script` tag of its own. Built on {@link
 * hasMixedScriptText} rather than a second copy of the Unicode-range
 * matching, the same "one convention, one function" discipline the fraction
 * and ellipsis checks follow.
 *
 * **Not about headings, and not about acrostics.** Tagging a non-Latin letter
 * was first motivated by acrostic-stanza headings, but the rule applies
 * anywhere in the tree a string carries mixed script, a footnote's own prose
 * included — which is where the real corpus violations live.
 *
 * A `script` already present short-circuits the test: an already-tagged node
 * is correct whatever its text contains, and this check never second-guesses
 * a tag already applied.
 */
function hasUntaggedScriptRun(shape: NodeShape): boolean {
  return (
    shape.text !== undefined &&
    shape.script === undefined &&
    hasMixedScriptText(shape.text)
  );
}

// ---------------------------------------------------------------------------
// The duplicate-footnote-anchor check — a textless node repeating its predecessor's own footnote
// ---------------------------------------------------------------------------

/** A node's own raw `foot` value, or `undefined` when it isn't a plain object or carries none — the byte-for-byte comparison the duplicate-footnote-anchor check needs, which {@link NodeShape} doesn't carry (it only ever exposes `hasFoot`, a boolean). */
function footValueOf(node: unknown): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node))
    return undefined;
  return (node as Record<string, unknown>).foot;
}

/**
 * True when `candidate` renders no visible text of its own and its `foot` is
 * byte-for-byte identical to `target`'s. Exported so {@link
 * scanArrayForDuplicateFootnoteAnchors} and `utils/fixDuplicateFootnoteAnchors.ts`
 * share one answer rather than the fixer re-deriving it.
 *
 * "Renders no visible text" means no `text` key at all *or* `text: ""`, since
 * the husk renders exactly as little as a bare anchor. A `hasNestedContent`
 * node is excluded outright: whether *it* renders anything depends on its
 * nested content, invisible from this array level.
 *
 * Deep-equality (`lodash`'s `isEqual`), not `===`: two `foot` objects built
 * from the same source apparatus note are equal in value but never the same
 * reference once the JSON has round-tripped through `JSON.parse`.
 */
export function isDuplicateFootnoteAnchor(
  candidate: unknown,
  candidateShape: NodeShape,
  target: unknown,
  targetShape: NodeShape,
): boolean {
  return (
    !candidateShape.hasNestedContent &&
    (candidateShape.text === undefined || candidateShape.text === "") &&
    candidateShape.hasFoot &&
    targetShape.hasFoot &&
    _.isEqual(footValueOf(candidate), footValueOf(target))
  );
}

/** One duplicate-footnote-anchor finding within a single array level. */
interface DuplicateFootnoteAnchorFinding {
  /** The array level this was found in. */
  where: string;
  /** The later, textless node whose own `foot` is pure repetition and should be deleted. */
  node: unknown;
  /** The earlier, real node this anchor's own `foot` byte-for-byte repeats. */
  target: unknown;
}

/**
 * Scan one array level for a node that renders no visible text of its own and
 * whose `foot` byte-for-byte repeats the nearest node before it that wasn't
 * itself already flagged for deletion. Where three consecutive nodes share
 * one apparatus note — the first attached to real text, the next two bare
 * anchors — both bare nodes are findings, each compared against that first
 * real node rather than against a duplicate already on its way out.
 *
 * **Tight on purpose.** Two adjacent siblings sharing a byte-identical `foot`
 * are usually the same note correctly annotating two separate occurrences of
 * the same word, each on its own text-bearing node. What tells a genuine
 * duplicate apart is exactly whether the later node renders anything: a node
 * with real text is never a finding here, however many siblings share its
 * `foot`.
 *
 * A byte-identical `foot` is required, not merely a matching `type`. Two
 * adjacent textless anchors carrying genuinely different apparatus entries
 * are each their own note, and neither is a finding.
 */
function scanArrayForDuplicateFootnoteAnchors(
  nodes: readonly unknown[],
  where: string,
): DuplicateFootnoteAnchorFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: DuplicateFootnoteAnchorFinding[] = [];

  let lastKept = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (
      lastKept >= 0 &&
      isDuplicateFootnoteAnchor(nodes[i], shapes[i], nodes[lastKept], shapes[lastKept])
    ) {
      findings.push({ where, node: nodes[i], target: nodes[lastKept] });
      continue; // not kept — the next node still compares against lastKept
    }
    lastKept = i;
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The mergeable-sibling check — adjacent siblings that differ in nothing but their own text
// ---------------------------------------------------------------------------

/** The only two keys, besides `text` itself, the mergeable-sibling merge tolerates on either side of a pair. The merge already requires the two nodes to agree on `marks`/`script` ({@link agreesInFormatting}); any other key ties a different kind of information to one specific tag occurrence, and merging the node away would either lose that information or have to guess which side keeps it. */
const MERGEABLE_EXTRA_KEYS = new Set(["marks", "script"]);

/**
 * True when `node` renders real text of its own and carries nothing beyond
 * that but `marks`/`script`. A bare string trivially qualifies, and a
 * `{text}`-only object qualifies identically. Any other property disqualifies
 * it; see {@link MERGEABLE_EXTRA_KEYS} for why.
 *
 * Takes the raw `node` as well as its `shape` because {@link NodeShape}
 * exposes only a named subset of a node's properties, not its full key set,
 * so a node carrying `lemma` or `morph` with no `strong` — legal per the
 * schema, absent from this corpus today — needs a real answer rather than an
 * assumption. Reusing `shape.text` then excludes every boundary shape for
 * free, since {@link describeNode} already reads all four as `text:
 * undefined`.
 */
export function isMergeableTextNode(node: unknown, shape: NodeShape): boolean {
  if (shape.text === undefined) return false;
  if (typeof node === "string") return true;
  if (node === null || typeof node !== "object" || Array.isArray(node)) return false;
  return Object.keys(node as Record<string, unknown>).every(
    (key) => key === "text" || MERGEABLE_EXTRA_KEYS.has(key),
  );
}

/** One mergeable-sibling-pair finding within a single array level. */
interface MergeableSiblingsFinding {
  /** The array level this pair was found in. */
  where: string;
  /** The earlier of the two nodes — the one a fixer's own merge keeps and extends. */
  first: unknown;
  /** The later of the two nodes — the one a fixer's own merge folds into `first` and removes. */
  second: unknown;
}

/**
 * Scan one array level for two adjacent nodes that are each {@link
 * isMergeableTextNode} and agree with each other in `marks`/`script` — left
 * split for no reason a reader could name, structural residue rather than a
 * lost mark.
 *
 * **Distinct from the unmerged-connector and mark-boundary-space checks, not
 * a re-derivation of either.** Those cover an untagged connector beside a
 * *tagged* neighbor, and a *blank* whitespace-only node between two agreeing
 * real nodes. Neither covers two adjacent *plain* nodes carrying real text on
 * both sides, which is exactly why these pairs survive corpus-wide today.
 *
 * One finding per adjacent pair, not one per run, so a three-node chain
 * reports two findings — the same per-pair convention the other scanners
 * here use. The fixer is what folds a whole chain into a single node.
 */
function scanArrayForMergeableSiblings(
  nodes: readonly unknown[],
  where: string,
): MergeableSiblingsFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: MergeableSiblingsFinding[] = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    if (!isMergeableTextNode(nodes[i], shapes[i])) continue;
    if (!isMergeableTextNode(nodes[i + 1], shapes[i + 1])) continue;
    if (!agreesInFormatting(shapes[i], shapes[i + 1])) continue;

    findings.push({ where, first: nodes[i], second: nodes[i + 1] });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The non-standard-whitespace check — a non-standard whitespace character in content text
// ---------------------------------------------------------------------------

/** Every whitespace-shaped character this repo's content convention never writes into prose — a non-breaking space, the Unicode General-Punctuation space-separator run, a narrow/medium-mathematical/ideographic space, a word joiner or zero-width no-break space, a tab, or a bare carriage return/line feed. An ordinary ASCII space is deliberately absent: it is this corpus's only sanctioned whitespace character. Written entirely as `\u` escapes rather than the invisible or look-alike characters themselves, so every targeted codepoint stays legible in source. */
const NON_STANDARD_WHITESPACE =
  /[\u00A0\u1680\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF\t\r\n]/;

/** One non-standard whitespace character found within a single array level. */
interface NonStandardWhitespaceFinding {
  /** The offending node's own path within its verse (e.g. `content[3]`, `content.foot.content[1]`). */
  path: string;
  /** The offending character's own Unicode code point, printed as `U+00A0` rather than the invisible character itself, so a report line stays legible on its own. */
  codePoint: string;
  /** A short excerpt of the node's own text centered on the offending character, marked with a leading and/or trailing `…` where it was truncated — same radius and shape as {@link describeStraightQuoteFinding}'s own excerpt, so a reader can tell a genuine word-joining non-breaking space from import noise without opening the file. */
  excerpt: string;
}

/**
 * True when a node's own `text` carries a whitespace character this
 * corpus's content convention never writes — a non-breaking space, an
 * exotic Unicode space, a zero-width/joining control, a tab, or a bare
 * newline.
 *
 * **Report-only, permanently.** Replacing a non-breaking space needs to know
 * whether the source meant it to hold two words together — where collapsing
 * it would let the halves wrap apart on a narrow screen — or whether it is
 * import noise. Unlike a straight quote's direction ({@link
 * hasStraightQuote}), no adjacency or positional pattern decides it; every
 * occurrence needs a person to read the surrounding words.
 */
function hasNonStandardWhitespace(shape: NodeShape): boolean {
  return shape.text !== undefined && NON_STANDARD_WHITESPACE.test(shape.text);
}

/**
 * Builds the report detail behind one non-standard-whitespace finding —
 * which code point it was, and a short excerpt of the surrounding text — for
 * a node's own `text` already known to satisfy {@link
 * hasNonStandardWhitespace}. Kept separate from the predicate for the same
 * reason {@link describeStraightQuoteFinding} is.
 */
function describeNonStandardWhitespaceFinding(text: string, path: string): NonStandardWhitespaceFinding {
  const at = text.search(NON_STANDARD_WHITESPACE);
  const character = text[at];
  const codePoint = `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
  const start = Math.max(0, at - EXCERPT_RADIUS);
  const end = Math.min(text.length, at + EXCERPT_RADIUS + 1);
  const excerpt = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  return { path, codePoint, excerpt };
}

// ---------------------------------------------------------------------------
// Recursion — one array level, plus every node's own heading/subtitle/content/foot.content
// ---------------------------------------------------------------------------

/** Normalizes a single node or an already-array value into an array — several schema fields (e.g. `heading`, `foot.content`) may hold either shape. */
function asArray(content: unknown): unknown[] {
  return Array.isArray(content) ? content : [content];
}

/** Every check findable within one array level (and everything nested beneath it) except the heading-paragraph check — the shape {@link findStrongsNodeIssues} returns. The heading-paragraph check needs a whole book's own verse sequence and is never part of this shape; see {@link findStrongsNodeIssues}'s own doc comment. */
interface LevelFindings {
  /** The unmerged-connector check's findings. */
  unmergedPairs: PairFinding[];
  /** The duplicate-footnote-anchor check's findings. */
  duplicateFootnoteAnchors: DuplicateFootnoteAnchorFinding[];
  /** The trailing-whitespace check's findings — each entry is the offending node's own path (e.g. `content[3]`), not a full finding object. */
  trailingWhitespace: string[];
  /** The leading-punctuation check's findings. */
  leadingPunctuation: LeadingPunctuationFinding[];
  /** The mark-boundary-space check's findings. */
  markBoundarySpaces: MarkBoundarySpaceFinding[];
  /** The verse-initial-space check's finding for this verse, or `undefined` when its content doesn't start with whitespace — at most one per verse. */
  verseInitialSpace: VerseInitialSpaceFinding | undefined;
  /** The fraction check's findings — each entry is the offending node's own path, not a full finding object. */
  fractionFindings: string[];
  /** The footnote-punctuation-order check's findings. */
  footnotePunctuationOrder: FootnotePunctuationOrderFinding[];
  /** The mark-boundary-embedded-space check's findings. */
  markBoundaryEmbeddedSpaces: MarkBoundaryEmbeddedSpaceFinding[];
  /** The ellipsis check's findings — each entry is the offending node's own path, not a full finding object. */
  ellipsisFindings: string[];
  /** The straight-quote check's findings. */
  straightQuoteFindings: StraightQuoteFinding[];
  dialytikaFindings: string[];
  /** The footnote-marker-spacing check's findings. */
  footnoteMarkerAfterWhitespace: FootnoteMarkerAfterWhitespaceFinding[];
  /** The script-run check's findings — each entry is the offending node's own path, not a full finding object. */
  untaggedScriptRuns: string[];
  /** The mergeable-sibling check's findings. */
  mergeableSiblingPairs: MergeableSiblingsFinding[];
  /** The non-standard-whitespace check's findings. */
  nonStandardWhitespaceFindings: NonStandardWhitespaceFinding[];
}

/**
 * Walk one array level and every node's own nested levels — `heading`,
 * `subtitle`, a `{paragraph: <content>}` wrapper, a `ContentNested`
 * wrapper's own `content`, and a footnote body's own `foot.content` —
 * collecting all fourteen of the checks findable this way (every check in
 * {@link LevelFindings} except the verse-initial-space check, which only ever looks at a verse's
 * own outermost content) into `sink` as it goes.
 */
function walkLevel(
  nodes: readonly unknown[],
  where: string,
  sink: LevelFindings,
): void {
  sink.unmergedPairs.push(...scanArrayForUnmergedPairs(nodes, where));
  sink.leadingPunctuation.push(...scanArrayForLeadingPunctuation(nodes, where));
  sink.markBoundarySpaces.push(...scanArrayForMarkBoundarySpaces(nodes, where));
  sink.footnotePunctuationOrder.push(...scanArrayForFootnotePunctuationOrder(nodes, where));
  sink.markBoundaryEmbeddedSpaces.push(...scanArrayForMarkBoundaryEmbeddedSpaces(nodes, where));
  sink.footnoteMarkerAfterWhitespace.push(...scanArrayForFootnoteMarkerAfterWhitespace(nodes, where));
  sink.duplicateFootnoteAnchors.push(...scanArrayForDuplicateFootnoteAnchors(nodes, where));
  sink.mergeableSiblingPairs.push(...scanArrayForMergeableSiblings(nodes, where));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const shape = describeNode(node);
    if (hasTrailingWhitespace(shape))
      sink.trailingWhitespace.push(`${where}[${i}]`);
    if (hasUnnormalizedFraction(shape))
      sink.fractionFindings.push(`${where}[${i}]`);
    if (hasUnnormalizedEllipsis(shape))
      sink.ellipsisFindings.push(`${where}[${i}]`);
    if (shape.text !== undefined && hasStraightQuote(shape))
      sink.straightQuoteFindings.push(
        describeStraightQuoteFinding(shape.text, `${where}[${i}]`),
      );
    if (hasMisplacedDialytikaText(shape))
      sink.dialytikaFindings.push(`${where}[${i}]`);
    if (hasUntaggedScriptRun(shape))
      sink.untaggedScriptRuns.push(`${where}[${i}]`);
    if (shape.text !== undefined && hasNonStandardWhitespace(shape))
      sink.nonStandardWhitespaceFindings.push(
        describeNonStandardWhitespaceFinding(shape.text, `${where}[${i}]`),
      );

    if (node === null || typeof node !== "object" || Array.isArray(node))
      continue;
    const record = node as Record<string, unknown>;

    if (record.heading !== undefined)
      walkLevel(asArray(record.heading), `${where}.heading`, sink);
    if (record.subtitle !== undefined)
      walkLevel(asArray(record.subtitle), `${where}.subtitle`, sink);
    if (record.paragraph !== undefined && typeof record.paragraph !== "boolean")
      walkLevel(asArray(record.paragraph), `${where}.paragraph`, sink);
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
 * Walk one verse's whole content tree for every check but two. The
 * heading-paragraph check is absent entirely, since it needs a whole book's
 * verse sequence rather than one verse in isolation ({@link
 * findHeadingParagraphMismatches}). The verse-initial-space check runs once
 * here rather than inside {@link walkLevel}, since it looks only at this
 * verse's own outermost content.
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
    duplicateFootnoteAnchors: [],
    trailingWhitespace: [],
    leadingPunctuation: [],
    markBoundarySpaces: [],
    verseInitialSpace: checkVerseInitialSpace(content),
    fractionFindings: [],
    footnotePunctuationOrder: [],
    markBoundaryEmbeddedSpaces: [],
    ellipsisFindings: [],
    straightQuoteFindings: [],
    dialytikaFindings: [],
    footnoteMarkerAfterWhitespace: [],
    untaggedScriptRuns: [],
    mergeableSiblingPairs: [],
    nonStandardWhitespaceFindings: [],
  };
  walkLevel(asArray(content), where, sink);
  return sink;
}

// ---------------------------------------------------------------------------
// Disk scanning
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

/** One node whose own text still carries an un-normalized ellipsis, with its file/verse identity attached. */
export interface EllipsisFinding {
  /** The version id this finding belongs to (e.g. `WEBUS2020`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `53-2ES.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `2ES`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
  /** The offending node's own path within the verse's content tree (e.g. `content[0].foot.content[1]`). */
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

/** One misplaced-footnote-marker finding, with its file/verse identity attached. */
export interface FootnotePunctuationOrderFileFinding extends FootnotePunctuationOrderFinding {
  /** The version id this finding belongs to (e.g. `WEBUS2020`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `81-REV.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `REV`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** One mark-boundary-embedded-space finding, with its file/verse identity attached. */
export interface MarkBoundaryEmbeddedSpaceFileFinding extends MarkBoundaryEmbeddedSpaceFinding {
  /** The version id this finding belongs to (e.g. `WEBUS2020`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `81-REV.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `REV`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** One straight-quote/apostrophe finding, with its file/verse identity attached. */
/** One node whose own text still carries a misplaced Greek dialytika, with its file/verse identity attached. */
export interface DialytikaFinding {
  /** The version id this finding belongs to (e.g. `BYZ2018`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `01-MAT.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `MAT`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
  /** The offending node own path within the verse content tree (e.g. `content[3]`). */
  path: string;
}

export interface StraightQuoteFileFinding extends StraightQuoteFinding {
  /** The version id this finding belongs to (e.g. `YLT1898`). */
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

/** One footnote-marker-after-whitespace finding, with its file/verse identity attached. */
export interface FootnoteMarkerAfterWhitespaceFileFinding extends FootnoteMarkerAfterWhitespaceFinding {
  /** The version id this finding belongs to (e.g. `ASV1901`). */
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

/** One node whose own text mixes a Latin letter with an untagged Hebrew or Greek letter, with its file/verse identity attached. */
export interface UntaggedScriptRunFinding {
  /** The version id this finding belongs to (e.g. `WEBUS2020`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `04-NUM.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `NUM`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
  /** The offending node's own path within the verse's content tree (e.g. `content.foot.content[0]`). */
  path: string;
}

/** One mergeable-sibling-pair finding, with its file/verse identity attached. */
export interface MergeableSiblingsFileFinding extends MergeableSiblingsFinding {
  /** The version id this finding belongs to (e.g. `YLT1898`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `02-EXO.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `EXO`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** One non-standard-whitespace finding, with its file/verse identity attached. */
export interface NonStandardWhitespaceFileFinding extends NonStandardWhitespaceFinding {
  /** The version id this finding belongs to (e.g. `YLT1898`). */
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

/** One duplicate-footnote-anchor finding, with its file/verse identity attached. */
export interface DuplicateFootnoteAnchorFileFinding extends DuplicateFootnoteAnchorFinding {
  /** The version id this finding belongs to (e.g. `BYZ2018`). */
  version: string;
  /** The verse file this finding belongs to (e.g. `08-2CO.json`). */
  file: string;
  /** The book id this finding belongs to (e.g. `2CO`). */
  book: string;
  /** The chapter number this finding belongs to. */
  chapter: number;
  /** The verse number this finding belongs to. */
  verse: number;
}

/** One version's own audit: its id, and every finding {@link auditVersion} found, across every check. */
export interface VersionAudit {
  /** The version id audited (e.g. `KJV1769`). */
  version: string;
  /** The unmerged-connector check's findings, corpus-wide for this version. */
  unmergedPairs: readonly UnmergedStrongPairFinding[];
  /** The duplicate-footnote-anchor check's findings, corpus-wide for this version — a textless node whose own `foot` byte-for-byte repeats its immediate predecessor's. */
  duplicateFootnoteAnchors: readonly DuplicateFootnoteAnchorFileFinding[];
  /** The trailing-whitespace check's findings, corpus-wide for this version. */
  trailingWhitespace: readonly StrongTrailingWhitespaceFinding[];
  /** The leading-punctuation check's findings, corpus-wide for this version. */
  leadingPunctuation: readonly StrongLeadingPunctuationFinding[];
  /** The mark-boundary-space check's findings, corpus-wide for this version. */
  markBoundarySpaces: readonly MarkBoundarySpaceFileFinding[];
  /** The verse-initial-space check's findings, corpus-wide for this version. */
  verseInitialSpaces: readonly VerseInitialSpaceFileFinding[];
  /** The heading-paragraph check's findings, corpus-wide for this version — a heading/subtitle run not immediately followed by a real paragraph start. */
  headingParagraphMismatches: readonly HeadingParagraphFileFinding[];
  /** The fraction check's findings, corpus-wide for this version — a node whose own text still carries a fraction shape not yet normalized to this repo's own convention. */
  fractionFindings: readonly FractionFinding[];
  /** The footnote-punctuation-order check's findings, corpus-wide for this version — a footnote marker rendering before punctuation that belongs to the same span. */
  footnotePunctuationOrder: readonly FootnotePunctuationOrderFileFinding[];
  /** The mark-boundary-embedded-space check's findings, corpus-wide for this version — a mark-boundary space embedded inside a node's own text at a boundary where the two real sides disagree. */
  markBoundaryEmbeddedSpaces: readonly MarkBoundaryEmbeddedSpaceFileFinding[];
  /** The ellipsis check's findings, corpus-wide for this version — a node whose own text still carries a dot run this repo's own ellipsis convention would rewrite, or the one two-period shape it deliberately never rewrites on its own. */
  ellipsisFindings: readonly EllipsisFinding[];
  /** The straight-quote check's findings, corpus-wide for this version — a node whose own text still carries an ASCII straight quote or apostrophe. Auto-fixed as its own step in `validate.ts`'s pass; a survivor here means that step hasn't run yet or the corpus regressed (see {@link hasStraightQuote}'s own doc comment). */
  straightQuoteFindings: readonly StraightQuoteFileFinding[];
  /** The dialytika check findings, corpus-wide for this version — a node whose own text carries a Greek dialytika written after its accent, or left uncomposed. Auto-fixed as its own step in `validate.ts`, so a survivor here means that step has not run yet or the corpus regressed. */
  dialytikaFindings: readonly DialytikaFinding[];
  /** The footnote-marker-spacing check's findings, corpus-wide for this version — a footnote marker rendering immediately after whitespace, extending the leading-space convention the trailing-whitespace check already enforces for `strong` to `foot`. */
  footnoteMarkerAfterWhitespace: readonly FootnoteMarkerAfterWhitespaceFileFinding[];
  /** The script-run check's findings, corpus-wide for this version — a node whose own text mixes a Latin letter with an untagged Hebrew or Greek letter. */
  untaggedScriptRuns: readonly UntaggedScriptRunFinding[];
  /** The mergeable-sibling check's findings, corpus-wide for this version — two adjacent nodes that carry nothing but `text` (optionally agreeing `marks`/`script`) and should have merged into one. */
  mergeableSiblingPairs: readonly MergeableSiblingsFileFinding[];
  /** The non-standard-whitespace check's findings, corpus-wide for this version — a node whose own text still carries a non-breaking space, an exotic Unicode space, a zero-width/joining control, a tab, or a bare newline. Report-only; there is no auto-fix for this one (see {@link hasNonStandardWhitespace}'s own doc comment for why). */
  nonStandardWhitespaceFindings: readonly NonStandardWhitespaceFileFinding[];
}

/**
 * Audit one version's whole corpus, as it sits on disk right now — read-only,
 * writes nothing.
 *
 * @param version - A version id, matching its directory name under `bible-versions/` (e.g. `KJV1769`).
 */
export function auditVersion(version: string): VersionAudit {
  const unmergedPairs: UnmergedStrongPairFinding[] = [];
  const duplicateFootnoteAnchors: DuplicateFootnoteAnchorFileFinding[] = [];
  const trailingWhitespace: StrongTrailingWhitespaceFinding[] = [];
  const leadingPunctuation: StrongLeadingPunctuationFinding[] = [];
  const markBoundarySpaces: MarkBoundarySpaceFileFinding[] = [];
  const verseInitialSpaces: VerseInitialSpaceFileFinding[] = [];
  const headingParagraphMismatches: HeadingParagraphFileFinding[] = [];
  const fractionFindings: FractionFinding[] = [];
  const footnotePunctuationOrder: FootnotePunctuationOrderFileFinding[] = [];
  const markBoundaryEmbeddedSpaces: MarkBoundaryEmbeddedSpaceFileFinding[] = [];
  const ellipsisFindings: EllipsisFinding[] = [];
  const straightQuoteFindings: StraightQuoteFileFinding[] = [];
  const dialytikaFindings: DialytikaFinding[] = [];
  const footnoteMarkerAfterWhitespace: FootnoteMarkerAfterWhitespaceFileFinding[] = [];
  const untaggedScriptRuns: UntaggedScriptRunFinding[] = [];
  const mergeableSiblingPairs: MergeableSiblingsFileFinding[] = [];
  const nonStandardWhitespaceFindings: NonStandardWhitespaceFileFinding[] = [];

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
      for (const finding of findings.duplicateFootnoteAnchors)
        duplicateFootnoteAnchors.push({ ...identity, ...finding });
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
      for (const finding of findings.footnotePunctuationOrder)
        footnotePunctuationOrder.push({ ...identity, ...finding });
      for (const finding of findings.markBoundaryEmbeddedSpaces)
        markBoundaryEmbeddedSpaces.push({ ...identity, ...finding });
      for (const at of findings.ellipsisFindings)
        ellipsisFindings.push({ ...identity, path: at });
      for (const finding of findings.straightQuoteFindings)
        straightQuoteFindings.push({ ...identity, ...finding });
      for (const at of findings.dialytikaFindings)
        dialytikaFindings.push({ ...identity, path: at });
      for (const finding of findings.footnoteMarkerAfterWhitespace)
        footnoteMarkerAfterWhitespace.push({ ...identity, ...finding });
      for (const at of findings.untaggedScriptRuns)
        untaggedScriptRuns.push({ ...identity, path: at });
      for (const finding of findings.mergeableSiblingPairs)
        mergeableSiblingPairs.push({ ...identity, ...finding });
      for (const finding of findings.nonStandardWhitespaceFindings)
        nonStandardWhitespaceFindings.push({ ...identity, ...finding });
    }

    for (const finding of findHeadingParagraphMismatches(verses))
      headingParagraphMismatches.push({ version, file, ...finding });
  }

  return {
    version,
    unmergedPairs,
    duplicateFootnoteAnchors,
    trailingWhitespace,
    leadingPunctuation,
    markBoundarySpaces,
    verseInitialSpaces,
    headingParagraphMismatches,
    fractionFindings,
    footnotePunctuationOrder,
    markBoundaryEmbeddedSpaces,
    ellipsisFindings,
    straightQuoteFindings,
    dialytikaFindings,
    footnoteMarkerAfterWhitespace,
    untaggedScriptRuns,
    mergeableSiblingPairs,
    nonStandardWhitespaceFindings,
  };
}

/**
 * Audit each named version, or every version directory under
 * `bible-versions/` when none are named — deliberately whatever this repo
 * happens to carry rather than a curated list, since a version with nothing
 * for any check to find simply reports zero findings, cheaply.
 *
 * @param versionIds - Versions to audit; defaults to {@link getVersionDirectories}.
 */
export function auditVersions(
  versionIds: readonly string[] = getVersionDirectories(),
): VersionAudit[] {
  return versionIds.map((version) => auditVersion(version));
}

/** The exit code this check should report — non-zero when any version carries any finding across any check. */
export function exitCodeFor(summaries: readonly VersionAudit[]): number {
  return summaries.some(
    (summary) =>
      summary.unmergedPairs.length > 0 ||
      summary.duplicateFootnoteAnchors.length > 0 ||
      summary.trailingWhitespace.length > 0 ||
      summary.leadingPunctuation.length > 0 ||
      summary.markBoundarySpaces.length > 0 ||
      summary.verseInitialSpaces.length > 0 ||
      summary.headingParagraphMismatches.length > 0 ||
      summary.fractionFindings.length > 0 ||
      summary.footnotePunctuationOrder.length > 0 ||
      summary.markBoundaryEmbeddedSpaces.length > 0 ||
      summary.ellipsisFindings.length > 0 ||
      summary.straightQuoteFindings.length > 0 ||
      summary.dialytikaFindings.length > 0 ||
      summary.footnoteMarkerAfterWhitespace.length > 0 ||
      summary.untaggedScriptRuns.length > 0 ||
      summary.mergeableSiblingPairs.length > 0 ||
      summary.nonStandardWhitespaceFindings.length > 0,
  )
    ? 1
    : 0;
}

/**
 * Prints one version's own findings across every check — the first `cap`
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
    `  ${summary.duplicateFootnoteAnchors.length} textless node(s) whose own foot byte-for-byte repeats an earlier node's`,
  );
  for (const finding of summary.duplicateFootnoteAnchors.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} node=${JSON.stringify(finding.node)} target=${JSON.stringify(finding.target)}`,
    );
  }
  if (!verbose && summary.duplicateFootnoteAnchors.length > cap)
    console.log(
      `    … ${summary.duplicateFootnoteAnchors.length - cap} more (--verbose to list all)`,
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

  console.log(
    `  ${summary.footnotePunctuationOrder.length} footnote marker(s) rendering before punctuation that belongs to the same span`,
  );
  for (const finding of summary.footnotePunctuationOrder.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} leading=${JSON.stringify(finding.leading)} node=${JSON.stringify(finding.node)} next=${JSON.stringify(finding.next)}`,
    );
  }
  if (!verbose && summary.footnotePunctuationOrder.length > cap)
    console.log(
      `    … ${summary.footnotePunctuationOrder.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.markBoundaryEmbeddedSpaces.length} mark-boundary space(s) embedded inside a node's own text at a boundary where the two real sides disagree`,
  );
  for (const finding of summary.markBoundaryEmbeddedSpaces.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} side=${finding.side} node=${JSON.stringify(finding.node)} neighbor=${JSON.stringify(finding.neighbor)}`,
    );
  }
  if (!verbose && summary.markBoundaryEmbeddedSpaces.length > cap)
    console.log(
      `    … ${summary.markBoundaryEmbeddedSpaces.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.ellipsisFindings.length} node(s) whose own text still carries an un-normalized ellipsis`,
  );
  for (const finding of summary.ellipsisFindings.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path}`,
    );
  }
  if (!verbose && summary.ellipsisFindings.length > cap)
    console.log(
      `    … ${summary.ellipsisFindings.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.straightQuoteFindings.length} node(s) whose own text still carries an ASCII straight quote or apostrophe`,
  );
  for (const finding of summary.straightQuoteFindings.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path} character=${JSON.stringify(finding.character)} excerpt=${JSON.stringify(finding.excerpt)}`,
    );
  }
  if (!verbose && summary.straightQuoteFindings.length > cap)
    console.log(
      `    … ${summary.straightQuoteFindings.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.dialytikaFindings.length} node(s) whose own text carries a Greek dialytika written after its accent, or left uncomposed`,
  );
  for (const finding of summary.dialytikaFindings.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path}`,
    );
  }
  if (!verbose && summary.dialytikaFindings.length > cap)
    console.log(
      `    … ${summary.dialytikaFindings.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.footnoteMarkerAfterWhitespace.length} footnote marker(s) rendering immediately after whitespace`,
  );
  for (const finding of summary.footnoteMarkerAfterWhitespace.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} node=${JSON.stringify(finding.node)} next=${JSON.stringify(finding.next)}`,
    );
  }
  if (!verbose && summary.footnoteMarkerAfterWhitespace.length > cap)
    console.log(
      `    … ${summary.footnoteMarkerAfterWhitespace.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.untaggedScriptRuns.length} node(s) whose own text mixes a Latin letter with an untagged Hebrew or Greek letter`,
  );
  for (const finding of summary.untaggedScriptRuns.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path}`,
    );
  }
  if (!verbose && summary.untaggedScriptRuns.length > cap)
    console.log(
      `    … ${summary.untaggedScriptRuns.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.mergeableSiblingPairs.length} adjacent node pair(s) that carry nothing but text (optionally agreeing marks/script) and should have merged into one`,
  );
  for (const finding of summary.mergeableSiblingPairs.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} first=${JSON.stringify(finding.first)} second=${JSON.stringify(finding.second)}`,
    );
  }
  if (!verbose && summary.mergeableSiblingPairs.length > cap)
    console.log(
      `    … ${summary.mergeableSiblingPairs.length - cap} more (--verbose to list all)`,
    );

  console.log(
    `  ${summary.nonStandardWhitespaceFindings.length} node(s) whose own text still carries a non-standard whitespace character`,
  );
  for (const finding of summary.nonStandardWhitespaceFindings.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path} codePoint=${finding.codePoint} excerpt=${JSON.stringify(finding.excerpt)}`,
    );
  }
  if (!verbose && summary.nonStandardWhitespaceFindings.length > cap)
    console.log(
      `    … ${summary.nonStandardWhitespaceFindings.length - cap} more (--verbose to list all)`,
    );
}

/**
 * True when a version's audit found nothing across any check — printed as a
 * single skipped line rather than an empty block, so a report over every
 * version on disk stays readable.
 *
 * Exported so `validate.ts` can reuse this same clean/dirty test rather than
 * re-deriving it from `VersionAudit`'s own finding arrays itself.
 */
export function isClean(summary: VersionAudit): boolean {
  return (
    summary.unmergedPairs.length === 0 &&
    summary.duplicateFootnoteAnchors.length === 0 &&
    summary.trailingWhitespace.length === 0 &&
    summary.leadingPunctuation.length === 0 &&
    summary.markBoundarySpaces.length === 0 &&
    summary.verseInitialSpaces.length === 0 &&
    summary.headingParagraphMismatches.length === 0 &&
    summary.fractionFindings.length === 0 &&
    summary.footnotePunctuationOrder.length === 0 &&
    summary.markBoundaryEmbeddedSpaces.length === 0 &&
    summary.ellipsisFindings.length === 0 &&
    summary.straightQuoteFindings.length === 0 &&
    summary.dialytikaFindings.length === 0 &&
    summary.footnoteMarkerAfterWhitespace.length === 0 &&
    summary.untaggedScriptRuns.length === 0 &&
    summary.mergeableSiblingPairs.length === 0 &&
    summary.nonStandardWhitespaceFindings.length === 0
  );
}

