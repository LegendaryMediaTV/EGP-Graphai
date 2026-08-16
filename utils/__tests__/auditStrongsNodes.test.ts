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

  it("should report one forward finding for an un-merged eligible pair", () => {
    const content: Content = [{ paragraph: true, text: "In the " }, { text: "beginning", strong: "H7225" }];
    const findings = findStrongsNodeIssues(content).unmergedPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].direction).toBe("forward");
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
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit zero when a version carries no finding across all three checks", () => {
    const summary = { version: "X", unmergedPairs: [], trailingWhitespace: [], leadingPunctuation: [] } as const;
    expect(exitCodeFor([summary])).toBe(0);
  });
});
