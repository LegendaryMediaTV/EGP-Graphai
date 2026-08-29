import { describe, expect, it } from "vitest";
import { relocateFootnoteMarkerSpacesInContent } from "../fixFootnoteMarkerSpacing";

describe("relocateFootnoteMarkerSpacesInContent — sole (standalone-node extraction)", () => {
  it("should extract foot into a standalone node, leaving both real text nodes' own text completely untouched — real ASV1901 Genesis 1:2 shape", () => {
    const content = [
      {
        text: "And the earth was waste and void; and darkness was upon the face of the deep: and the Spirit of God ",
        foot: { type: "trn", content: ["Or, ", { text: "was brooding upon", marks: ["i"] }] },
      },
      "moved upon the face of the waters.",
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "And the earth was waste and void; and darkness was upon the face of the deep: and the Spirit of God ",
      },
      { foot: { type: "trn", content: ["Or, ", { text: "was brooding upon", marks: ["i"] }] } },
      "moved upon the face of the waters.",
    ]);
  });

  it("should be idempotent — extracting an already-extracted tree reports no further change (real ASV1901 Genesis 1:2 shape)", () => {
    const content = [
      {
        text: "And the earth was waste and void; and darkness was upon the face of the deep: and the Spirit of God ",
        foot: { type: "trn", content: "note" },
      },
      "moved upon the face of the waters.",
    ];

    const first = relocateFootnoteMarkerSpacesInContent(content as never);
    const second = relocateFootnoteMarkerSpacesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.skipped).toEqual([]);
    expect(second.content).toEqual(first.content);
  });

  it("should extract on the identical structural shape regardless of the footnote's own type or content — real CLV1880 Numbers 20:28 shape (no longer content-gated)", () => {
    const content = [
      {
        text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius ",
        foot: { type: "var", content: "Originally verse 20:29." },
      },
      "illo mortuo in montis supercilio descendit cum Eleazaro",
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius ",
      },
      { foot: { type: "var", content: "Originally verse 20:29." } },
      "illo mortuo in montis supercilio descendit cum Eleazaro",
    ]);
  });

  it("should be idempotent on the CLV1880 Numbers 20:28 shape too", () => {
    const content = [
      {
        text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius ",
        foot: { type: "var", content: "Originally verse 20:29." },
      },
      "illo mortuo in montis supercilio descendit cum Eleazaro",
    ];

    const first = relocateFootnoteMarkerSpacesInContent(content as never);
    const second = relocateFootnoteMarkerSpacesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.skipped).toEqual([]);
  });

  it("should extract regardless of marks on either side — the redundant/sole decision never consults formatting (both the old relocate-onto-receiver and old insert-bare-whitespace-node paths are gone)", () => {
    const content = [
      { text: "the earth ", foot: { type: "trn", content: "note" }, marks: ["woc"] },
      "was formed.",
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "the earth ", marks: ["woc"] },
      { foot: { type: "trn", content: "note" } },
      "was formed.",
    ]);
  });

  it("should apply inside a subtitle array exactly as it does inside content, with no extra recursion work needed — real CLV1880 Psalm 51:1 subtitle shape (a verse-initial bare foot node stays exempt, the combined node right after it still extracts)", () => {
    const content = {
      subtitle: [
        { foot: { type: "var", content: "Originally verse 50:1." } },
        {
          text: "in finem psalmus David ",
          foot: { type: "var", content: "Originally verse 50:2." },
        },
        "cum venit ad eum Nathan propheta quando intravit ad Bethsabee",
      ],
    };

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual({
      subtitle: [
        { foot: { type: "var", content: "Originally verse 50:1." } },
        { text: "in finem psalmus David " },
        { foot: { type: "var", content: "Originally verse 50:2." } },
        "cum venit ad eum Nathan propheta quando intravit ad Bethsabee",
      ],
    });
  });
});

describe("relocateFootnoteMarkerSpacesInContent — a run of two or more textless foot siblings", () => {
  it("should absorb the source's trailing run onto the real next node's own leading edge when the two real sides are a formatting subset, not a standalone space node — real CSB2017 Matthew 15:4 shape", () => {
    // "Honor your father and your mother;" carries marks: ["b","woc"]; two
    // stacked cross-reference footnotes ride after it as textless
    // siblings; "and," carries marks: ["woc"] alone — a strict subset of
    // the predecessor's marks, the identical nesting relationship
    // isFormattingSubsetOf's own doc comment names for the YLT1898
    // ["woc"]-vs-["i","woc"] case. Not a genuine disagreement, so the run
    // absorbs directly onto "and,"'s own leading edge.
    const content = [
      { text: "Honor your father and your mother; ", marks: ["b", "woc"] },
      { foot: { type: "xrf", content: "Ex 20:12; Dt 5:16" } },
      { foot: { type: "xrf", content: "Ex 20:12; Dt 5:16; Eph 6:2" } },
      { text: "and,", marks: ["woc"] },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "Honor your father and your mother;", marks: ["b", "woc"] },
      { foot: { type: "xrf", content: "Ex 20:12; Dt 5:16" } },
      { foot: { type: "xrf", content: "Ex 20:12; Dt 5:16; Eph 6:2" } },
      { text: " and,", marks: ["woc"] },
    ]);
  });

  it("should fall back to a standalone space node when the two real sides genuinely disagree in formatting, not merge onto either one", () => {
    // Same run-of-two-footnotes shape as above, but the real next node
    // carries marks the predecessor doesn't share at all (no subset
    // relationship either way) — neither real node's own text is a legal
    // home for the run, so it becomes its own node instead, the identical
    // structural fix fixMarkBoundaryEmbeddedSpaces.ts applies for the same
    // reason.
    const content = [
      { text: "some text ", marks: ["b", "woc"] },
      { foot: { type: "trn", content: "note one" } },
      { foot: { type: "trn", content: "note two" } },
      { text: "Lord", marks: ["sc"] },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "some text", marks: ["b", "woc"] },
      { foot: { type: "trn", content: "note one" } },
      { foot: { type: "trn", content: "note two" } },
      " ",
      { text: "Lord", marks: ["sc"] },
    ]);
  });
});

describe("relocateFootnoteMarkerSpacesInContent — already-settled bare foot nodes are never re-examined", () => {
  it("should leave a verse-initial bare foot node alone — real CLV1880 Numbers 20:29 shape, nothing precedes it so it's already the exempt, standalone form", () => {
    const content = [
      { foot: { type: "var", content: "Originally verse 20:30." } },
      "omnis autem multitudo videns occubuisse Aaron",
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("should leave a bare foot node alone with a real, already-spaced next node on either side — real KJV1769 Isaiah 10:5 shape", () => {
    const content = [
      {
        text: " Assyrian,",
        foot: {
          type: "trn",
          content: ["Or, ", { text: "woe to the Assyrian", marks: ["i"] }, ": Heb. ", { text: "Asshur", marks: ["i"] }],
        },
        strong: "H804",
      },
      { foot: { type: "trn", content: ["Heb. ", { text: "Ashur", marks: ["i"] }] } },
      { text: " the rod", strong: "H7626" },
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.content).toBe(content);
  });
});

describe("relocateFootnoteMarkerSpacesInContent — redundant (deletion)", () => {
  it("should delete the source's own trailing run rather than double it — real WEBUS2020 Matthew 11:23 shape (pre-a544b73), both sides woc-marked", () => {
    // The receiver's own leading space already performs the join, so
    // deleting the source's own redundant copy is the fix — see
    // fixFootnoteMarkerSpacing.ts's own "redundant, deletion" reasoning.
    const content = [
      {
        text: "You, Capernaum, who are exalted to heaven, you will go down to Hades. ",
        marks: ["woc"],
        foot: { type: "trn", content: "or, Hell" },
      },
      {
        text: " For if the mighty works had been done in Sodom which were done in you, it would have remained until today.",
        marks: ["woc"],
      },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "You, Capernaum, who are exalted to heaven, you will go down to Hades.",
        marks: ["woc"],
        foot: { type: "trn", content: "or, Hell" },
      },
      {
        text: " For if the mighty works had been done in Sodom which were done in you, it would have remained until today.",
        marks: ["woc"],
      },
    ]);
  });

  it("should delete the source's own trailing run when the receiver is unmarked, not just when both sides share marks", () => {
    const content = [
      { text: "the earth ", foot: { type: "trn", content: "note" } },
      " was formed.",
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "the earth", foot: { type: "trn", content: "note" } },
      " was formed.",
    ]);
  });

  it("should delete an earlier node's trailing run when the footed node itself renders no text and the real next node already opens with its own whitespace", () => {
    const content = [
      { text: "quenched.’ ", marks: ["woc"] },
      { foot: { type: "xrf", content: { bibleLink: "Isaiah 66:24" } } },
      { text: " next word", marks: ["woc"] },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "quenched.’", marks: ["woc"] },
      { foot: { type: "xrf", content: { bibleLink: "Isaiah 66:24" } } },
      { text: " next word", marks: ["woc"] },
    ]);
  });
});

describe("relocateFootnoteMarkerSpacesInContent — deletion at a genuine end (nothing real follows anywhere)", () => {
  it("should delete the trailing run of a footed node whose only next is a textless anchor at the true end of the array — real WEBUS2020 Mark 9:44 shape", () => {
    const content = [
      {
        text: "‘where their worm doesn’t die, and the fire is not quenched.’ ",
        marks: ["woc"],
        foot: { type: "xrf", content: { bibleLink: "Isaiah 66:24" } },
      },
      { foot: { type: "var", content: "NU omits verse 44." } },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "‘where their worm doesn’t die, and the fire is not quenched.’",
        marks: ["woc"],
        foot: { type: "xrf", content: { bibleLink: "Isaiah 66:24" } },
      },
      { foot: { type: "var", content: "NU omits verse 44." } },
    ]);
  });

  it("should delete the trailing run when the footed node is the array's only element", () => {
    const content = [{ text: "the earth ", foot: { type: "trn", content: "note" } }];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([{ text: "the earth", foot: { type: "trn", content: "note" } }]);
  });

  it("should delete the trailing run at the end of a footnote's own body — foot.content is self-contained, never woven into an outer sibling", () => {
    const content = [
      {
        text: "word",
        foot: {
          type: "trn",
          content: [{ text: "note ending mid-body ", foot: { type: "trn", content: "inner note" } }],
        },
      },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "word",
        foot: {
          type: "trn",
          content: [{ text: "note ending mid-body", foot: { type: "trn", content: "inner note" } }],
        },
      },
    ]);
  });

  it("should delete the trailing run at the end of a heading's own content — headings render through their own isolated wrapper", () => {
    const content = {
      heading: [{ text: "the earth ", foot: { type: "trn", content: "note" } }],
    };

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual({
      heading: [{ text: "the earth", foot: { type: "trn", content: "note" } }],
    });
  });
});

describe("relocateFootnoteMarkerSpacesInContent — the one genuinely irreducible decline", () => {
  it("should decline with no-next-node when the footed node ends a ContentNested wrapper's own inner content, even though nothing real follows within that inner array — real YLT1898 Luke 20:1 shape", () => {
    // Deleting here instead of declining fuses the wrapper's own last word
    // onto the word after it with no space at all ("uponhim") — a real
    // rendering regression.
    const content = [
      {
        paragraph: true,
        content: [
          { foot: { type: "stu", content: "Chapter summary..." } },
          {
            text: "the chief priests and the scribes, with the elders, came upon ",
            foot: { type: "trn", content: "Lit., writers stood over him with the presbyters." },
          },
        ],
      },
      { text: "him", marks: ["i"] },
      ",",
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual(["no-next-node"]);
    expect(result.content).toBe(content);
  });

  it("should not decline the ContentNested wrapper's own outer siblings just because its inner content declined", () => {
    const content = [
      {
        content: [{ text: "inner ", foot: { type: "trn", content: "note" } }],
      },
      { text: "outer ", foot: { type: "trn", content: "note" } },
      "tail.",
    ];

    const { skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(skipped).toEqual(["no-next-node"]);
  });
});

describe("relocateFootnoteMarkerSpacesInContent — block boundaries (still declined, zero real instances today)", () => {
  it("should decline with block-boundary when the next node opens a new paragraph", () => {
    const content = [
      { text: "the earth ", foot: { type: "trn", content: "note" } },
      { text: "was formed.", paragraph: true },
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual(["block-boundary"]);
  });

  it("should decline with block-boundary when the source node itself ends a line", () => {
    const content = [
      { text: "the earth ", foot: { type: "trn", content: "note" }, break: true },
      "was formed.",
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual(["block-boundary"]);
  });
});

describe("relocateFootnoteMarkerSpacesInContent — idempotence and recursion", () => {
  it("should leave a clean tree unchanged, returning the original reference", () => {
    const content = [
      { text: "the earth", foot: { type: "trn", content: "note" } },
      " was formed.",
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("should be idempotent after a deletion too", () => {
    const content = [
      { text: "the earth ", foot: { type: "trn", content: "note" } },
      " was formed.",
    ];

    const first = relocateFootnoteMarkerSpacesInContent(content as never);
    const second = relocateFootnoteMarkerSpacesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.skipped).toEqual([]);
  });

  it("should descend into heading, subtitle, and foot.content — a sole-shaped join there extracts exactly as it does inside content", () => {
    const content = {
      heading: [{ text: "the earth ", foot: { type: "trn", content: "note" } }, "was formed."],
    };

    const { content: result, changed } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      heading: [{ text: "the earth " }, { foot: { type: "trn", content: "note" } }, "was formed."],
    });
  });

  it("should descend into a ContentNested wrapper's own content, applying the non-deletable end-of-level policy there specifically", () => {
    const content = {
      content: [{ text: "the earth ", foot: { type: "trn", content: "note" } }],
      strong: "H776",
    };

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual(["no-next-node"]);
  });
});
