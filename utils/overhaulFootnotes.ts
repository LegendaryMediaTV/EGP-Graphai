#!/usr/bin/env ts-node
/**
 * Version-agnostic footnote-type overhaul: re-classifies every footnote an
 * already-built `bible-versions/<versionId>/*.json` carries through the same
 * shared `classifyFootnote` (`utils/usfm/footnoteTypeRules.ts`) the importer
 * itself uses, and reports (or, with `--fix`, writes) whatever disagrees.
 *
 * The importer (`usfm/footnotes.ts`) classifies once, at import time, from
 * raw USFM tokens. Every other already-shipped version in this repo was
 * never built through that pipeline at all, so a future improvement to
 * `classifyFootnote`'s own pattern table could never reach their existing
 * content without this: a tool that reads what is already on disk, asks the
 * one shared classifier to re-derive `type` from the footnote's own already-
 * built `content`, and reports the disagreement.
 *
 * **Dry-run by default; `--fix` opts in to writing** — the same polarity and
 * CLI shape `utils/auditCrossChapterLinks.ts` already established. Unlike
 * that sibling tool, a version id is always required in both modes: there
 * is no "sweep every version" default here, since previewing without one
 * would answer a question a caller usually asks about a single version;
 * `--fix` needs a target regardless.
 *
 * Usage:
 *   npx ts-node utils/overhaulFootnotes.ts WEBUS2020        # preview one version's changes
 *   npx ts-node utils/overhaulFootnotes.ts WEBUS2020 --fix  # apply and write them
 */

import * as fs from "fs";
import * as path from "path";
import { writeJsonFile } from "../functions/writeJsonFile";
import Footnote from "../types/Footnote";
import VerseSchema from "../types/VerseSchema";
import { ClassifiableFootnoteType, classifyFootnote, flattenContentText } from "./usfm/footnoteTypeRules";

const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");

/** One book file's own verse records, read fresh from disk. */
interface VersionBookFile {
  /** Filename under `bible-versions/<versionId>/`, e.g. `"01-GEN.json"`. */
  file: string;
  /** The book's verse records, as read from `file`. */
  records: VerseSchema[];
}

/**
 * Every book file under `versionDir`, read fresh — mirrors the shape
 * `utils/crossChapterLinks.ts`'s own (module-private) `readVersionBookFiles`
 * already establishes, reimplemented locally rather than shared since that
 * function isn't exported and this loop is too small to warrant becoming
 * one. Takes a directory directly rather than a version id resolved
 * against a hardcoded root, so a test can point it at a temp fixture
 * directory instead of the real `bible-versions/`.
 */
function readBookFiles(versionDir: string): readonly VersionBookFile[] {
  const files = fs.readdirSync(versionDir).filter((file) => file.endsWith(".json") && file !== "_version.json");
  return files.map((file) => ({
    file,
    records: JSON.parse(fs.readFileSync(path.join(versionDir, file), "utf-8")),
  }));
}

/** One real footnote-type disagreement this tool found between what a footnote's own `content` implies and what it is currently tagged. */
export interface FootnoteTypeChange {
  /** The book id the footnote belongs to, e.g. `"GEN"`. */
  book: string;
  /** The chapter number the footnote belongs to. */
  chapter: number;
  /** The verse number the footnote belongs to. */
  verse: number;
  /** The footnote's own plain-text body, flattened via {@link flattenContentText}. */
  body: string;
  /** The `type` currently stored on disk, if any. */
  from: Footnote["type"];
  /** The `type` {@link classifyFootnote} recomputes from `body`. */
  to: ClassifiableFootnoteType;
}

/** What one preview or `--fix` run found. */
export interface FootnoteOverhaulResult {
  /** Every real classification change found, in file order. */
  changes: readonly FootnoteTypeChange[];
  /** Every book file whose own records changed, already carrying the corrected `foot.type`s — what {@link applyFootnoteOverhaul} writes back. */
  changedBooks: readonly VersionBookFile[];
}

/**
 * Walks one verse's own `content` tree the same way `usfm/verify.ts`'s own
 * `collectFootnotes` does — descending into a nested wrapper's own
 * `content` and a `subtitle`/`heading` wrapper's own value — but mutates
 * `foot.type` in place when {@link classifyFootnote} disagrees, rather than
 * only collecting. Built as its own small walker rather than growing
 * `collectFootnotes` a write-back capability no other caller needs.
 */
function reclassifyFootnotesIn(
  content: unknown,
  changes: FootnoteTypeChange[],
  location: { book: string; chapter: number; verse: number },
): void {
  if (Array.isArray(content)) {
    for (const item of content) reclassifyFootnotesIn(item, changes, location);
    return;
  }
  if (content === null || typeof content !== "object") return;

  const node = content as { foot?: Footnote; content?: unknown; subtitle?: unknown; heading?: unknown };
  if (node.foot) {
    const body = flattenContentText(node.foot.content);
    const to = classifyFootnote(body);
    if (node.foot.type !== to) {
      changes.push({ ...location, body, from: node.foot.type, to });
      node.foot.type = to;
    }
  }
  if ("content" in node) reclassifyFootnotesIn(node.content, changes, location);
  if ("subtitle" in node) reclassifyFootnotesIn(node.subtitle, changes, location);
  if ("heading" in node) reclassifyFootnotesIn(node.heading, changes, location);
}

/**
 * Recomputes every footnote's `type` under `versionDir` through
 * {@link classifyFootnote}, in memory only — never writes. Every book whose
 * own records changed comes back in `changedBooks`, already carrying the
 * corrected `foot.type`s and ready for {@link applyFootnoteOverhaul} to write.
 *
 * @param versionDir - An absolute path to one version's own book-file
 *   directory (e.g. `bible-versions/WEBUS2020`, or a temp fixture directory
 *   in tests) — not a version id, so a test never has to point this at the
 *   real repo directory to exercise it.
 */
export function computeFootnoteOverhaul(versionDir: string): FootnoteOverhaulResult {
  const changes: FootnoteTypeChange[] = [];
  const changedBooks: VersionBookFile[] = [];

  for (const book of readBookFiles(versionDir)) {
    const changesBefore = changes.length;
    for (const record of book.records) {
      reclassifyFootnotesIn(record.content, changes, {
        book: record.book,
        chapter: record.chapter,
        verse: record.verse,
      });
    }
    if (changes.length > changesBefore) changedBooks.push(book);
  }

  return { changes, changedBooks };
}

/**
 * {@link computeFootnoteOverhaul}, then writes every changed book back
 * through {@link writeJsonFile} — the only place this module ever writes to
 * disk, and only ever reached through `--fix`. A book with no real change is
 * never opened for writing at all.
 *
 * @param versionDir - Same directory {@link computeFootnoteOverhaul} takes.
 */
export async function applyFootnoteOverhaul(versionDir: string): Promise<FootnoteOverhaulResult> {
  const result = computeFootnoteOverhaul(versionDir);
  for (const { file, records } of result.changedBooks) {
    await writeJsonFile(path.join(versionDir, file), records);
  }
  return result;
}

/** Render one change as this report's one-line format. */
function formatChange(change: FootnoteTypeChange): string {
  return `${change.book} ${change.chapter}:${change.verse} [${change.from ?? "(none)"} -> ${change.to}]: "${change.body}"`;
}

/**
 * Print one human-readable report line per real change found — one summary
 * line when there are none. `applied` only changes the wording (past tense,
 * "written," once `--fix` has actually run) — preview and `--fix` otherwise
 * report the identical shape, so both call sites in `main()` share this one
 * loop instead of each carrying their own copy.
 */
function printReport(versionId: string, result: FootnoteOverhaulResult, applied: boolean): void {
  if (result.changes.length === 0) {
    console.log(applied ? `${versionId}: no footnote needed reclassifying.` : `${versionId}: no footnote reclassifications found.`);
    return;
  }
  const verb = applied ? "reclassified and written" : "found";
  console.log(`${versionId}: ${result.changes.length} footnote type(s) ${verb}, across ${result.changedBooks.length} book file(s):`);
  for (const change of result.changes) console.log(`  ${formatChange(change)}`);
}

/** Parsed CLI arguments, or the shape `main()`'s own guard needs to report an error. */
interface ParsedOverhaulArgs {
  /** Whether `--fix` was given. */
  fix: boolean;
  /** The version id named on the command line. */
  versionArg: string;
}

/**
 * Parses `args` into `{ fix, versionArg }`, or `null` when no version was
 * named — this tool's own version argument is mandatory in both modes (see
 * this module's own header comment for why), unlike
 * `auditCrossChapterLinks.ts`'s sibling guard, which only requires one under
 * `--fix`. Extracted from `main()` so the guard is directly testable without
 * mocking `process.exit`, which no test in this repo does today.
 */
export function parseOverhaulArgs(args: readonly string[]): ParsedOverhaulArgs | null {
  const fix = args.includes("--fix");
  const versionArg = args.find((arg) => arg !== "--fix");
  if (!versionArg) return null;
  return { fix, versionArg };
}

async function main(): Promise<void> {
  const parsed = parseOverhaulArgs(process.argv.slice(2));
  if (!parsed) {
    console.error("A version is required, e.g. `npx ts-node utils/overhaulFootnotes.ts WEBUS2020` or `... WEBUS2020 --fix`");
    process.exit(1);
  }

  const { fix, versionArg } = parsed;
  const versionDir = path.join(BIBLE_VERSIONS_DIR, versionArg);

  if (!fix) {
    printReport(versionArg, computeFootnoteOverhaul(versionDir), false);
    return;
  }

  printReport(versionArg, await applyFootnoteOverhaul(versionDir), true);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
