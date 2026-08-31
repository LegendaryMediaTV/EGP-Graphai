/**
 * Applies `auditNodes.ts`'s own mark-boundary-space check: removes a bare,
 * untagged whitespace-only node sandwiched between two real, non-blank nodes
 * that agree in `marks`/`script`, or where one side's marks are a non-empty
 * subset of the other's ({@link isFormattingSubsetOf}), rolling the blank's
 * own text onto whichever real side is the *smaller* mark set instead.
 * `utils/validate.ts` calls {@link mergeMarkBoundarySpacesInContent} on every
 * run, with no flag to opt in or out.
 *
 * **Direction is not always forward.** On exact agreement the two mark sets
 * are identical, nothing hinges on which side absorbs the blank, and this
 * module keeps the simpler forward convention. On a *subset* match the two
 * sides play different roles: the smaller side is the continuous wrapper the
 * space is genuinely part of, and the larger side carries a local addition —
 * an extra mark layered onto one specific word — the space was never inside.
 * So the blank moves toward the smaller side, in whichever direction that
 * happens to sit. Getting this backwards is a data-modeling error, not a
 * cosmetic one: a node can be the smaller side of a subset pair with *both*
 * its neighbors, in which case both stranded spaces belong on that node
 * itself, one per edge, rather than scattered outward.
 *
 * **A blocked backward direction is left alone, never forced forward
 * instead.** When the smaller side is `left` but `left` carries `strong` or
 * `foot`, appending there would violate the trailing-whitespace rule
 * (`strong`) or manufacture a footnote-marker-spacing finding
 * `fixFootnoteMarkerSpacing.ts` would re-extract next pass (`foot`). Rolling
 * forward onto `target` is no safe fallback either, even though it renders
 * identically: `target` is the larger side, so bundling the blank into its
 * text would misrepresent an ordinary joining space as part of a local
 * addition it was never inside. The real corpus shape already carries the
 * blank tagged with the wrapper's own marks, so leaving it exactly where it
 * is *is* the final shape — settled, not a decline, so nothing is counted or
 * reported. `scanArrayForMarkBoundarySpaces` carries the matching exemption;
 * the two have to agree, or the fixer spends every run "fixing" a struct that
 * was never broken.
 *
 * **A blank never crosses something that renders.** The forward walk that
 * finds the merge target steps over any textless sibling, which is right for
 * the question it asks — such a sibling shows no marks of its own, so it
 * cannot be why two nodes disagree — and wrong for the separate question of
 * where the blank's characters may land. A bare `{foot: {...}}` node renders
 * its marker, and a marker's rendered position is decided by which side of it
 * the whitespace sits on, so carrying the blank past one changes which word
 * that marker annotates. With a marker in between, neither resolution is
 * available — deleting the blank would fuse the two real words together — so
 * it stays where it is, which is already what should render: a marker with a
 * word glued to each side. Settled, not a decline. {@link
 * findFirstRenderedIndex} in `auditNodes.ts` owns the distinction the two
 * questions turn on. The redundant case below still resolves with a marker in
 * between, since a deletion moves nothing across it.
 *
 * **A redundant blank is deleted, not merged.** When the side it would land
 * on already carries its own whitespace on that edge, merging would silently
 * double it into `"  "`, so the blank is removed instead — the doubling guard
 * `fixMarkBoundaryEmbeddedSpaces.ts` applies for the identical failure mode,
 * checked on whichever edge this blank is about to land on.
 *
 * `isFormattingSubsetOf` and `isBlankConnector` are re-derived here rather
 * than imported, since `auditNodes.ts` exports neither; keeping local copies
 * beats widening that module's exports, the same reuse-by-copy the sibling
 * fixers already apply.
 */

import Content from "../types/Content";
import {
  agreesInFormatting,
  describeNode,
  findFirstRenderedIndex,
  isRealAttachmentPoint,
  NodeShape,
} from "./auditNodes";

/**
 * True when two nodes agree closely enough on `marks`/`script` that a
 * mismatch could not be why they stayed split — the identical test
 * `auditNodes.ts`'s own private `isFormattingSubsetOf` applies.
 */
function isFormattingSubsetOf(a: NodeShape, b: NodeShape): boolean {
  if (a.script !== b.script) return false;
  const [smaller, larger] = a.marks.length <= b.marks.length ? [a.marks, b.marks] : [b.marks, a.marks];
  return smaller.length > 0 && smaller.every((mark) => larger.includes(mark));
}

/**
 * True for a node whose own `text` is nonempty but entirely whitespace — a
 * bare joining space with no `strong`/`foot` of its own, the identical test
 * `auditNodes.ts`'s own private `isBlankConnector` applies.
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

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string *is*
 * its own text, so it's replaced outright; an object node keeps every other
 * property via a shallow spread.
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/** Running fixed count, threaded through recursion and mutated in place. This module never reports a decline — the shapes it leaves alone are already correct — so there is no `SkipReason` to carry alongside it. */
interface FixCounts {
  /** How many findings this run has fixed. */
  fixed: number;
}

/**
 * Scan one array level left to right for a blank node eligible per {@link
 * scanArrayForMarkBoundarySpaces}'s own detection (mirrored here so the two
 * never drift on what counts as a finding) and resolve it one of three ways:
 * merge it onto whichever real side is the smaller mark set, delete it when
 * that side already carries its own whitespace on the landing edge, or leave
 * it exactly as it is. The third outcome is neither a fix nor a decline — see
 * the top doc comment's "blocked backward direction" and "never crosses
 * something that renders" sections for the two shapes that reach it, and the
 * matching audit exemptions that keep them from being reported.
 *
 * Re-describes every node fresh from the current working copy on each
 * iteration and tracks removals in a `Set` rather than splicing immediately,
 * the chain-safety discipline every fixer in this repo uses: an earlier
 * deletion in the same pass must be visible before a later node's
 * `left`/`target` lookup is judged, without the index arithmetic of an
 * in-place splice.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: FixCounts): unknown[] {
  const working: unknown[] = [...nodes];
  const removed = new Set<number>();

  for (let i = 0; i < working.length; i++) {
    if (removed.has(i)) continue;
    const shape = describeNode(working[i]);
    if (!isBlankConnector(shape) || shape.endsBreak) continue;

    let leftIndex = i - 1;
    while (leftIndex >= 0 && removed.has(leftIndex)) leftIndex--;
    if (leftIndex < 0) continue;
    const left = describeNode(working[leftIndex]);
    if (!isRealAttachmentPoint(left)) continue;

    let j = i + 1;
    while (
      j < working.length &&
      (removed.has(j) || describeNode(working[j]).isTextlessStrongSibling || describeNode(working[j]).isTextlessFootSibling)
    ) {
      j++;
    }
    if (j >= working.length) continue;

    const target = describeNode(working[j]);
    if (!isRealAttachmentPoint(target) || target.opensParagraph) continue;

    const exact = agreesInFormatting(left, target);
    const subset = !exact && isFormattingSubsetOf(left, target);
    if (!exact && !subset) continue;

    const blankText = shape.text as string;
    const leftText = left.text as string;
    const targetText = target.text as string;

    // Which real side absorbs the blank (top doc comment's direction rule).
    // Comparing lengths is enough to find the smaller side: `subset` already
    // guarantees the two differ, since a non-empty subset of equal length
    // would have matched `exact` instead. Exact agreement has no
    // wrapper/addition distinction at all, so it keeps the forward direction.
    const wantsBackward = subset && left.marks.length < target.marks.length;

    if (wantsBackward) {
      if (left.strong !== undefined || left.hasFoot) {
        // Left alone, not forced forward instead: backward would corrupt a
        // strong/foot invariant, forward would bundle the blank into
        // `target`'s larger, unrelated mark set. Already the settled shape,
        // so this is neither counted as a fix nor tracked as a decline (top
        // doc comment's "blocked backward direction" section).
        continue;
      }
      if (/\s$/.test(leftText)) {
        // Redundant: the source already carries its own trailing space, so
        // the blank is dropped rather than doubled.
        removed.add(i);
        counts.fixed++;
        continue;
      }
      working[leftIndex] = withText(working[leftIndex], leftText + blankText);
      removed.add(i);
      counts.fixed++;
      continue;
    }

    if (/^\s/.test(targetText)) {
      // Redundant: the receiver already carries its own leading space, so
      // the blank is dropped rather than doubled. Reached before the
      // crossing guard below on purpose — a deletion moves nothing across
      // whatever sits in between, and when that is a marker, this *is* the
      // resolution for a marker with whitespace on both sides.
      removed.add(i);
      counts.fixed++;
      continue;
    }

    // A footnote marker renders between the blank and `target`, so the blank
    // has nowhere to go and stays put — settled, not a decline (top doc
    // comment's "never crosses something that renders" section). Describing
    // the working copy straight through is safe: every slot `removed` holds
    // is a blank this same pass already merged away, all of them behind the
    // blank being judged, so a forward walk from `i` never meets one.
    if (findFirstRenderedIndex(working.map(describeNode), i + 1) !== j) continue;

    working[j] = withText(working[j], blankText + targetText);
    removed.add(i);
    counts.fixed++;
  }

  return working.filter((_, index) => !removed.has(index));
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion,
 * then returns a shallow copy with those fields replaced. A string, or
 * anything that isn't a plain object, has no nested levels to rewrite and
 * passes through unchanged.
 */
function rewriteNode(node: unknown, counts: FixCounts): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const record = { ...(node as Record<string, unknown>) };

  if (record.heading !== undefined) record.heading = rewriteLevel(record.heading, counts);
  if (record.subtitle !== undefined) record.subtitle = rewriteLevel(record.subtitle, counts);
  if (record.heading === undefined && record.subtitle === undefined && record.bibleLink === undefined && record.content !== undefined) {
    record.content = rewriteLevel(record.content, counts);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content, counts) };
  }

  return record;
}

/**
 * Rewrites one `Content` value, single node or array alike. A single node
 * has no siblings to merge with, so only its own nested levels change (via
 * {@link rewriteNode}); an array first rewrites every child's own nested
 * levels, then resolves blanks at this level via {@link rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: FixCounts): unknown {
  if (Array.isArray(content)) {
    const children = content.map((node) => rewriteNode(node, counts));
    return rewriteArrayLevel(children, counts);
  }
  return rewriteNode(content, counts);
}

/**
 * Resolves every mark-boundary-space finding in one verse's `content` tree,
 * recursively (`heading`, `subtitle`, a `ContentNested` wrapper's own
 * `content`, and a footnote body's own `foot.content`, mirroring
 * `auditNodes.ts`'s own `walkLevel`). The shapes this module leaves alone are
 * already correct rather than declined, so there is nothing to report for
 * them and no `skipped` in the return.
 *
 * `changed` reflects `counts.fixed`, not a `JSON.stringify` comparison —
 * nothing here is ever left half-changed, so counting the fixes is exact.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing was
 *   fixed) and whether anything changed
 */
export function mergeMarkBoundarySpacesInContent(
  content: Content,
): { content: Content; changed: boolean } {
  const counts: FixCounts = { fixed: 0 };
  const rewritten = rewriteLevel(content, counts) as Content;
  return counts.fixed > 0 ? { content: rewritten, changed: true } : { content, changed: false };
}
