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
 * **By default this tool never replaces a stored type with `stu`.** `stu` is
 * `classifyFootnote`'s own default — what it returns when a body carries
 * none of the other three types' own constructs, not a considered judgment
 * that the note is untyped. Some already-typed corpora carry many real
 * `trn` notes that are bare glosses with no marker at all (`expanse`,
 * `luminaries`, `moves about on`): a human classified those once, from
 * context this tool cannot see, and re-running them through
 * `classifyFootnote` finds no textual signal either way. Overwriting that
 * stored judgment with the catch-all type would discard it on no evidence,
 * not correct it. Every upgrade out of `stu` (`stu → trn`, `stu → var`,
 * `stu → xrf`) stays unconditional — several corpora are bulk-typed 100%
 * `stu` and need exactly that.
 *
 * **`--hard-reset` discards every stored type and re-derives all of them**
 * from the classifier alone, `stu` included. That is the mode for a corpus
 * whose stored types are not worth keeping: a bulk-typed placeholder, an
 * earlier machine pass whose output is now suspect, or any version being
 * reclassified from scratch rather than corrected. Without it a stored
 * non-`stu` type is unreachable by `stu`, so a caller who wanted a clean
 * re-derivation would otherwise have to blank every type by hand first.
 *
 * **Dry-run by default; `--fix` opts in to writing** — the same polarity and
 * CLI shape `utils/auditCrossChapterLinks.ts` already established. Unlike
 * that sibling tool, a version id is always required in both modes: there
 * is no "sweep every version" default here, since previewing without one
 * would answer a question a caller usually asks about a single version;
 * `--fix` needs a target regardless. `--hard-reset` composes with both: on
 * its own it previews the full re-derivation, and with `--fix` it writes it.
 *
 * **Through `npm run`, every flag needs a bare `--` ahead of it.** `npm run
 * overhaul-footnotes WEBUS2020 --fix` does not reach this script at all:
 * npm reads `--fix` as one of its own config settings, warns `Unknown cli
 * config "--fix"`, and runs a plain preview. `importUsfm.ts` and
 * `validate.ts` already spell their own `audit-links` invocations this way.
 * {@link findSwallowedFlags} turns that into a loud failure rather than a
 * silently wrong run.
 *
 * Usage:
 *   npm run overhaul-footnotes WEBUS2020                        # preview one version's changes
 *   npm run overhaul-footnotes WEBUS2020 -- --fix               # apply and write them
 *   npm run overhaul-footnotes WEBUS2020 -- --hard-reset        # preview a from-scratch re-derivation
 *   npm run overhaul-footnotes WEBUS2020 -- --hard-reset --fix  # apply and write that re-derivation
 *
 * Invoked directly, the `--` is unnecessary:
 *   npx ts-node utils/overhaulFootnotes.ts WEBUS2020 --hard-reset --fix
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
 *
 * @param hardReset - When false (the default), a recomputed `to` of `stu` is
 *   skipped whenever the stored `from` is some other real type, for the
 *   reason this module's own header comment gives: `classifyFootnote`
 *   finding no signal is not evidence that a specific stored type was
 *   wrong. When true, the stored type carries no weight at all and every
 *   footnote takes whatever the classifier derives. Either way `stu → stu`
 *   never reaches the check, since it isn't a change.
 */
function reclassifyFootnotesIn(
  content: unknown,
  changes: FootnoteTypeChange[],
  location: { book: string; chapter: number; verse: number },
  hardReset: boolean,
): void {
  if (Array.isArray(content)) {
    for (const item of content) reclassifyFootnotesIn(item, changes, location, hardReset);
    return;
  }
  if (content === null || typeof content !== "object") return;

  const node = content as { foot?: Footnote; content?: unknown; subtitle?: unknown; heading?: unknown };
  if (node.foot) {
    const body = flattenContentText(node.foot.content);
    const to = classifyFootnote(body);
    const isDowngradeToStu = to === "stu" && node.foot.type !== undefined && node.foot.type !== "stu";
    if (node.foot.type !== to && (hardReset || !isDowngradeToStu)) {
      changes.push({ ...location, body, from: node.foot.type, to });
      node.foot.type = to;
    }
  }
  if ("content" in node) reclassifyFootnotesIn(node.content, changes, location, hardReset);
  if ("subtitle" in node) reclassifyFootnotesIn(node.subtitle, changes, location, hardReset);
  if ("heading" in node) reclassifyFootnotesIn(node.heading, changes, location, hardReset);
}

/** Options shared by {@link computeFootnoteOverhaul} and {@link applyFootnoteOverhaul}. */
export interface FootnoteOverhaulOptions {
  /** Discards every stored type and re-derives all of them, `stu` included — off by default; see this module's own header comment for when that is the right mode. */
  hardReset?: boolean;
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
export function computeFootnoteOverhaul(
  versionDir: string,
  { hardReset = false }: FootnoteOverhaulOptions = {},
): FootnoteOverhaulResult {
  const changes: FootnoteTypeChange[] = [];
  const changedBooks: VersionBookFile[] = [];

  for (const book of readBookFiles(versionDir)) {
    const changesBefore = changes.length;
    for (const record of book.records) {
      reclassifyFootnotesIn(
        record.content,
        changes,
        { book: record.book, chapter: record.chapter, verse: record.verse },
        hardReset,
      );
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
export async function applyFootnoteOverhaul(
  versionDir: string,
  options: FootnoteOverhaulOptions = {},
): Promise<FootnoteOverhaulResult> {
  const result = computeFootnoteOverhaul(versionDir, options);
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
    console.log(
      applied ? `${versionId}: no footnote needed reclassifying.` : `${versionId}: no footnote reclassifications found.`,
    );
    return;
  }
  const verb = applied ? "reclassified and written" : "found";
  console.log(
    `${versionId}: ${result.changes.length} footnote type(s) ${verb}, across ${result.changedBooks.length} book file(s):`,
  );
  for (const change of result.changes) console.log(`  ${formatChange(change)}`);
}

/** Parsed CLI arguments, or the shape `main()`'s own guard needs to report an error. */
interface ParsedOverhaulArgs {
  /** Whether `--fix` was given. */
  fix: boolean;
  /** Whether `--hard-reset` was given — see this module's own header comment for what it discards. */
  hardReset: boolean;
  /** The version id named on the command line. */
  versionArg: string;
}

/**
 * Parses `args` into `{ fix, hardReset, versionArg }`, or `null` when
 * no version was named — this tool's own version argument is mandatory in
 * both modes (see this module's own header comment for why), unlike
 * `auditCrossChapterLinks.ts`'s sibling guard, which only requires one under
 * `--fix`. Extracted from `main()` so the guard is directly testable without
 * mocking `process.exit`, which no test in this repo does today.
 */
export function parseOverhaulArgs(args: readonly string[]): ParsedOverhaulArgs | null {
  const fix = args.includes("--fix");
  const hardReset = args.includes("--hard-reset");
  const versionArg = args.find((arg) => arg !== "--fix" && arg !== "--hard-reset");
  if (!versionArg) return null;
  return { fix, hardReset, versionArg };
}

/**
 * This tool's own flags, paired with the `npm_config_*` environment variable
 * npm sets when it swallows one instead of forwarding it.
 */
const FLAG_ENV_NAMES: ReadonlyArray<readonly [flag: string, envName: string]> = [
  ["--fix", "npm_config_fix"],
  ["--hard-reset", "npm_config_hard_reset"],
];

/**
 * Which of this tool's flags npm ate rather than passed along. `npm run
 * <script> --fix` does not forward `--fix` to the script: npm reads it as
 * one of its own config settings, warns `Unknown cli config "--fix"`, and
 * runs the script with no flag at all. Only `npm run <script> -- --fix`
 * forwards it, which is why `importUsfm.ts` and `validate.ts` both already
 * spell their own `audit-links` invocations with the `--` separator.
 *
 * Worth detecting rather than only documenting, because both failure modes
 * are silent and one of them is dangerous. A swallowed `--fix` merely
 * previews when the caller expected a write, but a swallowed `--hard-reset`
 * alongside a forwarded `--fix` (`npm run overhaul-footnotes ASV1901
 * --hard-reset -- --fix`) writes the wrong mode's results to disk. npm
 * leaves the evidence behind in the environment either way, so the check
 * costs nothing.
 *
 * @param args - `process.argv.slice(2)`, the flags that did arrive.
 * @param env - `process.env`, carrying npm's own record of what it consumed.
 */
export function findSwallowedFlags(args: readonly string[], env: NodeJS.ProcessEnv): string[] {
  return FLAG_ENV_NAMES.filter(([flag, envName]) => env[envName] !== undefined && !args.includes(flag)).map(([flag]) => flag);
}

/**
 * CLI entry point: guards against an npm-swallowed flag and a missing
 * version, then previews or writes the reclassification via
 * {@link computeFootnoteOverhaul}/{@link applyFootnoteOverhaul}.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const swallowed = findSwallowedFlags(args, process.env);
  if (swallowed.length > 0) {
    console.error(
      `npm consumed ${swallowed.join(" and ")} instead of passing ${swallowed.length > 1 ? "them" : "it"} to this script.\n` +
        `Put a bare -- before the flags: \`npm run overhaul-footnotes <version> -- ${swallowed.join(" ")}\``,
    );
    process.exit(1);
  }

  const parsed = parseOverhaulArgs(args);
  if (!parsed) {
    console.error(
      "A version is required, e.g. `npm run overhaul-footnotes WEBUS2020` or `npm run overhaul-footnotes WEBUS2020 -- --fix`",
    );
    process.exit(1);
    return;
  }

  const { fix, hardReset, versionArg } = parsed;
  const versionDir = path.join(BIBLE_VERSIONS_DIR, versionArg);

  if (!fix) {
    printReport(versionArg, computeFootnoteOverhaul(versionDir, { hardReset }), false);
    return;
  }

  printReport(versionArg, await applyFootnoteOverhaul(versionDir, { hardReset }), true);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
