import { describe, expect, it } from "vitest";
import { removeDuplicateFootnoteAnchorsInContent } from "../fixDuplicateFootnoteAnchors";

describe("removeDuplicateFootnoteAnchorsInContent", () => {
  it("should delete a textless node whose foot byte-for-byte repeats its predecessor's — real shape from the retired BYZ2018's 2 Corinthians 7:12", () => {
    const content = [
      {
        text: " εἵνεκεν",
        script: "G",
        foot: { type: "var", content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }] },
        strong: "G1752",
        morph: "PREP",
      },
      { foot: { type: "var", content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }] } },
      { text: " τοῦ", script: "G", strong: "G3588", morph: "T-GSM" },
    ];

    const { content: result, changed } = removeDuplicateFootnoteAnchorsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      {
        text: " εἵνεκεν",
        script: "G",
        foot: { type: "var", content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }] },
        strong: "G1752",
        morph: "PREP",
      },
      { text: " τοῦ", script: "G", strong: "G3588", morph: "T-GSM" },
    ]);
  });

  it("should delete every repeat in a chain of three, not just the one touching the real node — real shape from the retired BYZ2018's 2 Corinthians 7:12 (three markers share one apparatus note)", () => {
    const note = { type: "var", content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }] };
    const content = [
      { text: " εἵνεκεν", script: "G", foot: note, strong: "G1752", morph: "PREP" },
      { foot: { ...note } },
      { foot: { ...note } },
    ];

    const { content: result, changed } = removeDuplicateFootnoteAnchorsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: " εἵνεκεν", script: "G", foot: note, strong: "G1752", morph: "PREP" },
    ]);
  });

  it("should delete a duplicate anchor that also carries an empty text key — real KJV1769 Psalm 80:4 shape (both a husk and a duplicate anchor at once)", () => {
    const note = { type: "trn", content: ["Heb. ", { text: "wilt thou smoke?", marks: ["i"] }] };
    const content = [
      { text: "How long wilt thou be angry", foot: note, strong: "H6225", morph: "QalPerf" },
      { text: "", foot: { ...note } },
      { text: " against the prayer", strong: "H8605" },
    ];

    const { content: result, changed } = removeDuplicateFootnoteAnchorsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { text: "How long wilt thou be angry", foot: note, strong: "H6225", morph: "QalPerf" },
      { text: " against the prayer", strong: "H8605" },
    ]);
  });

  it("should not delete a byte-identical foot when the later node still renders real text — real ASV1901 Genesis 3:14 shape (183-of-203 case)", () => {
    const note = { type: "trn", content: ["Or, ", { text: "from among", marks: ["i"] }] };
    const content = [
      { text: "cursed art thou", foot: note },
      { text: " above all cattle, and", foot: { ...note } },
      " above every beast of the field",
    ];

    const result = removeDuplicateFootnoteAnchorsInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should not delete two adjacent textless anchors whose own foot values genuinely differ — real shape from the retired BYZ2018's Revelation 7:5", () => {
    const content = [
      {
        text: " ἐσφραγισμέναι·",
        script: "G",
        foot: { type: "var", content: ["B ", { text: "ἐσφραγισμέναι", script: "G" }, " ⇒ ", { text: "ἐσφραγισμένοι", script: "G" }] },
        strong: "G4972",
        morph: "V-RPP-NPF",
      },
      {
        foot: { type: "var", content: ["N ", { text: "ἐσφραγισμέναι", script: "G" }, " ⇒ ", { text: "ἐσφραγισμένοι", script: "G" }] },
      },
    ];

    const result = removeDuplicateFootnoteAnchorsInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should delete a duplicate anchor nested inside footnote content", () => {
    const note = { type: "var", content: "inner note" };
    const content = {
      text: "word",
      foot: {
        type: "trn",
        content: [
          { text: "inner", foot: note },
          { foot: { ...note } },
        ],
      },
    };

    const { content: result, changed } = removeDuplicateFootnoteAnchorsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      text: "word",
      foot: {
        type: "trn",
        content: [{ text: "inner", foot: note }],
      },
    });
  });

  it("should leave a clean tree unchanged, returning the original reference", () => {
    const content = [
      { text: "word", foot: { type: "trn", content: "note" } },
      " more text",
    ];

    const result = removeDuplicateFootnoteAnchorsInContent(content as never);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should be idempotent — removing duplicates from an already-cleaned tree reports no further change", () => {
    const note = { type: "var", content: ["B ", { text: "εἵνεκεν", script: "G" }, " ⇒ ", { text: "ἕνεκεν", script: "G" }] };
    const content = [
      { text: " εἵνεκεν", script: "G", foot: note, strong: "G1752", morph: "PREP" },
      { foot: { ...note } },
      { foot: { ...note } },
    ];

    const first = removeDuplicateFootnoteAnchorsInContent(content as never);
    const second = removeDuplicateFootnoteAnchorsInContent(first.content);

    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });
});
