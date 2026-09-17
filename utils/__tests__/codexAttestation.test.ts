import { describe, expect, it } from "vitest";
import { CorpusVerse, declaredScheme, verseSequences } from "../corpusTokens";
import {
  auditCodexAttestation,
  formatCellContradiction,
} from "../codexAttestation";
import Content from "../../types/Content";

/**
 * Every Greek letter is built from its code point, never typed or pasted — see
 * the note in `corpusTokens.test.ts`.
 */
const greek = (...codes: number[]) => String.fromCharCode(...codes);

/** `πνεῦμα`, held in `greek/pi.json` under one root carrying G4151. */
const PNEUMA = greek(0x3c0, 0x3bd, 0x3b5, 0x1fe6, 0x3bc, 0x3b1);
/** `οὐαί`, whose root is an interjection holding a noun cell. G3759. */
const OUAI = greek(0x3bf, 0x1f50, 0x3b1, 0x3af);
/** `καί`, the conjunction. */
const KAI = greek(0x3ba, 0x3b1, 0x3af);
/** `αβακ`, one of the 63% of codex roots carrying no Strong's number at all. */
const ABAK = greek(0x3b1, 0x3b2, 0x3b1, 0x3ba);

const scheme = declaredScheme("BYZ2026")!.scheme;

/** One synthetic verse, so a rule is tested against the real codex and no corpus. */
const verse = (...nodes: unknown[]): CorpusVerse => ({
  version: "BYZ2026",
  file: "01-MAT.json",
  book: "MAT",
  chapter: 1,
  verse: 1,
  sequences: verseSequences(nodes as Content, scheme),
});

describe("auditCodexAttestation", () => {
  it("should flag a cell whose every attesting node carries a number its root does not", () => {
    const { contradictions } = auditCodexAttestation([
      verse({ text: PNEUMA, morph: "N-NSN", strong: "G9999" }),
    ]);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]).toMatchObject({
      file: "greek/pi.json",
      root: PNEUMA,
      pos: "noun",
      rootStrongs: ["G4151"],
      spelling: PNEUMA,
      parse: ["noun", "nom", "sg", "neut"],
      nodes: 1,
      sole: 1,
      carried: [{ number: "G9999", nodes: 1 }],
    });
  });

  it("should leave a cell alone when one attesting node carries a number the root holds", () => {
    // The whole restraint of the rule: one node agreeing is enough, because the
    // claim is "the index places this cell somewhere else entirely".
    const { contradictions } = auditCodexAttestation([
      verse({ text: PNEUMA, morph: "N-NSN", strong: "G9999" }),
      verse({ text: PNEUMA, morph: "N-NSN", strong: "G4151" }),
    ]);

    expect(contradictions).toEqual([]);
  });

  it("should leave a cell alone when no attesting node carries a number at all", () => {
    const { contradictions } = auditCodexAttestation([
      verse({ text: PNEUMA, morph: "N-NSN" }),
    ]);

    expect(contradictions).toEqual([]);
  });

  it("should leave a cell alone when its root carries no number to be contradicted", () => {
    const { contradictions } = auditCodexAttestation([
      verse({ text: ABAK, morph: "N-OI", strong: "G9999" }),
    ]);

    expect(contradictions).toEqual([]);
  });

  it("should leave a legitimate cross-part-of-speech cell alone when the corpus number agrees", () => {
    // `οὐαί (inj) / οὐαί [noun indecl-other]` is the four-token cell a cleanup
    // pass once deleted as though a script had put it there. A rule that read
    // the parts of speech instead of the numbers would flag it and hundreds
    // like it, which the registry's `posReadings` deliberately permits.
    const { contradictions } = auditCodexAttestation([
      verse({ text: OUAI, morph: "N-OI", strong: "G3759" }),
    ]);

    expect(contradictions).toEqual([]);
  });

  it("should count every node a cell explains, and how many it alone explains", () => {
    const { contradictions } = auditCodexAttestation([
      verse(
        { text: PNEUMA, morph: "N-NSN", strong: "G9999" },
        { text: ` ${PNEUMA}`, morph: "N-NSN", strong: "G8888" },
      ),
    ]);

    expect(contradictions[0]).toMatchObject({ nodes: 2, sole: 2 });
    expect(contradictions[0].carried).toEqual([
      { number: "G8888", nodes: 1 },
      { number: "G9999", nodes: 1 },
    ]);
  });

  it("should read a text-less second parse as its own attestation of its own cell", () => {
    const { contradictions } = auditCodexAttestation([
      verse(
        { text: PNEUMA, morph: "N-NSN", strong: "G9999" },
        { morph: "N-ASN", strong: "G9999" },
      ),
    ]);

    expect(contradictions.map((found) => found.parse.join(" "))).toEqual([
      "noun acc sg neut",
      "noun nom sg neut",
    ]);
  });

  it("should count the versions and the tagged words the evidence came from", () => {
    const audit = auditCodexAttestation([
      verse(
        { text: PNEUMA, morph: "N-NSN" },
        { text: ` ${KAI}`, morph: "CONJ" },
      ),
    ]);

    expect(audit.versions).toEqual(["BYZ2026"]);
    expect(audit.nodesScanned).toBe(2);
    expect(audit.cellsAttested).toBeGreaterThan(0);
  });

  it("should count a word the codex does not hold as scanned and attest nothing with it", () => {
    const audit = auditCodexAttestation([
      verse({ text: "quidquid", morph: "N-NSN" }),
    ]);

    expect(audit.nodesScanned).toBe(1);
    expect(audit.cellsAttested).toBe(0);
    expect(audit.contradictions).toEqual([]);
  });
});

describe("formatCellContradiction", () => {
  it("should name the cell, its root's numbers, and the numbers the corpus put there instead", () => {
    const { contradictions } = auditCodexAttestation([
      verse({ text: PNEUMA, morph: "N-NSN", strong: "G9999" }),
    ]);

    expect(formatCellContradiction(contradictions[0])).toBe(
      `greek/pi.json ${PNEUMA} [noun G4151] / ${PNEUMA} [noun nom sg neut] — ` +
        "explains 1 node(s), 1 solely, carrying G9999 ×1",
    );
  });
});
