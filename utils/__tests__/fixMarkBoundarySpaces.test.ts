import { describe, expect, it } from "vitest";
import { mergeMarkBoundarySpacesInContent } from "../fixMarkBoundarySpaces";

describe("mergeMarkBoundarySpacesInContent", () => {
  it("should roll a stranded space onto the real next node when the two real sides agree exactly in marks (real Matthew 3:15 KJV1769 shape, no Strong's sibling in the way)", () => {
    const content = [
      { text: "it becometh", marks: ["woc"] },
      " ",
      { text: "us", marks: ["woc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "it becometh", marks: ["woc"] },
      { text: " us", marks: ["woc"] },
    ]);
  });

  it("should skip a Strong's-only textless sibling when looking for the real next node (real Matthew 3:15 KJV1769 shape)", () => {
    const content = [
      { text: "it becometh", marks: ["woc"] },
      " ",
      { strong: "G2076" },
      { text: "us", marks: ["woc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "it becometh", marks: ["woc"] },
      { strong: "G2076" },
      { text: " us", marks: ["woc"] },
    ]);
  });

  it("should leave a stranded space exactly where it is when a textless footnote sibling sits between it and the real next node — merging it forward would carry it past a marker that renders, changing which word that marker hugs", () => {
    const content = [
      { text: "walked with God, and he was not,", foot: { type: "trn", content: "x" } },
      { text: " " },
      { foot: { type: "trn", content: "y" } },
      "for God took him.",
    ];

    const result = mergeMarkBoundarySpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave a stranded space exactly where it is when a run of two textless footnote siblings sits between it and the real next node", () => {
    const content = [
      { text: "the first word,", marks: ["woc"] },
      " ",
      { foot: { type: "trn", content: "x" } },
      { text: "", foot: { type: "var", content: "y" } },
      { text: "the second word.", marks: ["woc"] },
    ];

    const result = mergeMarkBoundarySpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should still delete a redundant stranded space across a textless footnote sibling, since dropping the space before a marker is the resolution for a marker with whitespace on both sides", () => {
    const content = [
      { text: "the first word,", marks: ["woc"] },
      " ",
      { foot: { type: "trn", content: "x" } },
      { text: " the second word.", marks: ["woc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "the first word,", marks: ["woc"] },
      { foot: { type: "trn", content: "x" } },
      { text: " the second word.", marks: ["woc"] },
    ]);
  });

  it("should leave an already-tagged blank exactly where it is when the smaller (wrapper) side would otherwise be backward but the real previous node carries its own foot, real YLT1898 Revelation 2:13 shape — neither direction is safe: backward would manufacture a footnote-marker-spacing finding fixFootnoteMarkerSpacing.ts would re-extract on the next pass, and forward would bundle the blank into target's own larger, unrelated mark set", () => {
    const content = [
      { text: "...Antipas", marks: ["woc"], foot: { type: "stu", content: "Antipater" } },
      { text: " ", marks: ["woc"] },
      { text: "was", marks: ["i", "woc"] },
    ];

    const result = mergeMarkBoundarySpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should roll a stranded space BACKWARD onto the real previous node when that side is the smaller (wrapper) mark set of a subset pair, not always forward (real KJV1769 1 Samuel 16:7 shape: ['i'] is the wrapper, 'sc' is Lord's own local addition)", () => {
    const content = {
      content: [" him: for ", { text: "the", marks: ["i"] }, " ", { text: "Lord", marks: ["i", "sc"] }, " not as man"],
      strong: "H120",
    };

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      content: [" him: for ", { text: "the ", marks: ["i"] }, { text: "Lord", marks: ["i", "sc"] }, " not as man"],
      strong: "H120",
    });
  });

  it("should roll a stranded space FORWARD onto the real next node when that side is the smaller (wrapper) mark set instead, on the identical relationship in mirror image (real YLT1898 Matthew 11:30 shape: ['woc'] is the wrapper, 'i' is is's own local addition)", () => {
    const content = [
      { text: "is", marks: ["i", "woc"] },
      " ",
      { text: "easy,", marks: ["woc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "is", marks: ["i", "woc"] },
      { text: " easy,", marks: ["woc"] },
    ]);
  });

  it("should absorb both of a shared node's own stranded spaces onto that node itself, one on each edge, when it's the smaller side of a subset pair with both neighbors — real CSB2017 Matthew 15:4 shape once fixFootnoteMarkerSpacing.ts's own chain fix has already run", () => {
    const content = [
      { text: "Honor your father and your mother;", marks: ["b", "woc"] },
      " ",
      { text: "and,", marks: ["woc"] },
      " ",
      { text: "Whoever speaks evil of father or mother must be put to death.", marks: ["b", "woc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "Honor your father and your mother;", marks: ["b", "woc"] },
      { text: " and, ", marks: ["woc"] },
      { text: "Whoever speaks evil of father or mother must be put to death.", marks: ["b", "woc"] },
    ]);
  });

  it("should leave a stranded space alone when the two real sides genuinely disagree in formatting, with no subset relationship either way", () => {
    const content = [
      { text: "distinction,", marks: ["b"] },
      " ",
      { text: "Lord", marks: ["sc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toBe(content);
  });

  it("should delete a redundant stranded space rather than double it, when the real next node already carries its own independent leading whitespace", () => {
    const content = [
      { text: "it becometh", marks: ["woc"] },
      " ",
      { text: " us", marks: ["woc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "it becometh", marks: ["woc"] },
      { text: " us", marks: ["woc"] },
    ]);
  });

  it("should delete a redundant stranded space rather than double it in the backward direction too, when the real previous node already carries its own independent trailing whitespace", () => {
    const content = [
      { text: "the ", marks: ["i"] },
      " ",
      { text: "Lord", marks: ["i", "sc"] },
    ];

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "the ", marks: ["i"] },
      { text: "Lord", marks: ["i", "sc"] },
    ]);
  });

  it("should leave a clean tree unchanged, returning the original reference", () => {
    const content = [
      { text: "it becometh", marks: ["woc"] },
      { text: " us", marks: ["woc"] },
    ];

    const result = mergeMarkBoundarySpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should be idempotent — merging an already-merged tree reports no further change", () => {
    const content = [
      { text: "it becometh", marks: ["woc"] },
      " ",
      { text: "us", marks: ["woc"] },
    ];

    const first = mergeMarkBoundarySpacesInContent(content as never);
    const second = mergeMarkBoundarySpacesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("should descend into heading, subtitle, and foot.content — a stranded space there merges exactly as it does inside content", () => {
    const content = {
      heading: [{ text: "The Angel of the", marks: ["sc"] }, " ", { text: "Lord", marks: ["sc"] }],
    };

    const { content: result, changed } = mergeMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      heading: [{ text: "The Angel of the", marks: ["sc"] }, { text: " Lord", marks: ["sc"] }],
    });
  });

  it("should decline when the real next node opens a new paragraph", () => {
    const content = [
      { text: "it becometh", marks: ["woc"] },
      " ",
      { paragraph: true, text: "us", marks: ["woc"] },
    ];

    const result = mergeMarkBoundarySpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });
});
