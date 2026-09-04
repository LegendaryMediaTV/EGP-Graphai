import { describe, expect, it } from "vitest";
import {
  findBibleLinkDisplayProse,
  formatBibleLinkDisplayProseFinding,
  hoistBibleLinkDisplayProseInContent,
} from "../fixBibleLinkDisplayProse";

/**
 * Every fixture below is a real, verbatim shape from the corpus, cited by
 * version and verse — the convention `references.test.ts` already
 * established. The affix tables this module carries were derived from a
 * sweep of every word appearing in any `bibleLink` display override
 * corpus-wide, so a test that invented its own prose would be testing a
 * shape nothing produces.
 */

/** WEBUS2020's real registry ids, the version whose one siglon-bearing target this rewrite touches. */
const WEB_REGISTRY: ReadonlySet<string> = new Set(["DSS", "FH", "LXX", "MT", "NU", "RP", "TR"]);

describe("hoistBibleLinkDisplayProseInContent — a lead-in word ahead of a reference", () => {
  it('should move "See " out of a whole-footnote cross-reference and drop the override the lead-in was the only reason for (WEBUS2020 Matthew 14:25)', () => {
    const result = hoistBibleLinkDisplayProseInContent({ bibleLink: "Job 9:8", content: "See Job 9:8" });
    expect(result).toEqual({ content: ["See ", { bibleLink: "Job 9:8" }], changed: true });
  });

  it('should keep the override a normalized book name still needs, now covering the reference alone (WEBUS2020 Luke 8:24, "See Psalms 107:29" targeting the singular "Psalm")', () => {
    const result = hoistBibleLinkDisplayProseInContent({ bibleLink: "Psalm 107:29", content: "See Psalms 107:29" });
    expect(result).toEqual({ content: ["See ", { bibleLink: "Psalm 107:29", content: "Psalms 107:29" }], changed: true });
  });

  it('should move "Compare " the same way (WEBUS2020 1 Maccabees 5:2)', () => {
    const result = hoistBibleLinkDisplayProseInContent({ bibleLink: "Numbers 31:6", content: "Compare Numbers 31:6" });
    expect(result).toEqual({ content: ["Compare ", { bibleLink: "Numbers 31:6" }], changed: true });
  });

  it('should move "end of " onto the prose already beside the link rather than pushing a second string (ASV1901 Romans 16:25, "Compare the end of chapter 14")', () => {
    const result = hoistBibleLinkDisplayProseInContent([
      "Compare the ",
      { bibleLink: "Romans 14:23", content: "end of chapter 14" },
      ".",
    ]);
    expect(result).toEqual({
      content: ["Compare the end of ", { bibleLink: "Romans 14:23", content: "chapter 14" }, "."],
      changed: true,
    });
  });

  it("should rejoin a swallowed open paren to the sentence it was taken from, so the two halves of the pair sit on the same side of the link (AMP1987 2 Samuel 12:11)", () => {
    const result = hoistBibleLinkDisplayProseInContent([
      "his consequent murder by his brother Absalom ",
      { bibleLink: "2 Samuel 13:28, 29", content: "(13:28, 29" },
      "); Absalom’s escape",
    ]);
    expect(result).toEqual({
      content: [
        "his consequent murder by his brother Absalom (",
        { bibleLink: "2 Samuel 13:28, 29", content: "13:28, 29" },
        "); Absalom’s escape",
      ],
      changed: true,
    });
  });
});

describe("hoistBibleLinkDisplayProseInContent — a locator or edition note after a reference", () => {
  it('should move ESV\'s " above" out, leaving the verse number as the linked text (ESV2025 Genesis 5:24, "22 above")', () => {
    const result = hoistBibleLinkDisplayProseInContent({ bibleLink: "Genesis 5:22", content: "22 above" });
    expect(result).toEqual({ content: [{ bibleLink: "Genesis 5:22", content: "22" }, " above"], changed: true });
  });

  it('should move a parenthesized language note out, "Heb." here being the language and not the book (ESV2025 Genesis 31:53, "Neh. 5:5 (Heb.)")', () => {
    const result = hoistBibleLinkDisplayProseInContent({ bibleLink: "Nehemiah 5:5", content: "Neh. 5:5 (Heb.)" });
    expect(result).toEqual({
      content: [{ bibleLink: "Nehemiah 5:5", content: "Neh. 5:5" }, " (Heb.)"],
      changed: true,
    });
  });

  it('should take a tradition siglon off the target as well as out of the link, since "Deuteronomy 32:43 LXX" names no verse in any edition (WEBUS2020 Hebrews 1:6)', () => {
    const result = hoistBibleLinkDisplayProseInContent({ bibleLink: "Deuteronomy 32:43 LXX" }, WEB_REGISTRY);
    expect(result).toEqual({
      content: [{ bibleLink: "Deuteronomy 32:43" }, " ", { abbr: "LXX" }],
      changed: true,
    });
  });

  it("should write a hoisted siglon as plain text when the version's registry does not define it, since an unresolved id fails validate's own abbreviation audit", () => {
    const result = hoistBibleLinkDisplayProseInContent({ bibleLink: "Deuteronomy 32:43 LXX" }, new Set(["MT"]));
    expect(result).toEqual({ content: [{ bibleLink: "Deuteronomy 32:43" }, " LXX"], changed: true });
  });

  it("should leave a string that follows a hoisted abbr node as its own node, having no text to merge into", () => {
    const result = hoistBibleLinkDisplayProseInContent([{ bibleLink: "Deuteronomy 32:43 LXX" }, "."], WEB_REGISTRY);
    expect(result).toEqual({
      content: [{ bibleLink: "Deuteronomy 32:43" }, " ", { abbr: "LXX" }, "."],
      changed: true,
    });
  });

  it("should merge trailing prose into the string already following the link", () => {
    const result = hoistBibleLinkDisplayProseInContent([{ bibleLink: "Genesis 5:22", content: "22 above" }, "."]);
    expect(result).toEqual({ content: [{ bibleLink: "Genesis 5:22", content: "22" }, " above."], changed: true });
  });
});

/**
 * The line between prose about a reference and the reference as a version
 * writes it. Everything below names *which* verse, so it is the reference's
 * own tail: trimming it would leave a display that no longer says what it
 * links to.
 */
describe("hoistBibleLinkDisplayProseInContent — a version's own citation style is left exactly as it is", () => {
  it("should leave YLT's original display text against its corrected target untouched (YLT1898 Matthew 1:1)", () => {
    const content = { bibleLink: "Matthew 1:1–17", content: "v. 1–17" };
    expect(hoistBibleLinkDisplayProseInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a Psalm superscription's own \"title\" specifier alone (ESV2025 Psalm 46, CSB2017 Psalm 60, LSB2021 Psalm 59)", () => {
    for (const content of [
      { bibleLink: "Psalm 46:1", content: "Ps. 46, title" },
      { bibleLink: "Psalm 60:1", content: "Ps 60 title" },
      { bibleLink: "Psalm 59:1", content: "Ps 59: title" },
    ]) {
      expect(hoistBibleLinkDisplayProseInContent(content)).toEqual({ content, changed: false });
    }
  });

  it('should leave a verse-part letter or "ff" suffix in the display, where it belongs (NET2019 Isaiah 49:1, LSB2021 Leviticus 14:2)', () => {
    for (const content of [
      { bibleLink: "Isaiah 49:1–9", content: "49:1–9a" },
      { bibleLink: "Leviticus 14:2–57", content: "14:2ff" },
    ]) {
      expect(hoistBibleLinkDisplayProseInContent(content)).toEqual({ content, changed: false });
    }
  });

  it('should leave a book name that merely begins with a table word alone — "Compare" and "See " match a word plus a space, never a bare prefix', () => {
    const content = { bibleLink: "Song of Songs 4:15", content: "Song of Solomon 4:15" };
    expect(hoistBibleLinkDisplayProseInContent(content)).toEqual({ content, changed: false });
  });

  it("should return the very same reference when nothing anywhere in a whole footnote changes, so a caller can skip the write", () => {
    const content = ["Some ancient authorities omit ", { bibleLink: "Romans 16:25–27", content: "verses 25–27" }, "."];
    expect(hoistBibleLinkDisplayProseInContent(content).content).toBe(content);
  });
});

describe("hoistBibleLinkDisplayProseInContent — recursion and idempotence", () => {
  it("should reach a link nested inside a footnote body on a marked node", () => {
    const result = hoistBibleLinkDisplayProseInContent({
      text: "walking on the sea.",
      foot: { type: "xrf", content: { bibleLink: "Job 9:8", content: "See Job 9:8" } },
    });
    expect(result).toEqual({
      content: {
        text: "walking on the sea.",
        foot: { type: "xrf", content: ["See ", { bibleLink: "Job 9:8" }] },
      },
      changed: true,
    });
  });

  it("should reach a link inside a heading and inside a nested-content wrapper", () => {
    const result = hoistBibleLinkDisplayProseInContent([
      { heading: { bibleLink: "Job 9:8", content: "See Job 9:8" } },
      { content: [{ bibleLink: "Genesis 5:22", content: "22 above" }], marks: ["i"] },
    ]);
    expect(result).toEqual({
      content: [
        { heading: ["See ", { bibleLink: "Job 9:8" }] },
        { content: [{ bibleLink: "Genesis 5:22", content: "22" }, " above"], marks: ["i"] },
      ],
      changed: true,
    });
  });

  it("should be a fixed point of itself — a second pass over its own output changes nothing", () => {
    const once = hoistBibleLinkDisplayProseInContent([
      "his brother Absalom ",
      { bibleLink: "2 Samuel 13:28, 29", content: "(13:28, 29" },
      "); and ",
      { bibleLink: "Job 9:8", content: "See Job 9:8" },
      "; and ",
      { bibleLink: "Deuteronomy 32:43 LXX" },
    ], WEB_REGISTRY);
    expect(once.changed).toBe(true);
    expect(hoistBibleLinkDisplayProseInContent(once.content, WEB_REGISTRY)).toEqual({ content: once.content, changed: false });
  });
});

describe("findBibleLinkDisplayProse — reports what the rewrite declines", () => {
  it("should report a marked display override carrying prose, the one shape the rewrite leaves alone", () => {
    const { findings, scanned } = findBibleLinkDisplayProse([
      {
        book: "MAT",
        chapter: 14,
        verse: 25,
        content: { bibleLink: "Job 9:8", content: { text: "See Job 9:8", marks: ["i"] } },
      },
    ]);
    expect(findings).toEqual([
      { book: "MAT", chapter: 14, verse: 25, target: "Job 9:8", display: "See Job 9:8" },
    ]);
    expect(scanned).toBe(1);
    expect(formatBibleLinkDisplayProseFinding(findings[0])).toBe('   MAT 14:25 — "See Job 9:8" links to "Job 9:8"');
  });

  it("should report a siglon left in a target even when no display override shows it", () => {
    const { findings } = findBibleLinkDisplayProse([
      { book: "HEB", chapter: 1, verse: 6, content: { bibleLink: "Deuteronomy 32:43 LXX" } },
    ]);
    expect(findings).toEqual([
      { book: "HEB", chapter: 1, verse: 6, target: "Deuteronomy 32:43 LXX", display: "Deuteronomy 32:43 LXX" },
    ]);
  });

  it("should be silent on content the rewrite has already settled, still counting every link it walked past", () => {
    expect(
      findBibleLinkDisplayProse([
        { book: "MAT", chapter: 14, verse: 25, content: ["See ", { bibleLink: "Job 9:8" }] },
        { book: "GEN", chapter: 5, verse: 24, content: [{ bibleLink: "Genesis 5:22", content: "22" }, " above"] },
        { book: "MAT", chapter: 1, verse: 1, content: { bibleLink: "Matthew 1:1–17", content: "v. 1–17" } },
      ]),
    ).toEqual({ findings: [], scanned: 3 });
  });
});
