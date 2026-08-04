#!/usr/bin/env ts-node
/**
 * Standing check: does any version still carry a `bibleLink` that spans two
 * chapters of the same book? `utils/crossChapterLinks.ts` owns the rule;
 * this is the corpus-wide sweep and the CLI around it.
 *
 * **Dry-run by default; `--fix` opts in to writing** — the opposite polarity
 * from this repo's other importers (`utils/convertToSmallCaps.ts`'s
 * `--dry-run` opts *out* of writing), a deliberate choice for a tool whose
 * default use is "tell me the state," not "change it." Without `--fix`,
 * nothing is ever written, in this run or any future one. Every version
 * under `bible-versions/` here is this repo's own, so `--fix` applies to any
 * version named on the command line.
 *
 * Usage:
 *   npx ts-node utils/auditCrossChapterLinks.ts                # audit every version (dry-run report)
 *   npx ts-node utils/auditCrossChapterLinks.ts WEBUS2020       # audit one version (dry-run report)
 *   npx ts-node utils/auditCrossChapterLinks.ts WEBUS2020 --fix # split that version's findings and write them
 */

import * as fs from "fs";
import * as path from "path";
import { writeJsonFile } from "../functions/writeJsonFile";
import { CrossChapterFinding, FixedBook, findCrossChapterLinks, fixCrossChapterLinks } from "./crossChapterLinks";

const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");

/** One version's audit. */
export interface VersionAudit {
  version: string;
  findings: readonly CrossChapterFinding[];
  scanned: number;
  wholeChapterRanges: number;
}

/** Every version this repo carries under `bible-versions/`, directory-listed rather than hardcoded so an added or removed version is picked up automatically. */
export function allVersionIds(): readonly string[] {
  return fs
    .readdirSync(BIBLE_VERSIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Audit each named version, or every version on disk when none are named.
 *
 * @param versionIds - Versions to audit; defaults to {@link allVersionIds}.
 */
export function auditVersions(versionIds: readonly string[] = allVersionIds()): readonly VersionAudit[] {
  return versionIds.map((version) => ({
    version,
    ...findCrossChapterLinks(version),
  }));
}

/**
 * The exit code this check should report.
 *
 * Non-zero when any version still carries an unsplit cross-chapter finding —
 * every version under `bible-versions/` here is directly editable, so a
 * finding is always something this repo can and should fix.
 */
export function exitCodeFor(summaries: readonly VersionAudit[]): number {
  return summaries.some((summary) => summary.findings.length > 0) ? 1 : 0;
}

/** Print one human-readable report line per version that has anything to say — silent for a version with zero findings and zero whole-chapter ranges. */
function printReport(summaries: readonly VersionAudit[]): void {
  const totalScanned = summaries.reduce((sum, summary) => sum + summary.scanned, 0);
  console.log(`Scanned ${totalScanned} bibleLink(s) across ${summaries.length} version(s).\n`);

  for (const summary of summaries) {
    if (summary.findings.length === 0 && summary.wholeChapterRanges === 0) continue;

    console.log(`${summary.version}:`);
    for (const finding of summary.findings) {
      console.log(
        `  ${finding.atBook} ${finding.atChapter}:${finding.atVerse} [${finding.footnoteType ?? "(none)"}/${finding.zone}]: ` +
          `"${finding.target}" spans ${finding.book ?? finding.target} ${finding.fromChapter}–${finding.toChapter} — unsplit`,
      );
    }
    if (summary.wholeChapterRanges > 0) {
      console.log(`  (${summary.wholeChapterRanges} whole-chapter range(s), out of scope by the cross-chapter convention — not a finding)`);
    }
    console.log("");
  }
}

/**
 * Split every cross-chapter-range `bibleLink` `versionId` carries and write
 * each changed book file back — the only place this CLI ever writes to
 * `bible-versions/`, and only ever reached through `--fix`.
 */
async function applyFix(versionId: string): Promise<readonly FixedBook[]> {
  const fixedBooks = fixCrossChapterLinks(versionId);
  for (const { file, records } of fixedBooks) {
    await writeJsonFile(path.join(BIBLE_VERSIONS_DIR, versionId, file), records);
  }
  return fixedBooks;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const versionArg = args.find((arg) => arg !== "--fix");

  if (fix) {
    if (!versionArg) {
      console.error("--fix requires a version, e.g. `npx ts-node utils/auditCrossChapterLinks.ts WEBUS2020 --fix`");
      process.exit(1);
    }
    const fixedBooks = await applyFix(versionArg);
    if (fixedBooks.length === 0) {
      console.log(`${versionArg}: no cross-chapter link needed splitting.`);
      return;
    }
    for (const { file, splits } of fixedBooks) {
      console.log(`${versionArg}/${file}: ${splits} cross-chapter split(s) written.`);
    }
    return;
  }

  const summaries = auditVersions(versionArg ? [versionArg] : undefined);
  printReport(summaries);
  process.exit(exitCodeFor(summaries));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
