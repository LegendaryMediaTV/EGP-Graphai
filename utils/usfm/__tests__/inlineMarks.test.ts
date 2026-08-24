import { describe, expect, it } from "vitest";
import { buildRunNodes, collapseContentNodes, mergeConnectors, moveTrailingPunctuationBackward } from "../inlineMarks";

/**
 * `mergeConnectors` is tested directly against synthetic `ContentObject[]`
 * input: the rule it implements (guide §6's "Node granularity around a
 * Strong's tag") is a property of the schema-level nodes themselves,
 * independent of how they were produced, so these tests don't need a real
 * USFM fixture to be meaningful — some cases below (the mark-mismatch
 * split, the textless-sibling stop) never occur in the WEBUS2020 corpus,
 * but are general rules guide §6 documents from other sources, and this
 * module must hold to them regardless. `buildRunNodes` is then tested
 * against pieces shaped the way `segmentVerses.ts` actually produces them,
 * closing the loop.
 */

describe("mergeConnectors — forward-default, backward-fallback, matching KJV1769 Genesis 1:1 exactly", () => {
  it("should merge an untagged leading connector forward into the strong-carrying node it precedes (KJV1769 01-GEN.json 1:1: \"In the beginning\"/H7225)", () => {
    const result = mergeConnectors([{ text: "In the " }, { text: "beginning", strong: "H7225" }]);
    expect(result).toEqual([{ text: "In the beginning", strong: "H7225" }]);
  });

  it("should fall back to merging backward when nothing strong-carrying follows in the same run (John 14:16's own bare \"Counselor,\" after \"another\"/G3588)", () => {
    const result = mergeConnectors([
      { text: "another", strong: "G3588", marks: ["woc"] },
      { text: " Counselor,", marks: ["woc"] },
    ]);
    expect(result).toEqual([{ text: "another Counselor,", strong: "G3588", marks: ["woc"] }]);
  });

  it("should never merge across a marks mismatch, leaving both nodes split (guide §6's own Genesis 2:4 example)", () => {
    const result = mergeConnectors([{ text: "the " }, { text: "Lord", strong: "H3068", marks: ["sc"] }]);
    expect(result).toEqual([{ text: "the " }, { text: "Lord", strong: "H3068", marks: ["sc"] }]);
  });

  it("should never merge a connector that already carries its own foot into a neighbor (guide §6's own Job 19:10 example: \"like an uprooted\" itself carries the footnote, not \"tree\" beside it)", () => {
    const result = mergeConnectors([
      { text: "like an uprooted", foot: { type: "trn", content: "or, a fallen" } },
      { text: "tree", strong: "H6131" },
    ]);
    expect(result).toEqual([
      { text: "like an uprooted", foot: { type: "trn", content: "or, a fallen" } },
      { text: "tree", strong: "H6131" },
    ]);
  });

  it("should still merge a plain connector forward into a strong-carrying node that already carries its own foot (the target's own foot is untouched by the merge, and moveTrailingPunctuationBackward still needs to be able to peel leading punctuation back off a footnoted node)", () => {
    const result = mergeConnectors([
      { text: ", " },
      { text: "God", strong: "H8064", foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." } },
    ]);
    expect(result).toEqual([
      {
        text: ", God",
        strong: "H8064",
        foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." },
      },
    ]);
  });

  it("should merge a plain connector forward into a node carrying only foot, no strong at all — the real WEBUS2020 Genesis 1:1 regression once Strong's numbers are suppressed", () => {
    const result = mergeConnectors([
      { text: "In the beginning, " },
      { text: "God", foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." } },
    ]);
    expect(result).toEqual([
      { text: "In the beginning, God", foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." } },
    ]);
  });

  it("should not fall back and merge a trailing connector backward into a foot-only node once nothing follows it — appending text after a foot's own anchor would push real, un-footnoted prose past the footnote's own marker (the real Genesis 1:1 shape: \"created the heavens and the earth.\" must stay its own node, not get absorbed into \"God\"+foot)", () => {
    const result = mergeConnectors([
      { text: "God", foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." } },
      { text: " created the heavens and the earth." },
    ]);
    expect(result).toEqual([
      { text: "God", foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." } },
      { text: " created the heavens and the earth." },
    ]);
  });

  it("should never merge a connector forward into a foot-only node that itself opens a new paragraph, even though this can never actually happen from this module's own real call sites today (paragraph/break are attached by usfm/blockStructure.ts only after mergeConnectors has already run) — kept for the identical reason moveTrailingPunctuationBackward's own unreachable paragraph/break guards are", () => {
    const result = mergeConnectors([
      { text: "In the beginning, " },
      {
        text: "God",
        foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." },
        paragraph: true,
      },
    ]);
    expect(result).toEqual([
      { text: "In the beginning, " },
      {
        text: "God",
        foot: { type: "stu", content: "The Hebrew word rendered “God” is “Elohim”." },
        paragraph: true,
      },
    ]);
  });

  it("should never merge a connector forward into a foot-only node across a marks mismatch, the same guide §6 rule that already applies to a strong-carrying target", () => {
    const result = mergeConnectors([
      { text: "the ", marks: ["woc"] },
      { text: "Lord", foot: { type: "stu", content: "The word translated “Lord” is “Adonai.”" } },
    ]);
    expect(result).toEqual([
      { text: "the ", marks: ["woc"] },
      { text: "Lord", foot: { type: "stu", content: "The word translated “Lord” is “Adonai.”" } },
    ]);
  });

  it("should leave a foot-only node's own break flag alone (this module's own real call sites never hand it one — break is attached by usfm/blockStructure.ts strictly after buildRunNodes/mergeConnectors have already produced their final nodes, and InlineTextPiece itself has no break field to carry one through pieceToNode in the first place); confirmed empirically too — auditNodes.ts's own Check 1 finds zero \"break present, foot/strong absent\" targets anywhere in the real WEBUS2020/MSB2025 corpora, every finding foot-carrying, none break-only — so this stays a locking test: break needs no entry in isMergeTarget", () => {
    const result = mergeConnectors([{ text: "In the beginning, " }, { text: "God", break: true }]);
    expect(result).toEqual([{ text: "In the beginning, " }, { text: "God", break: true }]);
  });

  it("should let a textless Strong's-only sibling stop a forward scan outright, never skipping past it to a later strong-carrying node", () => {
    const result = mergeConnectors([
      { text: "created", strong: "H1254" },
      { strong: "H853" },
      { text: " and", strong: "H853" },
      { text: " the earth", strong: "H776" },
    ]);
    // The trailing space on "and" would only appear if it merged past the
    // textless H853 sibling to reach "created" — it must not.
    expect(result).toEqual([
      { text: "created", strong: "H1254" },
      { strong: "H853" },
      { text: " and", strong: "H853" },
      { text: " the earth", strong: "H776" },
    ]);
  });

  it("should let a textless Strong's-only sibling stop a backward scan the same way, leaving a connector with nothing to attach to standing on its own", () => {
    const result = mergeConnectors([{ strong: "H853" }, { text: "orphaned" }]);
    expect(result).toEqual([{ strong: "H853" }, { text: "orphaned" }]);
  });

  it("should leave a connector standing alone as its own plain node when nothing strong-carrying exists anywhere in the run", () => {
    const result = mergeConnectors([{ text: "Arise, Yahweh!" }]);
    expect(result).toEqual([{ text: "Arise, Yahweh!" }]);
  });
});

describe("buildRunNodes — the leading-space convention, whitespace folding, and end-to-end merge over real fixture shapes", () => {
  it("should attach the joining space between two Strong's-tagged words to the leading edge of the node after the gap, never trailing the node before it (KJV1769/NASB1995 convention)", () => {
    const nodes = buildRunNodes([
      { text: "God", strong: "H430" },
      { text: " " },
      { text: "created", strong: "H1254" },
    ]);
    expect(nodes).toEqual([
      { text: "God", strong: "H430" },
      { text: " created", strong: "H1254" },
    ]);
  });

  it("should fold a marks-less joining space (John 14:16's own footnote-interrupted gap between two \\wj spans) onto its next neighbor unconditionally, letting the untagged word before it then find a real forward target across what was the gap", () => {
    // This models a real WEBUS2020 shape: a footnote sits between two \wj
    // spans, leaving one leftover space token with no marks of its own
    // between them. Folding it forward unconditionally lets "that" become
    // the marks-matching neighbor "Counselor," needs —
    // content-schema.json can't record "these two woc-marked nodes came
    // from separate \wj pairs" anyway, so marks continuity, not
    // marker-pair identity, is the only meaning "same span" can have here.
    const nodes = buildRunNodes([
      { text: "another", strong: "G3588", marks: ["woc"] },
      { text: " Counselor,", marks: ["woc"] },
      { text: " " },
      { text: "that", strong: "G2443", marks: ["woc"] },
    ]);
    expect(nodes).toEqual([
      { text: "another", strong: "G3588", marks: ["woc"] },
      { text: " Counselor, that", strong: "G2443", marks: ["woc"] },
    ]);
  });

  it("should trim the run's own outer edges but never an internal joining space", () => {
    const nodes = buildRunNodes([{ text: "  " }, { text: "Selah." }, { text: "  " }]);
    expect(nodes).toEqual([{ text: "Selah." }]);
  });

  it("should return an empty array for a run of nothing but whitespace", () => {
    expect(buildRunNodes([{ text: "   " }])).toEqual([]);
  });

  it("should carry marks through onto a plain, unmerged connector word with no strong tag anywhere nearby", () => {
    const nodes = buildRunNodes([{ text: "Selah.", marks: ["i"] }]);
    expect(nodes).toEqual([{ text: "Selah.", marks: ["i"] }]);
  });
});

describe("buildRunNodes — convention #3: tight (closing) punctuation trails the word it ends, never leads the word after it", () => {
  it("should move a comma off the leading edge of the following strong-carrying node onto the trailing edge of the one before it (KJV1769/utils/auditNodes.ts's own illustrative shape, and the real Genesis 1:1: \"beginning,\"/H7225 + \" God\"/H8064, not \"beginning\"/H7225 + \", God\"/H8064)", () => {
    const nodes = buildRunNodes([
      { text: "beginning", strong: "H7225" },
      { text: ", " },
      { text: "God", strong: "H8064" },
    ]);
    expect(nodes).toEqual([
      { text: "beginning,", strong: "H7225" },
      { text: " God", strong: "H8064" },
    ]);
  });

  it("should leave the punctuation leading the following node when no real attachment point precedes it at all", () => {
    const nodes = buildRunNodes([{ text: ", " }, { text: "beginning", strong: "H7225" }]);
    expect(nodes).toEqual([{ text: ", beginning", strong: "H7225" }]);
  });
});

describe("moveTrailingPunctuationBackward — tested directly against synthetic ContentObject[] input for shapes buildRunNodes's own piece-level interface cannot construct (a textless sibling, an \"sc\" mark)", () => {
  it("should skip over a textless Strong's-only sibling to find the real attachment point behind it, exactly as utils/auditNodes.ts's own check does (its own real corpus example: \"... and female\"/H5347, a bare {strong: H1961} sibling, then \", to keep ...\"/H2421)", () => {
    const result = moveTrailingPunctuationBackward([
      { text: "female", strong: "H5347" },
      { strong: "H1961" },
      { text: ", to keep", strong: "H2421" },
    ]);
    expect(result).toEqual([
      { text: "female,", strong: "H5347" },
      { strong: "H1961" },
      { text: " to keep", strong: "H2421" },
    ]);
  });

  it("should never move punctuation across a marks mismatch, leaving it leading the node it was already on (guide §6's own \"stays split\" rule applies here too)", () => {
    const result = moveTrailingPunctuationBackward([
      { text: "Lord", strong: "H3068", marks: ["sc"] },
      { text: ", God", strong: "H430" },
    ]);
    expect(result).toEqual([
      { text: "Lord", strong: "H3068", marks: ["sc"] },
      { text: ", God", strong: "H430" },
    ]);
  });

  it("should never move punctuation into a node ending a break, or out of a node opening a paragraph", () => {
    const brokenBefore = moveTrailingPunctuationBackward([
      { text: "beginning", strong: "H7225", break: true },
      { text: ", God", strong: "H8064" },
    ]);
    expect(brokenBefore).toEqual([
      { text: "beginning", strong: "H7225", break: true },
      { text: ", God", strong: "H8064" },
    ]);

    const paragraphAfter = moveTrailingPunctuationBackward([
      { text: "beginning", strong: "H7225" },
      { text: ", God", strong: "H8064", paragraph: true },
    ]);
    expect(paragraphAfter).toEqual([
      { text: "beginning", strong: "H7225" },
      { text: ", God", strong: "H8064", paragraph: true },
    ]);
  });
});

describe("buildRunNodes — coalescing two connector runs a dropped construct (footnote, cross-reference) split apart", () => {
  it("should coalesce a leading connector and a trailing connector that became adjacent once the aside between them was dropped, then merge the combined connector forward (Genesis 30:24's own real shape: \"Joseph\"/H3130 + \",\" + [footnote dropped] + \" saying, “\" + \"May\"/H3068)", () => {
    const nodes = buildRunNodes([
      { text: "Joseph", strong: "H3130" },
      { text: "," },
      { text: " saying, “" },
      { text: "May", strong: "H3068" },
    ]);
    expect(nodes).toEqual([
      { text: "Joseph,", strong: "H3130" },
      { text: " saying, “May", strong: "H3068" },
    ]);
  });
});

describe("collapseContentNodes — the three content-schema.json shapes", () => {
  it("should collapse a single text-only node to a bare string", () => {
    expect(collapseContentNodes([{ text: "Selah." }])).toBe("Selah.");
  });

  it("should keep a single node carrying more than text as a bare object", () => {
    expect(collapseContentNodes([{ text: "Selah.", marks: ["i"] }])).toEqual({
      text: "Selah.",
      marks: ["i"],
    });
  });

  it("should keep a textless Strong's-only node as a bare object, never collapsing it to an empty string", () => {
    expect(collapseContentNodes([{ strong: "H853" }])).toEqual({ strong: "H853" });
  });

  it("should return an array, mixing bare strings and objects, for more than one node", () => {
    expect(
      collapseContentNodes([{ text: "God" }, { text: " created", strong: "H1254" }]),
    ).toEqual(["God", { text: " created", strong: "H1254" }]);
  });
});
