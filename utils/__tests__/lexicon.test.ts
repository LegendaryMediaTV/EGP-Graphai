import { describe, expect, it } from "vitest";
import {
  codexLookup,
  entriesFor,
  inflectionCategories,
  languageForScript,
  pronounce,
  pronunciationTable,
  resolveLemma,
  resolveStrongs,
  transliterateText,
  transliterationTable,
} from "../lexicon";

/**
 * The two Greek marks are written as escapes, inputs and expectations alike,
 * because they look exactly like a middle dot and an ASCII semicolon and NFC
 * rewrites one of them — a test asserting on a paste can pass while asserting
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
    // Measured, tokens across the two corpora take this path in quantity.
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
    // `dauíd` is what the codex stores against this spelling; see `lexicon.ts`.
    expect(transliterateText("Δαυὶδ", "G")).toBe("Dauìd");
    expect(transliterateText("Δαυὶδ", "G")).not.toBe("dauíd");
  });

  it("should transliterate each word of a multi-word node and carry the marks between them", () => {
    expect(transliterateText("Βοὸζ … Βοὸζ", "G")).toBe("Boòz … Boòz");
    expect(transliterateText(" Φακαρεθ – σαβιη,", "G")).toBe(
      " Phakareth – sabiē,",
    );
  });

  it("should capitalize a digraph whole in a word set entirely in capitals", () => {
    expect(transliterateText("ΜΑΤΘΑΙΟΝ", "G")).toBe("MATTHAION");
    expect(transliterateText("ΕΦΕΣΙΟΥΣ", "G")).toBe("EPHESIOUS");
    expect(transliterateText("ΑΠΟΚΑΛΥΨΙΣ", "G")).toBe("APOKALYPSIS");
  });

  it("should capitalize the macron vowels of an all-capital word", () => {
    // The registry writes eta as `ē` and omega as `ō`, so their capitals are
    // the precomposed `Ē` and `Ō` rather than a letter with a macron after it.
    expect(transliterateText("ΚΑΘΟΛΙΚΗ", "G")).toBe("KATHOLIKĒ");
    expect(transliterateText("ΙΩΑΝΝΟΥ", "G")).toBe("IŌANNOU");
  });

  it("should read a one-letter capital as a sentence's capital and not as a word set in capitals", () => {
    expect(transliterateText("Ὁ", "G")).toBe("Ho");
    expect(transliterateText("Ἡ", "G")).toBe("Hē");
    expect(transliterateText("Ὁ δὲ Ἰησοῦς εἶπεν", "G")).toBe(
      "Ho dè Iēsoûs eîpen",
    );
  });

  it("should keep a single leading capital's digraph as Th, not TH", () => {
    expect(transliterateText("Θεός", "G")).toBe("Theós");
    expect(transliterateText("θεός", "G")).toBe("theós");
    expect(transliterateText("Ματθαῖον", "G")).toBe("Matthaîon");
    expect(transliterateText("Ζαβδος", "G")).toBe("Zabdos");
    expect(transliterateText("οὗτος", "G")).toBe("hoûtos");
  });

  it("should transliterate a whole all-capital title as printed", () => {
    // Both strings are BYZ2026 book titles, read off `_version.json`, because
    // the words the rule has to answer for are these and not invented ones.
    expect(transliterateText("ΕΥΑΓΓΕΛΙΟΝ ΤΟ ΚΑΤΑ ΜΑΤΘΑΙΟΝ", "G")).toBe(
      "EUANGELION TO KATA MATTHAION",
    );
    expect(
      transliterateText("ΑΠΟΚΑΛΥΨΙΣ ΤΟΥ ΑΓΙΟΥ ΙΩΑΝΝΟΥ ΤΟΥ ΘΕΟΛΟΓΟΥ", "G"),
    ).toBe("APOKALYPSIS TOU AGIOU IŌANNOU TOU THEOLOGOU");
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

describe("pronounce", () => {
  const table = pronunciationTable("greek")!;
  const say = (text: string) => pronounce(text, table);

  it("should write the stressed syllable in capitals", () => {
    expect(say("ἀγάπη")).toBe("ah-GAH-pay");
    expect(say("λόγος")).toBe("LAW-gaws");
    expect(say("Ἰησοῦς")).toBe("ee-ay-SOOS");
  });

  it("should put the rough breathing before the vowel or diphthong it marks", () => {
    expect(say("ἁμαρτία")).toBe("hah-mahr-TEE-ah");
    // On the second letter of a diphthong, the whole diphthong is aspirated.
    expect(say("υἱός")).toBe("hwee-AWS");
  });

  it("should read a diphthong as one sound unless a diaeresis parts it", () => {
    expect(say("εἰρήνη")).toBe("ay-RAY-nay");
    expect(say("ἀΐδιος")).toBe("ah-EE-dee-aws");
  });

  it("should read gamma before a velar as a nasal", () => {
    expect(say("ἄγγελος")).toBe("AHN-geh-laws");
    expect(say("εὐαγγέλιον")).toBe("yoo-ahn-GEH-lee-awn");
  });

  it("should begin a syllable with a stop before λ or ρ, and split any other cluster", () => {
    expect(say("πατρός")).toBe("pah-TRAWS");
    // πτ begins πτωχός, but speech still splits it, as verse shows.
    expect(say("βαπτίζω")).toBe("bahp-TEE-zoh");
    expect(say("ἔθνος")).toBe("EHTH-naws");
    // A word-initial cluster stays whole.
    expect(say("πνεῦμα")).toBe("PNYOO-mah");
    // A doubled consonant always splits, and κλ still opens the next syllable.
    expect(say("ἐκκλησία")).toBe("ehk-klay-SEE-ah");
  });

  it("should say zeta as z, the Koine sound, wherever it stands", () => {
    expect(say("ζωή")).toBe("zoh-AY");
    expect(say("ἀγοράζω")).toBe("ah-gaw-RAH-zoh");
  });

  it("should leave the iota subscript silent", () => {
    expect(say("ᾠδή")).toBe("oh-DAY");
  });

  it("should say a phrase or a hyphenated name word by word, with a space between", () => {
    expect(say("Ἄρειος Πάγος")).toBe("AH-ray-aws PAH-gaws");
    expect(say("Ηλαμ-ααρ")).toBe("ay-lahm ah-ahr");
  });

  it("should answer null for a numeral, since the keraia is not said", () => {
    expect(say("ιβʹ")).toBeNull();
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
  // a name.
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
  // The root is lower case because the word is a common noun used as a title:
  // both corpora print it lower case almost without exception, and the
  // mid-clause capitals all stand directly after `Ἰησοῦς`.
  it("should answer with the only root the codex holds for the spelling", () => {
    expect(
      resolveLemma({
        text: " χριστοῦ,",
        morph: "N-GSM",
        morphology: "robinson",
      }),
    ).toEqual({
      lemma: "χριστός",
    });
  });

  it("should narrow two roots to one on the parse the morphology code states", () => {
    // The codex holds ἀγαθοποιῶν as a present participle of the verb
    // ἀγαθοποιέω and as a genitive plural of the adjective ἀγαθοποιός, and
    // only the first accounts for a participle.
    expect(
      resolveLemma({
        text: " ἀγαθοποιῶν",
        morph: "V-PAP-NSM",
        morphology: "robinson",
      }),
    ).toEqual({
      lemma: "ἀγαθοποιέω",
    });
  });

  it("should answer with the other root when the parse names the other part of speech", () => {
    expect(
      resolveLemma({
        text: " ἀγαθοποιῶν",
        morph: "A-GPM",
        morphology: "robinson",
      }),
    ).toEqual({
      lemma: "ἀγαθοποιός",
    });
  });

  it("should narrow two roots to one on the Strong's number the node already carries", () => {
    // The shield ἀσπίς¹ and the asp ἀσπίς² decline alike, so ἀσπίδα is the
    // same accusative singular under both. Only the asp carries a number
    // (G785), and a node carrying it can only be the asp.
    expect(
      resolveLemma({
        text: "ἀσπίδα",
        morph: "N-ASF",
        strong: "G785",
        morphology: "robinson",
      }),
    ).toEqual({
      lemma: "ἀσπίς²",
    });
    expect(
      resolveLemma({
        text: "ἀσπίδα",
        morph: "N-ASF",
        morphology: "robinson",
      }),
    ).toEqual({
      unresolved: "ambiguous between ἀσπίς², ἀσπίς¹",
    });
  });

  it("should rule a capitalised root out for a word the page printed in lower case", () => {
    // Ezekiel's temple vision calls a vestibule αιλαμ and the nation Elam is
    // Αιλαμ. The map holds both, both are indeclinable, and LXX1935 gives them
    // no Strong's number, so the printed case is the only thing left.
    expect(
      resolveLemma({ text: "αιλαμ", morph: "N-PRI", morphology: "robinson" }),
    ).toEqual({
      lemma: "αιλαμ",
    });
    // The capital says nothing: at the head of a verse it belongs to the
    // sentence.
    expect(
      resolveLemma({ text: "Αιλαμ", morph: "N-PRI", morphology: "robinson" }),
    ).toEqual({
      unresolved: "ambiguous between Αιλαμ, αιλαμ",
    });
  });

  it("should decline when the printed case and the Strong's number name different roots", () => {
    // 29 corpus words had exactly this shape until their numbers were
    // corrected: printed στεφάνῳ, a crown, while still carrying G4736, which
    // is Stephen. Neither clue outranks the other, so the map reports the
    // disagreement instead of picking the one that happens to be consulted.
    const result = resolveLemma({
      text: "στεφάνῳ",
      morph: "N-DSM",
      strong: "G4736",
      morphology: "robinson",
    });
    expect(result).toEqual({
      unresolved:
        "the printed case says στέφανος and the Strong's number says Στέφανος",
    });
    expect(result).not.toHaveProperty("lemma");
  });

  it("should name both roots and write no lemma when nothing separates them", () => {
    // The indeclinable Ἰουδά and the declinable Ἰούδας both print Ιουδα, so a
    // node carrying no Strong's number offers nothing to tell them apart — the
    // answer is the question, not a coin toss. 486 LXX1935 nodes are this one
    // word.
    const result = resolveLemma({
      text: " Ιουδα",
      morph: "N-PRI",
      morphology: "robinson",
    });
    expect(result).toEqual({ unresolved: "ambiguous between Ἰουδά, Ἰούδας" });
    expect(result).not.toHaveProperty("lemma");
  });

  it("should say so when the map holds no such spelling", () => {
    expect(
      resolveLemma({ text: "κτήνην", morph: "N-ASF", morphology: "robinson" }),
    ).toEqual({
      unresolved: "the map holds no such spelling",
    });
  });

  it("should say so when the scheme cannot read the morphology code", () => {
    expect(
      resolveLemma({ text: "ἀσπίδα", morph: "ZZZ-9", morphology: "robinson" }),
    ).toEqual({
      unresolved: "robinson cannot read this code",
    });
  });

  it("should say so when no morphology scheme is declared to read the code with", () => {
    expect(resolveLemma({ text: "ἀσπίδα", morph: "N-ASF" })).toEqual({
      unresolved: "no morphology scheme is declared to read this code",
    });
  });

  it("should decline a node holding more than one word rather than guess which is the lemma", () => {
    expect(
      resolveLemma({
        text: " Φακαρεθ – σαβιη,",
        morph: "N-PRI",
        morphology: "robinson",
      }),
    ).toEqual({
      unresolved: "more than one word, so no single lemma",
    });
  });
});

describe("resolveStrongs", () => {
  it("should answer with the root's own number when it carries exactly one", () => {
    expect(
      resolveStrongs({
        lemma: "λόγος",
        text: " λόγος",
        morph: "N-NSM",
        morphology: "robinson",
      }),
    ).toEqual({
      strong: "G3056",
    });
  });

  it("should narrow a root carrying sixteen numbers on the parse an index rule requires", () => {
    expect(
      resolveStrongs({
        lemma: "εἰμί",
        text: " ἐστίν",
        morph: "V-PAI-3S",
        morphology: "robinson",
      }),
    ).toEqual({
      strong: "G2076",
    });
  });

  it("should read two rules naming one number as that number, not as a conflict", () => {
    // ἐμέ and ἐμὲ are two rules that differ only in a grave for an acute, and
    // codexLookup folds them together, so both match one node.
    expect(
      resolveStrongs({
        lemma: "ἐγώ",
        text: " ἐμὲ",
        morph: "P-1AS",
        morphology: "robinson",
      }),
    ).toEqual({
      strong: "G1691",
    });
    expect(
      resolveStrongs({
        lemma: "ἐγώ",
        text: " ἐμέ",
        morph: "P-1AS",
        morphology: "robinson",
      }),
    ).toEqual({
      strong: "G1691",
    });
  });

  it("should let a rule naming a spelling outrank a rule naming only a parse", () => {
    // λέγω's aorist passive takes G4483 by parse, since its forms are built on
    // ῥη-, but λεχθέντα is built on λεγ- and a spelling rule gives it G3004.
    expect(
      resolveStrongs({
        lemma: "λέγω",
        text: " λεχθέντα",
        morph: "V-APP-APN",
        morphology: "robinson",
      }),
    ).toEqual({
      strong: "G3004",
    });
    expect(
      resolveStrongs({
        lemma: "λέγω",
        text: " ῥηθέντα",
        morph: "V-APP-APN",
        morphology: "robinson",
      }),
    ).toEqual({
      strong: "G4483",
    });
  });

  it("should take the number the codex places on the cell itself when no rule covers it", () => {
    // καλός carries G2566 and G2570 and no index rule mentions it, but the
    // codex places G2570 on this spelling's own cells.
    expect(
      resolveStrongs({
        lemma: "καλός",
        text: " καλόν.",
        morph: "A-ASM",
        morphology: "robinson",
      }),
    ).toEqual({
      strong: "G2570",
    });
  });

  it("should write nothing when the root's numbers are an array neither a rule nor a cell narrows", () => {
    expect(
      resolveStrongs({
        lemma: "καλός",
        text: " καλαί",
        morph: "A-NPF",
        morphology: "robinson",
      }),
    ).toEqual({
      unresolved: "root-level index is an array no rule narrows",
    });
  });

  it("should write nothing when the root carries no number at all", () => {
    expect(
      resolveStrongs({
        lemma: "ἀκατασκεύαστος",
        text: " ἀκατασκεύαστος,",
        morph: "A-NSM",
        morphology: "robinson",
      }),
    ).toEqual({ unresolved: "the root carries no Strong's number" });
  });

  it("should say so when the lemma is not a root the codex holds", () => {
    // The lemma is invented rather than borrowed from a corpus: every lemma
    // either corpus names is a root, and one the codex merely happens not to
    // hold stops standing for this case the day the codex gains it.
    const notAWord = "ξζϙωπ";
    expect(
      resolveStrongs({
        lemma: notAWord,
        text: ` ${notAWord}`,
        morph: "N-APF",
        morphology: "robinson",
      }),
    ).toEqual({ unresolved: "lemma is not a root in the codex" });
  });
});
