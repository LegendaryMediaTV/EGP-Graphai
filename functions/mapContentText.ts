import Content, { ContentObject } from "../types/Content";

/**
 * A leaf-level text rewrite: return the replacement, or `undefined` to mean
 * "unchanged." Returning `undefined` rather than echoing the same string is
 * what lets {@link mapContentText} tell "nothing to do" apart from "rewrote
 * it to itself," without every transform doing that equality check itself.
 */
export type TextTransform = (text: string) => string | undefined;

/**
 * Walks a content tree and rewrites every leaf string it finds via one
 * caller-supplied {@link TextTransform}. Every normalization that differs from
 * the next only in which string function runs at the leaves shares this walker
 * rather than repeating the traversal.
 *
 * Recurses to match `auditNodes.ts`'s own `walkLevel`/`describeNode`. A
 * `bibleLink` node's own `content` is deliberately excluded from the walk —
 * it's display text tied to a reference target, not nested content — and
 * the `bibleLink` target string itself is never visited, since no branch
 * this walker follows reaches it.
 *
 * Deliberately narrow: this is a text *map*, nothing else. A transform that
 * needs to restructure the tree — merge two nodes, split one on a match,
 * drop a key — doesn't fit this interface; `normalizeBibleLinkDashesInContent`
 * (`utils/validate.ts`) is exactly that shape and stays outside, and a
 * transform that rewrites whole nodes wants {@link mapContentNodes}.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @param transform - Runs on every leaf string this walker reaches; returns
 *   the replacement, or `undefined` for "leave it alone"
 * @returns The rewritten tree (structurally new only where something
 *   changed, otherwise the original reference) and whether anything changed
 *   at all
 */
export function mapContentText(
  content: Content,
  transform: TextTransform,
): { content: Content; changed: boolean } {
  const rewritten = rewrite(content, transform);
  return { content: rewritten.value as Content, changed: rewritten.changed };
}

/**
 * The actual traversal, working over `unknown` rather than {@link Content}
 * itself: a real node commonly combines fields no single `Content` union
 * member declares together — `text` alongside `foot` is the ordinary shape
 * for a footed word. Not exported: {@link mapContentText} is the only typed
 * entry point a caller needs.
 */
function rewrite(
  value: unknown,
  transform: TextTransform,
): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const result = transform(value);
    return result === undefined
      ? { value, changed: false }
      : { value: result, changed: true };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const rewritten = rewrite(item, transform);
      changed = changed || rewritten.changed;
      return rewritten.value;
    });
    return changed
      ? { value: items, changed: true }
      : { value, changed: false };
  }

  if (value === null || typeof value !== "object") {
    return { value, changed: false };
  }

  const record = value as Record<string, unknown>;
  let result = record;
  let changed = false;

  if (typeof record.text === "string") {
    const rewritten = transform(record.text);
    if (rewritten !== undefined) {
      result = { ...result, text: rewritten };
      changed = true;
    }
  }

  if (record.heading !== undefined) {
    const rewritten = rewrite(record.heading, transform);
    if (rewritten.changed) {
      result = { ...result, heading: rewritten.value };
      changed = true;
    }
  }

  if (record.subtitle !== undefined) {
    const rewritten = rewrite(record.subtitle, transform);
    if (rewritten.changed) {
      result = { ...result, subtitle: rewritten.value };
      changed = true;
    }
  }

  if (
    record.heading === undefined &&
    record.subtitle === undefined &&
    record.bibleLink === undefined &&
    record.content !== undefined
  ) {
    const rewritten = rewrite(record.content, transform);
    if (rewritten.changed) {
      result = { ...result, content: rewritten.value };
      changed = true;
    }
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    const rewritten = rewrite(foot.content, transform);
    if (rewritten.changed) {
      result = { ...result, foot: { ...foot, content: rewritten.value } };
      changed = true;
    }
  }

  return { value: changed ? result : record, changed };
}

/**
 * A node-level rewrite: return the replacement node, or `undefined` to mean
 * "unchanged," on the same terms as {@link TextTransform}.
 *
 * The node arrives typed as the plain-text object because that is the only
 * shape a node-level transform has business rewriting; every field is optional,
 * so a heading or `abbr` node arrives with none of them set and a transform
 * that checks for what it wants passes over it.
 */
export type NodeTransform = (node: ContentObject) => ContentObject | undefined;

/**
 * Walks a content tree and rewrites whole nodes, where {@link mapContentText}
 * rewrites leaf strings.
 *
 * The two are siblings rather than one built on the other, because the tree
 * they walk holds two kinds of leaf. A bare string in a content array is a leaf
 * for {@link mapContentText} and has no node to hand anyone, so a node walker
 * cannot serve a text transform, and a text transform cannot add or drop a key.
 * Both walk the same branches, and this file is the one place that knows what
 * those branches are.
 *
 * A node's children are settled before the node itself is offered, so a
 * transform that spreads the node it is given keeps their rewrites.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @param transform - Runs on every object node this walker reaches; returns the
 *   replacement, or `undefined` for "leave it alone"
 * @returns The rewritten tree (structurally new only where something changed,
 *   otherwise the original reference) and whether anything changed at all
 */
export function mapContentNodes(
  content: Content,
  transform: NodeTransform,
): { content: Content; changed: boolean } {
  const rewritten = rewriteNodes(content, transform);
  return { content: rewritten.value as Content, changed: rewritten.changed };
}

/**
 * {@link mapContentNodes}'s traversal, over `unknown` for the same reason
 * {@link rewrite} is: a real node mixes fields no single `Content` union member
 * declares together.
 */
function rewriteNodes(
  value: unknown,
  transform: NodeTransform,
): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const rewritten = rewriteNodes(item, transform);
      changed = changed || rewritten.changed;
      return rewritten.value;
    });
    return changed
      ? { value: items, changed: true }
      : { value, changed: false };
  }

  if (value === null || typeof value !== "object") {
    return { value, changed: false };
  }

  const record = value as Record<string, unknown>;
  let result = record;
  let changed = false;

  if (record.heading !== undefined) {
    const rewritten = rewriteNodes(record.heading, transform);
    if (rewritten.changed) {
      result = { ...result, heading: rewritten.value };
      changed = true;
    }
  }

  if (record.subtitle !== undefined) {
    const rewritten = rewriteNodes(record.subtitle, transform);
    if (rewritten.changed) {
      result = { ...result, subtitle: rewritten.value };
      changed = true;
    }
  }

  if (
    record.heading === undefined &&
    record.subtitle === undefined &&
    record.bibleLink === undefined &&
    record.content !== undefined
  ) {
    const rewritten = rewriteNodes(record.content, transform);
    if (rewritten.changed) {
      result = { ...result, content: rewritten.value };
      changed = true;
    }
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    const rewritten = rewriteNodes(foot.content, transform);
    if (rewritten.changed) {
      result = { ...result, foot: { ...foot, content: rewritten.value } };
      changed = true;
    }
  }

  const replacement = transform(result as ContentObject);
  if (replacement !== undefined) return { value: replacement, changed: true };

  return { value: changed ? result : record, changed };
}
