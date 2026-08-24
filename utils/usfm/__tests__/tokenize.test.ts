import { describe, expect, it } from "vitest";
import { tokenize } from "../tokenize";
import { readFixture } from "./fixtures";

/**
 * Tokenizer tests, fixtures drawn verbatim from the real USFM source
 * (`imports/guide.md` §6 — never hand-written markup). Every expected token
 * below was read directly off the fixture file before being written here.
 */

describe("tokenize — Genesis 1:1 (verse/chapter markers, a footnote aside carrying a nested \\+wh Hebrew span)", () => {
  const tokens = tokenize(readFixture("genesis-1-2.usfm"));

  it("should emit a numbered marker token for \\v 1 carrying the verse number as its value", () => {
    const verseOne = tokens.find(
      (token) => token.type === "marker" && token.name === "v" && token.value === "1",
    );
    expect(verseOne).toEqual({ type: "marker", name: "v", value: "1" });
  });

  it("should emit a numbered marker token for \\c 2 at the chapter boundary", () => {
    const chapterTwo = tokens.find(
      (token) => token.type === "marker" && token.name === "c" && token.value === "2",
    );
    expect(chapterTwo).toEqual({ type: "marker", name: "c", value: "2" });
  });

  it('should open and close \\w with its own strong attribute for the first Strong\'s-tagged word ("In", H8064)', () => {
    const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "w");
    expect(tokens[openIndex]).toEqual({ type: "open", name: "w", nested: false });
    expect(tokens[openIndex + 1]).toEqual({ type: "text", text: "In" });
    expect(tokens[openIndex + 2]).toEqual({
      type: "close",
      name: "w",
      nested: false,
      attributes: { strong: "H8064" },
    });
  });

  it("should tokenize the footnote following \"God\" as a paired \\f span containing a nested \\+wh Hebrew span", () => {
    const openF = tokens.findIndex((token) => token.type === "open" && token.name === "f");
    expect(tokens[openF]).toEqual({ type: "open", name: "f", nested: false });

    const openWh = tokens.findIndex(
      (token, index) => index > openF && token.type === "open" && token.name === "wh",
    );
    expect(tokens[openWh]).toEqual({ type: "open", name: "wh", nested: true });
    expect(tokens[openWh + 1]).toEqual({ type: "text", text: "אֱלֹהִ֑ים" });
    expect(tokens[openWh + 2]).toEqual({ type: "close", name: "wh", nested: true });

    const closeF = tokens.findIndex(
      (token, index) => index > openWh && token.type === "close" && token.name === "f",
    );
    expect(closeF).toBeGreaterThan(openWh);
  });

  it("should preserve the real inter-word space between two Strong's-tagged words as its own text token, never stripped as marker syntax", () => {
    const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "w");
    // tokens[openIndex]=open "In", +1 text "In", +2 close "In" — the very
    // next token is the real space before "the", not marker delimiter noise.
    expect(tokens[openIndex + 3]).toEqual({ type: "text", text: " " });
  });
});

describe("tokenize — Numbers 21:14 (\\+w nested inside \\bk, the same marker family as bare \\w)", () => {
  const tokens = tokenize(readFixture("numbers-21-14.usfm"));

  it("should carry the identical shape for \\w and \\+w — same name, same attributes shape, differing only in nested", () => {
    const plainW = tokens.find(
      (token) => token.type === "close" && token.name === "w" && token.nested === false,
    );
    const nestedW = tokens.find(
      (token) => token.type === "close" && token.name === "w" && token.nested === true,
    );

    expect(plainW).toEqual({ type: "close", name: "w", nested: false, attributes: { strong: "H3651" } });
    expect(nestedW).toEqual({ type: "close", name: "w", nested: true, attributes: { strong: "H5921" } });
  });

  it("should open and close \\bk around the nested Strong's-tagged words, with no attributes of its own", () => {
    const openBk = tokens.findIndex((token) => token.type === "open" && token.name === "bk");
    const closeBk = tokens.findIndex((token) => token.type === "close" && token.name === "bk");

    expect(tokens[openBk]).toEqual({ type: "open", name: "bk", nested: false });
    expect(tokens[closeBk]).toEqual({ type: "close", name: "bk", nested: false });
    expect(closeBk).toBeGreaterThan(openBk);
  });

  it("should throw on an unregistered closing marker", () => {
    expect(() => tokenize("\\zz text\\zz*")).toThrow(/not a registered paired marker/);
  });

  it("should throw when \\v carries no numeric argument", () => {
    expect(() => tokenize("\\v text with no number")).toThrow(/no numeric argument/);
  });
});

/**
 * Phase 1 of the USFM-importer-generality-test objective: a real, measured
 * gap, not a hypothetical one. ASV1901's own Genesis 1:11 ("`...seed,
 * \add and\add* fruit-trees...`") is the first `\add` occurrence in canon
 * order, and `\add`/`\add*` (USFM's own standard "translator-supplied
 * words" character marker, 4,316 pairs corpus-wide) is not yet a member of
 * `PAIRED_MARKER_NAMES`. The test below states the correct, desired
 * behavior directly — `\add`/`\add*` tokenizing as an ordinary paired
 * marker, the identical shape `\w`/`\w*` already gets — which is RED today:
 * calling `tokenize()` on this real fixture throws before ever returning a
 * token list, since "add" is not yet a registered pair (confirmed
 * separately, directly: `Unexpected closing marker \add* — \add is not a
 * registered paired marker.`). The fix (Phase 3.1) is one new entry in that
 * existing `Set`; this test only proves the gap is real before that fix
 * exists.
 */
describe("tokenize — ASV1901's real \\add (translator-supplied words), a construct WEB's own corpus never carries", () => {
  it("should tokenize \\add/\\add* as an ordinary paired marker around ASV1901 Genesis 1:11's own \"and\", the same open/text/close shape \\w already gets", () => {
    const tokens = tokenize(readFixture("asv1901-genesis-1-11.usfm"));
    const openAdd = tokens.findIndex((token) => token.type === "open" && token.name === "add");
    expect(tokens[openAdd]).toEqual({ type: "open", name: "add", nested: false });
    expect(tokens[openAdd + 1]).toEqual({ type: "text", text: "and" });
    expect(tokens[openAdd + 2]).toEqual({ type: "close", name: "add", nested: false });
  });
});
