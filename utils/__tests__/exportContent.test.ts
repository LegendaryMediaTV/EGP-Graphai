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
        // Should have paragraph break (double newline) between sentences
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
        // Text format should have ¶ marker before second sentence
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
        // Check that footnote has Subtitle. prefix
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
        // Footnote marker and content should come BEFORE Strong's and morph
        // Expected: Βοὸζ°{N Βοὸζ ἐκ ⇒ Βόες ἐκ} G1003 (N-PRI)
        // This allows clean removal: °{...} leaves "Βοὸζ G1003 (N-PRI)"
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
        // Each footnote content should come before its Strong's
        expect(result).toMatch(/Word1°\{Note 1\} G1111/);
        expect(result).toMatch(/Word2°\{Note 2\} G2222/);
      });
    });

    describe("textless elements at verse start", () => {
      it("should not produce double space when verse starts with textless paragraph element (KJV1769 MAT 3:1 style)", () => {
        // KJV1769 MAT 3:1: { paragraph: true, strong: "G1161" }, { text: " In", strong: "G1722" }
        const verse: VerseSchema = {
          book: "MAT",
          chapter: 3,
          verse: 1,
          content: [
            { paragraph: true, strong: "G1161" }, // textless element with paragraph
            { text: " In", strong: "G1722" },
            { text: " those", strong: "G1565" },
            { text: " days", strong: "G2250" },
          ],
        };
        const footnotes: string[] = [];
        const result = convertVerseToMarkdown(verse, footnotes);
        // Should be: "<sup>1</sup> In those days" NOT "<sup>1</sup>  In those days"
        expect(result).toBe("\n<sup>1</sup> In those days");
        expect(result).not.toContain("  "); // No double spaces
      });

      it("should add space after textless footnote at verse start in text export (CLV1880 GEN 50:23 style)", () => {
        // CLV1880 GEN 50:23: { foot: { ... } }, "et vidit Ephraim..."
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
        // No space between ° and {, but space after } for clean search/replace
        expect(result).toBe(
          "050:023 °{Originally verse 50:22.} et vidit Ephraim filios"
        );
        // Should have space after } so removing °{...} leaves correct spacing
        expect(result).toContain("} et vidit");
      });
    });

    describe("line break marker spacing", () => {
      it("should not add extra spaces around line break markers (WEBUS2020 GEN 3:14 style)", () => {
        // WEBUS2020 GEN 3:14: text with break: true markers
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
        // Expected: "003:014 ¶ Yahweh God said to the serpent,␤"Because you have done this,␤you are cursed..."
        // NOT: "Yahweh God said to the serpent, ␤"Because..." (space before ␤)
        // NOT: "serpent,␤ "Because..." (space after ␤ when text has leading quote)
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
        // Should be clean <br> without extra spaces
        expect(result).toBe(
          "\n<sup>14</sup> Yahweh God said to the serpent,<br>\u201CBecause you have done this,<br>"
        );
        expect(result).not.toMatch(/,<br> /); // No space after br when next text has no leading space
      });
    });

    describe("trailing footnotes", () => {
      it("should not have trailing space when verse ends with footnote (BYZ2018 MRK 3:27 style)", () => {
        // Real structure: text with footnote + Strong's/morph, then standalone textless footnote
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
        // Should end without trailing space
        // First element: text°{content} Strong's (morph)
        // Second element: °{content} (textless footnote)
        expect(result).toBe(
          "003:027 διαρπάσῃ.°{B διαρπάσῃ ⇒ διαρπάσει} G1283 (V-AAS-3S)°{N διαρπάσῃ ⇒ διαρπάσει}"
        );
        expect(result).not.toMatch(/ $/); // No trailing space
      });
    });

    describe("footnote spacing consistency", () => {
      it("should have no space between footnote marker and content (CLV1880 NUM 20:28 style)", () => {
        // CLV1880 NUM 20:28: text with trailing space + footnote, then string
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
        // Should be: text°{content}nexttext - no space between ° and {
        // This allows users to search/replace °{...} to remove footnotes cleanly
        expect(result).toBe(
          "020:028 cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius °{Originally verse 20:29.}illo mortuo in montis supercilio descendit cum Eleazaro"
        );
        // Key assertion: no space between ° and {
        expect(result).not.toMatch(/° \{/);
        expect(result).toMatch(/°\{/);
      });

      it("should have no space between footnote marker and content for textless footnote at start (CLV1880 NUM 20:29 style)", () => {
        // CLV1880 NUM 20:29: textless footnote at start, then string
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
        // Should be: °{content} text - no space between ° and {, space after }
        expect(result).toBe(
          "020:029 °{Originally verse 20:30.} omnis autem multitudo videns occubuisse Aaron"
        );
        expect(result).not.toMatch(/° \{/);
        expect(result).toMatch(/°\{/);
      });

      it("should allow clean removal of footnotes via search/replace", () => {
        // When user replaces °{...} with empty string, spacing should be correct
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
        // After removing °{note}, result should be "eius illo mortuo" (correct spacing)
        const withoutFootnote = result.replace(/°\{[^}]*\}/g, "");
        expect(withoutFootnote).toBe("020:028 eius illo mortuo");
      });

      it("should handle footnote with Strong's - footnote content before Strong's (BYZ style)", () => {
        // BYZ style: text°{content} Strong's (morph)
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
        // text°{content} Strong's (morph) - content before Strong's
        expect(result).toContain("Βοὸζ°{N Βοὸζ ⇒ Βόες} G1003 (N-PRI)");
        // Removing °{...} should give correct spacing
        const withoutFootnote = result.replace(/°\{[^}]*\}/g, "");
        expect(withoutFootnote).toContain("Βοὸζ G1003 (N-PRI)");
      });
    });
  });
});
