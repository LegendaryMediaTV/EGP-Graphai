import { describe, expect, it } from "vitest";
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
});
