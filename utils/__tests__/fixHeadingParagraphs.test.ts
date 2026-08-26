import { describe, expect, it } from "vitest";
import { addMissingHeadingParagraphsInVerse } from "../fixHeadingParagraphs";

describe("addMissingHeadingParagraphsInVerse", () => {
  it("should flag the real node after a heading/subtitle run that's missing paragraph: true (ASV1901 Psalm 25:1's own real shape)", () => {
    const verse = {
      book: "PSA",
      chapter: 25,
      verse: 1,
      content: [
        { heading: "Prayer for protection, guidance, and pardon." },
        { subtitle: [{ text: "A Psalm", marks: ["i"] }, " of David."] },
        { text: "Unto thee, O Jehovah, do I lift up my soul.", break: true },
      ],
    };

    const { verse: result, changed } = addMissingHeadingParagraphsInVerse(verse as never);

    expect(changed).toBe(true);
    expect(result.content).toEqual([
      { heading: "Prayer for protection, guidance, and pardon." },
      { subtitle: [{ text: "A Psalm", marks: ["i"] }, " of David."] },
      { paragraph: true, text: "Unto thee, O Jehovah, do I lift up my soul.", break: true },
    ]);
  });

  it("should leave a verse that already opens a paragraph after its heading/subtitle run unchanged, returning the original reference", () => {
    const verse = {
      book: "PSA",
      chapter: 25,
      verse: 1,
      content: [
        { heading: "Prayer for protection, guidance, and pardon." },
        { subtitle: [{ text: "A Psalm", marks: ["i"] }, " of David."] },
        { paragraph: true, text: "Unto thee, O Jehovah, do I lift up my soul.", break: true },
      ],
    };

    const result = addMissingHeadingParagraphsInVerse(verse as never);

    expect(result.changed).toBe(false);
    expect(result.verse).toBe(verse);
  });

  it("should be idempotent — flagging an already-flagged verse reports no further change", () => {
    const verse = {
      book: "PSA",
      chapter: 25,
      verse: 1,
      content: [
        { heading: "Prayer for protection, guidance, and pardon." },
        { subtitle: [{ text: "A Psalm", marks: ["i"] }, " of David."] },
        { text: "Unto thee, O Jehovah, do I lift up my soul.", break: true },
      ],
    };

    const first = addMissingHeadingParagraphsInVerse(verse as never);
    const second = addMissingHeadingParagraphsInVerse(first.verse);

    expect(second.changed).toBe(false);
    expect(second.verse).toEqual(first.verse);
  });

  it("should flag a bare string node the same as an object node, wrapping it in {paragraph, text}", () => {
    const verse = {
      book: "GEN",
      chapter: 1,
      verse: 1,
      content: [{ heading: "A heading" }, "plain text with no room for a flag"],
    };

    const { verse: result, changed } = addMissingHeadingParagraphsInVerse(verse as never);

    expect(changed).toBe(true);
    expect(result.content).toEqual([
      { heading: "A heading" },
      { paragraph: true, text: "plain text with no room for a flag" },
    ]);
  });
});
