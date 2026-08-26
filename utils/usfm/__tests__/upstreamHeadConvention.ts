import { VerseBlock, VerseRecord } from "../segmentVerses";

/**
 * Shared support for tests that check whether `segmentVerses()`'s own real
 * output reproduces a "clean cut, next block opens a paragraph" convention
 * against WEBUS2020's own real, committed `HEAD` content — the identical
 * comparison two separate real markers need: `\b` (a stanza break) and `\c`
 * (a chapter boundary).
 */

/**
 * A verse pair on either side of a real construct this comparison checks:
 * the "before" verse's own last real block should carry no `break: true`,
 * and the "after" verse's own first real block should carry
 * `paragraph: true`. Generic over what actually produced the boundary — a
 * `\b` stanza break or a `\c` chapter marker both resolve to this same
 * shape, since both make the identical two-part promise.
 */
export interface ParagraphBreakBoundary {
  /** Chapter of the verse immediately before the boundary. */
  readonly beforeChapter: number;
  /** Verse immediately before the boundary. */
  readonly beforeVerse: number;
  /** Chapter of the verse immediately after the boundary. */
  readonly afterChapter: number;
  /** Verse immediately after the boundary. */
  readonly afterVerse: number;
}

/**
 * Normalizes one upstream `content` value (a bare string, a single object,
 * or an array of either) into `{text, paragraph, break, isHeading}` shapes
 * — the same shape `VerseBlock[]` carries, plus `isHeading`: a
 * subtitle/heading node (e.g. a Psalm's own `\d` superscription) carries no
 * `text` at all, only a `subtitle`/`heading` key, so `isHeading` lets a
 * "first/last real block" lookup skip it, mirroring
 * {@link VerseBlock.headingContent}.
 */
export function upstreamBlocks(
  content: unknown,
): { text: string; paragraph?: boolean; break?: boolean; isHeading: boolean }[] {
  const items = Array.isArray(content) ? content : [content];
  return items.map((item) => {
    if (typeof item === "string") return { text: item, isHeading: false };
    const object = item as { text?: string; paragraph?: boolean; break?: boolean };
    return { text: object.text ?? "", paragraph: object.paragraph, break: object.break, isHeading: object.text === undefined };
  });
}

/** Whether upstream `HEAD`'s own real content at this boundary already carries the two-part convention: the "before" verse's last *real* block (skipping any trailing/leading heading node) has no `break`, and the "after" verse's first real block carries `paragraph: true`. */
export function upstreamMatchesRule(
  upstream: { chapter: number; verse: number; content: unknown }[],
  boundary: ParagraphBreakBoundary,
): boolean | undefined {
  const before = upstream.find((v) => v.chapter === boundary.beforeChapter && v.verse === boundary.beforeVerse);
  const after = upstream.find((v) => v.chapter === boundary.afterChapter && v.verse === boundary.afterVerse);
  if (before === undefined || after === undefined) return undefined;
  const beforeBlocks = upstreamBlocks(before.content).filter((block) => !block.isHeading);
  const afterBlocks = upstreamBlocks(after.content).filter((block) => !block.isHeading);
  const lastBefore = beforeBlocks[beforeBlocks.length - 1];
  const firstAfter = afterBlocks[0];
  return lastBefore?.break !== true && firstAfter?.paragraph === true;
}

/** Whether `segmentVerses()`'s own current output reproduces the two-part convention at this boundary, the same "skip any heading node" rule as {@link upstreamMatchesRule}. */
export function fixedOutputMatchesRule(
  records: readonly VerseRecord[],
  boundary: ParagraphBreakBoundary,
): boolean | undefined {
  const before = records.find((r) => r.chapter === boundary.beforeChapter && r.verse === boundary.beforeVerse);
  const after = records.find((r) => r.chapter === boundary.afterChapter && r.verse === boundary.afterVerse);
  if (before === undefined || after === undefined) return undefined;
  const beforeBlocks = before.blocks.filter((block) => block.headingContent === undefined);
  const afterBlocks = after.blocks.filter((block) => block.headingContent === undefined);
  const lastBefore: VerseBlock | undefined = beforeBlocks[beforeBlocks.length - 1];
  const firstAfter: VerseBlock | undefined = afterBlocks[0];
  return lastBefore?.break !== true && firstAfter?.paragraph === true;
}
