import { describe, expect, it } from "vitest";
import { mergeEquivalentSiblingsInContent } from "../mergeEquivalentSiblingsInContent";

describe("mergeEquivalentSiblingsInContent — normalizing a text-only object", () => {
  it("should collapse a {text}-only object into a bare string even with no merge partner beside it — real YLT1898 Numbers shape", () => {
    const content = [
      { text: "door", strong: "H1817" } as never,
      { text: "opened" },
      { text: "beyond", strong: "H5674" } as never,
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "door", strong: "H1817" },
      "opened",
      { text: "beyond", strong: "H5674" },
    ]);
  });

  it("should normalize a scalar (non-array) text-only object the same way", () => {
    const content = { text: "opened" };

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toBe("opened");
  });

  it("should report no change for a bare string that is already normalized", () => {
    const content = "already plain";

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toBe("already plain");
  });
});

describe("mergeEquivalentSiblingsInContent — merging agreeing siblings", () => {
  it("should merge a bare string immediately followed by a text-only object into one bare string — real YLT1898 Exodus 3:1 heading shape", () => {
    const content = { heading: ["The Angel of the ", { text: "Jehovah" }] };

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({ heading: ["The Angel of the Jehovah"] });
  });

  it("should merge two adjacent bare strings into one — real YLT1898 John 1:1 shape", () => {
    const content = [
      "In the beginning was the Word,",
      " and the Word was with God, and the Word was God;",
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual(["In the beginning was the Word, and the Word was with God, and the Word was God;"]);
  });

  it("should merge two adjacent objects that agree in marks into one, keeping the shared marks — real YLT1898 Revelation 3:1 shape", () => {
    const content = [
      { text: "Sardis", marks: ["woc"] },
      { text: " write: these things", marks: ["woc"] },
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([{ text: "Sardis write: these things", marks: ["woc"] }]);
  });

  it("should merge a real three-node chain into a single node, in source order — real YLT1898 1 Chronicles 13:1 heading shape", () => {
    const content = {
      heading: ["The Ark of the ", { text: "Jehovah" }, " is brought to Jerusalem"],
    };

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({ heading: ["The Ark of the Jehovah is brought to Jerusalem"] });
  });

  it("should stop a run at a blocked node and leave both sides split there, not merged across it", () => {
    const content = [
      "before ",
      { text: "tagged", strong: "H1" },
      " after",
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    // Both sides are single nodes with no merge partner — the strong-carrying
    // node blocks a run from forming across it.
    expect(changed).toBe(false);
    expect(result).toEqual(content);
  });

  it("should merge on both sides of a blocked node independently, without crossing it", () => {
    const content = [
      "before ",
      "still before ",
      { text: "tagged", strong: "H1" },
      "after ",
      "still after",
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      "before still before ",
      { text: "tagged", strong: "H1" },
      "after still after",
    ]);
  });

  it("should not merge across a break — the break-carrying node stays an object, its normal-shaped neighbor still normalizes on its own", () => {
    const content = [{ text: "foo", break: true }, { text: "bar" }];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    // {text: "bar"} normalizes to a bare string on its own (changed: true);
    // {text: "foo", break: true} keeps break and stays an object, so the two
    // never become eligible to merge across that boundary.
    expect(changed).toBe(true);
    expect(result).toEqual([{ text: "foo", break: true }, "bar"]);
  });

  it("should not merge across a paragraph opening — the paragraph-opening node stays an object, its normal-shaped neighbor still normalizes on its own", () => {
    const content = [{ text: "foo" }, { paragraph: true, text: "bar" }];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual(["foo", { paragraph: true, text: "bar" }]);
  });

  it("should not merge two adjacent objects that disagree in marks", () => {
    const content = [
      { text: "Sardis", marks: ["woc"] },
      { text: " write", marks: ["sc"] },
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toEqual(content);
  });

  it("should not merge across a bibleLink node — its normal-shaped neighbor still normalizes on its own", () => {
    const content = [{ text: "See " }, { bibleLink: "John 3:16" }];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual(["See ", { bibleLink: "John 3:16" }]);
  });
});

describe("mergeEquivalentSiblingsInContent — recursion", () => {
  it("should merge and normalize inside a subtitle node's own inner content", () => {
    const content = { subtitle: ["A ", { text: "psalm" }] };

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({ subtitle: ["A psalm"] });
  });

  it("should merge and normalize inside a ContentNested wrapper's own content", () => {
    const content = [
      { content: ["foo ", { text: "bar" }], strong: "H1" } as never,
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([{ content: ["foo bar"], strong: "H1" }]);
  });

  it("should merge and normalize inside a footnote body's own content — real YLT1898 shape", () => {
    const content = [
      {
        text: "word",
        foot: { type: "trn", content: ["Or, ", { text: "from among" }] },
      },
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      {
        text: "word",
        foot: { type: "trn", content: ["Or, from among"] },
      },
    ]);
  });
});

describe("mergeEquivalentSiblingsInContent — no-op cases", () => {
  it("should report no change for an already-settled tree", () => {
    const content = [
      { text: "foo", strong: "H1" },
      { text: " bar", strong: "H2" },
    ];

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toBe(content);
  });

  it("should report no change for a single text-bearing node with nothing beside it", () => {
    const content = "just one node";

    const { content: result, changed } = mergeEquivalentSiblingsInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toBe("just one node");
  });
});
