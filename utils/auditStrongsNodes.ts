#!/usr/bin/env ts-node
/**
 * Corpus-wide sweep for three ways a `strong`-carrying node's own placement
 * can drift from this repo's established Strong's-number conventions (see
 * `utils/validate.ts`'s `findStrongTrailingWhitespaceNodes` for the leading-
 * vs-trailing-space convention these checks build on):
 *
 * 1. **Unmerged node pairs** — an ordinary, untagged connector word left
 *    split from the `strong`-carrying neighbor immediately *after* it, which
 *    it should have folded into. A trailing connector with nothing tagged
 *    after it in its own span is not this shape: with no following
 *    `strong`-carrying node to fold into, it is simply untagged text, and
 *    folding it *backward* into whatever precedes it would misattribute it
 *    under a Strong's number it has no lexical relationship to.
 * 2. **Trailing whitespace** — a `strong`-carrying node's own `text` ending
 *    in a space, when the convention puts a joining space on the *leading*
 *    edge of whatever follows, never the trailing edge of what precedes it.
 * 3. **Leading punctuation** — a `strong`-carrying node's own `text`
 *    *starting* with tight punctuation (a comma, period, closing quote, …)
 *    that reads as glued to the word before it, not to the word this node
 *    itself carries — illustrative shape: `{"text": "Look", "strong":
 *    "G2400"}` + `{"text": "! The", "strong": "G3588"}`, where the "!"
 *    belongs on "Look," not leading "The."
 *
 * A general-purpose, version-controlled tool any future import can reach
 * for, rather than a one-off diagnostic scoped to whichever translation
 * happens to be mid-import at the time.
 *
 * All three checks recurse into `content` (a `ContentNested` wrapper's own
 * inner array — KJV1769 alone carries 27,838 of these, one per italicized
 * "added word" span) in addition to `heading`/`subtitle`/`foot.content`
 * (measured zero `strong` values inside any `foot.content`, corpus-wide,
 * across every version this repo currently carries — recursing there is
 * free today and a strictly safer default for whatever a future re-scrape
 * might introduce).
 *
 * **No curated version list.** With no version named on the command line,
 * this audits every directory under `bible-versions/` — whatever this repo
 * happens to carry, not a hardcoded set. A version with no `strong` values
 * at all (most of them) simply reports zero findings, cheaply; scanning
 * every version this repo carries today takes well under three seconds.
 *
 * Read-only. Detects; does not fix.
 */

import * as fs from "fs";
import * as path from "path";
import { getVersionDirectories } from "../functions/getBibleVersions";
import Content from "../types/Content";

const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");

/** A verse-file's own name: two-digit book order + book id (e.g. `01-GEN.json`) — never `_version.json` or a schema file. */
const VERSE_FILE_NAME = /^\d{2}-[A-Z0-9]+\.json$/;

/** One shape as it exists on disk: a verse's own identifying fields plus its content tree. */
interface VerseRecord {
  book: string;
  chapter: number;
  verse: number;
  content: Content;
}

// ---------------------------------------------------------------------------
// One node's own shape, read once and shared by every check below
// ---------------------------------------------------------------------------

interface NodeShape {
  /** This node's own text, or `undefined` when it has no `text` key at all — a `{heading}`/`{subtitle}`/`{bibleLink}` wrapper, a `ContentNested` wrapper, or a multi-number tag's own textless sibling. */
  text: string | undefined;
  marks: readonly unknown[];
  script: unknown;
  strong: string | undefined;
  hasFoot: boolean;
  /** A `ContentNested` wrapper (`{content: [...], strong: "..."}`) — no top-level `text` of its own, but real, rendered text one level down. Recursed into separately; never itself an eligible donor, merge target, or attachment point at this array level. */
  hasNestedContent: boolean;
  /** A multi-number `<st>` tag's own textless sibling (`{strong: "H853"}`, no `text`, no nested `content` either) — renders nothing at all, so a backward scan for an attachment point passes straight through it rather than stopping there. Distinct from `hasNestedContent`: both lack top-level `text`, but only one of them is actually invisible. */
  isTextlessStrongSibling: boolean;
  opensParagraph: boolean;
  endsBreak: boolean;
  /** A `{heading}`/`{subtitle}`/`{bibleLink}` wrapper, or any other non-plain-object shape — opaque to every check here, a hard boundary none of them cross. */
  isBoundary: boolean;
}

function describeNode(node: unknown): NodeShape {
  const empty = {
    marks: [] as readonly unknown[],
    script: undefined,
    strong: undefined,
    hasFoot: false,
    hasNestedContent: false,
    isTextlessStrongSibling: false,
    opensParagraph: false,
    endsBreak: false,
  };

  if (typeof node === "string") {
    return { ...empty, text: node, isBoundary: false };
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return { ...empty, text: undefined, isBoundary: true };
  }

  const record = node as Record<string, unknown>;
  if ("heading" in record || "subtitle" in record || "bibleLink" in record) {
    return { ...empty, text: undefined, isBoundary: true };
  }

  const text = typeof record.text === "string" ? record.text : undefined;
  const strong = typeof record.strong === "string" ? record.strong : undefined;
  const hasNestedContent = "content" in record;

  return {
    text,
    marks: Array.isArray(record.marks) ? record.marks : [],
    script: record.script,
    strong,
    hasFoot: record.foot !== undefined && record.foot !== null,
    hasNestedContent,
    isTextlessStrongSibling: text === undefined && strong !== undefined && !hasNestedContent,
    opensParagraph: record.paragraph === true,
    endsBreak: record.break === true,
    isBoundary: false,
  };
}

/** True when two nodes agree closely enough on `marks`/`script` that a mismatch could not be the reason they stayed split — the same "stays split, not nested" rule that keeps a small-caps divine name (`marks: ["sc"]`) split from an ordinary, unmarked connector word sitting beside it. */
function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
  return a.script === b.script && a.marks.length === b.marks.length && a.marks.every((mark, at) => mark === b.marks[at]);
}

/** Real, non-blank, untagged, footnote-less text — the only shape either side of a merge (check 1) may supply the "plain" half of. */
function isMergeableConnector(shape: NodeShape): boolean {
  return shape.text !== undefined && shape.text.trim() !== "" && shape.strong === undefined && !shape.hasFoot;
}

/** A real, text-bearing node some other node's stray text might legitimately belong on — `strong`-carrying, footnoted, or plain, it does not matter which; only a `ContentNested` wrapper (no top-level `text`) or a hard boundary is disqualified. */
function isRealAttachmentPoint(shape: NodeShape): boolean {
  return !shape.isBoundary && shape.text !== undefined && shape.text.trim() !== "";
}

// ---------------------------------------------------------------------------
// Check 1 — an ordinary connector word left un-merged beside a strong-carrying neighbor
// ---------------------------------------------------------------------------

/** One un-merged pair found within a single array level. */
interface PairFinding {
  /** The array level this pair was found in (e.g. `content`, `content.heading`, `content.content` for a `ContentNested` descent). */
  where: string;
  /** The untagged connector node this rule says should have merged. */
  plain: unknown;
  /** The `strong`-carrying node it should have merged into. */
  target: unknown;
}

/**
 * True when every node in a candidate run of consecutive mergeable
 * connectors should merge forward as a unit into `target`. Requires
 * `target.text !== undefined` in addition to `target.strong !== undefined` —
 * checking `strong` alone would wrongly accept a `ContentNested` wrapper,
 * which carries `strong` with no top-level `text` of its own, so "merging" a
 * connector's text into it would have nowhere to actually land. The run's own first
 * member may carry `opensParagraph`; no later member may — a `paragraph:
 * true` on any member after the first marks a piece boundary strictly inside
 * the run (Genesis 13:11's real corpus case).
 */
function canJoinForward(run: readonly NodeShape[], target: NodeShape): boolean {
  return (
    run.length > 0 &&
    target.strong !== undefined &&
    target.text !== undefined &&
    !target.opensParagraph &&
    run.every((shape, at) => !shape.endsBreak && (at === 0 || !shape.opensParagraph) && agreesInFormatting(shape, target))
  );
}

/**
 * Scan one array level for adjacent node pairs that should have merged into
 * one `strong`-carrying node but did not: every maximal run of consecutive
 * mergeable connectors immediately *before* a `strong`-carrying node.
 *
 * Deliberately one-directional. A run of untagged connectors with no
 * `strong`-carrying node following it — the tail end of a span, or of the
 * verse — is never a finding here, no matter how well it agrees in
 * formatting with whatever precedes it: there is nothing tagged for it to
 * fold into, so it is simply untagged text (e.g. a connector word with no
 * lexical unit of its own in the source language), not an unmerged pair. A
 * corpus case that looks identical either direction makes the asymmetry
 * concrete: Genesis 1:15 KJV1769 ends `{ text: " upon the earth:", strong:
 * "H776" }, " and it was so."` — untagged, trailing, no `strong`-carrying
 * node after it in the verse. Folding it backward into the `H776` node would
 * claim that Strong's number covers "and it was so," which it does not;
 * elsewhere in the very same chapter (Genesis 1:7) the identical phrase
 * carries its own tag, `strong: "H3651"` — the actual defect, when there is
 * one, is a missing tag on the connector itself, not a merge this check
 * could ever recommend.
 */
function scanArrayForUnmergedPairs(nodes: readonly unknown[], where: string): PairFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: PairFinding[] = [];

  let at = 0;
  while (at < nodes.length) {
    let end = at;
    while (end < nodes.length && isMergeableConnector(shapes[end])) end++;
    const target = shapes[end];
    const run = shapes.slice(at, end);
    if (end > at && target !== undefined && canJoinForward(run, target)) {
      for (let i = at; i < end; i++) {
        findings.push({ where, plain: nodes[i], target: nodes[end] });
      }
      at = end + 1;
    } else {
      at++;
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 3 — leading punctuation glued to the wrong side of a strong-carrying node
// ---------------------------------------------------------------------------

/**
 * True for a character that is not a letter, not a digit, not whitespace,
 * not a dash, and not an *opening* mark (an opening bracket/parenthesis or
 * an initial quotation mark).
 *
 * Dashes (Unicode category `Pd`) are excluded because this corpus has an
 * established, deliberate convention for gluing a dash to the *following*
 * piece of a compound word with no space at all (Psalm 56:1's real
 * "yonath"/H3123 + "-elem"/H482 + "-rekhoqim"/H7350). Opening marks
 * (`Ps`/`Pi`) are excluded for the identical reason: an opening
 * parenthesis/bracket/quote attaches to whatever it introduces, the reverse
 * of a *closing* mark (`Pe`/`Pf`), which is this check's own real target.
 */
function isTightPunctuationChar(ch: string): boolean {
  return !/[\p{L}\p{N}\s\p{Pd}\p{Ps}\p{Pi}]/u.test(ch);
}

/** Splits `text` at the boundary between its own leading run of {@link isTightPunctuationChar} characters and everything after — `undefined` when `text` does not start with one at all. */
function leadingTightPunctuationSplit(text: string): { before: string; after: string } | undefined {
  let i = 0;
  while (i < text.length && isTightPunctuationChar(text[i])) i++;
  if (i === 0) return undefined;
  return { before: text.slice(0, i), after: text.slice(i) };
}

/** One misplaced leading-punctuation node found within a single array level. */
interface LeadingPunctuationFinding {
  /** The array level this was found in. */
  where: string;
  /** The `strong`-carrying node whose own text starts with punctuation that does not belong to it. */
  node: unknown;
  /** The leading run of tight-punctuation characters that should have moved. */
  leading: string;
  /** The earlier node — `strong`-carrying, footnoted, or plain — the leading punctuation should have attached to instead. */
  attachTo: unknown;
}

/**
 * Scan one array level for a `strong`-carrying node whose own `text` starts
 * with tight punctuation that reads as glued to the word before it —
 * illustrative shape: `"Look"`/G2400 + `"! The"`/G3588 (this module's own
 * top doc comment).
 *
 * A finding requires a genuine attachment point immediately before the
 * offending node: real, non-blank text (a `strong`-carrying node, a
 * footnoted plain node, or an ordinary word — any of these is a legitimate
 * home for trailing punctuation), agreeing in `marks`/`script`, with no
 * `break` at the join and no `paragraph` opening on the offending node
 * itself. **A textless Strong's sibling in between is skipped over, not
 * treated as a boundary** — it renders zero characters (`{strong: "H853"}`,
 * no `text` at all), so the *visual* neighbor is whatever precedes it: a
 * real, on-disk corpus case has a node ending "... and female"/H5347,
 * immediately followed by a bare `{strong: "H1961"}` sibling, immediately
 * followed by a node starting ", to keep ..."/H2421 — the comma is visually
 * glued to "female," not to the textless sibling sitting between them.
 *
 * **A genuine `marks`/`script` mismatch is not a finding** — the same
 * "stays split" rule the merge check above already establishes blocks this
 * one too: a small-caps divine name (`marks:
 * ["sc"]`) immediately followed by an unmarked node starting with a comma or
 * apostrophe is not a bug — the possessive/connecting punctuation cannot
 * join the divine name without either mis-marking it small-caps or breaking
 * the small-caps convention, so it correctly stays on the following node
 * instead. Measured against a real corpus with heavy Strong's tagging: the
 * large majority of raw occurrences of this shape have a genuine
 * same-formatting attachment point once textless siblings are skipped
 * through; a small remainder is exactly this mark-mismatch case (plus a
 * negligible few with nothing real preceding at all) — both excluded here,
 * not flagged.
 */
function scanArrayForLeadingPunctuation(nodes: readonly unknown[], where: string): LeadingPunctuationFinding[] {
  const shapes = nodes.map(describeNode);
  const findings: LeadingPunctuationFinding[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const shape = shapes[i];
    if (shape.strong === undefined || shape.text === undefined || shape.text.length === 0) continue;

    const split = leadingTightPunctuationSplit(shape.text);
    if (split === undefined) continue;

    let j = i - 1;
    while (j >= 0 && shapes[j].isTextlessStrongSibling) j--;
    if (j < 0) continue;

    const target = shapes[j];
    if (!isRealAttachmentPoint(target) || target.endsBreak || shape.opensParagraph || !agreesInFormatting(target, shape)) continue;

    findings.push({ where, node: nodes[i], leading: split.before, attachTo: nodes[j] });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 2 — trailing whitespace on a strong-carrying node
// ---------------------------------------------------------------------------

/** True when a node carries a `strong` value and its own `text` ends in whitespace — the mirror image of check 3, and the shape a well-behaved importer should never produce (see `utils/validate.ts`'s `findStrongTrailingWhitespaceNodes` for the convention this violates). */
function hasTrailingWhitespace(shape: NodeShape): boolean {
  return shape.strong !== undefined && shape.text !== undefined && /\s$/.test(shape.text);
}

// ---------------------------------------------------------------------------
// Recursion — one array level, plus every node's own heading/subtitle/content/foot.content
// ---------------------------------------------------------------------------

function asArray(content: unknown): unknown[] {
  return Array.isArray(content) ? content : [content];
}

interface LevelFindings {
  unmergedPairs: PairFinding[];
  trailingWhitespace: string[];
  leadingPunctuation: LeadingPunctuationFinding[];
}

/**
 * Walk one array level and every node's own nested levels — `heading`,
 * `subtitle`, a `ContentNested` wrapper's own `content`, and a footnote
 * body's own `foot.content` — collecting all three checks' findings into
 * `sink` as it goes.
 */
function walkLevel(nodes: readonly unknown[], where: string, sink: LevelFindings): void {
  sink.unmergedPairs.push(...scanArrayForUnmergedPairs(nodes, where));
  sink.leadingPunctuation.push(...scanArrayForLeadingPunctuation(nodes, where));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const shape = describeNode(node);
    if (hasTrailingWhitespace(shape)) sink.trailingWhitespace.push(`${where}[${i}]`);

    if (node === null || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;

    if (record.heading !== undefined) walkLevel(asArray(record.heading), `${where}.heading`, sink);
    if (record.subtitle !== undefined) walkLevel(asArray(record.subtitle), `${where}.subtitle`, sink);
    if (record.heading === undefined && record.subtitle === undefined && record.bibleLink === undefined && record.content !== undefined) {
      walkLevel(asArray(record.content), `${where}.content`, sink);
    }
    const foot = record.foot as { content?: unknown } | undefined;
    if (foot?.content !== undefined) walkLevel(asArray(foot.content), `${where}.foot.content`, sink);
  }
}

/**
 * Walk one verse's whole content tree for all three checks at once.
 *
 * @param content - A verse's own `content` value, any shape the schema permits.
 * @param where - The array level's own label, threaded through recursion; callers pass nothing and get `"content"`.
 */
export function findStrongsNodeIssues(content: Content, where = "content"): LevelFindings {
  const sink: LevelFindings = { unmergedPairs: [], trailingWhitespace: [], leadingPunctuation: [] };
  walkLevel(asArray(content), where, sink);
  return sink;
}

// ---------------------------------------------------------------------------
// Disk scanning and CLI
// ---------------------------------------------------------------------------

/** One offending unmerged pair, with its file/verse identity attached. */
export interface UnmergedStrongPairFinding extends PairFinding {
  version: string;
  file: string;
  book: string;
  chapter: number;
  verse: number;
}

/** One node with trailing whitespace, with its file/verse identity attached. */
export interface StrongTrailingWhitespaceFinding {
  version: string;
  file: string;
  book: string;
  chapter: number;
  verse: number;
  path: string;
}

/** One misplaced-leading-punctuation node, with its file/verse identity attached. */
export interface StrongLeadingPunctuationFinding extends LeadingPunctuationFinding {
  version: string;
  file: string;
  book: string;
  chapter: number;
  verse: number;
}

/** Every verse-JSON file for one version id, sorted, excluding `_version.json` and any schema file. */
function verseFiles(version: string): string[] {
  return fs
    .readdirSync(path.join(BIBLE_VERSIONS_DIR, version))
    .filter((file) => VERSE_FILE_NAME.test(file))
    .sort();
}

/** One version's own audit: its id, and every finding {@link auditVersion} found, across all three checks. */
export interface VersionAudit {
  version: string;
  unmergedPairs: readonly UnmergedStrongPairFinding[];
  trailingWhitespace: readonly StrongTrailingWhitespaceFinding[];
  leadingPunctuation: readonly StrongLeadingPunctuationFinding[];
}

/**
 * Audit one version's whole corpus, as it sits on disk right now — read-only,
 * writes nothing.
 *
 * @param version - A version id, matching its directory name under `bible-versions/` (e.g. `KJV1769`).
 */
export function auditVersion(version: string): VersionAudit {
  const unmergedPairs: UnmergedStrongPairFinding[] = [];
  const trailingWhitespace: StrongTrailingWhitespaceFinding[] = [];
  const leadingPunctuation: StrongLeadingPunctuationFinding[] = [];

  for (const file of verseFiles(version)) {
    const verses = JSON.parse(fs.readFileSync(path.join(BIBLE_VERSIONS_DIR, version, file), "utf8")) as VerseRecord[];

    for (const verse of verses) {
      const identity = { version, file, book: verse.book, chapter: verse.chapter, verse: verse.verse };
      const findings = findStrongsNodeIssues(verse.content);
      for (const pair of findings.unmergedPairs) unmergedPairs.push({ ...identity, ...pair });
      for (const at of findings.trailingWhitespace) trailingWhitespace.push({ ...identity, path: at });
      for (const finding of findings.leadingPunctuation) leadingPunctuation.push({ ...identity, ...finding });
    }
  }

  return { version, unmergedPairs, trailingWhitespace, leadingPunctuation };
}

/**
 * Audit each named version, or every version directory under
 * `bible-versions/` when none are named — deliberately not a curated list
 * (see this module's own top doc comment): a version with no `strong`
 * values at all just reports zero findings across all three checks.
 *
 * @param versionIds - Versions to audit; defaults to {@link getVersionDirectories}.
 */
export function auditVersions(versionIds: readonly string[] = getVersionDirectories()): VersionAudit[] {
  return versionIds.map((version) => auditVersion(version));
}

/** The exit code this check should report — non-zero when any version carries any finding across any of the three checks. */
export function exitCodeFor(summaries: readonly VersionAudit[]): number {
  return summaries.some(
    (summary) => summary.unmergedPairs.length > 0 || summary.trailingWhitespace.length > 0 || summary.leadingPunctuation.length > 0,
  )
    ? 1
    : 0;
}

function printFindingLines(summary: VersionAudit, verbose: boolean): void {
  const cap = verbose ? Infinity : 10;

  console.log(`  ${summary.unmergedPairs.length} adjacent node pair(s) that should have merged into one strong-carrying node but didn't`);
  for (const finding of summary.unmergedPairs.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} plain=${JSON.stringify(finding.plain)} target=${JSON.stringify(finding.target)}`,
    );
  }
  if (!verbose && summary.unmergedPairs.length > cap) console.log(`    … ${summary.unmergedPairs.length - cap} more (--verbose to list all)`);

  console.log(`  ${summary.trailingWhitespace.length} strong-carrying node(s) whose own text ends in trailing whitespace`);
  for (const finding of summary.trailingWhitespace.slice(0, cap)) {
    console.log(`    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.path}`);
  }
  if (!verbose && summary.trailingWhitespace.length > cap) console.log(`    … ${summary.trailingWhitespace.length - cap} more (--verbose to list all)`);

  console.log(`  ${summary.leadingPunctuation.length} strong-carrying node(s) whose own text starts with punctuation glued to the wrong node`);
  for (const finding of summary.leadingPunctuation.slice(0, cap)) {
    console.log(
      `    ${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}) ${finding.where} leading=${JSON.stringify(finding.leading)} node=${JSON.stringify(finding.node)} attachTo=${JSON.stringify(finding.attachTo)}`,
    );
  }
  if (!verbose && summary.leadingPunctuation.length > cap) console.log(`    … ${summary.leadingPunctuation.length - cap} more (--verbose to list all)`);
}

/** True when a version's audit found nothing across any of the three checks — printed as a single skipped line rather than an empty block, so a report over every version on disk stays readable. */
function isClean(summary: VersionAudit): boolean {
  return summary.unmergedPairs.length === 0 && summary.trailingWhitespace.length === 0 && summary.leadingPunctuation.length === 0;
}

function printReport(summaries: readonly VersionAudit[], verbose: boolean): void {
  const clean = summaries.filter(isClean).map((summary) => summary.version);
  if (clean.length > 0) console.log(`Clean (no findings): ${clean.join(", ")}\n`);

  for (const summary of summaries) {
    if (isClean(summary)) continue;
    console.log(`${summary.version}:`);
    printFindingLines(summary, verbose);
    console.log("");
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const versionIds = args.filter((arg) => arg !== "--verbose");

  const summaries = auditVersions(versionIds.length > 0 ? versionIds : undefined);
  printReport(summaries, verbose);
  process.exit(exitCodeFor(summaries));
}

if (require.main === module) {
  main();
}
