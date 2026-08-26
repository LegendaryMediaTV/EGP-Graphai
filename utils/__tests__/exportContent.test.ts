import { describe, it, expect } from "vitest";
import { convertVerseToText, convertVerseToMarkdown } from "../exportContent";
import VerseSchema from "../../types/VerseSchema";

/**
 * Asserts every `**...**`/`_..._` run in `markdown` opens/closes against
 * non-whitespace — CommonMark's flanking rule (e.g. "** foo**" fails it,
 * rendering literal asterisks, not `<strong>`). A plain `toContain("**")`
 * check would pass even when this fails. Also asserts every underscore or
 * asterisk not part of a well-formed run is backslash-escaped.
 */
function expectWellFormedEmphasis(markdown: string): void {
  for (const match of markdown.matchAll(/\*\*(.*?)\*\*/g)) {
    expect(match[1]).not.toMatch(/^\s|\s$|^$/);
  }
  for (const match of markdown.matchAll(/_(.*?)_/g)) {
    expect(match[1]).not.toMatch(/^\s|\s$|^$/);
  }

  // An unescaped underscore or asterisk here would be read as this format's
  // own emphasis delimiter rather than the literal character it is. Italic
  // always emits underscores in matched pairs, so an odd unescaped-underscore
  // count means one escaped incorrectly; bold always uses "**", never a lone
  // "*", so any asterisk left after removing real "**...**" spans is
  // unescaped source text.
  const unescapedUnderscores = (markdown.match(/(?<!\\)_/g) || []).length;
  expect(unescapedUnderscores % 2).toBe(0);
  const withoutBoldSpans = markdown.replace(/\*\*.*?\*\*/g, "");
  expect(withoutBoldSpans).not.toMatch(/(?<!\\)\*/);
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

    describe("Cause A — a whitespace-only bare string no longer hard-closes an open emphasis run (KJV1769 Exodus 33:9's real content[9])", () => {
      const exodus339Excerpt: VerseSchema["content"] = [
        " and ",
        { text: "the", marks: ["i"] },
        " ",
        { text: "Lord", marks: ["i", "sc"] },
        " talked",
      ];

      it("should merge 'the' and 'LORD' into one continuous italic span across the lone blank between them, in markdown, even though the two nodes disagree in marks (['i'] vs ['i','sc']) — auditNodes.ts checks 4 and 9 both correctly leave this source shape alone, so the fix belongs here in the renderer", () => {
        const verse: VerseSchema = { book: "EXO", chapter: 33, verse: 9, content: exodus339Excerpt };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe("<sup>9</sup> and _the LORD_ talked");
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("should leave convertVerseToText's output byte-identical to today's, since TEXT_OPTIONS's italicWrapper is the identity function and this fix only changes markdown's visible delimiters", () => {
        const verse: VerseSchema = { book: "EXO", chapter: 33, verse: 9, content: exodus339Excerpt };
        expect(convertVerseToText(verse)).toBe("033:009 and the LORD talked");
      });

      it("should still close the delimiter before the blank rather than after it when the node AFTER the blank carries no marks at all — the blank must land outside the closing '_' ('_the_ Lord'), never inside it ('_the _Lord'), which is what proves the blank is routed through pendingWhitespace rather than emitted immediately", () => {
        const verse: VerseSchema = {
          book: "EXO",
          chapter: 33,
          verse: 9,
          content: [" and ", { text: "the", marks: ["i"] }, " ", { text: "Lord" }, " talked"],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe("<sup>9</sup> and _the_ Lord talked");
        expectWellFormedEmphasis(result);
      });
    });

    describe("Cause A' — a blank object node carrying marks stays transparent to the surrounding run when its neighbors agree in marks (KJV1769 JER 2:16's real footnote shape)", () => {
      it("should merge both bibleLink overrides into one continuous italic span across the marked blank between them, in markdown", () => {
        const verse: VerseSchema = {
          book: "JER",
          chapter: 2,
          verse: 16,
          content: [
            { bibleLink: "Deuteronomy 33:12", content: { text: "deut. 33.12", marks: ["i"] } },
            { text: " ", marks: ["i"] },
            { bibleLink: "Isaiah 8:8", content: { text: "Isai. 8.8", marks: ["i"] } },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe("<sup>16</sup> _deut. 33.12 Isai. 8.8_");
        expect(result).not.toContain("__");
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });
    });

    describe("Cause B — a bibleLink node whose display override is a single mark-bearing object participates in the surrounding emphasis run (KJV1769 2 Samuel 7:7's real footnote)", () => {
      const samuel77Footnote: VerseSchema["content"] = [
        { text: "In the ", marks: ["i"] },
        { bibleLink: "1 Chronicles 17:6", content: { text: "1. Chro. 17.6", marks: ["i"] } },
        { text: ". any of the judges", marks: ["i"] },
      ];

      it("should render one continuous italic span with no redundant '_ _' and no broken '__', in markdown", () => {
        const verse: VerseSchema = { book: "2SM", chapter: 7, verse: 7, content: samuel77Footnote };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe("<sup>7</sup> _In the 1. Chro. 17.6. any of the judges_");
        expect(result).not.toContain("__");
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("should leave convertVerseToText's output byte-identical to today's", () => {
        const verse: VerseSchema = { book: "2SM", chapter: 7, verse: 7, content: samuel77Footnote };
        expect(convertVerseToText(verse)).toBe(
          "007:007 In the 1. Chro. 17.6. any of the judges"
        );
      });

      it("should keep today's exact opaque rendering for the other three bibleLink override shapes — a plain string override, no override at all, and a single-element array override (YLT1898's own no-marks shape) — none of which qualify for this fix (3,752 of the corpus's 3,836 bibleLink nodes)", () => {
        const footnotes: string[] = [];
        const stringOverride: VerseSchema = {
          book: "PSA",
          chapter: 1,
          verse: 1,
          content: [
            { text: "before ", marks: ["i"] },
            { bibleLink: "Psalm 1", content: "Ps 1" },
            { text: " after", marks: ["i"] },
          ],
        };
        const noOverride: VerseSchema = {
          book: "PSA",
          chapter: 1,
          verse: 1,
          content: [
            { text: "before ", marks: ["i"] },
            { bibleLink: "Psalm 1" },
            { text: " after", marks: ["i"] },
          ],
        };
        const arrayOverride: VerseSchema = {
          book: "PSA",
          chapter: 1,
          verse: 1,
          content: [
            { text: "before ", marks: ["i"] },
            { bibleLink: "Psalm 1", content: ["Ps. 1"] },
            { text: " after", marks: ["i"] },
          ],
        };
        expect(convertVerseToMarkdown(stringOverride, footnotes)).toBe(
          "<sup>1</sup> _before_ Ps 1 _after_"
        );
        expect(convertVerseToMarkdown(noOverride, footnotes)).toBe(
          "<sup>1</sup> _before_ Psalm 1 _after_"
        );
        expect(convertVerseToMarkdown(arrayOverride, footnotes)).toBe(
          "<sup>1</sup> _before_ Ps. 1 _after_"
        );
      });
    });

    describe("Cause C — the markdown subtitle wrapper no longer double-wraps an inner italic mark (ASV1901 Psalm 25:1's real subtitle, minus its leading heading — see the Cause D describe block below for the [heading, subtitle] chapter-opening combination, which the real verse carries and which the Cause D fix's own chapter-level hoist covers)", () => {
      it("should render one italic wrapper around the whole subtitle instead of a broken '__' where the inner and outer delimiters collide — hoisted above the verse line, since a lone leading subtitle also qualifies for Cause D's verse-level fallback", () => {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 25,
          verse: 1,
          content: [
            { subtitle: [{ text: "A Psalm", marks: ["i"] }, " of David."] },
            { paragraph: true, text: "Unto thee, O Jehovah, do I lift up my soul.", break: true },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "\n> _A Psalm of David._\n\n<sup>1</sup> Unto thee, O Jehovah, do I lift up my soul.<br>"
        );
        expect(result).not.toContain("__");
        expectWellFormedEmphasis(result);
      });

      it("should still render an inner bold mark inside the subtitle's own italic wrapper — only italic is suppressed on the inner render, never bold", () => {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 25,
          verse: 1,
          content: [
            { subtitle: [{ text: "A Psalm", marks: ["b"] }, " of David."] },
            { paragraph: true, text: "Unto thee.", break: true },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe("\n> _**A Psalm** of David._\n\n<sup>1</sup> Unto thee.<br>");
        expectWellFormedEmphasis(result);
      });

      it("should render a subtitle with no inner marks completely unaffected by the italic suppression, since there was never anything to suppress", () => {
        const verse: VerseSchema = {
          book: "PSA",
          chapter: 3,
          verse: 1,
          content: [
            { subtitle: "A Psalm of David, when he fled from Absalom his son." },
            { paragraph: true, text: "Lord, how are they increased that trouble me!", break: true },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "\n> _A Psalm of David, when he fled from Absalom his son._\n\n<sup>1</sup> Lord, how are they increased that trouble me!<br>"
        );
      });
    });

    describe("Cause E — a ContentNested node's edges join the surrounding emphasis run (KJV1769's six real remaining '_ _' defects, builds on Cause A landing first)", () => {
      it("MRK 14:19 (real content) — the second 'Is it I?' occurrence merges with the flat italic 'said,' immediately before it, in markdown", () => {
        const verse: VerseSchema = {
          book: "MRK",
          chapter: 14,
          verse: 19,
          content: [
            { text: "And", strong: "G1161" },
            { text: " they began", strong: "G756", morph: "AorMidDepInd" },
            { text: " to be sorrowful,", strong: "G3076", morph: "PresPasInf" },
            { text: " and to", strong: "G2532" },
            { text: " say", strong: "G3004", morph: "PresActInf" },
            { text: " unto him", strong: "G846" },
            { text: " one by one,", strong: "G1527" },
            { strong: "G3385" },
            { content: [" ", { text: "Is", marks: ["i"] }, " it I?"], strong: "G1473" },
            { text: " and", strong: "G2532" },
            { text: " another", strong: "G243" },
            " ",
            { text: "said,", marks: ["i"], strong: "G3385" },
            " ",
            { content: [{ text: "Is", marks: ["i"] }, " it I?"], strong: "G1473" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>19</sup> And they began to be sorrowful, and to say unto him one by one, _Is_ it I? and another _said, Is_ it I?"
        );
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("MRK 14:19 (real content) — leaves convertVerseToText byte-identical to today's, since TEXT_OPTIONS's italicWrapper is the identity function", () => {
        const verse: VerseSchema = {
          book: "MRK",
          chapter: 14,
          verse: 19,
          content: [
            { text: "And", strong: "G1161" },
            { text: " they began", strong: "G756", morph: "AorMidDepInd" },
            { text: " to be sorrowful,", strong: "G3076", morph: "PresPasInf" },
            { text: " and to", strong: "G2532" },
            { text: " say", strong: "G3004", morph: "PresActInf" },
            { text: " unto him", strong: "G846" },
            { text: " one by one,", strong: "G1527" },
            { strong: "G3385" },
            { content: [" ", { text: "Is", marks: ["i"] }, " it I?"], strong: "G1473" },
            { text: " and", strong: "G2532" },
            { text: " another", strong: "G243" },
            " ",
            { text: "said,", marks: ["i"], strong: "G3385" },
            " ",
            { content: [{ text: "Is", marks: ["i"] }, " it I?"], strong: "G1473" },
          ],
        };
        expect(convertVerseToText(verse)).toBe(
          "014:019 And G1161 they began G756 (AorMidDepInd) to be sorrowful, G3076 (PresPasInf) and to G2532 say G3004 (PresActInf) unto him G846 one by one, G1527 G3385 Is it I? G1473 and G2532 another G243 said, G3385 Is it I? G1473"
        );
      });

      it("JHN 8:6 (real content) — a nested node whose sole inner element is marked merges with the flat italic node immediately before it, in markdown", () => {
        const verse: VerseSchema = {
          book: "JHN",
          chapter: 8,
          verse: 6,
          content: [
            { strong: "G1161" },
            { text: "This", strong: "G5124" },
            { text: " they said,", strong: "G3004", morph: "ImpfActInd" },
            { text: " tempting", strong: "G3985", morph: "PresActPtc" },
            { text: " him,", strong: "G846" },
            { text: " that", strong: "G2443" },
            { text: " they might have", strong: "G2192", morph: "PresActSubj" },
            { text: " to accuse", strong: "G2723", morph: "PresActInf" },
            { text: " him.", strong: "G846" },
            { text: " But", strong: "G1161" },
            { text: " Jesus", strong: "G2424" },
            { text: " stooped", strong: "G2955", morph: "AorActPtc" },
            { text: " down,", strong: "G2736" },
            { content: [" and with ", { text: "his", marks: ["i"] }, " finger"], strong: "G1147" },
            { text: " wrote", strong: "G1125", morph: "ImpfActInd" },
            { text: " on", strong: "G1519" },
            { text: " the ground,", strong: "G1093" },
            " ",
            { text: "as though he heard", marks: ["i"], strong: "G4364", morph: "PresMidPasDepPtc" },
            " ",
            { content: [{ text: "them not", marks: ["i"] }, "."], strong: "G3361" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>6</sup> This they said, tempting him, that they might have to accuse him. But Jesus stooped down, and with _his_ finger wrote on the ground, _as though he heard them not_."
        );
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("JHN 8:6 (real content) — leaves convertVerseToText byte-identical to today's", () => {
        const verse: VerseSchema = {
          book: "JHN",
          chapter: 8,
          verse: 6,
          content: [
            { strong: "G1161" },
            { text: "This", strong: "G5124" },
            { text: " they said,", strong: "G3004", morph: "ImpfActInd" },
            { text: " tempting", strong: "G3985", morph: "PresActPtc" },
            { text: " him,", strong: "G846" },
            { text: " that", strong: "G2443" },
            { text: " they might have", strong: "G2192", morph: "PresActSubj" },
            { text: " to accuse", strong: "G2723", morph: "PresActInf" },
            { text: " him.", strong: "G846" },
            { text: " But", strong: "G1161" },
            { text: " Jesus", strong: "G2424" },
            { text: " stooped", strong: "G2955", morph: "AorActPtc" },
            { text: " down,", strong: "G2736" },
            { content: [" and with ", { text: "his", marks: ["i"] }, " finger"], strong: "G1147" },
            { text: " wrote", strong: "G1125", morph: "ImpfActInd" },
            { text: " on", strong: "G1519" },
            { text: " the ground,", strong: "G1093" },
            " ",
            { text: "as though he heard", marks: ["i"], strong: "G4364", morph: "PresMidPasDepPtc" },
            " ",
            { content: [{ text: "them not", marks: ["i"] }, "."], strong: "G3361" },
          ],
        };
        expect(convertVerseToText(verse)).toBe(
          "008:006 G1161 This G5124 they said, G3004 (ImpfActInd) tempting G3985 (PresActPtc) him, G846 that G2443 they might have G2192 (PresActSubj) to accuse G2723 (PresActInf) him. G846 But G1161 Jesus G2424 stooped G2955 (AorActPtc) down, G2736 and with his finger G1147 wrote G1125 (ImpfActInd) on G1519 the ground, G1093 as though he heard G4364 (PresMidPasDepPtc) them not. G3361"
        );
      });

      it("COL 1:4 (real content) — a nested node ('ye have to', shared Strong's G1519) merges with the flat italic 'which' immediately before it, in markdown", () => {
        const verse: VerseSchema = {
          book: "COL",
          chapter: 1,
          verse: 4,
          content: [
            { text: "since we heard", strong: "G191", morph: "AorActPtc" },
            { text: " of your", strong: "G5216" },
            { text: " faith", strong: "G4102" },
            { text: " in", strong: "G1722" },
            { text: " Christ", strong: "G5547" },
            { text: " Jesus,", strong: "G2424" },
            { text: " and", strong: "G2532" },
            { text: " of the love", strong: "G26" },
            " ",
            { text: "which", marks: ["i"], strong: "G3588" },
            " ",
            { content: [{ text: "ye have", marks: ["i"] }, " to"], strong: "G1519" },
            { text: " all", strong: "G3956" },
            { text: " the saints,", strong: "G40" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>4</sup> since we heard of your faith in Christ Jesus, and of the love _which ye have_ to all the saints,"
        );
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("COL 1:4 (real content) — leaves convertVerseToText byte-identical to today's", () => {
        const verse: VerseSchema = {
          book: "COL",
          chapter: 1,
          verse: 4,
          content: [
            { text: "since we heard", strong: "G191", morph: "AorActPtc" },
            { text: " of your", strong: "G5216" },
            { text: " faith", strong: "G4102" },
            { text: " in", strong: "G1722" },
            { text: " Christ", strong: "G5547" },
            { text: " Jesus,", strong: "G2424" },
            { text: " and", strong: "G2532" },
            { text: " of the love", strong: "G26" },
            " ",
            { text: "which", marks: ["i"], strong: "G3588" },
            " ",
            { content: [{ text: "ye have", marks: ["i"] }, " to"], strong: "G1519" },
            { text: " all", strong: "G3956" },
            { text: " the saints,", strong: "G40" },
          ],
        };
        expect(convertVerseToText(verse)).toBe(
          "001:004 since we heard G191 (AorActPtc) of your G5216 faith G4102 in G1722 Christ G5547 Jesus, G2424 and G2532 of the love G26 which G3588 ye have to G1519 all G3956 the saints, G40"
        );
      });

      it("1TM 1:1 (real content) — the identical COL 1:4 shape ('is our', shared Strong's G2257) merges with the flat italic 'which' before it, in markdown", () => {
        const verse: VerseSchema = {
          book: "1TM",
          chapter: 1,
          verse: 1,
          content: [
            { paragraph: true, text: "Paul,", strong: "G3972" },
            { text: " an apostle", strong: "G652" },
            { text: " of Jesus", strong: "G2424" },
            { text: " Christ", strong: "G5547" },
            { text: " by", strong: "G2596" },
            { text: " the commandment", strong: "G2003" },
            { text: " of God", strong: "G2316" },
            { text: " our", strong: "G2257" },
            { text: " Saviour,", strong: "G4990" },
            { text: " and", strong: "G2532" },
            { text: " Lord", strong: "G2962" },
            { text: " Jesus", strong: "G2424" },
            { text: " Christ,", strong: "G5547" },
            " ",
            { text: "which", marks: ["i"], strong: "G3588" },
            " ",
            { content: [{ text: "is", marks: ["i"] }, " our"], strong: "G2257" },
            { text: " hope;", strong: "G1680" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "\n<sup>1</sup> Paul, an apostle of Jesus Christ by the commandment of God our Saviour, and Lord Jesus Christ, _which is_ our hope;"
        );
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("1TM 1:1 (real content) — leaves convertVerseToText byte-identical to today's", () => {
        const verse: VerseSchema = {
          book: "1TM",
          chapter: 1,
          verse: 1,
          content: [
            { paragraph: true, text: "Paul,", strong: "G3972" },
            { text: " an apostle", strong: "G652" },
            { text: " of Jesus", strong: "G2424" },
            { text: " Christ", strong: "G5547" },
            { text: " by", strong: "G2596" },
            { text: " the commandment", strong: "G2003" },
            { text: " of God", strong: "G2316" },
            { text: " our", strong: "G2257" },
            { text: " Saviour,", strong: "G4990" },
            { text: " and", strong: "G2532" },
            { text: " Lord", strong: "G2962" },
            { text: " Jesus", strong: "G2424" },
            { text: " Christ,", strong: "G5547" },
            " ",
            { text: "which", marks: ["i"], strong: "G3588" },
            " ",
            { content: [{ text: "is", marks: ["i"] }, " our"], strong: "G2257" },
            { text: " hope;", strong: "G1680" },
          ],
        };
        expect(convertVerseToText(verse)).toBe(
          "001:001 ¶ Paul, G3972 an apostle G652 of Jesus G2424 Christ G5547 by G2596 the commandment G2003 of God G2316 our G2257 Saviour, G4990 and G2532 Lord G2962 Jesus G2424 Christ, G5547 which G3588 is our G2257 hope; G1680"
        );
      });

      it("1TM 6:15 (real content) — the same shape again ('is the blessed', shared Strong's G3107) merges with the flat italic 'who' before it, in markdown", () => {
        const verse: VerseSchema = {
          book: "1TM",
          chapter: 6,
          verse: 15,
          content: [
            { text: "which", strong: "G3739" },
            { text: " in his", strong: "G2398" },
            { text: " times", strong: "G2540" },
            { text: " he shall shew,", strong: "G1166", morph: "FutActInd" },
            " ",
            { text: "who", marks: ["i"], strong: "G3588" },
            " ",
            { content: [{ text: "is", marks: ["i"] }, " the blessed"], strong: "G3107" },
            { text: " and", strong: "G2532" },
            { text: " only", strong: "G3441" },
            { text: " Potentate,", strong: "G1413" },
            { text: " the King", strong: "G935" },
            { text: " of kings,", strong: "G936", morph: "PresActPtc" },
            { text: " and", strong: "G2532" },
            { text: " Lord", strong: "G2962" },
            { text: " of lords;", strong: "G2961", morph: "PresActPtc" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>15</sup> which in his times he shall shew, _who is_ the blessed and only Potentate, the King of kings, and Lord of lords;"
        );
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("1TM 6:15 (real content) — leaves convertVerseToText byte-identical to today's", () => {
        const verse: VerseSchema = {
          book: "1TM",
          chapter: 6,
          verse: 15,
          content: [
            { text: "which", strong: "G3739" },
            { text: " in his", strong: "G2398" },
            { text: " times", strong: "G2540" },
            { text: " he shall shew,", strong: "G1166", morph: "FutActInd" },
            " ",
            { text: "who", marks: ["i"], strong: "G3588" },
            " ",
            { content: [{ text: "is", marks: ["i"] }, " the blessed"], strong: "G3107" },
            { text: " and", strong: "G2532" },
            { text: " only", strong: "G3441" },
            { text: " Potentate,", strong: "G1413" },
            { text: " the King", strong: "G935" },
            { text: " of kings,", strong: "G936", morph: "PresActPtc" },
            { text: " and", strong: "G2532" },
            { text: " Lord", strong: "G2962" },
            { text: " of lords;", strong: "G2961", morph: "PresActPtc" },
          ],
        };
        expect(convertVerseToText(verse)).toBe(
          "006:015 which G3739 in his G2398 times G2540 he shall shew, G1166 (FutActInd) who G3588 is the blessed G3107 and G2532 only G3441 Potentate, G1413 the King G935 of kings, G936 (PresActPtc) and G2532 Lord G2962 of lords; G2961 (PresActPtc)"
        );
      });

      it("1JN 2:23 (real content) — a nested node ('also', shared Strong's G2532) extends a four-node flat italic run that already merges on its own, in markdown", () => {
        const verse: VerseSchema = {
          book: "1JN",
          chapter: 2,
          verse: 23,
          content: [
            { text: "Whosoever", strong: "G3956" },
            { text: " denieth", strong: "G720", morph: "PresMidPasDepPtc" },
            { text: " the Son,", strong: "G5207" },
            { text: " the same hath", strong: "G2192", morph: "PresActInd" },
            { text: " not", strong: "G3761" },
            { text: " the Father:", strong: "G3962" },
            " ",
            { text: "(but) he that acknowledgeth", marks: ["i"], strong: "G3670", morph: "PresActPtc" },
            { text: " the Son", marks: ["i"], strong: "G5207" },
            { text: " hath", marks: ["i"], strong: "G2192", morph: "PresActInd" },
            { text: " the Father", marks: ["i"], strong: "G3962" },
            " ",
            { content: [{ text: "also", marks: ["i"] }, "."], strong: "G2532" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        expect(result).toBe(
          "<sup>23</sup> Whosoever denieth the Son, the same hath not the Father: _(but) he that acknowledgeth the Son hath the Father also_."
        );
        expect(result).not.toContain("_ _");
        expectWellFormedEmphasis(result);
      });

      it("1JN 2:23 (real content) — leaves convertVerseToText byte-identical to today's", () => {
        const verse: VerseSchema = {
          book: "1JN",
          chapter: 2,
          verse: 23,
          content: [
            { text: "Whosoever", strong: "G3956" },
            { text: " denieth", strong: "G720", morph: "PresMidPasDepPtc" },
            { text: " the Son,", strong: "G5207" },
            { text: " the same hath", strong: "G2192", morph: "PresActInd" },
            { text: " not", strong: "G3761" },
            { text: " the Father:", strong: "G3962" },
            " ",
            { text: "(but) he that acknowledgeth", marks: ["i"], strong: "G3670", morph: "PresActPtc" },
            { text: " the Son", marks: ["i"], strong: "G5207" },
            { text: " hath", marks: ["i"], strong: "G2192", morph: "PresActInd" },
            { text: " the Father", marks: ["i"], strong: "G3962" },
            " ",
            { content: [{ text: "also", marks: ["i"] }, "."], strong: "G2532" },
          ],
        };
        expect(convertVerseToText(verse)).toBe(
          "002:023 Whosoever G3956 denieth G720 (PresMidPasDepPtc) the Son, G5207 the same hath G2192 (PresActInd) not G3761 the Father: G3962 (but) he that acknowledgeth G3670 (PresActPtc) the Son G5207 hath G2192 (PresActInd) the Father G3962 also. G2532"
        );
      });

      describe("regression guards — ~28,000 nested-content nodes render correctly today and must keep doing so untouched", () => {
        it("should NOT merge when the nested node's leading inner element does not share emphasis with the nearest real flat sibling before it (real KJV1769 Genesis 1:2 shape: an unmarked flat node immediately precedes an italic-leading nested node) — asserted against today's real captured output", () => {
          const verse: VerseSchema = {
            book: "GEN",
            chapter: 1,
            verse: 2,
            content: [
              { text: "And the earth", strong: "H776" },
              { text: " was", strong: "H1961", morph: "QalPerf" },
              { text: " without form,", strong: "H8414" },
              { text: " and void;", strong: "H922" },
              { text: " and darkness", strong: "H2822" },
              { content: [" ", { text: "was", marks: ["i"] }, " upon the face"], strong: "H6440" },
              { text: " of the deep.", strong: "H8415" },
              { text: " And the Spirit", strong: "H7307" },
              { text: " of God", strong: "H430" },
              { text: " moved", strong: "H7363", morph: "PielPtc" },
              { text: " upon", strong: "H5921" },
              { text: " the face", strong: "H6440" },
              { text: " of the waters.", strong: "H4325" },
            ],
          };
          const footnotes: string[] = [];
          const result = convertVerseToMarkdown(verse, footnotes);
          expect(result).toBe(
            "<sup>2</sup> And the earth was without form, and void; and darkness _was_ upon the face of the deep. And the Spirit of God moved upon the face of the waters."
          );
          expectWellFormedEmphasis(result);
        });

        it("should render a woc boundary byte-identically either way — a real KJV1769 Matthew 3:15 shape where the nested node's own inner content mixes 'i' and 'woc' (only the trailing 'woc'-only inner element shares its neighbor's full mark set; the leading 'i'+'woc' element does not, and must not open early) — this is the guard against generalizing the fix from emphasis state to mark-set equality, since 'woc' is not tracked by emphasisStateOf", () => {
          const verse: VerseSchema = {
            book: "MAT",
            chapter: 3,
            verse: 15,
            content: [
              { text: "And", strong: "G1161" },
              { text: " Jesus", strong: "G2424" },
              { text: " answering", strong: "G611", morph: "AorPasDepPtc" },
              { text: " said", strong: "G2036", morph: "Aor2ActInd" },
              { text: " unto", strong: "G4314" },
              { text: " him,", strong: "G846" },
              " ",
              { text: "Suffer", marks: ["woc"], strong: "G863", morph: "Aor2ActImpr" },
              " ",
              {
                content: [
                  { text: "it to be so", marks: ["i", "woc"] },
                  " ",
                  { text: "now:", marks: ["woc"] },
                ],
                strong: "G737",
              },
              " ",
              { text: "for", marks: ["woc"], strong: "G1063" },
              { text: " thus", marks: ["woc"], strong: "G3779" },
              { text: " it becometh", marks: ["woc"], strong: "G4241", morph: "PresActPtc" },
              { strong: "G2076", morph: "PresInd" },
              { text: " us", marks: ["woc"], strong: "G2254" },
              { text: " to fulfil", marks: ["woc"], strong: "G4137", morph: "AorActInf" },
              { text: " all", marks: ["woc"], strong: "G3956" },
              { text: " righteousness.", marks: ["woc"], strong: "G1343" },
              { text: " Then", strong: "G5119" },
              { text: " he suffered", strong: "G863", morph: "PresActInd" },
              { text: " him.", strong: "G846" },
            ],
          };
          const footnotes: string[] = [];
          const result = convertVerseToMarkdown(verse, footnotes);
          expect(result).toBe(
            "<sup>15</sup> And Jesus answering said unto him, Suffer _it to be so_ now: for thus it becometh us to fulfil all righteousness. Then he suffered him."
          );
          expectWellFormedEmphasis(result);
        });

        it("should still merge a nested node's own interior — two same-italic inner elements with no own top-level marks on the wrapper — into one inner run, exactly as it already does through the recursive call (constructed fixture; representative of a real corpus shape none of the six defects happen to exercise on its own)", () => {
          const verse: VerseSchema = {
            book: "GEN",
            chapter: 1,
            verse: 1,
            content: [
              {
                content: [
                  { text: "great", marks: ["i"], strong: "H1419" },
                  { text: " and", marks: ["i"], strong: "H1571" },
                  { text: " terrible", marks: ["i"], strong: "H3372" },
                ],
                strong: "H8064",
              },
            ],
          };
          const footnotes: string[] = [];
          const result = convertVerseToMarkdown(verse, footnotes);
          expect(result).toBe("<sup>1</sup> _great and terrible_");
          expectWellFormedEmphasis(result);
        });

        it("should still let a footnote on the ContentNested node itself interrupt the run — the node's own suffix closes the merged inner core before it renders, and the sibling after it starts fresh (constructed fixture, isolating the interruption itself; every one of the six real defects above also carries a Strong's number on its own nested node, exercised by their own convertVerseToText assertions)", () => {
          const verse: VerseSchema = {
            book: "GEN",
            chapter: 1,
            verse: 1,
            content: [
              {
                content: [{ text: "middle", marks: ["i"] }],
                foot: { type: "trn", content: "note" },
              },
              { text: "after", marks: ["i"] },
            ],
          };
          const footnotes: string[] = [];
          const result = convertVerseToMarkdown(verse, footnotes);
          expect(result).toBe("<sup>1</sup> _middle_<sup>a</sup>_after_");
          expectWellFormedEmphasis(result);
        });
      });
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

  describe("Cause D — a leading subtitle no longer strands a stray mid-line '> ' blockquote marker inside a verse line", () => {
    it("should hoist a lone leading subtitle above the <sup>N</sup> line, mirroring the existing leading-heading treatment, for a non-chapter-opening verse (real CLV1880 Psalm 147:12 shape — the subtitle opens verse 12, not verse 1, so no chapter-level hoist can ever reach it)", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 147,
        verse: 12,
        content: [
          { subtitle: "alleluia" },
          { paragraph: true, text: "lauda Hierusalem Dominum lauda Deum tuum Sion" },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe(
        "\n> _alleluia_\n\n<sup>12</sup> lauda Hierusalem Dominum lauda Deum tuum Sion"
      );
      expect(result).not.toMatch(/^<sup>\d+<\/sup> > /);
    });

    it("regression: a lone leading heading at the verse level still hoists exactly as today, unaffected by the new subtitle mirror", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 3,
        verse: 1,
        content: [
          { heading: "A Psalm of David." },
          { paragraph: true, text: "Lord, how are they increased that trouble me!", break: true },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe(
        "\n### A Psalm of David.\n\n<sup>1</sup> Lord, how are they increased that trouble me!<br>"
      );
      expect(result).not.toMatch(/^<sup>\d+<\/sup> > /);
    });

    it("regression: the acrostic marker in a [heading, heading] chapter opening (real ASV1901 Psalm 119:1, content shown here as convertVerseToMarkdown receives it once the chapter-level hoist has already consumed the first heading) still hoists via the pre-existing verse-level heading fallback exactly as today", () => {
      const verse: VerseSchema = {
        book: "PSA",
        chapter: 119,
        verse: 1,
        content: [
          { heading: [{ text: "א", script: "H" }, " ALEPH."], type: "acrostic" },
          { paragraph: true, text: "Blessed are they that are perfect in the way,", break: true },
          {
            text: "Who walk in the law of Jehovah.",
            break: true,
            foot: { type: "trn", content: ["Or, ", { text: "upright in way", marks: ["i"] }] },
          },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(result).toBe(
        "\n#### א ALEPH.\n\n<sup>1</sup> Blessed are they that are perfect in the way,<br>Who walk in the law of Jehovah.<sup>a</sup><br>"
      );
      expect(footnotes).toEqual(["- <sup>a</sup> 1. Or, _upright in way_"]);
      expect(result).not.toMatch(/^<sup>\d+<\/sup> > /);
    });
  });

  describe("the markdown export escapes a delimiter that came from source text", () => {
    it("should escape a literal underscore in content text so markdown never reads it as an emphasis delimiter (real BYZ2018 Revelation 4:4 apparatus shape)", () => {
      const verse: VerseSchema = {
        book: "REV",
        chapter: 4,
        verse: 4,
        content: [
          {
            text: " εἴκοσι",
            script: "G",
            foot: {
              type: "var",
              content: [
                "B ",
                { text: "εἴκοσι τέσσαρες", script: "G" },
                " ⇒ _",
                { text: "ΚΔ", script: "G" },
              ],
            },
            strong: "G1501",
          },
        ],
      };
      const footnotes: string[] = [];
      convertVerseToMarkdown(verse, footnotes);
      expect(footnotes[0]).toContain("⇒ \\_ΚΔ");
      expect(footnotes[0]).not.toMatch(/(?<!\\)_ΚΔ/);
      expectWellFormedEmphasis(footnotes[0]);
    });

    it("should escape a literal asterisk in content text so markdown never reads it as an emphasis delimiter (real BYZ2018 Romans 6:1 apparatus shape)", () => {
      const verse: VerseSchema = {
        book: "ROM",
        chapter: 6,
        verse: 1,
        content: [
          {
            text: " Ἐπιμένομεν",
            script: "G",
            foot: {
              type: "var",
              content: [
                "B ",
                { text: "Ἐπιμένομεν", script: "G" },
                " ⇒ ",
                { text: "Ἐπιμένωμεν", script: "G" },
                " = *)EPIMENOU=MEN",
              ],
            },
            strong: "G1961",
          },
        ],
      };
      const footnotes: string[] = [];
      convertVerseToMarkdown(verse, footnotes);
      expect(footnotes[0]).toContain("= \\*)EPIMENOU=MEN");
      expect(footnotes[0]).not.toMatch(/(?<!\\)\*\)EPIMENOU/);
      expectWellFormedEmphasis(footnotes[0]);
    });

    it("should render the real BYZ2018 Revelation 11:2 manuscript-siglum shape (a literal underscore immediately followed by two literal asterisks) with no emphasis opened at all", () => {
      const verse: VerseSchema = {
        book: "REV",
        chapter: 11,
        verse: 2,
        content: [
          {
            text: " τεσσαράκοντα",
            script: "G",
            foot: {
              type: "var",
              content: [
                "B ",
                { text: "τεσσαράκοντα καὶ δύο", script: "G" },
                " ⇒ ",
                { text: "τεσσαράκοντα δύο", script: "G" },
                " = _*M*B",
              ],
            },
            strong: "G5062",
          },
        ],
      };
      const footnotes: string[] = [];
      const result = convertVerseToMarkdown(verse, footnotes);
      expect(footnotes[0]).toContain("= \\_\\*M\\*B");
      expectWellFormedEmphasis(result);
      expectWellFormedEmphasis(footnotes.join("\n"));
    });

    it("should leave the plain-text export unescaped, since it has no delimiter grammar to collide with (same real Revelation 11:2 shape, simplified to a single footnote string)", () => {
      const verse: VerseSchema = {
        book: "REV",
        chapter: 11,
        verse: 2,
        content: [
          {
            text: " τεσσαράκοντα",
            strong: "G5062",
            foot: { type: "var", content: "B τεσσαράκοντα καὶ δύο ⇒ τεσσαράκοντα δύο = _*M*B" },
          },
        ],
      };
      const result = convertVerseToText(verse);
      expect(result).toContain("= _*M*B");
      expect(result).not.toContain("\\_");
      expect(result).not.toContain("\\*");
    });
  });
});
