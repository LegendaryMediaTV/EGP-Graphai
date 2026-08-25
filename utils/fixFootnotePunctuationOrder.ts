#!/usr/bin/env ts-node
/**
 * Applies `auditNodes.ts`'s own check 8 in the one direction it ever
 * recommends: moves a leading run of tight punctuation off a footed node's
 * real next sibling and onto the end of the footed node's own `text`
 * instead, since `utils/exportContent.ts`'s renderer always places a node's
 * footnote marker in its `suffix`, after that node's own full `core` text
 * (`RenderedParts` there) — a footnote marker between a word and the
 * punctuation that belongs to the same clause is always wrong; the marker
 * has to render after the punctuation, not before it.
 *
 * The transform looks purely mechanical — move some characters from one
 * node's `text` to another's — but still needs the same kind of
 * human-reviewable judgment `fixUnmergedNodes.ts`'s own check-1 fixer
 * applies, for two independent reasons:
 *
 * 1. **Formatting eligibility.** A footed node and its punctuation-leading
 *    sibling that disagree in `marks`/`script` (Galatians 3:18: `marks:
 *    ["i"]` vs. a bare, unmarked `"."`) might have stayed split on purpose;
 *    absorbing the punctuation without checking would be guessing, the same
 *    bar `canJoinForward` already applies for check 1's own merges. This
 *    script re-derives that exact two-field comparison locally (see
 *    `agreesInFormatting` below) rather than importing `auditNodes.ts`'s own
 *    private function of the same name — only `isRealAttachmentPoint` and
 *    `leadingTightPunctuationSplit` are exported from that module;
 *    `agreesInFormatting` stays private there, so this script keeps its own
 *    copy.
 * 2. **Silent data loss.** When the sibling's *entire* text is the
 *    punctuation run, removing the now-empty sibling is only safe when it
 *    carries nothing beyond `text`/`marks`/`script`. A sibling carrying a
 *    real property beyond those three (Matthew 13:35's `break: true`) would
 *    have that property silently discarded by an unconditional delete; this
 *    script refuses and reports the finding as skipped instead.
 *
 * Usage:
 *   npx ts-node utils/fixFootnotePunctuationOrder.ts                 # preview, every version
 *   npx ts-node utils/fixFootnotePunctuationOrder.ts YLT1898         # preview, one version
 *   npx ts-node utils/fixFootnotePunctuationOrder.ts YLT1898 --fix   # write
 */

import * as fs from "fs";
import * as path from "path";
import { getVersionDirectories } from "../functions/getBibleVersions";
import { sortVerseKeys } from "../functions/sortContentKeys";
import { writeJsonFile } from "../functions/writeJsonFile";
import {
  describeNode,
  findStrongsNodeIssues,
  isRealAttachmentPoint,
  leadingTightPunctuationSplit,
  NodeShape,
} from "./auditNodes";

/** Root directory holding one subfolder per Bible version. */
const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");

/** A verse-file's own name: two-digit book order + book id (e.g. `01-GEN.json`) — never `_version.json` or a schema file. */
const VERSE_FILE_NAME = /^\d{2}-[A-Z0-9]+\.json$/;

/** One verse record as read from a `bible-versions/<version>/*.json` file. */
interface VerseRecord {
  /** The verse's own book id (e.g. `GEN`, `MAT`). */
  book: string;
  /** The verse's own chapter number. */
  chapter: number;
  /** The verse's own verse number. */
  verse: number;
  /** The verse's own content tree, read and possibly rewritten by {@link rewriteLevel}. */
  content: unknown;
  /** Every other field this script doesn't inspect, carried through unchanged. */
  [key: string]: unknown;
}

/**
 * True when two nodes agree closely enough on `marks`/`script` that a
 * mismatch could not be the reason they stayed split — the identical test
 * `auditNodes.ts`'s own private `agreesInFormatting` applies, re-derived here
 * rather than imported (see the top doc comment's reasoning).
 */
function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
  return (
    a.script === b.script &&
    a.marks.length === b.marks.length &&
    a.marks.every((mark, at) => mark === b.marks[at])
  );
}

/** A node's own real property keys beyond `text`/`marks`/`script` — `[]` for a bare string (which has none) or a node carrying nothing else. Used to decide whether removing an emptied sibling would silently lose something real (a real corpus case: `break: true`). */
function extraKeysBeyondTextMarksScript(node: unknown): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return [];
  return Object.keys(node).filter((key) => key !== "text" && key !== "marks" && key !== "script");
}

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string
 * *is* its own text, so it's replaced outright; an object node keeps every
 * other property via a shallow spread. Needed because a real sibling can be
 * either shape (`"); half a shekel..."` and `{text: "...", marks: [...]}`
 * both occur in this corpus), and spreading a *string* with `{...node}`
 * does not copy its characters — it reads the string's own indexed
 * properties (`"0"`, `"1"`, …), producing a garbage object instead of
 * preserving the text.
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/** Why this script declined to act on an otherwise-real check-8 finding. */
type SkipReason = "eligibility" | "extra-keys";

/** Running fixed/skipped counts, threaded through recursion and mutated in place — the same sink pattern `auditNodes.ts`'s own `walkLevel` uses for findings. */
interface FixCounts {
  /** How many findings this run has fixed (or would fix, in preview mode). */
  fixed: number;
  /** One entry per finding this run declined to act on, naming why. */
  skipped: SkipReason[];
}

/**
 * Scan one array level left to right for a `foot`-carrying, text-bearing node
 * immediately followed by a real sibling (skipping any textless Strong's
 * sibling in between) whose own text starts with tight punctuation —
 * identical to `scanArrayForFootnotePunctuationOrder`'s own detection, so the
 * two never drift apart in what they consider a finding — and either fixes
 * it in place or records why it was skipped.
 *
 * **Chained findings are real** — a real YLT1898 Hebrews 1:3 shape has three
 * consecutive footed/text nodes where the *middle* one is simultaneously the
 * punctuation-leading sibling of the node before it and its own footed node
 * with a punctuation-leading sibling after it. Both hops are genuine,
 * independently-reported findings (the read-only detector never mutates, so
 * it finds each hop against the original array regardless of the other), and
 * fixing them out of order matters: this scan walks over one mutable working
 * copy, left to right, so a node already trimmed of its own leading
 * punctuation (as someone else's sibling, earlier in this same pass) is
 * examined in *that* trimmed state once the loop reaches it as its own `i` —
 * never the other way around, where a later overwrite could silently discard
 * an earlier trim and leave a duplicated punctuation mark on both sides of a
 * boundary.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: FixCounts): unknown[] {
  const working: unknown[] = [...nodes];
  const removed = new Set<number>();

  for (let i = 0; i < working.length; i++) {
    if (removed.has(i)) continue;
    const shape = describeNode(working[i]);
    if (!shape.hasFoot || shape.text === undefined || shape.text.length === 0) continue;

    let j = i + 1;
    while (j < working.length && (removed.has(j) || describeNode(working[j]).isTextlessStrongSibling)) j++;
    if (j >= working.length) continue;

    const next = describeNode(working[j]);
    if (!isRealAttachmentPoint(next) || next.opensParagraph || next.text === undefined) continue;

    const split = leadingTightPunctuationSplit(next.text);
    if (split === undefined) continue;

    if (!agreesInFormatting(shape, next)) {
      counts.skipped.push("eligibility");
      continue;
    }

    const mergedText = shape.text + split.before;

    if (split.after !== "") {
      working[i] = withText(working[i], mergedText);
      working[j] = withText(working[j], split.after);
      counts.fixed++;
      continue;
    }

    if (extraKeysBeyondTextMarksScript(working[j]).length > 0) {
      counts.skipped.push("extra-keys");
      continue;
    }

    working[i] = withText(working[i], mergedText);
    removed.add(j);
    counts.fixed++;
  }

  return working.filter((_, index) => !removed.has(index));
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion
 * exactly (including its `content` exclusion whenever `heading`/`subtitle`/
 * `bibleLink` is present), then returns a shallow copy with those fields
 * replaced. A string, or anything that isn't a plain object, has no nested
 * levels to rewrite and passes through unchanged.
 */
function rewriteNode(node: unknown, counts: FixCounts): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const record = { ...(node as Record<string, unknown>) };

  if (record.heading !== undefined) record.heading = rewriteLevel(record.heading, counts);
  if (record.subtitle !== undefined) record.subtitle = rewriteLevel(record.subtitle, counts);
  if (record.heading === undefined && record.subtitle === undefined && record.bibleLink === undefined && record.content !== undefined) {
    record.content = rewriteLevel(record.content, counts);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content, counts) };
  }

  return record;
}

/**
 * Rewrites one `Content` value, single node or array alike — the same
 * `asArray`-then-scan shape `findStrongsNodeIssues` uses for detection,
 * except this one rebuilds instead of only reporting. A single node has no
 * siblings to fix, so only its own nested levels change (via {@link
 * rewriteNode}); an array first rewrites every child's own nested levels,
 * then fixes findings at this level via {@link rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: FixCounts): unknown {
  if (Array.isArray(content)) {
    const children = content.map((node) => rewriteNode(node, counts));
    return rewriteArrayLevel(children, counts);
  }
  return rewriteNode(content, counts);
}

/**
 * CLI entry point: `--fix` writes changes to disk, otherwise previews them.
 * The first non-flag argument names a single version; omitted, every
 * version directory on disk is processed (this module's own top doc
 * comment explains why there's no curated list).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--fix");
  const requestedVersion = args.find((arg) => !arg.startsWith("--"));
  const versions = requestedVersion ? [requestedVersion] : getVersionDirectories();

  let totalFixed = 0;
  let totalSkipped = 0;
  let totalVerses = 0;

  for (const version of versions) {
    const versionDir = path.join(BIBLE_VERSIONS_DIR, version);
    const files = fs.readdirSync(versionDir).filter((file) => VERSE_FILE_NAME.test(file));

    let versionFixed = 0;
    let versionSkipped = 0;
    let versionVerses = 0;
    const skippedLines: string[] = [];

    for (const file of files) {
      const filePath = path.join(versionDir, file);
      const records: VerseRecord[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      let fileChanged = false;

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const findingCount = findStrongsNodeIssues(record.content as never).footnotePunctuationOrder.length;
        if (findingCount === 0) continue;

        const counts: FixCounts = { fixed: 0, skipped: [] };
        const rewritten = rewriteLevel(record.content, counts);

        if (counts.fixed > 0) {
          records[i] = sortVerseKeys({ ...record, content: rewritten });
          versionFixed += counts.fixed;
          versionVerses++;
          fileChanged = true;
        }
        for (const reason of counts.skipped) {
          versionSkipped++;
          skippedLines.push(`    ${record.book} ${record.chapter}:${record.verse} (${file}) skipped — ${reason}`);
        }
      }

      if (write && fileChanged) await writeJsonFile(filePath, records);
    }

    if (versionFixed > 0 || versionSkipped > 0) {
      const skippedSuffix = versionSkipped > 0 ? `, ${versionSkipped} skipped` : "";
      console.log(
        `${version}: ${versionFixed} finding(s) across ${versionVerses} verse(s) ${write ? "fixed" : "would be fixed"}${skippedSuffix}`,
      );
      for (const line of skippedLines) console.log(line);
    }

    totalFixed += versionFixed;
    totalSkipped += versionSkipped;
    totalVerses += versionVerses;
  }

  if (totalFixed === 0 && totalSkipped === 0) {
    console.log("No footnote-punctuation-order findings found.");
    return;
  }

  console.log(`\n${totalFixed} finding(s) across ${totalVerses} verse(s) total, ${totalSkipped} skipped.`);
  if (!write) console.log("Re-run with --fix to write.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
