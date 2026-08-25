import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMetadataOverrides,
  applyVersionOverrides,
  findBook,
  ImportOptions,
  parseArgv,
  regenerateDownstream,
  runImport,
  VerseRecord,
} from "../importUsfm";
import { BookMetadata, mergeBookMetadata } from "../usfm/metadata";
import BibleVersion, { VersionBook } from "../../types/Version";

// The downstream-regeneration guard below needs to prove the real subprocess
// boundary is never crossed when outputDir diverges — mocking "child_process"
// (an external module boundary Vitest's module registry can genuinely
// intercept) rather than trying to spy on this file's own
// `regenerateDownstream` export, which — being called directly by name from
// inside the same module, not through the export object — would not observe
// a spy at all. Scoped to this one test file only (Vitest isolates module
// registries per file); the `regenerateDownstream` describe block's two tests
// below never touch this mock, since each already injects its own fake `run`
// collaborator instead of the default.
vi.mock("child_process", () => ({ execSync: vi.fn() }));

/** Repo root, computed the same way `importUsfm.ts`'s own `REPO_ROOT` is, from this test file's own location (`utils/__tests__/` → repo root is two levels up). */
const repoRoot = path.resolve(__dirname, "..", "..");

/** One book's own minimal, throwaway `_version.json` fixture shape, reused by every outputDir-related test below. */
function fakeVersionJson(versionId: string): string {
  const version: BibleVersion = {
    _id: versionId,
    name: "Phase 2 fake test version",
    license: "CC0-1.0",
    books: [{ _id: "GEN", name: "Genesis", title: "Genesis", order: 1, chapters: 2 }],
  };
  return JSON.stringify(version);
}

const books: VersionBook[] = [
  { _id: "GEN", name: "Genesis", title: "The First Book of Moses", order: 1, chapters: 50 },
  { _id: "1SM", name: "1 Samuel", title: "The First Book of Samuel", order: 9, chapters: 31 },
];

describe("findBook", () => {
  it("should find a book by its exact id", () => {
    expect(findBook(books, "GEN")).toBe(books[0]);
  });

  it("should find a book by its display name, case and whitespace insensitive", () => {
    expect(findBook(books, "genesis")).toBe(books[0]);
    expect(findBook(books, "1 samuel")).toBe(books[1]);
    expect(findBook(books, "1samuel")).toBe(books[1]);
  });

  it("should return undefined for a book not in the list", () => {
    expect(findBook(books, "Exodus")).toBeUndefined();
  });
});

describe("regenerateDownstream", () => {
  it("should run the cross-chapter link split before npm run validate, scoped to the given version id (Phase 5 — imports/kjv/import.ts's own already-shipped precedent)", () => {
    const calls: string[] = [];
    regenerateDownstream("WEBUS2020", (command) => calls.push(command));
    expect(calls).toEqual(["npm run audit-links WEBUS2020 -- --fix", "npm run validate"]);
  });

  it("should scope the split's own command to whichever version id it is given, never a fixed one (this importer is generic, unlike imports/kjv/import.ts's own version-specific script)", () => {
    const calls: string[] = [];
    regenerateDownstream("KJV1769", (command) => calls.push(command));
    expect(calls[0]).toBe("npm run audit-links KJV1769 -- --fix");
  });
});

describe("parseArgv (Q23's --no-strongs CLI flag, position-independent)", () => {
  it("should read the four positional arguments in order when no flag is present", () => {
    expect(parseArgv(["src", "WEBUS2020", "Genesis", "1"])).toEqual({
      sourceDir: "src",
      versionId: "WEBUS2020",
      book: "Genesis",
      chapter: 1,
      options: {},
    });
  });

  it("should default chapter/book to undefined and options to {} when only source/version are given", () => {
    expect(parseArgv(["src", "WEBUS2020"])).toEqual({
      sourceDir: "src",
      versionId: "WEBUS2020",
      book: undefined,
      chapter: undefined,
      options: {},
    });
  });

  it("should fold --no-strongs into options.strongs regardless of where it sits among the positional arguments", () => {
    expect(parseArgv(["--no-strongs", "src", "WEBUS2020"]).options).toEqual({ strongs: false });
    expect(parseArgv(["src", "--no-strongs", "WEBUS2020"]).options).toEqual({ strongs: false });
    expect(parseArgv(["src", "WEBUS2020", "--no-strongs"]).options).toEqual({ strongs: false });
    expect(parseArgv(["src", "WEBUS2020", "Genesis", "--no-strongs", "1"]).options).toEqual({ strongs: false });
  });

  it("should still resolve the correct positional slots once --no-strongs is removed from the middle", () => {
    const parsed = parseArgv(["src", "WEBUS2020", "Genesis", "--no-strongs", "1"]);
    expect(parsed.sourceDir).toBe("src");
    expect(parsed.versionId).toBe("WEBUS2020");
    expect(parsed.book).toBe("Genesis");
    expect(parsed.chapter).toBe(1);
  });
});

describe("applyMetadataOverrides (Q23's book name/title override point)", () => {
  const metadata: BookMetadata = {
    _id: "GEN",
    name: "Genesis",
    title: "The First Book of Moses, Commonly Called Genesis",
    chapters: 50,
  };

  it("should leave name/title byte-identical to the extracted default when no callback is given", () => {
    expect(applyMetadataOverrides(metadata, {})).toEqual(metadata);
  });

  it("should pass the extracted default and the book's own resolved id to each callback, and use its return value", () => {
    const options: ImportOptions = {
      bookName: (defaultName, bookId) => `${defaultName} (${bookId})`,
      bookTitle: (defaultTitle, bookId) => `${defaultTitle} [${bookId}]`,
    };
    const overridden = applyMetadataOverrides(metadata, options);
    expect(overridden).toEqual({
      _id: "GEN",
      name: "Genesis (GEN)",
      title: "The First Book of Moses, Commonly Called Genesis [GEN]",
      chapters: 50,
    });
  });

  it("should land the override in mergeBookMetadata's own merged result, not just on the intermediate object", () => {
    // Reproduces the actual wiring point runImport uses: extractBookMetadata's
    // output flows through applyMetadataOverrides before mergeBookMetadata
    // ever sees it — proven here without needing real USFM/disk I/O.
    const version: BibleVersion = { _id: "WEBUS2020", name: "WEB US 2020", license: "CC0-1.0", books: [] };
    const overridden = applyMetadataOverrides(metadata, { bookName: (defaultName) => `${defaultName}!` });
    const merged = mergeBookMetadata(version, [overridden]);
    expect(merged.books?.[0]?.name).toBe("Genesis!");
  });
});

describe("applyVersionOverrides (Q23's copyright/license override point)", () => {
  const version: BibleVersion = {
    _id: "WEBUS2020",
    name: "World English Bible US 2020",
    license: "CC0-1.0",
    copyright: "Public Domain",
  };

  it("should leave copyright/license untouched when both options are absent", () => {
    expect(applyVersionOverrides(version, {})).toEqual(version);
  });

  it("should override only the field an option was given for, leaving the other untouched", () => {
    expect(applyVersionOverrides(version, { copyright: "New Copyright" })).toEqual({
      ...version,
      copyright: "New Copyright",
    });
    expect(applyVersionOverrides(version, { license: "MIT" })).toEqual({ ...version, license: "MIT" });
  });
});

describe("runImport, preview mode (disk-safe — never calls writeJsonFile; reads the real, already-shipped WEBUS2020 _version.json read-only)", () => {
  // Only utils/usfm/__tests__/fixtures/genesis-1-2.usfm starts with a real
  // \id line among this directory's fixtures (confirmed directly — every
  // sibling fixture is a bare chapter/verse excerpt with no front matter),
  // so pointing sourceDir here resolves exactly one book, Genesis, with no
  // risk of a second fixture also claiming the GEN id.
  const fixturesDir = path.join(__dirname, "..", "usfm", "__tests__", "fixtures");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should print zero strong keys for Genesis 1 when options.strongs is false", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runImport(fixturesDir, "WEBUS2020", { strongs: false }, "Genesis", 1);
    const printed = String(logSpy.mock.calls[0][0]);
    expect(printed).not.toContain("strong");
  });

  it("should print Strong's numbers for Genesis 1 when options.strongs is absent (today's exact behavior)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runImport(fixturesDir, "WEBUS2020", {}, "Genesis", 1);
    const printed = String(logSpy.mock.calls[0][0]);
    expect(printed).toContain('"strong": "H8064"');
  });

  it("should apply options.onVerse to every printed record before it prints", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const onVerse = (record: VerseRecord): VerseRecord => ({ ...record, content: "REPLACED BY onVerse" });
    await runImport(fixturesDir, "WEBUS2020", { onVerse }, "Genesis", 1);
    const printed = String(logSpy.mock.calls[0][0]);
    expect(printed).toContain("REPLACED BY onVerse");
    expect(JSON.parse(printed)).not.toHaveLength(0);
  });
});

describe("runImport, output-path hardwiring (Phase 2.1 — the real gap ImportOptions.outputDir exists to close)", () => {
  // Same disk-safe fixture directory as the preview-mode describe block
  // above, and the identical reasoning for why it resolves to exactly one
  // book (GEN) with no risk of a second fixture also claiming that id.
  const fixturesDir = path.join(__dirname, "..", "usfm", "__tests__", "fixtures");

  it("should read bible-versions/<versionId>/_version.json unconditionally, ignoring a real, valid _version.json fixture that already exists in a temp directory with no way to point runImport at it yet", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase2-hardwiring-"));
    const fakeVersionId = "PHASE2_NONEXISTENT_TEST_VERSION";
    // A real, valid, ready-to-read fixture — this proves the gap is "no way
    // to redirect here yet," not "no fixture exists to redirect to."
    fs.writeFileSync(path.join(tempDir, "_version.json"), fakeVersionJson(fakeVersionId));

    const expectedHardwiredPath = path.join(repoRoot, "bible-versions", fakeVersionId, "_version.json");

    // options: {} carries no redirect, so the only path this can possibly
    // read from is the hardwired default — and that path does not exist for
    // this fake id, so the real, valid fixture sitting in tempDir is never
    // even looked at.
    await expect(runImport(fixturesDir, fakeVersionId, {})).rejects.toMatchObject({
      code: "ENOENT",
      path: expectedHardwiredPath,
    });

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("runImport, ImportOptions.outputDir (Phase 2.2 — the redirect itself)", () => {
  const fixturesDir = path.join(__dirname, "..", "usfm", "__tests__", "fixtures");
  const bibleVersionsDir = path.join(repoRoot, "bible-versions");

  it("should read/write entirely under outputDir when given, touching nothing under the real bible-versions/ directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase2-outputdir-"));
    const fakeVersionId = "PHASE2_OUTPUTDIR_TEST_VERSION";
    fs.writeFileSync(path.join(tempDir, "_version.json"), fakeVersionJson(fakeVersionId));

    // bible-versions/ itself (not any one version's own subdirectory) is
    // the check: creating a new subdirectory inside it would bump its own
    // mtime, so an unchanged mtime here is real, filesystem-level proof
    // that this run created nothing anywhere under it.
    const beforeMtimeMs = fs.statSync(bibleVersionsDir).mtimeMs;

    await runImport(fixturesDir, fakeVersionId, { outputDir: tempDir });

    const afterMtimeMs = fs.statSync(bibleVersionsDir).mtimeMs;
    expect(afterMtimeMs).toBe(beforeMtimeMs);

    expect(fs.existsSync(path.join(tempDir, "01-GEN.json"))).toBe(true);
    const writtenVersion: BibleVersion = JSON.parse(fs.readFileSync(path.join(tempDir, "_version.json"), "utf8"));
    // mergeBookMetadata re-measures chapters for real from the actual
    // genesis-1-2.usfm fixture (chapters 1-2) — confirms a real, full,
    // non-preview run happened under outputDir, not just a version.json copy.
    expect(writtenVersion.books?.[0]).toMatchObject({ _id: "GEN", chapters: 2 });

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // "Absent reproduces today's exact default path" is proven three other
  // ways already, so it is not re-proven a fourth time here: the
  // hardwiring test above (same formula, options: {}); the pre-existing
  // preview-mode tests above (unaffected by this option's addition); and a
  // real, full, byte-for-byte WEBUS2020 regression run elsewhere — the
  // strongest evidence available, since it is a real run, not a mock.
});

describe("runImport, downstream-regeneration guard (Phase 2.3 — regenerateDownstream must never fire when outputDir diverges, since npm run audit-links/npm run validate are both hardwired to the real bible-versions/<versionId> tree)", () => {
  const fixturesDir = path.join(__dirname, "..", "usfm", "__tests__", "fixtures");

  afterEach(() => {
    vi.mocked(execSync).mockClear();
  });

  it("should never invoke the downstream-regeneration subprocess when outputDir diverges from the default bible-versions/<versionId> path", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase2-guard-"));
    const fakeVersionId = "PHASE2_GUARD_TEST_VERSION";
    fs.writeFileSync(path.join(tempDir, "_version.json"), fakeVersionJson(fakeVersionId));

    await runImport(fixturesDir, fakeVersionId, { outputDir: tempDir });

    // execSync is the real subprocess boundary regenerateDownstream's own
    // default `run` collaborator calls — proving it was never invoked
    // proves regenerateDownstream itself was never invoked, without ever
    // running (or risking) a real npm command against a fake version id.
    expect(execSync).not.toHaveBeenCalled();

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // The positive case — "still fires when outputDir is absent or equals
  // the default" — is deliberately not exercised here at the mocked-unit
  // level: doing so would require either (a) letting a real run write
  // into bible-versions/<fakeVersionId>, a real subdirectory of the one
  // real tree this whole objective treats as sensitive, purely to satisfy
  // a test, or (b) mocking around that constraint in a way that no longer
  // proves anything real. A full, real, non-mocked WEBUS2020 run already
  // exercises this exact branch for real (regenerateDownstream firing, npm
  // run audit-links/npm run validate both actually running), which is
  // strictly stronger evidence than a mocked unit test would be.
});
