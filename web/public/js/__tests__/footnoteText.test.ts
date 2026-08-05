import { describe, it, expect } from "vitest";
import { getFootnoteText } from "../footnoteText";

describe("getFootnoteText", () => {
  it("returns a plain string unchanged", () => {
    expect(getFootnoteText("hello")).toBe("hello");
  });

  it("falls back to the raw bibleLink reference when there is no display override", () => {
    expect(getFootnoteText({ bibleLink: "Job 28:28" })).toBe("Job 28:28");
  });

  it("prefers the display override in content.content over the raw bibleLink", () => {
    expect(
      getFootnoteText({ bibleLink: "Proverbs 1:7", content: "Prov 1:7" })
    ).toBe("Prov 1:7");
  });

  it("falls back to a plain-text footnote node's .text", () => {
    expect(getFootnoteText({ text: "some note" })).toBe("some note");
  });

  it("joins Psalm 111:10's real LSB xrf footnote content (the reported bug case)", () => {
    const xrfContent = [
      { bibleLink: "Job 28:28" },
      "; ",
      { bibleLink: "Proverbs 1:7", content: "Prov 1:7" },
      "; ",
      { bibleLink: "Proverbs 9:10", content: "9:10" },
      "; ",
      { bibleLink: "Ecclesiastes 12:13", content: "Eccl 12:13" },
    ];
    expect(getFootnoteText(xrfContent)).toBe(
      "Job 28:28; Prov 1:7; 9:10; Eccl 12:13"
    );
  });

  it("joins Matthew 5:3's real WEBUS2020 xrf footnote content (this repo's own reproduction case)", () => {
    const xrfContent = [
      { bibleLink: "Isaiah 57:15" },
      "; ",
      { bibleLink: "Isaiah 66:2", content: "66:2" },
    ];
    expect(getFootnoteText(xrfContent)).toBe("Isaiah 57:15; 66:2");
  });

  it("returns an empty string for null/undefined content", () => {
    expect(getFootnoteText(undefined)).toBe("");
    expect(getFootnoteText(null)).toBe("");
  });
});
