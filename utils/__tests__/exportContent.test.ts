import { describe, it, expect } from "vitest";
import { convertVerseToText, convertVerseToMarkdown } from "../exportContent";
import VerseSchema from "../../types/VerseSchema";

describe("exportContent", () => {
  describe("convertVerseToText", () => {
    it("should convert a simple verse with plain text", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: "In the beginning God created the heavens and the earth.",
      };
      expect(convertVerseToText(verse)).toBe(
        "001:001 In the beginning God created the heavens and the earth."
      );
    });

    it("should convert verse with Strong's numbers", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "In the beginning", strong: "H7225" },
          { text: " God", strong: "H430" },
          { text: " created", strong: "H1254", morph: "8804" },
        ],
      };
      expect(convertVerseToText(verse)).toBe(
        "001:001 In the beginning H7225 God H430 created H1254 (8804)"
      );
    });

    it("should convert verse with subtitle containing Strong's numbers", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 9,
        verse: 1,
        content: [
          {
            subtitle: [
              { text: "To the chief Musician", strong: "H5329", morph: "8764" },
              { text: " upon Muthlabben,", strong: "H4192" },
              { strong: "H1121" }, // Strong's only, no text
              { text: " A Psalm", strong: "H4210" },
              { text: " of David.", strong: "H1732" },
            ],
          },
          {
            paragraph: true,
            text: "I will praise",
            strong: "H3034",
            morph: "8686",
          },
          { text: " [thee], O LORD,", strong: "H3068" },
        ],
      };
      const result = convertVerseToText(verse);
      expect(result).toContain("«To the chief Musician H5329 (8764)");
      expect(result).toContain("H4192 H1121"); // Space between consecutive Strong's
      expect(result).toContain("»");
      expect(result).toContain("¶ I will praise");
    });

    it("should convert verse with heading", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [{ heading: "The Creation" }, { text: "In the beginning" }],
      };
      expect(convertVerseToText(verse)).toBe(
        "001:001 [[The Creation]] In the beginning"
      );
    });

    it("should convert verse with paragraph wrapper", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 2,
        content: { paragraph: "And the earth was without form" },
      };
      expect(convertVerseToText(verse)).toBe(
        "001:002 And the earth was without form"
      );
    });

    it("should convert verse with paragraph marker on text", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { paragraph: true, text: "In the beginning", strong: "H7225" },
        ],
      };
      expect(convertVerseToText(verse)).toBe(
        "001:001 ¶ In the beginning H7225"
      );
    });

    it("should convert verse with line break", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 1,
        verse: 1,
        content: [
          { text: "Blessed is the man", break: true },
          { text: " that walketh not" },
        ],
      };
      expect(convertVerseToText(verse)).toBe(
        "001:001 Blessed is the man ␤ that walketh not"
      );
    });

    it("should convert verse with footnote", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          {
            text: "God",
            strong: "H430",
            foot: { content: "Hebrew: Elohim" },
          },
          { text: " created" },
        ],
      };
      const result = convertVerseToText(verse);
      expect(result).toContain("God°");
      expect(result).toContain("H430");
      expect(result).toContain("{Hebrew: Elohim}");
    });
  });

  describe("convertVerseToMarkdown", () => {
    it("should convert a simple verse to markdown", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: "In the beginning God created the heavens and the earth.",
      };
      const footnotes: string[] = [];
      expect(convertVerseToMarkdown(verse, footnotes)).toBe(
        "<sup>1</sup> In the beginning God created the heavens and the earth."
      );
    });

    it("should convert verse with text objects (no Strong's in markdown)", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "In the beginning", strong: "H7225" },
          { text: " God", strong: "H430" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> In the beginning God");
      expect(result).not.toContain("H7225"); // No Strong's in markdown
    });

    it("should convert verse with paragraph marker", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [{ paragraph: true, text: "In the beginning" }],
      };
      const footnotes: string[] = [];
      expect(convertVerseToMarkdown(verse, footnotes)).toBe(
        "\n<sup>1</sup> In the beginning"
      );
    });

    it("should convert verse with footnote and track in footnotes array", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "God", foot: { content: "Hebrew: Elohim" } },
          { text: " created" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toContain("<sup>a</sup>");
      expect(footnotes).toHaveLength(1);
      expect(footnotes[0]).toContain("Hebrew: Elohim");
    });

    it("should convert verse with line break to <br>", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 1,
        verse: 1,
        content: [
          { text: "Blessed is the man", break: true },
          { text: " that walketh not" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toContain("<br>");
    });

    it("should handle heading in verse", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 2,
        verse: 1,
        content: [
          { heading: "The Seventh Day" },
          { text: "Thus the heavens and the earth were finished" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toContain("### The Seventh Day");
      expect(result).toContain("<sup>1</sup>");
    });

    it("should handle subtitle in verse (mid-chapter)", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 3,
        verse: 1,
        content: [
          { subtitle: "A Psalm of David" },
          { text: " LORD, how are they increased" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toContain("> _A Psalm of David_");
    });
  });

  describe("real-world verses from KJV1769", () => {
    it("should match expected text export for Genesis 1:1", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "In the beginning", strong: "H7225" },
          { text: " God", strong: "H430" },
          { text: " created", strong: "H1254", morph: "8804" },
          { text: " the heaven", strong: "H8064" },
          { text: " and the earth.", strong: "H776" },
        ],
      };
      expect(convertVerseToText(verse)).toBe(
        "001:001 In the beginning H7225 God H430 created H1254 (8804) the heaven H8064 and the earth. H776"
      );
    });

    it("should match expected text export for Psalm 9:1 with subtitle", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 9,
        verse: 1,
        content: [
          {
            subtitle: [
              { text: "To the chief Musician", strong: "H5329", morph: "8764" },
              { text: " upon Muthlabben,", strong: "H4192" },
              { strong: "H1121" },
              { text: " A Psalm", strong: "H4210" },
              { text: " of David.", strong: "H1732" },
            ],
          },
          {
            paragraph: true,
            text: "I will praise",
            strong: "H3034",
            morph: "8686",
          },
          { text: " [thee], O LORD,", strong: "H3068" },
          { text: " with my whole heart;", strong: "H3820" },
          { text: " I will shew forth", strong: "H5608", morph: "8762" },
          {
            text: " all thy marvellous works.",
            strong: "H6381",
            morph: "8737",
          },
        ],
      };
      const result = convertVerseToText(verse);
      // Check key parts
      expect(result).toMatch(/^009:001/);
      expect(result).toContain(
        "«To the chief Musician H5329 (8764) upon Muthlabben, H4192 H1121 A Psalm H4210 of David. H1732»"
      );
      expect(result).toContain("¶ I will praise H3034 (8686)");
    });
  });
});
