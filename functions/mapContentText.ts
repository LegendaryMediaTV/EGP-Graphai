import Content from "../types/Content";

/**
 * A leaf-level text rewrite: given one node's own raw text, return the
 * replacement, or `undefined` to mean "unchanged." `undefined` rather than
 * the same string back is what lets {@link mapContentText} tell "nothing to
 * do here" apart from "rewrote it to itself," without every transform having
 * to do that equality check on its own behalf.
 */
export type TextTransform = (text: string) => string | undefined;

/**
 * Walks a content tree and rewrites every leaf string it finds via one
 * caller-supplied {@link TextTransform} — the one traversal
 * {@link "./normalizeFractions"} and {@link "./normalizeEllipses"} both need,
 * pulled out because the only difference between them is which string
 * function runs at the leaves, not how the tree is walked.
 *
 * Recurses exactly the way `auditNodes.ts`'s own `walkLevel`/`describeNode`
 * do: a bare string array element counts as text in its own right, and
 * `heading`, `subtitle`, a `ContentNested` wrapper's own `content`, and a
 * footnote body's own `foot.content` are all followed. A `bibleLink` node's
 * own `content` display override is deliberately excluded from that walk —
 * it's display text tied to a reference target, not nested content — and the
 * `bibleLink` target string itself is never visited at all, since it isn't
 * reached by any of the branches this walker follows.
 *
 * Deliberately narrow: this is a text *map*, nothing else. A transform that
 * needs to restructure the tree — merge two nodes, split one on a match,
 * drop a key — doesn't fit this interface and shouldn't be forced through
 * it; `normalizeBibleLinkDashesInContent` (`utils/validate.ts`) and
 * `convertContentToSmallCaps` are exactly that shape and stay outside.
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
 * for a footed word — because the strict union names each field's own shape
 * without forbidding a node from carrying several fields at once. Not
 * exported: {@link mapContentText} is the only typed entry point a caller
 * needs.
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
    return changed ? { value: items, changed: true } : { value, changed: false };
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
