/**
 * Applies `auditNodes.ts`'s own duplicate-footnote-anchor check: deletes a
 * node that renders no visible text of its own and whose `foot` is byte-for-byte identical to
 * the nearest node before it that wasn't itself already deleted — real
 * BYZ2018 2 Corinthians 7:12 shape, three consecutive nodes sharing one
 * apparatus note, the first attached to real text and the second and third
 * bare `{foot: {...}}` anchors repeating it with nothing of their own to
 * attach it to.
 *
 * **No `SkipReason`, unlike this repo's other node-placement fixers.** The
 * judgment this reuses — {@link isDuplicateFootnoteAnchor} — is already the
 * exact, tight boundary between a defect and the far more common correct
 * shape (a note legitimately annotating two real word occurrences, each on
 * its own text-bearing node): once a node passes that test, deleting it is
 * always safe, with no further eligibility question left to ask. See that
 * function's own doc comment in `auditNodes.ts` for the reasoning and the
 * real cases on both sides of the line.
 *
 * Deletion is a structural change — one array shrinks by a node — so this
 * mirrors `fixMarkBoundaryEmbeddedSpaces.ts`'s own `rewriteNode`/`rewriteLevel`
 * recursion into `heading`, `subtitle`, a `ContentNested` wrapper's own
 * `content`, and a footnote body's own `foot.content`, rather than routing
 * through `functions/mapContentText.ts` (whose own doc comment excludes
 * exactly this kind of restructure).
 */

import Content from "../types/Content";
import {
  describeNode,
  isDuplicateFootnoteAnchor,
  NodeShape,
} from "./auditNodes";

/**
 * Deletes every duplicate anchor from one array level,
 * left to right. Tracks the last node actually kept (not simply the
 * previous array index), the same "nearest node not itself flagged for
 * deletion" rule `scanArrayForDuplicateFootnoteAnchors` uses in
 * `auditNodes.ts` — a chain of two or more repeats (the real BYZ2018 2
 * Corinthians 7:12 shape) all compare against the one real node, so all of
 * them fall, not just the one immediately touching it.
 */
function rewriteArrayLevel(nodes: readonly unknown[]): { nodes: unknown[]; changed: boolean } {
  const kept: unknown[] = [];
  const keptShapes: NodeShape[] = [];
  let changed = false;

  for (const node of nodes) {
    const shape = describeNode(node);
    const target = keptShapes[keptShapes.length - 1];
    const targetNode = kept[kept.length - 1];

    if (
      target !== undefined &&
      isDuplicateFootnoteAnchor(node, shape, targetNode, target)
    ) {
      changed = true;
      continue; // deleted — not kept, so a later repeat still compares against target
    }

    kept.push(node);
    keptShapes.push(shape);
  }

  return changed ? { nodes: kept, changed: true } : { nodes: [...nodes], changed: false };
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion
 * exactly, then returns a shallow copy with those fields replaced. A
 * string, or anything that isn't a plain object, has no nested levels to
 * rewrite and passes through unchanged.
 */
function rewriteNode(node: unknown): { node: unknown; changed: boolean } {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return { node, changed: false };
  const record = { ...(node as Record<string, unknown>) };
  let changed = false;

  if (record.heading !== undefined) {
    const result = rewriteLevel(record.heading);
    if (result.changed) {
      record.heading = result.value;
      changed = true;
    }
  }
  if (record.subtitle !== undefined) {
    const result = rewriteLevel(record.subtitle);
    if (result.changed) {
      record.subtitle = result.value;
      changed = true;
    }
  }
  if (
    record.heading === undefined &&
    record.subtitle === undefined &&
    record.bibleLink === undefined &&
    record.content !== undefined
  ) {
    const result = rewriteLevel(record.content);
    if (result.changed) {
      record.content = result.value;
      changed = true;
    }
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    const result = rewriteLevel(foot.content);
    if (result.changed) {
      record.foot = { ...foot, content: result.value };
      changed = true;
    }
  }

  return changed ? { node: record, changed: true } : { node, changed: false };
}

/**
 * Rewrites one `Content` value, single node or array alike — the same
 * `asArray`-then-scan shape `findStrongsNodeIssues` uses for detection,
 * except this one rebuilds instead of only reporting. A single node has no
 * siblings to delete, so only its own nested levels change (via {@link
 * rewriteNode}); an array first rewrites every child's own nested levels,
 * then deletes duplicate anchors at this level via {@link
 * rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(content)) {
    let childrenChanged = false;
    const rewrittenChildren = content.map((node) => {
      const result = rewriteNode(node);
      if (result.changed) childrenChanged = true;
      return result.node;
    });

    const { nodes: afterDeletion, changed: deletionChanged } = rewriteArrayLevel(rewrittenChildren);
    return { value: afterDeletion, changed: childrenChanged || deletionChanged };
  }
  const result = rewriteNode(content);
  return { value: result.node, changed: result.changed };
}

/**
 * Deletes every duplicate footnote anchor in one verse's
 * `content` tree, recursively (`heading`, `subtitle`, a `ContentNested`
 * wrapper's own `content`, and a footnote body's own `foot.content`,
 * mirroring `auditNodes.ts`'s own `walkLevel`).
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing was deleted) and whether anything changed
 */
export function removeDuplicateFootnoteAnchorsInContent(
  content: Content,
): { content: Content; changed: boolean } {
  const result = rewriteLevel(content);
  return result.changed
    ? { content: result.value as Content, changed: true }
    : { content, changed: false };
}
