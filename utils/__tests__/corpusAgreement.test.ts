import { describe, expect, it } from "vitest";
import { CorpusToken, declaredScheme } from "../corpusTokens";
import {
  agreementInSequence,
  formatAgreementFinding,
} from "../corpusAgreement";
import { decodeMorph } from "../morphology";
import { spellingsOf } from "../punctuation";

/**
 * Greek built from code points, never typed or pasted, the convention
 * `corpusTokens.test.ts` explains.
 */
const greek = (...codes: number[]) => String.fromCharCode(...codes);

/** `τὸ`, which the codex holds as both nominative and accusative. */
const TO = greek(0x3c4, 0x1f78);
/** `πνεῦμα`, held both ways as well, so the two can be reconciled. */
const PNEUMA = greek(0x3c0, 0x3bd, 0x3b5, 0x1fe6, 0x3bc, 0x3b1);
/** `τῷ`, held only as a dative. */
const TOI = greek(0x3c4, 0x1ff7);
/** `θεός`, held only as a nominative, as its ending allows nothing else. */
const THEOS = greek(0x3b8, 0x3b5, 0x3cc, 0x3c2);
/** `τὰ`, the neuter plural article. */
const TA = greek(0x3c4, 0x1f70);
/** `βοτρύδια`, the noun it governs at ISA 18:5. */
const BOTRYDIA = greek(0x3b2, 0x3bf, 0x3c4, 0x3c1, 0x3cd, 0x3b4, 0x3b9, 0x3b1);
/** `μικρὰ`, the adjective ISA 18:5 tags `A-NSF`. */
const MIKRA = greek(0x3bc, 0x3b9, 0x3ba, 0x3c1, 0x1f70);
/** `μεγάλα`, the adjective coordinated with it at 2CH 36:18. */
const MEGALA = greek(0x3bc, 0x3b5, 0x3b3, 0x3ac, 0x3bb, 0x3b1);
/** `καὶ`, the conjunction between them. */
const KAI = greek(0x3ba, 0x3b1, 0x1f76);
/** `τοῦ`, the masculine and neuter genitive article. */
const TOU = greek(0x3c4, 0x3bf, 0x1fe6);
/** `Βααλ`, which the codex holds as indeclinable and nothing else. */
const BAAL = greek(0x392, 0x3b1, 0x3b1, 0x3bb);
/** `τῆς`, the feminine genitive article. */
const TES = greek(0x3c4, 0x1fc6, 0x3c2);
/** `Καίσαρος`, the dependent genitive of PHP 4:22. */
const KAISAROS = greek(0x39a, 0x3b1, 0x3af, 0x3c3, 0x3b1, 0x3c1, 0x3bf, 0x3c2);
/** `οἰκίας`, the noun that article actually heads. */
const OIKIAS = greek(0x3bf, 0x1f30, 0x3ba, 0x3af, 0x3b1, 0x3c2);
/** `ὄρη`, the accusative subject inside PSA 89:2's articular infinitive. */
const ORE = greek(0x1f44, 0x3c1, 0x3b7);
/** `γενηθῆναι`, the infinitive that article belongs to. */
const GENETHENAI = greek(
  0x3b3,
  0x3b5,
  0x3bd,
  0x3b7,
  0x3b8,
  0x1fc6,
  0x3bd,
  0x3b1,
  0x3b9,
);
/** `μικρῷ`, the dative inside 2MC 9:10's accusative phrase. */
const MIKROI = greek(0x3bc, 0x3b9, 0x3ba, 0x3c1, 0x1ff7);

const scheme = declaredScheme("LXX1935")!.scheme;

/** One token, with the real scheme reading its codes. */
const token = (text: string, ...morphs: string[]): CorpusToken => ({
  text,
  spellings: spellingsOf(text).filter(Boolean),
  readings: morphs.map((morph) => ({
    morph,
    parse: decodeMorph(morph, scheme),
  })),
});

describe("agreementInSequence, article against its noun", () => {
  it("should report an adjacent pair the codex could have reconciled and the corpus did not", () => {
    const { issues, pairs, reconcilable } = agreementInSequence([
      token(TO, "T-NSN"),
      token(` ${PNEUMA}`, "N-ASN"),
    ]);

    expect(pairs).toBe(1);
    expect(reconcilable).toBe(1);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: "article/noun",
      words: [TO, PNEUMA],
      codes: [["T-NSN"], ["N-ASN"]],
      disagreeing: ["case"],
    });
  });

  it("should leave an agreeing pair alone", () => {
    expect(
      agreementInSequence([token(TO, "T-NSN"), token(` ${PNEUMA}`, "N-NSN")])
        .issues,
    ).toEqual([]);
  });

  it("should count but never report a pair the codex cannot reconcile", () => {
    // `θεός` is held as a nominative and nothing else, so no pair of cells
    // agrees and this rule stays quiet rather than guessing which word is
    // wrong. The silence hides real defects whenever the map is the thing at
    // fault, which is why `corpusOrthography.ts` asks the map nothing.
    const { issues, pairs, reconcilable } = agreementInSequence([
      token(TOI, "T-DSM"),
      token(` ${THEOS}`, "N-NSM"),
    ]);

    expect(pairs).toBe(1);
    expect(reconcilable).toBe(0);
    expect(issues).toEqual([]);
  });

  it("should count but never report a pair whose noun the codex holds only as an indeclinable", () => {
    // `Βααλ` has no case marking in the codex, so the corpus tagging it
    // feminine is a claim the codex can neither confirm nor deny. That is a
    // question about the map, which this rule does not ask.
    const { issues, pairs, reconcilable } = agreementInSequence([
      token(TOU, "T-GSM"),
      token(` ${BAAL}`, "N-GSF"),
    ]);

    expect(pairs).toBe(1);
    expect(reconcilable).toBe(0);
    expect(issues).toEqual([]);
  });

  it("should take agreement on any parse of a twice-parsed word", () => {
    // JAS 4:5's own shape: `τὸ` is printed once and parsed T-NSN and T-ASN.
    expect(
      agreementInSequence([
        token(TO, "T-NSN", "T-ASN"),
        token(` ${PNEUMA}`, "N-ASN"),
      ]).issues,
    ).toEqual([]);
  });

  it("should not pair an article with a noun that is not next to it", () => {
    expect(
      agreementInSequence([
        token(TO, "T-NSN"),
        token(` ${KAI}`, "CONJ"),
        token(` ${PNEUMA}`, "N-ASN"),
      ]).pairs,
    ).toBe(0);
  });

  it("should not pair an article with an indeclinable noun, which has no case marking", () => {
    expect(
      agreementInSequence([token(TO, "T-NSN"), token(` ${PNEUMA}`, "N-PRI")])
        .pairs,
    ).toBe(0);
  });

  it("should not pair an article with a dependent genitive standing in front of its own noun", () => {
    // `τῆς Καίσαρος οἰκίας` is "the household of Caesar". The article heads
    // `οἰκίας` and the genitive between them is nobody's agreement partner, so
    // there is no pair here to judge.
    expect(
      agreementInSequence([
        token(TES, "T-GSF"),
        token(` ${KAISAROS}`, "N-GSM"),
        token(` ${OIKIAS}`, "N-GSF"),
      ]).pairs,
    ).toBe(0);
  });

  it("should not pair an article that belongs to an infinitive", () => {
    // `τοῦ ὄρη γενηθῆναι` is "for the mountains to be made". The article goes
    // with `γενηθῆναι`, which states no case of its own, and the accusative
    // between them is the infinitive's subject.
    expect(
      agreementInSequence([
        token(TOU, "T-GSN"),
        token(` ${ORE}`, "N-APN"),
        token(` ${GENETHENAI}`, "V-AON"),
      ]).pairs,
    ).toBe(0);
  });

  it("should still pair an article with its noun when the word after agrees with neither", () => {
    // The guard must fire only on a word the article could actually head, or
    // it would silence the rule wherever a phrase happens to be three words
    // long. `θεός` is nominative masculine and this article is neuter.
    const { issues, pairs } = agreementInSequence([
      token(TO, "T-NSN"),
      token(` ${PNEUMA}`, "N-ASN"),
      token(` ${THEOS}`, "N-NSM"),
    ]);

    expect(pairs).toBe(1);
    expect(issues).toHaveLength(1);
  });
});

describe("agreementInSequence, the adjective between an article and its noun", () => {
  it("should report an adjective disagreeing with an article and noun that already agree", () => {
    const { issues } = agreementInSequence([
      token(TA, "T-APN"),
      token(` ${MIKRA}`, "A-NSF"),
      token(` ${BOTRYDIA}`, "N-APN"),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: "article/adjective/noun",
      words: [TA, MIKRA, BOTRYDIA],
      codes: [["T-APN"], ["A-NSF"], ["N-APN"]],
    });
    expect(issues[0].disagreeing.sort()).toEqual(["case", "gender", "number"]);
  });

  it("should say nothing when the article and noun do not themselves agree", () => {
    // Nothing anchors the adjective, so which of the three is wrong is open.
    expect(
      agreementInSequence([
        token(TA, "T-APN"),
        token(` ${MIKRA}`, "A-NSF"),
        token(` ${PNEUMA}`, "N-NSN"),
      ]).issues,
    ).toEqual([]);
  });

  it("should never judge an adjective standing beside a noun on its own", () => {
    // Bare adjective/noun neighbours disagree far too often to be corpus rot,
    // and the disagreements are Greek: adjectives go substantival,
    // predicative, comparative with a genitive of comparison.
    expect(
      agreementInSequence([
        token(MIKRA, "A-NSF"),
        token(` ${BOTRYDIA}`, "N-APN"),
      ]).issues,
    ).toEqual([]);
  });
});

describe("agreementInSequence, an article against a substantival adjective", () => {
  it("should report an adjective no noun completes that disagrees with its article", () => {
    // `τὰ μικρά` with nothing after it is "the small [things]", so the article
    // is the only thing the adjective has to agree with.
    const { issues } = agreementInSequence([
      token(TA, "T-APN"),
      token(` ${MIKRA}`, "A-NSF"),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: "article/adjective",
      words: [TA, MIKRA],
      disagreeing: ["case", "number", "gender"],
    });
  });

  it("should leave an agreeing pair alone", () => {
    expect(
      agreementInSequence([token(TA, "T-APN"), token(` ${MIKRA}`, "A-APN")])
        .issues,
    ).toEqual([]);
  });

  it("should say nothing when a noun after the adjective completes it", () => {
    // `τὰ μικρὰ βοτρύδια` puts the adjective with its own noun, and the two
    // share case and number, so any quarrel is between those two rather than
    // with the article. The article/adjective/noun rule owns that shape.
    expect(
      agreementInSequence([
        token(TA, "T-APN"),
        token(` ${MIKRA}`, "A-NPN"),
        token(` ${BOTRYDIA}`, "N-NPN"),
      ]).issues.filter((issue) => issue.rule === "article/adjective"),
    ).toEqual([]);
  });

  it("should say nothing about an oblique adjective the article is not oblique with", () => {
    // `2MC 9:6 τὸν πολλαῖς ... συμφοραῖς ... βασανίσαντα` puts a dative phrase
    // inside an accusative one. The dative owes the article nothing.
    expect(
      agreementInSequence([token(TO, "T-ASN"), token(` ${MIKROI}`, "A-DSM")])
        .issues,
    ).toEqual([]);
  });
});

describe("agreementInSequence, one article against another", () => {
  it("should report a second-attributive article matching no noun phrase before it", () => {
    // `τὰ βοτρύδια τὰ μικρά`, the second article tagged nominative inside an
    // accusative phrase. ISA 18:5 prints this phrase but tags both articles
    // `T-APN` and mis-tags the adjective instead, so the rule stays quiet
    // there; it fires only when the repeated article is the word that differs.
    const { issues } = agreementInSequence([
      token(TA, "T-APN"),
      token(` ${BOTRYDIA}`, "N-APN"),
      token(` ${TA}`, "T-NPN"),
      token(` ${MIKRA}`, "A-NSF"),
    ]);

    expect(
      issues.filter((issue) => issue.rule === "article/article"),
    ).toHaveLength(1);
    expect(
      issues.find((issue) => issue.rule === "article/article"),
    ).toMatchObject({
      words: [TA, BOTRYDIA, TA],
      codes: [["T-APN"], ["N-APN"], ["T-NPN"]],
      disagreeing: ["case"],
    });
  });

  it("should report one across a coordinating conjunction", () => {
    // The coordinated shape `τὰ … τὰ μεγάλα καὶ τὰ μικρά`, which 2CH 36:18 and
    // 1ES 1:51 print with their articles agreeing, as above.
    const { issues } = agreementInSequence([
      token(TA, "T-APN"),
      token(` ${BOTRYDIA}`, "N-APN"),
      token(` ${TA}`, "T-APN"),
      token(` ${MEGALA}`, "A-APN"),
      token(` ${KAI}`, "CONJ"),
      token(` ${TA}`, "T-NPN"),
      token(` ${MIKRA}`, "A-NSF"),
    ]);

    const articles = issues.filter((issue) => issue.rule === "article/article");
    expect(articles).toHaveLength(1);
    expect(articles[0].codes[2]).toEqual(["T-NPN"]);
  });

  it("should leave two articles printed differently alone, which are likelier two phrases", () => {
    // `ἐχθροὶ τοῦ ἀνθρώπου οἱ οἰκιακοὶ αὐτοῦ` prints article, noun, article,
    // adjective and is two phrases. Greek repeats the *same* article to hang a
    // second modifier on one noun, so a different one is the signal.
    expect(
      agreementInSequence([
        token(TOU, "T-GSM"),
        token(` ${PNEUMA}`, "N-GSM"),
        token(` ${TA}`, "T-NPN"),
        token(` ${MIKRA}`, "A-NSF"),
      ]).issues.filter((issue) => issue.rule === "article/article"),
    ).toEqual([]);
  });

  it("should leave a genitive article alone, which is a dependent rather than a second reading", () => {
    expect(
      agreementInSequence([
        token(TOU, "T-GSM"),
        token(` ${PNEUMA}`, "N-GSM"),
        token(` ${TOU}`, "T-GSN"),
        token(` ${MEGALA}`, "A-GSN"),
      ]).issues.filter((issue) => issue.rule === "article/article"),
    ).toEqual([]);
  });

  it("should leave an article heading a noun of its own alone, whatever its gender", () => {
    // `τὰ βοτρύδια καὶ τὸ πνεῦμα` — two coordinated phrases, not one.
    expect(
      agreementInSequence([
        token(TA, "T-APN"),
        token(` ${BOTRYDIA}`, "N-APN"),
        token(` ${KAI}`, "CONJ"),
        token(` ${TO}`, "T-NSN"),
        token(` ${PNEUMA}`, "N-NSN"),
      ]).issues.filter((issue) => issue.rule === "article/article"),
    ).toEqual([]);
  });

  it("should say nothing when no noun phrase stands before the article to anchor it", () => {
    expect(
      agreementInSequence([
        token(TA, "T-NPN"),
        token(` ${MIKRA}`, "A-NSF"),
      ]).issues.filter((issue) => issue.rule === "article/article"),
    ).toEqual([]);
  });

  it("should not reach across a word that ends the phrase", () => {
    // A word carrying no code at all, and LXX1935 has thousands, says nothing
    // about what it is, so nothing can be claimed across it.
    expect(
      agreementInSequence([
        token(TA, "T-APN"),
        token(` ${BOTRYDIA}`, "N-APN"),
        token(` ${KAI}`),
        token(` ${TA}`, "T-NPN"),
        token(` ${MIKRA}`, "A-NSF"),
      ]).issues.filter((issue) => issue.rule === "article/article"),
    ).toEqual([]);
  });
});

describe("formatAgreementFinding", () => {
  it("should print the words, their codes and what they disagree on", () => {
    const [issue] = agreementInSequence([
      token(TO, "T-NSN"),
      token(` ${PNEUMA}`, "N-ASN"),
    ]).issues;

    expect(
      formatAgreementFinding({
        file: "20-JAS.json",
        book: "JAS",
        chapter: 4,
        verse: 5,
        ...issue,
      }),
    ).toBe(
      `JAS 4:5 ${TO} [T-NSN] ${PNEUMA} [N-ASN] — article/noun disagree in case`,
    );
  });
});
