import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import VerseSchema from "../../types/VerseSchema";
import {
  applyReferenceOverhaul,
  computeReferenceOverhaul,
  findSwallowedFlags,
  parseOverhaulArgs,
} from "../overhaulReferences";

/**
 * Every fixture body below lands on an already-established
 * `linkEmbeddedReferences` grammar branch (`utils/usfm/references.ts`) —
 * this suite proves the CLI's walk/report/write mechanics, not new grammar.
 */

/** One book file written under a temp `bible-versions/<fakeVersionId>` directory, matching the on-disk shape `overhaulReferences.ts` reads. */
function writeBookFixture(versionDir: string, file: string, records: VerseSchema[]): void {
  fs.writeFileSync(path.join(versionDir, file), JSON.stringify(records));
}

/** A fresh temp directory standing in for one version's `bible-versions/<versionId>` directory — never the real repo directory, so a `--fix` test can safely write. */
function makeTempVersionDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "overhaul-embedded-references-"));
}

describe("computeReferenceOverhaul — preview, read-only", () => {
  it("should find and report a reference sitting unlinked inside an ordinary footnote's own prose, and leave the file untouched on disk", () => {
    const versionDir = makeTempVersionDir();
    const records: VerseSchema[] = [
      {
        book: "GEN",
        chapter: 3,
        verse: 15,
        content: [
          {
            text: "he will crush",
            foot: { type: "stu", content: "This is quoted as a messianic prophecy in Isaiah 9:6." },
          },
        ],
      },
    ];
    writeBookFixture(versionDir, "01-GEN.json", records);
    const before = fs.readFileSync(path.join(versionDir, "01-GEN.json"), "utf-8");

    const result = computeReferenceOverhaul(versionDir);

    expect(result.changes).toEqual([{ book: "GEN", chapter: 3, verse: 15, raw: "Isaiah 9:6", target: "Isaiah 9:6" }]);
    expect(fs.readFileSync(path.join(versionDir, "01-GEN.json"), "utf-8")).toBe(before);
  });

  it("should report zero changes for a footnote with no embeddable reference at all", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 1, verse: 2, content: [{ text: "the earth", foot: { type: "stu", content: "A cubit is about 18 inches." } }] },
    ]);

    expect(computeReferenceOverhaul(versionDir).changes).toEqual([]);
  });

  it("should ignore _version.json as a book file, matching overhaulFootnotes.ts's own readBookFiles convention, while still reading it for canon scoping", () => {
    const versionDir = makeTempVersionDir();
    fs.writeFileSync(path.join(versionDir, "_version.json"), JSON.stringify({ books: [{ _id: "GEN" }] }));

    expect(() => computeReferenceOverhaul(versionDir)).not.toThrow();
    expect(computeReferenceOverhaul(versionDir).changes).toEqual([]);
  });

  it("should never touch an xrf-typed footnote's own content, even one shaped like ordinary prose", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 1, verse: 1, content: [{ text: "God", foot: { type: "xrf", content: "Isaiah 9:6" } }] },
    ]);

    expect(computeReferenceOverhaul(versionDir).changes).toEqual([]);
  });

  it("should reach a footnote nested in a verse's content, subtitle, and heading alike, matching overhaulFootnotes.ts's own reclassifyFootnotesIn descent", () => {
    const versionDir = makeTempVersionDir();
    const records: VerseSchema[] = [
      {
        book: "PSA",
        chapter: 90,
        verse: 1,
        content: [
          { heading: [{ text: "Superscription", foot: { type: "stu", content: "See also Isaiah 9:6." } }] },
          { subtitle: [{ text: "A prayer.", foot: { type: "stu", content: "Compare Matthew 1:23." } }] },
          { text: "Lord, you have been our dwelling place", foot: { type: "stu", content: "In John 3:16 a similar phrase appears." } },
        ],
      },
    ];
    writeBookFixture(versionDir, "19-PSA.json", records);

    const { changes } = computeReferenceOverhaul(versionDir);

    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.target)).toEqual(expect.arrayContaining(["Isaiah 9:6", "Matthew 1:23", "John 3:16"]));
  });

  it("should report a Roman-numeral-prefixed, period-abbreviated reference resolved to its canonical target, carrying the source's own raw spelling", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "11-1KG.json", [
      {
        book: "1KG",
        chapter: 8,
        verse: 33,
        content: [{ text: "the dedication", foot: { type: "stu", content: "See especially I Kgs. 8:33 for the fuller context." } }],
      },
    ]);

    expect(computeReferenceOverhaul(versionDir).changes).toEqual([
      { book: "1KG", chapter: 8, verse: 33, raw: "I Kgs. 8:33", target: "1 Kings 8:33" },
    ]);
  });

  it("should find every reference in a footnote that names several, in order", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      {
        book: "GEN",
        chapter: 3,
        verse: 15,
        content: [{ text: "he will crush", foot: { type: "stu", content: "See also Isaiah 9:6; Matthew 1:23." } }],
      },
    ]);

    expect(computeReferenceOverhaul(versionDir).changes).toEqual([
      { book: "GEN", chapter: 3, verse: 15, raw: "Isaiah 9:6", target: "Isaiah 9:6" },
      { book: "GEN", chapter: 3, verse: 15, raw: "Matthew 1:23", target: "Matthew 1:23" },
    ]);
  });

  it("should link a reference to a book outside the version's own declared canon just the same — this pass is never canon-restricted", () => {
    const versionDir = makeTempVersionDir();
    fs.writeFileSync(path.join(versionDir, "_version.json"), JSON.stringify({ books: [{ _id: "GEN" }] }));
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 1, verse: 1, content: [{ text: "God", foot: { type: "stu", content: "Compare 1 Maccabees 3:38." } }] },
    ]);

    expect(computeReferenceOverhaul(versionDir).changes).toEqual([
      { book: "GEN", chapter: 1, verse: 1, raw: "1 Maccabees 3:38", target: "1 Maccabees 3:38" },
    ]);
  });

  it("should narrow to one book's own file when a book id is given, reading neither the file nor its records for any other book", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 3, verse: 15, content: [{ text: "he will crush", foot: { type: "stu", content: "See Isaiah 9:6." } }] },
    ]);
    writeBookFixture(versionDir, "40-MAT.json", [
      { book: "MAT", chapter: 1, verse: 23, content: [{ text: "Immanuel", foot: { type: "stu", content: "Compare Isaiah 7:14." } }] },
    ]);

    const result = computeReferenceOverhaul(versionDir, { book: "MAT" });

    expect(result.changes).toEqual([{ book: "MAT", chapter: 1, verse: 23, raw: "Isaiah 7:14", target: "Isaiah 7:14" }]);
  });
});

describe("applyReferenceOverhaul — --fix, writes changed books only", () => {
  it("should write back only the book whose footnotes actually changed, leaving an unchanged sibling book byte-identical", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 3, verse: 15, content: [{ text: "he will crush", foot: { type: "stu", content: "See Isaiah 9:6." } }] },
    ]);
    writeBookFixture(versionDir, "19-PSA.json", [
      { book: "PSA", chapter: 1, verse: 1, content: [{ text: "blessed", foot: { type: "stu", content: "A cubit is about 18 inches." } }] },
    ]);
    const psalmBefore = fs.readFileSync(path.join(versionDir, "19-PSA.json"), "utf-8");

    await applyReferenceOverhaul(versionDir);

    const genesisAfter = JSON.parse(fs.readFileSync(path.join(versionDir, "01-GEN.json"), "utf-8"));
    expect(genesisAfter[0].content[0].foot.content).toEqual(["See ", { bibleLink: "Isaiah 9:6" }, "."]);
    expect(fs.readFileSync(path.join(versionDir, "19-PSA.json"), "utf-8")).toBe(psalmBefore);
  });

  it("should report zero further changes on a second --fix run against its own just-fixed output — the same fixed-point proof overhaulFootnotes.test.ts already uses for the sibling tool", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 3, verse: 15, content: [{ text: "he will crush", foot: { type: "stu", content: "See Isaiah 9:6." } }] },
    ]);

    const first = await applyReferenceOverhaul(versionDir);
    expect(first.changes).toHaveLength(1);

    const second = await applyReferenceOverhaul(versionDir);
    expect(second.changes).toHaveLength(0);
  });

  it("should never re-link an already-tagged bibleLink's own display text on a later run", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      {
        book: "GEN",
        chapter: 3,
        verse: 15,
        content: [
          {
            text: "he will crush",
            foot: { type: "stu", content: ["Already linked: ", { bibleLink: "Isaiah 9:6" }, ". Not yet: Matthew 1:23."] },
          },
        ],
      },
    ]);

    const result = await applyReferenceOverhaul(versionDir);

    expect(result.changes).toEqual([{ book: "GEN", chapter: 3, verse: 15, raw: "Matthew 1:23", target: "Matthew 1:23" }]);
    const written = JSON.parse(fs.readFileSync(path.join(versionDir, "01-GEN.json"), "utf-8"));
    expect(written[0].content[0].foot.content).toEqual([
      "Already linked: ",
      { bibleLink: "Isaiah 9:6" },
      ". Not yet: ",
      { bibleLink: "Matthew 1:23" },
      ".",
    ]);
  });

  it("should find and report a bare parenthetical citation inheriting its book from an already-tagged bibleLink sibling earlier in the same footnote, across intervening prose", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "10-2SM.json", [
      {
        book: "2SM",
        chapter: 12,
        verse: 11,
        content: [
          {
            text: "raise up evil against you",
            foot: {
              type: "stu",
              content: [
                "Amnon’s scandal with Tamar (",
                { bibleLink: "2 Samuel 13:14", content: "13:14" },
                ") and his murder by Absalom (18:6ff.).",
              ],
            },
          },
        ],
      },
    ]);

    const result = await applyReferenceOverhaul(versionDir);

    expect(result.changes).toEqual([{ book: "2SM", chapter: 12, verse: 11, raw: "(18:6", target: "2 Samuel 18:6" }]);
    const written = JSON.parse(fs.readFileSync(path.join(versionDir, "10-2SM.json"), "utf-8"));
    expect(written[0].content[0].foot.content).toEqual([
      "Amnon’s scandal with Tamar (",
      { bibleLink: "2 Samuel 13:14", content: "13:14" },
      ") and his murder by Absalom ",
      { bibleLink: "2 Samuel 18:6", content: "(18:6" },
      "ff.).",
    ]);
  });
});

describe("parseOverhaulArgs — version required, book id an optional second positional", () => {
  it("should return null when no version is named, with or without --fix", () => {
    expect(parseOverhaulArgs([])).toBeNull();
    expect(parseOverhaulArgs(["--fix"])).toBeNull();
  });

  it("should parse a bare version with fix defaulting to false and no book", () => {
    expect(parseOverhaulArgs(["WEBUS2020"])).toEqual({ fix: false, versionArg: "WEBUS2020", bookArg: undefined });
  });

  it("should parse a version alongside --fix in either order", () => {
    expect(parseOverhaulArgs(["WEBUS2020", "--fix"])).toEqual({ fix: true, versionArg: "WEBUS2020", bookArg: undefined });
    expect(parseOverhaulArgs(["--fix", "WEBUS2020"])).toEqual({ fix: true, versionArg: "WEBUS2020", bookArg: undefined });
  });

  it("should parse a version and a book id together, with or without --fix", () => {
    expect(parseOverhaulArgs(["WEBUS2020", "GEN"])).toEqual({ fix: false, versionArg: "WEBUS2020", bookArg: "GEN" });
    expect(parseOverhaulArgs(["WEBUS2020", "GEN", "--fix"])).toEqual({ fix: true, versionArg: "WEBUS2020", bookArg: "GEN" });
  });
});

/**
 * The env var below (`npm_config_fix`) is the evidence npm leaves behind
 * when it swallows a flag instead of forwarding it — see
 * overhaulReferences.ts's own findSwallowedFlags header comment for
 * the mechanism, shared verbatim with overhaulFootnotes.ts's own version.
 */
describe("findSwallowedFlags — npm eats a flag unless a bare -- precedes it", () => {
  it("should report a flag npm consumed instead of forwarding", () => {
    expect(findSwallowedFlags(["ASV1901"], { npm_config_fix: "true" })).toEqual(["--fix"]);
  });

  it("should report nothing when the flag actually arrived", () => {
    expect(findSwallowedFlags(["ASV1901", "--fix"], { npm_config_fix: "true" })).toEqual([]);
  });

  it("should report nothing outside npm, where the script is invoked directly", () => {
    expect(findSwallowedFlags(["ASV1901"], {})).toEqual([]);
  });
});
