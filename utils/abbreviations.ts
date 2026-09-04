/**
 * Abbreviation-registry audit: every `{ abbr }` content node in a version
 * must name an entry in that same version's own `abbr` array.
 *
 * Registries are per-version by design, never shared, because the same short
 * code means different things in different editions (one version's `MT` is
 * the Masoretic Text, another's the Majority Text). That makes an unresolved
 * id a real error rather than a lookup that should fall through somewhere
 * else: the exporter prints the bare id and the reader has no description to
 * show, so nothing downstream can recover from it.
 */

import fs from "fs";
import path from "path";
import BibleVersion, { Abbreviation } from "../types/Version";

/** One `{ abbr }` node naming an id its version's registry does not define. */
export interface UnknownAbbreviationFinding {
  /** Book file the node sits in, e.g. `"01-MAT.json"`. */
  file: string;
  /** Book id from the verse record, e.g. `"MAT"`. */
  book: string;
  /** Chapter number of the verse carrying the node. */
  chapter: number;
  /** Verse number of the verse carrying the node. */
  verse: number;
  /** The unresolved id as written in the content. */
  id: string;
}

/** An `_id` more than one entry in the same registry claims. */
export interface DuplicateAbbreviationFinding {
  /** The repeated id. */
  id: string;
  /** How many entries claim it. */
  count: number;
}

/** What {@link findUnknownAbbreviations} found in one version. */
export interface AbbreviationAudit {
  /** `{ abbr }` nodes naming an id the registry does not define. */
  findings: UnknownAbbreviationFinding[];
  /** Registry entries sharing an `_id` with another entry. */
  duplicates: DuplicateAbbreviationFinding[];
  /** How many `{ abbr }` nodes the walk visited, so a walk that silently stops descending shows up as a dropped count rather than a clean bill of health. */
  scanned: number;
}

/** The ids a version's registry defines, and any it defines more than once. */
function readRegistry(versionDir: string): {
  ids: Set<string>;
  duplicates: DuplicateAbbreviationFinding[];
} {
  const versionPath = path.join(versionDir, "_version.json");
  if (!fs.existsSync(versionPath)) return { ids: new Set(), duplicates: [] };

  const version: BibleVersion = JSON.parse(fs.readFileSync(versionPath, "utf-8"));
  const counts = new Map<string, number>();
  for (const entry of version.abbr ?? ([] as Abbreviation[])) {
    counts.set(entry._id, (counts.get(entry._id) ?? 0) + 1);
  }

  return {
    ids: new Set(counts.keys()),
    duplicates: [...counts]
      .filter(([, count]) => count > 1)
      .map(([id, count]) => ({ id, count })),
  };
}

/**
 * Every `abbr` id inside one content tree, in document order. Descends
 * through the same places a footnote body can hide: nested `content`, a
 * heading's or subtitle's own content, a `bibleLink`'s display override, and
 * any `foot.content`.
 */
function collectIds(content: unknown, into: string[]): void {
  if (content === null || typeof content !== "object") return;

  if (Array.isArray(content)) {
    for (const item of content) collectIds(item, into);
    return;
  }

  const record = content as Record<string, unknown>;
  if (typeof record.abbr === "string") into.push(record.abbr);

  for (const key of ["content", "heading", "subtitle", "paragraph"]) {
    if (typeof record[key] === "object") collectIds(record[key], into);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) collectIds(foot.content, into);
}

/**
 * Audits one version folder's `{ abbr }` nodes against its own registry.
 *
 * @param versionDir - Absolute or repo-relative path to a `bible-versions/<VERSION>` folder
 */
export function findUnknownAbbreviations(versionDir: string): AbbreviationAudit {
  const { ids, duplicates } = readRegistry(versionDir);
  const findings: UnknownAbbreviationFinding[] = [];
  let scanned = 0;

  const files = fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".json") && file !== "_version.json")
    .sort();

  for (const file of files) {
    const verses = JSON.parse(fs.readFileSync(path.join(versionDir, file), "utf-8"));
    if (!Array.isArray(verses)) continue;

    for (const verse of verses) {
      const found: string[] = [];
      collectIds(verse.content, found);
      scanned += found.length;
      for (const id of found) {
        if (ids.has(id)) continue;
        findings.push({
          file,
          book: verse.book,
          chapter: verse.chapter,
          verse: verse.verse,
          id,
        });
      }
    }
  }

  return { findings, duplicates, scanned };
}

/** One finding as a single console line. */
export function formatUnknownAbbreviation(finding: UnknownAbbreviationFinding): string {
  return `${finding.book} ${finding.chapter}:${finding.verse} (${finding.file}): no registry entry for "${finding.id}"`;
}

/**
 * Registry ids by version directory, memoized for a whole run the same way
 * `crossChapterLinks.ts` memoizes its per-version chapter index: a caller
 * asking once per verse should not re-read and re-parse `_version.json`
 * thousands of times. Nothing in this repo writes `_version.json` while
 * content is being rewritten, so a cached answer cannot go stale mid-run.
 */
const registeredIdCache = new Map<string, ReadonlySet<string>>();

/**
 * Every abbreviation id one version's own registry defines, for a caller
 * that needs to know whether a short code resolves in this version before
 * writing an `{ abbr }` node that cites it.
 *
 * The registry lives here rather than in each caller because an id resolves
 * only within its own version — see this module's own doc comment — so
 * "is this a real siglum?" is never a question a version-agnostic caller can
 * answer for itself.
 *
 * @param versionDir - Absolute or repo-relative path to a `bible-versions/<VERSION>` folder
 * @returns The ids defined, or an empty set for a version declaring no registry
 */
export function registeredAbbreviationIds(versionDir: string): ReadonlySet<string> {
  const cached = registeredIdCache.get(versionDir);
  if (cached !== undefined) return cached;

  const { ids } = readRegistry(versionDir);
  registeredIdCache.set(versionDir, ids);
  return ids;
}
