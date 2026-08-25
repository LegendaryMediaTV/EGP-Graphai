import { describe, expect, it } from "vitest";
import Content from "../../types/Content";
import { getVersionDirectories } from "../../functions/getBibleVersions";
import { uniformFraction } from "../../functions/normalizeFractions";
import {
  auditVersion,
  auditVersions,
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

  it("should flag a node whose text carries a backtick", () => {
    const content: Content = [{ text: "the word `logos`" }];
    const findings = findStrongsNodeIssues(content).straightQuoteFindings;
    expect(findings).toHaveLength(1);
    expect(findings[0].character).toBe("`");
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

describe("findHeadingParagraphMismatches", () => {
  // Fixtures combine real verse shapes with invented ones into small
  // synthetic "books"; production always passes exactly one real book's own
  // verses (see auditVersion's per-file loop). The rule is flat, so no
  // fixture needs to establish anything about the book around it — a run
  // either pairs or it is a finding.

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

  it("should report zero findings for the four strong-specific checks in a version with no Strong's tagging at all", () => {
    const summary = auditVersion("WEBUS2020");
    expect(summary.trailingWhitespace).toEqual([]);
    expect(summary.leadingPunctuation).toEqual([]);
    expect(summary.markBoundarySpaces).toEqual([]);
    expect(summary.verseInitialSpaces).toEqual([]);
  });

  it("should report zero unmerged-pair findings for WEBUS2020 — the importer merges the Genesis-1:1-shaped foot-only split at import time (see utils/usfm/inlineMarks.ts's isMergeTarget)", () => {
    const summary = auditVersion("WEBUS2020");
    expect(summary.unmergedPairs).toEqual([]);
  });

  // The heading/paragraph convention holds across the whole corpus, so the
  // whole corpus is asserted rather than one version at a time. Raw sources
  // rarely write the paragraph themselves — a USFM `\d` superscription,
  // `\sp` speaker label, or `\qc` acrostic letter is normally followed by a
  // bare `\q1`, never a `\p` — which is why 358 runs across four versions
  // were missing it until `usfm/segmentVerses.ts`'s heading dispatch started
  // supplying it and `utils/fixHeadingParagraphs.ts` backfilled the versions
  // already on disk.
  it("should report zero heading/paragraph mismatches anywhere in the corpus — every heading and subtitle opens whatever follows it", () => {
    for (const summary of auditVersions()) {
      expect(summary.headingParagraphMismatches).toEqual([]);
    }
  }, 30000);

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
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
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
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
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
      headingParagraphMismatches: [],
      fractionFindings: [],
      footnotePunctuationOrder: [],
      markBoundaryEmbeddedSpaces: [],
      ellipsisFindings: [],
      straightQuoteFindings: [],
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a heading/subtitle-paragraph mismatch", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
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
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a fraction finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
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
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a footnote-punctuation-order finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
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
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a mark-boundary-embedded-space finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
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
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only an ellipsis finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
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
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit non-zero when a version carries only a straight-quote finding", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
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
    };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit zero when a version carries no finding across all eleven checks", () => {
    const summary = {
      version: "X",
      unmergedPairs: [],
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
    } as const;
    expect(exitCodeFor([summary])).toBe(0);
  });
});
