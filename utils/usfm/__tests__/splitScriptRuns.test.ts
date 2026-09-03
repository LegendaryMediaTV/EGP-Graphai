import { describe, expect, it } from "vitest";
import { splitNonLatinScriptRuns, splitScriptRuns } from "../splitScriptRuns";

/**
 * Shin as a Hebrew presentation form, U+FB2A — on screen indistinguishable
 * from the base-block shin at U+05E9, and outside the base-letter block the
 * Hebrew range originally covered.
 *
 * Built from the codepoint rather than pasted, because the codepoint is the
 * thing under test: a pasted glyph could silently be the base-block character
 * and the test would then prove nothing about the presentation-forms range.
 *
 * Not hypothetical. CSB2017 ships acrostic headings carrying this character at
 * Lamentations 1:21, 2:21 and 3:61 and Psalm 119:161, plus U+FB2B sin. That
 * corpus is licensed and lives only in the private downstream, so this test
 * names the codepoint instead of reading it — an upstream test that opened a
 * downstream-only file would pass in one repo and fail in the other.
 */
const PRESENTATION_FORM_SHIN = String.fromCodePoint(0xfb2a);

describe("splitScriptRuns, Hebrew presentation forms", () => {
  it("should tag a presentation-form shin mixed into Latin text, which the base-letter block alone left untagged", () => {
    const text = `Hebrew ${PRESENTATION_FORM_SHIN} Shin`;
    const expected = ["Hebrew ", { text: PRESENTATION_FORM_SHIN, script: "H" }, " Shin"];

    expect(splitScriptRuns(text, "H")).toEqual(expected);
    expect(splitNonLatinScriptRuns(text)).toEqual(expected);
  });

  it("should still return an all-Latin string unchanged, the ===-comparable contract every caller detects 'nothing to do' with", () => {
    const text = "Sin and Shin";

    expect(splitScriptRuns(text, "H")).toBe(text);
    expect(splitNonLatinScriptRuns(text)).toBe(text);
  });
});
