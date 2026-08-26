import { describe, expect, it } from "vitest";
import { relocateFootnoteMarkerSpacesInContent } from "../fixFootnoteMarkerSpacing";

describe("relocateFootnoteMarkerSpacesInContent — ordinary relocation", () => {
  it("should move a footed node's own trailing space onto the next node's leading edge when the two agree in formatting — real ASV1901 Genesis 1:2 shape", () => {
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
        text: "And the earth was waste and void; and darkness was upon the face of the deep: and the Spirit of God",
        foot: { type: "trn", content: ["Or, ", { text: "was brooding upon", marks: ["i"] }] },
      },
      " moved upon the face of the waters.",
    ]);
  });

  it("should relocate an earlier node's trailing run when the footed node itself renders no text of its own", () => {
    // Synthetic: no real corpus case combines a textless foot anchor with a
    // real next node — the one real case (WEBUS2020 Mark 9:44) sits at the
    // end of its own array and deletes instead (see the "deletion at a
    // genuine end" describe block below). This proves the fixer strips the
    // run from the real source node, not from the textless anchor itself.
    const content = [
      { text: "quenched.’ ", marks: ["woc"] },
      { foot: { type: "xrf", content: { bibleLink: "Isaiah 66:24" } } },
      { text: "next word", marks: ["woc"] },
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

  it("should not decline on formatting when the next node itself carries no formatting, regardless of the source's own marks", () => {
    // check 9's own asymmetric rule, reused here: only the side that itself
    // carries the formatting can be the offender, so an unmarked receiver
    // is always safe to relocate onto.
    const content = [
      { text: "the earth ", foot: { type: "trn", content: "note" }, marks: ["woc"] },
      "was formed.",
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "the earth", foot: { type: "trn", content: "note" }, marks: ["woc"] },
      " was formed.",
    ]);
  });
});

describe("relocateFootnoteMarkerSpacesInContent — deletion (receiver already carries its own leading space)", () => {
  it("should delete the source's own trailing run rather than double it — real WEBUS2020 Matthew 5:22 shape, both sides woc-marked", () => {
    // The receiver's own leading space already performs the join, so
    // relocating would double it rather than fix it — see
    // fixFootnoteMarkerSpacing.ts's own "deletion" reasoning.
    const content = [
      {
        text: "everyone who is angry with his brother without a cause ",
        marks: ["woc"],
        foot: { type: "var", content: "NU omits “without a cause”." },
      },
      {
        text: " will be in danger of the judgment.",
        marks: ["woc"],
      },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "everyone who is angry with his brother without a cause",
        marks: ["woc"],
        foot: { type: "var", content: "NU omits “without a cause”." },
      },
      {
        text: " will be in danger of the judgment.",
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

describe("relocateFootnoteMarkerSpacesInContent — structural insertion (receiver's own formatting disagrees)", () => {
  it("should extract the run into a standalone node between the two disagreeing real sides — real ASV1901 Exodus 3:14 shape (sc-marked destination)", () => {
    // A plain relocation into this destination would itself produce a
    // brand-new check-9 finding, so the run is extracted into a standalone
    // node instead — see fixFootnoteMarkerSpacing.ts's own "structural
    // insertion" reasoning.
    const content = [
      { text: "And God said unto Moses, ", foot: { type: "trn", content: "Or, ..." } },
      { text: "I AM THAT I AM", marks: ["sc"] },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "And God said unto Moses,", foot: { type: "trn", content: "Or, ..." } },
      " ",
      { text: "I AM THAT I AM", marks: ["sc"] },
    ]);
  });

  it("should relocate ordinarily, not insert a standalone node, when the receiver's marks are a strict formatting subset of the source's own — real YLT1898-shaped case (a woc-marked source bordering a translator-supplied word that is also part of the same discourse)", () => {
    const content = [
      { text: "the earth ", foot: { type: "trn", content: "note" }, marks: ["woc"] },
      { text: "was formed.", marks: ["i", "woc"] },
    ];

    const { content: result, changed, skipped } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    // A subset relationship is a nesting relationship, not a disagreement
    // (see isFormattingSubsetOf's own reasoning), so this relocates
    // ordinarily — no standalone node gets inserted.
    expect(result).toEqual([
      { text: "the earth", foot: { type: "trn", content: "note" }, marks: ["woc"] },
      { text: " was formed.", marks: ["i", "woc"] },
    ]);
  });

  it("the inserted standalone node should never itself become a new finding on a second pass", () => {
    const content = [
      { text: "And God said unto Moses, ", foot: { type: "trn", content: "Or, ..." } },
      { text: "I AM THAT I AM", marks: ["sc"] },
    ];

    const first = relocateFootnoteMarkerSpacesInContent(content as never);
    const second = relocateFootnoteMarkerSpacesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.skipped).toEqual([]);
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

  it("should be idempotent — relocating an already-relocated tree reports no further change", () => {
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

  it("should descend into heading, subtitle, and foot.content — each self-contained, so a trailing end there deletes rather than declines", () => {
    const content = {
      heading: [{ text: "the earth ", foot: { type: "trn", content: "note" } }, "was formed."],
    };

    const { content: result, changed } = relocateFootnoteMarkerSpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      heading: [{ text: "the earth", foot: { type: "trn", content: "note" } }, " was formed."],
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
