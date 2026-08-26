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
import {
  tagScriptRunsInContent,
  SkipReason as UntaggedScriptRunSkipReason,
} from "../functions/tagScriptRunsInContent";
import BibleVersion, { VersionBook } from "../types/Version";
import {
  findCrossChapterLinks,
  findTruncatedRanges,
  findUnresolvableTargets,
  fixCrossChapterLinks,
  formatCrossChapterFinding,
  formatTruncatedRangeFinding,
  formatUnresolvableTargetFinding,
  reconstructTruncatedRangesInContent,
  splitCrossChapterLinksInContent,
  unlinkUnresolvableTargetsInContent,
  SkipReason as TruncatedRangeSkipReason,
  UnlinkSkipReason,
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
import {
  relocateFootnoteMarkerSpacesInContent,
  SkipReason as FootnoteMarkerSpacingSkipReason,
} from "./fixFootnoteMarkerSpacing";
import { removeDuplicateFootnoteAnchorsInContent } from "./fixDuplicateFootnoteAnchors";
import { mergeEquivalentSiblingsInContent } from "../functions/mergeEquivalentSiblingsInContent";

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

/** One check-13 finding {@link tagScriptRunsInFile} declined to fix, with enough identity to report it. */
interface UntaggedScriptRunSkip {
  /** Book id the skipped verse belongs to. */
  book: string;
  /** Chapter number of the skipped verse. */
  chapter: number;
  /** Verse number of the skipped verse. */
  verse: number;
  /** Why the split was declined. */
  reason: UntaggedScriptRunSkipReason;
}

/**
 * Tags every check-13-eligible untagged Hebrew or Greek run in one verse
 * file and writes it back if anything changed — same gate-and-report shape
 * as {@link reorderFootnotePunctuationInFile}, since {@link
 * tagScriptRunsInContent} carries an identical contract. Calls
 * `sortVerseKeys` on every changed verse: unlike the four text-only steps
 * above it, a split replaces one node with several — new `{text, script}`
 * nodes the pre-split tree never had — which is exactly the "changes which
 * keys a node carries" case `mergeUnmergedNodesInFile`'s own doc comment
 * describes.
 */
async function tagScriptRunsInFile(
  filePath: string,
): Promise<{ changed: boolean; skipped: UntaggedScriptRunSkip[] }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const skipped: UntaggedScriptRunSkip[] = [];
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = tagScriptRunsInContent(verse.content as Content);
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

/** One check-12 finding {@link relocateFootnoteMarkerSpacesInFile} declined to fix, with enough identity to report it. */
interface FootnoteMarkerSpacingSkip {
  /** Book id the skipped verse belongs to. */
  book: string;
  /** Chapter number of the skipped verse. */
  chapter: number;
  /** Verse number of the skipped verse. */
  verse: number;
  /** Why the relocation was declined. */
  reason: FootnoteMarkerSpacingSkipReason;
}

/**
 * Relocates every check-12-eligible footnote-marker-after-whitespace run in
 * one verse file and writes it back if anything changed — same gate-and-report
 * shape as {@link relocateMarkBoundarySpacesInFile}, since {@link
 * relocateFootnoteMarkerSpacesInContent} carries an identical contract.
 *
 * No `sortVerseKeys` call is needed: this step only ever mutates an existing
 * `text` string's value in place and never adds or removes a key, same
 * reason as {@link reconstructTruncatedRangesInFile}.
 */
async function relocateFootnoteMarkerSpacesInFile(
  filePath: string,
): Promise<{ changed: boolean; skipped: FootnoteMarkerSpacingSkip[] }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const skipped: FootnoteMarkerSpacingSkip[] = [];
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = relocateFootnoteMarkerSpacesInContent(verse.content as Content);
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
 * Drops every empty `text: ""` key alongside another property in one verse
 * file and writes it back if anything changed — same `sortVerseKeys`-on-change
 * shape as {@link mergeUnmergedNodesInFile}, since dropping a key changes
 * which keys a node carries.
 */
async function dropEmptyTextKeysInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = dropEmptyTextKeysInContent(verse.content as Content);
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

/**
 * Deletes every check-14-eligible duplicate footnote anchor in one verse
 * file and writes it back if anything changed — same `sortVerseKeys`-on-change
 * shape as {@link mergeUnmergedNodesInFile}, since deleting a node changes
 * an array's own length and, downstream, which keys its siblings carry once
 * `sortContentKeys` re-derives key order for the changed verse.
 *
 * Runs after {@link dropEmptyTextKeysInFile} in `main()`'s own pass: real
 * KJV1769 Psalm 80:4 is both a husk and a duplicate anchor at once, and by
 * the time this step sees it, the empty `text` key is already gone —
 * {@link isDuplicateFootnoteAnchor} treats an absent `text` and an empty one
 * identically, so the ordering doesn't change *whether* the node is
 * deleted, only that this step always sees the fully-settled key set on
 * every node it compares.
 */
async function removeDuplicateFootnoteAnchorsInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = removeDuplicateFootnoteAnchorsInContent(verse.content as Content);
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

/** One unresolvable-target finding {@link unlinkUnresolvableTargetsInFile} declined to fix, with enough identity to report it. */
interface UnlinkSkip {
  /** Book id the skipped verse belongs to. */
  book: string;
  /** Chapter number of the skipped verse. */
  chapter: number;
  /** Verse number of the skipped verse. */
  verse: number;
  /** Why the unlink was declined. */
  reason: UnlinkSkipReason;
}

/**
 * Unlinks every eligible unresolvable `bibleLink` in one verse file and
 * writes it back if anything changed — same gate-and-report shape as
 * {@link removeDuplicateFootnoteAnchorsInFile}, since
 * {@link unlinkUnresolvableTargetsInContent} carries the identical
 * `{content, changed, skipped}` contract.
 *
 * **Runs after {@link removeDuplicateFootnoteAnchorsInFile} and before
 * {@link mergeEquivalentSiblingsInFile} in `main()`'s own pass — both bounds
 * load-bearing.** It runs after the truncated-range reconstruction and
 * cross-chapter split (steps 4 and 5 of the pass), so it only ever judges a
 * target those steps have already settled, never one a later step would
 * still rewrite. It runs before check 15's merge because unlinking replaces
 * a `bibleLink` node with plain text and can leave two or three adjacent
 * bare strings where there was one node — exactly the shape check 15's merge
 * exists to collapse, in the same pass rather than a hypothetical next run
 * (which the idempotence guard below would catch as a real interaction).
 *
 * Calls `sortVerseKeys` on every changed verse: an unlink can turn a
 * `{bibleLink, content}` object into a bare string or a different node
 * shape entirely, changing which keys the node — and, once
 * `sortContentKeys` re-derives it, the verse — carries.
 */
async function unlinkUnresolvableTargetsInFile(
  filePath: string,
): Promise<{ changed: boolean; skipped: UnlinkSkip[] }> {
  const versionId = path.basename(path.dirname(filePath));
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const skipped: UnlinkSkip[] = [];
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = unlinkUnresolvableTargetsInContent(versionId, verse.content as Content);
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
 * Normalizes every `{text}`-only object into a bare string and merges every
 * check-15-eligible run of adjacent agreeing siblings into one node, in one
 * verse file, and writes it back if anything changed — same
 * `sortVerseKeys`-on-change shape as {@link mergeUnmergedNodesInFile}, since
 * a merge changes an array's own length and can turn an object into a bare
 * string, both of which change which keys a node carries.
 *
 * Runs after {@link removeDuplicateFootnoteAnchorsInFile} in `main()`'s own
 * pass, not before it: deleting a duplicate anchor can leave two plain
 * siblings newly adjacent that weren't before, so this step needs to see the
 * array in its fully-settled shape rather than merge a run that a later
 * deletion would have split differently.
 */
async function mergeEquivalentSiblingsInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = mergeEquivalentSiblingsInContent(verse.content as Content);
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

// ---------------------------------------------------------------------------
// Idempotence guard — proving the auto-fix pass is a fixed point of itself
// ---------------------------------------------------------------------------

/**
 * Re-applies every per-verse content transform the auto-fix pass runs
 * above, in the exact same order, chaining each step's own output into the
 * next — matching how the real pass threads content from file write to
 * file write, not testing every step against the same stale input. Returns
 * the name of every step that still reports a change, in the order they
 * fired; an empty array means this verse really is a fixed point of the
 * whole pass.
 *
 * This is the idempotence guard's own per-verse unit — see {@link
 * checkAutoFixPassIsFixedPoint}, which calls this against every file the
 * pass actually touched, after the pass has already run and (presumably)
 * settled. Factored out so it can be tested directly against a synthetic
 * verse with no file I/O at all.
 *
 * Named per step rather than returning a bare boolean so a failure can
 * point at exactly which step in the pass is still rewriting something —
 * the whole reason this guard exists: two steps that quietly undo each
 * other's work should fail loudly in the run that introduced the
 * interaction, not need a second, manual `npm run validate` to notice. A
 * real, verified instance of exactly this class of interaction exists in
 * check 9's own fixer: relocating a mark-boundary space across a genuine formatting
 * disagreement can leave a new, equally-disagreeing space on the far side
 * of the same boundary, which check 9's own next application then flips
 * straight back (see `fixMarkBoundaryEmbeddedSpaces.ts`'s own doc comment,
 * and this repo's own test coverage for this function).
 *
 * Sort-keys and Prettier formatting are deliberately excluded: neither
 * touches the content tree, so neither can participate in the kind of
 * interaction this guard exists to catch.
 *
 * @param versionId - The version this verse belongs to — needed by the
 *   cross-chapter and truncated-range steps, which read a version-wide
 *   chapter-length index.
 * @param verse - One already-fixed verse record to re-check.
 */
export function findResidualContentChanges(
  versionId: string,
  verse: VerseRecord,
): string[] {
  const residualSteps: string[] = [];
  let content = verse.content;

  const applyStep = (
    name: string,
    transform: (content: Content) => { content: Content; changed: boolean },
  ): void => {
    const result = transform(content);
    content = result.content;
    if (result.changed) residualSteps.push(name);
  };

  applyStep("bibleLink dash normalization", (c) => normalizeBibleLinkDashesInContent(c));
  applyStep("truncated-range reconstruction", (c) => reconstructTruncatedRangesInContent(versionId, c));
  applyStep("cross-chapter bibleLink split", (c) => {
    const result = splitCrossChapterLinksInContent(versionId, c);
    return { content: result.content, changed: result.splits > 0 };
  });
  applyStep("fraction normalization", (c) => normalizeFractionsInContent(c));
  applyStep("ellipsis normalization", (c) => normalizeEllipsesInContent(c));
  applyStep("script-run tagging (check 13)", (c) => tagScriptRunsInContent(c));
  applyStep("unmerged-node merge (check 1)", (c) => mergeUnmergedNodesInContent(c));
  applyStep("footnote punctuation reorder (check 8)", (c) => reorderFootnotePunctuationInContent(c));
  applyStep("mark-boundary space relocation (check 9)", (c) => relocateMarkBoundarySpacesInContent(c));
  applyStep("footnote-marker spacing relocation (check 12)", (c) => relocateFootnoteMarkerSpacesInContent(c));
  applyStep("empty text key drop", (c) => dropEmptyTextKeysInContent(c));
  applyStep("duplicate footnote anchor removal (check 14)", (c) => removeDuplicateFootnoteAnchorsInContent(c));
  applyStep("unresolvable bibleLink target unlink (G4)", (c) => {
    const result = unlinkUnresolvableTargetsInContent(versionId, c);
    return { content: result.content, changed: result.changed };
  });
  applyStep("equivalent sibling merge (check 15)", (c) => mergeEquivalentSiblingsInContent(c));

  const headingResult = addMissingHeadingParagraphsInVerse({ ...verse, content });
  if (headingResult.changed) residualSteps.push("heading/subtitle paragraph flag (check 6)");

  return residualSteps;
}

/** One verse where {@link findResidualContentChanges} still found something to change, with enough identity to report it. */
interface FixedPointFailure {
  /** The verse file this failure belongs to (e.g. `bible-versions/YLT1898/66-REV.json`). */
  file: string;
  /** The book id this failure belongs to (e.g. `REV`). */
  book: string;
  /** The chapter number this failure belongs to. */
  chapter: number;
  /** The verse number this failure belongs to. */
  verse: number;
  /** Every step name {@link findResidualContentChanges} reported for this verse, in the order they fired. */
  steps: string[];
}

/**
 * After the auto-fix pass finishes, re-runs {@link
 * findResidualContentChanges} against every verse in every file the pass
 * actually changed — entirely in memory, nothing here writes to disk. On a
 * settled corpus this is free: `changedFiles` is empty, so the loop below
 * never executes and nothing is even re-read.
 *
 * @param changedFiles - Every verse-file path the pass wrote to, exactly as
 *   {@link main} determines it (a before/after snapshot compare, not a
 *   changed-files set threaded through each of the pass's own fourteen
 *   loops — see {@link main}'s own doc comment for why).
 */
function checkAutoFixPassIsFixedPoint(
  changedFiles: readonly string[],
): FixedPointFailure[] {
  const failures: FixedPointFailure[] = [];

  for (const file of changedFiles) {
    const versionId = path.basename(path.dirname(file));
    const verses = JSON.parse(fs.readFileSync(file, "utf-8")) as VerseRecord[];

    for (const verse of verses) {
      const steps = findResidualContentChanges(versionId, verse);
      if (steps.length > 0) {
        failures.push({ file, book: verse.book, chapter: verse.chapter, verse: verse.verse, steps });
      }
    }
  }

  return failures;
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
 * leaks into the surrounding text), and an empty `text: ""` husk. The husk
 * check is not limited to a node whose *sole* key is `text` — real KJV1769
 * corpus data carries the wider shape too, an empty text riding alongside
 * whatever else the node still carries: Psalm 80:4's `{text: "", foot:
 * {...}}` and Proverbs 10:10's `{text: "", break: true, foot: {...}}`. Both
 * render nothing, `foot`/`break` present or not, so both are flagged the
 * same way `{text: ""}` alone already was.
 *
 * A node with **no `text` key at all** — `foot`, `strong`, `bibleLink`, bare
 * `paragraph`/`break` flags, any combination of them — is meaningful on its
 * own and never flagged here; the schema gap this closes is specifically an
 * empty *string*, not an absent key. Whitespace counts as text. Recurses
 * into every content-bearing branch (`foot.content`, subtitles, headings),
 * since either defect shape can appear nested, not just at the top level.
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
        (Object.keys(properties).length === 0 || "text" in properties)
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
 * Drops an empty `text: ""` key from a node that carries something else
 * alongside it — the always-safe half of the husk shape {@link
 * findMeaninglessContentNodes} reports (see its own doc comment for the real
 * corpus shapes this covers). The node keeps every property it had except
 * the empty string, which renders nothing and never carried meaning of its
 * own.
 *
 * **Deliberately narrower than the check it mirrors.** A node whose *only*
 * property is an empty `text` (`{text: ""}`), or that carries no properties
 * at all (`{}`), is left untouched — dropping the key there would leave
 * nothing behind to keep, which is a different question (delete the whole
 * node) than this transform answers. {@link findMeaninglessContentNodes}
 * still reports either shape if it ever appears, unaffected by this
 * function.
 *
 * Mirrors {@link findMeaninglessContentNodes}'s own recursion exactly —
 * `content`/`heading`/`subtitle`/a non-boolean `paragraph` are mutually
 * exclusive branches, and `foot.content` is always walked in addition —
 * so this fixes a husk everywhere the detector can find one.
 *
 * @param content - A verse's content tree
 * @returns The rewritten tree (the original reference when nothing changed) and whether anything did
 */
export function dropEmptyTextKeysInContent(
  content: Content
): { content: Content; changed: boolean } {
  const rewrite = (node: unknown): { node: unknown; changed: boolean } => {
    if (Array.isArray(node)) {
      let changed = false;
      const rewritten = node.map((child) => {
        const result = rewrite(child);
        if (result.changed) changed = true;
        return result.node;
      });
      return changed ? { node: rewritten, changed: true } : { node, changed: false };
    }
    if (node === null || typeof node !== "object") return { node, changed: false };

    let properties = node as Record<string, unknown>;
    let changed = false;

    const branch =
      CONTENT_BRANCHES.find((key) => key in properties) ??
      ("paragraph" in properties && typeof properties.paragraph !== "boolean"
        ? "paragraph"
        : undefined);

    if (branch) {
      const result = rewrite(properties[branch]);
      if (result.changed) {
        properties = { ...properties, [branch]: result.node };
        changed = true;
      }
    } else if (
      "text" in properties &&
      properties.text === "" &&
      Object.keys(properties).length > 1
    ) {
      const { text: _text, ...rest } = properties;
      properties = rest;
      changed = true;
    }

    const foot = properties.foot;
    if (foot && typeof foot === "object") {
      const result = rewrite((foot as { content?: unknown }).content);
      if (result.changed) {
        properties = { ...properties, foot: { ...foot, content: result.node } };
        changed = true;
      }
    }

    return changed ? { node: properties, changed: true } : { node, changed: false };
  };

  const result = rewrite(content);
  return result.changed
    ? { content: result.node as Content, changed: true }
    : { content, changed: false };
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

/** One book whose `_version.json`-declared chapter count disagrees with the chapters its own verse file actually carries. */
export interface DeclaredChapterMismatch {
  /** Repo book id, e.g. `"EST"`. */
  book: string;
  /** The chapter count this version's own `_version.json` declares for `book`. */
  declaredChapters: number;
  /** The highest chapter number actually present in `book`'s own verse file (`0` when the file is missing or empty — the existing file-existence check already names a missing file separately, but this comparator still reports the mismatch rather than skipping it silently). */
  highestChapterPresent: number;
}

/**
 * Compare each book's declared chapter count against the highest chapter its
 * own verse file actually carries — corpus *completeness*, not merely
 * validity. `verify.ts` already asks this question for a USFM import
 * (`counts.maxChapter !== book.chapters`), but nothing asked it of a version
 * imported any other way until now.
 *
 * Reports a mismatch in **either** direction — the metadata is equally wrong
 * whether the file falls short of, or exceeds, what it declares. The two real
 * corpus findings this exists for are both "falls short": CLV1880's `EST`
 * (highest chapter 10, declares 16) and `DAN` (highest chapter 12, declares
 * 14), both missing that edition's own deuterocanonical additions. Per this
 * repo's own settled decision, the declared counts are **not** corrected
 * downward to match — see `_specs/ai-context/4-domains/bible-versions.md` for
 * the full reasoning. `npm run validate` is expected to report exactly these
 * two findings, and only these two, until that content is imported.
 *
 * A pure comparison with no file I/O of its own — the caller (`main()`'s own
 * per-version loop, which already has `books` in scope from validating book
 * ordering) reads `_version.json` and each book's own verse file and passes
 * both in, rather than this function re-reading either.
 *
 * @param books - One version's own `books` array, exactly as read from its
 *   `_version.json` — declared chapter counts live here.
 * @param highestChapterByBook - Repo book id -> highest chapter number found
 *   in that book's own verse file.
 * @returns One entry per book whose declared count disagrees with what its
 *   file carries, in `books`' own order — empty when every declared count
 *   matches.
 */
export function findDeclaredChapterMismatches(
  books: readonly VersionBook[],
  highestChapterByBook: ReadonlyMap<string, number>,
): DeclaredChapterMismatch[] {
  const mismatches: DeclaredChapterMismatch[] = [];
  for (const book of books) {
    const highestChapterPresent = highestChapterByBook.get(book._id) ?? 0;
    if (highestChapterPresent !== book.chapters) {
      mismatches.push({ book: book._id, declaredChapters: book.chapters, highestChapterPresent });
    }
  }
  return mismatches;
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
 * requested. The auto-fix pass runs seventeen steps, in order: sort verse
 * keys, format JSON files, normalize `bibleLink` dashes, reconstruct
 * truncated `bibleLink` ranges, split cross-chapter `bibleLink` ranges,
 * normalize fractions, normalize ellipses, tag untagged script runs (check
 * 13), merge unmerged node pairs (check 1), reorder footnote punctuation
 * (check 8), relocate mark-boundary embedded spaces (check 9), relocate
 * footnote-marker spacing (check 12), drop empty text keys, remove
 * duplicate footnote anchors (check 14), unlink unresolvable `bibleLink`
 * targets, merge equivalent siblings (check 15), and add missing
 * heading/subtitle paragraph flags (check 6).
 *
 * The ordering is deliberate. Dashes settle before the truncated-range and
 * cross-chapter steps look for the separator; a reconstructed truncated
 * range runs before the cross-chapter split so a range that turns out to
 * span two chapters gets split on the very next step rather than left for a
 * later run; and both consume a range before the text-only fractions,
 * ellipses, and script-run steps see the same nodes. Check 13 runs last
 * among the text-shaped steps and before the structural checks: splitting a
 * node into several siblings is itself a structural change, so it needs to
 * see fractions and ellipses already normalized in the text it's about to
 * split, and the structural checks after it need to see the split nodes it
 * produces rather than the single pre-split node. Checks 1, 8, 9, and 12 run
 * next, in that order, because check 1's merge is the coarsest structural
 * change (so it precedes the finer-grained checks 8 and 9); check 12 runs
 * immediately after check 9 because check 9's own relocation settles which
 * node owns a boundary space, and check 12 needs to see that settled state
 * rather than relocate a space check 9 was about to move a second time.
 * Dropping empty text keys, check 14's removal, the unresolvable-target
 * unlink, and check 15's merge run immediately after check 12 and before check 6, in that
 * order: check 12 must settle every node's own space before either of the
 * first two can decide whether a node renders anything, since deleting a
 * node here changes which neighbor a *later* run of check 12 would relocate
 * a space onto; the empty-text-key drop runs first so check 14 always
 * compares nodes whose own key set is already fully settled, even though
 * {@link isDuplicateFootnoteAnchor} treats an absent `text` and an empty one
 * identically either way (real KJV1769 Psalm 80:4 is both a husk and a
 * duplicate anchor on the same node, and loses both in this one pass
 * regardless of which of the two runs first). **The unresolvable-target
 * unlink runs after check 14's removal and before check 15's merge, and both bounds are
 * load-bearing.** It must run after the truncated-range reconstruction and
 * the cross-chapter split (steps 4 and 5, far earlier in this same pass) so
 * it only ever judges a target those steps have already settled, never one a
 * later step would still rewrite. It must run before check 15's merge
 * because unlinking replaces a `bibleLink` node with plain text — the real
 * ASV1901 Mark 9:44 shape leaves three adjacent bare strings where a
 * resolvable link, the unlinked link, and more text used to sit — and check
 * 15's own merge is what collapses that in the same pass rather than a
 * hypothetical next run, which the idempotence guard below would catch as
 * a real step interaction if the ordering were wrong. Check
 * 15 runs after check 14's removal for the identical reason it runs after
 * the unresolvable-target unlink: either step can leave two plain siblings newly adjacent
 * that only check 15's own merge should fold together. Check 6 runs last because it's additive
 * and touches a node class none of the others do. Checks 13, 1, 8, 9, the
 * empty-text-key drop, check 14, the unresolvable-target unlink, check 15, and check 6 call
 * `sortVerseKeys` on every changed verse, unlike the steps before check 13,
 * since splitting, merging, reordering, relocating, dropping a key, deleting
 * a node, unlinking, and flagging can all change which keys a node carries.
 * Check 12 doesn't need it either, for the same reason the truncated-range,
 * cross-chapter, and text-only steps don't — see {@link
 * reconstructTruncatedRangesInFile}: it only ever mutates an existing `text`
 * string's value in place.
 *
 * **Immediately after the auto-fix pass, before any schema/structure check,
 * `main` proves the pass is a fixed point of itself.** A before/after
 * byte snapshot of every verse file (taken once, before the sort-keys step)
 * names exactly which files the seventeen steps above actually touched; only
 * those files get re-checked, by re-running {@link
 * findResidualContentChanges}'s own chain of the pass's per-verse content
 * transforms against their already-fixed content, entirely in memory. On a
 * settled corpus nothing changed, so nothing is even re-read. The moment two
 * steps interact — one step's fix recreating a shape an earlier step would
 * rewrite again — this fails the run that introduced the interaction, naming
 * the file, the verse, and the step, rather than needing a second, manual
 * `npm run validate` to notice.
 *
 * After that, `main` checks bible-books, each version's `_version.json`,
 * book ordering, and every verse file's schema and content, then runs five
 * report-only audits: declared chapter counts, cross-chapter links,
 * truncated ranges, node conventions, and unresolvable `bibleLink` targets
 * — exiting non-zero on the first phase that fails.
 *
 * **The report-only audits run after the fix pass on purpose.** Checks 8, 9,
 * 12, and 13, the truncated-range reconstruction, and the unresolvable-target
 * unlink each have a gate that can decline a real finding rather than guess at it.
 * Whatever a gate declines is still on disk when the audit re-reads it, so
 * the run still fails with detail — the "report what it can't fix" half of
 * the contract falls out of the ordering alone, with no extra code needed to
 * enforce it.
 *
 * The schema/structure phases are hierarchical: each assumes the earlier
 * ones held, so a failure exits immediately. The five corpus-wide audits
 * that run last (the declared-chapter check, `crossChapterLinks.ts`'s
 * three checks, and `auditNodes.ts`) have no such dependency on each other,
 * so all five always run to completion before `main` exits non-zero — a
 * version failing one still gets audited by the others in the same pass,
 * rather than needing a second run to find out. **This is why the
 * declared-chapter mismatches are collected during the book-ordering loop,
 * far earlier in this function, but not reported or gated until here**:
 * those mismatches are a permanently accepted finding (see
 * bible-versions.md), and gating on them the moment they're found — the way
 * a duplicate order number or a numbering gap already does, immediately
 * after that same loop — would exit before the schema/verse checks and the
 * other four audits ever ran, making it impossible for a later run to tell
 * the accepted findings apart from a real regression hiding behind an
 * early exit.
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

  const jsonFiles = collectJsonFiles(versionDirs);

  // Snapshot every verse file's own raw bytes before the auto-fix pass
  // touches anything, so the idempotence guard below can tell which files
  // the pass actually changed without threading a changed-files set through
  // all fourteen of the pass's own loops — see {@link
  // checkAutoFixPassIsFixedPoint}'s own doc comment.
  const verseFilesInScope = jsonFiles.filter((file) => fs.existsSync(file) && isVerseFile(file));
  const preFixPassSnapshot = new Map<string, string>();
  for (const file of verseFilesInScope) {
    preFixPassSnapshot.set(file, fs.readFileSync(file, "utf-8"));
  }

  console.log("🔑 Sorting keys in verse files...\n");

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

  console.log("🈯 Tagging untagged script runs (check 13)...\n");

  let scriptRunsTaggedCount = 0;
  const untaggedScriptRunsSkipped: UntaggedScriptRunSkip[] = [];

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const { changed, skipped } = await tagScriptRunsInFile(file);
      if (changed) {
        scriptRunsTaggedCount++;
        console.log(`  🔄 Tagged script runs: ${file}`);
      }
      untaggedScriptRunsSkipped.push(...skipped);
    }
  }

  if (scriptRunsTaggedCount > 0) {
    console.log(`\n✅ Tagged script runs in ${scriptRunsTaggedCount} file(s)\n`);
  } else {
    console.log("✅ No untagged script runs found\n");
  }
  if (untaggedScriptRunsSkipped.length > 0) {
    console.log(`⚠️  ${untaggedScriptRunsSkipped.length} untagged-script-run finding(s) left for the audit below to report:`);
    for (const skip of untaggedScriptRunsSkipped) {
      console.log(`    ${skip.book} ${skip.chapter}:${skip.verse} skipped — ${skip.reason}`);
    }
    console.log("");
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

  console.log("🔖 Relocating footnote-marker spacing (check 12)...\n");

  let footnoteMarkerSpacingFixedCount = 0;
  const footnoteMarkerSpacingSkipped: FootnoteMarkerSpacingSkip[] = [];

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const { changed, skipped } = await relocateFootnoteMarkerSpacesInFile(file);
      if (changed) {
        footnoteMarkerSpacingFixedCount++;
        console.log(`  🔄 Relocated footnote-marker spacing: ${file}`);
      }
      footnoteMarkerSpacingSkipped.push(...skipped);
    }
  }

  if (footnoteMarkerSpacingFixedCount > 0) {
    console.log(`\n✅ Relocated footnote-marker spacing in ${footnoteMarkerSpacingFixedCount} file(s)\n`);
  } else {
    console.log("✅ No footnote-marker spacing to relocate\n");
  }
  if (footnoteMarkerSpacingSkipped.length > 0) {
    console.log(`⚠️  ${footnoteMarkerSpacingSkipped.length} footnote-marker-spacing finding(s) left for the audit below to report:`);
    for (const skip of footnoteMarkerSpacingSkipped) {
      console.log(`    ${skip.book} ${skip.chapter}:${skip.verse} skipped — ${skip.reason}`);
    }
    console.log("");
  }

  console.log("🗑️  Dropping empty text keys...\n");

  let emptyTextKeysDroppedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasFixed = await dropEmptyTextKeysInFile(file);
      if (wasFixed) {
        emptyTextKeysDroppedCount++;
        console.log(`  🔄 Dropped empty text key(s): ${file}`);
      }
    }
  }

  if (emptyTextKeysDroppedCount > 0) {
    console.log(`\n✅ Dropped empty text key(s) in ${emptyTextKeysDroppedCount} file(s)\n`);
  } else {
    console.log("✅ No empty text keys to drop\n");
  }

  console.log("🔖 Removing duplicate footnote anchors (check 14)...\n");

  let duplicateFootnoteAnchorsRemovedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasFixed = await removeDuplicateFootnoteAnchorsInFile(file);
      if (wasFixed) {
        duplicateFootnoteAnchorsRemovedCount++;
        console.log(`  🔄 Removed duplicate footnote anchor(s): ${file}`);
      }
    }
  }

  if (duplicateFootnoteAnchorsRemovedCount > 0) {
    console.log(`\n✅ Removed duplicate footnote anchor(s) in ${duplicateFootnoteAnchorsRemovedCount} file(s)\n`);
  } else {
    console.log("✅ No duplicate footnote anchors to remove\n");
  }

  console.log("🔓 Unlinking unresolvable bibleLink targets (G4)...\n");

  let unresolvableTargetsUnlinkedCount = 0;
  const unlinkSkipped: UnlinkSkip[] = [];

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const { changed, skipped } = await unlinkUnresolvableTargetsInFile(file);
      if (changed) {
        unresolvableTargetsUnlinkedCount++;
        console.log(`  🔄 Unlinked unresolvable bibleLink target(s): ${file}`);
      }
      unlinkSkipped.push(...skipped);
    }
  }

  if (unresolvableTargetsUnlinkedCount > 0) {
    console.log(`\n✅ Unlinked unresolvable bibleLink target(s) in ${unresolvableTargetsUnlinkedCount} file(s)\n`);
  } else {
    console.log("✅ No unresolvable bibleLink targets found\n");
  }
  if (unlinkSkipped.length > 0) {
    console.log(`⚠️  ${unlinkSkipped.length} unresolvable-target finding(s) left for the audit below to report:`);
    for (const skip of unlinkSkipped) {
      console.log(`    ${skip.book} ${skip.chapter}:${skip.verse} skipped — ${skip.reason}`);
    }
    console.log("");
  }

  console.log("🔗 Merging equivalent siblings (check 15)...\n");

  let mergeEquivalentSiblingsCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasFixed = await mergeEquivalentSiblingsInFile(file);
      if (wasFixed) {
        mergeEquivalentSiblingsCount++;
        console.log(`  🔄 Merged equivalent sibling(s): ${file}`);
      }
    }
  }

  if (mergeEquivalentSiblingsCount > 0) {
    console.log(`\n✅ Merged equivalent sibling(s) in ${mergeEquivalentSiblingsCount} file(s)\n`);
  } else {
    console.log("✅ No equivalent siblings to merge\n");
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

  console.log("🪞 Checking the auto-fix pass is a fixed point of itself...\n");

  const changedFiles = verseFilesInScope.filter(
    (file) => fs.readFileSync(file, "utf-8") !== preFixPassSnapshot.get(file),
  );
  const fixedPointFailures = checkAutoFixPassIsFixedPoint(changedFiles);

  if (fixedPointFailures.length > 0) {
    console.error(
      `\n❌ Auto-fix pass is not a fixed point of itself — ${fixedPointFailures.length} verse(s) would still change on a second pass:`
    );
    for (const failure of fixedPointFailures) {
      console.error(
        `  ${failure.book} ${failure.chapter}:${failure.verse} (${failure.file}) — ${failure.steps.join(", ")}`
      );
    }
    console.error(
      "\nTwo (or more) of the steps above are undoing each other's work. Investigate the interaction named for each verse rather than absorbing it — see findResidualContentChanges's own doc comment."
    );
    process.exit(1);
  } else if (changedFiles.length > 0) {
    console.log(`✅ Re-checked ${changedFiles.length} changed file(s) — the auto-fix pass is a fixed point of itself\n`);
  } else {
    console.log("✅ No files changed in the auto-fix pass — nothing to re-check\n");
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

  // Declared-vs-actual chapter counts — collected here, alongside the
  // order checks below, because this loop already has each version's own
  // `books` array (with its declared `chapters` per book) in scope; opening
  // `_version.json` a second time to get it again would be redundant. Not
  // printed or gated here: unlike a duplicate/gap/start-at-1 violation, a
  // declared-chapter mismatch is this repo's one permanently accepted
  // finding (see bible-versions.md) and must never block the schema/verse
  // checks or the other trailing audits below from running to completion —
  // reported and gated as its own trailing audit, further down, alongside
  // the cross-chapter, truncated-range, node-convention, and
  // unresolvable-target audits.
  const declaredChapterMismatchesByVersion = new Map<string, DeclaredChapterMismatch[]>();

  for (const version of versions) {
    const versionBooks = version.books || [];
    if (versionBooks.length === 0) {
      console.log(`✅ ${version._id}: no books specified`);
      continue;
    }

    const highestChapterByBook = new Map<string, number>();
    for (const book of versionBooks) {
      const bookFilePath = `${bibleVersionsDir}/${version._id}/${book.order.toString().padStart(2, "0")}-${book._id}.json`;
      if (!fs.existsSync(bookFilePath)) continue; // reported separately by the file-existence check below
      const bookVerses = JSON.parse(fs.readFileSync(bookFilePath, "utf-8")) as { chapter: number }[];
      let highestChapter = 0;
      for (const verse of bookVerses) {
        if (verse.chapter > highestChapter) highestChapter = verse.chapter;
      }
      highestChapterByBook.set(book._id, highestChapter);
    }
    declaredChapterMismatchesByVersion.set(version._id, findDeclaredChapterMismatches(versionBooks, highestChapterByBook));

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

  // Declared-chapter-count audit (report-only): every book whose
  // `_version.json` declares a chapter count its own verse file does not
  // actually carry. No check can supply missing chapters, so this only
  // reports; permanently accepted findings are tracked in
  // bible-versions.md. Uses the mismatches the book-ordering loop above
  // already computed, rather than re-reading `_version.json` or any verse
  // file a second time.
  console.log("\n📐 Auditing declared chapter counts...");
  let declaredChapterMismatchesPassed = true;

  for (const versionDir of versionDirs) {
    const mismatches = declaredChapterMismatchesByVersion.get(versionDir) ?? [];
    if (mismatches.length === 0) {
      console.log(`✅ ${versionDir}: every declared chapter count matches its file`);
      continue;
    }

    console.error(`❌ ${versionDir}: ${mismatches.length} book(s) whose declared chapter count disagrees with the chapters its file actually carries:`);
    for (const mismatch of mismatches) {
      console.error(`  ${versionDir} ${mismatch.book}: highest chapter ${mismatch.highestChapterPresent}, _version.json declares ${mismatch.declaredChapters}`);
    }
    declaredChapterMismatchesPassed = false;
  }

  // Cross-chapter bibleLink audit: every unsplit range still in this
  // version's content. Report-only — see the auto-fix pass above and
  // crossChapterLinks.ts for the split rule.
  //
  // Prints each version's own `scanned` count — findCrossChapterLinks
  // already returns it, so a walk that silently stops descending is caught
  // rather than under-reporting a clean bill of health. A dropped number
  // here is a real regression to investigate, the same way a third
  // node-convention finding below would be.
  console.log("\n🔗 Auditing cross-chapter bibleLink targets...");
  let crossChapterLinksPassed = true;
  let crossChapterLinksScanned = 0;

  for (const versionDir of versionDirs) {
    const { findings, scanned } = findCrossChapterLinks(versionDir);
    crossChapterLinksScanned += scanned;
    if (findings.length === 0) {
      console.log(`✅ ${versionDir}: no unsplit cross-chapter links (${scanned} bibleLink node(s) scanned)`);
      continue;
    }

    console.error(`❌ ${versionDir}: ${findings.length} unsplit cross-chapter link(s) (${scanned} bibleLink node(s) scanned):`);
    for (const finding of findings) {
      console.error(`  ${formatCrossChapterFinding(finding)}`);
    }
    crossChapterLinksPassed = false;
  }
  console.log(`   ${crossChapterLinksScanned} bibleLink node(s) scanned corpus-wide`);

  // Truncated-range audit: every bibleLink target still short of the range
  // its own display names — a different finding from the unsplit-range one
  // above (see crossChapterLinks.ts). Report-only, for the same reason, and
  // prints its own `scanned` count for the identical reason.
  console.log("\n📏 Auditing truncated bibleLink ranges...");
  let truncatedRangesPassed = true;
  let truncatedRangesScanned = 0;

  for (const versionDir of versionDirs) {
    const { findings, scanned } = findTruncatedRanges(versionDir);
    truncatedRangesScanned += scanned;
    if (findings.length === 0) {
      console.log(`✅ ${versionDir}: no truncated bibleLink ranges (${scanned} bibleLink node(s) scanned)`);
      continue;
    }

    console.error(`❌ ${versionDir}: ${findings.length} truncated bibleLink range(s) (${scanned} bibleLink node(s) scanned):`);
    for (const finding of findings) {
      console.error(`  ${formatTruncatedRangeFinding(finding)}`);
    }
    truncatedRangesPassed = false;
  }
  console.log(`   ${truncatedRangesScanned} bibleLink node(s) scanned corpus-wide`);

  // Node-placement and content-convention audit: the sixteen checks
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

  // Unresolvable-target audit: every bibleLink target that does not resolve
  // against its own version's real chapter/verse data. The gated unlink
  // step above already ran automatically — a finding surviving here means
  // it declined (an empty override), which the console output from that
  // step already named. Fourth peer audit alongside the three above —
  // depends on neither them nor anything upstream, so it always runs to
  // completion regardless of their outcome. Prints its own `scanned` count,
  // matching the cross-chapter and truncated-range audits above.
  console.log("\n🔓 Auditing unresolvable bibleLink targets...");
  let unresolvableTargetsPassed = true;
  let unresolvableTargetsScanned = 0;

  for (const versionDir of versionDirs) {
    const { findings, scanned } = findUnresolvableTargets(versionDir);
    unresolvableTargetsScanned += scanned;
    if (findings.length === 0) {
      console.log(`✅ ${versionDir}: no unresolvable bibleLink targets (${scanned} bibleLink node(s) scanned)`);
      continue;
    }

    console.error(`❌ ${versionDir}: ${findings.length} unresolvable bibleLink target(s) (${scanned} bibleLink node(s) scanned):`);
    for (const finding of findings) {
      console.error(`  ${formatUnresolvableTargetFinding(finding)}`);
    }
    unresolvableTargetsPassed = false;
  }
  console.log(`   ${unresolvableTargetsScanned} bibleLink node(s) scanned corpus-wide`);

  if (
    !declaredChapterMismatchesPassed ||
    !crossChapterLinksPassed ||
    !truncatedRangesPassed ||
    !nodeConventionsPassed ||
    !unresolvableTargetsPassed
  ) {
    if (!declaredChapterMismatchesPassed) {
      console.error("\n❌ Declared chapter count audit failed! This repo's own settled decision leaves exactly two CLV1880 findings (EST, DAN) standing until that edition's deuterocanonical additions are imported — see bible-versions.md. A finding for any other book, or any other version, is a real regression, not this accepted state.");
    }
    if (!crossChapterLinksPassed) {
      console.error("\n❌ Cross-chapter link audit failed! The split step above already ran automatically — a finding surviving here means it genuinely could not be split. See the findings printed above for detail.");
    }
    if (!truncatedRangesPassed) {
      console.error("\n❌ Truncated bibleLink range audit failed! The reconstruction step above already ran automatically — a finding surviving here means it declined the completion (a display range spanning two chapters, which the cross-chapter split owns instead). See the findings printed above for detail.");
    }
    if (!nodeConventionsPassed) {
      console.error("\n❌ Node/content convention audit failed! Checks 1, 6, 8, 9, 12, 13, 14, and 15 already ran their own auto-fix above — see the findings printed above for what's left and why (a gate declined it, or it's one of the report-only checks with no fixer at all).");
    }
    if (!unresolvableTargetsPassed) {
      console.error("\n❌ Unresolvable bibleLink target audit failed! The unlink step above already ran automatically — a finding surviving here means it declined (an override present but empty). See the findings printed above for detail.");
    }
    process.exit(1);
  }

  console.log("\n✅ Cross-chapter link, truncated bibleLink range, node/content convention, and unresolvable-target audits all passed!");
}

// Guard so importing this module (e.g. from tests) doesn't also run main()
// and call process.exit
if (require.main === module) {
  main(process.argv[2]).catch((error) => {
    console.error("Validation failed with error:", error);
    process.exit(1);
  });
}
