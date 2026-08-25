import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveBookId } from "../metadata";
import { VerseBlock, VerseRecord } from "../segmentVerses";

/**
 * Shared support for a corpus-wide test that checks whether
 * `segmentVerses()`'s own real output reproduces a "clean cut, next block
 * opens a paragraph" convention against WEBUS2020's own real, committed
 * `HEAD` JSON — the identical comparison two separate real markers need:
 * `\b` (a stanza break, Phase 5's own subtask 5.4) and `\c` (a chapter
 * boundary, Finding 7's own real report). Extracted here once `\c`'s own
 * corpus-wide test became this logic's second real caller, the same
 * "shared home once a second real caller appears" move Phase 1's own
 * `uniformFraction` and Phase 6's own `contentWalk.ts` already made.
 */

/** Repo root, resolved from this file's own location three levels down from it. */
export const REPO_ROOT = path.resolve(__dirname, "../../..");
/** WEBUS2020's real, gitignored raw-USFM source directory this comparison reads against. */
export const SOURCE_DIR = path.join(REPO_ROOT, "imports", "webus2020", "ebible-usfm");

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

/** Every `.usfm` file in the real source directory, keyed by its own resolved registry book id — mirrors `utils/importUsfm.ts`'s own `usfmFilesByRegistryId`, duplicated locally rather than exported from that module since no production caller needs it, only this report-only measurement. */
export function usfmFilesByRegistryId(): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of fs.readdirSync(SOURCE_DIR)) {
    if (!file.endsWith(".usfm")) continue;
    const source = fs.readFileSync(path.join(SOURCE_DIR, file), "utf8");
    const match = /^\\id\s+(\S+)/.exec(source);
    if (match === null) continue;
    files.set(resolveBookId(match[1]), file);
  }
  return files;
}

/** One of the 66 canonical books `HEAD` carries, as {@link readCanonicalBooks} reads it. */
export interface CanonicalBook {
  /** This repo's own registry book id. */
  readonly id: string;
  /** The exact `NN-XXX.json` filename this book has in `HEAD`, read from `git ls-tree` rather than the working tree's own `_version.json` — that registry interleaves deuterocanon books into canonical order (e.g. Tobit at `order: 40`), which no longer matches `HEAD`'s real 66-file `01`-`66` numbering. */
  readonly filename: string;
}

/**
 * The 15 real deuterocanon book ids this version carries alongside the 66
 * canonical ones — no upstream `HEAD` baseline exists for any of them, so
 * {@link readCanonicalBooks} excludes them by id.
 *
 * Filtering by filename pattern alone (`^\d{2}-[A-Z0-9]+\.json$`) used to be
 * enough to isolate the 66 canonical books from `git ls-tree HEAD`, back
 * when `HEAD` itself had never carried a deuterocanon book and every
 * committed `bible-versions/WEBUS2020/*.json` file matched that pattern by
 * construction. This branch's own apocrypha work has since committed all 15
 * of these to `HEAD` too, under the identical `NN-XXX.json` shape (e.g.
 * `40-TOB.json`) — so the old filename-only filter now returns all 81 books,
 * not 66, silently doubling several corpus-wide counts below. Excluding by
 * id here is the fix; matches `verify.test.ts`'s own `DEUTEROCANON_RAW_FILES`
 * set (resolved from raw-USFM filenames to registry ids).
 */
const DEUTEROCANON_BOOK_IDS = new Set([
  "TOB",
  "JDT",
  "ESG",
  "DAG",
  "WIS",
  "SIR",
  "BAR",
  "1MC",
  "2MC",
  "1ES",
  "PMA",
  "PS2",
  "3MC",
  "2ES",
  "4MC",
]);

/**
 * The 66 real books `HEAD` actually carries under `bible-versions/WEBUS2020/`
 * — read directly from git, not filtered out of the current working tree's
 * own registry. Deuterocanon books are excluded by id (see
 * {@link DEUTEROCANON_BOOK_IDS}): no upstream baseline exists for them.
 */
export function readCanonicalBooks(): CanonicalBook[] {
  const filenames = execFileSync(
    "git",
    ["ls-tree", "-r", "HEAD", "--name-only", "--", "bible-versions/WEBUS2020/"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((line) => path.basename(line))
    .filter((name) => /^\d{2}-[A-Z0-9]+\.json$/.test(name));

  return filenames
    .map((filename) => ({ id: /^\d{2}-([A-Z0-9]+)\.json$/.exec(filename)![1], filename }))
    .filter((book) => !DEUTEROCANON_BOOK_IDS.has(book.id));
}

/** One book's real, upstream-committed content, read directly from git. */
export function readUpstreamBookJson(book: CanonicalBook): { chapter: number; verse: number; content: unknown }[] {
  const raw = execFileSync("git", ["show", `HEAD:bible-versions/WEBUS2020/${book.filename}`], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return JSON.parse(raw) as { chapter: number; verse: number; content: unknown }[];
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

/** Whether this phase's own fixed `segmentVerses()` output reproduces the two-part convention at this boundary, the same "skip any heading node" rule as {@link upstreamMatchesRule}. */
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
