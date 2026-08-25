#!/usr/bin/env ts-node
/**
 * Applies `auditNodes.ts`'s own check 9: relocates a whitespace run embedded
 * inside a formatted node's own `text`, at a boundary where the real
 * neighbor across it disagrees in `marks`/`script`, onto that neighbor's own
 * opposite edge instead — the space's only correct home once the two real
 * sides don't share formatting. Unlike check 8's own fixer, this transform
 * never merges nodes and never removes one from the array — the node whose
 * own run is being touched always keeps its own real, non-whitespace text
 * (the scan that finds a candidate already requires `text.trim() !== ""`,
 * so stripping only its own leading/trailing whitespace run can never empty
 * it out). The ordinary case moves a whitespace *run* (`/^\s+/` or
 * `/\s+$/`, not just the first character) from one node's own `text` onto
 * the end or front of another node's own `text`. Two narrower exceptions
 * apply instead, each documented in its own section below: "A second shape
 * needs a structural fix" (the run's only legal home is a brand-new
 * standalone node) and "A third shape needs deletion, not relocation" (the
 * run has no legal home anywhere else, because the neighbor it would
 * relocate onto already carries its own independent, matching run of its
 * own — the marked node's own copy is simply redundant, so it's deleted
 * outright rather than moved).
 *
 * Corpus-wide, check 9's own detector already excludes the one uniform,
 * non-defective YLT1898 pattern — a Words-of-Christ node (`marks: ["woc"]`)
 * bordering a translator-supplied word that is also part of Christ's own
 * discourse (`marks: ["i","woc"]`), a strict formatting *subset*, not a
 * genuine disagreement (see `isFormattingSubsetOf` in `auditNodes.ts`) —
 * leaving 81 genuine findings (10 KJV1769 + 71 WEBUS2020) for this script to
 * process, every one a marked node's own embedded space reaching into a
 * neighbor that carries no marks at all.
 *
 * **Local `isFormattingSubsetOf`.** This script re-derives the same
 * strict-subset test `auditNodes.ts`'s own (unexported) function of the same
 * name applies, rather than importing it — only `agreesInFormatting` and
 * `carriesFormatting` are exported from that module; `isFormattingSubsetOf`
 * stays private there, so this script keeps its own copy rather than
 * widening that module's exports further. Mirroring the detector's own
 * guards exactly — including this one — means a verse whose only
 * check-9-shaped boundary is the excluded YLT1898 pattern is never even
 * reached (the per-verse
 * `findStrongsNodeIssues(...).markBoundaryEmbeddedSpaces.length` filter in
 * `main()` below already reports zero for it), but a real finding elsewhere
 * in the same array level cannot be misjudged by a rewrite that only knows
 * the narrower, pre-narrowing rule.
 *
 * **A second shape needs a structural fix, not a text move**: the "leading"
 * direction's plain relocation moves a whitespace run onto the *end* of the
 * real predecessor's own text. When that predecessor carries a `strong`
 * number — every one of KJV1769's own findings has this shape, e.g. `{text:
 * " saying,", strong: "G3004", ...}` immediately before the woc-marked node
 * — that move would create a brand-new check-2 finding
 * (`hasTrailingWhitespace`) — this corpus's own separate, already-zero
 * convention that a `strong`-carrying node's text never ends in whitespace.
 * For this shape, the space has no legal home in either node's own text: it
 * can't stay embedded in the marked node (that's the finding itself) and it
 * can't relocate onto the
 * predecessor's trailing edge (check 2 forbids it). So it becomes its own
 * standalone node instead — a bare string `" "` inserted between the
 * predecessor and the marked node, matching this corpus's own existing
 * convention for a joining space with nothing to agree with on either side
 * (`auditNodes.ts` check 4's own doc comment, real KJV1769 Matthew 6:32
 * shape: `{text: "after", marks: ["woc"], strong: "G1934"}, " ", {text:
 * "all", marks: ["woc"], strong: "G3956"}` — a bare string element, not
 * `{text: " "}`). This is asymmetric by construction and only ever fires for
 * `side: "leading"` against a `strong`-carrying predecessor: leading
 * whitespace on a `strong`-carrying node is already this corpus's norm and
 * never a check-2 violation, so the mirror-image "trailing" direction (a move
 * onto a real *successor*'s own leading edge) has no equivalent conflict to
 * work around and keeps using the plain text-relocation path above. The
 * inserted node is never itself a check-4 finding either: check 4 only
 * proposes collapsing a standalone blank connector when its two real
 * neighbors *agree* in marks, and a predecessor/marked-node pair that reached
 * this branch disagreed by definition.
 *
 * **A third shape needs deletion, not relocation**: the ordinary relocation
 * path assumes the run is landing on a genuinely blank spot at the
 * neighbor's own near edge. That assumption can be wrong — two adjacent
 * nodes' own text can, in principle, already carry an unrelated
 * leading/trailing space of their own right at the boundary this script is
 * relocating a *different* whitespace run across. If the plain relocation
 * would produce a new `/\s\s/` doubled-whitespace run that wasn't already
 * present in the receiving node's own original text, this script never
 * writes that corrupted join. What happens next depends on whether the
 * receiving node itself carries any formatting of its own:
 *
 * - **The receiving node is unmarked** (`carriesFormatting` is false — no
 *   `marks`, no `script`): delete the source node's own run instead of
 *   relocating it, leaving the unmarked neighbor's own text completely
 *   untouched, including whatever whitespace it already had. This is the
 *   marked-to-unmarked transition: going from a marked node to an unmarked
 *   one, trimming the space off the end of the marked node is correct. The
 *   unmarked neighbor already carries its own independent whitespace
 *   performing the same join, so the marked node's own copy is simply
 *   redundant, not relocatable. Real corpus case, all 8 of WEBUS2020's own
 *   findings, every one `side: "trailing"` (Matthew 8:26, Matthew 27:46,
 *   Mark 3:5, Mark 5:41, Mark 7:34, Mark 10:52, Mark 11:14, Luke 4:35): a
 *   `["woc"]`-marked node's own trailing space would land on a bare-string
 *   successor that *already* opens with its own separate leading space,
 *   e.g. `{text:
 *   "“Stretch out your hand.” ", marks: ["woc"]}` next to `" He stretched it
 *   out, and his hand was restored as healthy as the other."`.
 * - **The receiving node itself carries formatting** — a marks-to-marks
 *   doubling collision, a shape none of the corpus's 81 genuine findings
 *   actually has, but one this script does not assume away — decline the
 *   finding and report it as skipped (`"doubled-whitespace"`), the original
 *   behavior. Deleting a *formatted* node's own space on the strength of a
 *   doubling collision alone is not this rule's call to make; only a fully
 *   unmarked receiver's redundant space is safe to discard outright. Do not
 *   widen this into "always delete on a doubling collision" — the
 *   marked-to-unmarked condition is what makes deletion safe, not the
 *   doubling by itself.
 *
 * **Current status of the 81 genuine findings**: all 81 are resolved, and
 * check 9 reports zero findings corpus-wide. All 10 KJV1769 findings are
 * resolved by the structural-insertion path above. Of WEBUS2020's 71, 63
 * are resolved by the ordinary relocation path and the remaining 8 by the
 * deletion path.
 *
 * Usage:
 *   npx ts-node utils/fixMarkBoundaryEmbeddedSpaces.ts                   # preview, every version
 *   npx ts-node utils/fixMarkBoundaryEmbeddedSpaces.ts WEBUS2020         # preview, one version
 *   npx ts-node utils/fixMarkBoundaryEmbeddedSpaces.ts WEBUS2020 --fix   # write
 */

import * as fs from "fs";
import * as path from "path";
import { getVersionDirectories } from "../functions/getBibleVersions";
import { sortVerseKeys } from "../functions/sortContentKeys";
import { writeJsonFile } from "../functions/writeJsonFile";
import {
  agreesInFormatting,
  carriesFormatting,
  describeNode,
  findStrongsNodeIssues,
  isRealAttachmentPoint,
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
 * True when two nodes' own marks share the same script and one's marks are a
 * non-empty subset of the other's — the identical test `auditNodes.ts`'s own
 * (unexported) `isFormattingSubsetOf` applies, re-derived here rather than
 * imported (see the top doc comment's reasoning). See that function's own doc
 * comment for the real YLT1898 case this exists for.
 */
function isFormattingSubsetOf(a: NodeShape, b: NodeShape): boolean {
  if (a.script !== b.script) return false;
  const [smaller, larger] = a.marks.length <= b.marks.length ? [a.marks, b.marks] : [b.marks, a.marks];
  return smaller.length > 0 && smaller.every((mark) => larger.includes(mark));
}

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string *is*
 * its own text, so it's replaced outright; an object node keeps every other
 * property via a shallow spread. Needed because a real neighbor can be either
 * shape, and spreading a *string* with `{...node}` does not copy its
 * characters (see `fixFootnotePunctuationOrder.ts`'s own identical helper and
 * doc comment for the real corpus case this guards against).
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/**
 * Why this script declined to act on an otherwise-real check-9 finding.
 *
 * `"doubled-whitespace"` — see {@link wouldDoubleWhitespace}.
 */
type SkipReason = "doubled-whitespace";

/** Running fixed/skipped counts, threaded through recursion and mutated in place — the same sink pattern `fixFootnotePunctuationOrder.ts`'s own `FixCounts` uses. */
interface FixCounts {
  /** How many findings this run has fixed (or would fix, in preview mode). */
  fixed: number;
  /** One entry per finding this run declined to act on, naming why. */
  skipped: SkipReason[];
}

/** True when merging `run` onto `receiverText` would create a `/\s\s/` doubled-whitespace run that wasn't already present in `receiverText` on its own. */
function wouldDoubleWhitespace(receiverText: string, mergedText: string): boolean {
  return /\s\s/.test(mergedText) && !/\s\s/.test(receiverText);
}

/**
 * Scan one array level left to right for a node whose own `marks`/`script`
 * are non-empty and whose own `text` starts or ends with a whitespace run
 * that disagrees in formatting (and isn't a strict formatting subset) with
 * the real neighbor immediately across that boundary — identical to
 * `scanArrayForMarkBoundaryEmbeddedSpaces`'s own detection, so the two never
 * drift apart in what they consider a finding — and resolves it one of four
 * ways: relocate the run onto the neighbor's own opposite edge (the ordinary
 * case), extract it into a brand-new standalone node when the ordinary case
 * would collide with check 2 (see the top doc comment's own "structural fix"
 * section), delete the run outright when relocating it would double an
 * unmarked neighbor's own matching whitespace (see the top doc comment's own
 * "deletion, not relocation" section), or record why it declined to act at
 * all (a doubling collision against a neighbor that itself carries
 * formatting — no real finding in this corpus takes this path).
 *
 * Walks one mutable working copy left to right, describing each node fresh
 * from its current (possibly already-rewritten) state rather than a frozen
 * snapshot — the same chain-safety discipline `fixFootnotePunctuationOrder.ts`'s
 * own `rewriteArrayLevel` uses, for the identical reason: a node's own fix
 * must see any earlier fix already applied to its neighbor, or a later
 * overwrite could silently discard it. A node's own leading-space move is
 * applied before its trailing-space check runs, so a single node carrying
 * both a real leading and a real trailing finding (independent whitespace
 * runs on opposite edges of the same `text`) is handled correctly in one
 * pass. The node-insertion path advances `i` past the newly-inserted node
 * before that trailing-space check runs, so it still lands on the
 * (now-shifted) marked node rather than on the space it just inserted.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: FixCounts): unknown[] {
  const working: unknown[] = [...nodes];

  for (let i = 0; i < working.length; i++) {
    const shape = describeNode(working[i]);
    if (shape.text === undefined || shape.text.trim() === "" || !carriesFormatting(shape)) continue;

    if (/^\s/.test(shape.text) && !shape.opensParagraph) {
      let j = i - 1;
      while (j >= 0 && describeNode(working[j]).isTextlessStrongSibling) j--;
      if (j >= 0) {
        const predecessor = describeNode(working[j]);
        if (
          isRealAttachmentPoint(predecessor) &&
          !predecessor.endsBreak &&
          !agreesInFormatting(shape, predecessor) &&
          !isFormattingSubsetOf(shape, predecessor)
        ) {
          if (predecessor.strong !== undefined) {
            // Structural fix, not a text move (top doc comment's "second
            // shape" section): neither home for the space is legal here, so
            // it becomes its own standalone node; the predecessor's own text
            // stays untouched.
            const rest = shape.text.slice(shape.text.match(/^\s+/)![0].length);
            working[i] = withText(working[i], rest);
            working.splice(i, 0, " ");
            i++; // realign on the marked node, now shifted one slot right by the insert
            counts.fixed++;
          } else {
            const run = shape.text.match(/^\s+/)![0];
            const rest = shape.text.slice(run.length);
            const predecessorText = predecessor.text as string;
            const merged = predecessorText + run;

            if (wouldDoubleWhitespace(predecessorText, merged)) {
              if (!carriesFormatting(predecessor)) {
                // Deletion path (top doc comment's "third shape" section):
                // the unmarked predecessor already carries its own
                // independent space performing this join, so the marked
                // node's own copy is redundant.
                working[i] = withText(working[i], rest);
                counts.fixed++;
              } else {
                counts.skipped.push("doubled-whitespace");
              }
            } else {
              working[j] = withText(working[j], merged);
              working[i] = withText(working[i], rest);
              counts.fixed++;
            }
          }
        }
      }
    }

    // Re-describe: the leading-space move above may have changed working[i]'s own text.
    const current = describeNode(working[i]);
    if (current.text !== undefined && /\s$/.test(current.text) && !current.endsBreak) {
      let j = i + 1;
      while (j < working.length && describeNode(working[j]).isTextlessStrongSibling) j++;
      if (j < working.length) {
        const successor = describeNode(working[j]);
        if (
          isRealAttachmentPoint(successor) &&
          !successor.opensParagraph &&
          !agreesInFormatting(current, successor) &&
          !isFormattingSubsetOf(current, successor)
        ) {
          const run = current.text.match(/\s+$/)![0];
          const rest = current.text.slice(0, current.text.length - run.length);
          const successorText = successor.text as string;
          const merged = run + successorText;

          if (wouldDoubleWhitespace(successorText, merged)) {
            if (!carriesFormatting(successor)) {
              // Deletion path — mirrors the leading branch's comment above;
              // see the top doc comment's "third shape" section for the
              // real corpus case this covers.
              working[i] = withText(working[i], rest);
              counts.fixed++;
            } else {
              counts.skipped.push("doubled-whitespace");
            }
          } else {
            working[j] = withText(working[j], merged);
            working[i] = withText(working[i], rest);
            counts.fixed++;
          }
        }
      }
    }
  }

  return working;
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion
 * exactly, then returns a shallow copy with those fields replaced. A string,
 * or anything that isn't a plain object, has no nested levels to rewrite and
 * passes through unchanged.
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
 * siblings to relocate whitespace across, so only its own nested levels
 * change (via {@link rewriteNode}); an array first rewrites every child's own
 * nested levels, then relocates whitespace at this level via {@link
 * rewriteArrayLevel}.
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
 * The first non-flag argument names a single version; omitted, every version
 * directory on disk is processed (matching `fixFootnotePunctuationOrder.ts`'s
 * own CLI shape).
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
        const findingCount = findStrongsNodeIssues(record.content as never).markBoundaryEmbeddedSpaces.length;
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
    console.log("No mark-boundary-embedded-space findings found.");
    return;
  }

  console.log(`\n${totalFixed} finding(s) across ${totalVerses} verse(s) total, ${totalSkipped} skipped.`);
  if (!write) console.log("Re-run with --fix to write.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
