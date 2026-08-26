import { describe, it, expect } from "vitest";
import {
  normalizeFractionsInContent,
  normalizeFractionText,
  uniformFraction,
} from "../normalizeFractions";
import Content from "../../types/Content";

describe("uniformFraction", () => {
  it("should write a single-digit fraction as superscript, U+2044, subscript", () => {
    expect(uniformFraction("1", "2")).toBe("¹⁄₂");
    expect(uniformFraction("3", "4")).toBe("³⁄₄");
  });

  it("should raise/lower every digit of a multi-digit numerator or denominator", () => {
    expect(uniformFraction("1", "10")).toBe("¹⁄₁₀");
    expect(uniformFraction("3", "10")).toBe("³⁄₁₀");
    expect(uniformFraction("1", "16")).toBe("¹⁄₁₆");
  });
});

describe("normalizeFractionText — real WEBUS2020 fixtures", () => {
  it("should convert a genuine ASCII slash fraction (Exodus 16:36's own footnote)", () => {
    const { value, changes } = normalizeFractionText("about 2/3 of a bushel");

    expect(value).toBe(`about ${uniformFraction("2", "3")} of a bushel`);
    expect(changes).toBe(1);
  });

  it("should decompose every precomposed vulgar-fraction glyph in one string (Exodus 27:1's own footnote)", () => {
    const { value, changes } = normalizeFractionText("7½×7½×4½ feet");

    const half = uniformFraction("1", "2");
    expect(value).toBe(`7${half}×7${half}×4${half} feet`);
    expect(changes).toBe(3);
  });

  it("should convert a mixed number, keeping the space before the fraction", () => {
    const { value, changes } = normalizeFractionText("1 1/8 miles");

    expect(value).toBe(`1 ${uniformFraction("1", "8")} miles`);
    expect(changes).toBe(1);
  });

  it("should leave a genuine fraction immediately followed by an ordinal suffix verbatim (WEBUS2020 Matthew 20:2's own 1/25th)", () => {
    const text = "1/25th of a Roman aureus";
    const { value, changes } = normalizeFractionText(text);

    expect(value).toBe(text);
    expect(changes).toBe(0);
  });
});

describe("normalizeFractionText — the citation guard", () => {
  // WEBUS2020 itself carries no citation-shaped ASCII-slash candidate, so this
  // is a synthetic fixture in the same shape fix-ascii-fractions.ts's own doc
  // comment names — a journal volume/issue pair followed by a parenthesized
  // year — proving the guard rather than reproducing a real corpus instance.
  it("should leave a multi-digit-numerator/parenthesized-year pair untouched, not converted as a fraction", () => {
    const text = "Journal of Theology 24/25 (1980): 239-42.";
    const { value, changes } = normalizeFractionText(text);

    expect(value).toBe(text);
    expect(changes).toBe(0);
  });

  it("should still convert a genuine single-digit-numerator fraction elsewhere in the same string", () => {
    const text = "1/2 of a hin, cited in Journal of Theology 24/25 (1980): 239-42.";
    const { value, changes } = normalizeFractionText(text);

    expect(value).toBe(
      `${uniformFraction("1", "2")} of a hin, cited in Journal of Theology 24/25 (1980): 239-42.`,
    );
    expect(changes).toBe(1);
  });
});

describe("normalizeFractionText — idempotency", () => {
  it("should change nothing when run on its own already-normalized output", () => {
    const text = "about 2/3 of a bushel, and 7½×7½×4½ feet, and 1 1/8 miles";

    const first = normalizeFractionText(text);
    const second = normalizeFractionText(first.value);

    expect(second.changes).toBe(0);
    expect(second.value).toBe(first.value);
  });

  it("should leave text with no fraction shape at all untouched", () => {
    const { value, changes } = normalizeFractionText("In the beginning God created the heavens.");

    expect(value).toBe("In the beginning God created the heavens.");
    expect(changes).toBe(0);
  });

  it("should recognize the plain-digit-plus-U+2044 shape and raise/lower it, matching this module's third fraction shape", () => {
    // WEBUS2020's raw USFM carries zero real instances of this shape, so this
    // is a synthetic fixture proving the third shape is still covered.
    const { value, changes } = normalizeFractionText("about 1⁄2 a hin");

    expect(value).toBe(`about ${uniformFraction("1", "2")} a hin`);
    expect(changes).toBe(1);
  });
});

describe("normalizeFractionsInContent", () => {
  describe("normalizing each fraction shape in a node's own text", () => {
    it("should normalize a genuine ASCII N/M slash fraction", () => {
      expect(normalizeFractionsInContent([{ text: "a 1/2 cup" }])).toEqual({
        content: [{ text: "a ¹⁄₂ cup" }],
        changed: true,
      });
    });

    it("should normalize a precomposed vulgar-fraction glyph", () => {
      expect(normalizeFractionsInContent([{ text: "a ½ cup" }])).toEqual({
        content: [{ text: "a ¹⁄₂ cup" }],
        changed: true,
      });
    });

    it("should normalize plain digits already split by U+2044 but not yet raised/lowered", () => {
      expect(normalizeFractionsInContent([{ text: "a 1⁄2 cup" }])).toEqual({
        content: [{ text: "a ¹⁄₂ cup" }],
        changed: true,
      });
    });
  });

  describe("what the transform leaves alone", () => {
    it("should return the content unchanged and changed: false when nothing needs normalizing", () => {
      const fixture: Content = [{ text: "In the beginning" }, "and God said"];
      expect(normalizeFractionsInContent(fixture)).toEqual({
        content: fixture,
        changed: false,
      });
    });

    it("should accept plain string content", () => {
      expect(
        normalizeFractionsInContent("In the beginning God created")
      ).toEqual({
        content: "In the beginning God created",
        changed: false,
      });
    });

    it("should accept array content with nothing to normalize", () => {
      expect(normalizeFractionsInContent(["a", "b"])).toEqual({
        content: ["a", "b"],
        changed: false,
      });
    });
  });

  describe("recursion into every content-bearing branch", () => {
    it("should reach a fraction nested inside a heading", () => {
      expect(
        normalizeFractionsInContent([{ heading: [{ text: "1/2 measure" }] }])
      ).toEqual({
        content: [{ heading: [{ text: "¹⁄₂ measure" }] }],
        changed: true,
      });
    });

    it("should reach a fraction nested inside a subtitle", () => {
      expect(
        normalizeFractionsInContent([{ subtitle: [{ text: "1/2 measure" }] }])
      ).toEqual({
        content: [{ subtitle: [{ text: "¹⁄₂ measure" }] }],
        changed: true,
      });
    });

    it("should reach a fraction nested inside a ContentNested wrapper's own content", () => {
      expect(
        normalizeFractionsInContent([
          { content: ["a", { text: "1/2 measure" }], strong: "H3968" },
        ])
      ).toEqual({
        content: [
          { content: ["a", { text: "¹⁄₂ measure" }], strong: "H3968" },
        ],
        changed: true,
      });
    });

    it("should reach a fraction nested inside a footnote's own content", () => {
      expect(
        normalizeFractionsInContent([
          { text: "word", foot: { type: "stu", content: "a 1/2 measure" } },
        ])
      ).toEqual({
        content: [
          { text: "word", foot: { type: "stu", content: "a ¹⁄₂ measure" } },
        ],
        changed: true,
      });
    });

    it("should reach a fraction nested two levels deep, inside a footnote nested in a footnote", () => {
      expect(
        normalizeFractionsInContent({
          text: "word",
          foot: {
            type: "stu",
            content: {
              text: "note",
              foot: { type: "xrf", content: "1/2 measure" },
            },
          },
        })
      ).toEqual({
        content: {
          text: "word",
          foot: {
            type: "stu",
            content: {
              text: "note",
              foot: { type: "xrf", content: "¹⁄₂ measure" },
            },
          },
        },
        changed: true,
      });
    });
  });

  describe("the bibleLink content-override exclusion", () => {
    it("should not walk into a bibleLink node's own display-content override", () => {
      expect(
        normalizeFractionsInContent([
          { bibleLink: "John 3:16", content: "1/2 way" },
        ])
      ).toEqual({
        content: [{ bibleLink: "John 3:16", content: "1/2 way" }],
        changed: false,
      });
    });
  });

  describe("multiple offending nodes", () => {
    it("should fix every offending node in a record independently when there's more than one", () => {
      expect(
        normalizeFractionsInContent([{ text: "1/2" }, "and", { text: "3/4" }])
      ).toEqual({
        content: [{ text: "¹⁄₂" }, "and", { text: "³⁄₄" }],
        changed: true,
      });
    });
  });
});
