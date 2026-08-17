import { describe, expect, it } from "vitest";
import Content from "../../types/Content";
import { getVersionDirectories } from "../../functions/getBibleVersions";
import { auditVersion, auditVersions, exitCodeFor, findStrongsNodeIssues } from "../auditStrongsNodes";

describe("findStrongsNodeIssues — unmerged pairs", () => {
  it("should report no findings for a clean tree with everything already merged", () => {
    const content: Content = [
      { paragraph: true, text: "In the beginning", strong: "H7225" },
      { text: " God", strong: "H430" },
    ];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should report one finding for an un-merged eligible pair", () => {
    const content: Content = [{ paragraph: true, text: "In the " }, { text: "beginning", strong: "H7225" }];
    const findings = findStrongsNodeIssues(content).unmergedPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].plain).toEqual({ paragraph: true, text: "In the " });
    expect(findings[0].target).toEqual({ text: "beginning", strong: "H7225" });
  });

  it("should stay silent when the untagged node already carries its own foot — merging would misattach the footnote onto a word it was never placed over", () => {
    const content: Content = [{ text: "like an uprooted", foot: { type: "trn", content: "x" } }, { text: " tree", strong: "H6086" }];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should stay silent on a mark/script mismatch", () => {
    const content: Content = ["the ", { text: "Lord", marks: ["sc"], strong: "H3068" }];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should never treat a ContentNested wrapper (no top-level text) as a forward-merge target", () => {
    // {content: [...], strong: "..."} has nothing at its own top level for a
    // preceding connector's text to land on.
    const content: Content = ["the ", { content: ["word"], strong: "H1234" } as unknown as Content];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should stay silent on a trailing connector with nothing strong-carrying after it in the span — real Genesis 1:15 KJV1769 shape", () => {
    // Genesis 1:7 tags the identical phrase (strong: "H3651"); folding this
    // one backward into "H776" would claim that number covers text it
    // doesn't. The real defect, if any, is a missing tag on the connector
    // itself — never something this check could recommend merging away.
    const content: Content = [{ text: "upon the earth:", strong: "H776" }, "and it was so."];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should stay silent on a trailing connector even when it agrees in formatting and ends the whole array", () => {
    const content: Content = [{ text: "he them.", strong: "H1254" }, " he them."];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });
});

describe("findStrongsNodeIssues — trailing whitespace", () => {
  it("should flag a strong-carrying node whose text ends in whitespace", () => {
    const content: Content = [{ text: "God ", strong: "H430" }, { text: "said", strong: "H559" }];
    expect(findStrongsNodeIssues(content).trailingWhitespace).toEqual(["content[0]"]);
  });

  it("should stay silent when the leading-space convention is already followed", () => {
    const content: Content = [{ text: "God", strong: "H430" }, { text: " said", strong: "H559" }];
    expect(findStrongsNodeIssues(content).trailingWhitespace).toEqual([]);
  });
});

describe("findStrongsNodeIssues — leading punctuation", () => {
  it("should flag tight punctuation glued to the front of a strong-carrying node, reporting what it should reattach to instead", () => {
    const content: Content = [
      { text: "Look", marks: ["b", "i"], strong: "G2400" },
      { text: "! The", marks: ["b", "i"], strong: "G3588" },
    ];
    const findings = findStrongsNodeIssues(content).leadingPunctuation;
    expect(findings).toHaveLength(1);
    expect(findings[0].leading).toBe("!");
    expect(findings[0].attachTo).toEqual({ text: "Look", marks: ["b", "i"], strong: "G2400" });
  });

  it("should stay silent when nothing precedes the offending node at all", () => {
    const content: Content = [{ text: "! The", strong: "G3588" }];
    expect(findStrongsNodeIssues(content).leadingPunctuation).toEqual([]);
  });

  it("should skip straight through a textless Strong's sibling to find the real attachment point", () => {
    const content: Content = [
      { text: " and female", strong: "H5347" },
      { strong: "H1961" },
      { text: ", to keep", strong: "H2421" },
    ];
    const findings = findStrongsNodeIssues(content).leadingPunctuation;
    expect(findings).toHaveLength(1);
    expect(findings[0].attachTo).toEqual({ text: " and female", strong: "H5347" });
  });

  it("should stay silent on a mark mismatch — a small-caps divine name cannot absorb the following node's punctuation without breaking the small-caps convention", () => {
    const content: Content = [
      { text: "Lord", marks: ["sc"], strong: "H3068" },
      { text: ", “My punishment", strong: "H5771" },
    ];
    expect(findStrongsNodeIssues(content).leadingPunctuation).toEqual([]);
  });

  it("should not fire on an opening quote or parenthesis — those attach to what follows, not what precedes", () => {
    const content: Content = [{ text: "said", strong: "H559" }, { text: " “Let there be light”", strong: "H216" }];
    expect(findStrongsNodeIssues(content).leadingPunctuation).toEqual([]);
  });

  it("should not fire across a dash — this corpus glues a dash to the following piece of a compound word on purpose", () => {
    const content: Content = [{ text: "yonath", strong: "H3123" }, { text: "-elem", strong: "H482" }];
    expect(findStrongsNodeIssues(content).leadingPunctuation).toEqual([]);
  });

  it("should stay silent across a break", () => {
    const content: Content = [{ text: "word", strong: "H1", break: true }, { text: "! next", strong: "H2" }];
    expect(findStrongsNodeIssues(content).leadingPunctuation).toEqual([]);
  });

  it("should stay silent when the offending node itself opens a new paragraph", () => {
    const content: Content = [{ text: "word", strong: "H1" }, { text: "! next", strong: "H2", paragraph: true }];
    expect(findStrongsNodeIssues(content).leadingPunctuation).toEqual([]);
  });

  it("should accept a footnoted (not strong-carrying) node as a legitimate attachment point", () => {
    const content: Content = [
      { text: "Jericho", foot: { type: "trn", content: "x" } },
      { text: "), and look at", strong: "H7200" },
    ];
    const findings = findStrongsNodeIssues(content).leadingPunctuation;
    expect(findings).toHaveLength(1);
    expect(findings[0].attachTo).toEqual({ text: "Jericho", foot: { type: "trn", content: "x" } });
  });
});

describe("findStrongsNodeIssues — mark-boundary spaces", () => {
  it("should report no findings for a clean tree with no blank connector at all", () => {
    const content: Content = [
      { text: "after", marks: ["woc"], strong: "G1934" },
      { text: " all", marks: ["woc"], strong: "G3956" },
    ];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });

  it("should flag a bare space stranded between two nodes sharing the same marks — real Matthew 6:32 KJV1769 shape", () => {
    const content: Content = [
      { text: "after", marks: ["woc"], strong: "G1934" },
      " ",
      { text: "all", marks: ["woc"], strong: "G3956" },
    ];
    const findings = findStrongsNodeIssues(content).markBoundarySpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].left).toEqual({ text: "after", marks: ["woc"], strong: "G1934" });
    expect(findings[0].space).toBe(" ");
    expect(findings[0].target).toEqual({ text: "all", marks: ["woc"], strong: "G3956" });
  });

  it("should stay silent when the two real neighbors disagree in marks — real 1 John 2:23 KJV1769 shape", () => {
    const content: Content = [{ text: " the Father:", strong: "G3962" }, " ", { text: "(but) he that acknowledgeth", marks: ["i"], strong: "G3670" }];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });

  it("should stay silent when a real neighbor is a ContentNested wrapper with no top-level text", () => {
    const content: Content = [
      { text: "the Father", marks: ["i"], strong: "G3962" },
      " ",
      { content: [{ text: "also", marks: ["i"] }, "."], strong: "G2532" } as unknown as Content,
    ];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });

  it("should not require a strong value on either neighbor — an unmarked, untagged blank between two other unmarked, untagged words still qualifies", () => {
    const content: Content = [{ text: " AND", strong: "G2532" }, " ", { text: "LORD", strong: "G2962" }];
    const findings = findStrongsNodeIssues(content).markBoundarySpaces;
    expect(findings).toHaveLength(1);
  });

  it("should stay silent when nothing precedes or follows the blank in the array", () => {
    expect(findStrongsNodeIssues([" ", { text: "all", marks: ["woc"], strong: "G3956" }]).markBoundarySpaces).toEqual([]);
    expect(findStrongsNodeIssues([{ text: "all", marks: ["woc"], strong: "G3956" }, " "]).markBoundarySpaces).toEqual([]);
  });

  it("should stay silent across a break on the space itself", () => {
    const content: Content = [
      { text: "after", marks: ["woc"], strong: "G1934" },
      { text: " ", break: true },
      { text: "all", marks: ["woc"], strong: "G3956" },
    ];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });

  it("should stay silent when the target opens a new paragraph", () => {
    const content: Content = [
      { text: "after", marks: ["woc"], strong: "G1934" },
      " ",
      { text: "all", marks: ["woc"], strong: "G3956", paragraph: true },
    ];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });

  it("should not be blocked by a footnote on either real neighbor — the footnote stays put; only the space moves", () => {
    const content: Content = [
      { text: "have", marks: ["woc"], foot: { type: "var", content: "x" } },
      " ",
      { text: "not grown weary.", marks: ["woc"] },
    ];
    const findings = findStrongsNodeIssues(content).markBoundarySpaces;
    expect(findings).toHaveLength(1);
  });

  it("should skip through a textless Strong's sibling to find the real target, ignoring its own missing marks — real Matthew 3:15 KJV1769 shape", () => {
    const content: Content = [
      { text: " it becometh", marks: ["woc"], strong: "G4241" },
      " ",
      { strong: "G2076", morph: "PresInd" },
      { text: "us", marks: ["woc"], strong: "G2254" },
    ];
    const findings = findStrongsNodeIssues(content).markBoundarySpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toEqual({ text: "us", marks: ["woc"], strong: "G2254" });
  });

  it("should stay silent when a run of textless Strong's siblings leads straight into a boundary/end with no real target", () => {
    const content: Content = [{ text: "it becometh", marks: ["woc"] }, " ", { strong: "G2076" }];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });

  it("should still require the real target past the textless sibling to agree in marks", () => {
    const content: Content = [
      { text: "it becometh", marks: ["woc"] },
      " ",
      { strong: "G2076" },
      { text: "us", strong: "G2254" },
    ];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });
});

describe("findStrongsNodeIssues — verse-initial spaces", () => {
  it("should report no finding for a clean verse", () => {
    const content: Content = [{ text: "In the beginning", strong: "H7225" }, { text: " God", strong: "H430" }];
    expect(findStrongsNodeIssues(content).verseInitialSpace).toBeUndefined();
  });

  it("should flag a bare space as the whole first node — real WEBUS2020 Revelation 1:18 shape", () => {
    const content: Content = [" ", { text: "and the Living one.", marks: ["woc"] }];
    const finding = findStrongsNodeIssues(content).verseInitialSpace;
    expect(finding).toBeDefined();
    expect(finding!.first).toBe(" ");
    expect(finding!.next).toEqual({ text: "and the Living one.", marks: ["woc"] });
  });

  it("should flag a paragraph-opening node whose own text is nothing but a space — real WEBUS2020 Revelation 2:1 shape", () => {
    const content: Content = [{ paragraph: true, text: " " }, { text: "“To the angel of the assembly in Ephesus write:", marks: ["woc"] }];
    const finding = findStrongsNodeIssues(content).verseInitialSpace;
    expect(finding).toBeDefined();
    expect(finding!.first).toEqual({ paragraph: true, text: " " });
  });

  it("should flag a first node whose text merely starts with a space before real content continues — real WEBUS2020 Matthew 24:1 shape", () => {
    const content: Content = [{ paragraph: true, text: " Jesus went out from the temple, and was going on his way." }];
    const finding = findStrongsNodeIssues(content).verseInitialSpace;
    expect(finding).toBeDefined();
    expect(finding!.next).toBeUndefined();
  });

  it("should stay silent when the first node's own text has no leading space at all", () => {
    const content: Content = [{ paragraph: true, text: "Jesus went out from the temple." }];
    expect(findStrongsNodeIssues(content).verseInitialSpace).toBeUndefined();
  });

  it("should not look inside a ContentNested wrapper's own first node — an everyday, valid shape there", () => {
    const content: Content = [{ content: [" ", { text: "is", marks: ["i"] }, " precious,"], strong: "H3368" } as unknown as Content];
    expect(findStrongsNodeIssues(content).verseInitialSpace).toBeUndefined();
  });

  it("should not look past a heading/subtitle boundary at the very start", () => {
    const content: Content = [{ heading: "A Memorable Day" } as unknown as Content, " ", { text: "Now it came to pass", strong: "H139" }];
    expect(findStrongsNodeIssues(content).verseInitialSpace).toBeUndefined();
  });
});

describe("findStrongsNodeIssues — recursion", () => {
  it("should descend into a subtitle node's own inner content", () => {
    const content: Content = { subtitle: ["A ", { text: "! psalm", strong: "H4210" }] };
    const findings = findStrongsNodeIssues(content).leadingPunctuation;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.subtitle");
  });

  it("should descend into a ContentNested wrapper's own content", () => {
    const content: Content = [
      { content: ["Look", { text: "! The", strong: "G3588" }], strong: "H1" } as unknown as Content,
    ];
    const findings = findStrongsNodeIssues(content).leadingPunctuation;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.content");
  });

  it("should descend into a footnote body's own content", () => {
    const content: Content = [
      {
        text: "word",
        strong: "H1",
        foot: { type: "trn", content: ["Look", { text: "! The", strong: "G3588" }] },
      },
    ];
    const findings = findStrongsNodeIssues(content).leadingPunctuation;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.foot.content");
  });

  it("should find a mark-boundary space inside a ContentNested wrapper's own content too", () => {
    const content: Content = [
      {
        content: [
          { text: "he that acknowledgeth", marks: ["i"] },
          " ",
          { text: "the Son", marks: ["i"] },
        ],
        strong: "G3670",
      } as unknown as Content,
    ];
    const findings = findStrongsNodeIssues(content).markBoundarySpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.content");
  });
});

describe("auditVersion / auditVersions — real, on-disk corpus", () => {
  // Deliberately version-agnostic: the checked-in set of translations can
  // change over time, so no test here names a specific version id as a
  // hardcoded expectation beyond WEBUS2020 (used only to prove a version
  // with no Strong's tagging costs nothing).

  it("should give every real leading-punctuation finding in this checkout's own data a non-empty leading run", () => {
    // Not every checkout carries a version with this defect, so this only
    // asserts structural correctness of whatever real findings exist rather
    // than requiring at least one — the synthetic fixtures above already
    // cover the rule itself independent of any real data.
    // (Not checking attachTo !== node here: two distinct nodes at different
    // positions can coincidentally carry identical text/strong, e.g. a
    // repeated phrase, so deep-equality between them proves nothing.)
    const allFindings = auditVersions().flatMap((summary) => summary.leadingPunctuation);
    for (const finding of allFindings) {
      expect(finding.leading.length).toBeGreaterThan(0);
    }
  }, 30000);

  it("should default to every version directory on disk, not a curated list", () => {
    const versionIds = getVersionDirectories();
    expect(versionIds.length).toBeGreaterThan(0);
    const summaries = auditVersions();
    expect(summaries.map((s) => s.version)).toEqual(versionIds);
  }, 30000);

  it("should report zero findings for a version with no Strong's tagging at all", () => {
    const summary = auditVersion("WEBUS2020");
    expect(summary.unmergedPairs).toEqual([]);
    expect(summary.trailingWhitespace).toEqual([]);
    expect(summary.leadingPunctuation).toEqual([]);
    expect(summary.markBoundarySpaces).toEqual([]);
    expect(summary.verseInitialSpaces).toEqual([]);
  });

  it("should never write to bible-versions/ — this audit is read-only", () => {
    const first = JSON.stringify(auditVersions());
    const second = JSON.stringify(auditVersions());
    expect(second).toBe(first);
  }, 30000);
});

describe("exitCodeFor", () => {
  it("should exit non-zero when a version carries any finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      trailingWhitespace: [{ version: "X", file: "01-GEN.json", book: "GEN", chapter: 1, verse: 1, path: "content[0]" }],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a mark-boundary-space finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [
        { version: "X", file: "40-MAT.json", book: "MAT", chapter: 6, verse: 32, where: "content", left: {}, space: " ", target: {} },
      ],
      verseInitialSpaces: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a verse-initial-space finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [
        { version: "X", file: "66-REV.json", book: "REV", chapter: 1, verse: 8, first: " ", next: {} },
      ],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit zero when a version carries no finding across all five checks", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
    } as const;
    expect(exitCodeFor([summary])).toBe(0);
  });
});
