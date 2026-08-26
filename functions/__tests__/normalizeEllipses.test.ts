import { describe, expect, it } from "vitest";
import {
  hasEllipsisIndicator,
  normalizeEllipsesInContent,
  normalizeEllipsisText,
} from "../normalizeEllipses";
import Content from "../../types/Content";

describe("normalizeEllipsisText — real WEBUS2020/ASV1901 fixtures", () => {
  it("should convert three ASCII periods to U+2026 — WEBUS2020 2ES 9:13's own footnote, the reported bug", () => {
    const { value, changes } = normalizeEllipsisText("and whose...");

    expect(value).toBe("and whose…");
    expect(changes).toBe(1);
  });

  it("should convert three ASCII periods with no surrounding space — real JDT 2:10 WEBUS2020 shape", () => {
    const { value, changes } = normalizeEllipsisText(
      "they will yield...and you shall reserve.",
    );

    expect(value).toBe("they will yield…and you shall reserve.");
    expect(changes).toBe(1);
  });

  it("should leave the following space untouched — real PMA 1:8 WEBUS2020 shape", () => {
    const { value, changes } = normalizeEllipsisText("You... saved.");

    expect(value).toBe("You… saved.");
    expect(changes).toBe(1);
  });

  it("should leave a trailing space after the run untouched — real PSA 68:7 WEBUS2020 bare-string shape", () => {
    const { value, changes } = normalizeEllipsisText(
      "when you marched through the wilderness... ",
    );

    expect(value).toBe("when you marched through the wilderness… ");
    expect(changes).toBe(1);
  });

  it("should collapse a spaced three-period run, leaving the single spaces on either side alone", () => {
    const { value, changes } = normalizeEllipsisText(
      "I was restored . . . and he was hanged",
    );

    expect(value).toBe("I was restored … and he was hanged");
    expect(changes).toBe(1);
  });

  it("should turn the one four-spaced-period run into an ellipsis directly followed by the sentence-ending period — real ASV1901 43-JHN shape", () => {
    const { value, changes } = normalizeEllipsisText(
      "in me. But that etc. . . . I do, arise etc.",
    );

    expect(value).toBe("in me. But that etc…. I do, arise etc.");
    expect(changes).toBe(1);
  });
});

describe("normalizeEllipsisText — idempotency", () => {
  it("should report changes: 0 and return the input unchanged on already-normalized text — real YLT1898 MAT shape", () => {
    const text = "be asking…be seeking (or desiring), be knocking…opened up;";
    const { value, changes } = normalizeEllipsisText(text);

    expect(value).toBe(text);
    expect(changes).toBe(0);
  });

  it("should change nothing when run on its own already-normalized output", () => {
    const first = normalizeEllipsisText("and whose...");
    const second = normalizeEllipsisText(first.value);

    expect(second.changes).toBe(0);
    expect(second.value).toBe(first.value);
  });
});

describe("normalizeEllipsisText — what the rewriter must leave alone", () => {
  it("should leave a single period untouched — real, correctly-normalized WEBUS2020 2ES 9:13 sibling", () => {
    const { value, changes } = normalizeEllipsisText("and when.");

    expect(value).toBe("and when.");
    expect(changes).toBe(0);
  });

  it("should leave an abbreviation followed by a space and a capital untouched", () => {
    const { value, changes } = normalizeEllipsisText("etc. I do");

    expect(value).toBe("etc. I do");
    expect(changes).toBe(0);
  });

  it("should leave a decimal or verse number untouched — real KJV1769 marginal-citation shape", () => {
    expect(normalizeEllipsisText("1.5").changes).toBe(0);
    expect(normalizeEllipsisText("7.45").changes).toBe(0);
  });
});

describe("normalizeEllipsisText / hasEllipsisIndicator — the two-period split", () => {
  // The two-signal design is deliberate: the rewriter refuses a two-period
  // run, the detector still flags it. If a later change makes both agree
  // here, one of them broke.
  it("should never rewrite a two-period run, but hasEllipsisIndicator must still flag it — real YLT1898 shape", () => {
    const text = "fully numbered..and obtained";

    const rewritten = normalizeEllipsisText(text);
    expect(rewritten.changes).toBe(0);
    expect(rewritten.value).toBe(text);

    expect(hasEllipsisIndicator(text)).toBe(true);
  });
});

describe("hasEllipsisIndicator", () => {
  it("should return true for every shape the rewriter does convert", () => {
    expect(hasEllipsisIndicator("and whose...")).toBe(true);
    expect(hasEllipsisIndicator("I was restored . . . and he was hanged")).toBe(true);
    expect(
      hasEllipsisIndicator("in me. But that etc. . . . I do, arise etc."),
    ).toBe(true);
  });

  it("should return false for every string the rewriter leaves alone", () => {
    expect(hasEllipsisIndicator("and when.")).toBe(false);
    expect(hasEllipsisIndicator("etc. I do")).toBe(false);
    expect(hasEllipsisIndicator("1.5")).toBe(false);
    expect(hasEllipsisIndicator("7.45")).toBe(false);
  });

  it("should return false for already-normalized text", () => {
    expect(
      hasEllipsisIndicator(
        "be asking…be seeking (or desiring), be knocking…opened up;",
      ),
    ).toBe(false);
  });
});

describe("normalizeEllipsesInContent", () => {
  it("should normalize the reported bug shape in a node's own text", () => {
    expect(normalizeEllipsesInContent([{ text: "and whose...", marks: ["i"] }])).toEqual({
      content: [{ text: "and whose…", marks: ["i"] }],
      changed: true,
    });
  });

  it("should reach a nested foot.content node — proving the tree-walking half is wired to the rewriter", () => {
    expect(
      normalizeEllipsesInContent([
        { text: "word", foot: { type: "trn", content: [{ text: "and whose...", marks: ["i"] }] } },
      ]),
    ).toEqual({
      content: [
        { text: "word", foot: { type: "trn", content: [{ text: "and whose…", marks: ["i"] }] } },
      ],
      changed: true,
    });
  });

  it("should leave a two-period node untouched — the shipped auto-fix's own standing refusal", () => {
    const fixture: Content = [{ text: "fully numbered..and obtained", marks: ["i"] }];
    expect(normalizeEllipsesInContent(fixture)).toEqual({
      content: fixture,
      changed: false,
    });
  });

  it("should return the content unchanged and changed: false when nothing needs normalizing", () => {
    const fixture: Content = [{ text: "In the beginning" }, "and God said"];
    expect(normalizeEllipsesInContent(fixture)).toEqual({
      content: fixture,
      changed: false,
    });
  });
});
