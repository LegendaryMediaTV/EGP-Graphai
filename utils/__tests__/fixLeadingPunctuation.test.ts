import { describe, expect, it } from "vitest";
import { reattachLeadingPunctuationInContent } from "../fixLeadingPunctuation";

describe("reattachLeadingPunctuationInContent", () => {
  it("should fold a footnoted comma back onto the Strong's word it belongs to, carrying the footnote with it", () => {
    const content = [
      { text: " replied", strong: "G3004" },
      { text: ",", foot: { type: "trn", content: "Grk “said.”" } },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      {
        text: " replied,",
        strong: "G3004",
        foot: { type: "trn", content: "Grk “said.”" },
      },
    ]);
  });

  it("should fold a line-ending comma back onto its word, carrying break: true with it", () => {
    const content = [
      { text: " in his own image", strong: "H6754" },
      { text: ",", break: true },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: " in his own image,", strong: "H6754", break: true },
    ]);
  });

  it("should move only the leading run when the offending node has real text of its own after it", () => {
    const content = [
      { text: " said", strong: "H559" },
      {
        text: ", “Let there be an",
        foot: { type: "trn", content: "Or a firmament" },
      },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: " said,", strong: "H559" },
      {
        text: " “Let there be an",
        foot: { type: "trn", content: "Or a firmament" },
      },
    ]);
  });

  it("should still repair the strong-on-strong shape the check was originally written for", () => {
    const content = [
      { text: "Look", marks: ["b", "i"], strong: "G2400" },
      { text: "! The", marks: ["b", "i"], strong: "G3588" },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "Look!", marks: ["b", "i"], strong: "G2400" },
      { text: " The", marks: ["b", "i"], strong: "G3588" },
    ]);
  });

  it("should leave an untagged, footless, breakless connector to the unmerged-node fixer", () => {
    const content = [
      { text: " word", strong: "H1" },
      { text: "," },
      { text: " more", strong: "H2" },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toBe(content);
  });

  it("should leave the emptied node behind as a bare footnote sibling when the attachment point already carries a footnote of its own", () => {
    const content = [
      { text: " a", strong: "H1", foot: { type: "trn", content: "first" } },
      { text: ",", foot: { type: "trn", content: "second" } },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: " a,", strong: "H1", foot: { type: "trn", content: "first" } },
      { foot: { type: "trn", content: "second" } },
    ]);
  });

  it("should fold onto a bare string attachment point, promoting it to an object only because the footnote has nowhere else to live", () => {
    const content = [
      " Jericho",
      { text: ")", foot: { type: "trn", content: "x" } },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: " Jericho)", foot: { type: "trn", content: "x" } },
    ]);
  });

  it("should reach past a textless Strong's sibling to find the real attachment point", () => {
    const content = [
      { text: " and female", strong: "H5347" },
      { strong: "H1961" },
      { text: ",", foot: { type: "trn", content: "x" } },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      {
        text: " and female,",
        strong: "H5347",
        foot: { type: "trn", content: "x" },
      },
      { strong: "H1961" },
    ]);
  });

  it("should leave a bare break node where the line ended when a textless Strong's sibling sits between", () => {
    // The sibling renders no text, so the comma and the footnote marker
    // rightly move across it onto the word. A line break is a position, not
    // text: folding it onto the word too would move the sibling's own
    // Strong's tag to the far side of the break.
    const content = [
      { text: " continues to exist", strong: "H3605" },
      { strong: "H3117" },
      { text: ",", break: true, foot: { type: "trn", content: "x" } },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      {
        text: " continues to exist,",
        strong: "H3605",
        foot: { type: "trn", content: "x" },
      },
      { strong: "H3117" },
      { break: true },
    ]);
  });

  it("should repair the same shape inside a footnote body", () => {
    const content = [
      {
        text: "word",
        foot: {
          type: "trn",
          content: [
            { text: "Grk", marks: ["i"] },
            { text: ".", marks: ["i"], break: true },
          ],
        },
      },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      {
        text: "word",
        foot: {
          type: "trn",
          content: [{ text: "Grk.", marks: ["i"], break: true }],
        },
      },
    ]);
  });

  it("should return the original reference untouched when there is nothing to repair", () => {
    const content = [
      { text: " replied,", strong: "G3004", foot: { type: "trn", content: "x" } },
    ];

    const { content: result, changed } = reattachLeadingPunctuationInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toBe(content);
  });
});
