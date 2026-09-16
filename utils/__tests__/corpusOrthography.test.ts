import { describe, expect, it } from "vitest";
import { CorpusToken, declaredScheme } from "../corpusTokens";
import { formatOrthographyFinding, issuesInToken } from "../corpusOrthography";
import { decodeMorph } from "../morphology";
import { spellingsOf } from "../punctuation";

/**
 * Greek built from code points, never typed or pasted, the convention
 * `corpusTokens.test.ts` explains. It matters most here: this module's whole
 * subject is one combining mark, and a paste that silently normalized it would
 * test nothing.
 */
const greek = (...codes: number[]) => String.fromCharCode(...codes);

/** `ἕκτῃ`, the dative GEN 2:2 tags nominative. */
const HEKTEI = greek(0x1f15, 0x3ba, 0x3c4, 0x1fc3);
/** `ἕκτη`, the nominative of the same adjective. */
const HEKTE = greek(0x1f15, 0x3ba, 0x3c4, 0x3b7);
/** `τετάρτη`, the nominative GEN 1:19 tags dative. */
const TETARTE = greek(0x3c4, 0x3b5, 0x3c4, 0x3ac, 0x3c1, 0x3c4, 0x3b7);
/** `ἐργᾷ`, the verb EXO 20:9 tags as the neuter plural of `ἔργον`. */
const ERGAI = greek(0x1f10, 0x3c1, 0x3b3, 0x1fb7);
/** `ἔργα`, the actual neuter plural, printed four words later in that verse. */
const ERGA = greek(0x1f14, 0x3c1, 0x3b3, 0x3b1);
/** `Φαραω`, an unaccented Semitic name that stands in the dative. */
const PHARAO = greek(0x3a6, 0x3b1, 0x3c1, 0x3b1, 0x3c9);
/** `πόλει`, a third-declension dative, which the rule must leave alone. */
const POLEI = greek(0x3c0, 0x3cc, 0x3bb, 0x3b5, 0x3b9);
/** `καὶ`, which states no case at all. */
const KAI = greek(0x3ba, 0x3b1, 0x1f76);
/** `ἀρχῇ`, the dative GEN 1:1 tags correctly. */
const ARCHEI = greek(0x1f00, 0x3c1, 0x3c7, 0x1fc7);

const scheme = declaredScheme("LXX1935")!.scheme;

/** One token, with the real scheme reading its codes. */
const token = (text: string, ...morphs: string[]): CorpusToken => ({
  text,
  spellings: spellingsOf(text).filter(Boolean),
  readings: morphs.map((morph) => ({ morph, parse: decodeMorph(morph, scheme) })),
});

describe("issuesInToken, a iota subscript marks the dative singular", () => {
  it("refutes a nominative on a word ending in a subscript", () => {
    const issues = issuesInToken(token(HEKTEI, "A-NSF"));
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("subscript-is-dative-singular");
    expect(issues[0].states).toBe("nom sg");
    expect(issues[0].allows).toBe("dat sg");
  });

  it("accepts a dative on the same word", () => {
    expect(issuesInToken(token(HEKTEI, "A-DSF"))).toEqual([]);
    expect(issuesInToken(token(ARCHEI, "N-DSF"))).toEqual([]);
  });

  it("refutes a plural, because the subscript marks the singular too", () => {
    const issues = issuesInToken(token(ERGAI, "N-APN"));
    expect(issues).toHaveLength(1);
    expect(issues[0].states).toBe("acc pl");
  });

  it("leaves the same lemma's real neuter plural alone", () => {
    expect(issuesInToken(token(ERGA, "N-APN"))).toEqual([]);
  });

  it("reads the subscript whether the word is composed or decomposed", () => {
    const decomposed = HEKTEI.normalize("NFD");
    expect(decomposed).not.toBe(HEKTEI);
    expect(issuesInToken(token(decomposed, "A-NSF"))).toHaveLength(1);
  });

  it("reads through trailing punctuation", () => {
    expect(issuesInToken(token(`${HEKTEI},`, "A-NSF"))).toHaveLength(1);
  });
});

describe("issuesInToken, a bare vowel is not the dative singular", () => {
  it("refutes a dative on a word ending in a bare eta", () => {
    const issues = issuesInToken(token(TETARTE, "A-DSF"));
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("bare-vowel-is-not-dative-singular");
    expect(issues[0].states).toBe("dat sg");
    expect(issues[0].allows).toBe("anything but dat sg");
  });

  it("accepts a nominative on the same word", () => {
    expect(issuesInToken(token(TETARTE, "A-NSF"))).toEqual([]);
    expect(issuesInToken(token(HEKTE, "A-NSF"))).toEqual([]);
  });

  it("says nothing about a third-declension dative", () => {
    expect(issuesInToken(token(POLEI, "N-DSF"))).toEqual([]);
  });
});

describe("issuesInToken, the two exemptions", () => {
  it("skips an unaccented word, which Rahlfs prints only for indeclinables", () => {
    expect(issuesInToken(token(PHARAO, "N-DSM"))).toEqual([]);
  });

  it("skips a reading that states no case", () => {
    expect(issuesInToken(token(KAI, "CONJ"))).toEqual([]);
  });

  it("reports each refuted reading of a word carrying several", () => {
    expect(issuesInToken(token(HEKTEI, "A-NSF", "A-ASF"))).toHaveLength(2);
    expect(issuesInToken(token(HEKTEI, "A-NSF", "A-DSF"))).toHaveLength(1);
  });
});

describe("formatOrthographyFinding", () => {
  it("names the place, the word, the code and both sides of the rule", () => {
    const [issue] = issuesInToken(token(HEKTEI, "A-NSF"));
    const line = formatOrthographyFinding({
      ...issue,
      file: "01-GEN.json",
      book: "GEN",
      chapter: 2,
      verse: 2,
    });
    expect(line).toBe(`GEN 2:2 ${HEKTEI} A-NSF states nom sg, ending allows dat sg`);
  });
});
