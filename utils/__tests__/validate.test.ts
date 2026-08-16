import { describe, it, expect } from "vitest";
import {
  findMeaninglessContentNodes,
  findStrongTrailingWhitespaceNodes,
} from "../validate";
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
      // A real shape this rule catches: a verse opening with
      // { marks: ["woc"], foot: … }, which a naive renderer would wrap in an
      // empty pair of emphasis tags. The foot is legitimate; the marks are not.
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
      // A real shape this rule catches: the residue left behind after
      // stripping marks from { text: "", marks: ["b"] } without also
      // removing the now-empty node.
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
      // A footnote anchor carries no text of its own — with or without a
      // paragraph or break flag alongside it — and is meaningful regardless.
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
      // A bare strong value — with or without morph/paragraph alongside it —
      // is meaningful with no text of its own.
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
      // Both flags render on their own, with no text needed alongside them.
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
      // A space is text — something for formatting to apply to — so flagging
      // whitespace-only text as meaningless would misfire against real
      // corpus data that legitimately marks a bare joining space.
      expect(
        findMeaninglessContentNodes([{ text: " ", marks: ["woc"] }])
      ).toEqual([]);
    });

    it("should accept marks on a nested-content object", () => {
      // The marks apply to the nested content, not to text.
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

describe("findStrongTrailingWhitespaceNodes", () => {
  describe("a strong-carrying node whose own text ends in whitespace", () => {
    it("should report a node when its strong-carrying text ends in a space", () => {
      expect(
        findStrongTrailingWhitespaceNodes([
          { text: "God ", strong: "H430" },
          { text: "said", strong: "H559" },
        ])
      ).toEqual([
        'content[0]: strong "H430" carries text "God " ending in whitespace',
      ]);
    });

    it("should report every offender when a verse holds more than one", () => {
      expect(
        findStrongTrailingWhitespaceNodes([
          { text: "one ", strong: "H1" },
          { text: "two", strong: "H2" },
          { text: "three ", strong: "H3" },
        ])
      ).toEqual([
        'content[0]: strong "H1" carries text "one " ending in whitespace',
        'content[2]: strong "H3" carries text "three " ending in whitespace',
      ]);
    });

    it("should report a node when it sits inside footnote content", () => {
      expect(
        findStrongTrailingWhitespaceNodes([
          {
            text: "word",
            foot: {
              type: "stu",
              content: [{ text: "note ", strong: "H1" }],
            },
          },
        ])
      ).toEqual([
        'content[0].foot.content[0]: strong "H1" carries text "note " ending in whitespace',
      ]);
    });
  });

  describe("shapes that follow the established convention and must not fire", () => {
    it("should accept a strong-carrying node whose text carries only a leading space", () => {
      // The established convention (KJV1769 Genesis 1:1): the space that
      // joins one word to the next lives as the leading character of
      // whichever node comes after the gap, not the trailing character of
      // the one before it.
      expect(
        findStrongTrailingWhitespaceNodes([
          { text: "In the beginning", strong: "H7225" },
          { text: " God", strong: "H430" },
        ])
      ).toEqual([]);
    });

    it("should accept a textless multi-number sibling node", () => {
      // { strong: "H853" } with no text key at all — this never matches a
      // trailing-whitespace test and needs no special exclusion.
      expect(
        findStrongTrailingWhitespaceNodes([
          { text: "the earth", strong: "H776" },
          { strong: "H853" },
        ])
      ).toEqual([]);
    });

    it("should accept a strong-carrying node whose text has no trailing whitespace", () => {
      expect(
        findStrongTrailingWhitespaceNodes([{ text: "beginning", strong: "H7225" }])
      ).toEqual([]);
    });

    it("should accept a node with trailing whitespace that carries no strong value", () => {
      expect(
        findStrongTrailingWhitespaceNodes([{ text: "middle ", marks: ["i"] }])
      ).toEqual([]);
    });

    it("should accept plain string content", () => {
      expect(
        findStrongTrailingWhitespaceNodes("In the beginning God created")
      ).toEqual([]);
    });
  });
});
