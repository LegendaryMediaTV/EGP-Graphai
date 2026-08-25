#!/usr/bin/env ts-node
/**
 * Applies `auditNodes.ts`'s own check 6: puts `paragraph: true` on the node
 * right after every heading/subtitle run that doesn't already carry it.
 *
 * The convention is flat and corpus-wide — a heading or subtitle followed by
 * anything that is not itself a heading or subtitle opens a paragraph, in
 * every version and every book — so unlike check 1's fixer
 * (`fixUnmergedNodes.ts`), there is no judgment call about *whether* to act,
 * only about *which* node to act on. That decision stays in `auditNodes.ts`:
 * this script imports {@link findHeadingParagraphMismatches} and writes to
 * the node its `nextIndex` names, so the run-collapsing and the
 * skip-past-invisible-nodes rules live in exactly one place rather than in
 * two copies that could drift apart.
 *
 * Most sources never write the paragraph themselves: a USFM `\d`
 * superscription, `\sp` speaker label, or `\qc` acrostic letter is normally
 * followed by a bare `\q1`, never a `\p`. `usfm/segmentVerses.ts`'s own
 * heading dispatch now supplies it on the way in, which covers every future
 * import; this script is for the versions already on disk, including the
 * ones (KJV1769, YLT1898, CLV1880, BYZ2018) with no USFM source in this repo
 * to reimport from.
 *
 * A node that has no `text` of its own to host the flag is never the target:
 * `skipsPastHeadingRun` already walks past those before naming `next`, the
 * same way the audit does when reporting.
 *
 * Usage:
 *   npx ts-node utils/fixHeadingParagraphs.ts                 # preview, every version
 *   npx ts-node utils/fixHeadingParagraphs.ts ASV1901         # preview, one version
 *   npx ts-node utils/fixHeadingParagraphs.ts ASV1901 --fix   # write
 */

import * as fs from "fs";
import * as path from "path";
import { getVersionDirectories } from "../functions/getBibleVersions";
import { sortVerseKeys } from "../functions/sortContentKeys";
import { writeJsonFile } from "../functions/writeJsonFile";
import { findHeadingParagraphMismatches, VerseRecord } from "./auditNodes";

const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");
const VERSE_FILE_NAME = /^\d{2}-[A-Z0-9]+\.json$/;

/**
 * Returns `node` with `paragraph: true` added. A bare string node has no
 * room for a flag, so it becomes the `{paragraph, text}` object the schema
 * already uses everywhere else for a flagged line; every other node keeps
 * all of its own properties. Key order is left to `sortVerseKeys`, which
 * recurses into `content` on the way back out.
 */
function withParagraph(node: unknown): unknown {
  if (typeof node === "string") return { paragraph: true, text: node };
  if (node === null || typeof node !== "object" || Array.isArray(node))
    throw new Error(`cannot flag a ${node === null ? "null" : typeof node} node as opening a paragraph`);
  return { paragraph: true, ...(node as Record<string, unknown>) };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--fix");
  const requestedVersion = args.find((arg) => !arg.startsWith("--"));
  const versions = requestedVersion ? [requestedVersion] : getVersionDirectories();

  let totalFlags = 0;
  let totalVerses = 0;

  for (const version of versions) {
    const versionDir = path.join(BIBLE_VERSIONS_DIR, version);
    const files = fs.readdirSync(versionDir).filter((file) => VERSE_FILE_NAME.test(file));

    let versionFlags = 0;
    let versionVerses = 0;

    for (const file of files) {
      const filePath = path.join(versionDir, file);
      const records: VerseRecord[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      let fileChanged = false;

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        // One verse at a time: the audit's own per-book pass is a plain
        // flatMap over verses with no cross-verse state, so a one-verse
        // array reports exactly this verse's own findings, and every
        // `nextIndex` indexes straight into this verse's own content.
        const findings = findHeadingParagraphMismatches([record]);
        if (findings.length === 0) continue;

        const nodes = record.content;
        if (!Array.isArray(nodes))
          throw new Error(`${version} ${record.book} ${record.chapter}:${record.verse} has a finding but its content is not an array`);

        const rewritten: unknown[] = [...nodes];
        for (const finding of findings) rewritten[finding.nextIndex] = withParagraph(rewritten[finding.nextIndex]);

        records[i] = sortVerseKeys({ ...record, content: rewritten as never });
        versionFlags += findings.length;
        versionVerses++;
        fileChanged = true;
      }

      if (write && fileChanged) await writeJsonFile(filePath, records);
    }

    if (versionVerses > 0) {
      console.log(
        `${version}: ${versionFlags} flag(s) across ${versionVerses} verse(s) ${write ? "added" : "would be added"}`,
      );
    }
    totalFlags += versionFlags;
    totalVerses += versionVerses;
  }

  if (totalVerses === 0) {
    console.log("Every heading/subtitle run already opens a paragraph.");
    return;
  }

  console.log(`\n${totalFlags} flag(s) across ${totalVerses} verse(s) total.`);
  if (!write) console.log("Re-run with --fix to write.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
