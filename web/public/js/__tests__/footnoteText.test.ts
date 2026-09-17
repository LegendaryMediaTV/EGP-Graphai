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
      getFootnoteText({ bibleLink: "Proverbs 1:7", content: "Prov 1:7" }),
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
      "Job 28:28; Prov 1:7; 9:10; Eccl 12:13",
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

  it("resolves an abbr node to its registry entry's display name", () => {
    const registry = new Map([
      [
        "NA27",
        { _id: "NA27", name: [{ text: "NA" }, { text: "27", marks: ["sup"] }] },
      ],
    ]);
    expect(
      getFootnoteText(
        [{ abbr: "NA27" }, " ", { text: "αλλα" }] as any,
        registry as any,
      ),
    ).toBe("NA27 αλλα");
  });

  it("falls back to the bare id when the registry has no such entry, so the note still reads", () => {
    expect(getFootnoteText({ abbr: "NA27" } as any, new Map() as any)).toBe(
      "NA27",
    );
  });

  it("falls back to the bare id when no registry is supplied at all", () => {
    expect(getFootnoteText({ abbr: "OM" } as any)).toBe("OM");
  });

  it("reads a node's transliteration in place of its text when asked", () => {
    expect(
      getFootnoteText(
        { text: "Δαυίδ", script: "G", transliteration: "Dauíd" } as any,
        undefined,
        true,
      ),
    ).toBe("Dauíd");
  });

  it("reads the node's own text when not asked, even where a transliteration exists", () => {
    expect(
      getFootnoteText({
        text: "Δαυίδ",
        script: "G",
        transliteration: "Dauíd",
      } as any),
    ).toBe("Δαυίδ");
  });

  it("falls back to a node's text when it carries no transliteration, so a tooltip never comes back emptier than its text", () => {
    expect(
      getFootnoteText({ text: "Δαυίδ", script: "G" } as any, undefined, true),
    ).toBe("Δαυίδ");
  });

  it("romanizes through arrays, bibleLink overrides and abbr names alike (Matthew 1:1's real BYZ2026 var footnote)", () => {
    const registry = new Map([
      ["HF", { _id: "HF", name: "HF" }],
      ["TR", { _id: "TR", name: "TR" }],
    ]);
    const varContent = [
      { text: "Δαυίδ", script: "G", transliteration: "Dauíd" },
      " ¦ ",
      { abbr: "HF" },
      " ",
      { abbr: "TR" },
      { text: " Δαβίδ", script: "G", transliteration: " Dabíd" },
    ];
    expect(getFootnoteText(varContent as any, registry as any, true)).toBe(
      "Dauíd ¦ HF TR Dabíd",
    );
  });
});
