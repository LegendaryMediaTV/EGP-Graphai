import { describe, expect, it } from "vitest";
import { CorpusToken, declaredScheme } from "../corpusTokens";
import { agreementInSequence, formatAgreementFinding } from "../corpusAgreement";
import { decodeMorph } from "../morphology";
import { spellingsOf } from "../punctuation";

/**
 * Every Greek letter is built from its code point, never typed or pasted — see
 * the note in `corpusTokens.test.ts`.
 */
const greek = (...codes: number[]) => String.fromCharCode(...codes);

/** `τὸ`, which the codex holds as both nominative and accusative. */
const TO = greek(0x3c4, 0x1f78);
/** `πνεῦμα`, held both ways as well, so the two can be reconciled. */
const PNEUMA = greek(0x3c0, 0x3bd, 0x3b5, 0x1fe6, 0x3bc, 0x3b1);
/** `τῇ`, held only as a dative. */
const TEI = greek(0x3c4, 0x1fc7);
/** `ἀδελφῇ`, held only as a nominative — the map defect behind 63 corpus rows. */
const ADELPHEI = greek(0x1f00, 0x3b4, 0x3b5, 0x3bb, 0x3c6, 0x1fc7);
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

const scheme = declaredScheme("LXX1935")!.scheme;

/** One token, with the real scheme reading its codes. */
const token = (text: string, ...morphs: string[]): CorpusToken => ({
  text,
  spellings: spellingsOf(text).filter(Boolean),
  readings: morphs.map((morph) => ({ morph, parse: decodeMorph(morph, scheme) })),
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
    expect(agreementInSequence([token(TO, "T-NSN"), token(` ${PNEUMA}`, "N-NSN")]).issues).toEqual([]);
  });

  it("should count but never report a pair the codex cannot reconcile", () => {
    // `ἀδελφῇ` is held as a nominative and nothing else, so no pair of cells
    // agrees and the corpus is faithfully copying the map. Correcting the
    // corpus first would turn a silent defect into a failing morphology audit.
    const { issues, pairs, reconcilable } = agreementInSequence([
      token(TEI, "T-DSF"),
      token(` ${ADELPHEI}`, "N-NSF"),
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
      agreementInSequence([token(TO, "T-NSN", "T-ASN"), token(` ${PNEUMA}`, "N-ASN")]).issues
    ).toEqual([]);
  });

  it("should not pair an article with a noun that is not next to it", () => {
    expect(
      agreementInSequence([token(TO, "T-NSN"), token(` ${KAI}`, "CONJ"), token(` ${PNEUMA}`, "N-ASN")])
        .pairs
    ).toBe(0);
  });

  it("should not pair an article with an indeclinable noun, which has no case marking", () => {
    expect(agreementInSequence([token(TO, "T-NSN"), token(` ${PNEUMA}`, "N-PRI")]).pairs).toBe(0);
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
      ]).issues
    ).toEqual([]);
  });

  it("should never judge an adjective standing beside a noun on its own", () => {
    // 17.91% of BYZ2026's bare adjective/noun neighbours disagree and 35.55% of
    // LXX1935's, and that is Greek rather than corpus rot: adjectives go
    // substantival, predicative, comparative with a genitive of comparison.
    expect(agreementInSequence([token(MIKRA, "A-NSF"), token(` ${BOTRYDIA}`, "N-APN")]).issues).toEqual(
      []
    );
  });
});

describe("agreementInSequence, one article against another", () => {
  it("should report a second-attributive article matching no noun phrase before it", () => {
    // ISA 18:5's own shape: `τὰ βοτρύδια τὰ μικρά`, the second article tagged
    // nominative inside an accusative phrase.
    const { issues } = agreementInSequence([
      token(TA, "T-APN"),
      token(` ${BOTRYDIA}`, "N-APN"),
      token(` ${TA}`, "T-NPN"),
      token(` ${MIKRA}`, "A-NSF"),
    ]);

    expect(issues.filter((issue) => issue.rule === "article/article")).toHaveLength(1);
    expect(issues.find((issue) => issue.rule === "article/article")).toMatchObject({
      words: [TA, BOTRYDIA, TA],
      codes: [["T-APN"], ["N-APN"], ["T-NPN"]],
      disagreeing: ["case"],
    });
  });

  it("should report one across a coordinating conjunction", () => {
    // 2CH 36:18 and 1ES 1:51: `τὰ … τὰ μεγάλα καὶ τὰ μικρά`.
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
      ]).issues.filter((issue) => issue.rule === "article/article")
    ).toEqual([]);
  });

  it("should leave a genitive article alone, which is a dependent rather than a second reading", () => {
    expect(
      agreementInSequence([
        token(TOU, "T-GSM"),
        token(` ${PNEUMA}`, "N-GSM"),
        token(` ${TOU}`, "T-GSN"),
        token(` ${MEGALA}`, "A-GSN"),
      ]).issues.filter((issue) => issue.rule === "article/article")
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
      ]).issues.filter((issue) => issue.rule === "article/article")
    ).toEqual([]);
  });

  it("should say nothing when no noun phrase stands before the article to anchor it", () => {
    expect(
      agreementInSequence([token(TA, "T-NPN"), token(` ${MIKRA}`, "A-NSF")]).issues
    ).toEqual([]);
  });

  it("should not reach across a word that ends the phrase", () => {
    // A word carrying no code at all — 16,357 of them in LXX1935 — says nothing
    // about what it is, so nothing can be claimed across it.
    expect(
      agreementInSequence([
        token(TA, "T-APN"),
        token(` ${BOTRYDIA}`, "N-APN"),
        token(` ${KAI}`),
        token(` ${TA}`, "T-NPN"),
        token(` ${MIKRA}`, "A-NSF"),
      ]).issues
    ).toEqual([]);
  });
});

describe("formatAgreementFinding", () => {
  it("should print the words, their codes and what they disagree on", () => {
    const [issue] = agreementInSequence([token(TO, "T-NSN"), token(` ${PNEUMA}`, "N-ASN")]).issues;

    expect(
      formatAgreementFinding({ file: "20-JAS.json", book: "JAS", chapter: 4, verse: 5, ...issue })
    ).toBe(`JAS 4:5 ${TO} [T-NSN] ${PNEUMA} [N-ASN] — article/noun disagree in case`);
  });
});
