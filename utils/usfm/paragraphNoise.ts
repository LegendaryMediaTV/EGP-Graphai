/**
 * One real USFM import source marks `\m` immediately before literally
 * every verse — all 31,098 verses across all 66 books carry
 * `paragraph: true`, zero exceptions. That is the source export tool's own
 * default line-formatting marker, not real per-verse paragraph structure: a
 * marker this uniform can never mean "a new paragraph genuinely starts
 * here" — a real paragraph break could not land on every single verse
 * boundary in every book with zero exceptions.
 *
 * Confirmed safe against every other already-shipped, richly-tagged corpus
 * this repo carries: the highest real per-book paragraph density anywhere
 * is 61.5% (2 John), and WEBUS2020's own highest is 50.0% (3 John) —
 * nowhere near the 100%-with-zero-exceptions bar
 * {@link isUniformParagraphNoise} requires, so that trigger is safe by a
 * wide margin, not a close call.
 *
 * A post-processing pass over a whole book's own already-assembled verse
 * array — the only point in the import pipeline that ever sees an entire
 * book at once (`utils/usfm/segmentVerses.ts`'s own per-verse block walk
 * never does, and could not decide "is this 100% of the book" from one
 * verse alone). Deliberately built against a local {@link ParagraphNoiseVerse}
 * shape rather than `utils/importUsfm.ts`'s own `VerseRecord`: this module
 * must stay a one-way dependency the importer calls, never the reverse,
 * and any real verse record already satisfies the minimal shape
 * structurally, so a caller passes its own records straight through with
 * no conversion.
 *
 * Must still honor `utils/auditNodes.ts`'s heading-paragraph check rule (a heading/subtitle
 * run's own real next node keeps `paragraph: true`) even though no real
 * book from the triggering source exercises that interaction today — that
 * source carries zero headings/subtitles. The rule below is written
 * generically, not tied to any one source, and only a synthetic fixture
 * can prove the interaction survives suppression (see this module's own
 * test file).
 */

import Content from "../../types/Content";

/**
 * The minimal per-verse shape {@link suppressUniformParagraphNoise} needs —
 * deliberately narrower than `utils/importUsfm.ts`'s own `VerseRecord`
 * (see this module's own top doc comment for why), so any real verse
 * record already satisfies it structurally with no conversion required.
 */
export interface ParagraphNoiseVerse {
  /** 1-based chapter number. */
  readonly chapter: number;
  /** 1-based verse number. */
  readonly verse: number;
  /** The verse's own content tree — any shape `Content` permits. */
  readonly content: Content;
}

/** Normalizes a single node or an already-array value into an array — `Content` permits either shape (a real source's own Genesis 1:1 is a bare object, not a one-element array), mirroring `utils/auditNodes.ts`'s own private `asArray`, reimplemented here rather than shared. */
function asArray(content: Content): unknown[] {
  return Array.isArray(content) ? content : [content];
}

/** `true` for a plain-object node whose own `paragraph` is exactly `true`. */
function opensParagraph(node: unknown): boolean {
  return typeof node === "object" && node !== null && !Array.isArray(node) && (node as Record<string, unknown>).paragraph === true;
}

/** `true` for a `{heading: ...}` or `{subtitle: ...}` wrapper — the identical predicate `utils/auditNodes.ts`'s own heading-paragraph check already uses, reimplemented locally rather than imported: that module's own version is not exported, and this one is too small to warrant becoming a new shared export for a second caller. */
function isHeadingOrSubtitle(node: unknown): boolean {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  return "heading" in record || "subtitle" in record;
}

/** `true` when this verse's own top-level content carries `paragraph: true` on at least one node — the per-verse fact {@link isUniformParagraphNoise} checks across a whole book. */
function verseOpensAParagraph(content: Content): boolean {
  return asArray(content).some(opensParagraph);
}

/**
 * `true` when every verse in `verses` carries `paragraph: true` somewhere
 * in its own top-level content, with no exceptions at all — the
 * 100%-with-zero-exceptions trigger this module's own top doc comment
 * already justifies. The moment even one verse breaks the uniformity, this
 * is `false` and {@link suppressUniformParagraphNoise} leaves every real
 * flag in the book exactly as the source gave it.
 *
 * An empty `verses` array is vacuously uniform (`Array.prototype.every` on
 * an empty array), but {@link suppressUniformParagraphNoise} never calls
 * this with one in practice — every real book carries at least one verse.
 */
export function isUniformParagraphNoise(verses: readonly ParagraphNoiseVerse[]): boolean {
  return verses.every((verse) => verseOpensAParagraph(verse.content));
}

/**
 * The top-level positions, within one verse's own content nodes, that sit
 * immediately after a run of one or more consecutive heading/subtitle
 * nodes — `utils/auditNodes.ts`'s own heading-paragraph check rule (a
 * heading/subtitle run's own real next node), reapplied here at the
 * single-verse level this module operates on. Never recurses past the
 * verse's own outermost array, matching the heading-paragraph check's own
 * established scope (a heading/subtitle never
 * occurs nested inside a `ContentNested` wrapper or a footnote body
 * anywhere in this repo's real corpus, and never sits as the very last
 * node of a verse's own content either).
 */
function positionsAfterHeadingRuns(nodes: readonly unknown[]): Set<number> {
  const positions = new Set<number>();

  let at = 0;
  while (at < nodes.length) {
    if (!isHeadingOrSubtitle(nodes[at])) {
      at++;
      continue;
    }
    let end = at;
    while (end < nodes.length && isHeadingOrSubtitle(nodes[end])) end++;
    if (end < nodes.length) positions.add(end);
    at = end;
  }

  return positions;
}

/** `node` with its own `paragraph` key removed entirely — never set to `false` (this corpus has no real `"paragraph": false` anywhere; absence is how "not a paragraph start" is already spelled everywhere else in the schema). A non-object node (a bare string) passes through unchanged; it could never have carried the key in the first place. */
function withoutParagraph(node: unknown): unknown {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return node;
  const { paragraph: _paragraph, ...rest } = node as Record<string, unknown>;
  return rest;
}

/**
 * One verse's own suppressed content: every node's `paragraph: true` is
 * stripped except at a position in `keepPositions` — a non-chapter-first
 * verse's own heading-run-adjacent positions (see
 * {@link suppressUniformParagraphNoise}, which never calls this for a
 * chapter-first verse in the first place).
 */
function stripParagraphExcept(content: Content, keepPositions: ReadonlySet<number>): Content {
  const nodes = asArray(content);
  const stripped = nodes.map((node, at) => (keepPositions.has(at) ? node : withoutParagraph(node)));
  return (Array.isArray(content) ? stripped : stripped[0]) as Content;
}

/**
 * Detects and suppresses one whole book's own uniform, zero-exception
 * `paragraph: true` source noise (see this module's own top doc comment) —
 * the real fix for the triggering source's own bare paragraph markers.
 * `verses` must be in the
 * book's real, on-disk order: chapter-first detection is positional (the
 * first record encountered with a given chapter number, never assumed to
 * be verse 1), matching `utils/auditNodes.ts`'s own heading-paragraph check convention.
 *
 * When {@link isUniformParagraphNoise} is `false`, `verses` passes through
 * unchanged. When `true`, every verse's own top-level `paragraph: true` is
 * stripped except on each chapter's own first verse, and on any node
 * immediately following a heading/subtitle run (the heading-paragraph
 * check's own rule).
 *
 * Generic over `V` so a caller's own real verse record (`book`, an index
 * signature, or anything else beyond the three fields this module reads)
 * passes straight through with only `content` ever replaced.
 *
 * @param verses - One whole book's own verses, in their real on-disk order.
 */
export function suppressUniformParagraphNoise<V extends ParagraphNoiseVerse>(verses: readonly V[]): V[] {
  if (!isUniformParagraphNoise(verses)) return [...verses];

  const seenChapters = new Set<number>();
  return verses.map((verse) => {
    const isChapterFirstVerse = !seenChapters.has(verse.chapter);
    seenChapters.add(verse.chapter);
    if (isChapterFirstVerse) return verse;

    const keepPositions = positionsAfterHeadingRuns(asArray(verse.content));
    return { ...verse, content: stripParagraphExcept(verse.content, keepPositions) };
  });
}
