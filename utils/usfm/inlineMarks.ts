/**
 * The generic inline-run-building machinery: turns an ordered sequence of
 * already-classified text pieces (a word's own text, its `strong` number if
 * any, and whatever `marks` were active when it was read) into
 * `content-schema.json`-shaped nodes, following three Strong's-attachment
 * conventions:
 *
 *  1. The joining space between two words leads the node after the gap,
 *     never trails the node before it (`{"text": "In the beginning",
 *     "strong": "H7225"}, {"text": " God", "strong": "H430"}` — never the
 *     inverted form this importer once shipped by mistake).
 *  2. An untagged connector word merges *forward* by default, into the
 *     `strong`- or `foot`-carrying node it precedes, becoming that node's
 *     leading text. It merges *backward*, into the nearest preceding
 *     `strong`-carrying node, only as a fallback when nothing eligible
 *     follows in the same run of matching marks — a `foot`-only node is
 *     never a backward target, since appending text after it would push
 *     real prose past the footnote's own marker (see
 *     {@link isBackwardMergeTarget}). Neither direction crosses a marks
 *     mismatch, and a connector that already carries its own `foot` never
 *     merges in either direction (see {@link isConnector}).
 *  3. Tight (closing) punctuation glued to a word with no space of its own
 *     — a comma, period, semicolon, colon, exclamation/question mark,
 *     closing quote or bracket — trails the word it ends, never leads the
 *     word after it, the mirror of rule 1 (see
 *     {@link moveTrailingPunctuationBackward}). An opening mark and a dash
 *     are exempt.
 *
 * Built generically over a run of classified pieces, not hard-coded to "a
 * verse" — this is what lets `usfm/footnotes.ts` reuse it unchanged for
 * footnote bodies. `InlineTextPiece`'s `script` (original-language tagging)
 * and `foot` (a footnote attached to the piece its own `\f` marker
 * immediately follows) fields exist only because footnote bodies need
 * them; ordinary verse content never does.
 */

import Content, { ContentHeading, ContentObject, ContentSubtitle } from "../../types/Content";
import Footnote from "../../types/Footnote";

/** The only two marks this source can ever produce — `sc`/`b` never occur; building handling for them would be dead code, not defensive completeness. */
export type InlineMarkName = "woc" | "i";

/**
 * One already-classified run of raw text, in source order, before
 * whitespace normalization or connector-merging — `usfm/segmentVerses.ts`'s
 * token walk produces one of these per `\w`/`\+w` word (with `strong` from
 * the tag's attribute) and one per run of plain text in between (no
 * `strong`), each carrying whatever `marks` were active when it was read
 * (`\wj`'s `woc`, `\qs`'s `i`, or neither).
 */
export interface InlineTextPiece {
  /**
   * The piece's own literal text. Absent only when the piece carries just
   * `foot` with nothing preceding it to attach to (e.g., Mark 16:9's
   * footnote opens its verse) — matches `content-schema.json`'s existing
   * precedent for a content object whose only property is `foot`
   * (ASV1901's Luke 17:36).
   */
  readonly text?: string;
  /** The Strong's number this piece's `\w`/`\+w` tag carries, if any. */
  readonly strong?: string;
  /** Marks this as an original-language word embedded in a footnote body (`usfm/footnotes.ts`) — never present alongside `foot` on the same piece. */
  readonly script?: "G" | "H";
  /** The marks active when this piece was read (`\wj`'s `woc`, `\qs`'s `i`). */
  readonly marks?: readonly InlineMarkName[];
  /** A footnote or cross-reference attached to this piece, its marker immediately following it. */
  readonly foot?: Footnote;
}

/**
 * Compares two nodes' `marks` for equality. Typed against `ContentObject`'s
 * full mark vocabulary, not just this module's {@link InlineMarkName},
 * since {@link mergeConnectors} operates on already-built nodes generically
 * and must not reject a mark it never produces itself.
 */
function sameMarks(
  a: readonly NonNullable<ContentObject["marks"]>[number][] | undefined,
  b: readonly NonNullable<ContentObject["marks"]>[number][] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((mark, index) => mark === right[index]);
}

/**
 * A real, printable connector word (or stray punctuation) with no `strong`
 * of its own — what {@link mergeConnectors} looks for a home for. Pure
 * whitespace is handled earlier by {@link foldWhitespaceIntoNeighbors} and
 * is never a candidate here.
 *
 * Excludes a node carrying `foot` (merging would misattach the footnote
 * already placed on it — `utils/auditNodes.ts`'s `isMergeableConnector`
 * enforces the same exclusion) or `script` (an original-language word is
 * real tagged content, not a stray connector).
 */
function isConnector(node: ContentObject): boolean {
  return (
    node.strong === undefined &&
    node.foot === undefined &&
    node.script === undefined &&
    typeof node.text === "string" &&
    node.text.length > 0
  );
}

/**
 * A valid merge target for the connector immediately *before* it — the
 * default, forward-merge direction, which prepends the connector's text
 * onto this node's text. Requires `strong` and/or `foot` plus real text;
 * excludes a textless Strong's-only sibling (`{"strong": "H853"}`, no
 * `text` at all — the KJV1769 convention for a tag with nothing
 * of its own to attach text to), which stops a backward scan rather than
 * becoming a home for untagged prose, and excludes a node that opens a new
 * paragraph.
 *
 * Deliberately *includes* a `foot`-carrying node as a valid forward
 * target, even though merging into one looks risky (footnote
 * misattachment): Genesis 1:1's `\w beginning|strong="H7225"\w*, \w
 * God|strong="H8064"\w*\f +...\f*` needs its comma-and-space connector to
 * merge forward into "God" so {@link moveTrailingPunctuationBackward} can
 * later peel the leading comma back onto "beginning" — the same result
 * produced when "God" carries no footnote at all. A merge target's `foot`
 * survives the later punctuation move untouched, so nothing is lost.
 * `utils/auditNodes.ts`'s independently tested `canJoinForward` confirms
 * this: it checks `target.strong`/`target.text`/`!target.opensParagraph`,
 * never `!target.hasFoot`.
 *
 * Also accepts a `foot`-only node with *no* `strong` at all — needed once
 * Strong's numbers are suppressed (WEBUS2020's `strongs: false`): Genesis
 * 1:1's "God" still carries a real footnote, but with `strong` gone there
 * was nothing left to mark it as a target, so the preceding connector
 * ("In the beginning, ") had nowhere to merge into and the importer cut a
 * needless third node instead of the real two. `strong`/`foot` are checked
 * identically — either one alone qualifies a node as a target, since both
 * are "a suffix that attaches to the end of accumulated text"
 * (`utils/auditNodes.ts`'s own broadened `canJoinForward` uses the
 * identical characterization).
 *
 * The paragraph-opening exclusion is unreachable from this module's real
 * call sites today — `paragraph`/`break` are attached by
 * `usfm/blockStructure.ts` only *after* this function has already run (see
 * {@link isBackwardMergeTarget}) — but costs one boolean check to keep
 * correct for a future caller that hands it nodes where it matters.
 */
function isMergeTarget(node: ContentObject): boolean {
  return (
    (node.strong !== undefined || node.foot !== undefined) &&
    typeof node.text === "string" &&
    node.text.length > 0 &&
    node.paragraph !== true
  );
}

/**
 * A valid merge target for the *backward* fallback specifically —
 * narrower than {@link isMergeTarget}, which also accepts a `foot`-only
 * node as a *forward* target. The backward fallback appends the
 * connector's text *after* this node's text (the forward default
 * prepends); appending after a `foot`-carrying node would push real,
 * un-footnoted text past the footnote's own marker, silently extending
 * the footnoted span beyond its real anchor. Safe for a bare `strong` (a
 * label, not a positional marker) but never for `foot`, regardless of
 * whether `strong` is also present.
 *
 * Genesis 1:1's WEBUS2020 shape, once Strong's numbers are suppressed,
 * shows why this asymmetry matters: "In the beginning, " merges *forward*
 * into "God"+`foot` via {@link isMergeTarget}. Without this narrower
 * backward check, the trailing connector left over after "God" (" created
 * the heavens and the earth.") would then fall back onto that same,
 * already-merged node — producing one node covering the whole verse with
 * `foot` seemingly attached to all of it, instead of the real two-node
 * split (the footnote's marker belongs right after "God", not after
 * "earth.").
 */
function isBackwardMergeTarget(node: ContentObject): boolean {
  return node.strong !== undefined && typeof node.text === "string" && node.text.length > 0;
}

/**
 * Folds every pure-whitespace piece onto the *leading* edge of the piece
 * that follows it — convention #1 above, applied unconditionally, before
 * any marks-aware merge decision, since a joining space has no color to
 * preserve. A trailing whitespace piece with nothing after it (the run's
 * last piece) folds backward instead, onto whatever precedes it;
 * {@link buildRunNodes}'s edge-trim then strips it from the run's outer
 * boundary.
 *
 * Kept as a separate, earlier pass from {@link mergeConnectors}: a real,
 * printable connector word (Genesis 2:4's real `"the "` beside a
 * mark-mismatched `"Lord"`) can legitimately stay split from its neighbor;
 * a bare joining space never can, since nothing would then own it.
 */
function foldWhitespaceIntoNeighbors(pieces: readonly InlineTextPiece[]): InlineTextPiece[] {
  const result: InlineTextPiece[] = pieces.map((piece) => ({ ...piece }));

  for (let index = 0; index < result.length; index++) {
    const piece = result[index];
    // A foot-only piece (no `text` at all — see {@link InlineTextPiece})
    // isn't pure whitespace either: it carries a footnote, not something
    // to fold.
    if ((piece.text ?? "").trim().length > 0 || piece.strong !== undefined || piece.foot !== undefined) continue;

    const next = result[index + 1];
    if (next !== undefined) {
      result[index + 1] = { ...next, text: (piece.text ?? "") + (next.text ?? "") };
      result.splice(index, 1);
      index--;
      continue;
    }

    const previous = result[index - 1];
    if (previous !== undefined) {
      result[index - 1] = { ...previous, text: (previous.text ?? "") + (piece.text ?? "") };
      result.splice(index, 1);
      index--;
    }
  }

  return result;
}

/**
 * Merges adjacent connector pieces (no `strong`, real non-blank text) that
 * agree in `marks` into one. Handles a real WEBUS2020 shape: Genesis
 * 30:24's `\w Joseph|strong="H3130"\w*,\f ...\f* saying, "\w
 * May|strong="H3068"\w*...` puts a footnote between two connector runs
 * (`","` and `" saying, "`) — once the footnote is dropped from this pass,
 * the two runs are directly adjacent and belong together as one
 * connector, not two halves each too short to find a home on its own.
 *
 * Never merges across a `foot`/`script` mismatch: a footnote-only piece
 * must never absorb a neighboring connector's text (the same rule
 * {@link isConnector}/{@link isMergeTarget} enforce one pass later, on
 * built nodes), and a `script`-tagged original-language piece must never
 * absorb a plain-Latin neighbor's text — the two would end up as one node
 * mixing two scripts under a single `script` tag.
 */
function coalesceAdjacentConnectors(pieces: readonly InlineTextPiece[]): InlineTextPiece[] {
  const result: InlineTextPiece[] = [];

  for (const piece of pieces) {
    const previous = result[result.length - 1];
    if (
      previous !== undefined &&
      previous.strong === undefined &&
      piece.strong === undefined &&
      previous.foot === undefined &&
      piece.foot === undefined &&
      previous.script === piece.script &&
      sameMarks(previous.marks, piece.marks)
    ) {
      result[result.length - 1] = { ...previous, text: (previous.text ?? "") + (piece.text ?? "") };
      continue;
    }
    result.push({ ...piece });
  }

  return result;
}

/**
 * Attaches one already-built `foot` to the last of `pieces`, mutating the
 * array in place. Shared by `usfm/segmentVerses.ts`'s `attachFoot` closure
 * (a footnote/cross-reference landing on ordinary verse content) and
 * `usfm/headings.ts`'s heading-span walker (footnotes inside a Psalm
 * superscription), rather than kept as two separately-maintained copies.
 *
 * When the last piece already carries a `foot`, a second, textless
 * `{foot}` piece is pushed instead of overwriting it —
 * `content-schema.json`'s `minProperties: 1` is satisfied by `foot` alone,
 * the same shape a bare Strong's tag with no text of its own already
 * uses. This guards a real case: Acts 7:37's footnote and cross-reference
 * sit back to back with nothing between them, where the second note would
 * otherwise overwrite the first's `foot`.
 */
export function attachFootToPieces(pieces: InlineTextPiece[], foot: Footnote): void {
  const last = pieces[pieces.length - 1];
  if (last !== undefined && last.foot === undefined) {
    pieces[pieces.length - 1] = { ...last, foot };
  } else {
    pieces.push({ foot });
  }
}

/**
 * Merges every untagged connector node into the `strong`- or `foot`-
 * carrying node it belongs to, per this module's doc comment. A pure
 * post-pass over already-built nodes, independent of how those nodes were
 * produced — this is what lets it run again once a `foot` can exist on a
 * node: a merge rule that needs to know where a footnote will land has to
 * run after footnotes exist.
 *
 * The backward fallback only fires when nothing at all follows the
 * connector — never merely because the immediate next node was
 * disqualified (a marks mismatch, an already-attached `foot`, or a
 * textless Strong's sibling). Revelation 1:17's real shape proves the
 * distinction matters: the comma-and-space between "saying" and a `\wj`
 * quotation cannot merge forward (a marks mismatch), and a naive "try
 * backward whenever forward fails" rule would glue it onto "saying"
 * instead, leaving a node ending in whitespace — the defect class `npm
 * run audit-nodes` catches. Genesis 2:4 confirms the
 * alternative is correct: its mark-mismatched connector stays standing
 * alone, unmerged in *either* direction, even with a good
 * `strong`-carrying node right behind it. Forward and backward use two
 * different eligibility checks ({@link isMergeTarget} vs. {@link
 * isBackwardMergeTarget}), not one shared predicate — see the latter's
 * doc comment for why a `foot`-only node is a valid forward target but
 * never a valid backward one.
 *
 * Scans only the immediate neighbor in each direction — this corpus never
 * has a run of several connector words in a row (`tokenize()` already
 * collapses contiguous non-marker characters into one piece) — and a
 * textless sibling in the way stops the scan outright rather than being
 * skipped past.
 */
export function mergeConnectors(nodes: readonly ContentObject[]): ContentObject[] {
  const working: ContentObject[] = nodes.map((node) => ({ ...node }));

  let index = 0;
  while (index < working.length) {
    const node = working[index];
    if (!isConnector(node)) {
      index++;
      continue;
    }

    const next = working[index + 1];
    if (next !== undefined) {
      if (isMergeTarget(next) && sameMarks(node.marks, next.marks)) {
        working[index + 1] = { ...next, text: (node.text ?? "") + (next.text ?? "") };
        working.splice(index, 1);
        continue;
      }
      // Disqualified, not absent — stays split.
      index++;
      continue;
    }

    const previous = working[index - 1];
    if (previous !== undefined && isBackwardMergeTarget(previous) && sameMarks(node.marks, previous.marks)) {
      working[index - 1] = { ...previous, text: (previous.text ?? "") + (node.text ?? "") };
      working.splice(index, 1);
      continue;
    }

    index++;
  }

  return working;
}

/**
 * A character `utils/auditNodes.ts`'s `isTightPunctuationChar` also treats
 * as tight (closing) punctuation: not a letter, digit, whitespace, dash,
 * or *opening* mark. Duplicated here deliberately rather than imported —
 * `auditNodes.ts` is a read-only, after-the-fact QA tool ("detects; does
 * not fix"), not a shared construction dependency, and this importer
 * needs to *produce* the same convention that tool independently checks
 * for.
 */
function isTightPunctuationChar(char: string): boolean {
  return !/[\p{L}\p{N}\s\p{Pd}\p{Ps}\p{Pi}]/u.test(char);
}

/** Splits `text` at the boundary between its own leading run of {@link isTightPunctuationChar} characters and everything after — `undefined` when `text` does not start with one, or when the punctuation run would consume the entire text (nothing meaningful left to attach the `strong` number to). */
function leadingTightPunctuationSplit(text: string): { punctuation: string; rest: string } | undefined {
  let index = 0;
  while (index < text.length && isTightPunctuationChar(text[index])) index++;
  if (index === 0 || index === text.length) return undefined;
  return { punctuation: text.slice(0, index), rest: text.slice(index) };
}

/** Whether `node` is a Strong's tag with nothing of its own to attach text to (the KJV1769 convention) — never a real attachment target, only a scan-through when looking for one behind it. */
function isTextlessStrongSibling(node: ContentObject): boolean {
  return node.strong !== undefined && node.text === undefined;
}

/**
 * Moves a `strong`-carrying node's leading run of tight (closing)
 * punctuation back onto the real node immediately before it — convention
 * #3 above. Runs as its own pass, after {@link mergeConnectors}, over the
 * fully merged node list: a connector merges as one unit regardless of
 * direction, so nothing in that pass can single out a connector's leading
 * characters for this treatment (the same relationship
 * `utils/auditNodes.ts`'s check 3 has to check 1). Skips over a textless
 * Strong's sibling to find the real attachment point behind it, exactly
 * as `auditNodes.ts` does.
 *
 * The `target.break`/`node.paragraph` guards mirror `auditNodes.ts`'s
 * check but are unreachable from this module's real call sites today —
 * see {@link isMergeTarget}'s doc comment for why they're kept anyway.
 */
export function moveTrailingPunctuationBackward(nodes: readonly ContentObject[]): ContentObject[] {
  const working: ContentObject[] = nodes.map((node) => ({ ...node }));

  for (let index = 0; index < working.length; index++) {
    const node = working[index];
    if (node.strong === undefined || typeof node.text !== "string") continue;

    const split = leadingTightPunctuationSplit(node.text);
    if (split === undefined) continue;

    let targetIndex = index - 1;
    while (targetIndex >= 0 && isTextlessStrongSibling(working[targetIndex])) targetIndex--;
    if (targetIndex < 0) continue;

    const target = working[targetIndex];
    if (
      typeof target.text !== "string" ||
      target.text.trim().length === 0 ||
      target.break === true ||
      node.paragraph === true ||
      !sameMarks(node.marks, target.marks)
    )
      continue;

    working[targetIndex] = { ...target, text: target.text + split.punctuation };
    working[index] = { ...node, text: split.rest };
  }

  return working;
}

/**
 * Collapses a run's leading/trailing whitespace and internal whitespace
 * runs, applied at the piece level so the boundary space stays available
 * to attach to the right node first. Drops any piece left empty by
 * trimming — except a piece carrying `foot` with no `text` at all (see
 * {@link InlineTextPiece}), which has nothing to trim and must survive:
 * it isn't empty, it simply has no text.
 */
function trimRunEdges(pieces: readonly InlineTextPiece[]): InlineTextPiece[] {
  const hasContent = (piece: InlineTextPiece): boolean => (piece.text?.length ?? 0) > 0 || piece.foot !== undefined;

  const normalized = pieces
    .map((piece) => (piece.text !== undefined ? { ...piece, text: piece.text.replace(/\s+/g, " ") } : piece))
    .filter(hasContent);
  if (normalized.length === 0) return [];

  const first = normalized[0];
  if (first.text !== undefined) normalized[0] = { ...first, text: first.text.replace(/^ /, "") };
  const lastIndex = normalized.length - 1;
  const last = normalized[lastIndex];
  if (last.text !== undefined) normalized[lastIndex] = { ...last, text: last.text.replace(/ $/, "") };

  return normalized.filter(hasContent);
}

/** Converts one already-merged {@link InlineTextPiece} into its `ContentObject` shape, omitting every property the piece does not actually carry. */
function pieceToNode(piece: InlineTextPiece): ContentObject {
  return {
    ...(piece.text !== undefined && piece.text.length > 0 ? { text: piece.text } : {}),
    ...(piece.strong !== undefined ? { strong: piece.strong } : {}),
    ...(piece.script !== undefined ? { script: piece.script } : {}),
    ...(piece.marks !== undefined && piece.marks.length > 0 ? { marks: [...piece.marks] } : {}),
    ...(piece.foot !== undefined ? { foot: piece.foot } : {}),
  };
}

/**
 * Builds one run's ordered, already-merged nodes from raw pieces —
 * whitespace folded to its leading edge, connector words attached per
 * {@link mergeConnectors} — but *not yet* collapsed to
 * `content-schema.json`'s bare-string/bare-object/array shape (see
 * {@link collapseContentNodes} for that). Kept separate because
 * `usfm/blockStructure.ts` needs to attach `paragraph`/`break` to the
 * first/last node of a whole verse's blocks before that final collapse.
 *
 * @returns `[]` when `pieces` is nothing but whitespace (or empty) —
 *   callers that require at least one node must guarantee that
 *   themselves, the way `segmentVerses.ts`'s `flushBlock` never calls
 *   this on a block it already knows is empty.
 */
export function buildRunNodes(pieces: readonly InlineTextPiece[]): ContentObject[] {
  const trimmed = trimRunEdges(coalesceAdjacentConnectors(foldWhitespaceIntoNeighbors(pieces)));
  if (trimmed.length === 0) return [];

  const merged = moveTrailingPunctuationBackward(mergeConnectors(trimmed.map(pieceToNode)));

  // Folding and merging can leave a node with doubled whitespace — a
  // word's trailing space and the next content's leading space are each
  // real, and can end up concatenated once whatever separated them merges
  // away. Collapse any resulting run to one space, matching the flat-text
  // collapse used elsewhere in this pipeline.
  return merged.map((node) => (node.text !== undefined ? { ...node, text: node.text.replace(/ {2,}/g, " ") } : node));
}

/**
 * Collapses an ordered list of already-built nodes into
 * `content-schema.json`'s three shapes (see `usfm/blockStructure.ts`'s doc
 * comment): a bare string when exactly one node carries nothing but
 * `text`, a bare object when exactly one node carries more than that, an
 * array otherwise. Never emits a node with zero properties — every node
 * reaching here already carries `text` and/or `strong`/`marks` from
 * {@link buildRunNodes}, or `paragraph`/`break` attached by the caller.
 *
 * Also accepts a `ContentHeading`/`ContentSubtitle` object
 * (`usfm/blockStructure.ts`'s `headingContent` case) alongside ordinary
 * `ContentObject` nodes — such a node never has a bare `text` key, so it
 * passes through the bare-string check unchanged like any other
 * multi-key object.
 */
export function collapseContentNodes(nodes: readonly (ContentObject | ContentHeading | ContentSubtitle)[]): Content {
  const collapsed: Content[] = nodes.map((node) => {
    const keys = Object.keys(node).filter((key) => (node as Record<string, unknown>)[key] !== undefined);
    return keys.length === 1 && keys[0] === "text" ? ((node as ContentObject).text as string) : node;
  });

  return collapsed.length === 1 ? collapsed[0] : collapsed;
}
