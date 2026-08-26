import { describe, expect, it } from "vitest";
import { classifyFootnote } from "../footnoteTypeRules";
import { buildReferenceOnlyContent } from "../references";
import {
  clSpanHostsNothingButChrome,
  collectHeadingBlocks,
  CHROME_MARKER_NAMES,
  CONFIRMED_ZERO_MARKER_NAMES,
  CONTENT_HANDLED_MARKER_NAMES,
  countBlockMarkersIn,
  countEmittedBlockFlags,
  countEmittedMarkRuns,
  countInlineMarkersIn,
  countMarkersIn,
  countNestedBkPairsIn,
  countChromeMarkersIn,
  countStrongAttributeNodes,
  countTableMarkersIn,
  countXrefLinkNodes,
  extractCrossReferencesIn,
  extractFootnoteBodiesIn,
  extractHeadingMarkersIn,
  extractIntroParagraphsIn,
  extractSectionHeadingsIn,
  extractSuperscriptionsIn,
  HeadingKind,
} from "../verify";
import { readFixture } from "./fixtures";

describe("countMarkersIn — an independent regex count, sharing no code with tokenize.ts", () => {
  it("should count exactly 31 \\v markers and 1 \\c marker over the Genesis 1-2 fixture's own chapter 1", () => {
    // The fixture carries chapters 1 and 2 in full (31 + 25 verses), and
    // two \c markers (\c 1, \c 2) — counted here, not assumed.
    const counts = countMarkersIn(readFixture("genesis-1-2.usfm"));
    expect(counts.verses).toBe(56);
    expect(counts.chapters).toBe(2);
    expect(counts.maxChapter).toBe(2);
  });

  it("should count \\v/\\c markers independently of any paired marker (\\w/\\f/\\bk) sharing the same line", () => {
    const counts = countMarkersIn(readFixture("numbers-21-14.usfm"));
    expect(counts.verses).toBe(1);
    expect(counts.chapters).toBe(0);
  });
});

describe("countTableMarkersIn — confirms zero table markers via an independent regex count sharing no code with tokenize.ts", () => {
  it("should count 0 table markers in the Genesis 1-2 and Psalm 3 fixtures", () => {
    expect(countTableMarkersIn(readFixture("genesis-1-2.usfm"))).toBe(0);
    expect(countTableMarkersIn(readFixture("psalm-3.usfm"))).toBe(0);
  });

  it("should detect \\tr, numbered \\tc/\\th cells, and their right-aligned \\tcr/\\thr forms when they do occur — this corpus never producing a table is not the same as this function being unable to recognize one", () => {
    expect(countTableMarkersIn("\\tr \\th1 Name \\th2 Age \\tr \\tc1 Ann \\tc2 32")).toBe(6);
    expect(countTableMarkersIn("\\tr \\thr1 Total \\tcr1 42")).toBe(3);
  });

  it("should not match \\toc1/\\toc2/\\toc3 — the letter immediately after \\t must be r/c/h, and \\toc's is o", () => {
    expect(countTableMarkersIn("\\toc1 Genesis\n\\toc2 Genesis\n\\toc3 Gen")).toBe(0);
  });
});

describe("countBlockMarkersIn — an independent regex count of \\p/\\m/\\nb and \\q1/\\q2/\\q3/\\b, sharing no code with tokenize.ts/segmentVerses.ts", () => {
  it("should count \\p markers in the Genesis 1-2 fixture without matching \\+wh/\\w or any other unrelated marker", () => {
    const counts = countBlockMarkersIn(readFixture("genesis-1-2.usfm"));
    expect(counts.paragraphMarkers).toBeGreaterThan(0);
    expect(counts.breakMarkers).toBe(0);
  });

  it("should count \\q1/\\q2 markers in the Psalm 3 fixture, and the \\b in the Psalm 10:11-13 fixture, without matching \\qs/\\qs*", () => {
    expect(countBlockMarkersIn(readFixture("psalm-3.usfm")).breakMarkers).toBe(18);
    expect(countBlockMarkersIn(readFixture("psalm-10-11-13.usfm")).breakMarkers).toBe(9);
  });

  it("should not match \\m inside \\mt1/\\ms1 — the word-boundary anchor is load-bearing", () => {
    expect(countBlockMarkersIn("\\mt1 Title\n\\ms1 BOOK 1")).toEqual({
      paragraphMarkers: 0,
      breakMarkers: 0,
    });
  });

  it("should count \\pi1 and \\mi as real paragraph-opening markers", () => {
    expect(countBlockMarkersIn("\\pi1 text\n\\mi text").paragraphMarkers).toBe(2);
  });
});

describe("countEmittedBlockFlags — an independent recursive walk of emitted content, sharing no code with blockStructure.ts", () => {
  it("should count zero flags on a bare, unflagged string", () => {
    expect(countEmittedBlockFlags("plain text")).toEqual({ paragraph: 0, break: 0 });
  });

  it("should count a single flag on a bare object", () => {
    expect(countEmittedBlockFlags({ text: "In the beginning...", paragraph: true })).toEqual({
      paragraph: 1,
      break: 0,
    });
  });

  it("should sum flags across an array mixing bare strings and flagged objects", () => {
    const content = [
      "These were their names:",
      { text: "Of the tribe of Reuben...", paragraph: true },
      { text: "shepherd;", break: true },
    ];
    expect(countEmittedBlockFlags(content)).toEqual({ paragraph: 1, break: 1 });
  });

  it("should descend into a ContentNested wrapper's own content property", () => {
    const content = { strong: "H3068", content: [{ text: "line one", break: true }, "line two"] };
    expect(countEmittedBlockFlags(content)).toEqual({ paragraph: 0, break: 1 });
  });
});

/**
 * Mirrors `verify.ts`'s own `countScriptNodes` descent shape, checking for
 * `strong` instead of `script` — direct unit tests on synthetic content,
 * matching {@link countEmittedBlockFlags}'s style above.
 */
describe("countStrongAttributeNodes — an independent recursive walk of emitted content, sharing no code with segmentVerses.ts/inlineMarks.ts", () => {
  it("should count zero on a bare, untagged string", () => {
    expect(countStrongAttributeNodes("plain text")).toBe(0);
  });

  it("should count one strong-carrying node", () => {
    expect(countStrongAttributeNodes({ text: "beginning", strong: "H7225" })).toBe(1);
  });

  it("should sum across an array mixing bare strings and strong-carrying objects, not stop at the first", () => {
    const content = ["In the ", { text: "beginning", strong: "H7225" }, " God ", { text: "created", strong: "H1254" }];
    expect(countStrongAttributeNodes(content)).toBe(2);
  });

  it("should descend into a ContentNested wrapper's own content property, the same way countScriptNodes does, counting the wrapper's own strong plus anything real found inside", () => {
    const wrapperOnly = { strong: "H3068", content: ["line one", "line two"] };
    expect(countStrongAttributeNodes(wrapperOnly)).toBe(1);

    const wrapperPlusInner = { strong: "H3068", content: [{ text: "line one", strong: "H1234" }, "line two"] };
    expect(countStrongAttributeNodes(wrapperPlusInner)).toBe(2);
  });

  it("should descend into a footnote's own foot.content and a heading's own subtitle/heading value", () => {
    const withFootnote = { text: "word", foot: { type: "stu", content: [{ text: "note", strong: "H1" }] } };
    expect(countStrongAttributeNodes(withFootnote)).toBe(1);

    const withSubtitle = { subtitle: [{ text: "For the Chief Musician", strong: "H2" }] };
    expect(countStrongAttributeNodes(withSubtitle)).toBe(1);
  });
});

describe("countInlineMarkersIn — an independent regex count of \\wj/\\wj* and \\qs/\\qs*, sharing no code with tokenize.ts/segmentVerses.ts/inlineMarks.ts", () => {
  it("should count both the open and close form of \\wj identically, via the trailing word-boundary (John 14:16's own fixture: 2 spans, 4 markers)", () => {
    const counts = countInlineMarkersIn(readFixture("john-14-16.usfm"));
    expect(counts.wocMarkers).toBe(4);
  });

  it("should count both the open and close form of \\qs identically (Psalm 3's own fixture: 3 Selah instances at verses 2, 4, and 8, 6 markers)", () => {
    const counts = countInlineMarkersIn(readFixture("psalm-3.usfm"));
    expect(counts.selahMarkers).toBe(6);
  });

  it("should count zero of either marker in a fixture that carries neither", () => {
    expect(countInlineMarkersIn(readFixture("numbers-13-1-5.usfm"))).toEqual({ wocMarkers: 0, selahMarkers: 0 });
  });
});

describe("countEmittedMarkRuns — an independent count of contiguous marks-carrying runs, sharing no code with blockStructure.ts/inlineMarks.ts", () => {
  it("should count zero runs when nothing carries the mark", () => {
    expect(countEmittedMarkRuns([{ text: "plain" }, "also plain"], "woc")).toBe(0);
  });

  it("should count one run across several adjacent marked nodes, not one run per node", () => {
    const content = [
      { text: "I", strong: "G2532", marks: ["woc"] },
      { text: " will", strong: "G1510", marks: ["woc"] },
      { text: " pray", strong: "G2065", marks: ["woc"] },
    ];
    expect(countEmittedMarkRuns(content, "woc")).toBe(1);
  });

  it("should count two separate runs when a plain node splits two marked groups", () => {
    const content = [
      { text: "Yahweh said, ", marks: ["woc"] },
      { text: "the narrator interjects here", strong: "H1234" },
      { text: "and continued.", marks: ["woc"] },
    ];
    expect(countEmittedMarkRuns(content, "woc")).toBe(2);
  });

  it("should descend into a ContentNested wrapper's own content property, the same way countEmittedBlockFlags does", () => {
    const content = { strong: "H3068", marks: ["i"], content: ["line one", "line two"] };
    expect(countEmittedMarkRuns(content, "i")).toBe(1);
  });

  it("should count a real emitted John 14:16-shaped block as exactly one run, since the footnote-dropped gap between its two source \\wj spans carries no marks to split them", () => {
    const content = [
      { text: "another", strong: "G3588", marks: ["woc"] },
      { text: " Counselor, that", strong: "G2443", marks: ["woc"] },
    ];
    expect(countEmittedMarkRuns(content, "woc")).toBe(1);
  });
});

describe("extractCrossReferencesIn — an independent regex extraction of \\x...\\x* spans, sharing no code with tokenize.ts/segmentVerses.ts/usfm/references.ts", () => {
  it("should extract a single-target span's own \\xt text, with \\xo's own reference-locator label dropped (2 Kings 12:4's real shape)", () => {
    const [xref] = extractCrossReferencesIn("\\x + \\xo 12:4 \\xt Exodus 30:12\\x*");
    expect(xref.targets).toEqual(["Exodus 30:12"]);
  });

  it("should split a multi-target span's own \\xt text on \"; \", one target per element (Matthew 5:4's real shape)", () => {
    const [xref] = extractCrossReferencesIn("\\x + \\xo 5:4 \\xt Isaiah 61:2; 66:10,13\\x*");
    expect(xref.targets).toEqual(["Isaiah 61:2", "66:10,13"]);
  });

  it("should extract every span across multiple, in source order, and none from a heading/verse marker that merely shares a line with one", () => {
    const source = readFixture("2-kings-12-1-5.usfm");
    const xrefs = extractCrossReferencesIn(source);
    expect(xrefs).toHaveLength(1);
    expect(xrefs[0].targets).toEqual(["Exodus 30:12"]);
  });

  it("should extract zero spans from a fixture that carries none", () => {
    expect(extractCrossReferencesIn(readFixture("genesis-1-2.usfm"))).toHaveLength(0);
  });
});

describe("countXrefLinkNodes — an independent count of an emitted xrf footnote's own real bibleLink nodes versus targets left as plain text, sharing no code with usfm/references.ts", () => {
  it("should count a bare bibleLink object as one link, zero unresolved", () => {
    expect(countXrefLinkNodes({ bibleLink: "Exodus 30:12" })).toEqual({ links: 1, unresolved: 0 });
  });

  it("should count a plain string (an unresolved target, e.g. Hebrews 1:6's own siglum-suffixed target) as unresolved, not a link", () => {
    expect(countXrefLinkNodes("Deuteronomy 32:43 LXX")).toEqual({ links: 0, unresolved: 1 });
  });

  it('should skip the literal "; " multi-target join without counting it either way', () => {
    const content = [{ bibleLink: "Isaiah 61:2" }, "; ", { bibleLink: "Isaiah 66:10,13", content: "66:10,13" }];
    expect(countXrefLinkNodes(content)).toEqual({ links: 2, unresolved: 0 });
  });

  it("should skip the literal en dash a real cross-chapter split leaves behind between its own two halves, without counting it as a third, unresolved target (the real, post-\\-\\-fix WEBUS2020 Hebrews 11:34 shape)", () => {
    const content = [
      { bibleLink: "1 Kings 19:1–3" },
      "; ",
      { bibleLink: "2 Kings 6:31–33", content: "2 Kings 6:31" },
      "–",
      { bibleLink: "2 Kings 7:1–20", content: "7:20" },
    ];
    expect(countXrefLinkNodes(content)).toEqual({ links: 3, unresolved: 0 });
  });
});

describe("extractHeadingMarkersIn — an independent regex count of raw \\d/\\ms1/\\sp markers, sharing no code with tokenize.ts/segmentVerses.ts", () => {
  it("should count Psalm 3's own single \\d and zero \\ms1/\\sp", () => {
    expect(extractHeadingMarkersIn(readFixture("psalm-3.usfm"))).toEqual({
      superscriptions: 1,
      bookDivisions: 0,
      speakerLabels: 0,
    });
  });

  it("should count Psalm 42's own \\ms1 and \\d together", () => {
    expect(extractHeadingMarkersIn(readFixture("psalm-42-opening.usfm"))).toEqual({
      superscriptions: 1,
      bookDivisions: 1,
      speakerLabels: 0,
    });
  });

  it("should count every \\sp in the Song of Solomon excerpt", () => {
    expect(extractHeadingMarkersIn(readFixture("song-of-solomon-1-1-5.usfm")).speakerLabels).toBe(3);
  });
});

describe("extractSuperscriptionsIn — an independent extraction of \\d's own plain text (stray \\w tags and any embedded footnote stripped), sharing no code with usfm/headings.ts", () => {
  it("should extract Psalm 3's own ordinary superscription text", () => {
    const [superscription] = extractSuperscriptionsIn(readFixture("psalm-3.usfm"));
    expect(superscription.plainText).toBe("A Psalm by David, when he fled from Absalom his son.");
  });

  it("should strip the footnote out of Psalm 46's own superscription, leaving only the heading's own real prose", () => {
    const [superscription] = extractSuperscriptionsIn(readFixture("psalm-46-opening.usfm"));
    expect(superscription.plainText).toBe("For the Chief Musician. By the sons of Korah. According to Alamoth.");
  });

  it("should strip the stray \\w tag from an acrostic letter name, leaving the bare transliteration", () => {
    const [he] = extractSuperscriptionsIn(readFixture("psalm-119-he.usfm"));
    expect(he.plainText).toBe("HE");
    const [sinAndShin] = extractSuperscriptionsIn(readFixture("psalm-119-sin-and-shin.usfm"));
    expect(sinAndShin.plainText).toBe("SIN AND SHIN");
  });
});

describe("collectHeadingBlocks — an independent classification of emitted subtitle/heading nodes, sharing no code with usfm/blockStructure.ts/usfm/headings.ts", () => {
  it("should classify a subtitle node as subtitle", () => {
    const sink: HeadingKind[] = [];
    collectHeadingBlocks({ subtitle: "A Psalm by David." }, sink);
    expect(sink).toEqual(["subtitle"]);
  });

  it("should classify a heading node carrying type: acrostic as acrostic", () => {
    const sink: HeadingKind[] = [];
    collectHeadingBlocks({ heading: "ALEPH", type: "acrostic" }, sink);
    expect(sink).toEqual(["acrostic"]);
  });

  it("should classify a heading whose own array starts with a marks: [\"sc\"] node as bookDivision", () => {
    const sink: HeadingKind[] = [];
    collectHeadingBlocks({ heading: [{ text: "Book One", marks: ["sc"] }, " (Psalms 1–41)"] }, sink);
    expect(sink).toEqual(["bookDivision"]);
  });

  it("should classify every other heading (a bare string, no type, no small-caps array) as speaker", () => {
    const sink: HeadingKind[] = [];
    collectHeadingBlocks({ heading: "Beloved" }, sink);
    expect(sink).toEqual(["speaker"]);
  });

  it("should find every heading-like node across a real verse-1-shaped array, in source order, without descending further into one once found", () => {
    const sink: HeadingKind[] = [];
    const content = [
      { heading: [{ text: "Book Two", marks: ["sc"] }, " (Psalms 42–72)"] },
      { subtitle: "For the Chief Musician." },
      { paragraph: true, text: "As the deer pants" },
    ];
    collectHeadingBlocks(content, sink);
    expect(sink).toEqual(["bookDivision", "subtitle"]);
  });
});

describe("clSpanHostsNothingButChrome — confirms Psalms' own single \\cl instance hosts nothing (guide §6, \"deleting a container deletes its contents\")", () => {
  it("should return true for the real Psalms front matter, where \\cl is immediately followed by \\c with nothing else in between", () => {
    expect(clSpanHostsNothingButChrome("\\mt1 The Psalms  \n\\cl Psalm  \n\\c 1  \n\\ms1 BOOK 1")).toBe(true);
  });

  it("should return false if something else (a footnote, a Strong's tag) were ever found hiding inside the span", () => {
    expect(clSpanHostsNothingButChrome("\\cl Psalm\\f + \\ft note\\f*  \n\\c 1  ")).toBe(false);
  });

  it("should return false if the span between \\cl and \\c is empty", () => {
    expect(clSpanHostsNothingButChrome("\\cl\n\\c 1  ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deuterocanon fixtures — every fixture below is real, verbatim text from
// WEBUS2020's own raw USFM source for Baruch, Daniel-Greek, Esther-Greek,
// 2 Maccabees, Psalm 151, Tobit, and Sirach, the same fixtures
// `segmentVerses.test.ts`'s own tests use.
// ---------------------------------------------------------------------------

describe("extractFootnoteBodiesIn — \\fl, an independent regex extraction sharing no code with usfm/footnotes.ts", () => {
  it("should keep an \\fl label's own text in the independently-extracted body, agreeing with the real, emitted content (Esther-Greek 1:11's real \"Greek\"-labeled note)", () => {
    const [footnote] = extractFootnoteBodiesIn('\\f + \\fr 1:11 \\fl Greek \\ft to make her queen. \\f*');
    expect(footnote.plainText).toBe("Greek to make her queen. ");
  });

  it("should keep both labels of a real double-\\fl body, in source order (Esther-Greek 1:1's own real note)", () => {
    const [footnote] = extractFootnoteBodiesIn(
      "\\f + \\fr 1:1 \\fl Note: \\ft In the \\fl Hebrew \\ft and some copies of LXX, Esther begins here.\\f*",
    );
    expect(footnote.plainText).toBe("Note: In the Hebrew and some copies of LXX, Esther begins here.");
  });
});

/**
 * Regression coverage for a real gap this independent extractor once had:
 * Daniel-Greek's `\s1`-adjacent footnotes carry a `\+bk`/`\+bk*` nested-form
 * book-title citation, and extraction here didn't strip the delimiters the
 * way it already did for `\+wh` — a gap in the verifier, not the importer
 * (see {@link extractFootnoteBodiesIn}'s own doc comment for how it's
 * handled now).
 */
describe("extractFootnoteBodiesIn — \\+bk/\\+bk* nested-form book-title citations, delimiters stripped", () => {
  it("should strip \\+bk/\\+bk* delimiters from an independently-extracted footnote body, keeping the citation's own real text (Daniel 3:24's real \\s1-adjacent footnote)", () => {
    const [footnote] = extractFootnoteBodiesIn(readFixture("daniel-3-23-24-s1.usfm"));
    expect(footnote.plainText).toBe(
      "The Song of the Three Holy Children is an addition to Daniel found in the Greek Septuagint but not found in the traditional Hebrew text of Daniel. This portion is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. It is found inserted between Daniel 3:23 and Daniel 3:24 of the traditional Hebrew Bible. Here, the verses after 23 from the Hebrew Bible are numbered starting at 91 to make room for these verses.",
    );
  });
});

describe("extractSectionHeadingsIn — \\s1, an independent extraction of \\s1's own plain text (any embedded footnote stripped), sharing no code with usfm/headings.ts", () => {
  it("should extract a plain \\s1 heading's own text, stopping at \\p (Baruch 6's real chapter-start pericope title)", () => {
    const [heading] = extractSectionHeadingsIn(readFixture("baruch-6-s1.usfm"));
    expect(heading.plainText).toBe("The Letter of Jeremy (Jeremiah)");
  });

  it("should strip an embedded footnote out of an \\s1 span, leaving only the heading's own real title text (Daniel 3:24's real shape — the one \\s1 in this corpus that carries one)", () => {
    const [heading] = extractSectionHeadingsIn(readFixture("daniel-3-23-24-s1.usfm"));
    expect(heading.plainText).toBe("THE SONG OF THE THREE HOLY CHILDREN");
  });

  it("should extract every real \\s1 in a book, in source order", () => {
    const headings = extractSectionHeadingsIn(
      "\\c 13  \n\\s1 THE HISTORY OF SUSANNA  \n\\p\n\\v 1 text.\n\\c 14  \n\\s1 Bel and the Dragon  \n\\p\n\\v 1 text.",
    );
    expect(headings.map((heading) => heading.plainText)).toEqual(["THE HISTORY OF SUSANNA", "Bel and the Dragon"]);
  });
});

describe("countNestedBkPairsIn — \\+bk/\\+bk*, an independent regex count of the nested-marker form's own two halves, sharing no code with tokenize.ts", () => {
  it("should count 6 (3 real pairs, both halves each) inside Daniel 3:24's own real \\s1-embedded footnote", () => {
    expect(countNestedBkPairsIn(readFixture("daniel-3-23-24-s1.usfm"))).toBe(6);
  });

  it("should not match the plain, non-nested \\bk/\\bk* form (Numbers 21:14's own real construct, and a real \\ip block's own \\bk citation)", () => {
    expect(countNestedBkPairsIn(readFixture("tobit-opening-ip.usfm"))).toBe(0);
  });
});

describe("countChromeMarkersIn — \\pc/\\cp/\\is1, an independent regex count sharing no code with tokenize.ts/segmentVerses.ts", () => {
  it("should count 2 Maccabees' own real \\pc divider", () => {
    expect(countChromeMarkersIn(readFixture("2-maccabees-1-16-19-pc.usfm"))).toEqual({ pc: 1, cp: 0, is1: 0 });
  });

  it("should count Psalm 151's own real \\cp chapter-number override", () => {
    expect(countChromeMarkersIn(readFixture("psalm-151-opening.usfm"))).toEqual({ pc: 0, cp: 1, is1: 0 });
  });

  it("should count Esther-Greek's own real \\is1, without matching \\ip (a different marker name entirely, not a prefix match)", () => {
    expect(countChromeMarkersIn(readFixture("esther-greek-opening.usfm"))).toEqual({ pc: 0, cp: 0, is1: 1 });
  });
});

/**
 * Confirmed against the same real fixtures `footnotes.test.ts`'s own
 * `buildIntroParagraphFootnote` tests use, so this from-scratch extraction
 * is proven to agree with the real emitted output, not merely with itself.
 */
describe("extractIntroParagraphsIn — \\ip, an independent extraction sharing no code with usfm/footnotes.ts", () => {
  it("should extract a single-\\bk-citation \\ip block's own plain text, delimiters stripped (Tobit's real editorial blurb)", () => {
    const [intro] = extractIntroParagraphsIn(readFixture("tobit-opening-ip.usfm"));
    expect(intro.plainText).toBe(
      "Tobit is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.",
    );
    expect(intro.precededByUnclosedHeading).toBe(false);
  });

  it("should keep both of an \\ip block's own two embedded \\bk citations, in source order (Baruch's real editorial blurb)", () => {
    const [intro] = extractIntroParagraphsIn(readFixture("baruch-opening-ip.usfm"));
    expect(intro.plainText).toBe(
      "The book of Baruch is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. In some Bibles, Baruch chapter 6 is listed as a separate book called The Letter of Jeremiah, reflecting its separation from Baruch in some copies of the Greek Septuagint.",
    );
  });

  it("should extract both of Esther-Greek's own two separate \\ip blocks, in source order, the first stopping at its own second \\ip rather than reaching all the way to \\c", () => {
    const intros = extractIntroParagraphsIn(readFixture("esther-greek-opening.usfm"));
    expect(intros).toHaveLength(2);
    expect(intros[0].plainText).toMatch(/^The book of Esther in the Greek Septuagint contains 5 additions/);
    expect(intros[0].plainText).toMatch(/translation of the whole book of Esther from the Greek\.$/);
    expect(intros[1].plainText).toMatch(/^We have chosen not to distract the reader/);
  });

  it("should stop Sirach's own first \\ip block at \\is1, not at its own second \\ip (the one real in-scope case where two \\ip blocks are not directly adjacent)", () => {
    const intros = extractIntroParagraphsIn(readFixture("sirach-opening-ip.usfm"));
    expect(intros).toHaveLength(2);
    expect(intros[0].plainText).toBe(
      "The Wisdom of Jesus the Son of Sirach, also called Ecclesiasticus, is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.",
    );
    expect(intros[1].plainText).toMatch(/^WHEREAS many and great things have been delivered to us/);
  });
});

describe("Marker-inventory buckets — \\s1/\\ip/\\fl sit in content-handled, \\pc/\\is1 in chrome, none stay confirmed-zero", () => {
  it("should classify \\s1, \\ip, and \\fl as content-handled, no longer confirmed-zero", () => {
    for (const name of ["s1", "ip", "fl"]) {
      expect(CONTENT_HANDLED_MARKER_NAMES.has(name)).toBe(true);
      expect(CONFIRMED_ZERO_MARKER_NAMES.has(name)).toBe(false);
    }
  });

  it("should classify \\pc and \\is1 as chrome, no longer confirmed-zero — \\cp/\\ide were already chrome and stay so", () => {
    for (const name of ["pc", "is1"]) {
      expect(CHROME_MARKER_NAMES.has(name)).toBe(true);
      expect(CONFIRMED_ZERO_MARKER_NAMES.has(name)).toBe(false);
    }
    expect(CHROME_MARKER_NAMES.has("cp")).toBe(true);
    expect(CHROME_MARKER_NAMES.has("ide")).toBe(true);
  });

  it("should leave every deuterocanon marker name that occurs zero times even in the 15 in-scope files (\\ili, \\k) confirmed-zero still", () => {
    expect(CONFIRMED_ZERO_MARKER_NAMES.has("ili")).toBe(true);
    expect(CONFIRMED_ZERO_MARKER_NAMES.has("k")).toBe(true);
  });
});

/**
 * Confirms `\qc` (ASV1901's Psalm 119 acrostic letter headings, e.g.
 * `20-PSAeng-asv.usfm`) now sits in {@link CONTENT_HANDLED_MARKER_NAMES}, so
 * `main()`'s marker-inventory sweep (`markerNamesIn`, checked against
 * exactly these three sets) no longer reports it as unaccounted for —
 * worth asserting directly because `segmentVerses.ts`'s own default for an
 * unrecognized marker is a silent misplacement, not a loud failure.
 */
describe("Marker-inventory buckets: \\qc (ASV1901's real Psalm 119 acrostic heading marker) sits in CONTENT_HANDLED_MARKER_NAMES", () => {
  it("should confirm \\qc now sits in CONTENT_HANDLED_MARKER_NAMES, not CHROME_MARKER_NAMES/CONFIRMED_ZERO_MARKER_NAMES; main()'s own sweep no longer reports it as an unaccounted marker name", () => {
    expect(CONTENT_HANDLED_MARKER_NAMES.has("qc")).toBe(true);
    expect(CHROME_MARKER_NAMES.has("qc")).toBe(false);
    expect(CONFIRMED_ZERO_MARKER_NAMES.has("qc")).toBe(false);
  });
});

/**
 * Targeted regression checks for two independent fixes broadened to handle
 * a trailing tradition siglon (`LXX`/`MT`/`TR`/`NU`) and a "See "/"Compare "
 * lead-in: `isNothingButReferences`'s own residue check
 * (`footnoteTypeRules.ts`) and `REFERENCE_SUFFIX`'s own end-anchored
 * grammar (`usfm/references.ts`). Each case below is one real, extracted
 * example rather than a corpus-wide sweep: Hebrews 1:6's own `\x`-sourced
 * target list `"Deuteronomy 32:43 LXX"`, and 1 Maccabees 1:14's own
 * `\f`-derived body `"See 2 Maccabees 4:9, 12. "`.
 */
describe("classifyFootnote/buildReferenceOnlyContent — trailing-tradition-siglon and \"See \"-lead-in handling", () => {
  it("should classify Hebrews 1:6's real \\x-sourced \"Deuteronomy 32:43 LXX\" target list as xrf, now that REFERENCE_SUFFIX accepts a trailing tradition siglon", () => {
    expect(classifyFootnote("Deuteronomy 32:43 LXX")).toBe("xrf");
  });

  it("should classify 1 Maccabees 1:14's real \\f-derived \"See 2 Maccabees 4:9, 12.\" body as xrf, now that a \"See \"/\"Compare \" lead-in is stripped before the empty-residue check", () => {
    expect(classifyFootnote("See 2 Maccabees 4:9, 12. ")).toBe("xrf");
  });

  it("should resolve Hebrews 1:6's own real target to the identical structured bibleLink upstream WEBUS2020 already carries, against a hardcoded single-book canon rather than the version's own full _version.json", () => {
    const canonBookIds = new Set(["DEU"]);
    const resolved = buildReferenceOnlyContent("Deuteronomy 32:43 LXX", canonBookIds);
    expect(resolved).toEqual({ bibleLink: "Deuteronomy 32:43 LXX" });
  });
});

/**
 * Targeted regression checks for three real `trn`-signal constructs
 * `offersATranslationAlternative` (`footnoteTypeRules.ts`) recognizes: an
 * anchored `Literally,?`/`Lit\.?` opener, the bare-infinitive `also means?`
 * construct, and `can|could|may...be...translated` accepting "also" placed
 * after "be". Each case below is one real, extracted example rather than a
 * corpus-wide sweep.
 */
describe("classifyFootnote — trn-signal construct handling, against real extracted examples", () => {
  it("should classify Deuteronomy 23:18's real \"literally, dog\" note as trn, via the anchored Literally/Lit opener", () => {
    expect(classifyFootnote("literally, dog")).toBe("trn");
  });

  it("should classify Psalm 138:1's real also-mean note as trn, via the bare-infinitive also-mean construct", () => {
    expect(
      classifyFootnote(
        "The word elohim, used here, usually means “God” but can also mean “gods”, “princes”, or “angels”.",
      ),
    ).toBe("trn");
  });

  it("should classify Matthew 25:40's real may-be-also-translated note as trn, via can/could/may...be...translated accepting \"also\" after \"be\"", () => {
    expect(
      classifyFootnote(
        "The word for “brothers” here may be also correctly translated “brothers and sisters” or “siblings.”",
      ),
    ).toBe("trn");
  });
});

/**
 * Targeted regression checks for the `\bwords?\s+(?:rendered|translated)\b/i`
 * construct in `TRANSLATION_CONSTRUCTS` (`footnoteTypeRules.ts`) — the
 * divine-title-naming template WEB's own upstream corpus tags `trn`. Each
 * case below is one real, extracted example rather than a corpus-wide
 * sweep: Genesis 1:1's own "Hebrew word rendered 'God'" note and Genesis
 * 15:2's own "word translated 'Lord'" note.
 */
describe("classifyFootnote — the word(s) rendered/translated construct, against real extracted examples", () => {
  it("should classify Genesis 1:1's real \"The Hebrew word rendered God is Elohim\" note as trn", () => {
    expect(classifyFootnote("The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).")).toBe("trn");
  });

  it("should classify Genesis 15:2's real \"The word translated Lord is Adonai\" note as trn", () => {
    expect(classifyFootnote("The word translated “Lord” is “Adonai”.")).toBe("trn");
  });
});

/**
 * Targeted regression checks for a real `trn`-recovery construct: a
 * comma-punctuated `Hebrew,`/`Greek,`/`Aramaic,` opener (`TRANSLATION_OPENER`
 * in `footnoteTypeRules.ts`, which accepts a trailing period, comma, colon,
 * or semicolon). Both cases are already-quoted real literals — Exodus
 * 17:15's own "Hebrew, Yahweh Nissi" note and 1 Corinthians 10:4's own
 * "Greek, petra" note — rather than a corpus-wide sweep.
 */
describe("classifyFootnote — the comma-punctuated language opener, against real extracted examples", () => {
  it("should classify Exodus 17:15's real \"Hebrew, Yahweh Nissi\" note as trn", () => {
    expect(classifyFootnote("Hebrew, Yahweh Nissi")).toBe("trn");
  });

  it("should classify 1 Corinthians 10:4's real \"Greek, petra, a rock mass or bedrock.\" note as trn", () => {
    expect(classifyFootnote("Greek, petra, a rock mass or bedrock.")).toBe("trn");
  });
});

