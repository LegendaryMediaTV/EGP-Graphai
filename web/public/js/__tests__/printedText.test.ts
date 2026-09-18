import { describe, expect, it } from "vitest";
import { printedTextOf } from "../printedText";

describe("printedTextOf", () => {
  const matthew = {
    text: "Κατὰ Ματθαῖον",
    script: "G" as const,
    transliteration: "Katà Matthaîon",
  };

  it("prints the node's own text and keeps its script when not romanizing", () => {
    expect(printedTextOf(matthew, false)).toEqual({
      text: "Κατὰ Ματθαῖον",
      script: "G",
    });
  });

  it("prints the transliteration and drops the script when romanizing", () => {
    expect(printedTextOf(matthew, true)).toEqual({
      text: "Katà Matthaîon",
      script: undefined,
    });
  });

  it("drops a Hebrew node's script when romanizing, so nothing reads right-to-left", () => {
    expect(
      printedTextOf(
        { text: "בְּרֵאשִׁית", script: "H", transliteration: "bərēʾšîṯ" },
        true,
      ),
    ).toEqual({ text: "bərēʾšîṯ", script: undefined });
  });

  it("prints a script-tagged node's own text, script intact, when it carries no transliteration", () => {
    expect(printedTextOf({ text: "Κατὰ Ματθαῖον", script: "G" }, true)).toEqual(
      {
        text: "Κατὰ Ματθαῖον",
        script: "G",
      },
    );
  });

  it("leaves a Latin node alone whichever way the toggle is set", () => {
    const latin = { text: "Matthew" };
    expect(printedTextOf(latin, false)).toEqual({
      text: "Matthew",
      script: undefined,
    });
    expect(printedTextOf(latin, true)).toEqual({
      text: "Matthew",
      script: undefined,
    });
  });

  it("still drops the script for a node whose transliteration is its own text", () => {
    expect(
      printedTextOf({ text: "Αʹ", script: "G", transliteration: "Αʹ" }, true),
    ).toEqual({ text: "Αʹ", script: undefined });
  });

  it("treats an omitted transliterate flag as off", () => {
    expect(printedTextOf(matthew)).toEqual({
      text: "Κατὰ Ματθαῖον",
      script: "G",
    });
  });

  it("reports no text for a node that carries none, rather than throwing", () => {
    expect(printedTextOf({ strong: "G0846" }, true)).toEqual({
      text: undefined,
      script: undefined,
    });
  });
});
