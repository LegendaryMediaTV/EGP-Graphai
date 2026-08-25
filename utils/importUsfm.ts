/**
 * Generic USFM → Graphai importer. Give it a directory of `.usfm` files and
 * a target version id, and it rebuilds that version's verse files and
 * merges each book's extracted front-matter metadata into its
 * `_version.json`.
 *
 * Imports exactly the books the target version's `_version.json` already
 * lists, matched to their USFM file via `usfm/metadata.ts`'s
 * `resolveBookId`. A USFM file whose book isn't listed there (front
 * matter, a glossary, a book outside this run's canon) is simply not
 * selected — never an error. A book `_version.json` doesn't have yet can
 * still be added: `mergeBookMetadata` appends it with a placeholder
 * `order` (see that function's doc comment).
 *
 * Extracts, for every verse: paragraph/line-break block structure
 * (`usfm/blockStructure.ts`); Strong's-number attachment and inline
 * marks — Words of Christ (`marks: ["woc"]`) and Selah (`marks: ["i"]`),
 * both via `usfm/inlineMarks.ts`; footnotes (every `\f`...`\f*` becomes a
 * typed `foot` object, `usfm/footnotes.ts` + `usfm/footnoteTypeRules.ts`);
 * scripture cross-references (every `\x`...`\x*` becomes an always-`xrf`-
 * typed `foot` object whose content is one or more `bibleLink`s,
 * `usfm/references.ts`); and headings/subtitles: Psalm superscriptions and
 * Psalm 119's acrostic letter names (both tagged `\d` — `usfm/headings.ts`
 * classifies by content), the five Psalter book-division headings
 * (`\ms1`), and Song of Solomon's speaker labels (`\sp`) — all built by
 * `usfm/headings.ts` and attached by `usfm/segmentVerses.ts`'s token walk,
 * the same way a footnote or cross-reference is.
 *
 * A real (non-preview) write also runs the whole book through
 * `usfm/paragraphNoise.ts`'s `suppressUniformParagraphNoise`: when a
 * source's `paragraph: true` covers 100% of the book's verses with zero
 * exceptions, that's a line-formatting artifact of the source export tool
 * rather than real per-verse structure, so the flag is suppressed down to
 * each chapter's first verse; every other book passes through untouched.
 * `regenerateDownstream` then runs the cross-chapter `bibleLink` split
 * (`npm run audit-links <version-id> -- --fix`) as a subprocess, followed
 * by `npm run validate` — see that function's doc comment.
 *
 * Usage:
 *   npx ts-node utils/importUsfm.ts <source-dir> <version-id>                    # rebuild every book, then regenerate downstream
 *   npx ts-node utils/importUsfm.ts <source-dir> <version-id> <book>             # rebuild one book's file, then regenerate downstream
 *   npx ts-node utils/importUsfm.ts <source-dir> <version-id> <book> <chapter>   # preview one chapter, write nothing
 *   npx ts-node utils/importUsfm.ts <source-dir> <version-id> --no-strongs       # rebuild every book with every Strong's number suppressed (the flag reads regardless of where it sits among the arguments above)
 *
 * Example (a source with no version-specific wrapper of its own):
 *   npx ts-node utils/importUsfm.ts imports/webus2020/ebible-usfm WEBUS2020
 *   npx ts-node utils/importUsfm.ts imports/webus2020/ebible-usfm WEBUS2020 Genesis
 *   npx ts-node utils/importUsfm.ts imports/webus2020/ebible-usfm WEBUS2020 Psalms 23
 *
 * **WEBUS2020 itself is no longer such a source — see below.** These three
 * lines are kept only as a literal shape example; run
 * `imports/webus2020/import.ts` instead for a real WEBUS2020 import.
 *
 * A wrapping script that needs more than `--no-strongs` — a book name/title
 * override, a copyright/license override, a per-verse callback, or a
 * redirected output directory (`ImportOptions.outputDir`) — calls
 * `runImport(sourceDir, versionId, options, book?, chapter?)` directly
 * instead of forking this file. See `ImportOptions`'s doc comment for every
 * field it accepts; every field absent (`{}`, `main()`'s default)
 * reproduces this file's exact CLI behavior.
 *
 * **WEBUS2020 has its own such wrapper, and it should be preferred over
 * calling this file directly: `imports/webus2020/import.ts`.** It bakes in
 * two decisions this file has no way to know about — four `bookTitle`
 * corrections for raw-USFM front-matter typos, and `strongs: false` for a
 * known-poor Strong's-number alignment — so a re-import run straight
 * against this file, bypassing that wrapper, would silently regress both.
 * See that file's header doc comment for the full reasoning and sourcing.
 *
 * This script is deliberately not registered in package.json — this
 * comment is the only place its invocation is documented.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { sortVerseKeys } from "../functions/sortContentKeys";
import { writeJsonFile } from "../functions/writeJsonFile";
import Content from "../types/Content";
import BibleVersion, { VersionBook } from "../types/Version";
import { buildBlockContent } from "./usfm/blockStructure";
import { BookMetadata, extractBookMetadata, mergeBookMetadata, resolveBookId } from "./usfm/metadata";
import { suppressUniformParagraphNoise } from "./usfm/paragraphNoise";
import { segmentVerses } from "./usfm/segmentVerses";

const REPO_ROOT = path.resolve(__dirname, "..");

/** Matches a book by id or full name (case- and whitespace-insensitive). Mirrors `imports/kjv/import.ts`'s matching so both importers accept the same lookups. */
export function findBook(books: readonly VersionBook[], wanted: string): VersionBook | undefined {
  const key = wanted.toLowerCase().replace(/\s+/g, "");
  return books.find((book) => {
    if (book._id.toLowerCase() === key) return true;
    return typeof book.name === "string" && book.name.toLowerCase().replace(/\s+/g, "") === key;
  });
}

/** Book's verse-file name, e.g. `01-GEN.json` — numbered by the version's registry `order`, not the USFM source's file numbering (the two can disagree; see `usfm/metadata.ts`'s `resolveBookId`). */
function bookFilename(book: VersionBook): string {
  return `${book.order.toString().padStart(2, "0")}-${book._id}.json`;
}

/**
 * Maps every `.usfm` file in `sourceDir` to its registry book id
 * (`usfm/metadata.ts`'s `resolveBookId`). A file whose `\id` resolves to a
 * book `_version.json` doesn't list is simply never selected by
 * {@link runImport}'s book loop — not an error.
 */
function usfmFilesByRegistryId(sourceDir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith(".usfm")) continue;
    const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const match = /^\\id\s+(\S+)/.exec(source);
    if (match === null) continue;
    files.set(resolveBookId(match[1]), file);
  }
  return files;
}

/**
 * Runs the two commands that must follow a real write, in order:
 * `npm run audit-links <versionId> -- --fix` (the cross-chapter `bibleLink`
 * split) and then `npm run validate` (the schema/meaning gate). Runs
 * audit-links as a subprocess rather than in-process because
 * `crossChapterLinks.ts`'s version-index cache is never invalidated and
 * would read stale data right after this write.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"WEBUS2020"`.
 * @param run - Runs one shell command from the repo root; injected so a
 *   test can substitute a fake without invoking npm for real.
 */
export function regenerateDownstream(
  versionId: string,
  run: (command: string) => void = (command) =>
    execSync(command, { cwd: REPO_ROOT, stdio: "inherit" }),
): void {
  run(`npm run audit-links ${versionId} -- --fix`);
  run("npm run validate");
}

/**
 * Override scaffolding so a wrapping script can fine-tune a run without
 * forking this importer. Every field is optional; `{}` (the default for
 * both `main()` and {@link runImport}) reproduces this file's plain CLI
 * behavior exactly.
 */
export interface ImportOptions {
  /**
   * `false` suppresses every `strong` attribute this importer would
   * otherwise attach, by gating `usfm/segmentVerses.ts`'s existing
   * `close "w"` handler (its `includeStrongs` parameter) rather than adding
   * a second, parallel attachment path. Absent or `true`: every Strong's
   * number the source carries is imported.
   */
  readonly strongs?: boolean;
  /**
   * Overrides a book's extracted `name` before `mergeBookMetadata` sees
   * it — called with the extracted default and the book's resolved
   * registry id, returning the name to use instead. Absent: the extracted
   * name passes through unchanged.
   */
  readonly bookName?: (defaultName: string, bookId: string) => string;
  /** Overrides a book's extracted `title`, the same way {@link ImportOptions.bookName} overrides `name`. */
  readonly bookTitle?: (defaultTitle: string, bookId: string) => string;
  /** Overrides the version's `copyright` in `_version.json`, applied immediately before the final write. Absent: the existing value is left untouched. */
  readonly copyright?: string;
  /** Overrides the version's `license` in `_version.json`, the same way {@link ImportOptions.copyright} overrides `copyright`. */
  readonly license?: string;
  /**
   * Runs on every fully-built {@link VerseRecord} immediately before it
   * would be written (or, during a chapter preview, printed) — its return
   * value replaces the record. A callback rather than a keyed
   * correction-table lookup, so it can express arbitrary per-verse logic.
   * Absent: the built record passes through unchanged.
   */
  readonly onVerse?: (record: VerseRecord) => VerseRecord;
  /**
   * Redirects every `_version.json`/book-file read and write this run
   * performs away from `bible-versions/<versionId>/` to this directory
   * instead — a general escape hatch for running the pipeline into a
   * scratch directory rather than the real shipped tree. Absent (the
   * default): today's exact behavior, `path.join(REPO_ROOT,
   * "bible-versions", versionId)`, untouched.
   *
   * A relative path resolves against `process.cwd()`, the same way
   * {@link runImport}'s `sourceDir` argument already does — not against
   * the repo root.
   *
   * `npm run audit-links`/`npm run validate` are both hardwired to the
   * real `bible-versions/<versionId>` tree, so {@link regenerateDownstream}
   * is skipped whenever a non-preview run's resolved `outputDir` differs
   * from that default path. Running either command against a redirected
   * output would be meaningless at best, and destructive if the version id
   * also has its own real `bible-versions/` directory under a separate
   * pipeline.
   */
  readonly outputDir?: string;
}

/**
 * One verse's fully-built record — the exact `{book, chapter, verse,
 * content}` shape a real run writes to a version's book file, a chapter
 * preview prints, and what {@link ImportOptions.onVerse} receives and
 * returns. Distinct from `usfm/segmentVerses.ts`'s `VerseRecord` (the
 * pre-`buildBlockContent` shape — `rawContent`/`blocks`, not `content` —
 * that this one is built from); same name across modules, different shape.
 *
 * Fields are not `readonly` and an index signature is included so
 * `functions/sortContentKeys.ts`'s `sortVerseKeys<T extends
 * ContentObject>` accepts a value of this type directly — the same reason
 * `utils/sortBibleKeys.ts`'s `Verse` interface carries one.
 */
export interface VerseRecord {
  /** The book's registry id, e.g. `"GEN"`. */
  book: string;
  /** 1-based chapter number. */
  chapter: number;
  /** 1-based verse number. */
  verse: number;
  /** The verse's fully-built Graphai content tree. */
  content: Content;
  [key: string]: unknown;
}

/**
 * Applies {@link ImportOptions.bookName}/`bookTitle` to one already-
 * extracted {@link BookMetadata}, between `extractBookMetadata` and
 * `mergeBookMetadata`. Either callback absent leaves that field
 * byte-identical to what `extractBookMetadata` returned.
 */
export function applyMetadataOverrides(metadata: BookMetadata, options: ImportOptions): BookMetadata {
  return {
    ...metadata,
    name: options.bookName ? options.bookName(metadata.name, metadata._id) : metadata.name,
    title: options.bookTitle ? options.bookTitle(metadata.title, metadata._id) : metadata.title,
  };
}

/**
 * Applies {@link ImportOptions.copyright}/`license` to `version` as a
 * whole, immediately before the final `_version.json` write. Either
 * option absent leaves that field's existing value on `version` untouched.
 */
export function applyVersionOverrides(version: BibleVersion, options: ImportOptions): BibleVersion {
  return {
    ...version,
    ...(options.copyright !== undefined ? { copyright: options.copyright } : {}),
    ...(options.license !== undefined ? { license: options.license } : {}),
  };
}

/**
 * Rebuilds `versionId`'s verse files (and, on a real run, its
 * `_version.json`) from the `.usfm` files in `sourceDir` — the whole of
 * what `main()`'s CLI wraps, extracted here so a wrapping script can call
 * it directly instead of forking this file. `bookArgument`/`chapterArgument`
 * mirror `main()`'s positional CLI arguments exactly (a chapter given
 * previews that one chapter and writes nothing); `options` is
 * {@link ImportOptions}, `{}` by default — every field absent reproduces
 * this function's plain CLI behavior.
 */
export async function runImport(
  sourceDir: string,
  versionId: string,
  options: ImportOptions = {},
  bookArgument?: string,
  chapterArgument?: number,
): Promise<void> {
  const defaultVersionDir = path.join(REPO_ROOT, "bible-versions", versionId);
  const versionDir = options.outputDir !== undefined ? path.resolve(options.outputDir) : defaultVersionDir;
  const versionFile = path.join(versionDir, "_version.json");
  const version: BibleVersion = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  const books = [...(version.books ?? [])].sort((a, b) => a.order - b.order);
  // Whole canon, not just `selected` — a single-book rebuild still needs
  // to recognize cross-references naming other books (see
  // `usfm/references.ts`'s doc comment for why).
  const canonBookIds = new Set(books.map((book) => book._id));

  let selected = books;
  if (bookArgument) {
    const match = findBook(books, bookArgument);
    if (match === undefined) {
      console.error(`Unknown book: ${bookArgument}`);
      console.error("Use the book name (e.g. Genesis) or ID (e.g. GEN).");
      process.exit(1);
    }
    selected = [match];
  }

  const preview = chapterArgument !== undefined;
  const filesByRegistryId = usfmFilesByRegistryId(sourceDir);

  const missing = selected.filter((book) => !filesByRegistryId.has(book._id));
  if (missing.length > 0) {
    console.error(`${missing.length} selected book(s) have no matching USFM source file in ${sourceDir}:`);
    for (const book of missing) console.error(`  ${book._id}`);
    process.exit(1);
  }

  /** Per-verse override point, applied right before a built record is written or printed — a no-op pass-through when `options.onVerse` is absent. */
  const finalizeVerse = (built: VerseRecord): VerseRecord => (options.onVerse ? options.onVerse(built) : built);

  const metadataEntries: BookMetadata[] = [];
  let totalVerses = 0;
  let totalChapters = 0;

  for (const book of selected) {
    const file = filesByRegistryId.get(book._id)!;
    const source = fs.readFileSync(path.join(sourceDir, file), "utf8");

    const metadata = applyMetadataOverrides(extractBookMetadata(source), options);
    metadataEntries.push(metadata);

    const records = segmentVerses(source, book._id, canonBookIds, options.strongs !== false);

    if (preview) {
      // Skipped: suppressUniformParagraphNoise needs a whole book to tell
      // whether paragraph:true covers 100% of it, but a preview only builds
      // one chapter (see utils/usfm/paragraphNoise.ts's doc comment).
      const chapterRecords = records
        .filter((record) => record.chapter === chapterArgument)
        .map((record) =>
          finalizeVerse({
            book: record.book,
            chapter: record.chapter,
            verse: record.verse,
            content: buildBlockContent(record.blocks),
          }),
        );
      console.log(JSON.stringify(chapterRecords, null, 2));
      continue;
    }

    const verses = suppressUniformParagraphNoise(
      records.map((record) =>
        sortVerseKeys(
          finalizeVerse({
            book: record.book,
            chapter: record.chapter,
            verse: record.verse,
            content: buildBlockContent(record.blocks),
          }),
        ),
      ),
    );
    fs.mkdirSync(versionDir, { recursive: true });
    await writeJsonFile(path.join(versionDir, bookFilename(book)), verses);
    totalVerses += verses.length;
    totalChapters += metadata.chapters;
    console.log(`${bookFilename(book)}: ${metadata.chapters} chapters, ${verses.length} verses`);
  }

  if (!preview) {
    const merged = applyVersionOverrides(mergeBookMetadata(version, metadataEntries), options);
    await writeJsonFile(versionFile, merged);
  }

  console.log(
    `\nDone! ${totalChapters} chapters, ${totalVerses} verses${preview ? " (preview only, nothing written)" : ""}`,
  );

  // See ImportOptions.outputDir's doc comment for why this guard exists.
  if (!preview && versionDir === defaultVersionDir) {
    console.log(`\nRegenerating downstream: npm run audit-links ${versionId} -- --fix, npm run validate...`);
    regenerateDownstream(versionId);
    console.log("Downstream regeneration complete.");
  } else if (!preview) {
    console.log(
      `\nSkipping downstream regeneration: outputDir (${versionDir}) diverges from the real bible-versions/${versionId} — npm run audit-links/npm run validate are both hardwired to that tree.`,
    );
  }
}

/** `main()`'s CLI arguments, parsed from `process.argv.slice(2)` — see {@link parseArgv}. */
export interface ParsedArgv {
  /** The USFM source directory (first positional argument). Absent if too few arguments were given. */
  readonly sourceDir?: string;
  /** The target `bible-versions/` directory name (second positional argument). Absent if too few arguments were given. */
  readonly versionId?: string;
  /** The book name or id to rebuild alone (third positional argument), e.g. `"Genesis"`. Absent: every book in `_version.json` is rebuilt. */
  readonly book?: string;
  /** The chapter to preview (fourth positional argument) — its presence is what puts `runImport` into preview mode. Absent: a real, full write. */
  readonly chapter?: number;
  /** `--no-strongs` folded into {@link ImportOptions}; every other option stays at its default. */
  readonly options: ImportOptions;
}

/**
 * Parses `main()`'s raw CLI argv into {@link runImport}'s arguments — a
 * pure function so `--no-strongs`'s position-independence is testable
 * without spawning a real process. `--no-strongs` is recognized anywhere
 * among the positional arguments and removed before the rest are read
 * positionally, so it never displaces `<source-dir>`/`<version-id>`/
 * `<book>`/`<chapter>` regardless of where a caller places it.
 */
export function parseArgv(argv: readonly string[]): ParsedArgv {
  const noStrongs = argv.includes("--no-strongs");
  const [sourceDir, versionId, book, chapterText] = argv.filter((argument) => argument !== "--no-strongs");
  return {
    sourceDir,
    versionId,
    book,
    chapter: chapterText !== undefined ? parseInt(chapterText, 10) : undefined,
    options: noStrongs ? { strongs: false } : {},
  };
}

/** CLI entry point: parses argv, validates the required positional arguments, and delegates to {@link runImport}. */
async function main(): Promise<void> {
  const { sourceDir, versionId, book, chapter, options } = parseArgv(process.argv.slice(2));
  if (!sourceDir || !versionId) {
    console.error("Usage: npx ts-node utils/importUsfm.ts <source-dir> <version-id> [book] [chapter] [--no-strongs]");
    process.exit(1);
  }

  await runImport(sourceDir, versionId, options, book, chapter);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
