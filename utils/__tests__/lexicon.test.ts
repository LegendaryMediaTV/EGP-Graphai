import { describe, expect, it } from "vitest";
import {
  codexLookup,
  entriesFor,
  inflectionCategories,
  languageForScript,
  resolveLemma,
  resolveStrongs,
  transliterateText,
  transliterationTable,
} from "../lexicon";

/**
 * The two Greek marks are written as escapes throughout, both in the inputs and
 * in the expectations, because they look exactly like a middle dot and an ASCII
 * semicolon. A pasted literal is unreadable in a diff and in a terminal, and NFC
 * rewrites one of them, so a test asserting on a paste can pass while asserting
 * the wrong thing.
 */
const ANO_TELEIA = "\u0387";
const GREEK_QUESTION_MARK = "\u037E";
const SEMICOLON = "\u003B";
const QUESTION_MARK = "\u003F";

describe("transliterateText", () => {
  it("should keep the leading space and the trailing comma around a transliterated word", () => {
    expect(transliterateText(" χριστοῦ,", "G")).toBe(" christoû,");
  });

  it("should put a diphthong's rough breathing in front of the word and not in front of the space", () => {
    // `transliterate` moves the aspirate to the front of whatever string it is
    // given, so a whole-string call returns "h Oûtos". Measured, 35,775 tokens
    // across the two corpora take this path.
    expect(transliterateText(" Οὗτος", "G")).toBe(" Hoûtos");
    expect(transliterateText(" Οὗτος", "G")).not.toBe("h Oûtos");
  });

  it("should give a vowel's rough breathing the capital, since the aspirate stands first", () => {
    expect(transliterateText("Ἅγιος", "G")).toBe("Hágios");
  });

  it("should leave a rho holding its own capital, since its aspirate follows it", () => {
    expect(transliterateText("Ῥώμη", "G")).toBe("Rhṓmē");
  });

  it("should read the ano teleia as a plain semicolon", () => {
    const result = transliterateText(` Ἰσαάκ${ANO_TELEIA}`, "G");
    expect(result).toBe(` Isaák${SEMICOLON}`);
    expect(result?.codePointAt(result.length - 1)).toBe(0x3b);
  });

  it("should read the Greek question mark as a plain question mark", () => {
    const result = transliterateText(`ἐστίν${GREEK_QUESTION_MARK}`, "G");
    expect(result).toBe(`estín${QUESTION_MARK}`);
    expect(result?.codePointAt(result.length - 1)).toBe(0x3f);
  });

  it("should keep the printed capital and the printed grave, which the codex key folds away", () => {
    // The codex keys this spelling as `δαυίδ` and stores `dauíd` against it, so
    // a lookup would answer with the wrong case and the wrong accent. The value
    // is recomputed from the registry's table for exactly this reason.
    expect(transliterateText("Δαυὶδ", "G")).toBe("Dauìd");
    expect(transliterateText("Δαυὶδ", "G")).not.toBe("dauíd");
  });

  it("should transliterate each word of a multi-word node and carry the marks between them", () => {
    expect(transliterateText("Βοὸζ … Βοὸζ", "G")).toBe("Boòz … Boòz");
    expect(transliterateText(" Φακαρεθ – σαβιη,", "G")).toBe(" Phakareth – sabiē,");
  });

  it("should return whitespace-only and punctuation-only text unchanged", () => {
    expect(transliterateText("   ", "G")).toBe("   ");
    expect(transliterateText(" — [] ", "G")).toBe(" — [] ");
    expect(transliterateText("", "G")).toBe("");
  });

  it("should carry an elision mark through as part of the word", () => {
    expect(transliterateText("μεθ’ ", "G")).toBe("meth’ ");
  });

  it("should pass the archaic letters through unchanged, capital and all", () => {
    // Greek numerals heading acrostic stanzas and an editorial marker. The
    // registry's table has no entry for them and should not: romanizing a
    // stanza numeral would destroy it.
    expect(transliterateText("ϡ", "G")).toBe("ϡ");
    expect(transliterateText("Ϛ", "G")).toBe("Ϛ");
    expect(transliterateText("ϛ", "G")).toBe("ϛ");
  });

  it("should answer with nothing for a script no registry declares", () => {
    expect(transliterateText("anything", "Zz")).toBeNull();
  });
});

describe("languageForScript", () => {
  it("should resolve the Greek script code to the greek registry", () => {
    expect(languageForScript("G")).toBe("greek");
  });

  it("should answer with nothing for a script code no registry declares", () => {
    expect(languageForScript("Zz")).toBeNull();
  });
});

describe("transliterationTable", () => {
  it("should read the greek registry's own table", () => {
    const table = transliterationTable("greek");
    expect(table?.letters["α"]).toBe("a");
    expect(table?.aspirate).toBe("h");
  });

  it("should answer with nothing for a language with no registry", () => {
    expect(transliterationTable("nonesuch")).toBeNull();
  });
});

describe("codexLookup", () => {
  it("should fold the initial capital and read a grave as its acute", () => {
    expect(codexLookup("Δαυὶδ")).toBe("δαυίδ");
    expect(codexLookup("Χριστοῦ")).toBe(codexLookup("χριστοῦ"));
  });
});

describe("entriesFor", () => {
  // Rahlfs prints this gentilic in lower case and the codex keys it under the
  // capitalised root, because case is a fact about the word and `Ἰσραηλίτης` is
  // a name. `χριστός` used to be the example here and no longer is: it is a
  // common noun used as a title, the corpora print it lower case 603 times of
  // 610, and it is now one lower-case root.
  it("should reach a capitalized root from a lower-case printed spelling", () => {
    const entries = entriesFor("ισραηλίτου");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.root)).toContain("Ἰσραηλίτης");
    const israelite = entries.find((entry) => entry.root === "Ἰσραηλίτης");
    expect(israelite?.pos).toBe("noun");
    expect(israelite?.cell).toContain("gen");
  });

  it("should answer with nothing for a spelling the codex does not hold", () => {
    expect(entriesFor("κτήνην")).toEqual([]);
  });
});

describe("inflectionCategories", () => {
  it("should name the category each inflection code belongs to", () => {
    const categories = inflectionCategories();
    expect(categories.get("nom")).toBe("case");
    expect(categories.get("masc")).toBe("gender");
    expect(categories.get("noun")).toBe("pos");
  });
});

/**
 * Every word below is a real one, taken from BYZ2026 or LXX1935 with its own
 * printed spelling and its own morphology code, because the thing being tested
 * is what the map says about this corpus. A synthetic spelling would prove the
 * ladder runs and nothing about whether it answers.
 */
describe("resolveLemma", () => {
  // The root is lower case because the word is a common noun, "an anointed
  // one", that the New Testament uses as a title. Both corpora print it lower
  // case 603 times of 610, the three mid-clause capitals all standing directly
  // after `Ἰησοῦς`, so the capital is typography rather than a second word.
  it("should answer with the only root the codex holds for the spelling", () => {
    expect(resolveLemma({ text: " χριστοῦ,", morph: "N-GSM", morphology: "robinson" })).toEqual({
      lemma: "χριστός",
    });
  });

  it("should narrow two roots to one on the parse the morphology code states", () => {
    // The codex holds ἀγαθοποιῶν as a present participle of the verb
    // ἀγαθοποιέω and as a genitive plural of the adjective ἀγαθοποιός, and
    // only the first accounts for a participle.
    expect(resolveLemma({ text: " ἀγαθοποιῶν", morph: "V-PAP-NSM", morphology: "robinson" })).toEqual({
      lemma: "ἀγαθοποιέω",
    });
  });

  it("should leave the same spelling ambiguous when the parse accounts for both roots", () => {
    expect(resolveLemma({ text: " ἀγαθοποιῶν", morph: "A-GPM", morphology: "robinson" })).toEqual({
      unresolved: "ambiguous between ἀγαθοποιέω, ἀγαθοποιός",
    });
  });

  it("should narrow two roots to one on the Strong's number the node already carries", () => {
    // πού and ποῦ are both adverbs and both account for ADV-I, so only the
    // corpus's own G4226 separates the interrogative from the indefinite.
    expect(resolveLemma({ text: " Ποῦ", morph: "ADV-I", strong: "G4226", morphology: "robinson" })).toEqual({
      lemma: "ποῦ",
    });
    expect(resolveLemma({ text: " Ποῦ", morph: "ADV-I", morphology: "robinson" })).toEqual({
      unresolved: "ambiguous between πού, ποῦ",
    });
  });

  it("should name both roots and write no lemma when nothing separates them", () => {
    // 38 of BYZ2026's 39 unresolved nodes are this one word. Both roots are
    // particles, both are tagged G686, and the corpus offers nothing else to
    // tell them apart — so the answer is the question, not a coin toss.
    const result = resolveLemma({ text: "Ἄρα", morph: "PRT", strong: "G686", morphology: "robinson" });
    expect(result).toEqual({ unresolved: "ambiguous between ἄρα, ἆρα" });
    expect(result).not.toHaveProperty("lemma");
  });

  it("should say so when the map holds no such spelling", () => {
    expect(resolveLemma({ text: "κτήνην", morph: "N-ASF", morphology: "robinson" })).toEqual({
      unresolved: "the map holds no such spelling",
    });
  });

  it("should say so when the scheme cannot read the morphology code", () => {
    expect(resolveLemma({ text: "Ἄρα", morph: "ZZZ-9", morphology: "robinson" })).toEqual({
      unresolved: "robinson cannot read this code",
    });
  });

  it("should say so when no morphology scheme is declared to read the code with", () => {
    expect(resolveLemma({ text: "Ἄρα", morph: "PRT" })).toEqual({
      unresolved: "no morphology scheme is declared to read this code",
    });
  });

  it("should decline a node holding more than one word rather than guess which is the lemma", () => {
    // spellingsOf strips the outer punctuation and hands back one string, so
    // this gate has to count word runs rather than trust the lookup key.
    expect(resolveLemma({ text: " Φακαρεθ – σαβιη,", morph: "N-PRI", morphology: "robinson" })).toEqual({
      unresolved: "more than one word, so no single lemma",
    });
  });
});

describe("resolveStrongs", () => {
  it("should answer with the root's own number when it carries exactly one", () => {
    expect(resolveStrongs({ lemma: "λόγος", text: " λόγος", morph: "N-NSM", morphology: "robinson" })).toEqual({
      strong: "G3056",
    });
  });

  it("should narrow a root carrying sixteen numbers on the parse an index rule requires", () => {
    // The corpus tags every form of εἰμί at the lexical level, so the index is
    // the only thing that knows the third singular present is G2076.
    expect(resolveStrongs({ lemma: "εἰμί", text: " ἐστίν", morph: "V-PAI-3S", morphology: "robinson" })).toEqual({
      strong: "G2076",
    });
  });

  it("should read two rules naming one number as that number, not as a conflict", () => {
    // ἐμέ and ἐμὲ are two rules that differ only in a grave for an acute, and
    // codexLookup folds them together, so both match one node. Counting the
    // matches rather than collecting their distinct numbers reports 386 false
    // conflicts across LXX1935.
    expect(resolveStrongs({ lemma: "ἐγώ", text: " ἐμὲ", morph: "P-1AS", morphology: "robinson" })).toEqual({
      strong: "G1691",
    });
    expect(resolveStrongs({ lemma: "ἐγώ", text: " ἐμέ", morph: "P-1AS", morphology: "robinson" })).toEqual({
      strong: "G1691",
    });
  });

  it("should take the number the codex places on the cell itself when no rule covers it", () => {
    // καλός carries G2566 and G2570 and no index rule mentions it, but the
    // codex places G2570 on this spelling's own cells.
    expect(resolveStrongs({ lemma: "καλός", text: " καλόν.", morph: "A-ASM", morphology: "robinson" })).toEqual({
      strong: "G2570",
    });
  });

  it("should write nothing when the root's numbers are an array neither a rule nor a cell narrows", () => {
    expect(resolveStrongs({ lemma: "καλός", text: " καλαί", morph: "A-NPF", morphology: "robinson" })).toEqual({
      unresolved: "root-level index is an array no rule narrows",
    });
  });

  it("should write nothing when the root carries no number at all", () => {
    expect(
      resolveStrongs({ lemma: "ἀκατασκεύαστος", text: " ἀκατασκεύαστος,", morph: "A-NSM", morphology: "robinson" })
    ).toEqual({ unresolved: "the root carries no Strong's number" });
  });

  it("should say so when the lemma is not a root the codex holds", () => {
    // No fold fallback here on purpose: a fold could tie two roots, and this
    // lemma has no fold match either, so it would buy nothing but a risk.
    //
    // The lemma is invented rather than borrowed from a corpus. This test used
    // to name `αἴξ`, a real word the codex happened not to hold, and it broke
    // the day the codex gained it. Every lemma either corpus names is now a
    // root, so a real word cannot stand for this case at all.
    const notAWord = "ξζϙωπ";
    expect(
      resolveStrongs({ lemma: notAWord, text: ` ${notAWord}`, morph: "N-APF", morphology: "robinson" })
    ).toEqual({ unresolved: "lemma is not a root in the codex" });
  });
});
