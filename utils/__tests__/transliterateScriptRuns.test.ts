import { describe, expect, it } from "vitest";
import Content from "../../types/Content";
import { transliterateScriptRunsInContent } from "../transliterateScriptRuns";

/**
 * The ano teleia (U+0387) and the plain semicolon (U+003B) it reads as, written
 * as escapes because the first is indistinguishable on screen from U+00B7
 * MIDDLE DOT — see `lexicon.test.ts` for what a mistaken paste costs.
 */
const ANO_TELEIA = "\u0387";
const SEMICOLON = "\u003B";

/**
 * REV 13:18's own text: chi-xi-stigma, the Greek alphabetic numeral 666, with
 * the leading space the node carries. Written as escapes for the reason the
 * mark above is, and because this is the string the freeze exists for — a
 * paste landing one code point off would exercise a different rule than the
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
    const content = [
      { text: " χριστοῦ,", script: "G" },
    ] as unknown as Content;

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

  // REV 13:18 as it stands on disk. A Greek alphabetic numeral is letters
  // standing for a number, so the table's answer for it is `chxs` — neither the
  // number nor a word. A node storing its own text says exactly that, and this
  // is the one case where the pass has an answer and declines to write it.
  it("should hold a stored transliteration that equals its own text, since an alphabetic numeral does not romanize", () => {
    const content = [
      { text: SIX_SIX_SIX, script: "G", transliteration: SIX_SIX_SIX },
    ] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  // The freeze reads as "this does not romanize," which is a claim only a
  // registry that could have romanized it is in a position to make. An
  // undeclared script means nothing knows the scheme yet, so equality there is
  // redundancy rather than a marking — and holding it would quietly exempt
  // those nodes from the registry that eventually declares them.
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
    const content = ["In the beginning ", { text: "Ἰσαάκ", script: "G" }] as unknown as Content;

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
    expect(node.transliteration.codePointAt(node.transliteration.length - 1)).toBe(0x3b);
  });

  // Real WEBUS2020 NUM 15:38 shape. Every Hebrew node takes this path for as
  // long as `greek` is the only registry on disk.
  it("should report a script no registry declares and leave that node as printed", () => {
    const content = [
      { text: "צִיצִכת", script: "H" },
    ] as unknown as Content;

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
    const content = ["In the beginning", { text: " God created" }] as unknown as Content;

    const result = transliterateScriptRunsInContent(content);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
    expect(result.undeclaredScripts).toEqual([]);
  });
});
