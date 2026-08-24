import { describe, expect, it } from "vitest";
import { buildBlockContent } from "../blockStructure";
import { VerseBlock } from "../segmentVerses";

describe("buildBlockContent — the three shapes content-schema.json's own precedent already establishes", () => {
  it("should collapse a single unflagged block to a bare string, matching Phase 1's own plain-text verses", () => {
    const blocks: VerseBlock[] = [{ text: "In the beginning, God created the heavens and the earth." }];
    expect(buildBlockContent(blocks)).toBe("In the beginning, God created the heavens and the earth.");
  });

  it("should render a single flagged block as a bare object, never wrapped in a one-element array (bible-versions/NIV1984/01-GEN.json and ASV1901/01-GEN.json 1:1)", () => {
    const blocks: VerseBlock[] = [{ text: "In the beginning God created the heavens and the earth.", paragraph: true }];
    expect(buildBlockContent(blocks)).toEqual({
      text: "In the beginning God created the heavens and the earth.",
      paragraph: true,
    });
  });

  it("should render a single break-flagged block as a bare object carrying only break", () => {
    const blocks: VerseBlock[] = [{ text: "I shall not want.", break: true }];
    expect(buildBlockContent(blocks)).toEqual({ text: "I shall not want.", break: true });
  });

  it("should render multiple blocks as an array, mixing bare strings for unflagged blocks with objects for flagged ones (bible-versions/NKJV1982/19-PSA.json 1:2)", () => {
    const blocks: VerseBlock[] = [
      { text: "These were their names:" },
      { text: "Of the tribe of Reuben, Shammua the son of Zaccur.", paragraph: true },
    ];
    expect(buildBlockContent(blocks)).toEqual([
      "These were their names:",
      { text: "Of the tribe of Reuben, Shammua the son of Zaccur.", paragraph: true },
    ]);
  });

  it("should carry both flags on one block when a single line both opens a paragraph and ends with a break", () => {
    const blocks: VerseBlock[] = [{ text: "Blessed is the man,", paragraph: true, break: true }];
    expect(buildBlockContent(blocks)).toEqual({
      text: "Blessed is the man,",
      paragraph: true,
      break: true,
    });
  });

  it("should throw on an empty blocks array rather than silently emitting invalid content", () => {
    expect(() => buildBlockContent([])).toThrow(/no blocks to render/);
  });
});

describe("buildBlockContent — Phase 3's own `nodes`-aware blocks (Strong's/marks-carrying content, extending the same three shapes)", () => {
  it("should attach paragraph to the first node of a multi-node block, sharing it with that node's own strong (KJV1769 01-GEN.json 1:1's real shape)", () => {
    const blocks: VerseBlock[] = [
      {
        text: "In the beginning God created the heavens and the earth.",
        paragraph: true,
        nodes: [
          { text: "In the beginning", strong: "H7225" },
          { text: " God", strong: "H430" },
        ],
      },
    ];
    expect(buildBlockContent(blocks)).toEqual([
      { text: "In the beginning", strong: "H7225", paragraph: true },
      { text: " God", strong: "H430" },
    ]);
  });

  it("should attach break to the last node of a multi-node block", () => {
    const blocks: VerseBlock[] = [
      {
        text: "Selah.",
        break: true,
        nodes: [{ text: "Many there are", strong: "H7227" }, { text: " Selah.", marks: ["i"] }],
      },
    ];
    expect(buildBlockContent(blocks)).toEqual([
      { text: "Many there are", strong: "H7227" },
      { text: " Selah.", marks: ["i"], break: true },
    ]);
  });

  it("should fall back to the block's own plain text as a single node when it carries no `nodes` of its own, unchanged from Phase 1/2", () => {
    const blocks: VerseBlock[] = [{ text: "plain, unmarked verse text", paragraph: true }];
    expect(buildBlockContent(blocks)).toEqual({ text: "plain, unmarked verse text", paragraph: true });
  });

  it("should flatten multiple blocks' own nodes into one combined array, attaching each block's own flags only to its own first/last node", () => {
    const blocks: VerseBlock[] = [
      { text: "Yahweh, how my adversaries have increased!", break: true, nodes: [{ text: "Yahweh", strong: "H3068" }, { text: ", how my adversaries have increased!" }] },
      { text: "Many are those who rise up against me.", break: true, nodes: [{ text: "Many are those who rise up against me." }] },
    ];
    expect(buildBlockContent(blocks)).toEqual([
      { text: "Yahweh", strong: "H3068" },
      { text: ", how my adversaries have increased!", break: true },
      { text: "Many are those who rise up against me.", break: true },
    ]);
  });
});

describe("buildBlockContent — Phase 6's own heading-carrying blocks (subtitle/heading, standing alone, never merged or flag-attached)", () => {
  it("should render a subtitle block as its own array item before the paragraph content that follows it (NKJV1982/19-PSA.json 3:1's own shape)", () => {
    const blocks: VerseBlock[] = [
      { text: "", headingContent: { subtitle: "A Psalm by David, when he fled from Absalom his son." } },
      { text: "Yahweh, how my adversaries have increased!", paragraph: true, break: true },
    ];
    expect(buildBlockContent(blocks)).toEqual([
      { subtitle: "A Psalm by David, when he fled from Absalom his son." },
      { text: "Yahweh, how my adversaries have increased!", paragraph: true, break: true },
    ]);
  });

  it("should render a lone heading-carrying block as a bare object, not wrapped in an array", () => {
    const blocks: VerseBlock[] = [{ text: "", headingContent: { heading: "ALEPH", type: "acrostic" } }];
    expect(buildBlockContent(blocks)).toEqual({ heading: "ALEPH", type: "acrostic" });
  });

  it("should never attach paragraph/break to a heading-carrying block even when it is the block list's own first/last entry", () => {
    const blocks: VerseBlock[] = [
      { text: "", headingContent: { heading: "Beloved" } },
      { text: "Let him kiss me.", paragraph: true, break: true },
    ];
    const result = buildBlockContent(blocks) as unknown[];
    expect(result[0]).toEqual({ heading: "Beloved" });
    expect((result[0] as Record<string, unknown>).paragraph).toBeUndefined();
    expect((result[0] as Record<string, unknown>).break).toBeUndefined();
  });

  it("should stack a book-division heading before a subtitle before the paragraph content, all as sibling array items (NKJV1982/19-PSA.json 42:1's own shape)", () => {
    const blocks: VerseBlock[] = [
      { text: "", headingContent: { heading: [{ text: "Book Two", marks: ["sc"] }, " (Psalms 42–72)"] } },
      { text: "", headingContent: { subtitle: "For the Chief Musician. A contemplation by the sons of Korah." } },
      { text: "As the deer pants for the water brooks,", paragraph: true, break: true },
    ];
    expect(buildBlockContent(blocks)).toEqual([
      { heading: [{ text: "Book Two", marks: ["sc"] }, " (Psalms 42–72)"] },
      { subtitle: "For the Chief Musician. A contemplation by the sons of Korah." },
      { text: "As the deer pants for the water brooks,", paragraph: true, break: true },
    ]);
  });
});
