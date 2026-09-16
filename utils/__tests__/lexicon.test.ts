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
    // εἴδω and ὁράω are two lexicon entries for one suppletive verb, and εἶδον
    // is the second aorist of both, so only the corpus's own G1492 separates
    // them. 236 nodes across the two corpora reach their lemma this way.
    expect(resolveLemma({ text: "εἶδον", morph: "V-2AAI-1S", strong: "G1492", morphology: "robinson" })).toEqual({
      lemma: "ὁράω",
    });
    expect(resolveLemma({ text: "εἶδον", morph: "V-2AAI-1S", morphology: "robinson" })).toEqual({
      unresolved: "ambiguous between εἴδω, ὁράω",
    });
  });

  it("should rule a capitalised root out for a word the page printed in lower case", () => {
    // Ezekiel's temple vision calls a vestibule αιλαμ and the nation Elam is
    // Αιλαμ. The map holds both, both are indeclinable, and LXX1935 gives them
    // no Strong's number, so the printed case is the only thing left.
    expect(resolveLemma({ text: "αιλαμ", morph: "N-PRI", morphology: "robinson" })).toEqual({
      lemma: "αιλαμ",
    });
    // The capital says nothing, because a capital at the head of a verse
    // belongs to the sentence. Read the other way round this test would claim
    // every sentence-initial common noun is a name.
    expect(resolveLemma({ text: "Αιλαμ", morph: "N-PRI", morphology: "robinson" })).toEqual({
      unresolved: "ambiguous between Αιλαμ, αιλαμ",
    });
  });

  it("should decline when the printed case and the Strong's number name different roots", () => {
    // 29 corpus words had exactly this shape until their numbers were
    // corrected: printed στεφάνῳ, a crown, while still carrying G4736, which
    // is Stephen. Neither clue outranks the other, so the map reports the
    // disagreement instead of picking the one that happens to be consulted.
    const result = resolveLemma({ text: "στεφάνῳ", morph: "N-DSM", strong: "G4736", morphology: "robinson" });
    expect(result).toEqual({
      unresolved: "the printed case says στέφανος and the Strong's number says Στέφανος",
    });
    expect(result).not.toHaveProperty("lemma");
  });

  it("should name both roots and write no lemma when nothing separates them", () => {
    // λέγω and ἔπω are two entries for one suppletive verb and εἶπεν is the
    // second aorist of both, so a node carrying no Strong's number offers
    // nothing to tell them apart — the answer is the question, not a coin
    // toss. 2,815 LXX1935 nodes are this one word.
    const result = resolveLemma({ text: "εἶπεν", morph: "V-2AAI-3S", morphology: "robinson" });
    expect(result).toEqual({ unresolved: "ambiguous between λέγω, ἔπω" });
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
