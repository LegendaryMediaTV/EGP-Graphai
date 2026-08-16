import { describe, it, expect } from "vitest";
import { convertVerseToText, convertVerseToMarkdown } from "../exportContent";
import VerseSchema from "../../types/VerseSchema";

/**
 * Asserts every `**...**`/`_..._` delimiter run in `markdown` opens and
 * closes against non-whitespace — CommonMark's left-/right-flanking rule,
 * which determines whether a delimiter run can open/close emphasis at all
 * (e.g. "** foo**" fails this and a spec-compliant parser renders literal
 * asterisks, not `<strong>`). A plain string-contains check on `**`/`_`
 * passes even when this fails, which is exactly what let the original
 * whitespace-padding defect through an earlier round of tests.
 */
function expectWellFormedEmphasis(markdown: string): void {
  for (const match of markdown.matchAll(/\*\*(.*?)\*\*/g)) {
    expect(match[1]).not.toMatch(/^\s|\s$|^$/);
  }
  for (const match of markdown.matchAll(/_(.*?)_/g)) {
    expect(match[1]).not.toMatch(/^\s|\s$|^$/);
  }
}

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

    it("should render an acrostic heading with a triple-bracket marker", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 119,
        verse: 1,
        content: [
          { heading: "ALEPH", type: "acrostic" },
          { text: "Blessed are those" },
        ],
      };
      expect(convertVerseToText(verse)).toBe(
        "119:001 [[[ALEPH]]] Blessed are those"
      );
    });

    it("should render a standard-typed heading unchanged (regression)", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { heading: "The Creation", type: "standard" },
          { text: "In the beginning" },
        ],
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
        "001:001 Blessed is the man␤ that walketh not"
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

    it("should convert text with sc mark to uppercase", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 2,
        verse: 4,
        content: [
          { text: "the " },
          { text: "Lord", marks: ["sc"] },
          { text: " God made" },
        ],
      };
      expect(convertVerseToText(verse)).toBe("002:004 the LORD God made");
    });

    it("should convert text with sc mark and Strong's numbers", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 2,
        verse: 4,
        content: [
          { text: "the " },
          { text: "Lord", marks: ["sc"], strong: "H3068" },
          { text: " God", strong: "H430" },
        ],
      };
      expect(convertVerseToText(verse)).toBe("002:004 the LORD H3068 God H430");
    });

    it("should not fuse a Strong's-tagged word into the italic word that follows it, when the tagged node's own text absorbed the trailing join-space (GEN 1:2's real H2822/H6440 shape)", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 2,
        content: [
          { text: "and darkness ", strong: "H2822" },
          {
            content: [{ text: "was", marks: ["i"] }, " upon the face"],
            strong: "H6440",
          },
        ],
      };
      expect(convertVerseToText(verse)).toBe(
        "001:002 and darkness H2822 was upon the face H6440"
      );
    });

    it("should not add a space before a line break following a Strong's/morph tag (established no-space-before-break convention)", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 1,
        verse: 1,
        content: [{ text: "Blessed", strong: "H835", morph: "8803", break: true }, "is the man"],
      };
      expect(convertVerseToText(verse)).toBe(
        "001:001 Blessed H835 (8803)␤is the man"
      );
    });

    it("should leave bold and italic marks unrendered in plain text (regression)", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "In the beginning ", marks: ["b"] },
          { text: "God created", marks: ["i"] },
        ],
      };
      const result = convertVerseToText(verse);
      expect(result).toBe("001:001 In the beginning God created");
      expect(result).not.toContain("*");
      expect(result).not.toContain("_");
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
      expect(result).not.toContain("H7225");
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

    it("should convert text with sc mark to uppercase in markdown", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 2,
        verse: 4,
        content: [
          { text: "the " },
          { text: "Lord", marks: ["sc"] },
          { text: " God made the earth" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>4</sup> the LORD God made the earth");
    });

    it("should wrap text with a bold mark in ** in markdown", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "In the beginning " },
          { text: "God", marks: ["b"] },
          { text: " created" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> In the beginning **God** created");
    });

    it("should wrap text with an italic mark in _ in markdown", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "In the beginning " },
          { text: "God", marks: ["i"] },
          { text: " created" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> In the beginning _God_ created");
    });

    it("should nest bold inside italic as _**text**_ when both marks are present", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "In the beginning " },
          { text: "God", marks: ["b", "i"] },
          { text: " created" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> In the beginning _**God**_ created");
    });

    it("should wrap only the trimmed core of a leading-space bold text item, reattaching the space outside ** (real KJV1769 JUD 1:1 shape)", () => {
      const verse: VerseSchema = {
        book: "JUD",
        chapter: 1,
        verse: 1,
        content: [{ text: "Jude," }, { text: " the servant", marks: ["b"] }],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> Jude, **the servant**");
      expectWellFormedEmphasis(result);
    });

    it("should wrap only the trimmed core of a leading-space italic text item, reattaching the space outside _ (real KJV1769 JUD 1:1 shape)", () => {
      const verse: VerseSchema = {
        book: "JUD",
        chapter: 1,
        verse: 1,
        content: [{ text: "Jude," }, { text: " the servant", marks: ["i"] }],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> Jude, _the servant_");
      expectWellFormedEmphasis(result);
    });

    it("should reattach a single leading space outside both delimiters for a leading-space bold+italic text item, not doubled or dropped (real KJV1769 JUD 1:1 'of Jesus' shape)", () => {
      const verse: VerseSchema = {
        book: "JUD",
        chapter: 1,
        verse: 1,
        content: [
          { text: "the servant" },
          { text: " of Jesus", marks: ["b", "i"] },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> the servant _**of Jesus**_");
      expectWellFormedEmphasis(result);
    });

    it("should wrap only the trimmed core of a trailing-space bold text item, reattaching the space outside **", () => {
      const verse: VerseSchema = {
        book: "JUD",
        chapter: 1,
        verse: 1,
        content: [
          { text: "the servant ", marks: ["b"] },
          { text: "of Jesus" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> **the servant** of Jesus");
      expectWellFormedEmphasis(result);
    });

    it("should not wrap an all-whitespace text item's mark, rather than producing a meaningless ****", () => {
      const verse: VerseSchema = {
        book: "JUD",
        chapter: 1,
        verse: 1,
        content: [
          { text: "before" },
          { text: "   ", marks: ["b"] },
          { text: "after" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).not.toContain("*");
    });

    it("should not wrap an empty-text mark-bearing item, rather than producing a meaningless ****", () => {
      const verse: VerseSchema = {
        book: "JUD",
        chapter: 1,
        verse: 1,
        content: [{ text: "", marks: ["b"] }, { text: "word" }],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> word");
      expect(result).not.toContain("*");
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

    it("should handle a standard-typed heading in verse unchanged (regression)", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 2,
        verse: 1,
        content: [
          { heading: "The Seventh Day", type: "standard" },
          { text: "Thus the heavens and the earth were finished" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toContain("### The Seventh Day");
      expect(result).not.toContain("#### The Seventh Day");
    });

    it("should render an acrostic heading one level smaller when it leads a mid-chapter verse (convertVerseToMarkdown special case)", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 119,
        verse: 9,
        content: [
          { heading: "BETH", type: "acrostic" },
          { text: "How can a young man keep his way pure?" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toContain("\n#### BETH\n");
      expect(result).not.toMatch(/\n### BETH\n/);
    });

    it("should render an acrostic heading one level smaller when it is not the first content item (generic renderContent path)", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 119,
        verse: 9,
        content: [
          { text: "Some lead-in text " },
          { heading: "BETH", type: "acrostic" },
          { text: "How can a young man keep his way pure?" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toContain("\n#### BETH\n");
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
      expect(result).toMatch(/^009:001/);
      expect(result).toContain(
        "«To the chief Musician H5329 (8764) upon Muthlabben, H4192 H1121 A Psalm H4210 of David. H1732»"
      );
      expect(result).toContain("¶ I will praise H3034 (8686)");
    });
  });

  describe("edge cases - bug fixes", () => {
    describe("mid-verse paragraph breaks in markdown", () => {
      it("should insert paragraph break mid-verse (BYZ2018 MAT 1:6 style)", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 1,
          verse: 6,
          content: [
            { text: "Ἰεσσαὶ", strong: "G2421", morph: "N-PRI" },
            { text: " δὲ", strong: "G1161", morph: "CONJ" },
            { text: " ἐγέννησεν", strong: "G1080", morph: "V-AAI-3S" },
            { text: " τὸν", strong: "G3588", morph: "T-ASM" },
            { text: " Δαυὶδ", strong: "G1138", morph: "N-PRI" },
            { text: " τὸν", strong: "G3588", morph: "T-ASM" },
            { text: " βασιλέα.", strong: "G935", morph: "N-ASM" },
            {
              paragraph: true,
              text: "Δαυὶδ",
              strong: "G1138",
              morph: "N-PRI",
            },
            { text: " δὲ", strong: "G1161", morph: "CONJ" },
            { text: " ὁ", strong: "G3588", morph: "T-NSM" },
            { text: " βασιλεὺς", strong: "G935", morph: "N-NSM" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toContain("βασιλέα.\n\nΔαυὶδ");
      });

      it("should render mid-verse paragraph with text export marker", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 1,
          verse: 6,
          content: [
            { text: "First sentence.", strong: "G1234" },
            { paragraph: true, text: "Second sentence.", strong: "G5678" },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toContain("G1234 ¶ Second sentence.");
      });
    });

    describe("subtitle footnote prefix in markdown", () => {
      it("should prefix subtitle footnotes with 'Subtitle.' (CLV1880 PSA 11:1 style)", () => {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 11,
          verse: 1,
          content: [
            {
              subtitle: [
                {
                  foot: {
                    type: "var",
                    content: "Originally verse 10:1.",
                  },
                },
                "in finem psalmus David",
              ],
            },
            { text: "in Domino confido" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(footnotes[0]).toContain("Subtitle. Originally verse 10:1.");
      });

      it("should prefix heading footnotes with 'Heading.' in markdown", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 1,
          verse: 1,
          content: [
            {
              heading: [
                { text: "The Creation", foot: { content: "Main heading" } },
              ],
            },
            { text: "In the beginning" },
          ],
        };
        const footnotes: string[] = [];
        convertVerseToMarkdown(verse, footnotes);
        expect(footnotes[0]).toContain("Heading. Main heading");
      });
    });

    describe("footnote order with Strong's in text export", () => {
      it("should place footnote content BEFORE Strong's number (BYZ2018 MAT 1:8 style)", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 1,
          verse: 5,
          content: [
            { text: "Σαλμὼν", strong: "G4533", morph: "N-PRI" },
            { text: " δὲ", strong: "G1161", morph: "CONJ" },
            { text: " ἐγέννησεν", strong: "G1080", morph: "V-AAI-3S" },
            { text: " τὸν", strong: "G3588", morph: "T-ASM" },
            {
              text: " Βοὸζ",
              strong: "G1003",
              morph: "N-PRI",
              foot: {
                type: "var",
                content: "N Βοὸζ ἐκ ⇒ Βόες ἐκ",
              },
            },
            { text: " ἐκ", strong: "G1537", morph: "PREP" },
          ],
        };
        const result = convertVerseToText(verse);
        // Footnote content sits before Strong's/morph, so removing °{...}
        // leaves "Βοὸζ G1003 (N-PRI)"
        expect(result).toMatch(/Βοὸζ°\{N Βοὸζ ἐκ ⇒ Βόες ἐκ\} G1003 \(N-PRI\)/);
      });

      it("should maintain footnote order with multiple footnotes and Strong's", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 1,
          verse: 5,
          content: [
            {
              text: "Word1",
              strong: "G1111",
              foot: { content: "Note 1" },
            },
            {
              text: " Word2",
              strong: "G2222",
              foot: { content: "Note 2" },
            },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toMatch(/Word1°\{Note 1\} G1111/);
        expect(result).toMatch(/Word2°\{Note 2\} G2222/);
      });
    });

    describe("textless elements at verse start", () => {
      it("should not produce double space when verse starts with textless paragraph element (KJV1769 MAT 3:1 style)", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 3,
          verse: 1,
          content: [
            { paragraph: true, strong: "G1161" },
            { text: " In", strong: "G1722" },
            { text: " those", strong: "G1565" },
            { text: " days", strong: "G2250" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe("\n<sup>1</sup> In those days");
        expect(result).not.toContain("  "); // No double spaces
      });

      it("should add space after textless footnote at verse start in text export (CLV1880 GEN 50:23 style)", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 50,
          verse: 23,
          content: [
            { foot: { type: "var", content: "Originally verse 50:22." } },
            "et vidit Ephraim filios",
          ],
        };
        const result = convertVerseToText(verse);
        // No space between ° and {, but a space after }
        expect(result).toBe(
          "050:023 °{Originally verse 50:22.} et vidit Ephraim filios"
        );
        expect(result).toContain("} et vidit");
      });
    });

    describe("line break marker spacing", () => {
      it("should not add extra spaces around line break markers (WEBUS2020 GEN 3:14 style)", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 3,
          verse: 14,
          content: [
            {
              paragraph: true,
              text: "Yahweh God said to the serpent,",
              break: true,
            },
            { text: "\u201CBecause you have done this,", break: true },
            { text: "you are cursed above all livestock,", break: true },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "003:014 ¶ Yahweh God said to the serpent,␤\u201CBecause you have done this,␤you are cursed above all livestock,␤"
        );
        expect(result).not.toMatch(/, ␤/); // No space before break marker
        expect(result).not.toMatch(/␤ \u201C/); // No space after break marker before quote
      });

      it("should handle line breaks without extra spaces in markdown", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 3,
          verse: 14,
          content: [
            {
              paragraph: true,
              text: "Yahweh God said to the serpent,",
              break: true,
            },
            { text: "\u201CBecause you have done this,", break: true },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "\n<sup>14</sup> Yahweh God said to the serpent,<br>\u201CBecause you have done this,<br>"
        );
        expect(result).not.toMatch(/,<br> /); // No space after br when next text has no leading space
      });
    });

    describe("trailing footnotes", () => {
      it("should place a trailing textless footnote sibling's marker before the Strong's/morph tag, not after (BYZ2018 MRK 3:27 style — corrected: this shape used to encode the bug as expected behavior)", () => {
        const verse: VerseSchema = {
          book: "MRK",
          chapter: 3,
          verse: 27,
          content: [
            {
              text: "διαρπάσῃ.",
              foot: { type: "var", content: "B διαρπάσῃ ⇒ διαρπάσει" },
              strong: "G1283",
              morph: "V-AAS-3S",
            },
            { foot: { type: "var", content: "N διαρπάσῃ ⇒ διαρπάσει" } },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "003:027 διαρπάσῃ.°{B διαρπάσῃ ⇒ διαρπάσει}°{N διαρπάσῃ ⇒ διαρπάσει} G1283 (V-AAS-3S)"
        );
        expect(result).not.toMatch(/ $/); // No trailing space
      });

      it("should place every marker in a chain of trailing textless footnote siblings before the Strong's number, in order (a real corpus shape: 'beginning' carries two footnotes)", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 1,
          verse: 1,
          content: [
            {
              paragraph: true,
              text: "In the beginning",
              foot: { type: "trn", content: "The clause opens the narrative." },
              strong: "H7225",
            },
            {
              foot: {
                type: "stu",
                content: "The verse begins the account of creation.",
              },
            },
            { text: " God", strong: "H430" },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "001:001 ¶ In the beginning°{The clause opens the narrative.}°{The verse begins the account of creation.} H7225 God H430"
        );
      });

      it("should keep a trailing textless sibling's own line break after the Strong's/morph tag while its marker still moves before it (real KJV1769 Proverbs 10:10 shape)", () => {
        const verse: VerseSchema = {
          book: "PRV",
          chapter: 10,
          verse: 10,
          content: [
            {
              text: "shall fall.",
              foot: { type: "trn", content: "Or, shall be beaten." },
              strong: "H3832",
              morph: "NiphImpf",
            },
            {
              text: "",
              break: true,
              foot: { type: "trn", content: "Or, shall be beaten." },
            },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "010:010 shall fall.°{Or, shall be beaten.}°{Or, shall be beaten.} H3832 (NiphImpf)␤"
        );
      });
    });

    describe("footnote spacing consistency", () => {
      it("should have no space between footnote marker and content (CLV1880 NUM 20:28 style)", () => {
        // A footnoted text item with a trailing space, followed by a plain string item
        const verse: VerseSchema = {
          book: "NUM",
          chapter: 20,
          verse: 28,
          content: [
            {
              text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius ",
              foot: { type: "var", content: "Originally verse 20:29." },
            },
            "illo mortuo in montis supercilio descendit cum Eleazaro",
          ],
        };
        const result = convertVerseToText(verse);
        // text°{content}nexttext — no space between ° and {
        expect(result).toBe(
          "020:028 cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius °{Originally verse 20:29.}illo mortuo in montis supercilio descendit cum Eleazaro"
        );
        expect(result).not.toMatch(/° \{/);
        expect(result).toMatch(/°\{/);
      });

      it("should have no space between footnote marker and content for textless footnote at start (CLV1880 NUM 20:29 style)", () => {
        const verse: VerseSchema = {
          book: "NUM",
          chapter: 20,
          verse: 29,
          content: [
            { foot: { type: "var", content: "Originally verse 20:30." } },
            "omnis autem multitudo videns occubuisse Aaron",
          ],
        };
        const result = convertVerseToText(verse);
        // Expected shape: °{content} text
        expect(result).toBe(
          "020:029 °{Originally verse 20:30.} omnis autem multitudo videns occubuisse Aaron"
        );
        expect(result).not.toMatch(/° \{/);
        expect(result).toMatch(/°\{/);
      });

      it("should allow clean removal of footnotes via search/replace", () => {
        const verse: VerseSchema = {
          book: "NUM",
          chapter: 20,
          verse: 28,
          content: [
            {
              text: "eius ",
              foot: { type: "var", content: "note" },
            },
            "illo mortuo",
          ],
        };
        const result = convertVerseToText(verse);
        const withoutFootnote = result.replace(/°\{[^}]*\}/g, "");
        expect(withoutFootnote).toBe("020:028 eius illo mortuo");
      });

      it("should handle footnote with Strong's - footnote content before Strong's (BYZ style)", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 1,
          verse: 5,
          content: [
            {
              text: "Βοὸζ",
              foot: { type: "var", content: "N Βοὸζ ⇒ Βόες" },
              strong: "G1003",
              morph: "N-PRI",
            },
            { text: " ἐκ", strong: "G1537", morph: "PREP" },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toContain("Βοὸζ°{N Βοὸζ ⇒ Βόες} G1003 (N-PRI)");
        // Removing °{...} should give correct spacing
        const withoutFootnote = result.replace(/°\{[^}]*\}/g, "");
        expect(withoutFootnote).toContain("Βοὸζ G1003 (N-PRI)");
      });
    });

    describe("nested content (ContentNested)", () => {
      it("should render nested content with Strong's number", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 49,
          verse: 18,
          content: [
            { text: "I have waited for", strong: "H6960", morph: "8765" },
            { text: " thy salvation,", strong: "H3444" },
            {
              content: [" O ", { text: "Lord", marks: ["sc"] }, "."],
              strong: "H3068",
            },
          ],
        };
        const result = convertVerseToText(verse);
        // The nested content should render with Strong's after the full content
        expect(result).toBe(
          "049:018 I have waited for H6960 (8765) thy salvation, H3444 O LORD. H3068"
        );
      });

      it("should render nested content with morph code", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 1,
          verse: 1,
          content: [
            {
              content: ["the ", { text: "Lord", marks: ["sc"] }],
              strong: "H3068",
              morph: "8675",
            },
            { text: " God", strong: "H430" },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toBe("001:001 the LORD H3068 (8675) God H430");
      });

      it("should render nested content in markdown without Strong's", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 49,
          verse: 18,
          content: [
            { text: "I have waited for", strong: "H6960" },
            { text: " thy salvation,", strong: "H3444" },
            {
              content: [" O ", { text: "Lord", marks: ["sc"] }, "."],
              strong: "H3068",
            },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>18</sup> I have waited for thy salvation, O LORD."
        );
      });

      it("should wrap a nested content wrapper's entire rendered run in ** when it carries a bold mark", () => {
        // Modeled on the real WEBUS2020 John 8:58 nested-marks shape, but
        // with "b" instead of "woc".
        const verse: VerseSchema = {
          book: "JHN",
          chapter: 8,
          verse: 58,
          content: [
            { text: "before Abraham was, " },
            {
              content: ["the ", { text: "Lord" }],
              marks: ["b"],
              strong: "H3068",
            },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>58</sup> before Abraham was, **the Lord**"
        );
      });

      it("should reattach a nested content wrapper's leading space outside ** rather than wrapping it (real WEBUS2020 JHN 8:58 shape with a leading-space run)", () => {
        const verse: VerseSchema = {
          book: "JHN",
          chapter: 8,
          verse: 58,
          content: [
            { text: "before Abraham was," },
            {
              content: [" the ", { text: "Lord" }],
              marks: ["b"],
              strong: "H3068",
            },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>58</sup> before Abraham was, **the Lord**"
        );
        expectWellFormedEmphasis(result);
      });

      it("should handle nested content with footnote", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 2,
          verse: 4,
          content: [
            {
              content: ["the ", { text: "Lord", marks: ["sc"] }],
              strong: "H3068",
              foot: { content: "Hebrew: YHWH" },
            },
            { text: " God", strong: "H430" },
          ],
        };
        const result = convertVerseToText(verse);
        // Footnote should appear after the nested content, before Strong's
        expect(result).toContain("the LORD°{Hebrew: YHWH} H3068 God H430");
      });

      it("should handle nested content with paragraph flag", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 2,
          verse: 4,
          content: [
            { text: "previous text.", strong: "H1234" },
            {
              content: ["the ", { text: "Lord", marks: ["sc"] }],
              strong: "H3068",
              paragraph: true,
            },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toContain("H1234 ¶ the LORD H3068");
      });

      it("should handle nested content with line break", () => {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 1,
          verse: 1,
          content: [
            {
              content: ["the ", { text: "Lord", marks: ["sc"] }],
              strong: "H3068",
              break: true,
            },
            { text: " is my shepherd", strong: "H7462" },
          ],
        };
        const result = convertVerseToText(verse);
        expect(result).toContain("the LORD H3068␤ is my shepherd");
      });

      it("should handle deeply nested content", () => {
        const verse: VerseSchema = {
          book: "GEN",
          chapter: 1,
          verse: 1,
          content: [
            {
              content: [
                "O ",
                {
                  content: [{ text: "Lord", marks: ["sc"] }],
                  strong: "H3068",
                },
                " God",
              ],
              strong: "H430",
            },
          ],
        };
        const result = convertVerseToText(verse);
        // Inner nested content has H3068, outer has H430
        expect(result).toBe("001:001 O LORD H3068 God H430");
      });
    });
  });

  describe("markdown footnote labels past 26 in a chapter", () => {
    /**
     * Build one verse per footnote and render them all against a single
     * chapter-scoped footnote array, the way convertBibleVersionToMarkdown does.
     */
    function renderChapterWithFootnotes(count: number): {
      markers: string[];
      footnotes: string[];
    } {
      const footnotes: string[] = [];
      const markers: string[] = [];
      for (let i = 0; i < count; i++) {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 119,
          verse: i + 1,
          content: [{ text: `word${i}`, foot: { content: `note ${i}` } }],
        };
        const rendered = convertVerseToMarkdown(verse, footnotes);
        const marker = rendered.match(/word\d+(<sup>[a-z]+<\/sup>)/)?.[1];
        markers.push(marker ?? "");
      }
      return { markers, footnotes };
    }

    it("should give every footnote in a 135-note chapter a unique label", () => {
      const { markers } = renderChapterWithFootnotes(135);

      expect(markers).toHaveLength(135);
      expect(markers).not.toContain("");
      expect(new Set(markers).size).toBe(135);
    });

    it("should keep the footnote list labels in step with the inline markers", () => {
      const { markers, footnotes } = renderChapterWithFootnotes(135);

      expect(footnotes).toHaveLength(135);
      footnotes.forEach((footnote, i) => {
        expect(footnote).toBe(`- ${markers[i]} ${i + 1}. note ${i}`);
      });
    });

    it("should continue a, b, ... z with aa, ab, ... rather than restarting at a", () => {
      const { markers } = renderChapterWithFootnotes(135);

      expect(markers[0]).toBe("<sup>a</sup>");
      expect(markers[25]).toBe("<sup>z</sup>");
      expect(markers[26]).toBe("<sup>aa</sup>");
      expect(markers[27]).toBe("<sup>ab</sup>");
      expect(markers[51]).toBe("<sup>az</sup>");
      expect(markers[52]).toBe("<sup>ba</sup>");
      expect(markers[134]).toBe("<sup>ee</sup>");
    });
  });

  describe("adjacent same-marked nodes merge into one emphasis span", () => {
    describe("real Psalm 56:1 superscription shape (yonath/-elem/-rekhoqim, all italic, each its own Strong's number)", () => {
      const psalm56Superscription: VerseSchema["content"] = [
        { text: "For the music director", strong: "H5329" },
        { text: ", according to", strong: "H5921" },
        " the ",
        { text: "yonath", marks: ["i"], strong: "H3123" },
        { text: "-elem", marks: ["i"], strong: "H482" },
        { text: "-rekhoqim", marks: ["i"], strong: "H7350" },
        {
          text: " style;",
          foot: {
            type: "trn",
            content: "The literal meaning is “silent dove, distant ones.”",
          },
        },
      ];

      it("should merge all three same-italic Strong's-tagged nodes into one _..._ span in markdown, since nothing renders between them there", () => {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 56,
          verse: 1,
          content: psalm56Superscription,
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>1</sup> For the music director, according to the _yonath-elem-rekhoqim_ style;<sup>a</sup>"
        );
        expectWellFormedEmphasis(result);
      });

      it("should NOT merge the same three nodes in the plain-text export, since each one's own Strong's number renders between them there — every word keeps its own number immediately after it", () => {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 56,
          verse: 1,
          content: psalm56Superscription,
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "056:001 For the music director H5329, according to H5921 the yonath H3123-elem H482-rekhoqim H7350 style;°{The literal meaning is “silent dove, distant ones.”}"
        );
      });
    });

    describe("real Matthew 3:3 shape (a footnote interrupts an otherwise-mergeable run of same-marked nodes)", () => {
      const matthew33Excerpt: VerseSchema["content"] = [
        {
          text: "The voice",
          marks: ["b", "i"],
          foot: { type: "trn", content: "Or “A voice.”" },
          strong: "G5456",
        },
        { text: " of one shouting", marks: ["b", "i"], strong: "G994" },
        { text: " in", marks: ["b", "i"], strong: "G1722" },
      ];

      it("should close the emphasis span before the footnote marker and open a fresh one after, in markdown — the interrupted node never merges with what follows, but the following two (nothing rendering between them) still merge with each other", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 3,
          verse: 3,
          content: matthew33Excerpt,
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>3</sup> _**The voice**_<sup>a</sup> _**of one shouting in**_"
        );
        expect(footnotes).toEqual(['- <sup>a</sup> 3. Or “A voice.”']);
        expectWellFormedEmphasis(result);
      });

      it("should never merge any of the three nodes in the plain-text export, since every one's own Strong's number renders between them there too", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 3,
          verse: 3,
          content: matthew33Excerpt,
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "003:003 The voice°{Or “A voice.”} G5456 of one shouting G994 in G1722"
        );
      });
    });

    it("should not merge across a paragraph boundary — a new run starting mid-array keeps its paragraph marker outside the wrapper and never joins the run before it", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "before", marks: ["i"] },
          { text: "after", marks: ["i"], paragraph: true },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> _before_\n\n_after_");
      expectWellFormedEmphasis(result);
    });

    it("should not merge across an explicit line break — the break stays glued to the end of the first span, and the next word opens its own", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 1,
        content: [
          { text: "before", marks: ["i"], break: true },
          { text: "after", marks: ["i"] },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> _before_<br>_after_");
      expectWellFormedEmphasis(result);
    });

    it("should never let a run cross a bibleLink — heading/subtitle/bibleLink items always render in their own context, never as a run member", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 1,
        verse: 1,
        content: [
          { text: "before ", marks: ["i"] },
          { bibleLink: "Psalm 1", content: "Ps 1" },
          { text: " after", marks: ["i"] },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> _before_ Ps 1 _after_");
      expectWellFormedEmphasis(result);
    });

    it("should recurse into a ContentNested's own inner array, merging same-marked members there before the outer nested-content wrapper applies its own mark", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 1,
        verse: 1,
        content: [
          {
            content: [
              { text: "great", marks: ["i"], strong: "H1419" },
              { text: " joy", marks: ["i"], strong: "H8057" },
            ],
            marks: ["b"],
          },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe("<sup>1</sup> **_great joy_**");
      expectWellFormedEmphasis(result);
    });

    it("should still insert a space before a following letter-starting item when a merged run's own last member ends with an unseparated Strong's tag (GEN 1:2-style spacing convention, now checked against the run's last member rather than a lone item)", () => {
      const verse: VerseSchema = {
        book: "GEN",
        chapter: 1,
        verse: 2,
        content: [
          { text: "the ", marks: ["i"] },
          { text: "great", marks: ["i"], strong: "H1419" },
          "was",
        ],
      };
      const result = convertVerseToText(verse);
      expect(result).toBe("001:002 the great H1419 was");
    });

    it("should still insert a space after a Strong's-tagged node's own trailing textless-footnote-sibling splice, checking the splice's real tag owner rather than whatever array slot the splice consumed (a real corpus shape: 'they are fainting' carries its own strong + 2 footnotes, one riding as a consumed textless sibling, immediately followed by a plain Strong's-tagged word with no leading space of its own)", () => {
      const verse: VerseSchema = {
        book: "LAM",
        chapter: 2,
        verse: 19,
        content: [
          {
            text: "they are fainting",
            strong: "H5848",
            foot: { type: "trn", content: "Heb “who are fainting.”" },
          },
          {
            foot: {
              type: "stu",
              content: "The BHS editors suggest this bicolon is a late addition.",
            },
          },
          { text: "from hunger", strong: "H7458", break: true },
        ],
      };
      const result = convertVerseToText(verse);
      expect(result).toBe(
        "002:019 they are fainting°{Heb “who are fainting.”}°{The BHS editors suggest this bicolon is a late addition.} H5848 from hunger H7458␤"
      );
      expect(result).not.toMatch(/H5848from/);
    });
  });

  describe("a shared mark stays open across a neighbor that only drops the OTHER mark (independent nested 'b'/'i' delimiters, not whole-mark-set equality)", () => {
    describe("real Matthew 1:23 shape (Isaiah 7:14 quotation: bold+italic throughout except 'they', a supplied word carrying italic only)", () => {
      // Representative of a real corpus shape: a Scripture quotation
      // rendered bold+italic throughout except for one supplied/implied word
      // carrying italic only; the real footnote's own long body text is
      // abbreviated here for readability (its length isn't what this
      // fixture is testing).
      const matthew123Quotation: VerseSchema["content"] = [
        "“",
        { text: "Look", marks: ["b", "i"], strong: "G2400" },
        { text: "! The", marks: ["b", "i"], strong: "G3588" },
        { text: " virgin", marks: ["b", "i"], strong: "G3933" },
        { text: " will conceive", marks: ["b", "i"], strong: "G1064" },
        { text: " and", marks: ["b", "i"], strong: "G2532" },
        { text: " give birth", marks: ["b", "i"], strong: "G5088" },
        { text: " to a son", marks: ["b", "i"], strong: "G5207" },
        { text: ", and", marks: ["b", "i"], strong: "G2532" },
        { text: " they ", marks: ["i"] },
        { text: "will name", marks: ["b", "i"], strong: "G2564" },
        { text: " him", marks: ["b", "i"], strong: "G846" },
        { text: " Emmanuel", marks: ["b", "i"], strong: "G1694" },
        {
          text: ",”",
          foot: { type: "stu", content: "A quotation from Isaiah 7:14." },
        },
      ];

      it("should keep the italic span continuous across 'they' while bold independently drops out just for it and picks back up after, in markdown", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 1,
          verse: 23,
          content: matthew123Quotation,
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>23</sup> “_**Look! The virgin will conceive and give birth to a son, and** they **will name him Emmanuel**_,”<sup>a</sup>"
        );
        expectWellFormedEmphasis(result);
      });

      it("should still render every word's own Strong's number in the plain-text export, where nothing merges since a Strong's number renders between every pair", () => {
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 1,
          verse: 23,
          content: matthew123Quotation,
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "001:023 “Look G2400! The G3588 virgin G3933 will conceive G1064 and G2532 give birth G5088 to a son G5207, and G2532 they will name G2564 him G846 Emmanuel G1694,”°{A quotation from Isaiah 7:14.}"
        );
        expect(result).not.toContain("*");
        expect(result).not.toContain("_");
      });
    });

    describe("real Romans 4:9 shape (Genesis 15:6 quotation: bold toggles off only for 'faith' and 'Abraham', italic spans the whole thing)", () => {
      // Representative of a real corpus shape: a Scripture quotation with
      // italic spanning the whole thing while bold independently toggles
      // off for two individual words; the real footnote's own body text is
      // abbreviated here for readability.
      const romans49Quotation: VerseSchema["content"] = [
        ", “",
        { text: "faith", marks: ["i"], strong: "G4102" },
        { text: " was credited", marks: ["b", "i"], strong: "G3049" },
        { text: " to ", marks: ["b", "i"] },
        { text: "Abraham", marks: ["i"], strong: "G11" },
        { text: " as", marks: ["b", "i"], strong: "G1519" },
        { text: " righteousness", marks: ["b", "i"], strong: "G1343" },
        {
          text: ".”",
          foot: { type: "stu", content: "A quotation from Genesis 15:6." },
        },
      ];

      it("should keep the italic span continuous across 'faith' and 'Abraham' while bold independently toggles off only for those two words, in markdown", () => {
        const verse: VerseSchema = {
          book: "ROM",
          chapter: 4,
          verse: 9,
          content: romans49Quotation,
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>9</sup> , “_faith **was credited to** Abraham **as righteousness**_.”<sup>a</sup>"
        );
        expectWellFormedEmphasis(result);
      });

      it("should still render every word's own Strong's number in the plain-text export, where nothing merges since a Strong's number renders between every pair", () => {
        const verse: VerseSchema = {
          book: "ROM",
          chapter: 4,
          verse: 9,
          content: romans49Quotation,
        };
        const result = convertVerseToText(verse);
        expect(result).toBe(
          "004:009 , “faith G4102 was credited G3049 to Abraham G11 as G1519 righteousness G1343.”°{A quotation from Genesis 15:6.}"
        );
        expect(result).not.toContain("*");
        expect(result).not.toContain("_");
      });
    });
  });
});
