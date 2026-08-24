import { describe, expect, it } from "vitest";
import Content from "../../../types/Content";
import { isUniformParagraphNoise, ParagraphNoiseVerse, suppressUniformParagraphNoise } from "../paragraphNoise";

describe("suppressUniformParagraphNoise — real USFM source's Genesis 1 shape", () => {
  // Modeled on a real USFM source's own shape — each verse carries
  // `{paragraph: true, text: ...}` as a bare object, not a one-element
  // array.
  const verses: ParagraphNoiseVerse[] = [
    {
      chapter: 1,
      verse: 1,
      content: { paragraph: true, text: "First verse text." },
    },
    {
      chapter: 1,
      verse: 2,
      content: {
        paragraph: true,
        text: "Second verse text, a bit longer than the others so the fixture isn't uniform in length too.",
      },
    },
    {
      chapter: 1,
      verse: 3,
      content: { paragraph: true, text: "Third verse text, with a quoted “remark” inside it." },
    },
    {
      chapter: 2,
      verse: 1,
      content: { paragraph: true, text: "Fourth verse text, opening the next chapter." },
    },
  ];

  const result = suppressUniformParagraphNoise(verses);

  it("should keep paragraph: true on chapter 1's own first verse (1:1)", () => {
    expect(result[0].content).toEqual({
      paragraph: true,
      text: "First verse text.",
    });
  });

  it("should strip paragraph: true from 1:2, a later verse in the same chapter", () => {
    expect(result[1].content).toEqual({
      text: "Second verse text, a bit longer than the others so the fixture isn't uniform in length too.",
    });
  });

  it("should strip paragraph: true from 1:3 too, not just the second verse of the chapter", () => {
    expect(result[2].content).toEqual({
      text: "Third verse text, with a quoted “remark” inside it.",
    });
  });

  it("should keep paragraph: true on chapter 2's own first verse (2:1) — the rule resets per chapter, not just once for the whole book", () => {
    expect(result[3].content).toEqual({
      paragraph: true,
      text: "Fourth verse text, opening the next chapter.",
    });
  });
});

describe("isUniformParagraphNoise / suppressUniformParagraphNoise — the 100%-with-zero-exceptions threshold", () => {
  function uniformBook(): ParagraphNoiseVerse[] {
    return [
      { chapter: 1, verse: 1, content: { paragraph: true, text: "verse one" } },
      { chapter: 1, verse: 2, content: { paragraph: true, text: "verse two" } },
      { chapter: 1, verse: 3, content: { paragraph: true, text: "verse three" } },
    ];
  }

  it("should treat a book where every verse carries paragraph: true as uniform noise, and suppress it", () => {
    const verses = uniformBook();
    expect(isUniformParagraphNoise(verses)).toBe(true);

    const result = suppressUniformParagraphNoise(verses);
    expect(result[0].content).toEqual({ paragraph: true, text: "verse one" });
    expect(result[1].content).toEqual({ text: "verse two" });
    expect(result[2].content).toEqual({ text: "verse three" });
  });

  it("should not trigger at all once even a single verse breaks the 100% uniformity — every real flag stays exactly as the source gave it", () => {
    const verses = uniformBook();
    // Same fixture, minus verse 2's paragraph: true — 2 of 3 (67%), not
    // zero exceptions.
    verses[1] = { chapter: 1, verse: 2, content: { text: "verse two" } };

    expect(isUniformParagraphNoise(verses)).toBe(false);

    const result = suppressUniformParagraphNoise(verses);
    expect(result).toEqual(verses);
  });
});

describe("suppressUniformParagraphNoise — heading/subtitle interaction (synthetic fixture — no real book exercises this today)", () => {
  it("should keep paragraph: true on a node immediately following a heading/subtitle run, even though it is neither the verse's content's first node nor its own chapter's first verse", () => {
    // A synthetic, 100%-uniform book where chapter 1 verse 3 also carries a
    // heading run — per auditNodes.ts's Check 6 rule, the node right after
    // that run must keep paragraph: true even under book-wide suppression,
    // since verse 3 isn't chapter 1's first verse.
    const headingNode = { heading: "A Heading" };
    const afterHeadingNode = { paragraph: true, text: "Text right after the heading." };

    const verses: ParagraphNoiseVerse[] = [
      { chapter: 1, verse: 1, content: { paragraph: true, text: "Chapter 1's own first verse." } },
      { chapter: 1, verse: 2, content: { paragraph: true, text: "An ordinary later verse." } },
      {
        chapter: 1,
        verse: 3,
        content: [headingNode, afterHeadingNode] as unknown as Content,
      },
      { chapter: 2, verse: 1, content: { paragraph: true, text: "Chapter 2's own first verse." } },
    ];

    expect(isUniformParagraphNoise(verses)).toBe(true);

    const result = suppressUniformParagraphNoise(verses);

    expect(result[0].content).toEqual({ paragraph: true, text: "Chapter 1's own first verse." });
    expect(result[1].content).toEqual({ text: "An ordinary later verse." });
    expect(result[2].content).toEqual([headingNode, { paragraph: true, text: "Text right after the heading." }]);
    expect(result[3].content).toEqual({ paragraph: true, text: "Chapter 2's own first verse." });
  });
});
