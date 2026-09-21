import { describe, expect, it } from "vitest";
import {
  findBareSuperscriptDuplicates,
  formatLexicalMapFinding,
} from "../lexicalMaps";

/**
 * Greek built from code points, never typed or pasted, the convention
 * `corpusTokens.test.ts` explains. The superscripts matter as much as the
 * letters here, since they are the whole subject.
 */
const greek = (...codes: number[]) => String.fromCharCode(...codes);

/** `¹`, the superscript one a root key takes. */
const ONE = greek(0xb9);
/** `²`, the superscript two. */
const TWO = greek(0xb2);

/** `ἄπειμι`, which is 'be absent' from εἰμί and 'go away' from εἶμι. */
const APEIMI = greek(0x1f04, 0x3c0, 0x3b5, 0x3b9, 0x3bc, 0x3b9);
/** `μήν`, which is a particle and a month. */
const MEN = greek(0x3bc, 0x3ae, 0x3bd);
/** `λόγος`, one word with one citation form and no superscript anywhere. */
const LOGOS = greek(0x3bb, 0x3cc, 0x3b3, 0x3bf, 0x3c2);

/** A root-to-file map in the shape the audit collects while reading a codex. */
const codex = (...roots: string[]) =>
  new Map(roots.map((root) => [root, "greek/alpha.json"]));

describe("findBareSuperscriptDuplicates", () => {
  it("should flag a bare key sitting beside its own superscripted roots", () => {
    const findings = findBareSuperscriptDuplicates(
      codex(APEIMI, APEIMI + ONE, APEIMI + TWO),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].root).toBe(APEIMI);
    expect(findings[0].message).toContain(APEIMI + ONE);
    expect(findings[0].message).toContain(APEIMI + TWO);
  });

  it("should name the file the bare root sits in, so a reader can open it", () => {
    const roots = new Map([
      [MEN, "greek/mu.json"],
      [MEN + ONE, "greek/mu.json"],
    ]);

    expect(formatLexicalMapFinding(findBareSuperscriptDuplicates(roots)[0])).toContain(
      "greek/mu.json",
    );
  });

  it("should pass a superscripted pair with no bare key beside it, which is the shape the convention asks for", () => {
    expect(findBareSuperscriptDuplicates(codex(MEN + ONE, MEN + TWO))).toEqual(
      [],
    );
  });

  it("should leave a root that carries no superscript alone", () => {
    expect(findBareSuperscriptDuplicates(codex(LOGOS, MEN))).toEqual([]);
  });

  it("should not read one bare key as a duplicate of another word that merely starts the same way", () => {
    expect(
      findBareSuperscriptDuplicates(codex(MEN, APEIMI + ONE, APEIMI + TWO)),
    ).toEqual([]);
  });
});
