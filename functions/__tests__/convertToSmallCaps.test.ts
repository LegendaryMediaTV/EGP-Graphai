import { describe, it, expect } from "vitest";
import {
  convertToSmallCaps,
  convertContentToSmallCaps,
} from "../convertToSmallCaps";

describe("convertToSmallCaps", () => {
  describe("simple string content", () => {
    it("should convert 'LORD' to small caps object", () => {
      const result = convertToSmallCaps("The LORD said");
      expect(result).toEqual([
        "The ",
        { text: "Lord", marks: ["sc"] },
        " said",
      ]);
    });

    it("should convert 'Lord GOD' - only GOD to small caps (Adonai YHWH)", () => {
      const result = convertToSmallCaps("The Lord GOD has spoken");
      expect(result).toEqual([
        "The Lord ",
        { text: "God", marks: ["sc"] },
        " has spoken",
      ]);
    });

    it("should convert 'LORD GOD' to small caps objects", () => {
      const result = convertToSmallCaps("The LORD GOD of Israel");
      expect(result).toEqual([
        "The ",
        { text: "Lord", marks: ["sc"] },
        " ",
        { text: "God", marks: ["sc"] },
        " of Israel",
      ]);
    });

    it("should convert 'LORD's' to small caps with possessive", () => {
      const result = convertToSmallCaps("The LORD's temple");
      expect(result).toEqual([
        "The ",
        { text: "Lord's", marks: ["sc"] },
        " temple",
      ]);
    });

    it("should handle 'O LORD' (should convert)", () => {
      const result = convertToSmallCaps("O LORD, hear my prayer");
      expect(result).toEqual([
        "O ",
        { text: "Lord", marks: ["sc"] },
        ", hear my prayer",
      ]);
    });

    it("should NOT convert 'LORD' when surrounded by uppercase words (except O LORD)", () => {
      // THE LORD - should NOT convert because THE is uppercase
      const result = convertToSmallCaps("THE LORD ALMIGHTY");
      expect(result).toEqual("THE LORD ALMIGHTY");
    });

    it("should NOT convert LORD when preceded by uppercase word (not O)", () => {
      const result = convertToSmallCaps("SAYS THE LORD");
      expect(result).toEqual("SAYS THE LORD");
    });

    it("should handle multiple LORD occurrences", () => {
      const result = convertToSmallCaps(
        "The LORD is good. The LORD is gracious."
      );
      expect(result).toEqual([
        "The ",
        { text: "Lord", marks: ["sc"] },
        " is good. The ",
        { text: "Lord", marks: ["sc"] },
        " is gracious.",
      ]);
    });

    it("should return plain string when no LORD/GOD to convert", () => {
      const result = convertToSmallCaps("Jesus said to them");
      expect(result).toEqual("Jesus said to them");
    });

    it("should handle LORD at start of string", () => {
      const result = convertToSmallCaps("LORD, hear my prayer");
      expect(result).toEqual([
        { text: "Lord", marks: ["sc"] },
        ", hear my prayer",
      ]);
    });

    it("should handle LORD at end of string", () => {
      const result = convertToSmallCaps("praise the LORD");
      expect(result).toEqual(["praise the ", { text: "Lord", marks: ["sc"] }]);
    });

    it("should handle 'the LORD' with lowercase 'the'", () => {
      const result = convertToSmallCaps("the LORD our God");
      expect(result).toEqual([
        "the ",
        { text: "Lord", marks: ["sc"] },
        " our God",
      ]);
    });

    it("should NOT convert when LORD is part of all-caps phrase", () => {
      // When there's an ALL CAPS context, don't convert
      const result = convertToSmallCaps("PRAISE THE LORD");
      expect(result).toEqual("PRAISE THE LORD");
    });

    it("should handle LORD followed by punctuation", () => {
      const result = convertToSmallCaps("said the LORD.");
      expect(result).toEqual([
        "said the ",
        { text: "Lord", marks: ["sc"] },
        ".",
      ]);
    });

    it("should handle LORD with comma", () => {
      const result = convertToSmallCaps("the LORD, the God of Israel");
      expect(result).toEqual([
        "the ",
        { text: "Lord", marks: ["sc"] },
        ", the God of Israel",
      ]);
    });
  });

  describe("Lord GOD pattern (Adonai YHWH)", () => {
    it("should convert 'Lord GOD' - only GOD to small caps (Adonai YHWH)", () => {
      // "Lord GOD" represents Adonai YHWH - Lord stays regular, GOD becomes small caps
      const result = convertToSmallCaps("the Lord GOD said");
      expect(result).toEqual([
        "the Lord ",
        { text: "God", marks: ["sc"] },
        " said",
      ]);
    });

    it("should convert 'Lord GOD's' possessive form - only GOD to small caps", () => {
      const result = convertToSmallCaps("the Lord GOD's will");
      expect(result).toEqual([
        "the Lord ",
        { text: "God's", marks: ["sc"] },
        " will",
      ]);
    });

    it("should convert 'LORD GOD' - both to small caps (YHWH Elohim)", () => {
      // "LORD GOD" represents YHWH Elohim - both get small caps
      const result = convertToSmallCaps("the LORD GOD said");
      expect(result).toEqual([
        "the ",
        { text: "Lord", marks: ["sc"] },
        " ",
        { text: "God", marks: ["sc"] },
        " said",
      ]);
    });
  });

  describe("footnote content edge cases", () => {
    it("should handle footnote with 'loved by the LORD.'", () => {
      // Edge case: a quoted name-meaning parenthetical containing "the LORD."
      const result = convertToSmallCaps(
        ' This name means "loved by the LORD."'
      );
      expect(result).toEqual([
        ' This name means "loved by the ',
        { text: "Lord", marks: ["sc"] },
        '."',
      ]);
    });

    it("should handle 'the Lord breaks through.'", () => {
      const result = convertToSmallCaps(
        ' This name means "the Lord breaks through."'
      );
      // "Lord" here is NOT LORD (all caps), so it should remain as is
      expect(result).toEqual(' This name means "the Lord breaks through."');
    });
  });

  describe("real-world LORD/GOD patterns", () => {
    it("should handle LORD with question mark", () => {
      const result = convertToSmallCaps(
        "Who is like you, O LORD, among the gods?"
      );
      expect(result).toEqual([
        "Who is like you, O ",
        { text: "Lord", marks: ["sc"] },
        ", among the gods?",
      ]);
    });

    it("should convert LORD GOD patterns", () => {
      const result = convertToSmallCaps("the LORD God of Israel has spoken.");
      expect(result).toEqual([
        "the ",
        { text: "Lord", marks: ["sc"] },
        " God of Israel has spoken.",
      ]);
    });

    it("should handle 'Lord GOD' (adon yhwh pattern) - only GOD to small caps", () => {
      const result = convertToSmallCaps(
        "all your males will appear before the Lord GOD."
      );
      expect(result).toEqual([
        "all your males will appear before the Lord ",
        { text: "God", marks: ["sc"] },
        ".",
      ]);
    });
  });
});

describe("convertContentToSmallCaps", () => {
  describe("verse content transformations", () => {
    it("should handle simple string content", () => {
      const content = "The LORD said to Moses";
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual([
        "The ",
        { text: "Lord", marks: ["sc"] },
        " said to Moses",
      ]);
    });

    it("should preserve existing small caps objects", () => {
      const content = ["The ", { text: "Lord", marks: ["sc"] }, " is good"];
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual([
        "The ",
        { text: "Lord", marks: ["sc"] },
        " is good",
      ]);
    });

    it("should handle array with mixed content", () => {
      const content = [
        "The LORD is ",
        { text: "great", marks: ["i"] },
        " and worthy of praise",
      ];
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual([
        "The ",
        { text: "Lord", marks: ["sc"] },
        " is ",
        { text: "great", marks: ["i"] },
        " and worthy of praise",
      ]);
    });

    it("should handle object with text property containing LORD", () => {
      const content = {
        text: "The LORD said",
        paragraph: true,
      };
      const result = convertContentToSmallCaps(content);
      // Object with text containing LORD should be converted to array with paragraph flag
      expect(result).toEqual({
        paragraph: true,
        content: ["The ", { text: "Lord", marks: ["sc"] }, " said"],
      });
    });

    it("should handle object with content property (nested content)", () => {
      const content = {
        paragraph: true,
        content: ["The LORD is great"],
      };
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({
        paragraph: true,
        content: ["The ", { text: "Lord", marks: ["sc"] }, " is great"],
      });
    });

    it("should handle deeply nested content", () => {
      const content = {
        paragraph: true,
        content: [
          "The ",
          {
            content: ["LORD is ", { text: "great", marks: ["b"] }],
          },
        ],
      };
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({
        paragraph: true,
        content: [
          "The ",
          {
            content: [
              { text: "Lord", marks: ["sc"] },
              " is ",
              { text: "great", marks: ["b"] },
            ],
          },
        ],
      });
    });

    it("should handle footnote content", () => {
      const content = {
        foot: {
          type: "stu",
          content: ' This name means "loved by the LORD."',
        },
        content: "The Lord sent word",
      };
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({
        foot: {
          type: "stu",
          content: [
            ' This name means "loved by the ',
            { text: "Lord", marks: ["sc"] },
            '."',
          ],
        },
        content: "The Lord sent word",
      });
    });

    it("should handle heading content", () => {
      const content = { heading: "The LORD Speaks" };
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({
        heading: ["The ", { text: "Lord", marks: ["sc"] }, " Speaks"],
      });
    });

    it("should handle subtitle content", () => {
      const content = { subtitle: "The Word of the LORD" };
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({
        subtitle: ["The Word of the ", { text: "Lord", marks: ["sc"] }],
      });
    });

    it("should preserve marks on text objects - child inherits parent marks", () => {
      const content = {
        text: "The LORD is good",
        marks: ["b"],
      };
      // When text has marks already, we need to split it up
      const result = convertContentToSmallCaps(content);
      // Parent marks are inherited by children, so child only needs "sc"
      // The "b" mark on parent applies to all children automatically
      expect(result).toEqual({
        marks: ["b"],
        content: ["The ", { text: "Lord", marks: ["sc"] }, " is good"],
      });
    });

    it("should not modify text that already has sc mark with Lord", () => {
      const content = { text: "Lord", marks: ["sc"] };
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({ text: "Lord", marks: ["sc"] });
    });

    it("should convert LORD in a footnote on a node that also carries its own content", () => {
      const content = [
        {
          foot: {
            type: "stu",
            content: [
              { text: "Jedidiah", marks: ["i"] },
              ' This name means "loved by the LORD."',
            ],
          },
          content: [
            "The ",
            { text: "Lord", marks: ["sc"] },
            " sent word through Nathan the prophet to name the baby Jedidiah,",
          ],
        },
        " because the ",
        { text: "Lord", marks: ["sc"] },
        " loved the child.",
      ];
      const result = convertContentToSmallCaps(content);
      // Existing Lord with sc should be preserved, LORD in footnote should be converted
      expect(result).toEqual([
        {
          foot: {
            type: "stu",
            content: [
              { text: "Jedidiah", marks: ["i"] },
              ' This name means "loved by the ',
              { text: "Lord", marks: ["sc"] },
              '."',
            ],
          },
          content: [
            "The ",
            { text: "Lord", marks: ["sc"] },
            " sent word through Nathan the prophet to name the baby Jedidiah,",
          ],
        },
        " because the ",
        { text: "Lord", marks: ["sc"] },
        " loved the child.",
      ]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = convertContentToSmallCaps("");
      expect(result).toEqual("");
    });

    it("should handle null/undefined gracefully", () => {
      const result = convertContentToSmallCaps(null as any);
      expect(result).toEqual(null);
    });

    it("should handle empty array", () => {
      const result = convertContentToSmallCaps([]);
      expect(result).toEqual([]);
    });

    it("should handle object with only paragraph flag", () => {
      const content = { paragraph: true } as any;
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({ paragraph: true });
    });

    it("should preserve paragraph with foot but no text/content (edge case)", () => {
      // A paragraph marker carrying only a footnote, with no text of its own.
      const content = {
        paragraph: true,
        foot: {
          type: "stu",
          content:
            "The power of God is revealed as the people flourish. The LORD God is sovereign.",
        },
      };
      const result = convertContentToSmallCaps(content);
      expect(result).toEqual({
        paragraph: true,
        foot: {
          type: "stu",
          content: [
            "The power of God is revealed as the people flourish. The ",
            { text: "Lord", marks: ["sc"] },
            " God is sovereign.",
          ],
        },
      });
    });
  });
});
