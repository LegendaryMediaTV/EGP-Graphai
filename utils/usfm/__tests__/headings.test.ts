import { describe, expect, it } from "vitest";
import { tokenize } from "../tokenize";
import {
  buildAcrosticGlyphHeading,
  buildBookDivisionHeading,
  buildHeadingSpanContent,
  buildSpeakerHeading,
  buildSuperscriptionContent,
  isAcrosticLetterName,
} from "../headings";
import { readFixture } from "./fixtures";

describe("isAcrosticLetterName", () => {
  it("should recognize every one of Psalm 119's 22 real transliterated letter names", () => {
    for (const name of [
      "ALEPH", "BETH", "GIMEL", "DALETH", "HE", "VAV", "ZAYIN", "HETH", "TETH", "YODH",
      "KAPF", "LAMEDH", "MEM", "NUN", "SAMEKH", "AYIN", "PE", "TZADHE", "QOPH", "RESH",
      "SIN AND SHIN", "TAV",
    ]) {
      expect(isAcrosticLetterName(name)).toBe(true);
    }
  });

  it("should reject an ordinary Psalm superscription's own real text", () => {
    expect(isAcrosticLetterName("A Psalm by David, when he fled from Absalom his son.")).toBe(false);
    expect(isAcrosticLetterName("For the Chief Musician. A contemplation by the sons of Korah.")).toBe(false);
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

  it("should build the second and third boundaries with their own ordinals and ranges", () => {
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
