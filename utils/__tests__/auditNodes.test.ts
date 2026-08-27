import { describe, expect, it } from "vitest";
import Content from "../../types/Content";
import Footnote from "../../types/Footnote";
import { uniformFraction } from "../../functions/normalizeFractions";
import {
  exitCodeFor,
  findHeadingParagraphMismatches,
  findStrongsNodeIssues,
  VerseRecord,
} from "../auditNodes";

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
    const content: Content = ["the ", { content: ["word"], strong: "H1234" } as unknown as Content];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should stay silent on a trailing connector with nothing strong-carrying after it in the span — real Genesis 1:15 KJV1769 shape", () => {
    const content: Content = [{ text: "upon the earth:", strong: "H776" }, "and it was so."];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should stay silent on a trailing connector even when it agrees in formatting and ends the whole array", () => {
    const content: Content = [{ text: "he them.", strong: "H1254" }, " he them."];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should flag a plain connector left unmerged before a foot-carrying node — real Genesis 1:1 WEBUS2020 shape", () => {
    const content: Content = [
      { paragraph: true, text: "In the beginning, " },
      { text: "God", foot: { type: "stu", content: "x" } },
    ];
    const findings = findStrongsNodeIssues(content).unmergedPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].plain).toEqual({ paragraph: true, text: "In the beginning, " });
    expect(findings[0].target).toEqual({ text: "God", foot: { type: "stu", content: "x" } });
  });

  it("should flag a plain connector left unmerged before a break-carrying node", () => {
    const content: Content = [{ text: "In the beginning, " }, { text: "God", break: true }];
    const findings = findStrongsNodeIssues(content).unmergedPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].plain).toEqual({ text: "In the beginning, " });
    expect(findings[0].target).toEqual({ text: "God", break: true });
  });

  it("should stay silent on a foot-carrying target that itself opens a new paragraph", () => {
    const content: Content = [
      { text: "In the beginning, " },
      { paragraph: true, text: "God", foot: { type: "stu", content: "x" } },
    ];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should stay silent on a break-carrying target that itself opens a new paragraph", () => {
    const content: Content = [{ text: "In the beginning, " }, { paragraph: true, text: "God", break: true }];
    expect(findStrongsNodeIssues(content).unmergedPairs).toEqual([]);
  });

  it("should never treat a bare versification-boundary foot node as an unmerged-connector merge target or donor — real CLV1880 NUM 20:28 post-fix shape", () => {
    const content: Content = [
      { text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius " },
      { foot: { type: "var", content: "Originally verse 20:29." } },
      "illo mortuo in montis supercilio descendit cum Eleazaro",
    ];
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

  it("should not be blocked by a footnote on either real neighbor when the two sides agree exactly — the footnote stays put; only the space moves", () => {
    const content: Content = [
      { text: "have", marks: ["woc"], foot: { type: "var", content: "x" } },
      " ",
      { text: "not grown weary.", marks: ["woc"] },
    ];
    const findings = findStrongsNodeIssues(content).markBoundarySpaces;
    expect(findings).toHaveLength(1);
  });

  it("should stay silent when a subset boundary's own smaller (wrapper) side carries a foot — real YLT1898 Revelation 2:13 shape: neither direction is safe, so an already-correctly-tagged blank is the settled shape, not a finding", () => {
    const content: Content = [
      { text: "...Antipas", marks: ["woc"], foot: { type: "stu", content: "Antipater" } },
      { text: " ", marks: ["woc"] },
      { text: "was", marks: ["i", "woc"] },
    ];
    expect(findStrongsNodeIssues(content).markBoundarySpaces).toEqual([]);
  });

  it("should still flag a subset boundary when the smaller (wrapper) side carries no strong/foot of its own — real KJV1769 1 Samuel 16:7 shape, backward direction", () => {
    const content: Content = [
      { text: "the", marks: ["i"] },
      " ",
      { text: "Lord", marks: ["i", "sc"] },
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

describe("findStrongsNodeIssues — fraction convention", () => {
  it("should flag a node whose text still carries a genuine ASCII N/M fraction — real, current Exodus 16:36 WEBUS2020 shape", () => {
    const content: Content = [{ text: "1 ephah is about 22 liters or about 2/3 of a bushel" }];
    expect(findStrongsNodeIssues(content).fractionFindings).toEqual(["content[0]"]);
  });

  it("should flag a node whose text still carries a precomposed vulgar-fraction glyph — real, current Exodus 27:1 WEBUS2020 shape", () => {
    const content: Content = [{ text: "The altar was to be about 7½×7½×4½ feet." }];
    expect(findStrongsNodeIssues(content).fractionFindings).toEqual(["content[0]"]);
  });

  it("should stay silent on text already normalized to this repo's own fraction convention", () => {
    const content: Content = [
      { text: `1 ephah is about 22 liters or about ${uniformFraction("2", "3")} of a bushel` },
    ];
    expect(findStrongsNodeIssues(content).fractionFindings).toEqual([]);
  });

  it("should stay silent on plain text with no fraction shape at all", () => {
    const content: Content = [{ paragraph: true, text: "In the beginning, God created the heavens and the earth." }];
    expect(findStrongsNodeIssues(content).fractionFindings).toEqual([]);
  });

  it("should stay silent on the real ordinal-suffix exception left verbatim by the shared normalizer — real WEBUS2020 Glossary/Matthew 20:2 shape", () => {
    const content: Content = [{ text: "1/25th of a Roman aureus" }];
    expect(findStrongsNodeIssues(content).fractionFindings).toEqual([]);
  });

  it("should report each offending node's own path, not just a count, when more than one node in the same array carries a fraction", () => {
    const content: Content = [{ text: "about 2/3 of a bushel" }, "plain text", { text: "about 1/4 hin" }];
    expect(findStrongsNodeIssues(content).fractionFindings).toEqual(["content[0]", "content[2]"]);
  });

  it("should descend into a footnote body's own content, the same as every other check in this recursion", () => {
    const content: Content = [
      { text: "word", foot: { type: "trn", content: ["about 2/3 of a bushel"] } },
    ];
    expect(findStrongsNodeIssues(content).fractionFindings).toEqual(["content.foot.content[0]"]);
  });
});

describe("findStrongsNodeIssues — ellipsis convention", () => {
  it("should flag a footnote node whose text still carries three ASCII periods — real WEBUS2020 2ES 9:13 shape, the reported bug", () => {
    const content: Content = [
      { text: "word", foot: { type: "trn", content: [{ text: "and whose...", marks: ["i"] }] } },
    ];
    expect(findStrongsNodeIssues(content).ellipsisFindings).toEqual(["content.foot.content[0]"]);
  });

  it("should flag a node whose text carries a spaced dot run — real ASV1901 shape", () => {
    const content: Content = [{ text: "I was restored . . . and he was hanged", marks: ["i"] }];
    expect(findStrongsNodeIssues(content).ellipsisFindings).toEqual(["content[0]"]);
  });

  it("should flag a two-period node — deliberately broader than the auto-fix, which never rewrites this shape — real YLT1898 shape", () => {
    const content: Content = [{ text: "fully numbered..and obtained the lot", marks: ["i"] }];
    expect(findStrongsNodeIssues(content).ellipsisFindings).toEqual(["content[0]"]);
  });

  it("should stay silent on text already normalized to U+2026", () => {
    const content: Content = [{ text: "be asking…be seeking (or desiring)", marks: ["i"] }];
    expect(findStrongsNodeIssues(content).ellipsisFindings).toEqual([]);
  });

  it("should stay silent on a single period", () => {
    const content: Content = [{ text: "and when.", marks: ["i"] }];
    expect(findStrongsNodeIssues(content).ellipsisFindings).toEqual([]);
  });

  it("should report each offending node's own path when more than one node in the same array carries an ellipsis indicator", () => {
    const content: Content = [{ text: "and whose..." }, "plain text", { text: "and when..." }];
    expect(findStrongsNodeIssues(content).ellipsisFindings).toEqual(["content[0]", "content[2]"]);
  });
});

describe("findStrongsNodeIssues — straight quotes", () => {
  it("should flag a node whose text carries an ASCII apostrophe, naming the offending character", () => {
    const content: Content = [{ text: "the servant's word", marks: ["i"] }];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe("content[0]");
    expect(findings[0].character).toBe("'");
  });

  it("should flag a node whose text carries an ASCII double quote", () => {
    const content: Content = [{ text: 'he said, "come"', marks: ["i"] }];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].character).toBe('"');
  });

  it("should stay silent on text already using this repo's own curly quote forms", () => {
    const content: Content = [{ text: "the servant’s word: “come,” he said ‘now’", marks: ["i"] }];
    expect(findStrongsNodeIssues(content).straightQuoteFindings).toEqual([]);
  });

  it("should flag a bare string carrying an apostrophe — bare strings are real content here, not just object nodes", () => {
    const content: Content = ["the LORD's anointed"];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe("content[0]");
  });

  it("should stay silent on a bibleLink node's own target, even one carrying a straight quote — targets are machine identifiers, not prose, and walkLevel never descends into a bibleLink's own display override as nested content", () => {
    const content: Content = [
      { bibleLink: "Exodus 12:3'", content: "Ex. 12:3" } as unknown as Content,
    ];
    expect(findStrongsNodeIssues(content).straightQuoteFindings).toEqual([]);
  });

  it("should include a short excerpt of the surrounding text, truncated with an ellipsis marker, so a reader can tell an apostrophe from a quote without opening the file", () => {
    const prefix = "word ".repeat(10);
    const suffix = " word".repeat(10);
    const text = `${prefix}servant's${suffix}`;
    const content: Content = [{ text }];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].excerpt).toContain("servant");
    expect(findings[0].excerpt.length).toBeLessThan(text.length);
    expect(findings[0].excerpt.startsWith("…")).toBe(true);
    expect(findings[0].excerpt.endsWith("…")).toBe(true);
  });

  it("should report each offending node's own path when more than one node in the same array carries a straight quote", () => {
    const content: Content = [{ text: "the LORD's" }, "plain text", { text: "Amen,' he said" }];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings.map((finding) => finding.path)).toEqual(["content[0]", "content[2]"]);
  });

  it("should descend into a footnote body's own content, the same as every other check in this recursion", () => {
    const content: Content = [
      { text: "word", foot: { type: "trn", content: [{ text: "the servant's word" }] } },
    ];
    expect(
      findStrongsNodeIssues(content).straightQuoteFindings.map((finding) => finding.path),
    ).toEqual(["content.foot.content[0]"]);
  });
});

describe("findStrongsNodeIssues — non-standard whitespace", () => {
  // Synthetic fixtures throughout: the corpus carries none of these
  // characters today, so only fault injection can prove the check works —
  // a clean corpus reporting zero findings would prove nothing.

  it("should flag a node whose text carries a non-breaking space (U+00A0), naming its codepoint", () => {
    const content: Content = [{ text: "10 a.m." }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe("content[0]");
    expect(findings[0].codePoint).toBe("U+00A0");
  });

  it("should flag a thin space (U+2009)", () => {
    const content: Content = [{ text: "a b" }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].codePoint).toBe("U+2009");
  });

  it("should flag a zero-width space (U+200B)", () => {
    const content: Content = [{ text: "a​b" }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].codePoint).toBe("U+200B");
  });

  it("should flag a narrow no-break space (U+202F)", () => {
    const content: Content = [{ text: "a b" }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].codePoint).toBe("U+202F");
  });

  it("should flag a zero-width no-break space / byte-order mark (U+FEFF)", () => {
    const content: Content = [{ text: "﻿a" }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].codePoint).toBe("U+FEFF");
  });

  it("should flag a tab", () => {
    const content: Content = [{ text: "a\tb" }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].codePoint).toBe("U+0009");
  });

  it("should flag a bare newline", () => {
    const content: Content = [{ text: "a\nb" }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].codePoint).toBe("U+000A");
  });

  it("should stay silent on an ordinary ASCII space — this corpus's own sanctioned whitespace character", () => {
    const content: Content = [{ text: "the servant's word", marks: ["i"] }];
    expect(findStrongsNodeIssues(content).nonStandardWhitespaceFindings).toEqual([]);
  });

  it("should flag a bare string carrying a non-breaking space — bare strings are real content here, not just object nodes", () => {
    const content: Content = ["10 a.m."];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe("content[0]");
  });

  it("should include a short excerpt of the surrounding text, truncated with an ellipsis marker, matching the straight-quote check's own excerpt shape", () => {
    const prefix = "word ".repeat(10);
    const suffix = " word".repeat(10);
    const text = `${prefix}ten am${suffix}`;
    const content: Content = [{ text }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].excerpt).toContain("ten");
    expect(findings[0].excerpt.length).toBeLessThan(text.length);
    expect(findings[0].excerpt.startsWith("…")).toBe(true);
    expect(findings[0].excerpt.endsWith("…")).toBe(true);
  });

  it("should report each offending node's own path when more than one node in the same array carries a non-standard whitespace character", () => {
    const content: Content = [{ text: "a b" }, "plain text", { text: "c d" }];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings.map((finding) => finding.path)).toEqual(["content[0]", "content[2]"]);
  });

  it("should descend into a footnote body's own content, the same as every other check in this recursion", () => {
    const content: Content = [
      { text: "word", foot: { type: "trn", content: [{ text: "a b" }] } },
    ];
    expect(
      findStrongsNodeIssues(content).nonStandardWhitespaceFindings.map((finding) => finding.path),
    ).toEqual(["content.foot.content[0]"]);
  });
});

describe("findStrongsNodeIssues — the {paragraph: <content>} wrapper (walkLevel's own blind spot, closed)", () => {
  it("should descend into a {paragraph: <content>} wrapper — the schema-permitted content-bearing shape, distinct from an ordinary text node's own boolean paragraph flag", () => {
    const content: Content = [
      { paragraph: [{ text: "the servant's word" }] } as unknown as Content,
    ];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings.map((finding) => finding.path)).toEqual(["content.paragraph[0]"]);
  });

  it("should still treat an ordinary boolean paragraph flag as a flag, not a wrapper to descend into", () => {
    const content: Content = [{ paragraph: true, text: "the servant's word" }];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings.map((finding) => finding.path)).toEqual(["content[0]"]);
  });

  it("should find a non-standard whitespace character nested inside a {paragraph: <content>} wrapper (this check shares the same recursion)", () => {
    const content: Content = [
      { paragraph: [{ text: "a b" }] } as unknown as Content,
    ];
    const findings = findStrongsNodeIssues(content).nonStandardWhitespaceFindings;
    expect(findings.map((finding) => finding.path)).toEqual(["content.paragraph[0]"]);
  });
});

describe("findHeadingParagraphMismatches", () => {
  // Fixtures mix real verse shapes with invented ones into synthetic
  // "books" — production only ever sees one real book's verses at a time
  // (see auditVersion's per-file loop), but the rule is flat, so a fixture
  // doesn't need to model that structure to trigger a finding.

  it("should collapse a heading immediately followed by a subtitle into one run before judging what comes after — real WEBUS2020 Psalm 90:1 shape", () => {
    const headingNode = { heading: [{ text: "Book Four", marks: ["sc"] }, " (Psalms 90-106)"] };
    const subtitleNode = { subtitle: { text: "A Prayer by Moses, the man of God.", foot: { type: "stu", content: "x" } } };
    const realNextNode = { text: "Lord,", foot: { type: "stu", content: "x" } };

    const verses: VerseRecord[] = [
      {
        book: "PSA",
        chapter: 90,
        verse: 1,
        content: [headingNode, subtitleNode, realNextNode, { text: " you have been our dwelling place for all generations.", break: true }] as unknown as Content,
      },
    ];

    const findings = findHeadingParagraphMismatches(verses);
    expect(findings).toHaveLength(1);
    expect(findings[0].run).toEqual([headingNode, subtitleNode]);
    expect(findings[0].next).toEqual(realNextNode);
    expect(findings[0].nextIndex).toBe(2);
  });

  it("should treat a collapsed heading+subtitle run as correctly paired when its real next node opens a paragraph — synthetic heading+subtitle-then-paragraph shape", () => {
    const verses: VerseRecord[] = [
      {
        book: "PSA",
        chapter: 3,
        verse: 1,
        content: [
          { heading: "A Plea for Help" },
          { subtitle: [{ text: "A song, ", foot: { type: "xrf", content: "x" } }, "written for the choir director."] },
          { paragraph: true, text: "Hear " },
          { text: "Lord", marks: ["sc"] },
        ] as unknown as Content,
      },
    ];

    expect(findHeadingParagraphMismatches(verses)).toEqual([]);
  });

  it("should flag a mid-verse heading the same as any other, with nothing about the book around it changing the answer — real WEBUS2020 Song of Solomon 1:4 shape", () => {
    const friendsHeading = { heading: "Friends" };

    const verses: VerseRecord[] = [
      { book: "SOS", chapter: 1, verse: 1, content: "By night on my bed," as unknown as Content },
      {
        book: "SOS",
        chapter: 1,
        verse: 4,
        content: [
          { text: "The king has brought me into his rooms.", break: true },
          friendsHeading,
          { text: "We will be glad and rejoice in you.", break: true },
        ] as unknown as Content,
      },
    ];

    const findings = findHeadingParagraphMismatches(verses);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ book: "SOS", chapter: 1, verse: 4, nextIndex: 2 });
    expect(findings[0].run).toEqual([friendsHeading]);
  });

  it("should stay silent on a correctly-paired chapter-opening heading, whether or not anything else in the book carries one", () => {
    const verses: VerseRecord[] = [
      {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { heading: "The Beginning" },
          { paragraph: true, text: "In the ", foot: { type: "xrf", content: "x" } },
          "beginning, God created the heavens and the earth.",
        ] as unknown as Content,
      },
    ];

    expect(findHeadingParagraphMismatches(verses)).toEqual([]);
  });

  it("should report both runs in one verse separately, telling them apart by nextIndex — real WEBUS2020 Song of Solomon 6:13 shape", () => {
    const friendsHeading = { heading: "Friends" };
    const loverHeading = { heading: "Lover" };

    const verses: VerseRecord[] = [
      {
        book: "SOS",
        chapter: 6,
        verse: 13,
        content: [
          friendsHeading,
          { text: "Return, return, Shulammite!", break: true },
          loverHeading,
          { text: "Why do you desire to gaze at the Shulammite,", break: true },
        ] as unknown as Content,
      },
    ];

    const findings = findHeadingParagraphMismatches(verses);
    expect(findings).toHaveLength(2);
    expect(findings[0].run).toEqual([friendsHeading]);
    expect(findings[0].nextIndex).toBe(1);
    expect(findings[1].run).toEqual([loverHeading]);
    expect(findings[1].nextIndex).toBe(3);
  });

  it("should skip past a node that renders nothing to reach the block the flag really belongs on — real YLT1898 1 Corinthians 7:1 shape", () => {
    const chapterSummary = { foot: { type: "stu", content: "Chapter VII. may be divided into five parts..." } };

    const paired: VerseRecord[] = [
      {
        book: "1CO",
        chapter: 7,
        verse: 1,
        content: [
          { heading: "Marriage" },
          chapterSummary,
          { paragraph: true, text: "And concerning the things of which ye wrote to me:" },
        ] as unknown as Content,
      },
    ];
    expect(findHeadingParagraphMismatches(paired)).toEqual([]);

    const unpaired: VerseRecord[] = [
      {
        book: "1CO",
        chapter: 7,
        verse: 1,
        content: [
          { heading: "Marriage" },
          chapterSummary,
          { text: "And concerning the things of which ye wrote to me:" },
        ] as unknown as Content,
      },
    ];
    const findings = findHeadingParagraphMismatches(unpaired);
    expect(findings).toHaveLength(1);
    expect(findings[0].nextIndex).toBe(2);
  });

  it("should stay silent on a heading with nothing after it at all — there is no node for the convention to apply to", () => {
    const verses: VerseRecord[] = [
      { book: "PSA", chapter: 3, verse: 1, content: ["Trailing line.", { heading: "Selah" }] as unknown as Content },
      { book: "PSA", chapter: 4, verse: 1, content: { heading: "A lone heading" } as unknown as Content },
    ];

    expect(findHeadingParagraphMismatches(verses)).toEqual([]);
  });
});

describe("findStrongsNodeIssues — footnote punctuation order", () => {
  it("should flag the literal Revelation 1:8 shape, naming the leading punctuation and the sibling it belongs to — real WEBUS2020 Revelation 1:8 shape", () => {
    const content: Content = [
      {
        paragraph: true,
        text: "“I am the Alpha and the Omega,",
        marks: ["woc"],
        foot: { type: "var", content: "TR adds “the Beginning and the End”" },
      },
      { text: "”", marks: ["woc"] },
      {
        text: " says the Lord God,",
        foot: { type: "var", content: "TR omits “God”" },
      },
      {
        text: " “who is and who was and who is to come, the Almighty.”",
        marks: ["woc"],
      },
    ];
    const findings = findStrongsNodeIssues(content).footnotePunctuationOrder;
    // Only node 0's foot fires. Node 2's foot is followed by a sibling whose
    // own text starts with a space, not punctuation, so it stays silent.
    expect(findings).toHaveLength(1);
    expect(findings[0].node).toEqual(content[0]);
    expect(findings[0].leading).toBe("”");
    expect(findings[0].next).toEqual(content[1]);
  });

  it("should stay silent when nothing follows the foot-carrying node at all", () => {
    const content: Content = [{ text: "word", foot: { type: "var", content: "x" } }];
    expect(findStrongsNodeIssues(content).footnotePunctuationOrder).toEqual([]);
  });

  it("should stay silent when the next sibling starts with a space", () => {
    const content: Content = [
      { text: "word", foot: { type: "var", content: "x" } },
      { text: " next" },
    ];
    expect(findStrongsNodeIssues(content).footnotePunctuationOrder).toEqual([]);
  });

  it("should stay silent when the next sibling starts with an em dash — this corpus glues a dash to the following piece of a compound word on purpose", () => {
    const content: Content = [
      { text: "word", foot: { type: "var", content: "x" } },
      { text: "—next" },
    ];
    expect(findStrongsNodeIssues(content).footnotePunctuationOrder).toEqual([]);
  });

  it("should stay silent when the next sibling starts with an opening quote or parenthesis — those attach to what follows, not what precedes", () => {
    const content: Content = [
      { text: "word", foot: { type: "var", content: "x" } },
      { text: "“Open quote" },
    ];
    expect(findStrongsNodeIssues(content).footnotePunctuationOrder).toEqual([]);
  });

  it("should flag when the punctuation is only the leading run of the next sibling's text, with real content continuing after it", () => {
    const content: Content = [
      { text: "word", foot: { type: "var", content: "x" } },
      { text: "! Next", marks: [] },
    ];
    const findings = findStrongsNodeIssues(content).footnotePunctuationOrder;
    expect(findings).toHaveLength(1);
    expect(findings[0].leading).toBe("!");
    expect(findings[0].next).toEqual(content[1]);
  });

  it("should skip straight through a textless Strong's sibling to find the real next node", () => {
    const content: Content = [
      { text: "word", foot: { type: "var", content: "x" } },
      { strong: "H853" },
      { text: ", more" },
    ];
    const findings = findStrongsNodeIssues(content).footnotePunctuationOrder;
    expect(findings).toHaveLength(1);
    expect(findings[0].next).toEqual(content[2]);
  });

  it("should stay silent when the next node opens a new paragraph", () => {
    const content: Content = [
      { text: "word", foot: { type: "var", content: "x" } },
      { text: "! Next", paragraph: true },
    ];
    expect(findStrongsNodeIssues(content).footnotePunctuationOrder).toEqual([]);
  });

  it("should stay silent when the foot-carrying node itself has no text at all — a second footnote riding as a textless sibling on a word it doesn't own the text of", () => {
    const content: Content = [
      { text: "word", strong: "H1" },
      { foot: { type: "var", content: "x" } },
      { text: "! Next" },
    ];
    expect(findStrongsNodeIssues(content).footnotePunctuationOrder).toEqual([]);
  });
});

describe("findStrongsNodeIssues — mark-boundary embedded spaces", () => {
  const revelation18: Content = [
    {
      paragraph: true,
      text: "“I am the Alpha and the Omega,",
      marks: ["woc"],
      foot: { type: "var", content: "TR adds “the Beginning and the End”" },
    },
    { text: "”", marks: ["woc"] },
    {
      text: " says the Lord God,",
      foot: { type: "var", content: "TR omits “God”" },
    },
    {
      text: " “who is and who was and who is to come, the Almighty.”",
      marks: ["woc"],
    },
  ];

  it("should flag the literal Revelation 1:8 shape's own leading-space violation — real WEBUS2020 Revelation 1:8 shape", () => {
    const findings = findStrongsNodeIssues(revelation18).markBoundaryEmbeddedSpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].side).toBe("leading");
    expect(findings[0].node).toEqual((revelation18 as unknown[])[3]);
    expect(findings[0].neighbor).toEqual((revelation18 as unknown[])[2]);
  });

  it("should not flag the third node's own leading space next to the second node's differing marks — the third node itself carries no marks, so there is nothing on its own side for the space to wrongly extend", () => {
    const findings = findStrongsNodeIssues(revelation18).markBoundaryEmbeddedSpaces;
    expect(findings.some((f) => f.node === (revelation18 as unknown[])[2])).toBe(false);
  });

  it("should stay silent when both real sides agree in marks", () => {
    const content: Content = [
      { text: "the Father", marks: ["woc"] },
      { text: " loves us", marks: ["woc"] },
    ];
    expect(findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces).toEqual([]);
  });

  it("should flag the trailing-space direction symmetrically", () => {
    const content: Content = [
      { text: "the Father ", marks: ["woc"] },
      { text: "loves us" },
    ];
    const findings = findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].side).toBe("trailing");
    expect(findings[0].node).toEqual(content[0]);
    expect(findings[0].neighbor).toEqual(content[1]);
  });

  it("should flag on a script mismatch alone, marks equal", () => {
    const content: Content = [
      { text: "word", script: "G" },
      { text: " next", script: "H" },
    ];
    const findings = findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].side).toBe("leading");
  });

  it("should stay silent when nothing precedes a leading-space node, or follows a trailing-space node, in the array at all", () => {
    expect(findStrongsNodeIssues([{ text: " word", marks: ["woc"] }]).markBoundaryEmbeddedSpaces).toEqual([]);
    expect(findStrongsNodeIssues([{ text: "word ", marks: ["woc"] }]).markBoundaryEmbeddedSpaces).toEqual([]);
  });

  it("should stay silent when the real neighbor is a ContentNested wrapper with no top-level text", () => {
    const content: Content = [
      { content: ["the Father"], strong: "G3962" } as unknown as Content,
      { text: " loves us", marks: ["woc"] },
    ];
    expect(findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces).toEqual([]);
  });

  it("should skip through a textless Strong's sibling on the backward, leading-space direction", () => {
    const content: Content = [
      { text: "the Father" },
      { strong: "G3962" },
      { text: " loves us", marks: ["woc"] },
    ];
    const findings = findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].side).toBe("leading");
    expect(findings[0].neighbor).toEqual(content[0]);
  });

  it("should skip through a textless Strong's sibling on the forward, trailing-space direction", () => {
    const content: Content = [
      { text: "the Father ", marks: ["woc"] },
      { strong: "G3962" },
      { text: "loves us" },
    ];
    const findings = findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].side).toBe("trailing");
    expect(findings[0].neighbor).toEqual(content[2]);
  });

  it("should stay silent across a break on the neighbor side, for the leading-space direction", () => {
    const content: Content = [
      { text: "the Father", break: true },
      { text: " loves us", marks: ["woc"] },
    ];
    expect(findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces).toEqual([]);
  });

  it("should stay silent when the neighbor opens a new paragraph, for the trailing-space direction", () => {
    const content: Content = [
      { text: "the Father ", marks: ["woc"] },
      { text: "loves us", paragraph: true },
    ];
    expect(findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces).toEqual([]);
  });

  it("should stay silent on a strict formatting-subset boundary — real YLT1898 Matthew 5:12 shape (a woc-marked node's trailing space bordering a translator-supplied word that is also part of Christ's own discourse, marks: [\"i\",\"woc\"])", () => {
    const content: Content = [
      { text: " ye and be glad, because your reward ", marks: ["woc"] },
      { text: "is", marks: ["i", "woc"] },
    ];
    expect(findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces).toEqual([]);
  });

  it("should still flag a genuinely disjoint marks boundary — neither side's marks is a subset of the other's, so the formatting-subset exclusion does not over-fire", () => {
    const content: Content = [
      { text: "the Father", marks: ["woc"] },
      { text: " loves us", marks: ["b"] },
    ];
    const findings = findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].side).toBe("leading");
    expect(findings[0].neighbor).toEqual(content[0]);
  });
});

describe("findStrongsNodeIssues — footnote marker after whitespace", () => {
  it("should flag a footed node whose own text ends in whitespace, with a real node after it — real ASV1901 Genesis 1:2 shape", () => {
    const content: Content = [
      {
        text: "And the earth was waste and void; and darkness was upon the face of the deep: and the Spirit of God ",
        foot: { type: "trn", content: ["Or, ", { text: "was brooding upon", marks: ["i"] }] },
      },
      "moved upon the face of the waters.",
    ];
    const findings = findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace;
    expect(findings).toHaveLength(1);
    expect(findings[0].node).toEqual(content[0]);
    expect(findings[0].next).toEqual(content[1]);
  });

  it("should flag the same own-text-ends-in-whitespace shape at the end of an array, with no real node to relocate onto", () => {
    const content: Content = [{ text: "the earth ", foot: { type: "trn", content: "note" } }];
    const findings = findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace;
    expect(findings).toHaveLength(1);
    expect(findings[0].node).toEqual(content[0]);
    expect(findings[0].next).toBeUndefined();
  });

  it("should flag a textless foot anchor whose predecessor's text ends in whitespace — real WEBUS2020 Mark 9:44 shape", () => {
    const content: Content = [
      {
        text: "‘where their worm doesn’t die, and the fire is not quenched.’ ",
        marks: ["woc"],
        foot: { type: "xrf", content: { bibleLink: "Isaiah 66:24" } },
      },
      { foot: { type: "var", content: "NU omits verse 44." } },
    ];
    const findings = findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace;
    // Both are separate findings: the leading node (its own text ends in
    // whitespace, with the textless anchor as its "next") and the textless
    // anchor itself (renders nothing, so its marker lands at the same
    // accumulated boundary, with nothing following it either).
    expect(findings).toHaveLength(2);
    expect(findings[0].node).toEqual(content[0]);
    expect(findings[1].node).toEqual(content[1]);
    expect(findings[1].next).toBeUndefined();
  });

  it("should not flag a footed node whose own text ends cleanly", () => {
    const content: Content = [
      { text: "the earth", foot: { type: "trn", content: "note" } },
      " was formed.",
    ];
    expect(findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace).toEqual([]);
  });

  it("should not flag a node with no foot at all, even when its own text ends in whitespace", () => {
    const content: Content = [{ text: "the earth " }, "was formed."];
    expect(findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace).toEqual([]);
  });

  it("should skip through a textless Strong's sibling when reporting the real next node", () => {
    const content: Content = [
      { text: "the earth ", foot: { type: "trn", content: "note" } },
      { strong: "H776" },
      "was formed.",
    ];
    const findings = findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace;
    expect(findings).toHaveLength(1);
    expect(findings[0].next).toEqual(content[2]);
  });

  it("should stay silent on a ContentNested wrapper's own foot — this array level can't see its own last rendered character", () => {
    const content: Content = [
      { text: "the earth ", strong: "H776" },
      { content: ["was formed"], strong: "H1961", foot: { type: "trn", content: "note" } } as unknown as Content,
    ];
    expect(findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace).toEqual([]);
  });

  it("should fall through an empty-text husk to the real predecessor's own text", () => {
    const content: Content = [
      { text: "the earth ", strong: "H776" },
      { text: "", foot: { type: "trn", content: "note" } },
    ];
    const findings = findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace;
    expect(findings).toHaveLength(1);
    expect(findings[0].node).toEqual(content[1]);
  });

  it("should not flag an already-extracted, standalone bare foot node spliced between two real nodes — the same shape the footnote-marker-spacing check's own fixer produces (real CLV1880 NUM 20:28, post-fix), exempt structurally, not by the footnote's own type or content", () => {
    const content: Content = [
      { text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius " },
      { foot: { type: "var", content: "Originally verse 20:29." } },
      "illo mortuo in montis supercilio descendit cum Eleazaro",
    ];
    expect(findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace).toEqual([]);
  });

  it("should still flag the combined, not-yet-split shape — real CLV1880 NUM 20:28, pre-fix", () => {
    const content: Content = [
      {
        text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius ",
        foot: { type: "var", content: "Originally verse 20:29." },
      },
      "illo mortuo in montis supercilio descendit cum Eleazaro",
    ];
    const findings = findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace;
    expect(findings).toHaveLength(1);
    expect(findings[0].node).toEqual(content[0]);
    expect(findings[0].next).toEqual(content[1]);
  });

  it("should stay silent on a bare foot node already sitting in its own final, settled shape between two real, already-spaced nodes — real KJV1769 Isaiah 10:5 shape", () => {
    const content: Content = [
      {
        text: " Assyrian,",
        foot: {
          type: "trn",
          content: ["Or, ", { text: "woe to the Assyrian", marks: ["i"] }, ": Heb. ", { text: "Asshur", marks: ["i"] }],
        },
        strong: "H804",
      },
      { foot: { type: "trn", content: ["Heb. ", { text: "Ashur", marks: ["i"] }] } },
      { text: " the rod", strong: "H7626" },
    ];
    // Node 0's text ends in "," not whitespace, so it's never a candidate;
    // node 1 is a bare foot node with a real attachment point right after
    // it, so it counts as already-settled regardless of its own foot.
    expect(findStrongsNodeIssues(content).footnoteMarkerAfterWhitespace).toEqual([]);
  });
});

describe("findStrongsNodeIssues — untagged script run", () => {
  it("should flag a bare footnote-body string mixing Latin text with an untagged Hebrew word — real WEBUS2020 Numbers 15:38 shape", () => {
    const content: Content = [
      {
        text: "make themselves fringes",
        foot: { type: "trn", content: "or, tassels (Hebrew צִיצִ֛ת)" },
      },
    ];
    const findings = findStrongsNodeIssues(content).untaggedScriptRuns;
    expect(findings).toEqual(["content.foot.content[0]"]);
  });

  it("should flag the same shape for an untagged Greek word — real YLT1898 Revelation 13:18 shape", () => {
    const content: Content = ["gives the number not in words but in letters, viz., χξς, i.e. 600"];
    expect(findStrongsNodeIssues(content).untaggedScriptRuns).toEqual(["content[0]"]);
  });

  it("should not flag a node already carrying script — real WEBUS2020 Psalm 3:2 shape", () => {
    const content: Content = [
      "The Hebrew word rendered “God” is “",
      { text: "אֱלֹהִ֑ים", script: "H" },
      "” (Elohim).",
    ];
    expect(findStrongsNodeIssues(content).untaggedScriptRuns).toEqual([]);
  });

  it("should not flag an all-Greek string on an all-Greek version's node — the rule is about mixing, which is what keeps BYZ2018's 154,305 Greek nodes out of it", () => {
    const content: Content = ["εἵνεκεν ἕνεκεν"];
    expect(findStrongsNodeIssues(content).untaggedScriptRuns).toEqual([]);
  });

  it("should not flag ordinary Latin-only prose", () => {
    const content: Content = ["A cubit is about 18 inches."];
    expect(findStrongsNodeIssues(content).untaggedScriptRuns).toEqual([]);
  });

  it("should flag a synthetic Latin/Hebrew mix outside a footnote or heading", () => {
    const content: Content = ["the word אמת means truth"];
    expect(findStrongsNodeIssues(content).untaggedScriptRuns).toEqual(["content[0]"]);
  });
});

describe("findStrongsNodeIssues — duplicate footnote anchor", () => {
  it("should flag a textless node whose foot byte-for-byte repeats its predecessor's — real BYZ2018 2 Corinthians 7:12 shape", () => {
    const content: Content = [
      {
        text: " εἵνεκεν",
        script: "G",
        foot: { type: "var", content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }] },
        strong: "G1752",
        morph: "PREP",
      },
      { foot: { type: "var", content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }] } },
    ];
    const findings = findStrongsNodeIssues(content).duplicateFootnoteAnchors;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toEqual(content[0]);
    expect(findings[0].node).toEqual(content[1]);
  });

  it("should flag every repeat in a chain of three, not just the one touching the real node — real BYZ2018 2 Corinthians 7:12 shape (three markers share one apparatus note)", () => {
    const note: Footnote = {
      type: "var",
      content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }],
    };
    const content: Content = [
      { text: " εἵνεκεν", script: "G", foot: note, strong: "G1752", morph: "PREP" },
      { foot: { ...note } },
      { foot: { ...note } },
    ];
    const findings = findStrongsNodeIssues(content).duplicateFootnoteAnchors;
    expect(findings).toHaveLength(2);
    expect(findings[0].node).toEqual(content[1]);
    expect(findings[1].node).toEqual(content[2]);
    // Both compare against the one real node, not against each other — the
    // second duplicate is deleted just as surely as the first, per the top
    // doc comment's "nearest node not itself flagged for deletion" rule.
    expect(findings[0].target).toEqual(content[0]);
    expect(findings[1].target).toEqual(content[0]);
  });

  it("should not flag a byte-identical foot when the later node still renders real text — real ASV1901 Genesis 3:14 shape (183-of-203 case: one note correctly annotating two real word occurrences)", () => {
    const note: Footnote = { type: "trn", content: ["Or, ", { text: "from among", marks: ["i"] }] };
    const content: Content = [
      { text: "cursed art thou", foot: note },
      { text: " above all cattle, and", foot: { ...note } },
      " above every beast of the field",
    ];
    expect(findStrongsNodeIssues(content).duplicateFootnoteAnchors).toEqual([]);
  });

  it("should not flag two adjacent textless anchors whose own foot values genuinely differ only in their own manuscript-witness prefix — real BYZ2018 Revelation 7:5 shape (both type \"var\"; \"B \" against a distinct \"N \" variant note immediately after)", () => {
    const content: Content = [
      {
        text: " ἐσφραγισμέναι·",
        script: "G",
        foot: { type: "var", content: ["B ", { text: "ἐσφραγισμέναι", script: "G" }, " ⇒ ", { text: "ἐσφραγισμένοι", script: "G" }] },
        strong: "G4972",
        morph: "V-RPP-NPF",
      },
      {
        foot: { type: "var", content: ["N ", { text: "ἐσφραγισμέναι", script: "G" }, " ⇒ ", { text: "ἐσφραγισμένοι", script: "G" }] },
      },
    ];
    expect(findStrongsNodeIssues(content).duplicateFootnoteAnchors).toEqual([]);
  });

  it("should not flag a node with no foot at all, even sitting beside a footed node", () => {
    const content: Content = [
      { text: "word", foot: { type: "trn", content: "note" } },
      { text: "" },
    ];
    expect(findStrongsNodeIssues(content).duplicateFootnoteAnchors).toEqual([]);
  });

  it("should not flag the first node in an array, regardless of its own foot", () => {
    const content: Content = [{ foot: { type: "trn", content: "note" } }];
    expect(findStrongsNodeIssues(content).duplicateFootnoteAnchors).toEqual([]);
  });

  it("should not flag an empty-text husk immediately following a node with no foot at all", () => {
    const content: Content = [
      { text: "word" },
      { text: "", foot: { type: "trn", content: "note" } },
    ];
    expect(findStrongsNodeIssues(content).duplicateFootnoteAnchors).toEqual([]);
  });
});

describe("findStrongsNodeIssues — mergeable siblings", () => {
  it("should flag a bare string immediately followed by a text-only object — real YLT1898 Exodus 3:1 heading shape", () => {
    const content: Content = { heading: ["The Angel of the ", { text: "Jehovah" }] };
    const findings = findStrongsNodeIssues(content).mergeableSiblingPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.heading");
    expect(findings[0].first).toBe("The Angel of the ");
    expect(findings[0].second).toEqual({ text: "Jehovah" });
  });

  it("should flag two adjacent bare strings — real YLT1898 John 1:1 shape", () => {
    const content: Content = [
      "In the beginning was the Word,",
      " and the Word was with God, and the Word was God;",
    ];
    const findings = findStrongsNodeIssues(content).mergeableSiblingPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].first).toBe("In the beginning was the Word,");
    expect(findings[0].second).toBe(" and the Word was with God, and the Word was God;");
  });

  it("should flag two adjacent objects that agree in marks and script — real YLT1898 Revelation 3:1 shape", () => {
    const content: Content = [
      { text: "Sardis", marks: ["woc"] },
      { text: " write: these things", marks: ["woc"] },
    ];
    const findings = findStrongsNodeIssues(content).mergeableSiblingPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].first).toEqual({ text: "Sardis", marks: ["woc"] });
    expect(findings[0].second).toEqual({ text: " write: these things", marks: ["woc"] });
  });

  it("should not flag two adjacent objects that disagree in marks", () => {
    const content: Content = [
      { text: "Sardis", marks: ["woc"] },
      { text: " write", marks: ["sc"] },
    ];
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
  });

  it("should not flag two adjacent objects that disagree in script", () => {
    const content: Content = [
      { text: "אמת", script: "H" },
      { text: "אחר", script: "G" as unknown as "H" },
    ];
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
  });

  it("should not flag a pair where the earlier node ends with a break", () => {
    const content: Content = [
      { text: "foo", break: true },
      { text: "bar" },
    ];
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
  });

  it("should not flag a pair where the later node opens a paragraph", () => {
    const content: Content = [
      { text: "foo" },
      { paragraph: true, text: "bar" },
    ];
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
  });

  it("should not flag a pair where the earlier node carries a strong number", () => {
    const content: Content = [
      { text: "foo", strong: "H1" },
      { text: "bar" },
    ];
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
  });

  it("should not flag a pair where the later node carries a foot", () => {
    const content: Content = [
      { text: "foo" },
      { text: "bar", foot: { type: "trn", content: "note" } },
    ];
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
  });

  it("should not flag a pair where the later node is a bibleLink", () => {
    const content: Content = [
      { text: "See " },
      { bibleLink: "John 3:16" },
    ] as unknown as Content;
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
  });

  it("should not flag a pair where the earlier node carries nested content", () => {
    const content: Content = [
      { content: ["foo"], strong: "H1" } as unknown as Content,
      "bar",
    ] as unknown as Content;
    expect(findStrongsNodeIssues(content).mergeableSiblingPairs).toEqual([]);
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

  it("should find a footnote-punctuation-order finding inside a footnote body's own content too", () => {
    const content: Content = [
      {
        text: "word",
        strong: "H1",
        foot: {
          type: "trn",
          content: [
            { text: "inner", foot: { type: "var", content: "y" } },
            { text: "”" },
          ],
        },
      },
    ];
    const findings = findStrongsNodeIssues(content).footnotePunctuationOrder;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.foot.content");
  });

  it("should find an untagged-script-run finding inside a ContentNested wrapper's own content too", () => {
    const content: Content = [
      { content: ["the word אמת means truth"], strong: "H571" } as unknown as Content,
    ];
    const findings = findStrongsNodeIssues(content).untaggedScriptRuns;
    expect(findings).toEqual(["content.content[0]"]);
  });

  it("should find a mark-boundary-embedded-space finding inside a footnote body's own content too", () => {
    const content: Content = [
      {
        text: "word",
        foot: {
          type: "trn",
          content: [
            { text: "the Father", marks: [] },
            { text: " loves us", marks: ["woc"] },
          ],
        },
      },
    ];
    const findings = findStrongsNodeIssues(content).markBoundaryEmbeddedSpaces;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.foot.content");
  });

  it("should find a duplicate-footnote-anchor finding inside a footnote body's own content too", () => {
    const note: Footnote = { type: "var", content: "inner note" };
    const content: Content = [
      {
        text: "word",
        foot: {
          type: "trn",
          content: [
            { text: "inner", foot: note },
            { foot: { ...note } },
          ],
        },
      },
    ];
    const findings = findStrongsNodeIssues(content).duplicateFootnoteAnchors;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.foot.content");
  });

  it("should find a mergeable-sibling-pair finding inside a footnote body's own content too", () => {
    const content: Content = [
      {
        text: "word",
        foot: {
          type: "trn",
          content: ["Or, ", { text: "from among" }],
        },
      },
    ];
    const findings = findStrongsNodeIssues(content).mergeableSiblingPairs;
    expect(findings).toHaveLength(1);
    expect(findings[0].where).toBe("content.foot.content");
  });
});

describe("auditVersion / auditVersions — read-only over whatever they're pointed at", () => {
  it("should never mutate its input when called twice against the same in-memory content", () => {
    // Proxies auditVersion's own idempotence: findStrongsNodeIssues (already
    // exercised exhaustively elsewhere in this file) is what it delegates to
    // per verse, so calling it twice here stands in for scanning the real
    // bible-versions/ corpus twice.
    const content: Content = [
      { text: "the servant's word", marks: ["i"] },
      { text: " and it was so.", strong: "H776" },
    ];
    const first = JSON.stringify(findStrongsNodeIssues(content));
    const second = JSON.stringify(findStrongsNodeIssues(content));
    expect(second).toBe(first);
  });
});

describe("exitCodeFor", () => {
  it("should exit non-zero when a version carries any finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [{ version: "X", file: "01-GEN.json", book: "GEN", chapter: 1, verse: 1, path: "content[0]" }],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a duplicate-footnote-anchor finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [
        { version: "X", file: "08-2CO.json", book: "2CO", chapter: 7, verse: 12, where: "content", node: {}, target: {} },
      ],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a mark-boundary-space finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [
        { version: "X", file: "40-MAT.json", book: "MAT", chapter: 6, verse: 32, where: "content", left: {}, space: " ", target: {} },
      ],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a verse-initial-space finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [
        { version: "X", file: "66-REV.json", book: "REV", chapter: 1, verse: 8, first: " ", next: {} },
      ],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a heading/subtitle-paragraph mismatch", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [
        { version: "X", file: "30-AMS.json", book: "AMS", chapter: 1, verse: 2, run: [{ heading: "x" }], next: "y", nextIndex: 1 },
      ],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a fraction finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [
        { version: "X", file: "02-EXO.json", book: "EXO", chapter: 16, verse: 36, path: "content.foot.content[0]" },
      ],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a footnote-punctuation-order finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [
        { version: "X", file: "81-REV.json", book: "REV", chapter: 1, verse: 8, where: "content", node: {}, leading: "”", next: {} },
      ],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a mark-boundary-embedded-space finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [
        { version: "X", file: "81-REV.json", book: "REV", chapter: 1, verse: 8, where: "content", side: "leading" as const, node: {}, neighbor: {} },
      ],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only an ellipsis finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [
        { version: "X", file: "53-2ES.json", book: "2ES", chapter: 9, verse: 13, path: "content[0].foot.content[1]" },
      ],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a straight-quote finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [
        { version: "X", file: "01-GEN.json", book: "GEN", chapter: 1, verse: 1, path: "content[0]", character: "'", excerpt: "servant's" },
      ],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a footnote-marker-after-whitespace finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [
        { version: "X", file: "01-GEN.json", book: "GEN", chapter: 1, verse: 2, where: "content", node: {}, next: {} },
      ],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only an untagged-script-run finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [
        { version: "X", file: "04-NUM.json", book: "NUM", chapter: 15, verse: 38, path: "content.foot.content[0]" },
      ],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a mergeable-sibling-pair finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [
        { version: "X", file: "02-EXO.json", book: "EXO", chapter: 3, verse: 1, where: "content.heading", first: "The Angel of the ", second: { text: "Jehovah" } },
      ],
      nonStandardWhitespaceFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a non-standard-whitespace finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [
        { version: "X", file: "01-GEN.json", book: "GEN", chapter: 1, verse: 1, path: "content[0]", codePoint: "U+00A0", excerpt: "10 a.m." },
      ],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit zero when a version carries no finding across any check", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
      duplicateFootnoteAnchors: [],
      trailingWhitespace: [],
      leadingPunctuation: [],
      markBoundarySpaces: [],
      verseInitialSpaces: [],
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
      footnoteMarkerAfterWhitespace: [],
      untaggedScriptRuns: [],
      mergeableSiblingPairs: [],
      nonStandardWhitespaceFindings: [],
    } as const;
    expect(exitCodeFor([summary])).toBe(0);
  });
});
