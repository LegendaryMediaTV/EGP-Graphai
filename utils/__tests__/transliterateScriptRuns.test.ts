import { describe, expect, it } from "vitest";
import BibleVersion from "../../types/Version";
import Content from "../../types/Content";
import {
  transliterateScriptRunsInContent,
  transliterateScriptRunsInVersion,
} from "../transliterateScriptRuns";

/**
 * The ano teleia (U+0387) and the plain semicolon (U+003B) it reads as, written
 * as escapes because the first is indistinguishable on screen from U+00B7
 * MIDDLE DOT — see `lexicon.test.ts` for what a mistaken paste costs.
 */
const ANO_TELEIA = "\u0387";
const SEMICOLON = "\u003B";

/**
 * REV 13:18's own text: chi-xi-stigma, the Greek alphabetic numeral 666, with
 * the leading space the node carries. Written as escapes like the mark above —
 * a paste landing one code point off would exercise a different rule than the
 * one on disk.
 */
const SIX_SIX_SIX = " \u03C7\u03BE\u03C2";

describe("transliterateScriptRunsInContent", () => {
  it("should write a transliteration on every script-tagged node and none on a Latin one", () => {
    const content = [
      { text: "χριστοῦ", script: "G" },
      { text: " and " },
      { text: "Δαυὶδ", script: "G" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([
      { text: "χριστοῦ", script: "G", transliteration: "christoû" },
      { text: " and " },
      { text: "Δαυὶδ", script: "G", transliteration: "Dauìd" },
    ]);
    expect(result.undeclaredScripts).toEqual([]);
  });

  // Without this the whole `npm run validate` run fails at
  // `checkAutoFixPassIsFixedPoint`, which reports the step name and nothing
  // about why a value it just wrote disagrees with itself.
  it("should report no change on a second application, since the pass has to be a fixed point of itself", () => {
    const content = [{ text: " χριστοῦ,", script: "G" }] as unknown as Content;

    const once = transliterateScriptRunsInContent(content);
    const twice = transliterateScriptRunsInContent(once.content);

    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once.content);
  });

  it("should overwrite a stored transliteration that disagrees with the registry's table", () => {
    // `dauíd` is the codex's own stored value for this spelling, and the wrong
    // answer for the printed token; see `lexicon.ts`'s top doc comment.
    const content = [
      { text: "Δαυὶδ", script: "G", transliteration: "dauíd" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([
      { text: "Δαυὶδ", script: "G", transliteration: "Dauìd" },
    ]);
  });

  // REV 13:18 as it stands on disk, and the one case where the pass has an
  // answer and declines to write it.
  it("should hold a stored transliteration that equals its own text, since an alphabetic numeral does not romanize", () => {
    const content = [
      { text: SIX_SIX_SIX, script: "G", transliteration: SIX_SIX_SIX },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  // The marking is a claim only a registry that could have romanized the node
  // is in a position to make; see `transliterateScriptRuns.ts`.
  it("should still strip a transliteration equal to its own text when no registry declares the script", () => {
    const content = [
      { text: "צִיצִכת", script: "H", transliteration: "צִיצִכת" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(true);
    expect(result.undeclaredScripts).toEqual(["H"]);
    expect(result.content).toEqual([{ text: "צִיצִכת", script: "H" }]);
  });

  // `dropEmptyTextKeysInContent` and `reattachLeadingPunctuationInContent` both
  // run earlier in the same pass and both can leave a node with no text at all.
  it("should remove a transliteration from a node that has lost its text", () => {
    const content = [
      { transliteration: "christoû", script: "G", strong: "G5547" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([{ script: "G", strong: "G5547" }]);
  });

  it("should remove a transliteration from a node that has lost its script, since nothing then says how it romanizes", () => {
    const content = [
      { text: "χριστοῦ", transliteration: "christoû" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([{ text: "χριστοῦ" }]);
  });

  it("should reach a footnote body, a heading and a subtitle, and not a bibleLink's own display content", () => {
    const content = [
      {
        text: "he",
        foot: { _id: "a", content: [{ text: "Βοὸζ", script: "G" }] },
      },
      { heading: [{ text: "Ἰσαάκ", script: "G" }] },
      { subtitle: [{ text: "Ἰσαάκ", script: "G" }] },
      { bibleLink: "Genesis 1:1", content: [{ text: "Ἰσαάκ", script: "G" }] },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.content).toEqual([
      {
        text: "he",
        foot: {
          _id: "a",
          content: [{ text: "Βοὸζ", script: "G", transliteration: "Boòz" }],
        },
      },
      { heading: [{ text: "Ἰσαάκ", script: "G", transliteration: "Isaák" }] },
      { subtitle: [{ text: "Ἰσαάκ", script: "G", transliteration: "Isaák" }] },
      { bibleLink: "Genesis 1:1", content: [{ text: "Ἰσαάκ", script: "G" }] },
    ]);
  });

  it("should leave a bare string in a content array alone, since it has no node to carry the value", () => {
    const content = [
      "In the beginning ",
      { text: "Ἰσαάκ", script: "G" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.content).toEqual([
      "In the beginning ",
      { text: "Ἰσαάκ", script: "G", transliteration: "Isaák" },
    ]);
  });

  it("should carry the text's own spacing and read the ano teleia as a semicolon", () => {
    const content = [
      { text: ` Ἰσαάκ${ANO_TELEIA}`, script: "G" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);
    const [node] = result.content as { transliteration: string }[];

    expect(node.transliteration).toBe(` Isaák${SEMICOLON}`);
    expect(
      node.transliteration.codePointAt(node.transliteration.length - 1),
    ).toBe(0x3b);
  });

  // Real WEBUS2020 NUM 15:38 shape. Every Hebrew node takes this path for as
  // long as `greek` is the only registry on disk.
  it("should report a script no registry declares and leave that node as printed", () => {
    const content = [{ text: "צִיצִכת", script: "H" }] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(false);
    expect(result.undeclaredScripts).toEqual(["H"]);
    expect(result.content).toEqual([{ text: "צִיצִכת", script: "H" }]);
  });

  it("should strip a stored transliteration from a node whose script no registry declares, rather than vouch for a value it cannot recompute", () => {
    const content = [
      { text: "צִיצִכת", script: "H", transliteration: "tzitzit" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(true);
    expect(result.undeclaredScripts).toEqual(["H"]);
    expect(result.content).toEqual([{ text: "צִיצִכת", script: "H" }]);
  });

  it("should leave a verse with nothing script-tagged in it untouched, by reference", () => {
    const content = [
      "In the beginning",
      { text: " God created" },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
    expect(result.undeclaredScripts).toEqual([]);
  });
});

/**
 * The four macron vowels the Greek registry writes, as their precomposed code
 * points. A letter plus a combining macron renders identically but asserts a
 * string the registry never produces, so the test below reads the code points
 * back and a paste of the decomposed pair fails here rather than in a data diff.
 */
const CAPITAL_ETA = "Ē";
const ETA = "ē";
const CAPITAL_OMEGA = "Ō";
const OMEGA = "ō";

/** BYZ2026's own MAT entry, the shape every book in both Greek versions is written in. */
const MATTHEW = {
  _id: "MAT",
  name: { text: "Κατὰ Ματθαῖον", script: "G" },
  title: { text: "ΕΥΑΓΓΕΛΙΟΝ ΤΟ ΚΑΤΑ ΜΑΤΘΑΙΟΝ", script: "G" },
  order: 1,
  chapters: 28,
};

/**
 * BYZ2026's own header fields, down to the plain-string name. Overrides arrive
 * as a loose record because a test here deliberately builds shapes the
 * `BibleVersion` type does not admit — a Hebrew book name, a stale stored
 * value — and the function under test has to answer for a file on disk rather
 * than for what the types allow.
 */
function byzantine(overrides: Record<string, unknown> = {}): BibleVersion {
  return {
    _id: "BYZ2026",
    name: "Byzantine Greek New Testament",
    license: "CC0-1.0",
    script: "G",
    books: [MATTHEW],
    ...overrides,
  } as unknown as BibleVersion;
}

describe("transliterateScriptRunsInVersion", () => {
  it("should write a transliteration on a book's own name and on its title", () => {
    const result = transliterateScriptRunsInVersion(byzantine());

    expect(result.changed).toBe(true);
    expect(result.version.books).toEqual([
      {
        _id: "MAT",
        name: {
          text: "Κατὰ Ματθαῖον",
          script: "G",
          transliteration: "Katà Matthaîon",
        },
        title: {
          text: "ΕΥΑΓΓΕΛΙΟΝ ΤΟ ΚΑΤΑ ΜΑΤΘΑΙΟΝ",
          script: "G",
          transliteration: "EUANGELION TO KATA MATTHAION",
        },
        order: 1,
        chapters: 28,
      },
    ]);
    expect(result.undeclaredScripts).toEqual([]);
  });

  it("should report no change on a second application, since the pass has to be a fixed point of itself", () => {
    const once = transliterateScriptRunsInVersion(byzantine());
    const twice = transliterateScriptRunsInVersion(once.version);

    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.version).toBe(once.version);
  });

  // The six Latin-script versions are the whole reason this matters: nothing in
  // their version files romanizes, and a rewrite would churn six files a run.
  it("should leave a version with nothing script-tagged in it untouched, by reference", () => {
    const version = {
      _id: "WEBUS2020",
      name: "World English Bible",
      license: "CC0-1.0",
      copyright: "Public domain.",
      abbr: [{ _id: "OM", name: "OM", description: "Omitted." }],
      books: [
        {
          _id: "GEN",
          name: "Genesis",
          title: "The First Book of Moses",
          order: 1,
          chapters: 50,
        },
      ],
    } as unknown as BibleVersion;

    const result = transliterateScriptRunsInVersion(version);

    expect(result.changed).toBe(false);
    expect(result.version).toBe(version);
    expect(result.undeclaredScripts).toEqual([]);
  });

  it("should overwrite a stale stored transliteration on a book name", () => {
    const version = byzantine({
      books: [
        {
          ...MATTHEW,
          name: {
            text: "Κατὰ Ματθαῖον",
            script: "G",
            transliteration: "Kata Matthaion",
          },
        },
      ],
    });

    const result = transliterateScriptRunsInVersion(version);

    expect(result.changed).toBe(true);
    expect((result.version.books ?? [])[0].name).toEqual({
      text: "Κατὰ Ματθαῖον",
      script: "G",
      transliteration: "Katà Matthaîon",
    });
  });

  // The alphabetic-numeral marking is the one hand-edit that survives the pass,
  // and it has to survive here on exactly the terms it does in verse content.
  it("should hold a stored transliteration that equals its own text", () => {
    const version = byzantine({
      books: [
        {
          ...MATTHEW,
          name: {
            text: "Πέτρου Αʹ",
            script: "G",
            transliteration: "Πέτρου Αʹ",
          },
        },
      ],
    });

    const result = transliterateScriptRunsInVersion(version);

    expect((result.version.books ?? [])[0].name).toEqual({
      text: "Πέτρου Αʹ",
      script: "G",
      transliteration: "Πέτρου Αʹ",
    });
  });

  // BYZ2026's Patriarchal Text entry. `getFootnoteText` romanizes an
  // abbreviation's name and description when the reader's toggle is on, so one
  // with no stored value falls back to the Greek.
  it("should reach an abbreviation entry's own description", () => {
    const version = byzantine({
      abbr: [
        {
          _id: "PT",
          name: "PT",
          description: [
            { text: "Ἡ Καινὴ Διαθήκη", script: "G", marks: ["i"] },
            " (The Ecumenical Patriarchal Text).",
          ],
        },
      ],
    });

    const result = transliterateScriptRunsInVersion(version);

    expect((result.version.abbr ?? [])[0].description).toEqual([
      {
        text: "Ἡ Καινὴ Διαθήκη",
        script: "G",
        transliteration: `H${ETA} Kainḕ Diathḗk${ETA}`,
        marks: ["i"],
      },
      " (The Ecumenical Patriarchal Text).",
    ]);
  });

  // Key order is not cosmetic here: `npm run validate` reformats every JSON
  // file it writes, so a node whose keys land out of canonical order shows up
  // as a diff nobody asked for on the next unrelated run.
  it("should leave a node's keys in canonical order when the new key lands beside a mark", () => {
    const version = byzantine({
      abbr: [{ _id: "PT", name: { text: "Ἡ", script: "G", marks: ["i"] } }],
    });

    const result = transliterateScriptRunsInVersion(version);

    expect(Object.keys((result.version.abbr ?? [])[0].name as object)).toEqual([
      "text",
      "script",
      "transliteration",
      "marks",
    ]);
  });

  it("should report a script no registry declares and leave that node as printed", () => {
    const version = byzantine({
      books: [{ ...MATTHEW, name: { text: "בְּרֵאשִׁית", script: "H" } }],
    });

    const result = transliterateScriptRunsInVersion(version);

    expect(result.undeclaredScripts).toEqual(["H"]);
    expect((result.version.books ?? [])[0].name).toEqual({
      text: "בְּרֵאשִׁית",
      script: "H",
    });
  });

  // The version's own `name` and `copyright` are Content too, and LXX1935's
  // titles are what proved the all-capital rule, so both belong in the walk.
  it("should romanize the version's own name and copyright when they carry a script", () => {
    const version = byzantine({
      name: { text: "ΙΑΚΩΒΟΥ ΕΠΙΣΤΟΛΗ ΚΑΘΟΛΙΚΗ", script: "G" },
      copyright: { text: "Πρὸς Ῥωμαίους", script: "G" },
    });

    const result = transliterateScriptRunsInVersion(version);

    expect(result.version.name).toEqual({
      text: "ΙΑΚΩΒΟΥ ΕΠΙΣΤΟΛΗ ΚΑΘΟΛΙΚΗ",
      script: "G",
      transliteration: `IAK${CAPITAL_OMEGA}BOU EPISTOL${CAPITAL_ETA} KATHOLIK${CAPITAL_ETA}`,
    });
    expect(result.version.copyright).toEqual({
      text: "Πρὸς Ῥωμαίους",
      script: "G",
      transliteration: `Pròs Rh${OMEGA}maíous`,
    });
    expect(CAPITAL_ETA.codePointAt(0)).toBe(0x112);
    expect(ETA.codePointAt(0)).toBe(0x113);
    expect(CAPITAL_OMEGA.codePointAt(0)).toBe(0x14c);
    expect(OMEGA.codePointAt(0)).toBe(0x14d);
  });

  it("should leave the fields that are strings rather than content alone", () => {
    const result = transliterateScriptRunsInVersion(byzantine());

    expect(result.version._id).toBe("BYZ2026");
    expect(result.version.license).toBe("CC0-1.0");
    expect(result.version.script).toBe("G");
  });
});
