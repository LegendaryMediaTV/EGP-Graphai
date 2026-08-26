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
 *    standard ({@link normalizeFractionText}, `functions/normalizeFractions.ts`)
 *    checked here so any version's content, however it was built, can be
 *    measured against it independent of the USFM importer that first applies
 *    it. See {@link hasUnnormalizedFraction}.
 * 8. **Footnote punctuation order** — a `foot`-carrying, text-bearing node
 *    immediately followed by a real sibling whose own text starts with tight
 *    punctuation (check 3's own definition) that belongs to the same span.
 *    Rendered, the footnote marker lands before punctuation that should have
 *    come before it instead, since a node's own marker always renders after
 *    that node's own full text (see `utils/exportContent.ts`'s renderer).
 *    See {@link scanArrayForFootnotePunctuationOrder}.
 * 9. **Mark-boundary embedded spaces** — a node whose own `marks`/`script`
 *    are non-empty and whose own `text` starts or ends with a whitespace
 *    character that disagrees in formatting with the real node immediately
 *    across that boundary. Asymmetric by design: only the side that itself
 *    carries the formatting can be the offender. See {@link
 *    carriesFormatting} and {@link scanArrayForMarkBoundaryEmbeddedSpaces}.
 * 10. **Un-normalized ellipsis** — a node's own `text` still carrying a dot
 *    run this repo's own ellipsis convention would rewrite to U+2026, or the
 *    one two-period shape that convention deliberately never rewrites on its
 *    own. Like check 7, this is a project-wide content standard, not a
 *    node's own placement relative to its neighbors
 *    ({@link normalizeEllipsisText}/{@link hasEllipsisIndicator},
 *    `functions/normalizeEllipses.ts`). Deliberately broader than the
 *    auto-fix it mirrors: it also reports a bare two-period run, which the
 *    shipped rewriter refuses forever as a standing rule (see that module's
 *    own doc comment for why), so a future import carrying that shape gets a
 *    person's decision instead of a silent skip. See {@link
 *    hasUnnormalizedEllipsis}.
 * 11. **ASCII straight quote, apostrophe, or backtick** — a node's own `text`
 *    still carrying an ASCII `'`, `"`, or backtick, none of which this
 *    repo's own punctuation convention ever writes in prose content. Unlike
 *    checks 7 and 10, this one has **no auto-fix and never will**: deciding
 *    whether a straight `'` is an apostrophe, an opening quote, or a closing
 *    quote needs context a character-level rule cannot supply, so this check
 *    exists to report the finding with enough detail to act on, not to
 *    silently rewrite it. See {@link hasStraightQuote}.
 * 12. **Footnote marker after whitespace** — a `foot`-carrying node whose own
 *    marker renders immediately after whitespace, the same leading-space
 *    convention check 2 already enforces for `strong`, extended here to
 *    `foot`. Asks the render-order question, not just "does this node's own
 *    text end in whitespace": a node rendering no text of its own (a bare
 *    `{foot: {...}}` anchor) still renders its marker wherever the
 *    accumulated visible text before it already ends. A bare `{foot: {...}}`
 *    node — no `text` key at all — is exempt once a real next attachment
 *    point genuinely follows it: that's the deliberately restructured,
 *    already-fixed shape check 12's own fixer produces
 *    (`fixFootnoteMarkerSpacing.ts`), not a defect to re-flag. The exemption
 *    is structural, not content-based — it covers any footnote's own
 *    `type`/`content`, not only CLV1880's versification markers. When
 *    nothing real follows a bare node instead, it still counts: real
 *    WEBUS2020 Mark 9:44's own textless anchor sits at the true end of its
 *    verse, and its predecessor's dangling trailing whitespace still needs
 *    catching. See {@link findWhitespaceSourceIndex} and {@link
 *    scanArrayForFootnoteMarkerAfterWhitespace}.
 * 13. **Untagged script run** — a node's own `text` mixes a Latin letter with
 *    a Hebrew or Greek letter and carries no `script` tag of its own,
 *    contradicting this corpus's own settled convention that a non-Latin
 *    letter embedded in Latin text becomes its own `{text, script}` node.
 *    Requires the mix, not just the non-Latin character alone — an all-Greek
 *    string on an all-Greek version's node is ordinary, correct verse text,
 *    not a finding. See {@link
 *    hasMixedScriptText} (`functions/tagScriptRunsInContent.ts`).
 * 14. **Duplicate footnote anchor** — a node rendering no visible text of its
 *    own whose `foot` is byte-for-byte identical to the nearest node before
 *    it that wasn't itself already flagged. Tight on purpose: two adjacent
 *    siblings sharing a byte-identical `foot` are common corpus-wide, and
 *    the large majority are the same note correctly annotating two real,
 *    separate word occurrences, each on its own text-bearing node — only
 *    the shape where the later node renders nothing at all is a defect. See
 *    {@link isDuplicateFootnoteAnchor} and {@link
 *    scanArrayForDuplicateFootnoteAnchors}.
 * 15. **Mergeable siblings** — two adjacent nodes that carry nothing but
 *    `text` (optionally `marks`/`script`) and agree on both, left split for
 *    no reason a reader could name. Real YLT1898 shape: a heading's own
 *    `"The Angel of the "` immediately followed by `{text: "Jehovah"}` —
 *    structural residue, not a lost mark, confirmed by measuring rather than
 *    assuming: this version carries 98 nodes whose own text starts
 *    "Jehovah" and **zero** of them are `sc`-marked, so there is no
 *    small-caps convention here for a merge to destroy evidence of. A node
 *    carrying `strong`, `foot`, `bibleLink`, nested `content`, `paragraph`,
 *    or `break` is never eligible on either side — each of those ties a
 *    whole different kind of information to one specific tag occurrence, and
 *    two different tag occurrences that decode to the same value must stay
 *    split, the same rule check 1's own doc comment already establishes for
 *    a `target` node's own suffix-carrying properties. See {@link
 *    isMergeableTextNode} and {@link scanArrayForMergeableSiblings}.
 * 16. **Non-standard whitespace** — a node's own `text` carries a
 *    non-breaking space, an exotic Unicode space, a zero-width or
 *    word-joining control, a tab, or a bare newline: none of these are this
 *    corpus's own sanctioned whitespace character (an ordinary ASCII
 *    space). Modeled directly on check 11, down to the excerpt shape:
 *    **no auto-fix and never will be**, since replacing a non-breaking
 *    space needs to know whether the source meant it to hold two words
 *    together, a judgment the character alone cannot supply. The corpus
 *    carries zero of these today — that says nothing about whether the
 *    rule is right, the same position check 11 already occupies. See
 *    {@link hasNonStandardWhitespace}.
 *
 * A general-purpose, version-controlled tool any future import can reach
 * for, rather than a one-off diagnostic scoped to whichever translation
 * happens to be mid-import at the time.
 *
 * Checks 1-4, 8-9, 12, 14, and 15 recurse into `content` (a `ContentNested`
 * wrapper's own inner array) in addition to `heading`/`subtitle`/
 * `foot.content` — a safe default for any future import that tags `strong`
 * inside a footnote.
 *
 * **No curated version list.** With no version id passed to
 * {@link auditVersions}, it audits every directory under `bible-versions/` —
 * whatever this repo happens to carry, not a hardcoded set. A version with no
 * `strong` values at all simply reports zero findings, cheaply.
 *
 * A detection library, with one caller. Nothing here writes to
 * `bible-versions/` — every check above only ever reads and reports. This
 * module carries no `main()`, no command-line argument parsing, and no npm
 * script of its own; `utils/validate.ts` is the only thing that calls in.
 * Checks 1, 6, 8, 9, 12, 13, 14, and 15 do get repaired, but not here: their
 * fixes run inside `validate.ts`'s own auto-fix pass, built from six
 * exported transforms in `utils/` that reuse this module's own eligibility
 * functions rather than a second copy of the judgment
 * (`fixUnmergedNodes.ts`, `fixHeadingParagraphs.ts`,
 * `fixFootnotePunctuationOrder.ts`, `fixMarkBoundaryEmbeddedSpaces.ts`,
 * `fixFootnoteMarkerSpacing.ts`, `fixDuplicateFootnoteAnchors.ts`, check
 * 14's own fixer), plus two more in `functions/` (`tagScriptRunsInContent.ts`,
 * check 13's own fixer, self-contained rather than importing this module's
 * judgment, since its own eligibility question — does this text mix
 * scripts, and does the node carry a property a split can't safely assign —
 * has nothing to do with node placement, the concern every other check here
 * shares; `mergeEquivalentSiblingsInContent.ts`, check 15's own fixer,
 * which does import {@link isMergeableTextNode} and {@link
 * agreesInFormatting} from here, since its own eligibility question is
 * exactly this module's concern). A reader looking for the fix half of any
 * of these eight checks should look there, not here.
 */

import * as fs from "fs";
import * as path from "path";
import _ from "lodash";
import { getVersionDirectories } from "../functions/getBibleVersions";
import Content from "../types/Content";
import { normalizeFractionText } from "../functions/normalizeFractions";
import { hasEllipsisIndicator } from "../functions/normalizeEllipses";
import { hasMixedScriptText } from "../functions/tagScriptRunsInContent";

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
export function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
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
export function isRealAttachmentPoint(shape: NodeShape): boolean {
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
 * member after the first marks a piece boundary strictly inside the run.
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
 * with what precedes it. There's nothing tagged for it to fold into, so it's
 * simply untagged text, not an unmerged pair. Real KJV1769 Genesis 1:15
 * makes the asymmetry concrete: `{ text: " upon the earth:", strong: "H776"
 * }, " and it was so."` ends untagged and trailing, with nothing
 * suffix-carrying after it. Folding it backward into `H776` would claim that
 * Strong's number covers "and it was so," which it does not — the real
 * defect, when there is one, is a missing tag on the connector, never
 * something this check could recommend merging away.
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
 * on the way in (`functions/normalizeFractions.ts`), reachable here so any
 * version's already-built content can be checked against it too.
 */
function hasUnnormalizedFraction(shape: NodeShape): boolean {
  return shape.text !== undefined && normalizeFractionText(shape.text).changes > 0;
}

// ---------------------------------------------------------------------------
// Check 10 — a node's own text still carrying an un-normalized ellipsis
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
// Check 11 — an ASCII straight quote, apostrophe, or backtick in content text
// ---------------------------------------------------------------------------

/** The three ASCII characters this repo's own punctuation convention never writes into prose content — a straight apostrophe, a straight double quote, and a backtick. Each has a real curly counterpart already in use corpus-wide (an apostrophe or a closing single quote is always U+2019, an opening single quote is U+2018, an opening/closing double quote is U+201C/U+201D), and a backtick has no legitimate prose use here at all. */
const STRAIGHT_QUOTE = /['"`]/;

/** How many characters of context this check prints on each side of the offending character in a finding's own excerpt — enough to see whether it opens a word, closes one, or sits mid-word, without dumping a node's entire text into a report line. */
const EXCERPT_RADIUS = 20;

/** One un-normalized ASCII straight-quote/apostrophe/backtick found within a single array level. */
interface StraightQuoteFinding {
  /** The offending node's own path within its verse (e.g. `content[3]`, `content.foot.content[1]`). */
  path: string;
  /** The single offending character — `'`, `"`, or a backtick. */
  character: string;
  /** A short excerpt of the node's own text centered on the offending character, marked with a leading and/or trailing `…` where it was truncated, so a reader can tell an apostrophe from an opening or closing quote without opening the file. */
  excerpt: string;
}

/**
 * True when a node's own `text` carries an ASCII `'`, `"`, or backtick.
 *
 * **Report-only, deliberately.** Converting a straight `'` requires first deciding
 * whether it is an apostrophe, an opening single quote, or a closing single
 * quote — a judgment that depends on the characters around it and sometimes
 * the whole sentence, not on the character itself. No rule applied one
 * character at a time can make that call safely. The retired
 * `imports/fixStraightQuotes.ts` only got away with an unconditional `'` →
 * `’` substitution because a full manual survey first proved its one target
 * version carried no quote-shaped usage at all — a per-edition finding, true
 * of one translation's own punctuation habits, not a rule this check could
 * apply to every future import regardless of source. This check exists to
 * catch the next import before it lands, not to describe a present defect.
 */
function hasStraightQuote(shape: NodeShape): boolean {
  return shape.text !== undefined && STRAIGHT_QUOTE.test(shape.text);
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
 * `heading`/`subtitle` boundary.
 *
 * Two distinct shapes: a first node that is *entirely* whitespace (a bare
 * `" "`, or `{paragraph: true, text: " "}`) and a first node whose own text
 * merely *starts* with whitespace before real content continues
 * (`{paragraph: true, text: " Jesus went out from the temple..."}`, Matthew
 * 24:1).
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
 * True for a node that renders no visible text — no top-level `text`, no
 * nested `content`, not itself a `heading`/`subtitle`/`bibleLink` boundary —
 * and that doesn't itself carry `paragraph: true`. Skipped when looking for
 * the real node after a heading/subtitle run, the same way checks 3/4 skip
 * through a textless Strong's sibling (`isTextlessStrongSibling`): a node
 * rendering zero characters isn't really "the thing after the heading" from
 * a reader's standpoint, so testing *it* for `paragraph: true` tests the
 * wrong node. Real YLT1898 1 Corinthians 7:1 shows why: its heading is
 * immediately followed by a textless chapter-summary `{foot: {...}}` node,
 * and only *after* that does the verse's real `{paragraph: true, text: "And
 * concerning…"}` appear — without this skip, `next` would be the
 * footnote-only node itself, never `paragraph: true` by construction,
 * producing a false finding on a run that is correctly flagged.
 *
 * **The `paragraph: true` exclusion is load-bearing, not defensive
 * padding.** Real KJV1769 Matthew 13:1 puts `{paragraph: true, strong:
 * "G1161"}` — a textless connector — directly after its heading, with the
 * real visible text only on the node *after* that. The flag genuinely lives
 * on the textless node here; skipping past it because it renders nothing
 * would silently lose the very signal this check exists to find.
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
 * skipsPastHeadingRun} node before landing on `next` — see that function's
 * own doc comment for the real corpus case this exists for.
 *
 * Never recurses past a verse's own outermost array — check 6 is defined as
 * a verse-level heading/subtitle convention, not one that reaches into
 * nested content. A run with nothing after it at all reports nothing —
 * there is no node for the convention to apply to.
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
// Check 8 — a footnote marker rendering before punctuation that belongs to the same span
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
 * (see {@link isTightPunctuationChar}/{@link leadingTightPunctuationSplit},
 * check 3's own definition, reused verbatim here) — illustrative shape, real
 * WEBUS2020 Revelation 1:8: `{text: "…the Omega,", foot: {...}}` immediately
 * followed by `{text: "”"}`. Rendered, the footnote marker lands right after
 * "Omega," and right *before* the closing quote it should have followed
 * instead, since `utils/exportContent.ts`'s own renderer always places a
 * node's footnote marker in its `suffix`, after that node's own full `core`
 * text (see `RenderedParts` there) — which also bounds this check's own
 * scope: punctuation embedded in the *footed* node's own text is never a
 * defect this check can find, since it only ever inspects the node *after*
 * the footed one.
 *
 * The offending punctuation need not be `next`'s *entire* text — a leading
 * run is enough, with real content continuing right after it (`{text:
 * "word", foot: {...}}, {text: "! Next"}`), which is why {@link
 * leadingTightPunctuationSplit} is reused rather than a whole-string test. A
 * footed node with no `text` of its own never fires — the loop's own first
 * guard requires `text` to be present and non-empty before it even looks at
 * what follows. Every other guard mirrors check 3's own: a textless Strong's
 * sibling in between is skipped through, not treated as a boundary; `next`
 * opening a new paragraph marks a real piece boundary a footnote marker's
 * own position cannot cross.
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
// Check 9 — a mark-boundary space embedded inside a node's own text at a boundary where the two real sides disagree
// ---------------------------------------------------------------------------

/**
 * True when a node's own `marks`/`script` are non-empty. This is the gate
 * check 9 needs, since only a node that itself carries formatting can
 * wrongly extend it onto an adjacent, differently-formatted node's own
 * joining space. An unmarked node's own embedded space is never this check's
 * concern.
 *
 * Real WEBUS2020 Revelation 1:8 is exactly why this gate is one-directional
 * rather than a plain "the two sides disagree" test: `(1) {marks: ["woc"]},
 * (2) {marks: []} (none), " says the Lord God,", (3) {marks: ["woc"]}, "
 * "who is…"`. Node 3's own leading space wrongly reaches across a real
 * disagreement (node 2 carries no marks) and is a finding. Node 2's own
 * leading space sits at the identical kind of disagreement (node 1 does
 * carry marks) and is *not* one — nothing on node 2's own side is marked for
 * the space to wrongly extend. A symmetric "the two sides simply disagree"
 * rule would flag both; only the side that itself carries the formatting is
 * this check's concern.
 */
export function carriesFormatting(shape: NodeShape): boolean {
  return shape.marks.length > 0 || shape.script !== undefined;
}

/**
 * True when two nodes' own marks share the same script and one's marks are
 * a non-empty subset of the other's, meaning the smaller side is a strict
 * formatting subset of the larger, not a disagreement. Scoped to check 9
 * only, not folded into {@link agreesInFormatting} itself, since checks 1/3/4
 * use that function's exact-equality test; changing its meaning there is a
 * bigger, unjustified blast radius than this one check needs.
 *
 * Real YLT1898 case this exists for: a Words-of-Christ node (marks:
 * ["woc"]) bordering a translator-supplied word that is *also* part of
 * Christ's own discourse (marks: ["i","woc"]). The supplied word correctly
 * carries `woc` plus one more mark, not a genuine boundary — `exportContent.ts`
 * renders both orderings identically, so nothing hinges on which side is
 * "outer." Do not generalize this into `agreesInFormatting` itself.
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
 * **Asymmetric by design** — see {@link carriesFormatting}'s own doc comment
 * for the concrete Revelation 1:8 case this comes from. This check only ever
 * fires when the space-carrying node *itself* carries the non-empty
 * `marks`/`script`, never when it's the unmarked side of a disagreement.
 * Future readers: do not "fix" this into a symmetric check without
 * re-reading that example first.
 *
 * **A strict formatting-subset boundary is excluded, not flagged** — see
 * {@link isFormattingSubsetOf}'s own doc comment for the real YLT1898
 * `["woc"]`-vs-`["i","woc"]` case this exists for. One side's marks being a
 * non-empty subset of the other's is a nesting relationship, not a genuine
 * disagreement, so both guards below check it alongside `agreesInFormatting`.
 *
 * Distinct from check 4 ({@link scanArrayForMarkBoundarySpaces}): check 4
 * catches a *standalone* whitespace-only node between two agreeing real
 * nodes; this check catches whitespace *embedded* inside an otherwise-real
 * node's own text at a boundary where the two real sides *disagree*.
 *
 * Both directions reuse the same guards checks 3 and 4 already established:
 * a textless Strong's sibling in between is skipped through rather than
 * treated as a boundary; a `break` or a `paragraph`-opening neighbor marks a
 * real piece boundary a stray embedded space cannot cross.
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
// Check 12 — a footnote marker rendering immediately after whitespace
// ---------------------------------------------------------------------------

/**
 * Walks backward from `at` (inclusive) through every node contributing no
 * rendered characters of its own — an undefined or empty `text` — to find
 * the node whose own trailing text is what a footnote marker sitting at
 * index `at` actually renders immediately after. A node's own marker always
 * renders after that node's own full text (see check 8's own doc comment),
 * so a node with real text of its own is always its own answer; a node with
 * none (a bare `{foot: {...}}` anchor, or a `{text: ""}` husk) renders
 * nothing, so the character its marker actually follows is whatever the
 * nearest real text before it left behind — real WEBUS2020 Mark 9:44 shape,
 * where a textless `{foot}` anchor's own predecessor ends in whitespace.
 *
 * Returns that node's own index only when its text ends in whitespace —
 * `undefined` both when nothing between the start of the array and `at`
 * contributes any text at all, and when the nearest real text found does
 * *not* end in whitespace (a real word, not a joining space, precedes the
 * marker). Also `undefined` when a `hasNestedContent` (`ContentNested`)
 * wrapper blocks the walk: this array level has no visibility into such a
 * wrapper's own nested content, so it can't say what that wrapper's own
 * last rendered character is, and no real corpus case combines nested
 * content with a textless top level and a `foot` — see check 8's own
 * treatment of a `ContentNested` wrapper (never a real attachment point)
 * for the same boundary drawn elsewhere in this file.
 *
 * Exported so {@link scanArrayForFootnoteMarkerAfterWhitespace} and this
 * check's own fixer share one answer to "where does this whitespace
 * actually live" rather than the fixer re-deriving it — the fixer needs the
 * source node's own index to strip the run from, not just a boolean.
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
  /** The real node immediately after `node`, skipping any textless Strong's sibling in between, the joining space should relocate onto — `undefined` when `node` sits at the end of its own array level, with nothing to relocate onto. */
  next: unknown;
}

/**
 * Scan one array level for a `foot`-carrying node whose own marker renders
 * immediately after whitespace — a violation of this corpus's own
 * leading-space convention (see the top of this file), extended here to
 * `foot` the same way check 2 already covers `strong`. Real ASV1901 Genesis
 * 1:2 shape: `{text: "...and the Spirit of God ", foot: {...}}` immediately
 * followed by `"moved upon the face of the waters."` — rendered, the marker
 * lands after the space and hard against "moved," instead of hugging "God"
 * where it belongs.
 *
 * A node whose own `text` ends in whitespace is the ordinary case, but a
 * `foot`-carrying node that renders no text of its own — a bare `{foot:
 * {...}}` anchor — still renders its marker somewhere, immediately after
 * whatever the accumulated visible text already ends in. See {@link
 * findWhitespaceSourceIndex} for the backward
 * walk that answers this precisely, and its own doc comment for the real
 * WEBUS2020 Mark 9:44 case this exists for.
 *
 * **A bare `{foot: {...}}` node — no `text` key at all — is exempt once a
 * real next attachment point genuinely follows it** (skipping any textless
 * Strong's sibling in between), regardless of what its own `foot` says: real
 * KJV1769 Isaiah 10:5 (`{text: " Assyrian,", foot: {...}}`, a bare `{foot:
 * {...}}`, `{text: " the rod", ...}`) stays silent on its middle node
 * because that node already sits in its own final, settled shape — the
 * same shape `fixFootnoteMarkerSpacing.ts`'s own fixer produces once it
 * splits a combined node apart (real CLV1880 Numbers 20:28, post-fix).
 * **Not exempt when nothing real follows instead** — real WEBUS2020 Mark
 * 9:44's own textless anchor sits at the true end of its verse, with
 * nothing after it to have settled into place alongside, so it stays a
 * finding and its own predecessor's dangling trailing whitespace still gets
 * caught.
 *
 * A `hasNestedContent` node is never itself a finding: whether *its* own
 * marker renders after whitespace depends on its own nested content's last
 * rendered character, invisible from this array level (see {@link
 * findWhitespaceSourceIndex}'s own doc comment).
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
    while (j < nodes.length && shapes[j].isTextlessStrongSibling) j++;
    const next = j < nodes.length ? shapes[j] : undefined;

    if (shape.text === undefined && next !== undefined && isRealAttachmentPoint(next)) continue;
    if (findWhitespaceSourceIndex(shapes, i) === undefined) continue;

    findings.push({ where, node: nodes[i], next: j < nodes.length ? nodes[j] : undefined });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 13 — a non-Latin letter embedded in Latin text with no script tag
// ---------------------------------------------------------------------------

/**
 * True when a node's own `text` mixes a Latin letter with a Hebrew or Greek
 * letter and the node doesn't yet carry a `script` tag of its own —
 * real WEBUS2020 `NUM 15:38`'s untagged `"or, tassels (Hebrew צִיצִ֛ת)"`
 * against real WEBUS2020 `PSA 3:2`'s correctly tagged `{text:
 * "אֱלֹהִ֑ים", script: "H"}`, three books away in the same version. Built
 * on {@link hasMixedScriptText} (`functions/tagScriptRunsInContent.ts`)
 * rather than a second copy of the Unicode-range matching — the same
 * "one convention, one function" discipline checks 7 and 10 already follow
 * for `normalizeFractionText`/`hasEllipsisIndicator`.
 *
 * **Not about headings, and not about acrostics.** The guarding need that
 * first motivated tagging a non-Latin letter (Psalm 119's acrostic-stanza
 * headings) is one instance of a general rule this predicate states plainly:
 * the rule applies anywhere in the tree a bare string carries mixed script,
 * a footnote's own prose included — which is exactly where both real corpus
 * violations live.
 *
 * A `script` already present short-circuits the test before it ever looks at
 * the text — an already-tagged node is correct as it stands, regardless of
 * what its own text contains, and this check never second-guesses a tag
 * already applied.
 */
function hasUntaggedScriptRun(shape: NodeShape): boolean {
  return (
    shape.text !== undefined &&
    shape.script === undefined &&
    hasMixedScriptText(shape.text)
  );
}

// ---------------------------------------------------------------------------
// Check 14 — a textless node repeating its predecessor's own footnote
// ---------------------------------------------------------------------------

/** A node's own raw `foot` value, or `undefined` when it isn't a plain object or carries none — the byte-for-byte comparison check 14 needs, which {@link NodeShape} doesn't carry (it only ever exposes `hasFoot`, a boolean). */
function footValueOf(node: unknown): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node))
    return undefined;
  return (node as Record<string, unknown>).foot;
}

/**
 * True when `candidate` renders no visible text of its own and its own
 * `foot` is byte-for-byte identical to `target`'s — the exact rule check 14
 * exists to flag. Exported so {@link scanArrayForDuplicateFootnoteAnchors}
 * and this check's own fixer (`utils/fixDuplicateFootnoteAnchors.ts`) share
 * one answer rather than the fixer re-deriving it, the same reuse
 * discipline `findWhitespaceSourceIndex` already established for check 12.
 *
 * **"Renders no visible text" means no `text` key at all, or `text: ""`** —
 * real KJV1769 Psalm 80:4's `{text: "", foot: {...}}` renders exactly as
 * little as a bare `{foot: {...}}` anchor, so both count. A `hasNestedContent`
 * node is excluded outright: whether *it* renders anything depends on its
 * own nested content, invisible from this array level (the same boundary
 * {@link findWhitespaceSourceIndex} draws for the identical reason).
 *
 * Deep-equality (`lodash`'s `isEqual`), not `===`: two `foot` objects built
 * from the same source apparatus note are equal in value but never the same
 * object reference once JSON round-trips through `JSON.parse`.
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
 * Scan one array level for a node that renders no visible text of its own
 * and whose `foot` byte-for-byte repeats the nearest node before it that
 * wasn't itself already flagged for deletion — real BYZ2018 2 Corinthians
 * 7:12 shape: three consecutive nodes share one apparatus note ("B εἵνεκεν
 * ⇒ ἕνεκεν"), the first attached to real text and eligible as `target`, the
 * second and third bare `{foot: {...}}` anchors repeating it with nothing
 * of their own to attach it to — both are findings, the second compared
 * against the first (its own `target`), not against the first duplicate,
 * which is itself on its way out.
 *
 * **Tight on purpose.** Two adjacent siblings sharing a byte-identical `foot`
 * are usually the same note correctly annotating two real, separate
 * occurrences of the same word, each on its own text-bearing node (real
 * ASV1901 Genesis 3:14: "cursed art thou" and " above all cattle, and" both
 * carry the identical "Or, from among" note, each legitimately its own
 * marker on its own word). The rule that tells a genuine duplicate apart
 * from that is exactly whether the later node renders anything: a node with
 * real text of its own is never a finding here, no matter how many siblings
 * share its `foot`. See {@link isDuplicateFootnoteAnchor} for the exact
 * test.
 *
 * A byte-identical `foot` is required, not merely a matching `type` —
 * real BYZ2018 Revelation 7:5 carries two adjacent textless anchors whose
 * `foot` values genuinely differ (`"B ... ⇒ _ΙΒ"` against a separate `"N
 * ..."` variant note immediately after), and neither is a finding: each is
 * its own distinct apparatus entry, not a repeat of the other.
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
// Check 15 — adjacent siblings that differ in nothing but their own text
// ---------------------------------------------------------------------------

/** The only two keys, besides `text` itself, check 15's own merge tolerates on either side of a pair. `marks`/`script` describe formatting the merge already requires the two nodes to agree on ({@link agreesInFormatting}); any other key — `strong`, `foot`, `bibleLink`, nested `content`, `paragraph`, `break`, `lemma`, `morph` — ties a whole different kind of information to one specific tag occurrence, and merging the node away would either lose that information or have to guess which side of the pair keeps it. */
const MERGEABLE_EXTRA_KEYS = new Set(["marks", "script"]);

/**
 * True when `node` renders real text of its own and carries nothing beyond
 * that but `marks`/`script` — a bare string trivially qualifies (no keys of
 * its own beyond its own characters), and a `{text}`-only object qualifies
 * identically once the schema's own equivalence between the two is taken at
 * face value. Any other property disqualifies the node outright; see {@link
 * MERGEABLE_EXTRA_KEYS}'s own doc comment for why.
 *
 * Takes both the raw `node` and its already-computed `shape` rather than
 * `shape` alone: {@link NodeShape} deliberately exposes only a named subset
 * of a node's own properties (`strong`, `hasFoot`, and so on), not its full
 * key set, so a node carrying `lemma` or `morph` with no `strong` — legal
 * per the schema, even though this corpus carries none today (per
 * `functions/tagScriptRunsInContent.ts`'s own measurement) — still needs a
 * real answer rather than an assumption. `shape.text` is reused rather than re-derived: a `heading`/
 * `subtitle`/`bibleLink` wrapper and a `ContentNested` wrapper both already
 * read as `text: undefined` in {@link describeNode}, so requiring it here
 * excludes all four boundary shapes for free, with no separate boundary
 * check of its own needed.
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
 * isMergeableTextNode} and agree with each other in `marks`/`script` (see
 * {@link agreesInFormatting}, reused verbatim rather than re-derived, the
 * same formatting-agreement question checks 1 and 4 already ask) — left
 * split for no reason a reader could name, real YLT1898 shape: a heading's
 * own `"The Angel of the "` immediately followed by `{text: "Jehovah"}`.
 *
 * **Distinct from check 1 and check 4, not a re-derivation of either.**
 * Check 1 covers an untagged connector beside a *tagged* neighbor (`strong`/
 * `foot`/`break`); check 4 covers a *blank*, whitespace-only node between two
 * agreeing real nodes. Neither covers two adjacent *plain* nodes that agree
 * with each other and carry real text on both sides, which is exactly why
 * these pairs survive corpus-wide today.
 *
 * One finding per adjacent pair, not one per run — a real three-node chain
 * (YLT1898 1 Chronicles 13:1's heading: `"The Ark of the "`, `{text:
 * "Jehovah"}`, `" is brought to Jerusalem"`) reports two findings here, the
 * same per-pair convention {@link scanArrayForMarkBoundarySpaces} and {@link
 * scanArrayForFootnotePunctuationOrder} already use; the fixer is the one
 * that folds a whole chain into a single node.
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
// Check 16 — a non-standard whitespace character in content text
// ---------------------------------------------------------------------------

/** Every whitespace-shaped character this repo's own content convention never writes into prose — a non-breaking space, the Unicode General-Punctuation space-separator run, a narrow/medium-mathematical/ideographic space, a word joiner or zero-width no-break space (byte-order-mark), a tab, or a bare carriage return/line feed. An ordinary ASCII space (U+0020) is deliberately absent — it's this corpus's only sanctioned whitespace character, and the one every other check in this module already reasons about. Written entirely as `\u` escapes rather than the literal (invisible or look-alike) characters themselves, so every codepoint this check targets stays legible and auditable in source. */
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
 * **Report-only, permanently, the same reason as {@link hasStraightQuote}.**
 * Replacing a non-breaking space needs to know whether the source meant it
 * to hold two words together (an English "10 a.m." or a French guillemet
 * pairing, where collapsing it to an ordinary space would let the two
 * halves wrap apart on a narrow screen) or whether it's plain import noise
 * a plain space should simply replace — a judgment the character alone
 * cannot supply.
 */
function hasNonStandardWhitespace(shape: NodeShape): boolean {
  return shape.text !== undefined && NON_STANDARD_WHITESPACE.test(shape.text);
}

/**
 * Builds the report detail behind one non-standard-whitespace finding —
 * which code point it was, and a short excerpt of the surrounding text —
 * for a node's own `text` already known to satisfy {@link
 * hasNonStandardWhitespace}. Kept separate from the predicate, matching
 * {@link describeStraightQuoteFinding}'s own reasoning: the per-node loop
 * below tests cheaply with a boolean first, and only pays for building the
 * excerpt on an actual finding.
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

/** All fifteen of the checks findable within one array level (and everything nested beneath it) — the shape {@link findStrongsNodeIssues} returns. Check 6 needs a whole book's own verse sequence and is never part of this shape; see {@link findStrongsNodeIssues}'s own doc comment. */
interface LevelFindings {
  /** Check 1's findings. */
  unmergedPairs: PairFinding[];
  /** Check 14's findings. */
  duplicateFootnoteAnchors: DuplicateFootnoteAnchorFinding[];
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
  /** Check 8's findings. */
  footnotePunctuationOrder: FootnotePunctuationOrderFinding[];
  /** Check 9's findings. */
  markBoundaryEmbeddedSpaces: MarkBoundaryEmbeddedSpaceFinding[];
  /** Check 10's findings — each entry is the offending node's own path (e.g. `content[3]`), not a full finding object, matching Checks 2 and 7's own shape. */
  ellipsisFindings: string[];
  /** Check 11's findings. */
  straightQuoteFindings: StraightQuoteFinding[];
  /** Check 12's findings. */
  footnoteMarkerAfterWhitespace: FootnoteMarkerAfterWhitespaceFinding[];
  /** Check 13's findings — each entry is the offending node's own path (e.g. `content[3]`), not a full finding object, matching Checks 2, 7, and 10's own shape. */
  untaggedScriptRuns: string[];
  /** Check 15's findings. */
  mergeableSiblingPairs: MergeableSiblingsFinding[];
  /** Check 16's findings. */
  nonStandardWhitespaceFindings: NonStandardWhitespaceFinding[];
}

/**
 * Walk one array level and every node's own nested levels — `heading`,
 * `subtitle`, a `{paragraph: <content>}` wrapper, a `ContentNested`
 * wrapper's own `content`, and a footnote body's own `foot.content` —
 * collecting all fourteen of the checks findable this way (every check in
 * {@link LevelFindings} except check 5, which only ever looks at a verse's
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
 * Walk one verse's whole content tree for checks 1-5 and 7-16 at once
 * (fifteen checks total).
 *
 * Check 5 is not recursive like the other fourteen — it only ever looks at
 * this verse's own outermost content, so it runs once here rather than
 * inside {@link walkLevel}. Check 6 ({@link findHeadingParagraphMismatches})
 * is not included here at all — it needs a whole book's own verse sequence
 * to decide anything, not one verse in isolation, so it runs separately.
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

/** One straight-quote/apostrophe/backtick finding, with its file/verse identity attached. */
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

/** One version's own audit: its id, and every finding {@link auditVersion} found, across all sixteen checks. */
export interface VersionAudit {
  /** The version id audited (e.g. `KJV1769`). */
  version: string;
  /** Check 1's findings, corpus-wide for this version. */
  unmergedPairs: readonly UnmergedStrongPairFinding[];
  /** Check 14's findings, corpus-wide for this version — a textless node whose own `foot` byte-for-byte repeats its immediate predecessor's. */
  duplicateFootnoteAnchors: readonly DuplicateFootnoteAnchorFileFinding[];
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
  /** Check 8's findings, corpus-wide for this version — a footnote marker rendering before punctuation that belongs to the same span. */
  footnotePunctuationOrder: readonly FootnotePunctuationOrderFileFinding[];
  /** Check 9's findings, corpus-wide for this version — a mark-boundary space embedded inside a node's own text at a boundary where the two real sides disagree. */
  markBoundaryEmbeddedSpaces: readonly MarkBoundaryEmbeddedSpaceFileFinding[];
  /** Check 10's findings, corpus-wide for this version — a node whose own text still carries a dot run this repo's own ellipsis convention would rewrite, or the one two-period shape it deliberately never rewrites on its own. */
  ellipsisFindings: readonly EllipsisFinding[];
  /** Check 11's findings, corpus-wide for this version — a node whose own text still carries an ASCII straight quote, apostrophe, or backtick. Report-only; there is no auto-fix for this one (see {@link hasStraightQuote}'s own doc comment for why). */
  straightQuoteFindings: readonly StraightQuoteFileFinding[];
  /** Check 12's findings, corpus-wide for this version — a footnote marker rendering immediately after whitespace, extending the leading-space convention check 2 already enforces for `strong` to `foot`. */
  footnoteMarkerAfterWhitespace: readonly FootnoteMarkerAfterWhitespaceFileFinding[];
  /** Check 13's findings, corpus-wide for this version — a node whose own text mixes a Latin letter with an untagged Hebrew or Greek letter. */
  untaggedScriptRuns: readonly UntaggedScriptRunFinding[];
  /** Check 15's findings, corpus-wide for this version — two adjacent nodes that carry nothing but `text` (optionally agreeing `marks`/`script`) and should have merged into one. */
  mergeableSiblingPairs: readonly MergeableSiblingsFileFinding[];
  /** Check 16's findings, corpus-wide for this version — a node whose own text still carries a non-breaking space, an exotic Unicode space, a zero-width/joining control, a tab, or a bare newline. Report-only; there is no auto-fix for this one (see {@link hasNonStandardWhitespace}'s own doc comment for why). */
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
    footnoteMarkerAfterWhitespace,
    untaggedScriptRuns,
    mergeableSiblingPairs,
    nonStandardWhitespaceFindings,
  };
}

/**
 * Audit each named version, or every version directory under
 * `bible-versions/` when none are named — deliberately not a curated list
 * (see this module's own top doc comment): a version with no `strong`
 * values and no un-normalized fraction, ellipsis, straight quote,
 * non-standard whitespace character, untagged script run, duplicate
 * footnote anchor, or mergeable sibling pair at all just reports zero
 * findings across all sixteen checks.
 *
 * @param versionIds - Versions to audit; defaults to {@link getVersionDirectories}.
 */
export function auditVersions(
  versionIds: readonly string[] = getVersionDirectories(),
): VersionAudit[] {
  return versionIds.map((version) => auditVersion(version));
}

/** The exit code this check should report — non-zero when any version carries any finding across any of the sixteen checks. */
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
      summary.footnoteMarkerAfterWhitespace.length > 0 ||
      summary.untaggedScriptRuns.length > 0 ||
      summary.mergeableSiblingPairs.length > 0 ||
      summary.nonStandardWhitespaceFindings.length > 0,
  )
    ? 1
    : 0;
}

/**
 * Prints one version's own findings across all sixteen checks — the first `cap`
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
    `  ${summary.straightQuoteFindings.length} node(s) whose own text still carries an ASCII straight quote, apostrophe, or backtick`,
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
 * True when a version's audit found nothing across any of the sixteen
 * checks — printed as a single skipped line rather than an empty block, so a
 * report over every version on disk stays readable.
 *
 * Exported so `validate.ts` can reuse this same clean/dirty test rather than
 * re-deriving it from `VersionAudit`'s sixteen finding arrays itself.
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
    summary.footnoteMarkerAfterWhitespace.length === 0 &&
    summary.untaggedScriptRuns.length === 0 &&
    summary.mergeableSiblingPairs.length === 0 &&
    summary.nonStandardWhitespaceFindings.length === 0
  );
}

