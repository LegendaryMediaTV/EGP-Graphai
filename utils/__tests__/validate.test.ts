import { describe, it, expect } from "vitest";
import {
  collectJsonFiles,
  dropEmptyTextKeysInContent,
  findDeclaredChapterMismatches,
  findMeaninglessContentNodes,
  findResidualContentChanges,
  findStrongTrailingWhitespaceNodes,
  normalizeBibleLinkDashesInContent,
} from "../validate";
import { getVersionDirectories } from "../../functions/getBibleVersions";
import Content from "../../types/Content";
import { VerseRecord } from "../auditNodes";
import { VersionBook } from "../../types/Version";

describe("collectJsonFiles — real, on-disk corpus", () => {
  // Version-agnostic, like the auditNodes on-disk-corpus tests: assumes
  // nothing beyond YLT1898 and KJV1769 existing, used only to prove an
  // unrequested version's files are excluded/included correctly.

  it("should scope every bible-versions-scoped file to the requested version and none other", () => {
    const files = collectJsonFiles(["YLT1898"]);
    const versionScoped = files.filter((file) => file.includes("bible-versions") && !file.includes("schema"));

    expect(versionScoped.length).toBeGreaterThan(0);
    for (const file of versionScoped) {
      expect(file).toContain("YLT1898");
    }
    expect(files.some((file) => file.includes("KJV1769"))).toBe(false);
  });

  it("should always include the shared root-level and registry files regardless of scope", () => {
    const files = collectJsonFiles(["YLT1898"]);

    expect(files).toContain("content-schema.json");
    expect(files).toContain("./bible-books/bible-books.json");
    expect(files).toContain("./bible-books/bible-books-schema.json");
    expect(files).toContain("./bible-versions/bible-versions-schema.json");
    expect(files).toContain("./bible-versions/bible-verses-schema.json");
  });

  it("should span every version's files when passed the full directory list — the preserved no-argument default", () => {
    const files = collectJsonFiles(getVersionDirectories());

    expect(files.some((file) => file.includes("YLT1898"))).toBe(true);
    expect(files.some((file) => file.includes("KJV1769"))).toBe(true);
  });
});

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
      // Real shape: a verse opening with marks but no text, alongside a
      // legitimate foot — only the dangling marks are the problem.
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
      // The same empty-husk shape, now nested inside footnote content.
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

    it("should report an empty text alongside a foot, whatever else the node carries — real KJV1769 Psalm 80:4 shape", () => {
      // The footnote's own text moved onto the Strong's-tagged node before
      // it (check 12's own relocation), leaving this repeated anchor with
      // an empty text key and nothing left to render — a husk this
      // function's own "sole key is text" check used to miss, since `foot`
      // is a second key.
      expect(
        findMeaninglessContentNodes([
          {
            text: "How long wilt thou be angry",
            foot: {
              type: "trn",
              content: ["Heb. ", { text: "wilt thou smoke?", marks: ["i"] }],
            },
            strong: "H6225",
          },
          {
            text: "",
            foot: {
              type: "trn",
              content: ["Heb. ", { text: "wilt thou smoke?", marks: ["i"] }],
            },
          },
        ])
      ).toEqual(["content[1]: empty node with nothing to render"]);
    });

    it("should report an empty text alongside both break and foot — real KJV1769 Proverbs 10:10 shape", () => {
      expect(
        findMeaninglessContentNodes([
          {
            text: "",
            break: true,
            foot: {
              type: "trn",
              content: ["Or, ", { text: "shall be beaten", marks: ["i"] }],
            },
          },
        ])
      ).toEqual(["content[0]: empty node with nothing to render"]);
    });

    it("should still accept a foot-carrying node with no text key at all, break or not", () => {
      // The husk rule turns on an empty *string*, never an absent key — a
      // bare anchor stays legal regardless of what else rides along with it.
      expect(
        findMeaninglessContentNodes([
          { foot: { type: "xrf", content: "Gen 1:1" } },
          { foot: { type: "xrf", content: "Gen 1:1" }, break: true },
        ])
      ).toEqual([]);
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
      // A space counts as text, so flagging whitespace-only text would
      // misfire against real corpus data that legitimately marks a bare
      // joining space.
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

describe("dropEmptyTextKeysInContent", () => {
  it("should drop an empty text key alongside a foot — real KJV1769 Psalm 80:4 shape", () => {
    expect(
      dropEmptyTextKeysInContent([
        {
          text: "How long wilt thou be angry",
          foot: { type: "trn", content: ["Heb. ", { text: "wilt thou smoke?", marks: ["i"] }] },
          strong: "H6225",
        },
        {
          text: "",
          foot: { type: "trn", content: ["Heb. ", { text: "wilt thou smoke?", marks: ["i"] }] },
        },
      ])
    ).toEqual({
      content: [
        {
          text: "How long wilt thou be angry",
          foot: { type: "trn", content: ["Heb. ", { text: "wilt thou smoke?", marks: ["i"] }] },
          strong: "H6225",
        },
        {
          foot: { type: "trn", content: ["Heb. ", { text: "wilt thou smoke?", marks: ["i"] }] },
        },
      ],
      changed: true,
    });
  });

  it("should drop an empty text key alongside both break and foot — real KJV1769 Proverbs 10:10 shape", () => {
    expect(
      dropEmptyTextKeysInContent([
        {
          text: "",
          break: true,
          foot: { type: "trn", content: ["Or, ", { text: "shall be beaten", marks: ["i"] }] },
        },
      ])
    ).toEqual({
      content: [
        {
          break: true,
          foot: { type: "trn", content: ["Or, ", { text: "shall be beaten", marks: ["i"] }] },
        },
      ],
      changed: true,
    });
  });

  it("should leave a node whose only property is an empty text untouched — dropping it would leave a bare {} with nothing left to keep", () => {
    const content: Content = [{ text: "" }, "text"];
    expect(dropEmptyTextKeysInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a node with no properties at all untouched", () => {
    const content: Content = [{}, "text"];
    expect(dropEmptyTextKeysInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a node with real text untouched", () => {
    const content: Content = [{ text: "Jesus wept", foot: { type: "trn", content: "note" } }];
    expect(dropEmptyTextKeysInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a foot-carrying node with no text key at all untouched", () => {
    const content: Content = [{ foot: { type: "xrf", content: "Gen 1:1" }, break: true }];
    expect(dropEmptyTextKeysInContent(content)).toEqual({ content, changed: false });
  });

  it("should report no change and return the original reference when nothing needs fixing", () => {
    const content: Content = ["In the beginning God created"];
    const result = dropEmptyTextKeysInContent(content);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should drop an empty text key nested inside footnote content — the same husk shape, one level down", () => {
    expect(
      dropEmptyTextKeysInContent([
        {
          text: "To",
          foot: {
            type: "stu",
            content: ["This", { text: "", strong: "H1" }, " psalm is an acrostic poem."],
          },
        },
      ])
    ).toEqual({
      content: [
        {
          text: "To",
          foot: {
            type: "stu",
            content: ["This", { strong: "H1" }, " psalm is an acrostic poem."],
          },
        },
      ],
      changed: true,
    });
  });

  it("should drop an empty text key nested inside a heading", () => {
    expect(
      dropEmptyTextKeysInContent([
        { heading: ["A ", { text: "", marks: ["i"], strong: "H1" }, " Prayer"] },
        "Body",
      ])
    ).toEqual({
      content: [
        { heading: ["A ", { marks: ["i"], strong: "H1" }, " Prayer"] },
        "Body",
      ],
      changed: true,
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
      // Matches the leading-space convention described on
      // findStrongTrailingWhitespaceNodes.
      expect(
        findStrongTrailingWhitespaceNodes([
          { text: "In the beginning", strong: "H7225" },
          { text: " God", strong: "H430" },
        ])
      ).toEqual([]);
    });

    it("should accept a textless multi-number sibling node", () => {
      // Same no-special-exclusion case described on
      // findStrongTrailingWhitespaceNodes.
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

describe("normalizeBibleLinkDashesInContent", () => {
  describe("fixing a hyphen in bibleLink and/or its content override", () => {
    it("should fix a hyphen in a bare bibleLink target without inventing a content key", () => {
      expect(
        normalizeBibleLinkDashesInContent([{ bibleLink: "Isaiah 66-2" }])
      ).toEqual({
        content: [{ bibleLink: "Isaiah 66–2" }],
        changed: true,
      });
    });

    it("should fix a hyphen in content alone when bibleLink is already clean", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Psalm 53:1–3", content: "53:1-3" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Psalm 53:1–3", content: "53:1–3" }],
        changed: true,
      });
    });

    it("should fix a hyphen in both bibleLink and content on the same node", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Psalm 53:1-3", content: "53:1-3" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Psalm 53:1–3", content: "53:1–3" }],
        changed: true,
      });
    });

    it("should fix the cross-chapter shorthand's digit-flanked hyphen in a bare bibleLink target", () => {
      expect(
        normalizeBibleLinkDashesInContent([{ bibleLink: "2 Kings 6:31-7:20" }])
      ).toEqual({
        content: [{ bibleLink: "2 Kings 6:31–7:20" }],
        changed: true,
      });
    });

    it("should fix a digit-flanked hyphen inside dot notation in a string content override, leaving the dots alone", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Exodus 2:9–18", content: "chap. 2.9-18" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Exodus 2:9–18", content: "chap. 2.9–18" }],
        changed: true,
      });
    });
  });

  describe("the hyphen guard — a hyphen converts only when it sits directly between two digits", () => {
    it("should leave a hyphenated word inside a string content override untouched", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Joshua 15:9", content: "Beth-el 15:9" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Joshua 15:9", content: "Beth-el 15:9" }],
        changed: false,
      });
    });

    it("should leave a hyphenated word inside a bare bibleLink target untouched", () => {
      expect(
        normalizeBibleLinkDashesInContent([{ bibleLink: "Beth-el 15:9" }])
      ).toEqual({
        content: [{ bibleLink: "Beth-el 15:9" }],
        changed: false,
      });
    });

    it("should leave a trailing hyphen with no following digit untouched", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Exodus 12:3", content: "Exodus 12:3 -" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Exodus 12:3", content: "Exodus 12:3 -" }],
        changed: false,
      });
    });

    it("should leave a leading hyphen with no preceding digit untouched", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Exodus 12:3", content: "- Exodus 12:3" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Exodus 12:3", content: "- Exodus 12:3" }],
        changed: false,
      });
    });
  });

  describe("dropping a content override that becomes redundant", () => {
    it("should drop content once the hyphen fix makes it byte-identical to the now-fixed bibleLink", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Isaiah 66-2", content: "Isaiah 66-2" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Isaiah 66–2" }],
        changed: true,
      });
    });

    it("should drop a content override already byte-identical to bibleLink with no hyphen involved", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Isaiah 66:2", content: "Isaiah 66:2" },
        ])
      ).toEqual({
        content: [{ bibleLink: "Isaiah 66:2" }],
        changed: true,
      });
    });
  });

  describe("what the transform leaves alone", () => {
    it("should leave a non-string content override untouched even when bibleLink on the same node gets fixed", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "John 3-16", content: [{ marks: ["i"] }, "see"] },
        ])
      ).toEqual({
        content: [
          { bibleLink: "John 3–16", content: [{ marks: ["i"] }, "see"] },
        ],
        changed: true,
      });
    });

    it("should never touch a content key that is not a sibling of a bibleLink, even with a hyphen inside it", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { content: ["the", "well-known", " Lord"], strong: "H3068" },
        ])
      ).toEqual({
        content: [{ content: ["the", "well-known", " Lord"], strong: "H3068" }],
        changed: false,
      });
    });

    it("should return the content unchanged and changed: false when nothing needs fixing", () => {
      const fixture: Content = [
        { bibleLink: "Isaiah 66:2", content: "66:2" },
        "In the beginning",
      ];
      expect(normalizeBibleLinkDashesInContent(fixture)).toEqual({
        content: fixture,
        changed: false,
      });
    });

    it("should accept plain string content", () => {
      expect(normalizeBibleLinkDashesInContent("In the beginning God created")).toEqual({
        content: "In the beginning God created",
        changed: false,
      });
    });
  });

  describe("recursion into every content-bearing branch", () => {
    it("should reach a bibleLink nested inside footnote content", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          {
            text: "word",
            foot: { type: "xrf", content: [{ bibleLink: "Romans 3-12" }] },
          },
        ])
      ).toEqual({
        content: [
          {
            text: "word",
            foot: { type: "xrf", content: [{ bibleLink: "Romans 3–12" }] },
          },
        ],
        changed: true,
      });
    });

    it("should reach a bibleLink nested inside a heading", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { heading: [{ bibleLink: "Psalm 119-1" }] },
        ])
      ).toEqual({
        content: [{ heading: [{ bibleLink: "Psalm 119–1" }] }],
        changed: true,
      });
    });

    it("should reach a bibleLink nested inside a subtitle", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { subtitle: [{ bibleLink: "Psalm 51-1" }] },
        ])
      ).toEqual({
        content: [{ subtitle: [{ bibleLink: "Psalm 51–1" }] }],
        changed: true,
      });
    });

    it("should fix every bibleLink node in a record independently when there's more than one", () => {
      expect(
        normalizeBibleLinkDashesInContent([
          { bibleLink: "Gen 1-1" },
          "and",
          { bibleLink: "Gen 1-2", content: "Gen 1-2" },
        ])
      ).toEqual({
        content: [
          { bibleLink: "Gen 1–1" },
          "and",
          { bibleLink: "Gen 1–2" },
        ],
        changed: true,
      });
    });
  });
});

describe("findResidualContentChanges — the idempotence guard's own per-verse re-check (G10)", () => {
  // The guard's whole job is to catch two of the pass's own steps quietly
  // undoing each other's work, so a genuinely settled verse must come back
  // silent — the guard costs nothing on a corpus that's already a fixed
  // point of the pass.
  it("should report nothing for a genuinely settled verse", () => {
    const verse: VerseRecord = {
      book: "GEN",
      chapter: 1,
      verse: 1,
      content: ["In the beginning God created the heavens and the earth."] as unknown as Content,
    };
    expect(findResidualContentChanges("YLT1898", verse)).toEqual([]);
  });

  // Real, verified interaction: two adjacent nodes whose own marks
  // genuinely disagree, joined by a boundary space check 9 already relocated
  // once. Re-running check 9's own detector against that already-relocated
  // state finds a *new*, equally-disagreeing space on the boundary's other
  // side — its single left-to-right pass doesn't revisit the node it just
  // rewrote — so it fires again and flips the boundary straight back. This
  // is exactly the class of step interaction the idempotence guard exists to
  // catch automatically, in the run that produces it, rather than needing a
  // second manual `npm run validate` to notice.
  it("should report a residual mark-boundary-space finding when a relocated space leaves a new, equally-disagreeing space on the other side of the same boundary", () => {
    const verse: VerseRecord = {
      book: "REV",
      chapter: 3,
      verse: 1,
      // Already-relocated shape: check 9's leading-space branch already
      // moved the joining space onto the predecessor's own trailing edge
      // once (the state right after check 9's own fix runs).
      content: [
        { text: "Sardis ", marks: ["sc"] },
        { text: "write", marks: ["woc"] },
      ] as unknown as Content,
    };
    const steps = findResidualContentChanges("YLT1898", verse);
    expect(steps).toContain("mark-boundary space relocation (check 9)");
  });

  it("should name the specific step still rewriting an unsettled verse, proving the chain is wired to the real per-step transforms and not a stub", () => {
    const verse: VerseRecord = {
      book: "YLT",
      chapter: 1,
      verse: 1,
      content: [{ text: "The Angel of the " }, "Jehovah"] as unknown as Content,
    };
    expect(findResidualContentChanges("YLT1898", verse)).toEqual([
      "equivalent sibling merge (check 15)",
    ]);
  });
});

// A version's declared chapter count must match the chapters its own verse
// file actually carries — corpus completeness, not merely validity. Real,
// permanent corpus findings exist for this (see bible-versions.md);
// fixtures below are synthetic since this pure comparator needs no file I/O
// to test.
describe("findDeclaredChapterMismatches", () => {
  const book = (overrides: Partial<VersionBook>): VersionBook => ({
    _id: "GEN",
    name: "Genesis",
    title: "Genesis",
    order: 1,
    chapters: 50,
    ...overrides,
  });

  it("should report a finding, naming both numbers, when the file's highest chapter is below the declared count", () => {
    const mismatches = findDeclaredChapterMismatches(
      [book({ _id: "EST", chapters: 16 })],
      new Map([["EST", 10]]),
    );
    expect(mismatches).toEqual([{ book: "EST", declaredChapters: 16, highestChapterPresent: 10 }]);
  });

  it("should report a finding, naming both numbers, when the file's highest chapter is above the declared count — the metadata is equally wrong in that direction", () => {
    const mismatches = findDeclaredChapterMismatches(
      [book({ _id: "DAN", chapters: 10 })],
      new Map([["DAN", 12]]),
    );
    expect(mismatches).toEqual([{ book: "DAN", declaredChapters: 10, highestChapterPresent: 12 }]);
  });

  it("should not report a finding when the declared count and the file's highest chapter agree", () => {
    const mismatches = findDeclaredChapterMismatches(
      [book({ _id: "GEN", chapters: 50 })],
      new Map([["GEN", 50]]),
    );
    expect(mismatches).toEqual([]);
  });

  it("should check every book independently, reporting only the ones that disagree", () => {
    const mismatches = findDeclaredChapterMismatches(
      [book({ _id: "EST", chapters: 16 }), book({ _id: "GEN", chapters: 50 }), book({ _id: "DAN", chapters: 14 })],
      new Map([
        ["EST", 10],
        ["GEN", 50],
        ["DAN", 12],
      ]),
    );
    expect(mismatches).toEqual([
      { book: "EST", declaredChapters: 16, highestChapterPresent: 10 },
      { book: "DAN", declaredChapters: 14, highestChapterPresent: 12 },
    ]);
  });

  it("should match the real CLV1880 EST and DAN findings exactly", () => {
    // Locked to the real corpus numbers so a future change to this
    // comparator can't silently drift from what bible-versions.md records.
    const mismatches = findDeclaredChapterMismatches(
      [book({ _id: "EST", chapters: 16 }), book({ _id: "DAN", chapters: 14 })],
      new Map([
        ["EST", 10],
        ["DAN", 12],
      ]),
    );
    expect(mismatches).toEqual([
      { book: "EST", declaredChapters: 16, highestChapterPresent: 10 },
      { book: "DAN", declaredChapters: 14, highestChapterPresent: 12 },
    ]);
  });

  it("should treat a book with no entry in the highest-chapter map as carrying zero chapters, a finding rather than a silent pass", () => {
    // A book declared in _version.json whose own verse file is missing
    // entirely is already reported by the existing file-existence check;
    // this comparator still names it rather than skipping it quietly.
    const mismatches = findDeclaredChapterMismatches([book({ _id: "OBD", chapters: 1 })], new Map());
    expect(mismatches).toEqual([{ book: "OBD", declaredChapters: 1, highestChapterPresent: 0 }]);
  });
});
