import BibleVersion from "../../types/Version";
import { tokenize } from "./tokenize";

/** One book's metadata as `_version.json` needs it — `_id` already resolved to this repo's own registry convention (see {@link resolveBookId}). */
export interface BookMetadata {
  /** This repo's own registry book id (already resolved, never the raw USFM `\id`). */
  readonly _id: string;
  /** Book display name, from the USFM front matter's `\h` marker. */
  readonly name: string;
  /** Book title, from the USFM front matter's `\toc1` marker. */
  readonly title: string;
  /** Highest chapter number the USFM source declares. */
  readonly chapters: number;
}

/**
 * Standard USFM/Paratext 3-letter book codes that differ from this repo's
 * own `bible-books.json` registry codes for the same book — 17 of the 66
 * canonical books. The divergence traces to this repo's own registry
 * departing from the universal USFM/Paratext standard, not to any one
 * translation's own source, so any USFM source landing on this importer
 * carries the identical 17 mismatches — `imports/asv-bg/import.ts`'s own
 * `bdcCode`-to-`id` field solves the identical shape of problem for a
 * different, HTML-based source, so this table belongs on the general
 * importer, not duplicated per source.
 *
 * Five more rows (Q24) do the identical job for five of the 15
 * deuterocanon books: WEBUS2020's own USFM `\id`s (`1MA`/`2MA`/`3MA`/`4MA`/
 * `MAN`) each already have an exact-name match in `bible-books.json`
 * (`1MC`/`2MC`/`3MC`/`4MC`/`PMA`) — confirmed by reading both directly, e.g.
 * `52-1MAeng-web.usfm`'s own `\h 1 Maccabees` against registry `1MC`'s own
 * `name: "1 Maccabees"`. Routing them through this same crosswalk avoids
 * writing five duplicate registry entries for books the registry already
 * names, exactly as Q6 already established for the 17 canonical mismatches.
 */
const USFM_TO_REGISTRY_ID: Readonly<Record<string, string>> = {
  JOS: "JSH",
  RUT: "RTH",
  "1SA": "1SM",
  "2SA": "2SM",
  "1KI": "1KG",
  "2KI": "2KG",
  PRO: "PRV",
  SNG: "SOS",
  AMO: "AMS",
  OBA: "OBD",
  JON: "JNA",
  NAM: "NAH",
  ZEP: "ZPH",
  "1TI": "1TM",
  "2TI": "2TM",
  "1PE": "1PT",
  "2PE": "2PT",
  "1MA": "1MC",
  "2MA": "2MC",
  "3MA": "3MC",
  "4MA": "4MC",
  MAN: "PMA",
};

/**
 * Resolves a USFM file's own `\id` to this repo's own book-registry `_id` —
 * identity for every book where the two already agree, translated for the
 * 17 that do not (see {@link USFM_TO_REGISTRY_ID}'s own doc comment).
 *
 * Every verse file's own `book` field, and every `_version.json` entry
 * {@link mergeBookMetadata} writes, must carry this resolved id, never the
 * raw USFM one: `utils/validate.ts` checks a verse's `book` field against
 * its own filename and against `bible-books.json`'s registry directly, and
 * the raw USFM id fails both checks for these 17 books.
 */
export function resolveBookId(usfmId: string): string {
  return USFM_TO_REGISTRY_ID[usfmId] ?? usfmId;
}

/**
 * Reads one USFM file's own front matter and returns the book metadata
 * `_version.json` needs: `\id`'s first word (resolved to this repo's own
 * registry id) as `_id`, `\h` as `name`, `\toc1` as `title`, and the
 * highest `\c` number as `chapters`.
 *
 * `\toc2` was measured directly against `\h` and found byte-identical to
 * it for every in-scope book — `\h` alone is enough, so this extractor
 * does not carry a second, always-redundant read of the same value.
 *
 * @throws When the file carries no `\id`, `\h`, `\toc1`, or `\c` at all —
 *   a file missing any of these is not one this importer can place in
 *   `_version.json` at all, and failing loudly beats writing a guessed name.
 */
export function extractBookMetadata(source: string): BookMetadata {
  const tokens = tokenize(source);
  let usfmId: string | undefined;
  let name: string | undefined;
  let title: string | undefined;
  let chapters = 0;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "marker") continue;

    if (token.name === "c") {
      chapters = Math.max(chapters, Number(token.value));
      continue;
    }

    const next = tokens[index + 1];
    const line = next?.type === "text" ? next.text.trim() : "";

    if (token.name === "id" && usfmId === undefined) usfmId = line.split(/\s+/)[0];
    else if (token.name === "h" && name === undefined) name = line;
    else if (token.name === "toc1" && title === undefined) title = line;
  }

  if (usfmId === undefined) throw new Error("USFM file carries no \\id marker");
  if (name === undefined) throw new Error(`${usfmId}: USFM file carries no \\h marker`);
  if (title === undefined) throw new Error(`${usfmId}: USFM file carries no \\toc1 marker`);
  if (chapters === 0) throw new Error(`${usfmId}: USFM file carries no \\c marker`);

  return { _id: resolveBookId(usfmId), name, title, chapters };
}

/**
 * Merges `entries` into `version.books` by `_id` — updates `name`/`title`/
 * `chapters` on a book already present, adds a book that is not (appended
 * at the end, `order` set to the next sequential slot, since a USFM file's
 * own front matter carries no canon-order number of its own to derive one
 * from). The add-a-book path exists for a version whose `_version.json`
 * does not yet know about a book at all; a version that already lists
 * every book with a real `order` value only ever exercises the update path.
 *
 * Leaves every other book, and the version's own `name`/`license`/
 * `copyright`, untouched.
 */
export function mergeBookMetadata(
  version: BibleVersion,
  entries: readonly BookMetadata[],
): BibleVersion {
  const books = [...(version.books ?? [])];

  for (const entry of entries) {
    const index = books.findIndex((book) => book._id === entry._id);
    if (index === -1) {
      books.push({
        _id: entry._id,
        name: entry.name,
        title: entry.title,
        order: books.length + 1,
        chapters: entry.chapters,
      });
      continue;
    }
    books[index] = { ...books[index], name: entry.name, title: entry.title, chapters: entry.chapters };
  }

  return { ...version, books };
}
