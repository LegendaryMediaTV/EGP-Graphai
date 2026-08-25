import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import VerseSchema from "../../types/VerseSchema";
import { applyFootnoteOverhaul, computeFootnoteOverhaul, findSwallowedFlags, parseOverhaulArgs } from "../overhaulFootnotes";

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
          // A stu -> xrf upgrade, not a downgrade to stu, so it registers under this
          // suite's own default options — see the dedicated no-downgrade describe
          // block below for the case this fixture deliberately avoids.
          { heading: [{ text: "Superscription", foot: { type: "stu", content: "Exodus 30:12" } }] },
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
        expect.objectContaining({ body: "Exodus 30:12", from: "stu", to: "xrf" }),
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

describe("computeFootnoteOverhaul — the no-downgrade rule (stu is a default, not a verdict)", () => {
  it("should not replace a non-stu stored type with stu by default, even when classifyFootnote finds no signal", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "16-NEH.json", [
      {
        book: "NEH",
        chapter: 9,
        verse: 6,
        // A bare gloss with no classification signal of its own — classifyFootnote's
        // default. See overhaulFootnotes.ts's own header comment for why this must
        // not downgrade to stu.
        content: [{ text: "the sky", foot: { type: "trn", content: "expanse" } }],
      },
    ]);

    expect(computeFootnoteOverhaul(versionDir).changes).toEqual([]);
  });

  it("should still allow a real, non-stu reclassification alongside a protected stu downgrade in the same run", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "God", foot: { type: "stu", content: 'another manuscript reads "the LORD"' } },
          { text: "the heavens", foot: { type: "trn", content: "expanse" } },
        ],
      },
    ]);

    const { changes } = computeFootnoteOverhaul(versionDir);

    expect(changes).toEqual([
      { book: "GEN", chapter: 1, verse: 1, body: 'another manuscript reads "the LORD"', from: "stu", to: "var" },
    ]);
  });

  it("should still allow upgrading a stored stu to a real type — the no-downgrade rule only ever protects a non-stu stored type", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 1, verse: 1, content: [{ text: "God", foot: { type: "stu", content: "Exodus 30:12" } }] },
    ]);

    expect(computeFootnoteOverhaul(versionDir).changes).toEqual([
      { book: "GEN", chapter: 1, verse: 1, body: "Exodus 30:12", from: "stu", to: "xrf" },
    ]);
  });

  it("should carry the same no-downgrade protection through applyFootnoteOverhaul, leaving the file on disk untouched", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "16-NEH.json", [
      { book: "NEH", chapter: 9, verse: 6, content: [{ text: "the sky", foot: { type: "trn", content: "expanse" } }] },
    ]);
    const before = fs.readFileSync(path.join(versionDir, "16-NEH.json"), "utf-8");

    const result = await applyFootnoteOverhaul(versionDir);

    expect(result.changes).toEqual([]);
    expect(fs.readFileSync(path.join(versionDir, "16-NEH.json"), "utf-8")).toBe(before);
  });
});

describe("computeFootnoteOverhaul — --hard-reset, the from-scratch re-derivation", () => {
  it("should replace a non-stu stored type with stu, the one thing the default mode can never do", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "16-NEH.json", [
      { book: "NEH", chapter: 9, verse: 6, content: [{ text: "the sky", foot: { type: "trn", content: "expanse" } }] },
    ]);

    expect(computeFootnoteOverhaul(versionDir, { hardReset: true }).changes).toEqual([
      { book: "NEH", chapter: 9, verse: 6, body: "expanse", from: "trn", to: "stu" },
    ]);
  });

  it("should re-derive every type in one pass, downgrades and upgrades together", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "God", foot: { type: "stu", content: 'another manuscript reads "the LORD"' } },
          { text: "the heavens", foot: { type: "trn", content: "expanse" } },
        ],
      },
    ]);

    expect(computeFootnoteOverhaul(versionDir, { hardReset: true }).changes).toEqual([
      { book: "GEN", chapter: 1, verse: 1, body: 'another manuscript reads "the LORD"', from: "stu", to: "var" },
      { book: "GEN", chapter: 1, verse: 1, body: "expanse", from: "trn", to: "stu" },
    ]);
  });

  it("should leave a footnote whose stored type the classifier already agrees with alone, so a reset is not a rewrite of everything", () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "01-GEN.json", [
      { book: "GEN", chapter: 1, verse: 1, content: [{ text: "God", foot: { type: "xrf", content: "Exodus 30:12" } }] },
    ]);

    expect(computeFootnoteOverhaul(versionDir, { hardReset: true }).changes).toEqual([]);
  });

  it("should write the reset through applyFootnoteOverhaul", async () => {
    const versionDir = makeTempVersionDir();
    writeBookFixture(versionDir, "16-NEH.json", [
      { book: "NEH", chapter: 9, verse: 6, content: [{ text: "the sky", foot: { type: "trn", content: "expanse" } }] },
    ]);

    const result = await applyFootnoteOverhaul(versionDir, { hardReset: true });

    expect(result.changes).toHaveLength(1);
    const written = JSON.parse(fs.readFileSync(path.join(versionDir, "16-NEH.json"), "utf-8"));
    expect(written[0].content[0].foot.type).toBe("stu");
  });
});

describe("parseOverhaulArgs — the --fix-requires-a-version guard, matching auditCrossChapterLinks.ts's own convention", () => {
  it("should return null when no version is named, with or without --fix", () => {
    expect(parseOverhaulArgs([])).toBeNull();
    expect(parseOverhaulArgs(["--fix"])).toBeNull();
  });

  it("should parse a bare version with fix and hard-reset defaulting to false", () => {
    expect(parseOverhaulArgs(["WEBUS2020"])).toEqual({ fix: false, hardReset: false, versionArg: "WEBUS2020" });
  });

  it("should parse a version alongside --fix in either order", () => {
    expect(parseOverhaulArgs(["WEBUS2020", "--fix"])).toEqual({ fix: true, hardReset: false, versionArg: "WEBUS2020" });
    expect(parseOverhaulArgs(["--fix", "WEBUS2020"])).toEqual({ fix: true, hardReset: false, versionArg: "WEBUS2020" });
  });

  it("should parse --hard-reset on its own and alongside --fix, in any order", () => {
    expect(parseOverhaulArgs(["WEBUS2020", "--hard-reset"])).toEqual({
      fix: false,
      hardReset: true,
      versionArg: "WEBUS2020",
    });
    expect(parseOverhaulArgs(["--hard-reset", "--fix", "WEBUS2020"])).toEqual({
      fix: true,
      hardReset: true,
      versionArg: "WEBUS2020",
    });
  });
});

/**
 * The env vars below (`npm_config_fix`, `npm_config_hard_reset`) are the
 * evidence npm leaves behind when it swallows a flag instead of forwarding
 * it — see overhaulFootnotes.ts's own findSwallowedFlags header comment for
 * the mechanism.
 */
describe("findSwallowedFlags — npm eats a flag unless a bare -- precedes it", () => {
  it("should report a flag npm consumed instead of forwarding", () => {
    expect(findSwallowedFlags(["ASV1901"], { npm_config_fix: "true" })).toEqual(["--fix"]);
    expect(findSwallowedFlags(["ASV1901"], { npm_config_hard_reset: "true" })).toEqual(["--hard-reset"]);
  });

  it("should report both when npm consumed both", () => {
    expect(findSwallowedFlags(["ASV1901"], { npm_config_fix: "true", npm_config_hard_reset: "true" })).toEqual([
      "--fix",
      "--hard-reset",
    ]);
  });

  it("should report nothing when the flag actually arrived, whatever npm also recorded", () => {
    expect(findSwallowedFlags(["ASV1901", "--fix"], { npm_config_fix: "true" })).toEqual([]);
    expect(findSwallowedFlags(["ASV1901", "--hard-reset", "--fix"], {})).toEqual([]);
  });

  it("should report nothing outside npm, where the script is invoked directly", () => {
    expect(findSwallowedFlags(["ASV1901", "--hard-reset"], {})).toEqual([]);
    expect(findSwallowedFlags(["ASV1901"], {})).toEqual([]);
  });
});
