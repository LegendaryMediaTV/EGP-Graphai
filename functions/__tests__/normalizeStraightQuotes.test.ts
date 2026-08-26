import { describe, expect, it } from "vitest";
import { normalizeQuoteText, normalizeQuotesInContent } from "../normalizeStraightQuotes";
import Content from "../../types/Content";

describe("normalizeQuoteText — basic direction", () => {
  it("should open a double quote at the start of a string", () => {
    expect(normalizeQuoteText('"Behold').value).toBe("“Behold");
  });

  it("should close a double quote immediately after a letter", () => {
    expect(normalizeQuoteText('said."').value).toBe("said.”");
  });

  it("should open a quote right after whitespace", () => {
    expect(normalizeQuoteText('he said, "come"').value).toBe("he said, “come”");
  });

  it("should open a quote right after an opening bracket", () => {
    expect(normalizeQuoteText('("hello")').value).toBe("(“hello”)");
  });
});

describe("normalizeQuoteText — apostrophes fall out of the closing rule for free", () => {
  it("should render a mid-word apostrophe as the closing glyph, not the opening one", () => {
    expect(normalizeQuoteText("don't").value).toBe("don’t");
  });

  it("should render a possessive apostrophe after a word ending in s as the closing glyph", () => {
    expect(normalizeQuoteText("the servant's word").value).toBe("the servant’s word");
    expect(normalizeQuoteText("the witnesses' report").value).toBe("the witnesses’ report");
  });
});

describe("normalizeQuoteText — adjacent quote characters propagate direction", () => {
  it("should resolve a run of three openers, then three closers, exactly like real typography would nest them", () => {
    // The example this rule exists for: the outer double quote opens, a
    // single quote opens immediately inside it with nothing between them,
    // and a second double quote opens immediately inside that — three
    // levels of nesting beginning at once. Each closes normally once real
    // text intervenes, since a closer is never adjacent to another quote
    // character in this input.
    const { value, changes } = normalizeQuoteText(`"'"asdf" is' whatever"`);

    expect(value).toBe("“‘“asdf” is’ whatever”");
    expect(changes).toBe(6);
  });

  it("should propagate a closing direction across adjacent quote characters, not just an opening one", () => {
    const { value } = normalizeQuoteText(`he said "'yes'"`);

    expect(value).toBe("he said “‘yes’”");
  });
});

describe("normalizeQuoteText — what it does not attempt", () => {
  it("should open, not close, a leading elision — the one known gap, not worth guarding against for this corpus", () => {
    // '80s reads identically to a nested quote opening at the start of a
    // word; this corpus's translations don't use the elision idiom, so the
    // wrong call here has no real target to land on.
    expect(normalizeQuoteText("'80s").value).toBe("‘80s");
  });
});

describe("normalizeQuoteText — idempotency and no-op", () => {
  it("should report changes: 0 and return the input unchanged when there is no straight quote", () => {
    const text = "the servant’s word: “come,” he said ‘now’";
    const { value, changes } = normalizeQuoteText(text);

    expect(value).toBe(text);
    expect(changes).toBe(0);
  });

  it("should change nothing when run on its own already-normalized output", () => {
    const first = normalizeQuoteText(`"'"asdf" is' whatever"`);
    const second = normalizeQuoteText(first.value);

    expect(second.changes).toBe(0);
    expect(second.value).toBe(first.value);
  });
});

describe("normalizeQuotesInContent", () => {
  it("should normalize a straight quote in a node's own text", () => {
    expect(normalizeQuotesInContent([{ text: "the servant's word", marks: ["i"] }])).toEqual({
      content: [{ text: "the servant’s word", marks: ["i"] }],
      changed: true,
    });
  });

  it("should reach a nested foot.content node — proving the tree-walking half is wired to the rewriter", () => {
    expect(
      normalizeQuotesInContent([
        { text: "word", foot: { type: "trn", content: [{ text: "the servant's word" }] } },
      ]),
    ).toEqual({
      content: [
        { text: "word", foot: { type: "trn", content: [{ text: "the servant’s word" }] } },
      ],
      changed: true,
    });
  });

  it("should return the content unchanged and changed: false when nothing needs normalizing", () => {
    const fixture: Content = [{ text: "In the beginning" }, "and God said"];
    expect(normalizeQuotesInContent(fixture)).toEqual({
      content: fixture,
      changed: false,
    });
  });
});
