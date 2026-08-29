import { describe, expect, it } from "vitest";
import { reorderFootnotePunctuationInContent } from "../fixFootnotePunctuationOrder";

describe("reorderFootnotePunctuationInContent", () => {
  it("should move a footed node's own closing quote back onto its text (WEBUS2020 Revelation 1:8's own real shape, split apart)", () => {
    // WEBUS2020 Revelation 1:8's real, already-merged node reads: { paragraph:
    // true, text: "“I am the Alpha and the Omega,”", marks: ["woc"], foot: {…}
    // }. Splitting the closing quote back off into its own woc-marked sibling
    // reconstructs the pre-fix shape found on disk; this test locks in the
    // same repair as a unit case.
    const content = [
      {
        paragraph: true,
        text: "“I am the Alpha and the Omega,",
        marks: ["woc"],
        foot: { type: "var", content: "TR adds “the Beginning and the End”" },
      },
      { text: "”", marks: ["woc"] },
    ];

    const { content: result, changed, skipped } = reorderFootnotePunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        paragraph: true,
        text: "“I am the Alpha and the Omega,”",
        marks: ["woc"],
        foot: { type: "var", content: "TR adds “the Beginning and the End”" },
      },
    ]);
  });

  it("should carry a punctuation-only sibling's own break: true forward onto the merged node instead of declining", () => {
    // Same shape as the repair case, but the sibling also carries
    // break: true (real Matthew 13:35). Removing the sibling outright would
    // once have silently discarded that property, so break: true now rides
    // forward onto the merged node instead of blocking the merge.
    const content = [
      {
        paragraph: true,
        text: "“I am the Alpha and the Omega,",
        marks: ["woc"],
        foot: { type: "var", content: "TR adds “the Beginning and the End”" },
      },
      { text: "”", marks: ["woc"], break: true },
    ];

    const { content: result, changed, skipped } = reorderFootnotePunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        paragraph: true,
        text: "“I am the Alpha and the Omega,”",
        marks: ["woc"],
        foot: { type: "var", content: "TR adds “the Beginning and the End”" },
        break: true,
      },
    ]);
  });

  it("should still decline to remove a punctuation-only sibling carrying its own unrecognized extra property, reporting extra-keys", () => {
    // Same shape again, but the punctuation-only sibling carries its own
    // separate foot instead of break. There is no corpus evidence that any
    // extra-key shape besides break is safe to merge, so this one still
    // declines and reports the sibling untouched.
    const content = [
      {
        paragraph: true,
        text: "“I am the Alpha and the Omega,",
        marks: ["woc"],
        foot: { type: "var", content: "TR adds “the Beginning and the End”" },
      },
      { text: "”", marks: ["woc"], foot: { type: "expl", content: "a second, unrelated note" } },
    ];

    const { content: result, changed, skipped } = reorderFootnotePunctuationInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual(["extra-keys"]);
    expect(result).toEqual(content);
  });

  it("should extract a footed node's own foot onto a new node after a pure-punctuation sibling that disagrees in formatting (real CSB2017 John 7:36/8:22/16:17 shape)", () => {
    // A footed, italic-marked node immediately followed by bare, unmarked
    // punctuation — the same marks mismatch the fixer's own top doc comment
    // names as a real corpus shape it must not guess across by merging. But
    // since the sibling is nothing but punctuation, the marker's own
    // position still has one correct answer: after the punctuation. `foot`
    // moves there instead of the punctuation moving onto the footed node.
    const content = [
      { text: "some clause", marks: ["i"], foot: { type: "expl", content: "note" } },
      ".",
    ];

    const { content: result, changed, skipped } = reorderFootnotePunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: "some clause", marks: ["i"] },
      ".",
      { foot: { type: "expl", content: "note" } },
    ]);
  });

  it("should decline a footed node and a formatting-disagreeing sibling whose punctuation is only a leading run with real text of its own after it, reporting eligibility", () => {
    // Same marks mismatch as the pure-punctuation case above, but the
    // sibling has real text of its own after the punctuation run — moving
    // the punctuation still isn't safe (formatting disagrees), and unlike
    // the pure-punctuation shape there's no clean place to splice an
    // extracted `foot` without splitting this sibling in two, which no real
    // corpus case has needed yet.
    const content = [
      { text: "some clause", marks: ["i"], foot: { type: "expl", content: "note" } },
      ". Then something else",
    ];

    const { content: result, changed, skipped } = reorderFootnotePunctuationInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual(["eligibility"]);
    expect(result).toEqual(content);
  });

  it("should leave an already-merged node unchanged, returning the original reference", () => {
    const content = [
      {
        text: "“I am the Alpha and the Omega,”",
        marks: ["woc"],
        foot: { type: "var", content: "x" },
      },
    ];

    const result = reorderFootnotePunctuationInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("should be idempotent — reordering an already-reordered tree reports no further change", () => {
    const content = [
      {
        paragraph: true,
        text: "“I am the Alpha and the Omega,",
        marks: ["woc"],
        foot: { type: "var", content: "TR adds “the Beginning and the End”" },
      },
      { text: "”", marks: ["woc"] },
    ];

    const first = reorderFootnotePunctuationInContent(content as never);
    const second = reorderFootnotePunctuationInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });
});
