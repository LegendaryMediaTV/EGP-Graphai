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

  it("should splice the extracted node immediately after its source when a textless foot sibling follows, so the two markers keep the order they were written in", () => {
    const content = [
      { text: "the first words ", foot: { type: "trn", content: "note one" } },
      { foot: { type: "xrf", content: "note two" } },
      "and then more.",
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "the first words " },
      { foot: { type: "trn", content: "note one" } },
      { foot: { type: "xrf", content: "note two" } },
      "and then more.",
    ]);
  });

  it("should walk past a textless Strong's anchor when placing the extracted node, since that anchor renders nothing", () => {
    // The boundary the landing rule turns on — the slot is unchanged from
    // what it was before the rule existed, so this pins a narrowing rather
    // than driving it.
    const content = [
      { text: "the first words ", foot: { type: "trn", content: "note" }, strong: "H1234" },
      { strong: "H853" },
      "and then more.",
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "the first words ", strong: "H1234" },
      { strong: "H853" },
      { foot: { type: "trn", content: "note" } },
      "and then more.",
    ]);
  });

  it("should be idempotent across a textless foot sibling — the extracted node is already settled on the second pass", () => {
    const content = [
      { text: "the first words ", foot: { type: "trn", content: "note one" } },
      { foot: { type: "xrf", content: "note two" } },
      "and then more.",
    ];

    const first = relocateFootnoteMarkerSpacesInContent(content as never);
    const second = relocateFootnoteMarkerSpacesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.skipped).toEqual([]);
    expect(second.content).toEqual(first.content);
  });
});

describe("relocateFootnoteMarkerSpacesInContent — a run of two or more textless foot siblings is already settled", () => {
  it("should leave the run exactly where it is when the two real sides are a formatting subset of each other", () => {
    // A formatting subset buys the run no way across: the obstacle is a
    // rendered marker, not a formatting boundary.
    const content = [
      { text: "the first words ", marks: ["b", "woc"] },
      { foot: { type: "xrf", content: "note one" } },
      { foot: { type: "xrf", content: "note two" } },
      { text: "and then more,", marks: ["woc"] },
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("should leave the run exactly where it is when the two real sides genuinely disagree in formatting", () => {
    // The mirror of the subset case above: a genuine disagreement buys the
    // run no way across either. Neither formatting relationship gets special
    // treatment, because formatting was never the question.
    const content = [
      { text: "some text ", marks: ["b", "woc"] },
      { foot: { type: "trn", content: "note one" } },
      { foot: { type: "trn", content: "note two" } },
      { text: "Lord", marks: ["sc"] },
    ];

    const result = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.content).toBe(content);
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
  it("should delete the source's own trailing run rather than double it, both sides woc-marked", () => {
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

  it("should still resolve a marker with whitespace on both sides by deleting the leading whitespace, never relocating it, when a run of textless siblings separates the two real nodes", () => {
    // Pins the branch ordering this rule depends on: the redundant deletion
    // has to be reached before the run case, which otherwise leaves this
    // exact shape alone.
    const content = [
      { text: "the earth ", marks: ["woc"] },
      { foot: { type: "trn", content: "note one" } },
      { foot: { type: "trn", content: "note two" } },
      { text: " was formed.", marks: ["woc"] },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "the earth", marks: ["woc"] },
      { foot: { type: "trn", content: "note one" } },
      { foot: { type: "trn", content: "note two" } },
      { text: " was formed.", marks: ["woc"] },
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
