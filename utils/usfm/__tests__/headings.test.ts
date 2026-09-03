import { describe, expect, it } from "vitest";
import { tokenize } from "../tokenize";
import {
  buildAcrosticGlyphHeading,
  buildBookDivisionHeading,
  buildHeadingSpanContent,
  buildSpeakerHeading,
  buildSuperscriptionContent,
  isAcrosticGlyphHeading,
  isAcrosticLetterName,
  psalterBookDivisionNumber,
} from "../headings";
import { readFixture } from "./fixtures";

describe("isAcrosticLetterName", () => {
  it("should recognize every one of Psalm 119's 22 real transliterated letter names as WEBUS2020's own 20-PSAeng-web.usfm spells them, KAPF's own source typo included", () => {
    for (const name of [
      "ALEPH", "BETH", "GIMEL", "DALETH", "HE", "VAV", "ZAYIN", "HETH", "TETH", "YODH",
      "KAPF", "LAMEDH", "MEM", "NUN", "SAMEKH", "AYIN", "PE", "TZADHE", "QOPH", "RESH",
      "SIN AND SHIN", "TAV",
    ]) {
      expect(isAcrosticLetterName(name)).toBe(true);
    }
  });

  it("should recognize the canonical 22 as this repo's own already-shipped tagged data spells them (bible-versions/NKJV1982/19-PSA.json), which KAPF alone used to stand in for", () => {
    for (const name of [
      "ALEPH", "BETH", "GIMEL", "DALETH", "HE", "WAW", "ZAYIN", "HETH", "TETH", "YOD",
      "KAPH", "LAMED", "MEM", "NUN", "SAMEK", "AYIN", "PE", "TSADDE", "QOPH", "RESH",
      "SHIN", "TAU",
    ]) {
      expect(isAcrosticLetterName(name)).toBe(true);
    }
  });

  it("should recognize each letter's own common transliteration variants, every one of them attested in another shipped version's acrostic headings", () => {
    for (const name of [
      "ALEF", "BET", "DALET", "ZAIN", "HET", "CHETH", "KHET", "HHETH", "TET", "IOTH",
      "KAF", "CAPH", "CAF", "LAMEDH", "SAMEKH", "SAMECH", "AIN", "TSADHE", "TSADE", "TZADE",
      "TSADI", "TZADI", "SADHE", "ZADE", "QOF", "KOPH", "SIN", "TAV", "TAW", "THAV",
    ]) {
      expect(isAcrosticLetterName(name)).toBe(true);
    }
  });

  it("should ignore letter case, so a source that prints Psalm 119's letter names in title case classifies the same way WEBUS2020's all-caps ones do", () => {
    expect(isAcrosticLetterName("Aleph")).toBe(true);
    expect(isAcrosticLetterName("Tsadhe")).toBe(true);
    expect(isAcrosticLetterName("qoph")).toBe(true);
  });

  it("should ignore display punctuation a source prints around the name, as ASV1901's trailing period and NET2019's parentheses both do", () => {
    expect(isAcrosticLetterName("ALEPH.")).toBe(true);
    expect(isAcrosticLetterName("(Alef)")).toBe(true);
  });

  it("should recognize a combined two-letter stanza heading in each joiner style the repo's own versions use", () => {
    expect(isAcrosticLetterName("SIN AND SHIN")).toBe(true);
    expect(isAcrosticLetterName("SIN and SHIN")).toBe(true);
    expect(isAcrosticLetterName("Sin/Shin")).toBe(true);
    expect(isAcrosticLetterName("Sin – Shin")).toBe(true);
    expect(isAcrosticLetterName("He - Vav")).toBe(true);
  });

  it("should reject an ordinary Psalm superscription's own real text", () => {
    expect(isAcrosticLetterName("A Psalm by David, when he fled from Absalom his son.")).toBe(false);
    expect(isAcrosticLetterName("For the Chief Musician. A contemplation by the sons of Korah.")).toBe(false);
  });

  it("should reject a joined pair when either half is not a letter name, rather than accepting anything a joiner happens to sit in", () => {
    expect(isAcrosticLetterName("Sin and David")).toBe(false);
    expect(isAcrosticLetterName("A Song - By David")).toBe(false);
  });
});

describe("isAcrosticGlyphHeading", () => {
  it("should accept ASV1901's real Psalm 119 \\qc text, glyph and trailing period and all", () => {
    expect(isAcrosticGlyphHeading([{ text: "א ALEPH." }])).toBe(true);
  });

  it("should accept ASV1901's real Psalm 119:57 \\qc HHETH, whose spelling no standard transliteration table carries", () => {
    expect(isAcrosticGlyphHeading([{ text: "ח HHETH." }])).toBe(true);
  });

  it("should accept a letter name with no glyph in front of it at all", () => {
    expect(isAcrosticGlyphHeading([{ text: "ALEPH" }])).toBe(true);
  });

  it("should accept a shin written as U+FB2A, the presentation form CSB2017's own shipped acrostic headings use, with no dependence on splitScriptRuns' Hebrew range covering it", () => {
    expect(isAcrosticGlyphHeading([{ text: "שׁ Shin" }])).toBe(true);
  });

  it("should reject the centered poetic line \\qc means in USFM generally — synthetic, since no source on disk uses \\qc for anything but a letter heading", () => {
    expect(isAcrosticGlyphHeading([{ text: "Blessed be the name of Yahweh forever." }])).toBe(false);
    expect(isAcrosticGlyphHeading([{ text: "A Song of Ascents." }])).toBe(false);
  });
});

describe("psalterBookDivisionNumber", () => {
  it("should read the division's own number off the Arabic label WEBUS2020's Psalms prints (\\ms1 BOOK 1, 20-PSAeng-web.usfm)", () => {
    expect(psalterBookDivisionNumber("PSA", [{ text: "BOOK 1" }])).toBe(1);
    expect(psalterBookDivisionNumber("PSA", [{ text: "BOOK 5" }])).toBe(5);
  });

  it("should read the same number off the Roman label ASV1901's Psalms prints (\\ms1 BOOK I, 20-PSAeng-asv.usfm), IV subtractively rather than as 6", () => {
    expect(psalterBookDivisionNumber("PSA", [{ text: "BOOK I" }])).toBe(1);
    expect(psalterBookDivisionNumber("PSA", [{ text: "BOOK IV" }])).toBe(4);
    expect(psalterBookDivisionNumber("PSA", [{ text: "BOOK V" }])).toBe(5);
  });

  it("should reject a book-division label outside Psalms, since the heading it would build names Psalms in its own text — synthetic, no source on disk carries a major-section heading outside Psalms", () => {
    expect(psalterBookDivisionNumber("ISA", [{ text: "BOOK 1" }])).toBeUndefined();
    expect(psalterBookDivisionNumber("1EN", [{ text: "BOOK II" }])).toBeUndefined();
  });

  it("should reject an ordinary major-section heading inside Psalms, the generic construct \\ms marks in USFM — synthetic", () => {
    expect(psalterBookDivisionNumber("PSA", [{ text: "The Songs of Ascent" }])).toBeUndefined();
    expect(psalterBookDivisionNumber("PSA", [{ text: "BOOK" }])).toBeUndefined();
  });
});

describe("buildHeadingSpanContent", () => {
  it("should walk an ordinary \\d superscription's own text and stop at the next marker", () => {
    const tokens = tokenize(readFixture("psalm-3.usfm"));
    const dIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "d");
    const { pieces, nextIndex } = buildHeadingSpanContent(tokens, dIndex + 1);

    expect(
      pieces
        .map((piece) => piece.text ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    ).toBe("A Psalm by David, when he fled from Absalom his son.");
    expect(tokens[nextIndex]).toEqual({ type: "marker", name: "q1" });
  });

  it("should strip a \\w tag's own strong attribute from an acrostic letter name, keeping the plain text", () => {
    const tokens = tokenize(readFixture("psalm-119-he.usfm"));
    const dIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "d");
    const { pieces, nextIndex } = buildHeadingSpanContent(tokens, dIndex + 1);

    const plainText = pieces
      .map((piece) => piece.text ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    expect(plainText).toBe("HE");
    expect(pieces.every((piece) => piece.strong === undefined)).toBe(true);
    expect(tokens[nextIndex]).toEqual({ type: "marker", name: "q1" });
  });

  it("should strip the \\w tag from the middle of SIN AND SHIN's combined letter name", () => {
    const tokens = tokenize(readFixture("psalm-119-sin-and-shin.usfm"));
    const dIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "d");
    const { pieces } = buildHeadingSpanContent(tokens, dIndex + 1);

    const plainText = pieces
      .map((piece) => piece.text ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    expect(plainText).toBe("SIN AND SHIN");
  });

  it("should attach an embedded footnote to the superscription's own last piece", () => {
    const tokens = tokenize(readFixture("psalm-46-opening.usfm"));
    const dIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "d");
    const { pieces, nextIndex } = buildHeadingSpanContent(tokens, dIndex + 1);

    const lastWithFoot = pieces.find((piece) => piece.foot !== undefined);
    expect(lastWithFoot).toBeDefined();
    expect(lastWithFoot?.foot?.type).toBe("stu");
    expect(tokens[nextIndex]).toEqual({ type: "marker", name: "q1" });
  });
});

describe("buildSuperscriptionContent", () => {
  it("should build an ordinary superscription as a subtitle", () => {
    const tokens = tokenize(readFixture("psalm-3.usfm"));
    const dIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "d");
    const { pieces } = buildHeadingSpanContent(tokens, dIndex + 1);

    const result = buildSuperscriptionContent(pieces);
    expect(result).toEqual({ subtitle: "A Psalm by David, when he fled from Absalom his son." });
  });

  it("should build a Psalm 119 acrostic letter as a heading with type acrostic, plain text only", () => {
    const tokens = tokenize(readFixture("psalm-119-aleph-beth.usfm"));
    const dIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "d");
    const { pieces } = buildHeadingSpanContent(tokens, dIndex + 1);

    const result = buildSuperscriptionContent(pieces);
    expect(result).toEqual({ heading: "ALEPH", type: "acrostic" });
  });

  it("should build a footnote-bearing superscription with the foot attached inside the subtitle's own content", () => {
    const tokens = tokenize(readFixture("psalm-46-opening.usfm"));
    const dIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "d");
    const { pieces } = buildHeadingSpanContent(tokens, dIndex + 1);

    const result = buildSuperscriptionContent(pieces);
    expect("subtitle" in result).toBe(true);
    const content = (result as { subtitle: unknown }).subtitle;
    expect(Array.isArray(content) || typeof content === "object").toBe(true);
  });
});

describe("buildAcrosticGlyphHeading", () => {
  it("should isolate a real \\qc source's own leading Hebrew glyph from its trailing transliterated name", () => {
    const result = buildAcrosticGlyphHeading([{ text: "א ALEPH." }]);
    expect(result).toEqual({ heading: [{ text: "א", script: "H" }, " ALEPH."], type: "acrostic" });
  });

  it("should isolate an undelimited Greek glyph too, closing the import-time asymmetry that used to scan this call site for Hebrew only — no real Greek acrostic exists in this corpus, so this guards the next import that might carry one", () => {
    const result = buildAcrosticGlyphHeading([{ text: "Α ALPHA." }]);
    expect(result).toEqual({ heading: [{ text: "Α", script: "G" }, " ALPHA."], type: "acrostic" });
  });
});

describe("buildSpeakerHeading", () => {
  it("should build a Song of Solomon speaker label as a plain heading", () => {
    const tokens = tokenize(readFixture("song-of-solomon-1-1-5.usfm"));
    const spIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "sp");
    const { pieces } = buildHeadingSpanContent(tokens, spIndex + 1);

    expect(buildSpeakerHeading(pieces)).toEqual({ heading: "Beloved" });
  });
});

describe("buildBookDivisionHeading", () => {
  it("should build the first book-division heading with the spelled-out ordinal, small caps, and a computed en-dash range", () => {
    expect(buildBookDivisionHeading(0, 1, 41)).toEqual({
      heading: [{ text: "Book One", marks: ["sc"] }, " (Psalms 1–41)"],
    });
  });

  it("should build the second and third divisions with their own ordinals and ranges", () => {
    expect(buildBookDivisionHeading(1, 42, 72)).toEqual({
      heading: [{ text: "Book Two", marks: ["sc"] }, " (Psalms 42–72)"],
    });
    expect(buildBookDivisionHeading(2, 73, 89)).toEqual({
      heading: [{ text: "Book Three", marks: ["sc"] }, " (Psalms 73–89)"],
    });
  });

  it("should throw for an index beyond the five known ordinal words rather than guess one", () => {
    expect(() => buildBookDivisionHeading(5, 150, 150)).toThrow();
  });
});
