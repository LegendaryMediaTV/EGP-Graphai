import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import getBibleVersions, {
  getBibleVersion,
  getVersionDirectories,
} from "../getBibleVersions";

describe("getBibleVersions", () => {
  const testDir = path.join(__dirname, "..", "..", "bible-versions");

  describe("with real data", () => {
    it("should load all versions from bible-versions directory", () => {
      const versions = getBibleVersions();

      expect(versions).toBeInstanceOf(Array);
      expect(versions.length).toBeGreaterThan(0);
    });

    it("should return versions sorted alphabetically by _id", () => {
      const versions = getBibleVersions();
      const ids = versions.map((v) => v._id);
      const sortedIds = [...ids].sort();

      expect(ids).toEqual(sortedIds);
    });

    it("should include expected versions", () => {
      const versions = getBibleVersions();
      const ids = versions.map((v) => v._id);

      expect(ids).toContain("ASV1901");
      expect(ids).toContain("KJV1769");
      expect(ids).toContain("WEBUS2020");
    });

    it("should have required fields on each version", () => {
      const versions = getBibleVersions();

      for (const version of versions) {
        expect(version._id).toBeDefined();
        expect(typeof version._id).toBe("string");
        expect(version.name).toBeDefined();
        expect(version.license).toBeDefined();
        expect(typeof version.license).toBe("string");
      }
    });

    it("should include books array with correct structure", () => {
      const versions = getBibleVersions();

      for (const version of versions) {
        if (version.books && version.books.length > 0) {
          const firstBook = version.books[0];
          expect(firstBook._id).toBeDefined();
          expect(firstBook.name).toBeDefined();
          expect(firstBook.title).toBeDefined();
          expect(firstBook.order).toBeDefined();
          expect(typeof firstBook.order).toBe("number");
          expect(firstBook.chapters).toBeDefined();
          expect(typeof firstBook.chapters).toBe("number");
        }
      }
    });
  });

  describe("with test fixtures", () => {
    const fixtureDir = path.join(__dirname, "fixtures", "versions");

    beforeAll(() => {
      fs.mkdirSync(fixtureDir, { recursive: true });

      // Create valid version directory
      const validDir = path.join(fixtureDir, "TEST001");
      fs.mkdirSync(validDir, { recursive: true });
      fs.writeFileSync(
        path.join(validDir, "_version.json"),
        JSON.stringify({
          _id: "TEST001",
          name: "Test Version One",
          license: "CC0-1.0",
          books: [],
        })
      );

      // Create another valid version
      const validDir2 = path.join(fixtureDir, "AAA000");
      fs.mkdirSync(validDir2, { recursive: true });
      fs.writeFileSync(
        path.join(validDir2, "_version.json"),
        JSON.stringify({
          _id: "AAA000",
          name: "First Alphabetically",
          license: "MIT",
          books: [
            {
              _id: "GEN",
              name: "Genesis",
              title: "The Book of Genesis",
              order: 1,
              chapters: 50,
            },
          ],
        })
      );

      // Create directory without _version.json (should be skipped)
      const noVersionDir = path.join(fixtureDir, "NOVERSION");
      fs.mkdirSync(noVersionDir, { recursive: true });

      // Create a plain file (not a directory, should be skipped)
      fs.writeFileSync(
        path.join(fixtureDir, "somefile.json"),
        '{"not": "a version"}'
      );

      // Create directory with malformed JSON
      const malformedDir = path.join(fixtureDir, "MALFORMED");
      fs.mkdirSync(malformedDir, { recursive: true });
      fs.writeFileSync(
        path.join(malformedDir, "_version.json"),
        "{ invalid json"
      );
    });

    afterAll(() => {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    });

    it("should load versions from custom directory", () => {
      const versions = getBibleVersions(fixtureDir);

      // Should find TEST001 and AAA000, skip NOVERSION and MALFORMED (error)
      expect(versions.length).toBe(2);
    });

    it("should sort versions alphabetically", () => {
      const versions = getBibleVersions(fixtureDir);
      const ids = versions.map((v) => v._id);

      expect(ids[0]).toBe("AAA000"); // A comes before T
      expect(ids[1]).toBe("TEST001");
    });

    it("should skip directories without _version.json", () => {
      const versions = getBibleVersions(fixtureDir);
      const ids = versions.map((v) => v._id);

      expect(ids).not.toContain("NOVERSION");
    });

    it("should skip non-directory entries", () => {
      const versions = getBibleVersions(fixtureDir);

      // somefile.json should not cause issues
      expect(versions.length).toBe(2);
    });

    it("should handle malformed JSON gracefully", () => {
      // Should not throw, but skip the malformed entry
      const versions = getBibleVersions(fixtureDir);
      const ids = versions.map((v) => v._id);

      expect(ids).not.toContain("MALFORMED");
    });

    it("should throw error if directory does not exist", () => {
      expect(() => getBibleVersions("/nonexistent/path")).toThrow(
        "Bible versions directory not found"
      );
    });
  });

  describe("with duplicate name fixtures", () => {
    const fixtureDir = path.join(__dirname, "fixtures", "duplicate-names");

    const writeVersion = (
      id: string,
      name: unknown,
      dir: string = fixtureDir
    ) => {
      const versionDir = path.join(dir, id);
      fs.mkdirSync(versionDir, { recursive: true });
      fs.writeFileSync(
        path.join(versionDir, "_version.json"),
        JSON.stringify({
          _id: id,
          name,
          license: "CC0-1.0",
          books: [],
        })
      );
    };

    beforeAll(() => {
      fs.mkdirSync(fixtureDir, { recursive: true });

      // 2-way collision, partner has an earlier/later year
      writeVersion("DUPA1996", "Duplicate Name Test");
      writeVersion("DUPB2015", "Duplicate Name Test");

      // 3-way collision
      writeVersion("TRIA1980", "Triple Collision Test");
      writeVersion("TRIB1990", "Triple Collision Test");
      writeVersion("TRIC2000", "Triple Collision Test");

      // No collision - must be returned completely unchanged
      writeVersion("UNIQ2000", "Unique Name Test");

      // Collision where one sibling's _id has no parseable trailing year
      writeVersion("NOYR", "No Year Test");
      writeVersion("NOYR2001", "No Year Test");

      // Non-string names - must not crash and must not false-positive collide
      writeVersion("OBJA2001", { text: "Object Name A" });
      writeVersion("OBJB2002", { text: "Object Name B" });
    });

    afterAll(() => {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    });

    it("should append each colliding version's own year to a 2-way name collision", () => {
      const versions = getBibleVersions(fixtureDir);
      const dupa = versions.find((v) => v._id === "DUPA1996");
      const dupb = versions.find((v) => v._id === "DUPB2015");

      expect(dupa?.name).toBe("Duplicate Name Test (1996)");
      expect(dupb?.name).toBe("Duplicate Name Test (2015)");
    });

    it("should disambiguate all members of a 3-way name collision", () => {
      const versions = getBibleVersions(fixtureDir);
      const tria = versions.find((v) => v._id === "TRIA1980");
      const trib = versions.find((v) => v._id === "TRIB1990");
      const tric = versions.find((v) => v._id === "TRIC2000");

      expect(tria?.name).toBe("Triple Collision Test (1980)");
      expect(trib?.name).toBe("Triple Collision Test (1990)");
      expect(tric?.name).toBe("Triple Collision Test (2000)");
    });

    it("should leave a version with a unique name completely unchanged", () => {
      const versions = getBibleVersions(fixtureDir);
      const uniq = versions.find((v) => v._id === "UNIQ2000");

      expect(uniq?.name).toBe("Unique Name Test");
    });

    it("should suffix a colliding version with a parseable year even when its sibling has none", () => {
      const versions = getBibleVersions(fixtureDir);
      const noYear = versions.find((v) => v._id === "NOYR");
      const withYear = versions.find((v) => v._id === "NOYR2001");

      expect(withYear?.name).toBe("No Year Test (2001)");
      expect(noYear?.name).toBe("No Year Test");
    });

    it("should not crash on non-string names and should not treat distinct object names as colliding", () => {
      const versions = getBibleVersions(fixtureDir);
      const objA = versions.find((v) => v._id === "OBJA2001");
      const objB = versions.find((v) => v._id === "OBJB2002");

      expect(objA?.name).toEqual({ text: "Object Name A" });
      expect(objB?.name).toEqual({ text: "Object Name B" });
    });

    it("should still return the full fixture-dir result sorted by _id", () => {
      const versions = getBibleVersions(fixtureDir);
      const ids = versions.map((v) => v._id);
      const sortedIds = [...ids].sort();

      expect(ids).toEqual(sortedIds);
    });
  });
});

describe("getBibleVersion", () => {
  it("should return a specific version by ID", () => {
    const version = getBibleVersion("ASV1901");

    expect(version).toBeDefined();
    expect(version?._id).toBe("ASV1901");
    expect(version?.name).toBe("American Standard Version");
  });

  it("should return undefined for non-existent version", () => {
    const version = getBibleVersion("NONEXISTENT");

    expect(version).toBeUndefined();
  });

  it("should handle custom directory path", () => {
    const fixtureDir = path.join(__dirname, "fixtures", "single-version");
    const versionDir = path.join(fixtureDir, "SINGLE");

    // Setup
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(
      path.join(versionDir, "_version.json"),
      JSON.stringify({
        _id: "SINGLE",
        name: "Single Test",
        license: "CC0-1.0",
      })
    );

    try {
      const version = getBibleVersion("SINGLE", fixtureDir);
      expect(version?._id).toBe("SINGLE");
    } finally {
      // Cleanup
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});

describe("getVersionDirectories", () => {
  it("should return all version directory names", () => {
    const dirs = getVersionDirectories();

    expect(dirs).toBeInstanceOf(Array);
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs).toContain("ASV1901");
    expect(dirs).toContain("KJV1769");
  });

  it("should return sorted directory names", () => {
    const dirs = getVersionDirectories();
    const sorted = [...dirs].sort();

    expect(dirs).toEqual(sorted);
  });

  it("should return empty array for non-existent directory", () => {
    const dirs = getVersionDirectories("/nonexistent/path");

    expect(dirs).toEqual([]);
  });
});
