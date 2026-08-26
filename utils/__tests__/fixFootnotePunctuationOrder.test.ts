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

  it("should decline to remove a punctuation-only sibling carrying a property beyond text/marks/script, reporting extra-keys", () => {
    // Same shape as the repair case, but the sibling also carries
    // break: true (real Matthew 13:35) — the silent-data-loss shape the
    // fixer's own top doc comment names as why an unconditional delete
    // isn't safe.
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

    expect(changed).toBe(false);
    expect(skipped).toEqual(["extra-keys"]);
    expect(result).toEqual(content);
  });

  it("should decline a footed node and its punctuation-leading sibling that disagree in formatting, reporting eligibility", () => {
    // A footed, italic-marked node immediately followed by bare, unmarked
    // punctuation — the same marks mismatch the fixer's own top doc comment
    // names as a real corpus shape it must not guess across.
    const content = [
      { text: "some clause", marks: ["i"], foot: { type: "expl", content: "note" } },
      ".",
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
