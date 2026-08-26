import _ from "lodash";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import validateJsonAgainstSchema from "../functions/validateJsonAgainstSchema";
import { getVersionDirectories } from "../functions/getBibleVersions";
import { sortVerseKeys } from "../functions/sortContentKeys";
import {
  formatJsonData,
  writeFileAtomic,
  writeJsonFile,
} from "../functions/writeJsonFile";
import Content, { ContentBibleLink } from "../types/Content";
import { normalizeFractionsInContent } from "../functions/normalizeFractions";
import { normalizeEllipsesInContent } from "../functions/normalizeEllipses";
import BibleVersion from "../types/Version";
import {
  findCrossChapterLinks,
  findTruncatedRanges,
  fixCrossChapterLinks,
  formatCrossChapterFinding,
  formatTruncatedRangeFinding,
  reconstructTruncatedRangesInContent,
  SkipReason as TruncatedRangeSkipReason,
} from "./crossChapterLinks";
import {
  auditVersion as auditNodeConventions,
  isClean as nodeConventionsAreClean,
  printFindingLines as printNodeConventionFindings,
  VerseRecord,
} from "./auditNodes";
import { mergeUnmergedNodesInContent } from "./fixUnmergedNodes";
import { addMissingHeadingParagraphsInVerse } from "./fixHeadingParagraphs";
import {
  reorderFootnotePunctuationInContent,
  SkipReason as FootnotePunctuationSkipReason,
} from "./fixFootnotePunctuationOrder";
import {
  relocateMarkBoundarySpacesInContent,
  SkipReason as MarkBoundarySpaceSkipReason,
} from "./fixMarkBoundaryEmbeddedSpaces";

/** Path to the bible-books registry JSON file. */
const jsonPath = "./bible-books/bible-books.json";
/** Path to the JSON Schema `jsonPath` is validated against. */
const schemaPath = "./bible-books/bible-books-schema.json";
/** Path to the JSON Schema each version's own `_version.json` is validated against. */
const versionsSchemaPath = "./bible-versions/bible-versions-schema.json";
/** Root directory holding one subfolder per Bible version. */
const bibleVersionsDir = "./bible-versions";

/**
 * Check if a file is a Bible verse file (not _version.json or schema).
 */
function isVerseFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return (
    filePath.includes("bible-versions") &&
    basename !== "_version.json" &&
    !basename.includes("schema") &&
    basename.match(/^\d{2}-[A-Z0-9]+\.json$/) !== null
  );
}

/**
 * Sort keys in a verse file according to canonical order and write it back
 * if anything changed.
 *
 * @returns true if the file was re-sorted, false if unchanged
 */
async function sortVerseFileKeys(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  const sortedVerses = verses.map((verse: Record<string, unknown>) =>
    sortVerseKeys(verse)
  );

  const originalSerialized = JSON.stringify(verses);
  const sortedSerialized = JSON.stringify(sortedVerses);

  if (originalSerialized !== sortedSerialized) {
    await writeJsonFile(filePath, sortedVerses);
    return true;
  }

  return false;
}

/**
 * Format a JSON file and write it back if changed.
 *
 * Formats the parsed data, not the file's raw text — otherwise Prettier
 * would preserve pre-existing line breaks, and a drifted file could keep
 * passing as "already formatted."
 *
 * @returns true if the file was reformatted, false if unchanged
 */
async function formatJsonFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const formatted = await formatJsonData(JSON.parse(content));

  if (content !== formatted) {
    await writeFileAtomic(filePath, formatted);
    return true;
  }
  return false;
}

/**
 * Normalize `bibleLink` dashes in one verse file and write it back if
 * anything changed.
 *
 * Uses {@link normalizeBibleLinkDashesInContent}'s own per-verse `changed`
 * flag directly, unlike {@link sortVerseFileKeys}'s whole-array
 * serialize-and-diff (needed there only because `sortVerseKeys` itself
 * returns no such flag).
 */
async function normalizeBibleLinkDashesInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = normalizeBibleLinkDashesInContent(verse.content as Content);
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return { ...verse, content: rewritten.content };
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
    return true;
  }
  return false;
}

/** One truncated-range finding {@link reconstructTruncatedRangesInFile} declined to complete, with enough identity to report it. */
interface TruncatedRangeSkip {
  /** Book id the skipped verse belongs to. */
  book: string;
  /** Chapter number of the skipped verse. */
  chapter: number;
  /** Verse number of the skipped verse. */
  verse: number;
  /** Why the reconstruction was declined. */
  reason: TruncatedRangeSkipReason;
}

/**
 * Reconstruct every truncated `bibleLink` range in one verse file and write
 * it back if anything changed — same gate-and-report shape as {@link
 * reorderFootnotePunctuationInFile}, since {@link
 * reconstructTruncatedRangesInContent} carries an identical contract.
 *
 * Reads the version id off the file's own directory name rather than
 * restructuring the loop to be version-scoped: the content function's own
 * chapter-length lookups are cached across the whole run regardless of which
 * file asks first, so nothing is lost by resolving the version per file.
 *
 * No `sortVerseKeys` call is needed: this step only ever mutates an existing
 * `bibleLink` string's value in place and never touches `content`, so key
 * order never changes.
 */
async function reconstructTruncatedRangesInFile(
  filePath: string,
): Promise<{ changed: boolean; skipped: TruncatedRangeSkip[] }> {
  const versionId = path.basename(path.dirname(filePath));
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const skipped: TruncatedRangeSkip[] = [];
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = reconstructTruncatedRangesInContent(versionId, verse.content as Content);
    for (const reason of rewritten.skipped) {
      skipped.push({
        book: verse.book as string,
        chapter: verse.chapter as number,
        verse: verse.verse as number,
        reason,
      });
    }
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return { ...verse, content: rewritten.content };
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
  }
  return { changed: anyChanged, skipped };
}

/**
 * Normalize every un-normalized fraction in one verse file and write it back
 * if anything changed.
 *
 * Uses {@link normalizeFractionsInContent}'s own per-verse `changed` flag,
 * the same pattern {@link normalizeBibleLinkDashesInFile} uses. No
 * `sortVerseKeys` call is needed — same reason as {@link
 * reconstructTruncatedRangesInFile}: this step only mutates an existing
 * `text` string's value in place.
 */
async function normalizeFractionsInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = normalizeFractionsInContent(verse.content as Content);
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return { ...verse, content: rewritten.content };
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
    return true;
  }
  return false;
}

/**
 * Normalize every un-normalized ellipsis in one verse file and write it back
 * if anything changed.
 *
 * Uses {@link normalizeEllipsesInContent}'s own per-verse `changed` flag,
 * the same pattern {@link normalizeFractionsInFile} uses. No `sortVerseKeys`
 * call is needed, same reason as {@link normalizeFractionsInFile}.
 *
 * Deliberately narrower than `auditNodes.ts`'s check 10: this only ever
 * rewrites the unambiguous three-plus-dot and spaced-dot shapes
 * {@link normalizeEllipsisText} converts, never the two-period shape check
 * 10 also reports. See `functions/normalizeEllipses.ts`'s own top doc
 * comment for why that refusal is deliberate and permanent.
 */
async function normalizeEllipsesInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = normalizeEllipsesInContent(verse.content as Content);
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return { ...verse, content: rewritten.content };
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
    return true;
  }
  return false;
}

/**
 * Merges every check-1-eligible unmerged node pair in one verse file and
 * writes it back if anything changed.
 *
 * Unlike the four text-only steps before it (dashes, fractions, ellipses),
 * this one calls `sortVerseKeys` on every changed verse: a merge can add a
 * `paragraph` key — carried over from the merged run's first member, per
 * {@link mergeUnmergedNodesInContent} — that the pre-merge target never had,
 * changing key order.
 */
async function mergeUnmergedNodesInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = mergeUnmergedNodesInContent(verse.content as Content);
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return sortVerseKeys({ ...verse, content: rewritten.content });
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
    return true;
  }
  return false;
}

/** One check-8 finding {@link reorderFootnotePunctuationInFile} declined to fix, with enough identity to report it. */
interface FootnotePunctuationSkip {
  /** Book id the skipped verse belongs to. */
  book: string;
  /** Chapter number of the skipped verse. */
  chapter: number;
  /** Verse number of the skipped verse. */
  verse: number;
  /** Why the reorder was declined. */
  reason: FootnotePunctuationSkipReason;
}

/**
 * Reorders every check-8-eligible footnote/punctuation pair in one verse file
 * and writes it back if anything changed — same `sortVerseKeys`-on-change
 * shape as {@link mergeUnmergedNodesInFile}, since this step can also delete
 * a now-empty sibling.
 *
 * Unlike the steps before it, this one has a gate: {@link
 * reorderFootnotePunctuationInContent} can decline a real finding rather
 * than guess at it, so `main()` can report *why* a finding still present
 * after the auto-fix pass was left there, not just that it was.
 */
async function reorderFootnotePunctuationInFile(
  filePath: string,
): Promise<{ changed: boolean; skipped: FootnotePunctuationSkip[] }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const skipped: FootnotePunctuationSkip[] = [];
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = reorderFootnotePunctuationInContent(verse.content as Content);
    for (const reason of rewritten.skipped) {
      skipped.push({
        book: verse.book as string,
        chapter: verse.chapter as number,
        verse: verse.verse as number,
        reason,
      });
    }
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return sortVerseKeys({ ...verse, content: rewritten.content });
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
  }
  return { changed: anyChanged, skipped };
}

/** One check-9 finding {@link relocateMarkBoundarySpacesInFile} declined to fix, with enough identity to report it. */
interface MarkBoundarySpaceSkip {
  /** Book id the skipped verse belongs to. */
  book: string;
  /** Chapter number of the skipped verse. */
  chapter: number;
  /** Verse number of the skipped verse. */
  verse: number;
  /** Why the relocation was declined. */
  reason: MarkBoundarySpaceSkipReason;
}

/**
 * Relocates every check-9-eligible embedded whitespace run in one verse file
 * and writes it back if anything changed — same shape as {@link
 * reorderFootnotePunctuationInFile}, since {@link
 * relocateMarkBoundarySpacesInContent} carries the identical gate-and-report
 * contract.
 */
async function relocateMarkBoundarySpacesInFile(
  filePath: string,
): Promise<{ changed: boolean; skipped: MarkBoundarySpaceSkip[] }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const skipped: MarkBoundarySpaceSkip[] = [];
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = relocateMarkBoundarySpacesInContent(verse.content as Content);
    for (const reason of rewritten.skipped) {
      skipped.push({
        book: verse.book as string,
        chapter: verse.chapter as number,
        verse: verse.verse as number,
        reason,
      });
    }
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return sortVerseKeys({ ...verse, content: rewritten.content });
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
  }
  return { changed: anyChanged, skipped };
}

/**
 * Adds a missing `paragraph: true` flag after every heading/subtitle run in
 * one verse file, and writes the file back if anything changed — same
 * `sortVerseKeys`-on-change shape as this pass's other structural steps.
 *
 * Verse-scoped rather than content-scoped, matching {@link
 * addMissingHeadingParagraphsInVerse}: check 6's `nextIndex` indexes into a
 * verse's outermost content array, not an arbitrary subtree, so the fix
 * operates one whole verse at a time.
 */
async function addMissingHeadingParagraphsInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = addMissingHeadingParagraphsInVerse(verse as unknown as VerseRecord);
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return sortVerseKeys(rewritten.verse as unknown as Record<string, unknown>);
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
    return true;
  }
  return false;
}

/**
 * Collect all JSON files to be validated and formatted.
 *
 * The root-level schema, the bible-books registry, and the two
 * bible-versions-wide schemas are always included regardless of scope —
 * every version depends on them.
 *
 * @param versionDirs - Version folder names to scope collection to — e.g.
 *   `["YLT1898"]` for one requested version, or `getVersionDirectories()`'s
 *   full result to collect every version's files
 */
export function collectJsonFiles(versionDirs: string[]): string[] {
  const files: string[] = [];

  // Root-level schema
  files.push("content-schema.json");

  // Bible books
  files.push(jsonPath);
  files.push(schemaPath);

  // Bible versions schemas
  files.push(versionsSchemaPath);
  files.push("./bible-versions/bible-verses-schema.json");

  // Version folders and their files
  for (const versionDir of versionDirs) {
    const versionPath = path.join(bibleVersionsDir, versionDir);
    const jsonFiles = fs
      .readdirSync(versionPath)
      .filter((file) => file.endsWith(".json"));

    for (const file of jsonFiles) {
      files.push(path.join(versionPath, file));
    }
  }

  return files;
}

/**
 * Properties that hold a node's nested content instead of its own text — when
 * one is present, the checks below recurse into it instead of applying at
 * this level.
 *
 * `paragraph` is deliberately excluded: it's a boolean flag on a text node but
 * nested content on a paragraph node, so it must be told apart by its value,
 * not by key alone.
 */
const CONTENT_BRANCHES = ["content", "heading", "subtitle"] as const;

/**
 * Find content nodes the schema accepts but that render as nothing.
 *
 * `content-schema.json` requires no `text` alongside `marks`/`script` and
 * puts no `minLength` on `text` — gaps that let two real defects through
 * structural checks: a node with `marks`/`script` but no text (a non-greedy
 * tag-matching renderer can't wrap zero characters, so the opening delimiter
 * leaks into the surrounding text), and an empty husk left behind after its
 * marks were stripped.
 *
 * Everything else a text-less node can carry — `foot`, `strong`, `bibleLink`,
 * bare `paragraph`/`break` flags — is meaningful on its own; whitespace
 * counts as text. Recurses into every content-bearing branch (`foot.content`,
 * subtitles, headings), since either defect shape can appear nested, not
 * just at the top level.
 *
 * @param content - A verse's content tree
 * @returns One message per offending node, each naming its path within the
 *   tree (e.g. `content[0].foot.content[1]`); empty when the tree is clean
 */
export function findMeaninglessContentNodes(content: Content): string[] {
  const problems: string[] = [];

  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${at}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;

    const properties = node as Record<string, unknown>;
    const branch =
      CONTENT_BRANCHES.find((key) => key in properties) ??
      ("paragraph" in properties && typeof properties.paragraph !== "boolean"
        ? "paragraph"
        : undefined);

    if (branch) {
      walk(properties[branch], `${at}.${branch}`);
    } else {
      const text = properties.text;
      const hasText = typeof text === "string" && text !== "";
      const marks = Array.isArray(properties.marks)
        ? properties.marks
        : undefined;
      const script =
        typeof properties.script === "string" ? properties.script : undefined;

      if (!hasText && (marks || script)) {
        const dangling = [
          marks && `marks [${marks.join(", ")}]`,
          script && `script "${script}"`,
        ].filter(Boolean);
        problems.push(
          `${at}: ${dangling.join(" and ")} with no text to apply to`
        );
      } else if (
        !hasText &&
        Object.keys(properties).every((key) => key === "text")
      ) {
        problems.push(`${at}: empty node with nothing to render`);
      }
    }

    const foot = properties.foot;
    if (foot && typeof foot === "object") {
      walk((foot as { content?: unknown }).content, `${at}.foot.content`);
    }
  };

  walk(content, "content");
  return problems;
}

/**
 * Find content nodes carrying a `strong` value whose own `text` ends in
 * trailing whitespace.
 *
 * The established convention (e.g. KJV1769 Genesis 1:1:
 * `{ text: "In the beginning", strong: "H7225" }`,
 * `{ text: " God", strong: "H430" }`) puts a joining space as the
 * **leading** character of the node after the gap, never trailing on the
 * node before it — inverting it breaks any exporter that assumes the
 * leading-space shape (double spaces, misplaced tags).
 *
 * A textless sibling — e.g. a multi-number Strong's tag's extra numbers,
 * `{ strong: "H853" }` — never matches here, since an empty string can't
 * end in whitespace, so it needs no special exclusion.
 *
 * @param content - A verse's content tree
 * @returns One message per offending node, each naming its path within the
 *   tree (e.g. `content[0].foot.content[1]`); empty when the tree is clean
 */
export function findStrongTrailingWhitespaceNodes(content: Content): string[] {
  const problems: string[] = [];

  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${at}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;

    const properties = node as Record<string, unknown>;
    const branch =
      CONTENT_BRANCHES.find((key) => key in properties) ??
      ("paragraph" in properties && typeof properties.paragraph !== "boolean"
        ? "paragraph"
        : undefined);

    if (branch) {
      walk(properties[branch], `${at}.${branch}`);
    } else if (
      typeof properties.strong === "string" &&
      typeof properties.text === "string" &&
      /\s$/.test(properties.text)
    ) {
      problems.push(
        `${at}: strong "${properties.strong}" carries text "${properties.text}" ending in whitespace`
      );
    }

    const foot = properties.foot;
    if (foot && typeof foot === "object") {
      walk((foot as { content?: unknown }).content, `${at}.foot.content`);
    }
  };

  walk(content, "content");
  return problems;
}

/**
 * Convert a hyphen to an en dash only when it sits directly between two
 * digits — the narrow rule {@link fixBibleLinkNode} needs, since a blanket
 * replacement would corrupt a hyphenated word (a place name, a compound)
 * inside a free-form display override.
 *
 * Uses a lookaround rather than a capture-and-replace so consecutive ranges
 * (`"1-2-3"`) convert every hyphen, not just the first — a captured digit
 * cannot also open the next match, but an asserted one can.
 */
function convertDigitFlankedHyphens(text: string): string {
  return text.replace(/(?<=\d)-(?=\d)/g, "–");
}

/**
 * Fix one `bibleLink` node's hyphens — in the target itself and in a string
 * `content` override — dropping `content` once it's redundant with the
 * (now-fixed) `bibleLink`, even when the redundancy has nothing to do with a
 * hyphen. Never invents a `content` key, and never touches one that's absent
 * or not a string.
 *
 * Not exported — a caller reaches this only through
 * {@link normalizeBibleLinkDashesInContent}, which is the one that knows
 * when a node in the tree is a `bibleLink` at all.
 */
function fixBibleLinkNode(node: ContentBibleLink): { content: ContentBibleLink; changed: boolean } {
  const bibleLink = convertDigitFlankedHyphens(node.bibleLink);

  const content =
    typeof node.content === "string" ? convertDigitFlankedHyphens(node.content) : node.content;

  if (typeof content === "string" && content === bibleLink) {
    return { content: { bibleLink }, changed: true };
  }

  if (bibleLink === node.bibleLink && content === node.content) {
    return { content: node, changed: false };
  }

  return {
    content: content === undefined ? { bibleLink } : { bibleLink, content },
    changed: true,
  };
}

/**
 * Normalize every `bibleLink` node's ASCII hyphens to en dashes, via
 * {@link fixBibleLinkNode} — never touching any other `content` key in the
 * tree (a paragraph's or heading's own `content` is left alone even when it
 * contains a hyphen).
 *
 * Traversal order — array, `bibleLink`, `heading`, `subtitle`,
 * `paragraph`-as-content, `content`, then `foot` — mirrors
 * `crossChapterLinks.ts`'s `splitCrossChapterLinksInContent`, not
 * {@link CONTENT_BRANCHES}: a `bibleLink`'s own `content` is display text to
 * rewrite, not a subtree, so the `"bibleLink" in node` check must run before
 * the generic `"content" in node` check treats it as a branch instead.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @returns The rewritten tree (structurally new only where something
 *   changed) and whether anything changed at all
 */
export function normalizeBibleLinkDashesInContent(
  content: Content
): { content: Content; changed: boolean } {
  if (content === null || content === undefined || typeof content !== "object") {
    return { content, changed: false };
  }

  if (Array.isArray(content)) {
    let changed = false;
    const items = content.map((item) => {
      const rewritten = normalizeBibleLinkDashesInContent(item);
      changed = changed || rewritten.changed;
      return rewritten.content;
    });
    return { content: items, changed };
  }

  if ("bibleLink" in content) {
    return fixBibleLinkNode(content);
  }

  if ("heading" in content) {
    const rewritten = normalizeBibleLinkDashesInContent(content.heading);
    return { content: { ...content, heading: rewritten.content }, changed: rewritten.changed };
  }

  if ("subtitle" in content) {
    const rewritten = normalizeBibleLinkDashesInContent(content.subtitle);
    return { content: { ...content, subtitle: rewritten.content }, changed: rewritten.changed };
  }

  if ("paragraph" in content && content.paragraph !== undefined && typeof content.paragraph !== "boolean") {
    const rewritten = normalizeBibleLinkDashesInContent(content.paragraph);
    return { content: { ...content, paragraph: rewritten.content }, changed: rewritten.changed };
  }

  let result: Content = content;
  let changed = false;
  if ("content" in content) {
    const rewritten = normalizeBibleLinkDashesInContent(content.content);
    result = { ...content, content: rewritten.content };
    changed = rewritten.changed;
  }
  if (content.foot) {
    const rewritten = normalizeBibleLinkDashesInContent(content.foot.content);
    result = { ...(result as typeof content), foot: { ...content.foot, content: rewritten.content } };
    changed = changed || rewritten.changed;
  }
  return { content: result, changed };
}

/**
 * Validates (and normalizes) one version, or every version when none is
 * requested. The auto-fix pass runs eleven steps, in order: sort verse keys,
 * format JSON files, normalize `bibleLink` dashes, reconstruct truncated
 * `bibleLink` ranges, split cross-chapter `bibleLink` ranges, normalize
 * fractions, normalize ellipses, merge unmerged node pairs (check 1),
 * reorder footnote punctuation (check 8), relocate mark-boundary embedded
 * spaces (check 9), and add missing heading/subtitle paragraph flags
 * (check 6).
 *
 * The ordering is deliberate. Dashes settle before the truncated-range and
 * cross-chapter steps look for the separator; a reconstructed truncated
 * range runs before the cross-chapter split so a range that turns out to
 * span two chapters gets split on the very next step rather than left for a
 * later run; and both consume a range before the text-only fractions and
 * ellipses steps see the same nodes. Checks 1, 6, 8, and 9 run last, in that
 * order, because check 1's merge is the coarsest structural change (so it
 * precedes the finer-grained checks 8 and 9), and check 6 is additive and
 * touches a node class none of the others do. Those four call
 * `sortVerseKeys` on every changed verse, unlike the steps before them,
 * since merging, reordering, relocating, and flagging can all change which
 * keys a node carries. The truncated-range and cross-chapter steps don't
 * need it either, for the same reason the text-only steps don't — see
 * {@link reconstructTruncatedRangesInFile}.
 *
 * After the auto-fix pass, `main` checks bible-books, each version's
 * `_version.json`, book ordering, and every verse file's schema and content,
 * then runs the report-only cross-chapter, truncated-range, and
 * node-convention audits, exiting non-zero on the first phase that fails.
 *
 * **The report-only audits run after the fix pass on purpose.** Checks 8 and
 * 9, and the truncated-range reconstruction, each have a gate that can
 * decline a real finding rather than guess at it. Whatever a gate declines
 * is still on disk when the audit re-reads it, so the run still fails with
 * detail — the "report what it can't fix" half of the contract falls out of
 * the ordering alone, with no extra code needed to enforce it.
 *
 * The schema/structure phases are hierarchical: each assumes the earlier
 * ones held, so a failure exits immediately. The three corpus-wide audits
 * that run last (`crossChapterLinks.ts`'s two checks and `auditNodes.ts`)
 * have no such dependency on each other, so all three always run to
 * completion before `main` exits non-zero — a version failing one still gets
 * audited by the others in the same pass, rather than needing a second run
 * to find out.
 *
 * @param requestedVersion - A single version id (e.g. `"YLT1898"`, from
 *   `process.argv[2]`). Omitted → every version directory on disk is
 *   validated. An unmatched id surfaces as a natural filesystem error later
 *   rather than being checked for existence up front.
 */
async function main(requestedVersion?: string) {
  const versionDirs = requestedVersion
    ? [requestedVersion]
    : getVersionDirectories(bibleVersionsDir);

  console.log("🔑 Sorting keys in verse files...\n");

  const jsonFiles = collectJsonFiles(versionDirs);
  let sortedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasSorted = await sortVerseFileKeys(file);
      if (wasSorted) {
        sortedCount++;
        console.log(`  🔄 Sorted keys: ${file}`);
      }
    }
  }

  if (sortedCount > 0) {
    console.log(`\n✅ Sorted keys in ${sortedCount} file(s)\n`);
  } else {
    console.log("✅ All verse files already have correct key order\n");
  }

  console.log("🎨 Formatting JSON files with Prettier...\n");

  let formattedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file)) {
      const wasFormatted = await formatJsonFile(file);
      if (wasFormatted) {
        formattedCount++;
        console.log(`  📝 Formatted: ${file}`);
      }
    }
  }

  if (formattedCount > 0) {
    console.log(`\n✅ Formatted ${formattedCount} file(s)\n`);
  } else {
    console.log("✅ All JSON files already formatted\n");
  }

  console.log("🔧 Normalizing bibleLink dashes...\n");

  let dashNormalizedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasNormalized = await normalizeBibleLinkDashesInFile(file);
      if (wasNormalized) {
        dashNormalizedCount++;
        console.log(`  🔄 Normalized bibleLink dashes: ${file}`);
      }
    }
  }

  if (dashNormalizedCount > 0) {
    console.log(`\n✅ Normalized bibleLink dashes in ${dashNormalizedCount} file(s)\n`);
  } else {
    console.log("✅ All bibleLink dashes already normalized\n");
  }

  console.log("📏 Reconstructing truncated bibleLink ranges...\n");

  let truncatedRangesFixedCount = 0;
  const truncatedRangesSkipped: TruncatedRangeSkip[] = [];

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const { changed, skipped } = await reconstructTruncatedRangesInFile(file);
      if (changed) {
        truncatedRangesFixedCount++;
        console.log(`  🔄 Reconstructed truncated bibleLink range(s): ${file}`);
      }
      truncatedRangesSkipped.push(...skipped);
    }
  }

  if (truncatedRangesFixedCount > 0) {
    console.log(`\n✅ Reconstructed truncated bibleLink ranges in ${truncatedRangesFixedCount} file(s)\n`);
  } else {
    console.log("✅ No truncated bibleLink ranges found\n");
  }
  if (truncatedRangesSkipped.length > 0) {
    console.log(`⚠️  ${truncatedRangesSkipped.length} truncated-range finding(s) left for the audit below to report:`);
    for (const skip of truncatedRangesSkipped) {
      console.log(`    ${skip.book} ${skip.chapter}:${skip.verse} skipped — ${skip.reason}`);
    }
    console.log("");
  }

  console.log("✂️  Splitting cross-chapter bibleLink ranges...\n");

  // Version-scoped rather than file-scoped, unlike the steps around it:
  // fixCrossChapterLinks needs a whole version's chapter-length index, built
  // from every book file together, so it reads and returns per version
  // rather than taking one file path.
  let crossChapterFilesFixedCount = 0;
  let crossChapterSplitsCount = 0;

  for (const versionDir of versionDirs) {
    for (const { file, records, splits } of fixCrossChapterLinks(versionDir)) {
      await writeJsonFile(path.join(bibleVersionsDir, versionDir, file), records);
      crossChapterFilesFixedCount++;
      crossChapterSplitsCount += splits;
      console.log(`  🔄 Split ${splits} cross-chapter bibleLink(s): ${versionDir}/${file}`);
    }
  }

  if (crossChapterFilesFixedCount > 0) {
    console.log(`\n✅ Split ${crossChapterSplitsCount} cross-chapter bibleLink range(s) across ${crossChapterFilesFixedCount} file(s)\n`);
  } else {
    console.log("✅ No cross-chapter bibleLink ranges to split\n");
  }

  console.log("➗ Normalizing fractions...\n");

  let fractionsNormalizedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasNormalized = await normalizeFractionsInFile(file);
      if (wasNormalized) {
        fractionsNormalizedCount++;
        console.log(`  🔄 Normalized fractions: ${file}`);
      }
    }
  }

  if (fractionsNormalizedCount > 0) {
    console.log(`\n✅ Normalized fractions in ${fractionsNormalizedCount} file(s)\n`);
  } else {
    console.log("✅ All fractions already normalized\n");
  }

  console.log("🔤 Normalizing ellipses...\n");

  let ellipsesNormalizedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasNormalized = await normalizeEllipsesInFile(file);
      if (wasNormalized) {
        ellipsesNormalizedCount++;
        console.log(`  🔄 Normalized ellipses: ${file}`);
      }
    }
  }

  if (ellipsesNormalizedCount > 0) {
    console.log(`\n✅ Normalized ellipses in ${ellipsesNormalizedCount} file(s)\n`);
  } else {
    console.log("✅ All ellipses already normalized\n");
  }

  console.log("🧵 Merging unmerged node pairs (check 1)...\n");

  let unmergedNodesFixedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasFixed = await mergeUnmergedNodesInFile(file);
      if (wasFixed) {
        unmergedNodesFixedCount++;
        console.log(`  🔄 Merged unmerged node pairs: ${file}`);
      }
    }
  }

  if (unmergedNodesFixedCount > 0) {
    console.log(`\n✅ Merged unmerged node pairs in ${unmergedNodesFixedCount} file(s)\n`);
  } else {
    console.log("✅ No unmerged node pairs found\n");
  }

  console.log("🔀 Reordering footnote punctuation (check 8)...\n");

  let footnotePunctuationFixedCount = 0;
  const footnotePunctuationSkipped: FootnotePunctuationSkip[] = [];

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const { changed, skipped } = await reorderFootnotePunctuationInFile(file);
      if (changed) {
        footnotePunctuationFixedCount++;
        console.log(`  🔄 Reordered footnote punctuation: ${file}`);
      }
      footnotePunctuationSkipped.push(...skipped);
    }
  }

  if (footnotePunctuationFixedCount > 0) {
    console.log(`\n✅ Reordered footnote punctuation in ${footnotePunctuationFixedCount} file(s)\n`);
  } else {
    console.log("✅ No footnote punctuation to reorder\n");
  }
  if (footnotePunctuationSkipped.length > 0) {
    console.log(`⚠️  ${footnotePunctuationSkipped.length} footnote-punctuation finding(s) left for the audit below to report:`);
    for (const skip of footnotePunctuationSkipped) {
      console.log(`    ${skip.book} ${skip.chapter}:${skip.verse} skipped — ${skip.reason}`);
    }
    console.log("");
  }

  console.log("↔️  Relocating mark-boundary embedded spaces (check 9)...\n");

  let markBoundarySpacesFixedCount = 0;
  const markBoundarySpacesSkipped: MarkBoundarySpaceSkip[] = [];

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const { changed, skipped } = await relocateMarkBoundarySpacesInFile(file);
      if (changed) {
        markBoundarySpacesFixedCount++;
        console.log(`  🔄 Relocated mark-boundary embedded spaces: ${file}`);
      }
      markBoundarySpacesSkipped.push(...skipped);
    }
  }

  if (markBoundarySpacesFixedCount > 0) {
    console.log(`\n✅ Relocated mark-boundary embedded spaces in ${markBoundarySpacesFixedCount} file(s)\n`);
  } else {
    console.log("✅ No mark-boundary embedded spaces found\n");
  }
  if (markBoundarySpacesSkipped.length > 0) {
    console.log(`⚠️  ${markBoundarySpacesSkipped.length} mark-boundary-space finding(s) left for the audit below to report:`);
    for (const skip of markBoundarySpacesSkipped) {
      console.log(`    ${skip.book} ${skip.chapter}:${skip.verse} skipped — ${skip.reason}`);
    }
    console.log("");
  }

  console.log("🧱 Adding missing heading/subtitle paragraph flags (check 6)...\n");

  let headingParagraphsFixedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasFixed = await addMissingHeadingParagraphsInFile(file);
      if (wasFixed) {
        headingParagraphsFixedCount++;
        console.log(`  🔄 Added missing heading/subtitle paragraph flags: ${file}`);
      }
    }
  }

  if (headingParagraphsFixedCount > 0) {
    console.log(`\n✅ Added missing heading/subtitle paragraph flags in ${headingParagraphsFixedCount} file(s)\n`);
  } else {
    console.log("✅ Every heading/subtitle run already opens a paragraph\n");
  }

  const result = validateJsonAgainstSchema(schemaPath, jsonPath);

  console.log("Schema validation result:", result);

  if (!result.valid) {
    console.error("\n❌ Bible books schema validation failed:");
    if (result.errors) {
      result.errors.forEach((error) => {
        console.error(`  - ${error.instancePath || "Root"}: ${error.message}`);
        if (error.params && error.params.additionalProperty) {
          console.error(
            `    Extra property: "${error.params.additionalProperty}"`
          );
        }
      });
    }
    process.exit(1);
  }

  const books = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const validBookIds = new Set(books.map((book: any) => book._id));

  console.log("\n🔍 Validating Bible version files...");

  const versions: BibleVersion[] = [];
  let versionsValidationPassed = true;

  for (const versionDir of versionDirs) {
    const versionFilePath = `${bibleVersionsDir}/${versionDir}/_version.json`;

    console.log(`\n📖 Validating version: ${versionDir}`);

    const versionResult = validateJsonAgainstSchema(
      versionsSchemaPath,
      versionFilePath
    );

    if (!versionResult.valid) {
      console.error(`❌ Schema validation failed for ${versionFilePath}:`);
      if (versionResult.errors) {
        versionResult.errors.forEach((error) => {
          console.error(
            `  - ${error.instancePath || "Root"}: ${error.message}`
          );
          if (error.params && error.params.additionalProperty) {
            console.error(
              `    Extra property: "${error.params.additionalProperty}"`
            );
          }
        });
      }
      versionsValidationPassed = false;
      continue;
    }

    // Load and store the version for further validation
    const versionContent = fs.readFileSync(versionFilePath, "utf-8");
    const version = JSON.parse(versionContent) as BibleVersion;
    versions.push(version);

    if (version._id !== versionDir) {
      console.error(
        `❌ Version _id "${version._id}" does not match folder name "${versionDir}"`
      );
      versionsValidationPassed = false;
    }

    console.log(`✅ ${versionDir}/_version.json validated`);
  }

  if (!versionsValidationPassed) {
    console.error("\n❌ Version schema validation failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All version files validated against schema!");
  }

  console.log("\n🔍 Validating book ordering...");
  let booksValidationPassed = true;

  for (const version of versions) {
    const versionBooks = version.books || [];
    if (versionBooks.length === 0) {
      console.log(`✅ ${version._id}: no books specified`);
      continue;
    }

    const orderValues = versionBooks.map((item) => item.order);
    const sortedOrders = _.sortBy(orderValues);

    // Check for duplicates
    const duplicates = _.filter(
      _.groupBy(versionBooks, "order"),
      (group) => group.length > 1
    );

    if (duplicates.length > 0) {
      console.error(`\n❌ ${version._id} has duplicate order numbers:`);
      duplicates.forEach((group) => {
        const bookIds = group.map((item) => item._id).join(", ");
        console.error(`  Order ${group[0].order}: ${bookIds}`);
      });
      booksValidationPassed = false;
    }

    if (sortedOrders[0] !== 1) {
      console.error(
        `\n❌ ${version._id} does not start at 1 (starts at ${sortedOrders[0]})`
      );
      booksValidationPassed = false;
    }

    // Check for gaps in sequence
    const expectedCount = sortedOrders[sortedOrders.length - 1];
    if (sortedOrders.length !== expectedCount) {
      const allExpected = _.range(1, expectedCount + 1);
      const missing = _.difference(allExpected, sortedOrders);
      if (missing.length > 0) {
        console.error(
          `\n❌ ${version._id} has gaps in numbering. Missing: ${missing.join(
            ", "
          )}`
        );
        booksValidationPassed = false;
      }
    }

    if (
      sortedOrders[0] === 1 &&
      sortedOrders.length === expectedCount &&
      duplicates.length === 0
    ) {
      console.log(
        `✅ ${version._id}: ${sortedOrders.length} books, numbered 1–${expectedCount}`
      );
    }
  }

  if (!booksValidationPassed) {
    console.error("\n❌ Books validation failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All order validations passed!");
  }

  console.log("\n🔍 Validating Bible verse files...");

  const verseSchemaPath = "./bible-versions/bible-verses-schema.json";

  let verseValidationPassed = true;

  // Create version map for book list validation
  const versionMap = new Map(versions.map((v) => [v._id, v]));

  // Load all three schemas and compile the verse validator once, so it
  // isn't recompiled per version in the loop below
  const verseSchemaContent = fs.readFileSync(verseSchemaPath, "utf-8");
  const verseSchema = JSON.parse(verseSchemaContent);
  const bookSchemaContent = fs.readFileSync(schemaPath, "utf-8");
  const bookSchema = JSON.parse(bookSchemaContent);
  const contentSchemaContent = fs.readFileSync("content-schema.json", "utf-8");
  const contentSchema = JSON.parse(contentSchemaContent);
  const ajv = new Ajv();
  ajv.addSchema(contentSchema);
  ajv.addSchema(bookSchema);
  const validateVerse = ajv.compile(verseSchema);

  for (const versionDir of versionDirs) {
    const versionPath = `${bibleVersionsDir}/${versionDir}`;
    const verseFiles = fs
      .readdirSync(versionPath)
      .filter((file) => file.endsWith(".json") && file !== "_version.json");

    console.log(`\n📖 Checking version: ${versionDir}`);

    const versionObj = versionMap.get(versionDir);
    const expectedFiles = new Set(
      (versionObj?.books || []).map(
        (b) => `${b.order.toString().padStart(2, "0")}-${b._id}.json`
      )
    );
    const actualFiles = new Set(verseFiles);

    // Check for missing files
    for (const expectedFile of expectedFiles) {
      if (!actualFiles.has(expectedFile)) {
        const bookId = expectedFile.split("-")[1].replace(".json", "");
        console.error(
          `❌ Missing file for book ${bookId} in version ${versionDir}`
        );
        verseValidationPassed = false;
      }
    }

    // Check for extra files
    for (const actualFile of actualFiles) {
      if (!expectedFiles.has(actualFile)) {
        console.error(
          `❌ Extra file ${actualFile} in version ${versionDir} (not in books array)`
        );
        verseValidationPassed = false;
      }
    }

    for (const file of verseFiles) {
      const filePath = `${versionPath}/${file}`;
      const bookIdFromFilename = file.split("-")[1].replace(".json", "");

      if (!validBookIds.has(bookIdFromFilename)) {
        console.error(
          `❌ Invalid filename: ${file} (book ID "${bookIdFromFilename}" not found in bible-books.json)`
        );
        verseValidationPassed = false;
        continue;
      }

      const verses = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      // Per-verse checks: schema validity, the book field against the
      // filename, content that passes the schema but renders as nothing,
      // and Strong's-tagged text with trailing whitespace.
      for (const verse of verses) {
        const valid = validateVerse(verse);
        if (!valid) {
          console.error(
            `❌ Schema validation failed for verse ${verse.chapter}:${verse.verse} in ${filePath}:`,
            validateVerse.errors
          );
          verseValidationPassed = false;
        }

        if (verse.book !== bookIdFromFilename) {
          console.error(
            `❌ Book field mismatch in ${filePath}: verse ${verse.chapter}:${verse.verse} has book="${verse.book}" but filename indicates "${bookIdFromFilename}"`
          );
          verseValidationPassed = false;
        }

        // The schema checks structure; this checks that the structure says
        // something. See findMeaninglessContentNodes for what slipped past it.
        for (const problem of findMeaninglessContentNodes(verse.content)) {
          console.error(
            `❌ Meaningless content in ${filePath}: verse ${verse.chapter}:${verse.verse} — ${problem}`
          );
          verseValidationPassed = false;
        }

        // See findStrongTrailingWhitespaceNodes for the convention this
        // enforces and why a violation is a real defect, not just style.
        for (const problem of findStrongTrailingWhitespaceNodes(
          verse.content
        )) {
          console.error(
            `❌ Strong's text ends in whitespace in ${filePath}: verse ${verse.chapter}:${verse.verse} — ${problem}`
          );
          verseValidationPassed = false;
        }
      }

      console.log(`✅ ${file}: ${verses.length} verses validated`);
    }
  }

  if (!verseValidationPassed) {
    console.error("\n❌ Verse file validation failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All verse file validations passed!");
  }

  // Cross-chapter bibleLink audit: every unsplit range still in this
  // version's content. Report-only — see the auto-fix pass above and
  // crossChapterLinks.ts for the split rule.
  console.log("\n🔗 Auditing cross-chapter bibleLink targets...");
  let crossChapterLinksPassed = true;

  for (const versionDir of versionDirs) {
    const { findings } = findCrossChapterLinks(versionDir);
    if (findings.length === 0) {
      console.log(`✅ ${versionDir}: no unsplit cross-chapter links`);
      continue;
    }

    console.error(`❌ ${versionDir}: ${findings.length} unsplit cross-chapter link(s):`);
    for (const finding of findings) {
      console.error(`  ${formatCrossChapterFinding(finding)}`);
    }
    crossChapterLinksPassed = false;
  }

  // Truncated-range audit: every bibleLink target still short of the range
  // its own display names — a different finding from the unsplit-range one
  // above (see crossChapterLinks.ts). Report-only, for the same reason.
  console.log("\n📏 Auditing truncated bibleLink ranges...");
  let truncatedRangesPassed = true;

  for (const versionDir of versionDirs) {
    const { findings } = findTruncatedRanges(versionDir);
    if (findings.length === 0) {
      console.log(`✅ ${versionDir}: no truncated bibleLink ranges`);
      continue;
    }

    console.error(`❌ ${versionDir}: ${findings.length} truncated bibleLink range(s):`);
    for (const finding of findings) {
      console.error(`  ${formatTruncatedRangeFinding(finding)}`);
    }
    truncatedRangesPassed = false;
  }

  // Node-placement and content-convention audit: the eleven checks
  // auditNodes.ts owns. Also report-only here.
  console.log("\n🧩 Auditing node-placement and content conventions...");
  let nodeConventionsPassed = true;

  for (const versionDir of versionDirs) {
    const summary = auditNodeConventions(versionDir);
    if (nodeConventionsAreClean(summary)) {
      console.log(`✅ ${versionDir}: no node/content convention findings`);
      continue;
    }

    console.error(`❌ ${versionDir}: node/content convention findings:`);
    printNodeConventionFindings(summary, false);
    nodeConventionsPassed = false;
  }

  if (!crossChapterLinksPassed || !truncatedRangesPassed || !nodeConventionsPassed) {
    if (!crossChapterLinksPassed) {
      console.error("\n❌ Cross-chapter link audit failed! The split step above already ran automatically — a finding surviving here means it genuinely could not be split. See the findings printed above for detail.");
    }
    if (!truncatedRangesPassed) {
      console.error("\n❌ Truncated bibleLink range audit failed! The reconstruction step above already ran automatically — a finding surviving here means it declined the completion (a display range spanning two chapters, which the cross-chapter split owns instead). See the findings printed above for detail.");
    }
    if (!nodeConventionsPassed) {
      console.error("\n❌ Node/content convention audit failed! Checks 1, 6, 8, and 9 already ran their own auto-fix above — see the findings printed above for what's left and why (a gate declined it, or it's one of the report-only checks with no fixer at all).");
    }
    process.exit(1);
  }

  console.log("\n✅ Cross-chapter link, truncated bibleLink range, and node/content convention audits all passed!");
}

// Guard so importing this module (e.g. from tests) doesn't also run main()
// and call process.exit
if (require.main === module) {
  main(process.argv[2]).catch((error) => {
    console.error("Validation failed with error:", error);
    process.exit(1);
  });
}
