import { describe, expect, it } from "vitest";
import { cellsFor, corpusVerses, declaredScheme, verseSequences } from "../corpusTokens";
import Content from "../../types/Content";

/**
 * Every Greek letter is built from its code point, never typed or pasted. A
 * pasted polytonic word is a row of look-alikes in a diff — `ὸ` against `ό` is
 * one pixel — and a test asserting on the wrong one passes while asserting
 * nothing.
 */
const greek = (...codes: number[]) => String.fromCharCode(...codes);

/** `τὸ`, the neuter article. */
const TO = greek(0x3c4, 0x1f78);
/** `πνεῦμα`, the noun it governs at JAS 4:5. */
const PNEUMA = greek(0x3c0, 0x3bd, 0x3b5, 0x1fe6, 0x3bc, 0x3b1);
/** `καὶ`, the conjunction. */
const KAI = greek(0x3ba, 0x3b1, 0x1f76);

const scheme = declaredScheme("BYZ2026")!.scheme;

/** One verse's sequences from a bare content array, with the real scheme. */
const sequences = (content: unknown) => verseSequences(content as Content, scheme);

describe("declaredScheme", () => {
  it("should answer with the robinson scheme for a version declaring it", () => {
    const declared = declaredScheme("BYZ2026");
    expect(declared?.id).toBe("robinson");
    expect(declared?.scheme._id).toBe("robinson");
  });

  it("should answer with nothing for a version declaring no morphology", () => {
    expect(declaredScheme("KJV1769")).toBeNull();
  });

  it("should answer with nothing for a directory that is not a version", () => {
    expect(declaredScheme("no-such-version")).toBeNull();
  });
});

describe("verseSequences", () => {
  it("should give one token per printed word, in the order the verse prints them", () => {
    const tokens = sequences([
      { text: TO, morph: "T-NSN" },
      { text: ` ${PNEUMA}`, morph: "N-NSN" },
    ])[0];

    expect(tokens.map((token) => token.spellings[0])).toEqual([TO, PNEUMA]);
    expect(tokens[0].readings[0].parse).toEqual(["art", "nom", "sg", "neut"]);
    expect(tokens[1].readings[0].parse).toEqual(["noun", "nom", "sg", "neut"]);
  });

  it("should read a text-less code as a second parse of the word before it, not as a word of its own", () => {
    // JAS 4:5's own shape: `τὸ` is printed once and parsed twice.
    const tokens = sequences([
      { text: TO, morph: "T-NSN" },
      { morph: "T-ASN" },
      { text: ` ${PNEUMA}`, morph: "N-NSN" },
    ])[0];

    expect(tokens).toHaveLength(2);
    expect(tokens[0].readings.map((reading) => reading.morph)).toEqual(["T-NSN", "T-ASN"]);
    expect(tokens[0].readings[1].parse).toEqual(["art", "acc", "sg", "neut"]);
  });

  it("should drop a text-less code with no word before it rather than invent one", () => {
    const tokens = sequences([{ morph: "T-ASN" }, { text: PNEUMA, morph: "N-NSN" }])[0];

    expect(tokens).toHaveLength(1);
    expect(tokens[0].readings.map((reading) => reading.morph)).toEqual(["N-NSN"]);
  });

  it("should keep a word carrying no code as a token, so it still stands between its neighbours", () => {
    // 16,357 LXX1935 word nodes carry no `morph` at all. Skipping them would
    // make the words either side of one look adjacent when they are not.
    const tokens = sequences([
      { text: TO, morph: "T-NSN" },
      { text: ` ${KAI}` },
      { text: ` ${PNEUMA}`, morph: "N-NSN" },
    ])[0];

    expect(tokens).toHaveLength(3);
    expect(tokens[1].readings).toEqual([]);
  });

  it("should keep a code the scheme cannot read, with nothing decoded from it", () => {
    const tokens = sequences([{ text: TO, morph: "ZZ-NSN" }])[0];

    expect(tokens[0].readings[0].morph).toBe("ZZ-NSN");
    expect(tokens[0].readings[0].parse).toBeNull();
  });

  it("should carry each parse's own Strong's number", () => {
    const tokens = sequences([
      { text: TO, morph: "T-NSN", strong: "G3588" },
      { morph: "T-ASN", strong: "G3588" },
      { text: ` ${PNEUMA}`, morph: "N-NSN" },
    ])[0];

    expect(tokens[0].readings.map((reading) => reading.strong)).toEqual(["G3588", "G3588"]);
    expect(tokens[1].readings[0].strong).toBeUndefined();
  });

  it("should leave a footnote's own words out, and let the two words around it stay adjacent", () => {
    const tokens = sequences([
      { text: TO, morph: "T-NSN" },
      { foot: { type: "var", content: [{ text: KAI, morph: "CONJ" }] } },
      { text: ` ${PNEUMA}`, morph: "N-NSN" },
    ])[0];

    expect(tokens.map((token) => token.spellings[0])).toEqual([TO, PNEUMA]);
  });

  it("should treat a node holding no word at all as neither a token nor a separator", () => {
    const tokens = sequences([
      { text: TO, morph: "T-NSN" },
      " — ",
      { text: ` ${PNEUMA}`, morph: "N-NSN" },
    ])[0];

    expect(tokens.map((token) => token.spellings[0])).toEqual([TO, PNEUMA]);
  });

  it("should give a heading its own sequence, so its last word is not the body's neighbour", () => {
    const found = sequences([
      { heading: [{ text: TO, morph: "T-NSN" }] },
      { text: PNEUMA, morph: "N-NSN" },
    ]);

    expect(found).toHaveLength(2);
    expect(found.map((tokens) => tokens.map((token) => token.spellings[0]))).toContainEqual([TO]);
    expect(found.map((tokens) => tokens.map((token) => token.spellings[0]))).toContainEqual([PNEUMA]);
  });

  it("should offer both spellings of an elided word, the way the map is keyed", () => {
    const elided = greek(0x3bc, 0x3b5, 0x3b8, 0x2019);
    expect(sequences([{ text: elided, morph: "PREP" }])[0][0].spellings).toEqual([
      elided,
      greek(0x3bc, 0x3b5, 0x3b8),
    ]);
  });

  it("should answer with nothing for a verse printing no words", () => {
    expect(sequences([" ", { foot: { type: "var", content: ["x"] } }])).toEqual([]);
  });
});

describe("cellsFor", () => {
  it("should answer with what the codex holds for the printed word", () => {
    const [token] = sequences([{ text: ` ${PNEUMA},`, morph: "N-NSN" }])[0];

    expect(cellsFor(token).map((entry) => entry.root)).toEqual([PNEUMA, PNEUMA]);
  });

  it("should answer for the elided spelling as printed, mark and all", () => {
    // `μεθ’` is the spelling the map keys, elision mark included; the bare
    // `μεθ` is a key the codex does not hold at all.
    const [token] = sequences([{ text: greek(0x3bc, 0x3b5, 0x3b8, 0x2019), morph: "PREP" }])[0];

    expect(cellsFor(token).map((entry) => entry.root)).toEqual([
      greek(0x39c, 0x3b5, 0x3b8),
      greek(0x3bc, 0x3b5, 0x3c4, 0x3ac),
    ]);
  });

  it("should fall through to the bare spelling only when the elided one answers nothing", () => {
    const [token] = sequences([{ text: `${PNEUMA}${greek(0x2019)}`, morph: "N-NSN" }])[0];

    expect(token.spellings).toEqual([`${PNEUMA}${greek(0x2019)}`, PNEUMA]);
    expect(cellsFor(token).map((entry) => entry.root)).toEqual([PNEUMA, PNEUMA]);
  });

  it("should answer with nothing for a word the codex does not hold", () => {
    expect(cellsFor(sequences([{ text: "quidquid", morph: "N-NSN" }])[0][0])).toEqual([]);
  });
});

describe("corpusVerses", () => {
  it("should walk a version's verses in canonical order, tokens and all", () => {
    const first = corpusVerses("BYZ2026").next().value!;

    expect(first.file).toBe("01-MAT.json");
    expect(first.book).toBe("MAT");
    expect(first.chapter).toBe(1);
    expect(first.verse).toBe(1);
    expect(first.sequences[0].length).toBeGreaterThan(0);
  });

  it("should walk nothing at all for a version declaring no morphology", () => {
    expect([...corpusVerses("KJV1769")]).toEqual([]);
  });
});
