#!/usr/bin/env ts-node
/**
 * Version-agnostic reference overhaul: re-scans every non-`xrf` footnote an
 * already-built `bible-versions/<versionId>/*.json` carries through the same
 * shared {@link linkEmbeddedReferences} (`utils/usfm/references.ts`) the
 * importer itself uses at parse time, and reports (or, with `--fix`, writes)
 * every reference it finds sitting unlinked inside the footnote's own prose.
 *
 * The importer (`usfm/footnotes.ts`) runs this scan once, at import time,
 * against raw USFM tokens. Any version built any other way — or imported
 * before a grammar improvement landed — never has its already-shipped
 * footnotes re-scanned at all, so a later improvement to the shared
 * reference grammar could never reach their existing content without this:
 * a tool that reads what is already on disk, asks the one shared scanner to
 * find whatever it can in each footnote's own already-built `content`, and
 * reports what it found.
 *
 * **Purely additive, never a downgrade.** Unlike `overhaulFootnotes.ts`'s
 * own type reclassification, this transform only ever turns a plain string
 * into a `bibleLink` — it never removes, re-targets, or second-guesses a
 * `bibleLink` already there (an already-tagged node is left untouched by
 * {@link linkEmbeddedReferences} itself). There is no `--hard-reset` here for
 * the same reason `overhaulFootnotes.ts` needs one and this doesn't: nothing
 * this tool could ever write is worth discarding wholesale rather than
 * simply re-finding.
 *
 * **Dry-run by default; `--fix` opts in to writing** — the same polarity
 * `overhaulFootnotes.ts` already established. A version id is always
 * required in both modes; an optional book id narrows either mode to one
 * book's own file, for reviewing or applying a change set one book at a
 * time rather than a whole version at once.
 *
 * **Through `npm run`, `--fix` needs a bare `--` ahead of it**, the same
 * npm-config-swallowing hazard `overhaulFootnotes.ts` guards against; see
 * {@link findSwallowedFlags}.
 *
 * Usage:
 *   npm run overhaul-references WEBUS2020                # preview a whole version
 *   npm run overhaul-references WEBUS2020 GEN             # preview one book
 *   npm run overhaul-references WEBUS2020 -- --fix        # apply and write
 *   npm run overhaul-references WEBUS2020 GEN -- --fix    # apply and write one book
 *
 * Invoked directly, the `--` is unnecessary:
 *   npx ts-node utils/overhaulReferences.ts WEBUS2020 GEN --fix
 */

import * as fs from "fs";
import * as path from "path";
import { writeJsonFile } from "../functions/writeJsonFile";
import Content, { ContentBibleLink } from "../types/Content";
import Footnote from "../types/Footnote";
import VerseSchema from "../types/VerseSchema";
import { linkEmbeddedReferences } from "./usfm/references";

const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");

/** One book file's own verse records, read fresh from disk. */
interface VersionBookFile {
  /** Filename under `bible-versions/<versionId>/`, e.g. `"01-GEN.json"`. */
  file: string;
  /** The book's verse records, as read from `file`. */
  records: VerseSchema[];
}

/**
 * Every book file under `versionDir`, optionally narrowed to one book id —
 * mirrors `overhaulFootnotes.ts`'s own `readBookFiles`, reimplemented here
 * rather than shared since that function isn't exported and this loop is
 * too small to warrant becoming one, the same reasoning that module's own
 * doc comment already gives for not sharing `crossChapterLinks.ts`'s
 * version.
 *
 * @param bookId - When given, only the one file whose own filename ends
 *   `-<bookId>.json` is read — every other book in the version is left
 *   untouched and unread. A book id naming no file in `versionDir` yields an
 *   empty list rather than an error, the same "nothing to do" shape an empty
 *   version directory already produces.
 */
function readBookFiles(versionDir: string, bookId?: string): readonly VersionBookFile[] {
  const files = fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".json") && file !== "_version.json")
    .filter((file) => bookId === undefined || file.endsWith(`-${bookId}.json`));
  return files.map((file) => ({
    file,
    records: JSON.parse(fs.readFileSync(path.join(versionDir, file), "utf-8")),
  }));
}

/** One embedded reference {@link reviseEmbeddedReferencesIn} found and linked, with enough identity to report it. */
export interface ReferenceChange {
  /** The book id the footnote belongs to, e.g. `"GEN"`. */
  book: string;
  /** The chapter number the footnote belongs to. */
  chapter: number;
  /** The verse number the footnote belongs to. */
  verse: number;
  /** The exact source text this pass turned into a `bibleLink` (its own display text, unchanged). */
  raw: string;
  /** The resolved `bibleLink` target. */
  target: string;
}

/** What one preview or `--fix` run found. */
export interface ReferenceOverhaulResult {
  /** Every real reference found and linked, in file order. */
  changes: readonly ReferenceChange[];
  /** Every book file whose own records changed, already carrying the newly-linked `bibleLink`s — what {@link applyReferenceOverhaul} writes back. */
  changedBooks: readonly VersionBookFile[];
}

/** One embedded reference found by a single string's own rewrite, before it's wrapped with its verse location. */
interface FoundReference {
  /** The exact source text this pass turned into a `bibleLink` (its own display text, unchanged). */
  raw: string;
  /** The resolved `bibleLink` target. */
  target: string;
}

/** Every `bibleLink` node found anywhere in `content`, walked the same way `validate.ts`'s own tree walkers do — array, then any object's own `bibleLink`/`content`/`heading`/`subtitle`. */
function collectBibleLinks(content: unknown, out: FoundReference[]): void {
  if (Array.isArray(content)) {
    for (const item of content) collectBibleLinks(item, out);
    return;
  }
  if (content === null || typeof content !== "object") return;

  const node = content as Record<string, unknown>;
  if (typeof node.bibleLink === "string") {
    const link = node as unknown as ContentBibleLink;
    out.push({ raw: typeof link.content === "string" ? link.content : link.bibleLink, target: link.bibleLink });
    return;
  }
  if ("content" in node) collectBibleLinks(node.content, out);
  if ("heading" in node) collectBibleLinks(node.heading, out);
  if ("subtitle" in node) collectBibleLinks(node.subtitle, out);
}

/**
 * Runs {@link linkEmbeddedReferences} once against one already-built
 * footnote `content` tree and reports exactly which `bibleLink`s are new —
 * one entry per newly-linked reference, each carrying the resolved
 * `bibleLink`'s own target.
 *
 * Finds "new" by a count-based diff between every `bibleLink` collected
 * before the rewrite and every one collected after, rather than by rerunning
 * the transform per plain-string item in isolation: {@link
 * linkEmbeddedReferences} can now resolve a bare, book-less reference
 * against a book named earlier in the *same* footnote body — an
 * already-tagged `bibleLink` sibling, or an ordinary reference elsewhere in
 * the body (`AmbientBook`, `utils/usfm/references.ts`) — so a per-item rerun
 * would lose that cross-item context and under-report exactly the citations
 * this capability exists to catch. A single before/after diff against the
 * whole tree has no such blind spot, and is simpler besides: {@link
 * linkEmbeddedReferences} never removes or re-targets an existing
 * `bibleLink`, so `before` is always a sub-multiset of `after`, and whatever
 * is left over once each `before` entry cancels one matching `after` entry
 * is exactly what this pass added.
 */
function findNewlyLinkedReferences(content: Content): { content: Content; found: readonly FoundReference[] } {
  const before: FoundReference[] = [];
  collectBibleLinks(content, before);

  const rewritten = linkEmbeddedReferences(content);

  const after: FoundReference[] = [];
  collectBibleLinks(rewritten, after);

  const remainingBefore = new Map<string, number>();
  for (const reference of before) {
    const key = `${reference.target} ${reference.raw}`;
    remainingBefore.set(key, (remainingBefore.get(key) ?? 0) + 1);
  }

  const found: FoundReference[] = [];
  for (const reference of after) {
    const key = `${reference.target} ${reference.raw}`;
    const remaining = remainingBefore.get(key) ?? 0;
    if (remaining > 0) remainingBefore.set(key, remaining - 1);
    else found.push(reference);
  }

  return { content: rewritten, found };
}

/**
 * Walks one verse's own `content` tree the same way `overhaulFootnotes.ts`'s
 * own `reclassifyFootnotesIn` does — descending into a nested wrapper's own
 * `content` and a `subtitle`/`heading` wrapper's own value — but rewrites a
 * `foot.content` in place when {@link findNewlyLinkedReferences} finds
 * something new, rather than only collecting.
 *
 * An `xrf`-typed footnote is skipped outright: its content is already
 * nothing but reference-shaped runs, resolved through a different path
 * (`buildReferenceOnlyContent`/`buildCrossReferenceContent`) at import time,
 * so re-scanning it here would either find nothing (the common case) or
 * risk re-processing an already-correct cross-reference body — the same
 * "non-`xrf` only" scope `usfm/footnotes.ts` itself applies to
 * {@link linkEmbeddedReferences} at import time.
 */
function reviseEmbeddedReferencesIn(
  content: unknown,
  changes: ReferenceChange[],
  location: { book: string; chapter: number; verse: number },
): void {
  if (Array.isArray(content)) {
    for (const item of content) reviseEmbeddedReferencesIn(item, changes, location);
    return;
  }
  if (content === null || typeof content !== "object") return;

  const node = content as { foot?: Footnote; content?: unknown; subtitle?: unknown; heading?: unknown };
  if (node.foot && node.foot.type !== "xrf") {
    const { content: rewritten, found } = findNewlyLinkedReferences(node.foot.content);
    if (found.length > 0) {
      for (const reference of found) changes.push({ ...location, ...reference });
      node.foot = { ...node.foot, content: rewritten };
    }
  }
  if ("content" in node) reviseEmbeddedReferencesIn(node.content, changes, location);
  if ("subtitle" in node) reviseEmbeddedReferencesIn(node.subtitle, changes, location);
  if ("heading" in node) reviseEmbeddedReferencesIn(node.heading, changes, location);
}

/** Options shared by {@link computeReferenceOverhaul} and {@link applyReferenceOverhaul}. */
export interface ReferenceOverhaulOptions {
  /** Narrows the run to one book's own file — see {@link readBookFiles}. */
  book?: string;
}

/**
 * Finds every embedded reference under `versionDir` through
 * {@link linkEmbeddedReferences}, in memory only — never writes. Every book
 * whose own records changed comes back in `changedBooks`, already carrying
 * the newly-linked `bibleLink`s and ready for {@link
 * applyReferenceOverhaul} to write.
 *
 * @param versionDir - An absolute path to one version's own book-file
 *   directory (e.g. `bible-versions/WEBUS2020`, or a temp fixture directory
 *   in tests) — not a version id, so a test never has to point this at the
 *   real repo directory to exercise it.
 */
export function computeReferenceOverhaul(
  versionDir: string,
  { book }: ReferenceOverhaulOptions = {},
): ReferenceOverhaulResult {
  const changes: ReferenceChange[] = [];
  const changedBooks: VersionBookFile[] = [];

  for (const bookFile of readBookFiles(versionDir, book)) {
    const changesBefore = changes.length;
    for (const record of bookFile.records) {
      reviseEmbeddedReferencesIn(record.content, changes, { book: record.book, chapter: record.chapter, verse: record.verse });
    }
    if (changes.length > changesBefore) changedBooks.push(bookFile);
  }

  return { changes, changedBooks };
}

/**
 * {@link computeReferenceOverhaul}, then writes every changed book
 * back through {@link writeJsonFile} — the only place this module ever
 * writes to disk, and only ever reached through `--fix`. A book with no real
 * change is never opened for writing at all.
 *
 * @param versionDir - Same directory {@link computeReferenceOverhaul} takes.
 */
export async function applyReferenceOverhaul(
  versionDir: string,
  options: ReferenceOverhaulOptions = {},
): Promise<ReferenceOverhaulResult> {
  const result = computeReferenceOverhaul(versionDir, options);
  for (const { file, records } of result.changedBooks) {
    await writeJsonFile(path.join(versionDir, file), records);
  }
  return result;
}

/** Render one change as this report's one-line format. */
function formatChange(change: ReferenceChange): string {
  return `${change.book} ${change.chapter}:${change.verse} [linked -> ${change.target}]: "${change.raw}"`;
}

/**
 * Print one human-readable report line per real change found — one summary
 * line when there are none. `applied` only changes the wording (past tense,
 * "written," once `--fix` has actually run) — preview and `--fix` otherwise
 * report the identical shape, matching `overhaulFootnotes.ts`'s own
 * `printReport`.
 */
function printReport(versionId: string, result: ReferenceOverhaulResult, applied: boolean): void {
  if (result.changes.length === 0) {
    console.log(applied ? `${versionId}: no embedded reference needed linking.` : `${versionId}: no embedded references found.`);
    return;
  }
  const verb = applied ? "linked and written" : "found";
  console.log(
    `${versionId}: ${result.changes.length} embedded reference(s) ${verb}, across ${result.changedBooks.length} book file(s):`,
  );
  for (const change of result.changes) console.log(`  ${formatChange(change)}`);
}

/** Parsed CLI arguments, or the shape `main()`'s own guard needs to report an error. */
interface ParsedOverhaulArgs {
  /** Whether `--fix` was given. */
  fix: boolean;
  /** The version id named on the command line. */
  versionArg: string;
  /** The book id named on the command line, if any — the second positional argument, distinct from either flag. */
  bookArg: string | undefined;
}

/**
 * Parses `args` into `{ fix, versionArg, bookArg }`, or `null` when no
 * version was named. The version is always the first non-flag token; a
 * second non-flag token, if present, is the book id. Extracted from
 * `main()` so the guard is directly testable without mocking
 * `process.exit`, matching `overhaulFootnotes.ts`'s own `parseOverhaulArgs`.
 */
export function parseOverhaulArgs(args: readonly string[]): ParsedOverhaulArgs | null {
  const fix = args.includes("--fix");
  const positional = args.filter((arg) => arg !== "--fix");
  const [versionArg, bookArg] = positional;
  if (!versionArg) return null;
  return { fix, versionArg, bookArg };
}

/**
 * This tool's own flags, paired with the `npm_config_*` environment variable
 * npm sets when it swallows one instead of forwarding it — the identical
 * mechanism `overhaulFootnotes.ts`'s own `findSwallowedFlags` guards
 * against, reproduced here rather than shared since that function isn't
 * exported and this list is too small to warrant becoming one.
 */
const FLAG_ENV_NAMES: ReadonlyArray<readonly [flag: string, envName: string]> = [["--fix", "npm_config_fix"]];

/**
 * Which of this tool's flags npm ate rather than passed along — see
 * `overhaulFootnotes.ts`'s own `findSwallowedFlags` header comment for why
 * this check exists and what it costs (nothing).
 */
export function findSwallowedFlags(args: readonly string[], env: NodeJS.ProcessEnv): string[] {
  return FLAG_ENV_NAMES.filter(([flag, envName]) => env[envName] !== undefined && !args.includes(flag)).map(([flag]) => flag);
}

/**
 * CLI entry point: guards against an npm-swallowed flag and a missing
 * version, then previews or writes the link pass via
 * {@link computeReferenceOverhaul}/{@link applyReferenceOverhaul}.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const swallowed = findSwallowedFlags(args, process.env);
  if (swallowed.length > 0) {
    console.error(
      `npm consumed ${swallowed.join(" and ")} instead of passing ${swallowed.length > 1 ? "them" : "it"} to this script.\n` +
        `Put a bare -- before the flags: \`npm run overhaul-references <version> [book] -- ${swallowed.join(" ")}\``,
    );
    process.exit(1);
  }

  const parsed = parseOverhaulArgs(args);
  if (!parsed) {
    console.error(
      "A version is required, e.g. `npm run overhaul-references WEBUS2020` or `npm run overhaul-references WEBUS2020 GEN -- --fix`",
    );
    process.exit(1);
    return;
  }

  const { fix, versionArg, bookArg } = parsed;
  const versionDir = path.join(BIBLE_VERSIONS_DIR, versionArg);

  if (!fix) {
    printReport(versionArg, computeReferenceOverhaul(versionDir, { book: bookArg }), false);
    return;
  }

  printReport(versionArg, await applyReferenceOverhaul(versionDir, { book: bookArg }), true);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
