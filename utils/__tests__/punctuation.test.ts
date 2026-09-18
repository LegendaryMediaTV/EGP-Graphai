import { describe, expect, it } from "vitest";
import { spellingsOf, tokensOf } from "../punctuation";

/** The two Greek marks as escapes; see the file-level note in `lexicon.test.ts`. */
const ANO_TELEIA = "\u0387";
const GREEK_QUESTION_MARK = "\u037E";
/** The two characters those marks are indistinguishable from on screen. */
const MIDDLE_DOT = "\u00B7";
const SEMICOLON = ";";

describe("tokensOf", () => {
  it("should re-concatenate to the input exactly, for the shapes the corpus prints", () => {
    const shapes = [
      " χριστοῦ,",
      "Βοὸζ … Βοὸζ",
      ` Ἰσαάκ${ANO_TELEIA}`,
      `ἐστίν${GREEK_QUESTION_MARK}`,
      " Φακαρεθ – σαβιη,",
      "μεθ’ ",
      "   ",
      "(∗)",
      "",
    ];
    for (const shape of shapes) {
      expect(
        tokensOf(shape)
          .map((run) => run.text)
          .join(""),
      ).toBe(shape);
    }
  });

  it("should split a padded word into a leading mark run, the word, and a trailing mark run", () => {
    expect(tokensOf(" χριστοῦ,")).toEqual([
      { text: " ", word: false },
      { text: "χριστοῦ", word: true },
      { text: ",", word: false },
    ]);
  });

  it("should keep an elision mark inside the word, since the map keys the spelling with it", () => {
    expect(tokensOf("μεθ’ ")).toEqual([
      { text: "μεθ’", word: true },
      { text: " ", word: false },
    ]);
  });

  it("should carry a combining mark with the letter it sits on", () => {
    const decomposed = "χριστοῦ".normalize("NFD");
    expect(tokensOf(decomposed)).toEqual([{ text: decomposed, word: true }]);
  });

  it("should treat an unlisted mark as a mark run rather than as part of a word", () => {
    // A positive letter class handles `∗`, `[` and `]` with no list to extend.
    expect(tokensOf("[ϡθεοῦ∗]")).toEqual([
      { text: "[", word: false },
      { text: "ϡθεοῦ", word: true },
      { text: "∗]", word: false },
    ]);
  });

  it("should return nothing at all for the empty string", () => {
    expect(tokensOf("")).toEqual([]);
  });

  it("should return one mark run for text with no letters in it", () => {
    expect(tokensOf(" — ")).toEqual([{ text: " — ", word: false }]);
  });
});

describe("spellingsOf", () => {
  it("should still strip outer punctuation and offer both elision forms", () => {
    // A regression guard for the sibling: `tokensOf` answers a different
    // question and must not be allowed to redefine this one.
    expect(spellingsOf(" χριστοῦ,")).toEqual(["χριστοῦ"]);
    expect(spellingsOf("μεθ’")).toEqual(["μεθ’", "μεθ"]);
  });
});
