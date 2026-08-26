import { describe, expect, it } from "vitest";
import { mergeUnmergedNodesInContent } from "../fixUnmergedNodes";

describe("mergeUnmergedNodesInContent", () => {
  it("should merge a paragraph-opening connector forward into its foot-carrying neighbor (YLT1898 Mark 1:1's own real shape, split apart)", () => {
    const content = [
      { paragraph: true, text: "A beginning of the good news of Jesus Christ, " },
      {
        text: "Son of God.",
        foot: { type: "xrf", content: { bibleLink: "Matthew 3:1–12" } },
      },
    ];

    const { content: result, changed } = mergeUnmergedNodesInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      paragraph: true,
      text: "A beginning of the good news of Jesus Christ, Son of God.",
      foot: { type: "xrf", content: { bibleLink: "Matthew 3:1–12" } },
    });
  });

  it("should leave a clean array unchanged, returning the original reference", () => {
    const content = [{ text: "Son of God.", foot: { type: "xrf", content: "x" } }];

    const result = mergeUnmergedNodesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave a standalone bare foot node alone — never merges it forward or absorbs it backward (real CLV1880 NUM 20:28 post-fix shape; this shape is no longer versification-specific — check 12's own fixer now produces it for any 'sole' footnote-marker-after-whitespace case)", () => {
    const content = [
      { text: "cumque Aaron spoliasset vestibus suis induit eis Eleazarum filium eius " },
      { foot: { type: "var", content: "Originally verse 20:29." } },
      "illo mortuo in montis supercilio descendit cum Eleazaro",
    ];

    const result = mergeUnmergedNodesInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should leave an array already length 1 as an array, never collapsing it to a bare node (the length-1 preservation regression)", () => {
    // A one-element array with nothing to merge into (no strong/foot/break-carrying
    // target after it) must come back exactly as it went in — still an array;
    // see rewriteLevel's own doc comment in fixUnmergedNodes.ts for why
    // collapsing it would be wrong.
    const content = ["only one, plain, single element"];

    const { content: result, changed } = mergeUnmergedNodesInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toEqual(["only one, plain, single element"]);
  });

  it("should be idempotent — merging an already-merged tree reports no further change", () => {
    const content = [
      { paragraph: true, text: "A beginning of the good news of Jesus Christ, " },
      {
        text: "Son of God.",
        foot: { type: "xrf", content: { bibleLink: "Matthew 3:1–12" } },
      },
    ];

    const first = mergeUnmergedNodesInContent(content as never);
    const second = mergeUnmergedNodesInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });
});
