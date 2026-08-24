import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import VerseSchema from "../../types/VerseSchema";
import {
  applyFootnoteOverhaul,
  computeFootnoteOverhaul,
  parseOverhaulArgs,
} from "../overhaulFootnotes";

/**
 * Every fixture body below lands on an already-established `classifyFootnote`
 * branch (`utils/usfm/footnoteTypeRules.ts`) — this suite proves the CLI's
 * walk/report/write mechanics, not new classification vocabulary.
 */

/** One book file written under a temp `bible-versions/<fakeVersionId>` directory, matching the on-disk shape `overhaulFootnotes.ts` reads. */
function writeBookFixture(versionDir: string, file: string, records: VerseSchema[]): void {
  fs.writeFileSync(path.join(versionDir, file), JSON.stringify(records));
}

/** A fresh temp directory standing in for one version's `bible-versions/<versionId>` directory — never the real repo directory, so a `--fix` test can safely write. */
function makeTempVersionDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "overhaul-footnotes-"));
  return dir;
}

describe("computeFootnoteOverhaul — preview, read-only", () => {
  it("should report a footnote whose stored type disagrees with classifyFootnote, and leave the file untouched on disk", () => {
    const versionDir = makeTempVersionDir();
    const records: VerseSchema[] = [
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          {
            text: "God",
            foot: { type: "stu", content: 'another manuscript reads "the LORD"' },
          },
        ],
      },
    ];
    writeBookFixture(versionDir, "01-GEN.json", records);
    const before = fs.readFileSync(path.join(versionDir, "01-GEN.json"), "utf-8");

    const result = computeFootnoteOverhaul(versionDir);

    expect(result.changes).toEqual([
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        body: 'another manuscript reads "the LORD"',
        from: "stu",
        to: "var",
      },
    ]);
    expect(fs.readFileSync(path.join(versionDir, "01-GEN.json"), "utf-8")).toBe(before);
  });

  it("should report zero changes for a footnote whose stored type already agrees with classifyFootnote", () => {
    const versionDir = makeTempVersionDir();
    const records: VerseSchema[] = [
      {
        book: "GEN",
        chapter: 1,
        verse: 2,
        content: [{ text: "the earth", foot: { type: "stu", content: "A cubit is about 18 inches." } }],
      },
    ];
    writeBookFixture(versionDir, "01-GEN.json", records);

    expect(computeFootnoteOverhaul(versionDir).changes).toEqual([]);
  });

  it("should ignore _version.json, matching crossChapterLinks.ts's own readVersionBookFiles convention", () => {
    const versionDir = makeTempVersionDir();
    fs.writeFileSync(path.join(versionDir, "_version.json"), JSON.stringify({ _id: "FAKE" }));

    expect(() => computeFootnoteOverhaul(versionDir)).not.toThrow();
    expect(computeFootnoteOverhaul(versionDir).changes).toEqual([]);
  });

  it("should reach a footnote nested in a verse's content, subtitle, and heading alike, matching verify.ts's own collectFootnotes descent", () => {
    const versionDir = makeTempVersionDir();
    const records: VerseSchema[] = [
      {
        book: "PSA",
        chapter: 90,
        verse: 1,
        content: [
          { heading: [{ text: "Superscription", foot: { type: "trn", content: "cherubim are angels. See Ezekiel 10." } }] },
          { subtitle: [{ text: "A prayer.", foot: { type: "var", content: "or, correctly translated a plea" } }] },
          { text: "Lord, you have been our dwelling place", foot: { type: "trn", content: "another manuscript reads home" } },
        ],
      },
    ];
    writeBookFixture(versionDir, "19-PSA.json", records);

    const { changes } = computeFootnoteOverhaul(versionDir);

    expect(changes).toHaveLength(3);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: "cherubim are angels. See Ezekiel 10.", from: "trn", to: "stu" }),
        expect.objectContaining({ body: "or, correctly translated a plea", from: "var", to: "trn" }),
        expect.objectContaining({ body: "another manuscript reads home", from: "trn", to: "var" }),
      ]),
    );
  });
});

describe("applyFootnoteOverhaul — --fix, writes changed books only", () => {
  it("should write back only the book whose footnotes actually changed, leaving an unchanged sibling book byte-identical", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [{ text: "God", foot: { type: "stu", content: 'another manuscript reads "the LORD"' } }],
      },
    ]);
    writeBookFixture(versionDir, "19-PSA.json", [
      {
        book: "PSA",
        chapter: 1,
        verse: 1,
        content: [{ text: "blessed", foot: { type: "stu", content: "A cubit is about 18 inches." } }],
      },
    ]);
    const psalmBefore = fs.readFileSync(path.join(versionDir, "19-PSA.json"), "utf-8");

    await applyFootnoteOverhaul(versionDir);

    const genesisAfter = JSON.parse(fs.readFileSync(path.join(versionDir, "01-GEN.json"), "utf-8"));
    expect(genesisAfter[0].content[0].foot.type).toBe("var");
    expect(fs.readFileSync(path.join(versionDir, "19-PSA.json"), "utf-8")).toBe(psalmBefore);
  });

  it("should report zero further changes on a second --fix run against its own just-fixed output — the same fixed-point proof crossChapterLinks.test.ts already uses for the sibling tool", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [{ text: "God", foot: { type: "stu", content: 'another manuscript reads "the LORD"' } }],
      },
    ]);

    const first = await applyFootnoteOverhaul(versionDir);
    expect(first.changes).toHaveLength(1);

    const second = await applyFootnoteOverhaul(versionDir);
    expect(second.changes).toHaveLength(0);
  });
});

describe("parseOverhaulArgs — the --fix-requires-a-version guard, matching auditCrossChapterLinks.ts's own convention", () => {
  it("should return null when no version is named, with or without --fix", () => {
    expect(parseOverhaulArgs([])).toBeNull();
    expect(parseOverhaulArgs(["--fix"])).toBeNull();
  });

  it("should parse a bare version with fix defaulting to false", () => {
    expect(parseOverhaulArgs(["WEBUS2020"])).toEqual({ fix: false, versionArg: "WEBUS2020" });
  });

  it("should parse a version alongside --fix in either order", () => {
    expect(parseOverhaulArgs(["WEBUS2020", "--fix"])).toEqual({ fix: true, versionArg: "WEBUS2020" });
    expect(parseOverhaulArgs(["--fix", "WEBUS2020"])).toEqual({ fix: true, versionArg: "WEBUS2020" });
  });
});
