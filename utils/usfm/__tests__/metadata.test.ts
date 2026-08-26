import { describe, expect, it } from "vitest";
import BibleVersion from "../../../types/Version";
import { extractBookMetadata, mergeBookMetadata, resolveBookId } from "../metadata";
import { readFixture } from "./fixtures";

describe("resolveBookId", () => {
  it("should leave an id unchanged when the USFM standard and this repo's own registry already agree", () => {
    expect(resolveBookId("GEN")).toBe("GEN");
  });

  it("should translate a standard USFM/Paratext code to this repo's own registry code where the two diverge", () => {
    expect(resolveBookId("1SA")).toBe("1SM");
    expect(resolveBookId("JOS")).toBe("JSH");
    expect(resolveBookId("2KI")).toBe("2KG");
  });

  it("should translate a deuterocanon USFM id to the existing registry entry that already matches it by name, rather than duplicate that entry", () => {
    expect(resolveBookId("1MA")).toBe("1MC");
    expect(resolveBookId("2MA")).toBe("2MC");
    expect(resolveBookId("3MA")).toBe("3MC");
    expect(resolveBookId("4MA")).toBe("4MC");
    expect(resolveBookId("MAN")).toBe("PMA");
  });
});

/**
 * The 17 real USFM/registry mismatches ASV1901 and MSB2025 both carry,
 * confirmed once by reading each source's own raw `\id` lists directly, not
 * re-checked at test time. Targets `resolveBookId`'s own translation table
 * (`usfm/metadata.ts`): each of these 17 ids must resolve to something
 * other than itself, confirming the existing crosswalk — not a new,
 * source-specific one — still does the work for both new sources.
 */
describe("resolveBookId — the 17 known canonical USFM/registry mismatches", () => {
  it("should resolve each of the 17 real USFM ids ASV1901 and MSB2025 both carry to a different registry id, never left unresolved", () => {
    const knownMismatchedUsfmIds = [
      "JOS", "RUT", "1SA", "2SA", "1KI", "2KI", "PRO", "SNG", "AMO", "OBA",
      "JON", "NAM", "ZEP", "1TI", "2TI", "1PE", "2PE",
    ];
    for (const usfmId of knownMismatchedUsfmIds) {
      expect(resolveBookId(usfmId)).not.toBe(usfmId);
    }
  });
});

describe("extractBookMetadata — Genesis's own real front matter and chapter markers", () => {
  const metadata = extractBookMetadata(readFixture("genesis-front-matter-and-chapter-markers.usfm"));

  it("should extract _id, name, title, and chapters exactly as the real front matter states them", () => {
    expect(metadata).toEqual({
      _id: "GEN",
      name: "Genesis",
      title: "The First Book of Moses, Commonly Called Genesis",
      chapters: 50,
    });
  });
});

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
