import { describe, it, expect } from "vitest";
import {
  hasMisplacedDialytika,
  normalizeDiacriticsInContent,
  normalizeDiacriticsText,
} from "../normalizeGreekDiacritics";

/** Spells a string as its code points, so a failure names the characters rather than showing two identical-looking glyphs. */
const points = (text: string): string =>
  [...text]
    .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");

describe("normalizeDiacriticsText", () => {
  it("moves a dialytika ahead of a combining accent and composes the letter (BYZ2026 Ἠσαΐου)", () => {
    const result = normalizeDiacriticsText("Ἠσαί̈ου");
    expect(points(result.value)).toBe("U+0397 U+0313 U+03C3 U+03B1 U+0390 U+03BF U+03C5");
    expect(result.changes).toBe(1);
  });

  it("moves a dialytika ahead of an accent already precomposed into the letter", () => {
    const result = normalizeDiacriticsText("πρωί̈");
    expect(points(result.value)).toBe("U+03C0 U+03C1 U+03C9 U+0390");
    expect(result.changes).toBe(1);
  });

  it("handles a grave the same way, composing to U+1FD2", () => {
    const result = normalizeDiacriticsText("πρωὶ̈");
    expect(points(result.value)).toBe("U+03C0 U+03C1 U+03C9 U+1FD2");
  });

  it("composes a bare vowel and dialytika that carry no accent at all (Λεϋί, from the retired BYZ2018 — a form BYZ2026 does not carry)", () => {
    const result = normalizeDiacriticsText("Λεϋὶ");
    expect(points(result.value)).toBe("U+039B U+03B5 U+03CB U+1F76");
    expect(result.changes).toBe(1);
  });

  it("leaves an already well-formed word untouched, returning the original reference", () => {
    const text = "Ἠσαΐου";
    const result = normalizeDiacriticsText(text);
    expect(result.value).toBe(text);
    expect(result.changes).toBe(0);
  });

  it("never touches the Greek ano teleia or question mark, which a whole-string NFC pass would fold to their Latin lookalikes", () => {
    // The word needing repair and the two Greek punctuation marks share one
    // string, so a fixer that round-tripped the whole thing would lose them.
    const text = "πρωί̈· τί;";
    const result = normalizeDiacriticsText(text);
    expect(points(result.value)).toBe(
      "U+03C0 U+03C1 U+03C9 U+0390 U+0387 U+0020 U+03C4 U+03AF U+037E"
    );
  });

  it("passes through text with no dialytika at all", () => {
    const text = "Βίβλος γενέσεως Ἰησοῦ χριστοῦ";
    expect(normalizeDiacriticsText(text).value).toBe(text);
  });
});

describe("hasMisplacedDialytika", () => {
  it("reports a misordered dialytika", () => {
    expect(hasMisplacedDialytika("πρωί̈")).toBe(true);
  });

  it("stays silent on the composed spelling", () => {
    expect(hasMisplacedDialytika("πρωΐ")).toBe(false);
  });
});

describe("normalizeDiacriticsInContent", () => {
  it("repairs text inside a footnote body as well as in the verse itself", () => {
    const result = normalizeDiacriticsInContent([
      { text: "πρωί̈", script: "G" },
      {
        text: " word",
        foot: { type: "var", content: [{ text: "Λεϋὶ", script: "G" }] },
      },
    ]);
    expect(result.changed).toBe(true);
    const [first, second] = result.content as any[];
    expect(points(first.text)).toBe("U+03C0 U+03C1 U+03C9 U+0390");
    expect(points(second.foot.content[0].text)).toBe("U+039B U+03B5 U+03CB U+1F76");
  });

  it("returns the original tree when there is nothing to repair", () => {
    const content = [{ text: "Βίβλος", script: "G" as const }];
    const result = normalizeDiacriticsInContent(content);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });
});
