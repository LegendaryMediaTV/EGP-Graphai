import { describe, expect, it } from "vitest";
import { normalizeFractionText, uniformFraction } from "../fractions";

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

  it("should convert a mixed number, keeping the space before the fraction (matches NKJV1982's own '7 ¹⁄₂ feet')", () => {
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

  it("should recognize the plain-digit-plus-U+2044 shape and raise/lower it, matching nkjvText.ts's own third fraction shape", () => {
    // WEBUS2020's raw USFM carries zero real instances of this shape, so this
    // is a synthetic fixture proving the third shape is still covered.
    const { value, changes } = normalizeFractionText("about 1⁄2 a hin");

    expect(value).toBe(`about ${uniformFraction("1", "2")} a hin`);
    expect(changes).toBe(1);
  });
});
