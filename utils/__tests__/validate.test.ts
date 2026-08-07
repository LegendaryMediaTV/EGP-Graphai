import { describe, it, expect } from "vitest";
import { findMeaninglessContentNodes } from "../validate";
import Content from "../../types/Content";

describe("findMeaninglessContentNodes", () => {
  describe("formatting with no text to apply it to", () => {
    it("should report a node when it carries marks but no text", () => {
      expect(findMeaninglessContentNodes([{ marks: ["woc"] }, "text"])).toEqual([
        'content[0]: marks [woc] with no text to apply to',
      ]);
    });

    it("should report a node when it carries marks and an empty text", () => {
      expect(
        findMeaninglessContentNodes([{ text: "", marks: ["b"] }, "text"])
      ).toEqual(['content[0]: marks [b] with no text to apply to']);
    });

    it("should report a node when it carries script but no text", () => {
      expect(findMeaninglessContentNodes([{ script: "G" }, "text"])).toEqual([
        'content[0]: script "G" with no text to apply to',
      ]);
    });

    it("should report both when a node carries marks and script but no text", () => {
      expect(
        findMeaninglessContentNodes([{ marks: ["i", "sc"], script: "H" }])
      ).toEqual([
        'content[0]: marks [i, sc] and script "H" with no text to apply to',
      ]);
    });

    it("should report a footnote anchor when it still carries marks", () => {
      // The 472-node shape this objective was about: LSB2021 John 3:13 opened
      // with { marks: ["woc"], foot: … }, which the exporter turned into
      // [red][/red]°. The foot is legitimate; the marks are not.
      expect(
        findMeaninglessContentNodes([
          { marks: ["woc"], foot: { type: "xrf", content: "Prov 30:4" } },
          { text: "And no one has ascended into heaven", marks: ["woc"] },
        ])
      ).toEqual(['content[0]: marks [woc] with no text to apply to']);
    });

    it("should report every offender when a verse holds more than one", () => {
      expect(
        findMeaninglessContentNodes([
          { marks: ["woc"] },
          { text: "middle" },
          { marks: ["sc"] },
        ])
      ).toEqual([
        'content[0]: marks [woc] with no text to apply to',
        'content[2]: marks [sc] with no text to apply to',
      ]);
    });
  });

  describe("recursion into every content-bearing branch", () => {
    it("should report a node when it sits inside footnote content", () => {
      expect(
        findMeaninglessContentNodes([
          {
            text: "To",
            foot: {
              type: "stu",
              content: ["This", { text: "", marks: ["b"] }, " psalm"],
            },
          },
        ])
      ).toEqual([
        'content[0].foot.content[1]: marks [b] with no text to apply to',
      ]);
    });

    it("should report a node when it sits inside a subtitle", () => {
      expect(
        findMeaninglessContentNodes([
          { subtitle: ["A", { marks: ["i"] }, " psalm of David."] },
          "Body",
        ])
      ).toEqual([
        'content[0].subtitle[1]: marks [i] with no text to apply to',
      ]);
    });

    it("should report a node when it sits inside a heading", () => {
      expect(
        findMeaninglessContentNodes([
          { heading: ["A", { marks: ["i"] }, " Prayer"] },
          "Body",
        ])
      ).toEqual(['content[0].heading[1]: marks [i] with no text to apply to']);
    });

    it("should report a node when it sits inside a nested-content object", () => {
      expect(
        findMeaninglessContentNodes([
          { content: ["the", { marks: ["sc"] }, " Lord"], strong: "H3068" },
        ])
      ).toEqual(['content[0].content[1]: marks [sc] with no text to apply to']);
    });

    it("should report a node when it sits inside a paragraph object", () => {
      expect(
        findMeaninglessContentNodes([{ paragraph: ["A", { marks: ["b"] }] }])
      ).toEqual([
        'content[0].paragraph[1]: marks [b] with no text to apply to',
      ]);
    });

    it("should report a node when it sits inside bibleLink display content", () => {
      expect(
        findMeaninglessContentNodes([
          { bibleLink: "John 3:16", content: [{ marks: ["i"] }, "see"] },
        ])
      ).toEqual(['content[0].content[0]: marks [i] with no text to apply to']);
    });

    it("should report a node when it sits inside a footnote nested in a footnote", () => {
      expect(
        findMeaninglessContentNodes({
          text: "word",
          foot: {
            type: "stu",
            content: { text: "note", foot: { type: "xrf", content: [{}] } },
          },
        })
      ).toEqual([
        "content.foot.content.foot.content[0]: empty node with nothing to render",
      ]);
    });
  });

  describe("empty husk nodes", () => {
    it("should report a node when its only property is an empty text", () => {
      expect(findMeaninglessContentNodes([{ text: "" }, "text"])).toEqual([
        "content[0]: empty node with nothing to render",
      ]);
    });

    it("should report a husk when it sits inside footnote content", () => {
      // NIV1984 Psalm 25:1 / 34:1 — the residue Phase 4 had to clean up after
      // stripping marks from { text: "", marks: ["b"] }.
      expect(
        findMeaninglessContentNodes([
          {
            text: "To",
            foot: {
              type: "stu",
              content: ["This", { text: "" }, " psalm is an acrostic poem."],
            },
          },
        ])
      ).toEqual(["content[0].foot.content[1]: empty node with nothing to render"]);
    });

    it("should report a node when it has no properties at all", () => {
      expect(findMeaninglessContentNodes([{}, "text"])).toEqual([
        "content[0]: empty node with nothing to render",
      ]);
    });
  });

  describe("nodes that are meaningful without text", () => {
    it("should accept a footnote anchor carrying no text", () => {
      // 12,452 in the corpus, plus 3,286 with paragraph and 32 with break.
      expect(
        findMeaninglessContentNodes([
          { foot: { type: "xrf", content: "Gen 1:1" } },
          { foot: { type: "xrf", content: "Gen 1:1" }, paragraph: true },
          { foot: { type: "xrf", content: "Gen 1:1" }, break: true },
          "In the beginning",
        ])
      ).toEqual([]);
    });

    it("should accept a Strong's-only element carrying no text", () => {
      // 22,851 bare strong, 646 morph+strong, 12 paragraph+strong.
      expect(
        findMeaninglessContentNodes([
          { strong: "H430" },
          { strong: "H1254", morph: "8804" },
          { strong: "H430", paragraph: true },
          { lemma: "θεός" },
        ])
      ).toEqual([]);
    });

    it("should accept a bare paragraph or break flag", () => {
      // 14 bare paragraph nodes in the corpus; both flags render on their own.
      expect(
        findMeaninglessContentNodes([
          { paragraph: true },
          { break: true },
          "text",
        ])
      ).toEqual([]);
    });

    it("should accept a bibleLink carrying no display content", () => {
      expect(
        findMeaninglessContentNodes([{ bibleLink: "Hebrews 11:3" }])
      ).toEqual([]);
    });
  });

  describe("nodes that do have text to format", () => {
    it("should accept marks on a node with text", () => {
      expect(
        findMeaninglessContentNodes([{ text: "Jesus wept", marks: ["woc"] }])
      ).toEqual([]);
    });

    it("should accept marks on a node whose text is only whitespace", () => {
      // The same line applyInlineTags, validateBBExport check (d) and the BB
      // importer all draw: a space is text. Flagging it would have produced
      // 131 false positives in the BB corpus.
      expect(
        findMeaninglessContentNodes([{ text: " ", marks: ["woc"] }])
      ).toEqual([]);
    });

    it("should accept marks on a nested-content object", () => {
      // 71 in the corpus. The marks apply to the nested content, not to text.
      // Cast because types/Content.ts omits marks from ContentNested while
      // content-schema.json allows it.
      expect(
        findMeaninglessContentNodes([
          { content: ["the", " Lord"], marks: ["sc"] },
        ] as unknown as Content)
      ).toEqual([]);
    });

    it("should accept plain string content", () => {
      expect(
        findMeaninglessContentNodes("In the beginning God created")
      ).toEqual([]);
    });

    it("should accept script on a node with text", () => {
      expect(
        findMeaninglessContentNodes([{ text: "λόγος", script: "G" }])
      ).toEqual([]);
    });
  });
});
