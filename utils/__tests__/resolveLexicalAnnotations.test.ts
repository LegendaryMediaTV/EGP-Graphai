import { describe, expect, it } from "vitest";
import Content from "../../types/Content";
import { resolveLexicalAnnotationsInContent } from "../resolveLexicalAnnotations";

/**
 * The node below is BYZ2026's real shape: every word tagged with a Strong's
 * number and a morphology code and no lemma, which is one of the two gaps this
 * step fills.
 */
const word = (over: Record<string, unknown> = {}) => ({
  text: " χριστοῦ,",
  script: "G",
  strong: "G5547",
  morph: "N-GSM",
  ...over,
});

/**
 * LXX1935's real shape, the mirror of {@link word}: every word tagged with a
 * lemma and a morphology code and no Strong's number.
 */
const greek = (over: Record<string, unknown> = {}) => ({
  text: " σπορίμου",
  script: "G",
  morph: "A-GSN",
  lemma: "σπόριμος",
  ...over,
});

describe("resolveLexicalAnnotationsInContent — lemma", () => {
  it("should write the lemma a Strong's-and-morph node resolves to", () => {
    const result = resolveLexicalAnnotationsInContent(
      [word()] as unknown as Content,
      "robinson",
    );

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([word({ lemma: "χριστός" })]);
  });

  it("should leave an existing lemma exactly as it was, even one the map disagrees with", () => {
    // This is the line that keeps the step inside `npm run validate` instead of
    // making it a tool that rewrites the corpus. A lemma on a node can carry a
    // judgment nothing here can re-derive, so a disagreement is reported by the
    // audit and never repaired here.
    const content = [word({ lemma: "οὐδείς" })] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave a node alone when two roots claim its spelling", () => {
    // λέγω and ἔπω are two entries for one suppletive verb and εἶπεν is the
    // second aorist of both. LXX1935 carries no Strong's numbers, so a node of
    // its shape offers nothing to narrow on, and this one word dominates them.
    const content = [
      greek({ text: "εἶπεν", morph: "V-2AAI-3S", lemma: undefined }),
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave an untagged node alone, since the map joins the corpus by script", () => {
    // KJV1769 carries morph codes on English words throughout. Nothing in a Greek
    // codex is about them, and the `script` a node declares is this repo's own
    // statement of which language's map applies.
    const content = [
      { text: "beginning", strong: "G746", morph: "N-DSF" },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave a node with no morphology code alone", () => {
    // BYZ2026's footnote variants are Greek, script-tagged, and carry no
    // lexical tags at all. A morph code is what says a node is one word the map
    // should be able to name.
    const content = [{ text: "Δαυίδ", script: "G" }] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should reach a node inside a footnote body and leave a bare string alone", () => {
    const content = [
      "and ",
      { text: "x", foot: { content: [word()] } },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([
      "and ",
      { text: "x", foot: { content: [word({ lemma: "χριστός" })] } },
    ]);
  });

  it("should resolve a spelling only one root holds without needing the morphology scheme", () => {
    // Three quarters of the corpus resolves on the spelling alone, so a version
    // declaring no scheme still gets most of its lemmas.
    const content = [
      { text: " ἐστίν", script: "G", morph: "V-PAI-3S" },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content);

    expect(result.changed).toBe(true);
    // The number arrives with it: an index rule keyed on the spelling alone
    // needs no parse to match, so εἰμί narrows to G2076 rather than staying at
    // the root's own array of sixteen.
    expect(result.content).toEqual([
      {
        text: " ἐστίν",
        script: "G",
        morph: "V-PAI-3S",
        lemma: "εἰμί",
        strong: "G2076",
      },
    ]);
  });
});

describe("resolveLexicalAnnotationsInContent — Strong's number", () => {
  it("should write the Strong's number a lemma-carrying node resolves to — real LXX1935 GEN 1:29 shape", () => {
    const result = resolveLexicalAnnotationsInContent(
      [greek()] as unknown as Content,
      "robinson",
    );

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([greek({ strong: "G4702" })]);
  });

  it("should narrow a root carrying several numbers by an index rule — εἰμί present indicative third singular is G2076, not G1510", () => {
    const content = [
      greek({ text: " ἐστιν", morph: "V-PAI-3S", lemma: "εἰμί" }),
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(true);
    expect(
      (result.content as unknown as Record<string, unknown>[])[0].strong,
    ).toBe("G2076");
  });

  it("should leave the node alone when the root carries no number at all", () => {
    // Real LXX1935 GEN 1:2. Nodes sit here in bulk, which is why the audit counts
    // this and does not fail on it.
    const content = [
      greek({
        text: " ἀκατασκεύαστος,",
        morph: "A-NSM",
        lemma: "ἀκατασκεύαστος",
      }),
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave the node alone when the root's numbers are an array nothing narrows — real LXX1935 GEN 2:17", () => {
    const content = [
      { text: " φάγεσθε", script: "G", lemma: "ἐσθίω" },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave the node alone when its lemma is not a root in the codex — real LXX1935 GEN 4:11", () => {
    const content = [
      { text: " ἔχανεν", script: "G", lemma: "χαίνω" },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should never rewrite a Strong's number the corpus already carries, even one the map would narrow", () => {
    // G1510 is the root number for εἰμί, which the index would narrow to G2076
    // if this step were allowed to look. It is not: narrowing an existing tag
    // overwrites a corpus value, which is what the write-only-where-absent rule
    // exists to prevent.
    const content = [
      {
        text: " ἐστιν",
        script: "G",
        morph: "V-PAI-3S",
        lemma: "εἰμί",
        strong: "G1510",
      },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should write neither field when the lemma itself is unresolved, since a Strong's number is resolved from the lemma", () => {
    // ἄρα against ἆρα, the ambiguity 38 of BYZ2026's 39 unresolved nodes sit on.
    // No lemma means no root to ask for a number, so the node keeps both gaps
    // rather than acquiring a number resolved from a guess.
    const content = [
      { text: "Ἄρα", script: "G", morph: "PRT" },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should write both fields in one visit when a node is missing both", () => {
    // One walk, one lookup per node. A node arriving with a morph and neither
    // annotation gets the lemma its spelling resolves to and the number that
    // lemma resolves to, without a second pass over the tree.
    const content = [
      { text: " θεὸς", script: "G", morph: "N-NSM" },
    ] as unknown as Content;

    const result = resolveLexicalAnnotationsInContent(content, "robinson");

    expect(result.changed).toBe(true);
    expect(result.content).toEqual([
      {
        text: " θεὸς",
        script: "G",
        morph: "N-NSM",
        lemma: "θεός",
        strong: "G2316",
      },
    ]);
  });
});

describe("resolveLexicalAnnotationsInContent — idempotence", () => {
  // Without these the whole `npm run validate` run fails at
  // `checkAutoFixPassIsFixedPoint`, which names the step and nothing about why.
  it("should report no change on a second application for a lemma", () => {
    const content = [word()] as unknown as Content;

    const once = resolveLexicalAnnotationsInContent(content, "robinson");
    const twice = resolveLexicalAnnotationsInContent(once.content, "robinson");

    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once.content);
  });

  it("should report no change on a second application for a Strong's number", () => {
    const content = [greek()] as unknown as Content;

    const once = resolveLexicalAnnotationsInContent(content, "robinson");
    const twice = resolveLexicalAnnotationsInContent(once.content, "robinson");

    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once.content);
  });
});
