import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import BibleVersion from "../../../types/Version";
import { extractBookMetadata, mergeBookMetadata, resolveBookId } from "../metadata";

/**
 * The real, complete Genesis USFM file — read directly, not a truncated
 * fixture, since this test's own expected `chapters: 50` depends on the
 * whole book (verbatim, never hand-invented). Lives at a gitignored,
 * never-committed path — a fresh clone doesn't have it — so this is
 * `undefined` rather than a thrown error when absent, and the one describe
 * block that needs it below is skipped in that case rather than crashing
 * the whole file's collection.
 */
const GENESIS_SOURCE_PATH = path.join(__dirname, "../../../imports/webus2020/ebible-usfm/02-GENeng-web.usfm");
const GENESIS_SOURCE = fs.existsSync(GENESIS_SOURCE_PATH) ? fs.readFileSync(GENESIS_SOURCE_PATH, "utf8") : undefined;

describe("resolveBookId", () => {
  it("should leave an id unchanged when the USFM standard and this repo's own registry already agree", () => {
    expect(resolveBookId("GEN")).toBe("GEN");
  });

  it("should translate a standard USFM/Paratext code to this repo's own registry code where the two diverge", () => {
    expect(resolveBookId("1SA")).toBe("1SM");
    expect(resolveBookId("JOS")).toBe("JSH");
    expect(resolveBookId("2KI")).toBe("2KG");
  });

  it("should translate a deuterocanon USFM id to the existing registry entry Q24 found already matches it by name, rather than duplicate that entry (Phase 10, Q24)", () => {
    expect(resolveBookId("1MA")).toBe("1MC");
    expect(resolveBookId("2MA")).toBe("2MC");
    expect(resolveBookId("3MA")).toBe("3MC");
    expect(resolveBookId("4MA")).toBe("4MC");
    expect(resolveBookId("MAN")).toBe("PMA");
  });
});

/**
 * Every real `_id` this repo's own book registry recognizes — read directly
 * from `bible-books/bible-books.json`, never hand-copied, so the crosswalk
 * check below is measured against the real registry, not a restated list.
 */
const REGISTRY_IDS = new Set<string>(
  (JSON.parse(fs.readFileSync(path.join(__dirname, "../../../bible-books/bible-books.json"), "utf8")) as {
    _id: string;
  }[]).map((book) => book._id),
);

/**
 * Every real `\id` a source's own canonical `.usfm` files declare, read
 * directly off disk — `usfm/importUsfm.ts`'s own `usfmFilesByRegistryId`
 * uses the identical `/^\\id\s+(\S+)/` extraction; duplicated here rather
 * than imported since that function is private to its own module and this
 * is a one-line regex, not a shared algorithm worth exporting for one test.
 *
 * @param dir - A source directory, e.g. `imports/asv1901/ebible-usfm`.
 * @param files - The canonical `.usfm` file names to read (front matter/
 *   introduction files excluded by the caller, never by this function).
 */
function realUsfmIds(dir: string, files: readonly string[]): string[] {
  return files.map((file) => {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    const match = /^\\id\s+(\S+)/.exec(source);
    if (match === null) throw new Error(`${file}: no \\id marker found`);
    return match[1];
  });
}

// Both directories are gitignored, never-committed local corpora — a fresh
// clone has neither. Guarded before either `readdirSync` call runs, not
// with `describe.skipIf`: vitest still runs a skipped describe's own
// callback body to collect its child tests.
const ASV1901_DIR = path.join(__dirname, "../../../imports/asv1901/ebible-usfm");
const MSB2025_DIR = path.join(__dirname, "../../../imports/msb2025/ebible-usfm");
const NEW_SOURCES_AVAILABLE = fs.existsSync(ASV1901_DIR) && fs.existsSync(MSB2025_DIR);
const ASV1901_CANONICAL_FILES = NEW_SOURCES_AVAILABLE
  ? fs
      .readdirSync(ASV1901_DIR)
      .filter((file) => file.endsWith(".usfm") && file !== "00-FRTeng-asv.usfm" && file !== "01-INTeng-asv.usfm")
  : [];

const MSB2025_CANONICAL_FILES = NEW_SOURCES_AVAILABLE
  ? fs.readdirSync(MSB2025_DIR).filter((file) => file.endsWith(".usfm"))
  : [];

if (!NEW_SOURCES_AVAILABLE) {
  describe.skip(
    "resolveBookId — ASV1901/MSB2025's own real \\id sets need zero new crosswalk rows (Phase 1 of the generality-test objective)",
    () => {
      it("requires the local ASV1901 and MSB2025 raw USFM corpora at imports/asv1901/ebible-usfm and imports/msb2025/ebible-usfm", () => {});
    },
  );
} else {
describe("resolveBookId — ASV1901/MSB2025's own real \\id sets need zero new crosswalk rows (Phase 1 of the generality-test objective)", () => {
  it("should find exactly 66 real canonical .usfm files in each new source, matching this planning pass's own direct count", () => {
    expect(ASV1901_CANONICAL_FILES).toHaveLength(66);
    expect(MSB2025_CANONICAL_FILES).toHaveLength(66);
  });

  it("should resolve every real ASV1901 canonical \\id to a book this repo's own registry already recognizes, with no two files colliding onto the same resolved id", () => {
    const resolved = realUsfmIds(ASV1901_DIR, ASV1901_CANONICAL_FILES).map(resolveBookId);
    for (const id of resolved) expect(REGISTRY_IDS.has(id)).toBe(true);
    expect(new Set(resolved).size).toBe(66);
  });

  it("should resolve every real MSB2025 canonical \\id to a book this repo's own registry already recognizes, with no two files colliding onto the same resolved id", () => {
    const resolved = realUsfmIds(MSB2025_DIR, MSB2025_CANONICAL_FILES).map(resolveBookId);
    for (const id of resolved) expect(REGISTRY_IDS.has(id)).toBe(true);
    expect(new Set(resolved).size).toBe(66);
  });

  it("should resolve both new sources' own real \\id sets to the identical 66-book canon — the same standard eBible OT/NT numbering WEB itself uses, needing no source-specific crosswalk row", () => {
    const asvResolved = new Set(realUsfmIds(ASV1901_DIR, ASV1901_CANONICAL_FILES).map(resolveBookId));
    const msbResolved = new Set(realUsfmIds(MSB2025_DIR, MSB2025_CANONICAL_FILES).map(resolveBookId));
    expect(asvResolved).toEqual(msbResolved);
  });

  it("should confirm all 17 of WEB's own already-known canonical mismatches are the exact rows doing the work here too — real, present, unchanged in both new corpora's own raw \\id lists", () => {
    const knownMismatchedUsfmIds = [
      "JOS", "RUT", "1SA", "2SA", "1KI", "2KI", "PRO", "SNG", "AMO", "OBA",
      "JON", "NAM", "ZEP", "1TI", "2TI", "1PE", "2PE",
    ];
    const asvRawIds = new Set(realUsfmIds(ASV1901_DIR, ASV1901_CANONICAL_FILES));
    const msbRawIds = new Set(realUsfmIds(MSB2025_DIR, MSB2025_CANONICAL_FILES));
    for (const usfmId of knownMismatchedUsfmIds) {
      expect(asvRawIds.has(usfmId)).toBe(true);
      expect(msbRawIds.has(usfmId)).toBe(true);
      expect(resolveBookId(usfmId)).not.toBe(usfmId);
    }
  });
});
}

if (GENESIS_SOURCE === undefined) {
  describe.skip("extractBookMetadata — the real Genesis front matter", () => {
    it("requires the local WEBUS2020 raw USFM corpus at imports/webus2020/ebible-usfm", () => {});
  });
} else {
  describe("extractBookMetadata — the real Genesis front matter", () => {
    const metadata = extractBookMetadata(GENESIS_SOURCE);

    it("should extract _id, name, title, and chapters exactly as the real front matter states them", () => {
      expect(metadata).toEqual({
        _id: "GEN",
        name: "Genesis",
        title: "The First Book of Moses, Commonly Called Genesis",
        chapters: 50,
      });
    });
  });
}

describe("extractBookMetadata — a USFM file missing a required marker", () => {
  it("should throw when the source carries no \\id marker at all", () => {
    expect(() => extractBookMetadata("\\h Genesis\n\\toc1 Title\n\\c 1\n\\v 1 text")).toThrow(
      /no \\id marker/,
    );
  });

  it("should throw when the source carries no \\c marker at all", () => {
    expect(() => extractBookMetadata("\\id GEN\n\\h Genesis\n\\toc1 Title")).toThrow(
      /no \\c marker/,
    );
  });
});

describe("mergeBookMetadata — a synthetic two-book fixture proving the upsert genuinely updates and adds", () => {
  const version: BibleVersion = {
    _id: "TEST",
    name: "Test Version",
    license: "CC0-1.0",
    books: [{ _id: "GEN", name: "Genesis", title: "Old Title", order: 1, chapters: 40 }],
  };

  const merged = mergeBookMetadata(version, [
    { _id: "GEN", name: "Genesis", title: "The First Book of Moses, Commonly Called Genesis", chapters: 50 },
    { _id: "EXO", name: "Exodus", title: "The Second Book of Moses, Commonly Called Exodus", chapters: 40 },
  ]);

  it("should update the field that differs on a book already present, without touching its own order", () => {
    expect(merged.books?.[0]).toEqual({
      _id: "GEN",
      name: "Genesis",
      title: "The First Book of Moses, Commonly Called Genesis",
      order: 1,
      chapters: 50,
    });
  });

  it("should add a book that is not yet present, appended with the next sequential order", () => {
    expect(merged.books?.[1]).toEqual({
      _id: "EXO",
      name: "Exodus",
      title: "The Second Book of Moses, Commonly Called Exodus",
      order: 2,
      chapters: 40,
    });
  });

  it("should leave the version's own name/license untouched", () => {
    expect(merged.name).toBe("Test Version");
    expect(merged.license).toBe("CC0-1.0");
  });
});
