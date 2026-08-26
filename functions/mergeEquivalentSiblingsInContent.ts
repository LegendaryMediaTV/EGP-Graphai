/**
 * Applies `utils/auditNodes.ts`'s own check 15: normalizes a `{text}`-only
 * object into the bare string the schema already treats it as equivalent to,
 * then merges adjacent siblings that agree in every property but `text` into
 * one node — real YLT1898 shape, a heading's own `"The Angel of the "`
 * immediately followed by `{text: "Jehovah"}`, structural residue rather than
 * a lost mark.
 *
 * **Two independent behaviors, not one.** A `{text}`-only object normalizes
 * to a bare string regardless of whether it has an eligible merge partner
 * beside it. Merging then runs over the normalized array, left to right,
 * folding a whole chain of agreeing siblings (real YLT1898 1 Chronicles
 * 13:1's heading: `"The Ark of the "`, `{text: "Jehovah"}`, `" is brought to
 * Jerusalem"`) into a single node in one pass, not one pairwise merge at a
 * time.
 *
 * **No `SkipReason`, matching `utils/fixDuplicateFootnoteAnchors.ts`'s own
 * precedent.** {@link isMergeableTextNode} is already the exact, tight
 * eligibility this transform needs; once two adjacent nodes both pass it and
 * agree in formatting, merging them is always safe, with no further
 * eligibility question left to ask. A node that fails the test simply never
 * merges — no information is lost, so there is nothing to report.
 *
 * **Restructures the tree; does not map text.** Two nodes become one (or,
 * for a whole chain, several become one), so this cannot ride on
 * `functions/mapContentText.ts`, whose own doc comment excludes exactly this
 * shape. This module owns its own walker instead, mirroring
 * `mapContentText.ts`'s and `functions/tagScriptRunsInContent.ts`'s own
 * recursion into `heading`/`subtitle`/a `ContentNested` wrapper's own
 * `content`/a footnote's own `foot.content` — never a `bibleLink` node's own
 * `content`, which is display text tied to a reference target, not a text
 * leaf either walker reaches.
 */

import Content from "../types/Content";
import { agreesInFormatting, describeNode, isMergeableTextNode } from "../utils/auditNodes";

/** True when `node` is an object carrying nothing but a `text` key — the exact shape a bare string already represents, per the schema's own equivalence between the two. */
function isTextOnlyObject(node: unknown): node is { text: string } {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  return typeof record.text === "string" && Object.keys(record).length === 1;
}

/**
 * Rebuilds `node` with its own `text` replaced — a bare string *is* its own
 * text, so it's replaced outright; an object node keeps every other property
 * via a shallow spread. Matches `utils/fixMarkBoundaryEmbeddedSpaces.ts`'s
 * own identical `withText` helper and doc comment: spreading a *string* with
 * `{...node}` does not copy its characters, so the two shapes need different
 * handling.
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/** Running "did anything change" flag, threaded through recursion and mutated in place — the same sink pattern every other fixer in this pipeline uses, simplified to a single boolean since this transform never declines. */
interface Counts {
  changed: boolean;
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `utils/auditNodes.ts`'s own `walkLevel`
 * recursion exactly, then returns a shallow copy with those fields replaced.
 * A string, or anything that isn't a plain object, has no nested levels to
 * rewrite and passes through unchanged.
 */
function rewriteNested(node: unknown, counts: Counts): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const record = { ...(node as Record<string, unknown>) };

  if (record.heading !== undefined) record.heading = rewriteLevel(record.heading, counts);
  if (record.subtitle !== undefined) record.subtitle = rewriteLevel(record.subtitle, counts);
  if (
    record.heading === undefined &&
    record.subtitle === undefined &&
    record.bibleLink === undefined &&
    record.content !== undefined
  ) {
    record.content = rewriteLevel(record.content, counts);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content, counts) };
  }

  return record;
}

/**
 * Rewrites one node in place: its own nested levels first (via {@link
 * rewriteNested}), then collapses the result into a bare string when it is a
 * {@link isTextOnlyObject} — independent of whether this node ends up with
 * an eligible merge partner beside it (see this module's own top doc comment
 * for why the two are separate behaviors).
 */
function normalizeNode(node: unknown, counts: Counts): unknown {
  const nested = rewriteNested(node, counts);
  if (isTextOnlyObject(nested)) {
    counts.changed = true;
    return nested.text;
  }
  return nested;
}

/**
 * Rewrites one array level: every element's own nested levels and its own
 * text-only-object normalization first, then folds each maximal run of
 * adjacent {@link isMergeableTextNode} siblings that agree with each other
 * in `marks`/`script` (see {@link agreesInFormatting}) into a single node —
 * the same per-pair judgment `scanArrayForMergeableSiblings` uses in
 * `utils/auditNodes.ts`, applied here across a whole chain at once rather
 * than one adjacent pair at a time. A node that fails either test (carries a
 * `strong`/`foot`/`bibleLink`/nested `content`/`paragraph`/`break`, or
 * disagrees in formatting with the run so far) starts a fresh run rather
 * than being folded in, so a run never crosses a real boundary.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: Counts): unknown[] {
  const normalized = nodes.map((node) => normalizeNode(node, counts));

  const merged: unknown[] = [];
  for (const node of normalized) {
    const prev = merged[merged.length - 1];
    if (
      merged.length > 0 &&
      isMergeableTextNode(prev, describeNode(prev)) &&
      isMergeableTextNode(node, describeNode(node)) &&
      agreesInFormatting(describeNode(prev), describeNode(node))
    ) {
      const prevText = describeNode(prev).text as string;
      const nodeText = describeNode(node).text as string;
      merged[merged.length - 1] = withText(prev, prevText + nodeText);
      counts.changed = true;
    } else {
      merged.push(node);
    }
  }

  return merged;
}

/**
 * Rewrites one `Content` value, single node or array alike — the same
 * `asArray`-then-scan shape `findStrongsNodeIssues` uses for detection,
 * except this one rebuilds instead of only reporting. A single node has no
 * siblings to merge with, so only normalization applies (via {@link
 * normalizeNode}); an array first normalizes every child, then merges
 * agreeing runs at this level via {@link rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: Counts): unknown {
  if (Array.isArray(content)) {
    return rewriteArrayLevel(content, counts);
  }
  return normalizeNode(content, counts);
}

/**
 * Normalizes every `{text}`-only object into a bare string and merges every
 * eligible run of adjacent agreeing siblings into one node, in one verse's
 * `content` tree, recursively (`heading`, `subtitle`, a `ContentNested`
 * wrapper's own `content`, and a footnote body's own `foot.content`,
 * mirroring `utils/auditNodes.ts`'s own `walkLevel`).
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing changed) and whether anything changed
 */
export function mergeEquivalentSiblingsInContent(
  content: Content,
): { content: Content; changed: boolean } {
  const counts: Counts = { changed: false };
  const rewritten = rewriteLevel(content, counts) as Content;
  return counts.changed
    ? { content: rewritten, changed: true }
    : { content, changed: false };
}

export default mergeEquivalentSiblingsInContent;
