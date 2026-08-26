/**
 * Applies `auditNodes.ts`'s own check 1 in the one direction it ever
 * recommends: folds an ordinary, untagged connector forward into the
 * `strong`-, `foot`-, or `break`-carrying neighbor right after it
 * ({@link canJoinForward}), wherever that neighbor's own eligibility already
 * makes the fold unambiguous.
 *
 * `auditNodes.ts` ships no detection-side fix of its own — see its domain
 * doc (`_specs/ai-context/4-domains/strongs-node-audit.md`)'s "Read-only by
 * design" note — because a mechanical fixer risks getting the fold direction
 * wrong on real Bible text. This module does not reimplement that judgment:
 * it imports `describeNode`/`isMergeableConnector`/`canJoinForward` directly
 * from `auditNodes.ts` and only acts where those functions already say the
 * fold is safe, keeping exactly one "is this safe" decision in the repo.
 * What this module adds is purely mechanical: building the merged node once
 * eligibility says yes. `utils/validate.ts` calls
 * {@link mergeUnmergedNodesInContent} directly, on every run, with no flag
 * to opt in or out.
 *
 * Merging never changes rendered text — it's pure string concatenation, so a
 * verse's own visible content is byte-identical before and after. What
 * changes is only which node the combined text and the trailing `foot`/
 * `strong`/`break` end up living on.
 */

import { canJoinForward, describeNode, isMergeableConnector, NodeShape } from "./auditNodes";
import Content from "../types/Content";

/**
 * One array level's own siblings, rewritten once: every maximal run of
 * {@link isMergeableConnector} nodes immediately before a {@link
 * canJoinForward}-eligible target folds into that target's own `text`,
 * left to right, in one pass — the identical scan `scanArrayForUnmergedPairs`
 * (`auditNodes.ts`) uses to detect the same pairs, run here to actually
 * build the merged node instead of only reporting it.
 *
 * The merged node keeps every one of the target's own properties (`foot`,
 * `strong`, `break`, `marks`, `script`, …) via a shallow spread, with only
 * `text` overwritten by the run's own text prepended to the target's own —
 * safe because `canJoinForward` already confirmed every run member agrees
 * with the target in `marks`/`script`. A `paragraph: true` on the run's own
 * first member (the only position `canJoinForward` ever allows it) carries
 * onto the merged node, matching this repo's own convention of a piece
 * boundary staying on the piece's first node regardless of how many sibling
 * nodes fold into it.
 */
function mergeSiblings(nodes: readonly unknown[]): unknown[] {
  const shapes = nodes.map(describeNode);
  const result: unknown[] = [];

  let at = 0;
  while (at < nodes.length) {
    let end = at;
    while (end < nodes.length && isMergeableConnector(shapes[end])) end++;
    const target: NodeShape | undefined = shapes[end];
    const run = shapes.slice(at, end);

    if (end > at && target !== undefined && canJoinForward(run, target)) {
      const mergedText = run.map((shape) => shape.text).join("") + target.text;
      const targetNode = nodes[end] as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...targetNode, text: mergedText };
      if (shapes[at].opensParagraph) merged.paragraph = true;
      result.push(merged);
      at = end + 1;
    } else {
      result.push(nodes[at]);
      at++;
    }
  }

  return result;
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion
 * exactly (including its `content` exclusion whenever `heading`/`subtitle`/
 * `bibleLink` is present, so a `bibleLink`'s own `content` display override
 * is never mistaken for regular nested content), then returns a shallow copy
 * with those fields replaced. A string, or anything that isn't a plain
 * object, has no nested levels to rewrite and passes through unchanged.
 */
function rewriteNode(node: unknown): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const record = { ...(node as Record<string, unknown>) };

  if (record.heading !== undefined) record.heading = rewriteLevel(record.heading);
  if (record.subtitle !== undefined) record.subtitle = rewriteLevel(record.subtitle);
  if (record.heading === undefined && record.subtitle === undefined && record.bibleLink === undefined && record.content !== undefined) {
    record.content = rewriteLevel(record.content);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content) };
  }

  return record;
}

/**
 * Rewrites one `Content` value, single node or array alike — the same
 * `asArray`-then-scan shape `findStrongsNodeIssues` uses for detection,
 * except this one rebuilds instead of only reporting. A single node has no
 * siblings to merge, so only its own nested levels change (via {@link
 * rewriteNode}); an array first rewrites every child's own nested levels,
 * then merges siblings at this level.
 *
 * Collapses back to a bare node only when *this fixer's own merge* is what
 * brought the array down to one element (`content.length > 1` but
 * `merged.length === 1`) — never when the array already had exactly one
 * element and simply stayed that way, since that shape carries no check-1
 * finding at all and unwrapping it would be a cosmetic change this script
 * has no license to make.
 */
function rewriteLevel(content: unknown): unknown {
  if (Array.isArray(content)) {
    const merged = mergeSiblings(content.map(rewriteNode));
    return merged.length === 1 && content.length > 1 ? merged[0] : merged;
  }
  return rewriteNode(content);
}

/**
 * Merges every check-1-eligible unmerged pair in one verse's `content` tree,
 * recursively (`heading`, `subtitle`, a `ContentNested` wrapper's own
 * `content`, and a footnote body's own `foot.content`, mirroring
 * `auditNodes.ts`'s own `walkLevel`).
 *
 * `rewriteNode`'s own shallow `{...node}` copy at every level means
 * `rewriteLevel` always returns structurally new objects even when nothing
 * actually merged, so comparing by reference would report `changed: true` on
 * every call. Comparing the serialized bytes instead, and returning the
 * *original* `content` reference (not the freshly-copied-but-equal one) when
 * they match, keeps this function's contract identical to every other
 * content-tree transform in this repo: the original reference comes back
 * untouched when nothing changed, a new tree comes back when something did.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing merged)
 *   and whether anything did
 */
export function mergeUnmergedNodesInContent(
  content: Content,
): { content: Content; changed: boolean } {
  const rewritten = rewriteLevel(content) as Content;
  if (JSON.stringify(rewritten) === JSON.stringify(content)) {
    return { content, changed: false };
  }
  return { content: rewritten, changed: true };
}
