import { describe, expect, it } from "vitest";
import { relocateFootnoteMarkerSpacesInContent } from "../fixFootnoteMarkerSpacing";
import { relocateMarkBoundarySpacesInContent } from "../fixMarkBoundaryEmbeddedSpaces";

describe("relocateMarkBoundarySpacesInContent", () => {
  it("should extract a leading space into its own standalone node when the predecessor carries strong (KJV1769 Matthew 27:46's own real shape, pre-fix)", () => {
    // KJV1769 Matthew 27:46's real, already-fixed shape reads: {text: "
    // saying,", strong: "G3004", ...}, " ", {text: "Eli,", marks: ["woc"],
    // strong: "G2241"}. Deleting the standalone space and moving it back
    // inside the woc-marked node's own text reconstructs the pre-fix shape
    // found on disk; this test locks in the same repair as a unit case. The
    // predecessor carries `strong`, so the space can't land on its trailing
    // edge (the trailing-whitespace check forbids trailing whitespace on a strong-carrying node) —
    // it has to become its own node instead.
    const content = [
      { text: " saying,", strong: "G3004", morph: "PresActPtc" },
      { text: " Eli,", marks: ["woc"], strong: "G2241" },
    ];

    const { content: result, changed, skipped } = relocateMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { text: " saying,", strong: "G3004", morph: "PresActPtc" },
      " ",
      { text: "Eli,", marks: ["woc"], strong: "G2241" },
    ]);
  });

  it("should extract a leading space into its own standalone node when the predecessor carries foot, instead of manufacturing trailing whitespace under an already-correctly-placed marker (CSB2017 1 Chronicles 17:17's own real shape)", () => {
    // A footed predecessor's own text already ends flush against its own
    // last real character ("distinction,") with the marker already hugging
    // it correctly. Relocating the small-caps node's own leading space onto
    // that predecessor's trailing edge would give it a trailing whitespace
    // run it never had — exactly the shape
    // fixFootnoteMarkerSpacing.ts's own "footnote marker renders after
    // whitespace" check looks for, which would then misread it as a marker
    // floating away from its word and wrongly re-extract an already-settled
    // foot. The space has to become its own standalone node instead, same
    // as the strong case above.
    const content = [
      {
        text: "...as a man of distinction,",
        foot: { type: "trn", content: "Hb obscure" },
      },
      { text: " Lord", marks: ["sc"] },
    ];

    const { content: result, changed, skipped } = relocateMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "...as a man of distinction,",
        foot: { type: "trn", content: "Hb obscure" },
      },
      " ",
      { text: "Lord", marks: ["sc"] },
    ]);
  });

  it("should delete a marked node's own trailing space when relocating it would double a whitespace run the unmarked neighbor already carries (WEBUS2020 Matthew 8:26's own real shape, with the defect reintroduced)", () => {
    // WEBUS2020 Matthew 8:26's real, already-fixed shape has no trailing
    // space on the woc-marked node; the unmarked bare-string successor
    // already opens with its own leading space. Reintroducing a trailing
    // space on the marked node reproduces the shape the mark-boundary-embedded-space check flags here:
    // relocating it onto the successor would double the whitespace already
    // there, and since the successor is unmarked, the redundant copy is
    // deleted rather than relocated.
    const content = [
      { paragraph: true, text: "He said to them, " },
      { text: "“Why are you fearful, O you of little faith?” ", marks: ["woc"] },
      " Then he got up, rebuked the wind and the sea, and there was a great calm.",
    ];

    const { content: result, changed, skipped } = relocateMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { paragraph: true, text: "He said to them, " },
      { text: "“Why are you fearful, O you of little faith?”", marks: ["woc"] },
      " Then he got up, rebuked the wind and the sea, and there was a great calm.",
    ]);
  });

  it("should decline a doubling collision when the receiving neighbor itself carries formatting, reporting doubled-whitespace", () => {
    // Synthetic: no real finding in this corpus has this shape (see the
    // module's own top doc comment), so this fixture is constructed rather
    // than drawn from disk. Both nodes carry non-empty, disagreeing marks
    // and already-adjoining whitespace on both sides of the boundary, so
    // relocating either node's own run would double it — and since the
    // receiver on each side carries its own formatting, deletion isn't
    // safe either; both directions decline.
    const content = [
      { text: "kept ", marks: ["i"] },
      { text: " word", marks: ["b"] },
    ];

    const { content: result, changed, skipped } = relocateMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual(["doubled-whitespace", "doubled-whitespace"]);
    expect(result).toEqual(content);
  });

  it("should leave a clean tree unchanged, returning the original reference", () => {
    const content = [
      { text: " saying,", strong: "G3004" },
      " ",
      { text: "Eli,", marks: ["woc"], strong: "G2241" },
    ];

    const result = relocateMarkBoundarySpacesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("should be idempotent — relocating an already-relocated tree reports no further change", () => {
    const content = [
      { text: " saying,", strong: "G3004", morph: "PresActPtc" },
      { text: " Eli,", marks: ["woc"], strong: "G2241" },
    ];

    const first = relocateMarkBoundarySpacesInContent(content as never);
    const second = relocateMarkBoundarySpacesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });

  it("should carry a marked node's own foot along with its relocated trailing space into a brand-new unformatted node, when the merge target is a genuinely safe (non-doubling) landing spot", () => {
    // A marked, footed node's own trailing run has a safe home on the real
    // successor's own leading edge (no doubled-whitespace collision), but the
    // successor is unmarked while this node carries "sc" — so plain
    // relocation isn't legal either, the same disagreement the ordinary case
    // resolves by moving the run alone. The run can't leave `foot` behind on
    // the shortened node (that strands the marker one character early), and
    // it can't carry `foot` onto the real successor's own text (that node's
    // marker never belonged to it). Both travel together into a new,
    // unformatted node inserted between the two.
    const content = [
      { paragraph: true, text: "Then he " },
      { text: "kept ", marks: ["sc"], foot: { type: "xrf", content: "see note" } },
      "moving forward.",
    ];

    const { content: result, changed, skipped } = relocateMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { paragraph: true, text: "Then he " },
      { text: "kept", marks: ["sc"] },
      { text: " ", foot: { type: "xrf", content: "see note" } },
      "moving forward.",
    ]);
  });

  it("should drop a marked node's own redundant trailing space and leave its foot hugging the word, when relocating would double an unmarked successor's own leading whitespace", () => {
    // Locks in the doubling-collision branch's own unchanged behavior when a
    // `foot` is present: the successor already carries its own independent
    // leading space, so relocating this node's own run there would double
    // it. Since the successor is unmarked, the redundant run is deleted
    // outright rather than relocated — exactly today's existing path, with
    // no new node spliced in. An earlier draft of this fix would have
    // spliced a run-plus-foot node here regardless of the doubling
    // collision; this test is the one that catches that mistake, since
    // `wouldDoubleWhitespace` has to keep gating the new branch, not just
    // the old one.
    const content = [
      { paragraph: true, text: "Then he " },
      { text: "kept ", marks: ["sc"], foot: { type: "xrf", content: "see note" } },
      " moving forward.",
    ];

    const { content: result, changed, skipped } = relocateMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { paragraph: true, text: "Then he " },
      { text: "kept", marks: ["sc"], foot: { type: "xrf", content: "see note" } },
      " moving forward.",
    ]);
  });

  it("should keep merging a marked node's own trailing space straight onto the successor's leading edge, unchanged, when no foot is involved", () => {
    // Same safe-merge-target shape as the new foot-carrying test above, minus
    // the `foot` — the pre-existing ordinary-merge path this fix must not
    // disturb. If the new `hasFoot` branch were written broadly enough to
    // swallow this case too, this test is what would catch it.
    const content = [
      { paragraph: true, text: "Then he " },
      { text: "kept ", marks: ["sc"] },
      "moving forward.",
    ];

    const { content: result, changed, skipped } = relocateMarkBoundarySpacesInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      { paragraph: true, text: "Then he " },
      { text: "kept", marks: ["sc"] },
      " moving forward.",
    ]);
  });

  it("should hand off cleanly to the footnote-marker-spacing fixer, which finishes splitting the run-plus-foot node into a bare space node and a bare foot node", () => {
    // Requirement 5's composed-unit proof: running the safe-merge-target
    // fixture through this module first, then through the (unmodified)
    // footnote-marker-spacing fixer, must reach the fully-settled shape on
    // its own — a bare whitespace-only node followed by a bare foot-only
    // node, both immediately before the untouched real successor — with no
    // further change needed from either fixer after that.
    const content = [
      { paragraph: true, text: "Then he " },
      { text: "kept ", marks: ["sc"], foot: { type: "xrf", content: "see note" } },
      "moving forward.",
    ];

    const afterMarkBoundary = relocateMarkBoundarySpacesInContent(content as never);
    const afterFootnoteSpacing = relocateFootnoteMarkerSpacesInContent(afterMarkBoundary.content);

    expect(afterFootnoteSpacing.changed).toBe(true);
    expect(afterFootnoteSpacing.skipped).toEqual([]);
    expect(afterFootnoteSpacing.content).toEqual([
      { paragraph: true, text: "Then he " },
      { text: "kept", marks: ["sc"] },
      { text: " " },
      { foot: { type: "xrf", content: "see note" } },
      "moving forward.",
    ]);
  });
});
