import { describe, it, expect } from "vitest";
import { sortContentKeys, sortVerseKeys } from "../sortContentKeys";

describe("sortContentKeys", () => {
  describe("basic key ordering", () => {
    it("should order keys: text, marks, strong", () => {
      const input = {
        strong: "H7225",
        text: "In the beginning",
        marks: ["i"],
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["text", "marks", "strong"]);
    });

    it("should order keys: paragraph, text, foot, strong", () => {
      const input = {
        strong: "H776",
        foot: { type: "stu", content: "note" },
        text: "The earth",
        paragraph: true,
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual([
        "paragraph",
        "text",
        "foot",
        "strong",
      ]);
    });

    it("should order keys: text, script, strong, morph", () => {
      const input = {
        morph: "8804",
        strong: "G1722",
        text: "Ἐν",
        script: "G",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual([
        "text",
        "script",
        "strong",
        "morph",
      ]);
    });

    it("should order keys: heading first", () => {
      const input = {
        content: "David's Psalm",
        heading: true,
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["heading", "content"]);
    });

    it("should order keys: subtitle before heading", () => {
      const input = {
        heading: "The Song",
        subtitle: "A psalm of David",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["subtitle", "heading"]);
    });

    it("should order type before text inside footnotes", () => {
      const input = {
        content: "some note",
        type: "stu",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["type", "content"]);
    });

    it("should order heading before type for acrostic headings", () => {
      const input = {
        type: "acrostic",
        heading: "ALEPH",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["heading", "type"]);
    });

    it("should order text before content", () => {
      const input = {
        content: ["some ", "text"],
        text: "prefix",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["text", "content"]);
    });

    it("should order script before marks", () => {
      const input = {
        marks: ["i"],
        script: "G",
        text: "hello",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["text", "script", "marks"]);
    });

    it("should order marks before break", () => {
      const input = {
        break: true,
        marks: ["i"],
        text: "hello",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["text", "marks", "break"]);
    });

    it("should order script before foot", () => {
      const input = {
        foot: { type: "stu", content: "note" },
        script: "G",
        text: "hello",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["text", "script", "foot"]);
    });

    it("should handle lemma after morph", () => {
      const input = {
        lemma: "λόγος",
        morph: "N-NSM",
        strong: "G3056",
        text: "λόγος",
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["text", "strong", "morph", "lemma"]);
    });
  });

  describe("marks array sorting", () => {
    it("should alphabetize marks array", () => {
      const input = {
        text: "Lord",
        marks: ["sc", "i", "b"],
      };
      const result = sortContentKeys(input);
      expect(result.marks).toEqual(["b", "i", "sc"]);
    });

    it("should handle single mark", () => {
      const input = {
        text: "italic",
        marks: ["i"],
      };
      const result = sortContentKeys(input);
      expect(result.marks).toEqual(["i"]);
    });
  });

  describe("nested content sorting", () => {
    it("should sort keys in nested foot content", () => {
      const input = {
        text: "formless",
        foot: {
          content: [
            "Or ",
            {
              marks: ["i"],
              text: "a waste",
            },
          ],
          type: "stu",
        },
      };
      const result = sortContentKeys(input);
      // foot keys should be sorted
      expect(Object.keys(result.foot)).toEqual(["type", "content"]);
      // nested object in foot.content should be sorted
      expect(Object.keys(result.foot.content[1])).toEqual(["text", "marks"]);
    });

    it("should sort keys in nested content arrays", () => {
      const input = {
        content: [
          "prefix ",
          {
            strong: "H123",
            text: "word",
            marks: ["i"],
          },
        ],
        paragraph: true,
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result)).toEqual(["paragraph", "content"]);
      expect(Object.keys(result.content[1])).toEqual([
        "text",
        "marks",
        "strong",
      ]);
    });

    it("should sort heading content", () => {
      const input = {
        heading: [
          "The ",
          {
            marks: ["sc"],
            text: "Lord",
          },
          " Speaks",
        ],
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result.heading[1])).toEqual(["text", "marks"]);
    });

    it("should sort subtitle content", () => {
      const input = {
        subtitle: {
          content: "A Psalm",
          marks: ["i"],
        },
      };
      const result = sortContentKeys(input);
      expect(Object.keys(result.subtitle)).toEqual(["content", "marks"]);
    });
  });

  describe("unknown keys handling", () => {
    it("should append unknown keys at the end", () => {
      const input = {
        unknownKey: "value",
        text: "hello",
        anotherUnknown: 123,
      };
      const result = sortContentKeys(input);
      // Known keys first, unknown keys alphabetically at end
      expect(Object.keys(result)).toEqual([
        "text",
        "anotherUnknown",
        "unknownKey",
      ]);
    });

    it("should never drop any keys", () => {
      const input = {
        someNewKey: "value",
        text: "hello",
        marks: ["i"],
        customData: { nested: true },
      };
      const result = sortContentKeys(input);
      expect(result.someNewKey).toBe("value");
      expect(result.customData).toEqual({ nested: true });
      expect(Object.keys(result).length).toBe(4);
    });
  });

  describe("preserves values", () => {
    it("should preserve all values unchanged", () => {
      const input = {
        strong: "H7225",
        text: "In the beginning",
        paragraph: true,
        foot: {
          type: "stu",
          content: "A note",
        },
      };
      const result = sortContentKeys(input);
      expect(result.strong).toBe("H7225");
      expect(result.text).toBe("In the beginning");
      expect(result.paragraph).toBe(true);
      expect(result.foot).toEqual({ type: "stu", content: "A note" });
    });

    it("should preserve string content unchanged", () => {
      const result = sortContentKeys("just a string");
      expect(result).toBe("just a string");
    });

    it("should handle null/undefined", () => {
      expect(sortContentKeys(null)).toBe(null);
      expect(sortContentKeys(undefined)).toBe(undefined);
    });

    it("should handle arrays at top level", () => {
      const input = ["text", { marks: ["i"], text: "italic" }];
      const result = sortContentKeys(input);
      expect(result[0]).toBe("text");
      expect(Object.keys(result[1])).toEqual(["text", "marks"]);
    });
  });
});

describe("sortVerseKeys", () => {
  it("should order verse keys: book, chapter, verse, content", () => {
    const input = {
      content: "text",
      verse: 1,
      book: "GEN",
      chapter: 1,
    };
    const result = sortVerseKeys(input);
    expect(Object.keys(result)).toEqual([
      "book",
      "chapter",
      "verse",
      "content",
    ]);
  });

  it("should sort content recursively", () => {
    const input = {
      content: {
        strong: "H123",
        text: "word",
        paragraph: true,
      },
      verse: 1,
      book: "GEN",
      chapter: 1,
    };
    const result = sortVerseKeys(input);
    expect(Object.keys(result)).toEqual([
      "book",
      "chapter",
      "verse",
      "content",
    ]);
    expect(Object.keys(result.content)).toEqual([
      "paragraph",
      "text",
      "strong",
    ]);
  });

  it("should sort array content recursively", () => {
    const input = {
      content: [{ strong: "H123", text: "word" }, "plain text"],
      verse: 1,
      book: "GEN",
      chapter: 1,
    };
    const result = sortVerseKeys(input);
    expect(Object.keys(result.content[0])).toEqual(["text", "strong"]);
  });
});
