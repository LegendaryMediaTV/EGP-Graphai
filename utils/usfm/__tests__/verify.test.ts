import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { classifyFootnote, flattenContentText } from "../footnoteTypeRules";
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
  countPhase9ChromeMarkersIn,
  countScriptNodes,
  countStrongAttributeNodes,
  countTableMarkersIn,
  countXrefLinkNodes,
  extractCrossReferencesIn,
  extractFootnoteBodiesIn,
  extractHeadingMarkersIn,
  extractIntroParagraphsIn,
  extractSectionHeadingsIn,
  extractSuperscriptionsIn,
  FOOTNOTES_IN_CORPUS,
  HeadingKind,
  markerNamesIn,
  MSB2025_CHAPTERS_IN_CORPUS,
  MSB2025_EMITTED_BREAK_FLAGS_IN_CORPUS,
  MSB2025_EMITTED_PARAGRAPH_FLAGS_IN_CORPUS,
  MSB2025_EMITTED_STRONG_ATTRIBUTES_IN_CORPUS,
  MSB2025_EMITTED_VERSES_IN_CORPUS,
  MSB2025_RAW_PARAGRAPH_MARKERS_IN_CORPUS,
  MSB2025_RAW_VERSES_IN_CORPUS,
  STRONGS_ATTRIBUTES_IN_CORPUS,
  XREF_SPANS_IN_CORPUS,
} from "../verify";
import { readFixture } from "./fixtures";

/** The real, complete Genesis USFM file — verbatim, not a fixture (its own real `\v`/`\c` totals are the thing under test). */
const GENESIS_SOURCE = fs.readFileSync(
  path.join(__dirname, "../../../imports/webus2020/ebible-usfm/02-GENeng-web.usfm"),
  "utf8",
);

/**
 * WEBUS2020's own real, in-scope source directory and file list, shared by
 * every whole-corpus WEB scan in this file so the "81 real in-scope books"
 * filter is defined once, not re-derived per describe block.
 * `00-FRTeng-web.usfm` (front matter) is excluded: it carries one real
 * `\f`...`\f*` span of its own (annotating "Christ" in its own explanatory
 * prose, line 11) that would otherwise inflate every footnote-body count
 * below by one — the same exclusion `asv1901CanonicalFiles` applies for
 * ASV1901's own `00-FRT`/`01-INT`.
 */
const WEB_DIR = path.join(__dirname, "../../../imports/webus2020/ebible-usfm");
const WEB_IN_SCOPE_FILES = fs
  .readdirSync(WEB_DIR)
  .filter((name) => name.endsWith(".usfm") && name !== "00-FRTeng-web.usfm");

describe("countMarkersIn — an independent regex count, sharing no code with tokenize.ts", () => {
  it("should count exactly 31 \\v markers and 1 \\c marker over the Genesis 1-2 fixture's own chapter 1", () => {
    // The fixture carries chapters 1 and 2 in full (31 + 25 verses), and
    // two \c markers (\c 1, \c 2) — counted here, not assumed.
    const counts = countMarkersIn(readFixture("genesis-1-2.usfm"));
    expect(counts.verses).toBe(56);
    expect(counts.chapters).toBe(2);
    expect(counts.maxChapter).toBe(2);
  });

  it("should count the real Genesis file's own 1,533 \\v markers and a highest chapter of 50", () => {
    const counts = countMarkersIn(GENESIS_SOURCE);
    expect(counts.chapters).toBe(50);
    expect(counts.maxChapter).toBe(50);
    expect(counts.verses).toBe(1533);
  });

  it("should count \\v/\\c markers independently of any paired marker (\\w/\\f/\\bk) sharing the same line", () => {
    const counts = countMarkersIn(readFixture("numbers-21-14.usfm"));
    expect(counts.verses).toBe(1);
    expect(counts.chapters).toBe(0);
  });
});

describe("countTableMarkersIn — confirms zero table markers via an independent regex count sharing no code with tokenize.ts", () => {
  it("should count 0 table markers in the real, complete Genesis file — the zero-tables finding, asserted directly rather than assumed", () => {
    expect(countTableMarkersIn(GENESIS_SOURCE)).toBe(0);
  });

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

  it("should count 0 table markers across all 15 real deuterocanon files specifically, confirming the full 81-book scope rather than assuming the 66-book-only figure still holds", () => {
    const dir = path.join(__dirname, "../../../imports/webus2020/ebible-usfm");
    const deuterocanonFiles = [
      "41-TOBeng-web.usfm", "42-JDTeng-web.usfm", "43-ESGeng-web.usfm", "45-WISeng-web.usfm",
      "46-SIReng-web.usfm", "47-BAReng-web.usfm", "52-1MAeng-web.usfm", "53-2MAeng-web.usfm",
      "54-1ESeng-web.usfm", "55-MANeng-web.usfm", "56-PS2eng-web.usfm", "57-3MAeng-web.usfm",
      "58-2ESeng-web.usfm", "59-4MAeng-web.usfm", "66-DAGeng-web.usfm",
    ];
    let total = 0;
    for (const file of deuterocanonFiles) {
      total += countTableMarkersIn(fs.readFileSync(path.join(dir, file), "utf8"));
    }
    expect(total).toBe(0);
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
 * Mirrors {@link countScriptNodes}'s descent shape, checking for `strong`
 * instead of `script`. These are direct unit tests on synthetic content,
 * matching {@link countEmittedBlockFlags}'s style above; the real,
 * whole-corpus proof that both shipped corpora emit zero such nodes lives
 * in the "Follow-up" describe block near the end of this file.
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
// Deuterocanon fixtures — every fixture below is real, verbatim
// `imports/webus2020/ebible-usfm/{47-BAR,66-DAG,43-ESG,53-2MA,56-PS2}eng-web.usfm`
// text, the same fixtures `segmentVerses.test.ts`'s own tests use.
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

describe("countPhase9ChromeMarkersIn — \\pc/\\cp/\\is1, an independent regex count sharing no code with tokenize.ts/segmentVerses.ts", () => {
  it("should count 2 Maccabees' own real \\pc divider", () => {
    expect(countPhase9ChromeMarkersIn(readFixture("2-maccabees-1-16-19-pc.usfm"))).toEqual({ pc: 1, cp: 0, is1: 0 });
  });

  it("should count Psalm 151's own real \\cp chapter-number override", () => {
    expect(countPhase9ChromeMarkersIn(readFixture("psalm-151-opening.usfm"))).toEqual({ pc: 0, cp: 1, is1: 0 });
  });

  it("should count Esther-Greek's own real \\is1, without matching \\ip (a different marker name entirely, not a prefix match)", () => {
    expect(countPhase9ChromeMarkersIn(readFixture("esther-greek-opening.usfm"))).toEqual({ pc: 0, cp: 0, is1: 1 });
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

  it("should find all 16 real in-scope \\ip blocks across the whole 15-book deuterocanon corpus, matching INTRO_PARAGRAPHS_IN_CORPUS", () => {
    const dir = path.join(__dirname, "../../../imports/webus2020/ebible-usfm");
    const deuterocanonFiles = [
      "41-TOBeng-web.usfm", "42-JDTeng-web.usfm", "43-ESGeng-web.usfm", "45-WISeng-web.usfm",
      "46-SIReng-web.usfm", "47-BAReng-web.usfm", "52-1MAeng-web.usfm", "53-2MAeng-web.usfm",
      "54-1ESeng-web.usfm", "55-MANeng-web.usfm", "56-PS2eng-web.usfm", "57-3MAeng-web.usfm",
      "58-2ESeng-web.usfm", "59-4MAeng-web.usfm", "66-DAGeng-web.usfm",
    ];
    let total = 0;
    for (const file of deuterocanonFiles) {
      total += extractIntroParagraphsIn(fs.readFileSync(path.join(dir, file), "utf8")).length;
    }
    expect(total).toBe(16);
  });
});

describe("Marker-inventory buckets — \\s1/\\ip/\\fl sit in content-handled, \\pc/\\is1 in chrome, none stay confirmed-zero", () => {
  it("should classify \\s1, \\ip, and \\fl as content-handled, no longer confirmed-zero", () => {
    for (const name of ["s1", "ip", "fl"]) {
      expect(CONTENT_HANDLED_MARKER_NAMES.has(name)).toBe(true);
      expect(CONFIRMED_ZERO_MARKER_NAMES.has(name)).toBe(false);
    }
  });

  it("should classify \\pc and \\is1 as chrome, no longer confirmed-zero — \\cp/\\ide were already chrome before this phase and stay so", () => {
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
 * Real corpus reconnaissance for ASV1901/MSB2025, re-derived directly
 * against the real source files rather than assumed
 * (`imports/guide.md`'s own standing discipline). Every count below is an
 * independent regex/`fs` check, sharing no code with
 * `tokenize.ts`/`segmentVerses.ts` — the same discipline
 * {@link countTableMarkersIn}'s own describe block above establishes for
 * WEBUS2020.
 */
describe("ASV1901/MSB2025 real-corpus reconnaissance", () => {
  const asv1901Dir = path.join(__dirname, "../../../imports/asv1901/ebible-usfm");
  const msb2025Dir = path.join(__dirname, "../../../imports/msb2025/ebible-usfm");
  /** ASV1901's 66 real canonical files — front matter (`00-FRT`) and the Preface (`01-INT`) excluded, neither Scripture text under any numbering scheme. */
  const asv1901CanonicalFiles = fs
    .readdirSync(asv1901Dir)
    .filter((name) => name.endsWith(".usfm") && name !== "00-FRTeng-asv.usfm" && name !== "01-INTeng-asv.usfm");

  it("should find exactly 71 entries in imports/asv1901/ebible-usfm/, 68 of them real .usfm files (66 canonical plus 00-FRT/01-INT), and 69 entries in imports/msb2025/ebible-usfm/, 66 of them real .usfm files, all canonical", () => {
    const asvEntries = fs.readdirSync(asv1901Dir);
    const msbEntries = fs.readdirSync(msb2025Dir);
    expect(asvEntries).toHaveLength(71);
    expect(asvEntries.filter((file) => file.endsWith(".usfm"))).toHaveLength(68);
    expect(msbEntries).toHaveLength(69);
    expect(msbEntries.filter((file) => file.endsWith(".usfm"))).toHaveLength(66);
  });

  it("should confirm ASV1901's own 01-INTeng-asv.usfm (the American Committee's 1901 Preface) carries zero \\v markers — real Preface prose, not Scripture text under any numbering scheme, excluded unconditionally like 00-FRTeng-asv.usfm", () => {
    const source = fs.readFileSync(path.join(asv1901Dir, "01-INTeng-asv.usfm"), "utf8");
    expect(countMarkersIn(source).verses).toBe(0);
  });

  it("should confirm both new corpora carry zero USFM table markers and zero \\periph — two constructs worth deliberately probing rather than waiting to trip over", () => {
    for (const dir of [asv1901Dir, msb2025Dir]) {
      let tableTotal = 0;
      let periphTotal = 0;
      for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".usfm"))) {
        const source = fs.readFileSync(path.join(dir, file), "utf8");
        tableTotal += countTableMarkersIn(source);
        periphTotal += (source.match(/\\periph\b/g) ?? []).length;
      }
      expect(tableTotal).toBe(0);
      expect(periphTotal).toBe(0);
    }
  });

  it("should confirm ASV1901's 66 canonical files carry zero \\wj (Words of Christ) and zero \\nd/\\sc (small caps) — this translation's own \"Jehovah\"/plain-text divine-name convention, a fact about ASV1901's own translation choices, not a gap in inlineMarks.ts", () => {
    let wocMarkers = 0;
    let ndMarkers = 0;
    let scMarkers = 0;
    for (const file of asv1901CanonicalFiles) {
      const source = fs.readFileSync(path.join(asv1901Dir, file), "utf8");
      wocMarkers += countInlineMarkersIn(source).wocMarkers;
      ndMarkers += (source.match(/\\nd\b/g) ?? []).length;
      scMarkers += (source.match(/\\sc\b/g) ?? []).length;
    }
    expect(wocMarkers).toBe(0);
    expect(ndMarkers).toBe(0);
    expect(scMarkers).toBe(0);
  });

  it("should confirm MSB2025's 66 canonical files carry zero \\f (footnotes) and zero \\x (cross-references) — an extraordinarily minimal corpus offering nothing beyond Strong's-tagged verse text and a uniform paragraph flag, a fact about this specific eBible export, not a code gap", () => {
    let footnoteSpans = 0;
    let xrefSpans = 0;
    for (const file of fs.readdirSync(msb2025Dir).filter((name) => name.endsWith(".usfm"))) {
      const source = fs.readFileSync(path.join(msb2025Dir, file), "utf8");
      footnoteSpans += (source.match(/\\f\+?\s/g) ?? []).length;
      xrefSpans += (source.match(/\\x\+?\s/g) ?? []).length;
    }
    expect(footnoteSpans).toBe(0);
    expect(xrefSpans).toBe(0);
  });

  it("should independently re-derive ASV1901's real \\add/\\add* and \\qc counts: 4,316 \\add/\\add* pairs and 22 \\qc occurrences across its 66 canonical files, both zero in MSB2025", () => {
    let addPairs = 0;
    let qcMarkers = 0;
    for (const file of asv1901CanonicalFiles) {
      const source = fs.readFileSync(path.join(asv1901Dir, file), "utf8");
      addPairs += (source.match(/\\add\b/g) ?? []).length;
      qcMarkers += (source.match(/\\qc\b/g) ?? []).length;
    }
    expect(addPairs).toBe(4316 * 2); // open + close, matching \add and \add* both
    expect(qcMarkers).toBe(22);

    let msbAdd = 0;
    let msbQc = 0;
    for (const file of fs.readdirSync(msb2025Dir).filter((name) => name.endsWith(".usfm"))) {
      const source = fs.readFileSync(path.join(msb2025Dir, file), "utf8");
      msbAdd += (source.match(/\\add\b/g) ?? []).length;
      msbQc += (source.match(/\\qc\b/g) ?? []).length;
    }
    expect(msbAdd).toBe(0);
    expect(msbQc).toBe(0);
  });

  /**
   * Regression test confirming `main()`'s marker-inventory sweep reports
   * zero unaccounted-for names now that
   * {@link CONTENT_HANDLED_MARKER_NAMES} includes `add`/`qc`, run against
   * the real 66 canonical ASV1901 files rather than a synthetic fixture.
   */
  it("should confirm zero unaccounted-for marker names anywhere in ASV1901's real, full 66-book canonical source, now that CONTENT_HANDLED_MARKER_NAMES carries \\add/\\qc", () => {
    const unaccounted = new Set<string>();
    for (const file of asv1901CanonicalFiles) {
      const source = fs.readFileSync(path.join(asv1901Dir, file), "utf8");
      for (const name of markerNamesIn(source)) {
        if (
          !CONTENT_HANDLED_MARKER_NAMES.has(name) &&
          !CHROME_MARKER_NAMES.has(name) &&
          !CONFIRMED_ZERO_MARKER_NAMES.has(name)
        ) {
          unaccounted.add(name);
        }
      }
    }
    expect(unaccounted.size).toBe(0);
  });

  /**
   * Bare "authorities insert"/"authorities add" occur nowhere in WEB's real
   * footnote bodies, but bare "authorities omit" already occurs 3 times, in
   * WEB's own deuterocanon corpus (Sirach 7:26, 1 Esdras 9:48, Manasses
   * 1:10) — see `footnoteTypeRules.test.ts`'s companion test for their
   * current `stu` classification. ASV1901's own real "omit" wording is
   * reverse-ordered ("omitted by the best ancient authorities," verb before
   * the noun), so it doesn't collide with WEB's noun-first "authorities
   * omit" phrase at all.
   */
  it("should confirm bare \"authorities insert\"/\"authorities add\" collide with zero real WEB footnote bodies, but bare \"authorities omit\" already collides with exactly 3", () => {
    const webDir = path.join(__dirname, "../../../imports/webus2020/ebible-usfm");
    let insertMatches = 0;
    let addMatches = 0;
    let omitMatches = 0;
    for (const file of fs.readdirSync(webDir).filter((name) => name.endsWith(".usfm"))) {
      const source = fs.readFileSync(path.join(webDir, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        if (/authorities insert/i.test(plainText)) insertMatches++;
        if (/authorities add/i.test(plainText)) addMatches++;
        if (/authorities omit/i.test(plainText)) omitMatches++;
      }
    }
    expect(insertMatches).toBe(0);
    expect(addMatches).toBe(0);
    expect(omitMatches).toBe(3);
  });
});

/**
 * Confirms three real fixes — `\add` joining `PAIRED_MARKER_NAMES`, `\qc`
 * joining the heading-family dispatch, and `WITNESS_PHRASES`'s five new
 * ASV1901 entries — stay inert against WEBUS2020's own real,
 * already-shipped 81-book corpus, measured directly rather than inferred.
 */
describe("WITNESS_PHRASES's own newest additions confirmed inert against WEBUS2020's own real 81-book corpus", () => {
  const webDir = WEB_DIR;
  const webFiles = WEB_IN_SCOPE_FILES;

  it("should confirm zero raw \\add and zero raw \\qc occurrences anywhere in WEBUS2020's own real 81-book source — both new marker-dispatch fixes (3.1/3.3) never fire for this corpus at all", () => {
    let addMarkers = 0;
    let qcMarkers = 0;
    for (const file of webFiles) {
      const source = fs.readFileSync(path.join(webDir, file), "utf8");
      addMarkers += (source.match(/\\add\b/g) ?? []).length;
      qcMarkers += (source.match(/\\qc\b/g) ?? []).length;
    }
    expect(addMarkers).toBe(0);
    expect(qcMarkers).toBe(0);
  });

  it("should confirm none of WITNESS_PHRASES's own three newest entries — \"authorities, some ancient, insert\", \"authorites insert\", and \"omitted by the best ancient authorities\" — match any of WEBUS2020's own 1,854 real footnote bodies", () => {
    let bodyCount = 0;
    let newPhraseMatches = 0;
    for (const file of webFiles) {
      const source = fs.readFileSync(path.join(webDir, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        bodyCount++;
        if (
          plainText.includes("authorities, some ancient, insert") ||
          plainText.includes("authorites insert") ||
          plainText.includes("omitted by the best ancient authorities")
        ) {
          newPhraseMatches++;
        }
      }
    }
    expect(bodyCount).toBe(FOOTNOTES_IN_CORPUS);
    expect(newPhraseMatches).toBe(0);
  });

  /**
   * A real before/after comparison, not an inference from the zero-match
   * check above alone. `WITNESS_PHRASES`/`WITNESS_SIGLA` aren't exported
   * (`footnoteTypeRules.ts` keeps its vocabulary table private — only
   * {@link classifyFootnote}'s final verdict is public), so the "before"
   * snapshot below reconstructs the prior witness check by hand: the eleven
   * entries `WITNESS_PHRASES` carried before these additions, plus the
   * unchanged `WITNESS_SIGLA` regex, copied verbatim from
   * `footnoteTypeRules.ts`. Everything else in `classifyFootnote` (the
   * `xrf`→`var`→`trn`→`stu` ordering, and the `xrf`/`trn` rules themselves)
   * is unchanged, so a body's own witness-vocabulary match is the only
   * thing that could possibly move.
   */
  it("should confirm zero real WEBUS2020 footnote bodies disagree between the pre-Phase-3 witness-vocabulary check (reconstructed) and classifyFootnote's own current, real var classification — the real before/after comparison, not an inference", () => {
    const phrasesBeforePhase3 = [
      "manuscript",
      "Masoretic",
      "Samaritan Pentateuch",
      "Vulgate",
      "Septuagint",
      "Targum",
      "Dead Sea Scrolls",
      "some versions",
      "LXX",
      "DSS",
      "authorities read",
    ];
    const witnessSigla = /\b(?:TR|NU|MT)\b/i;
    const namesAWitnessBeforePhase3 = (body: string): boolean =>
      phrasesBeforePhase3.some((phrase) => body.includes(phrase)) || witnessSigla.test(body);

    let bodyCount = 0;
    let disagreements = 0;
    let varAfter = 0;
    for (const file of webFiles) {
      const source = fs.readFileSync(path.join(webDir, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        bodyCount++;
        const wasWitnessBefore = namesAWitnessBeforePhase3(plainText);
        const isVarAfter = classifyFootnote(plainText) === "var";
        if (isVarAfter) varAfter++;
        // A disagreement can only mean the witness match flipped
        // false -> true (`WITNESS_PHRASES` only grew), and only counts when
        // the body isn't already claimed by `xrf` upstream of `var` — an
        // `xrf` body was never a `var` candidate either way.
        if (isVarAfter !== wasWitnessBefore && classifyFootnote(plainText) !== "xrf") disagreements++;
      }
    }
    expect(bodyCount).toBe(FOOTNOTES_IN_CORPUS);
    expect(varAfter).toBeGreaterThan(0);
    expect(disagreements).toBe(0);
  });
});

/**
 * Collision check for two independent fixes broadened to handle a trailing
 * tradition siglon (`LXX`/`MT`/`TR`/`NU`): `isNothingButReferences`'s own
 * residue check (`footnoteTypeRules.ts`) and `REFERENCE_SUFFIX`'s own
 * end-anchored grammar (`usfm/references.ts`).
 *
 * Hebrews 1:6's own real target is `\x`-sourced (`\xt Deuteronomy 32:43
 * LXX`), not `\f`-sourced — `buildCrossReferenceContent` hardcodes every
 * `\x`-derived footnote's own `type` to `"xrf"` unconditionally, so
 * `isNothingButReferences`'s fix never changes what a fresh import assigns
 * this one real target. What it does change is the identical re-derivation
 * `overhaulFootnotes.ts`'s own `reclassifyFootnotesIn` walker performs
 * against already-built JSON (flatten `content` back to text, re-run
 * `classifyFootnote`). The first check below therefore covers both real
 * production paths that call `classifyFootnote` on a body of this shape:
 * every real `\f`-derived body (`usfm/footnotes.ts`'s own import-time
 * path), and every real `\x`-derived target list, semicolon-joined exactly
 * the way a bare, no-override `bibleLink` flattens back to text
 * (`flattenContentText`'s own established rule) — the shape
 * `overhaulFootnotes.ts` actually re-classifies.
 */
describe("The trailing-tradition-siglon fixes, proven inert against WEBUS2020's own real 81-book corpus except Hebrews 1:6 itself", () => {
  const webDir = WEB_DIR;
  const webFiles = WEB_IN_SCOPE_FILES;

  // The version's own real, already-loaded canon — the identical set a
  // real import passes to `usfm/references.ts` (`utils/importUsfm.ts`'s own
  // `canonBookIds`), not a hand-picked test-only subset.
  const versionJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../../bible-versions/WEBUS2020/_version.json"), "utf8"),
  ) as { books: { _id: string }[] };
  const canonBookIds = new Set(versionJson.books.map((book) => book._id));

  it("should confirm the isNothingButReferences broadening changes exactly one real classification across the whole 81-book corpus — Hebrews 1:6's own \\x-sourced \"Deuteronomy 32:43 LXX\" target list — and zero real \\f-derived footnote bodies", () => {
    // The exact prior REFERENCE_PATTERN/isNothingButReferences,
    // reconstructed by hand (mirrors the witness-vocabulary "before" copy
    // above) — `REFERENCE_PATTERN` is not exported, so this is the only way
    // to compare old-vs-new behavior directly.
    const referencePatternBeforePhase5 =
      /\b(?:[1-4]\s?)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s\d+:\d+(?:[-–—,]\s?\d+)*\b/g;
    const isNothingButReferencesBeforePhase5 = (body: string): boolean => {
      const withoutReferences = body.replace(referencePatternBeforePhase5, "").replace(/[;,.\s]/g, "");
      return withoutReferences.length === 0 && body.trim().length > 0;
    };

    let fBodyCount = 0;
    let fChanges = 0;
    let xSpanCount = 0;
    let xChanges = 0;
    const xChangedTargetLists: string[] = [];

    for (const file of webFiles) {
      const source = fs.readFileSync(path.join(webDir, file), "utf8");

      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        fBodyCount++;
        const wasXrfBefore = isNothingButReferencesBeforePhase5(plainText);
        const isXrfAfter = classifyFootnote(plainText) === "xrf";
        if (wasXrfBefore !== isXrfAfter) fChanges++;
      }

      for (const { targets } of extractCrossReferencesIn(source)) {
        xSpanCount++;
        const joined = targets.join("; ");
        const wasXrfBefore = isNothingButReferencesBeforePhase5(joined);
        const isXrfAfter = classifyFootnote(joined) === "xrf";
        if (wasXrfBefore !== isXrfAfter) {
          xChanges++;
          xChangedTargetLists.push(joined);
        }
      }
    }

    expect(fBodyCount).toBe(FOOTNOTES_IN_CORPUS);
    expect(fChanges).toBe(0);
    expect(xSpanCount).toBe(XREF_SPANS_IN_CORPUS);
    expect(xChanges).toBe(1);
    expect(xChangedTargetLists).toEqual(["Deuteronomy 32:43 LXX"]);
  });

  it("should confirm the REFERENCE_SUFFIX broadening newly resolves exactly one real target across the whole 81-book corpus — Hebrews 1:6's own \"Deuteronomy 32:43 LXX\" — to a real bibleLink, with the total real resolved-link count across every \\x span rising from 439 to 440 (every other already-resolving target's own resolution unchanged) and zero left unresolved", () => {
    let totalLinks = 0;
    let totalUnresolved = 0;
    const newlyResolvableTargetLists: string[] = [];

    for (const file of webFiles) {
      const source = fs.readFileSync(path.join(webDir, file), "utf8");
      for (const { targets } of extractCrossReferencesIn(source)) {
        const joined = targets.join("; ");
        const resolved = buildReferenceOnlyContent(joined, canonBookIds);
        const { links, unresolved } = countXrefLinkNodes(resolved);
        totalLinks += links;
        totalUnresolved += unresolved;
        if (unresolved === 0 && /\s(?:LXX|MT|TR|NU)$/.test(joined)) newlyResolvableTargetLists.push(joined);
      }
    }

    // 440 real semicolon-split targets total across the corpus's 363 real
    // `\x` spans (see `usfm/references.ts`'s own header doc comment) —
    // Hebrews 1:6's target is the one real holdout that wasn't already
    // resolved, confirmed directly here, not just cited.
    expect(totalLinks).toBe(440);
    expect(totalUnresolved).toBe(0);
    expect(newlyResolvableTargetLists).toEqual(["Deuteronomy 32:43 LXX"]);
  });

  it("should resolve Hebrews 1:6's own real target to the identical structured bibleLink upstream WEBUS2020 already carries", () => {
    const resolved = buildReferenceOnlyContent("Deuteronomy 32:43 LXX", canonBookIds);
    expect(resolved).toEqual({ bibleLink: "Deuteronomy 32:43 LXX" });
  });
});

/**
 * MSB2025's real, full 66-book run, now that `bible-versions/MSB2025/` is a
 * real, shipped target — confirms the earlier hypothesis that MSB2025
 * exercises nothing beyond `\w`/`\v`/`\m`/`\c` against the full measured
 * source and emitted output, not a five-verse sample.
 */
describe("MSB2025's real, full 66-book corpus, whole-corpus totals and marker-inventory sweep", () => {
  const msb2025SourceDir = path.join(__dirname, "../../../imports/msb2025/ebible-usfm");
  const msb2025VersionDir = path.join(__dirname, "../../../bible-versions/MSB2025");
  /**
   * `bible-versions/MSB2025/` was `git stash`ed in an earlier, unrelated
   * session and isn't on disk right now. The two tests below that read
   * this directory's emitted JSON skip cleanly when it's absent instead of
   * crashing; the raw-source checks, which only read
   * `imports/msb2025/ebible-usfm/` (still present), keep running regardless.
   */
  const msb2025VersionExists = fs.existsSync(msb2025VersionDir);
  const sourceFiles = fs.readdirSync(msb2025SourceDir).filter((name) => name.endsWith(".usfm"));
  const emittedFiles = msb2025VersionExists
    ? fs.readdirSync(msb2025VersionDir).filter((name) => name.endsWith(".json") && name !== "_version.json")
    : [];

  it("should confirm the real, full-corpus raw \\v/\\c/\\m totals match MSB2025's own fixed-in-advance constants exactly — the 66-book figure, not just a small sample", () => {
    let rawVerses = 0;
    let rawChapters = 0;
    let rawParagraphMarkers = 0;
    for (const file of sourceFiles) {
      const source = fs.readFileSync(path.join(msb2025SourceDir, file), "utf8");
      const counts = countMarkersIn(source);
      rawVerses += counts.verses;
      rawChapters += counts.chapters;
      rawParagraphMarkers += countBlockMarkersIn(source).paragraphMarkers;
    }
    expect(sourceFiles).toHaveLength(66);
    expect(rawVerses).toBe(MSB2025_RAW_VERSES_IN_CORPUS);
    expect(rawChapters).toBe(MSB2025_CHAPTERS_IN_CORPUS);
    expect(rawParagraphMarkers).toBe(MSB2025_RAW_PARAGRAPH_MARKERS_IN_CORPUS);
  });

  it.skipIf(!msb2025VersionExists)("should confirm the real, full-corpus emitted verse count is exactly 4 fewer than the raw \\v total — Luke 17:36/Acts 8:37/15:34/24:7, the real, textually-disputed verses this source declares but supplies no content for at all, now correctly emitting no record rather than a schema-invalid empty one", () => {
    let emittedVerses = 0;
    for (const file of emittedFiles) {
      const verses = JSON.parse(fs.readFileSync(path.join(msb2025VersionDir, file), "utf8"));
      emittedVerses += verses.length;
    }
    expect(emittedFiles).toHaveLength(66);
    expect(emittedVerses).toBe(MSB2025_EMITTED_VERSES_IN_CORPUS);
    expect(MSB2025_RAW_VERSES_IN_CORPUS - MSB2025_EMITTED_VERSES_IN_CORPUS).toBe(4);
  });

  it.skipIf(!msb2025VersionExists)("should confirm paragraph:true now lands on exactly one verse per chapter, corpus-wide, and break:true never appears at all — the real, full-corpus confirmation that usfm/paragraphNoise.ts's own uniform-noise suppression actually landed through a real reimport, not just the raw \\m-per-verse structural fact from before that suppression existed", () => {
    let paragraphFlags = 0;
    let breakFlags = 0;
    for (const file of emittedFiles) {
      const verses = JSON.parse(fs.readFileSync(path.join(msb2025VersionDir, file), "utf8"));
      for (const verse of verses) {
        const flags = countEmittedBlockFlags(verse.content);
        paragraphFlags += flags.paragraph;
        breakFlags += flags.break;
      }
    }
    expect(paragraphFlags).toBe(MSB2025_EMITTED_PARAGRAPH_FLAGS_IN_CORPUS);
    expect(breakFlags).toBe(MSB2025_EMITTED_BREAK_FLAGS_IN_CORPUS);
    // One paragraph flag per chapter, not per verse, so the two figures
    // should equal CHAPTERS, not VERSES — asserted directly here, not
    // inferred from the bare counts alone.
    expect(MSB2025_EMITTED_PARAGRAPH_FLAGS_IN_CORPUS).toBe(MSB2025_CHAPTERS_IN_CORPUS);
    expect(MSB2025_EMITTED_PARAGRAPH_FLAGS_IN_CORPUS).toBeLessThan(MSB2025_EMITTED_VERSES_IN_CORPUS);
  });

  it("should confirm zero unaccounted-for marker names anywhere in the real, full 66-book source — every real marker name MSB2025 carries (c/h/id/m/mt1/toc1/toc2/toc3/v/w) already sits in CONTENT_HANDLED_MARKER_NAMES or CHROME_MARKER_NAMES, holding for the whole corpus, not just a sample", () => {
    const unaccounted = new Set<string>();
    const allNames = new Set<string>();
    for (const file of sourceFiles) {
      const source = fs.readFileSync(path.join(msb2025SourceDir, file), "utf8");
      for (const name of markerNamesIn(source)) {
        allNames.add(name);
        if (
          !CONTENT_HANDLED_MARKER_NAMES.has(name) &&
          !CHROME_MARKER_NAMES.has(name) &&
          !CONFIRMED_ZERO_MARKER_NAMES.has(name)
        ) {
          unaccounted.add(name);
        }
      }
    }
    expect([...allNames].sort()).toEqual(["c", "h", "id", "m", "mt1", "toc1", "toc2", "toc3", "v", "w"]);
    expect(unaccounted.size).toBe(0);
  });
});

/**
 * The automated, whole-corpus regression test backing
 * {@link STRONGS_ATTRIBUTES_IN_CORPUS} and
 * {@link MSB2025_EMITTED_STRONG_ATTRIBUTES_IN_CORPUS} — see those doc
 * comments in `verify.ts` for why Strong's tagging was suppressed. This
 * reads the real, on-disk emitted JSON directly and runs on every
 * `npm run test`, rather than only when someone remembers to invoke
 * `verify.ts`'s own CLI by hand.
 */
describe("Follow-up — Strong's tagging suppressed from the real, shipped WEBUS2020/MSB2025 corpora", () => {
  it("should confirm zero real WEBUS2020 emitted nodes anywhere carry a strong attribute, across all 81 real book files", () => {
    const webVersionDir = path.join(__dirname, "../../../bible-versions/WEBUS2020");
    const bookFiles = fs.readdirSync(webVersionDir).filter((name) => name.endsWith(".json") && name !== "_version.json");
    let strongAttributeTotal = 0;
    for (const file of bookFiles) {
      const verses = JSON.parse(fs.readFileSync(path.join(webVersionDir, file), "utf8"));
      for (const verse of verses) strongAttributeTotal += countStrongAttributeNodes(verse.content);
    }
    expect(bookFiles).toHaveLength(81);
    expect(strongAttributeTotal).toBe(STRONGS_ATTRIBUTES_IN_CORPUS);
  });

  // `bible-versions/MSB2025/` was `git stash`ed in an earlier, unrelated
  // session and isn't on disk right now; this test skips cleanly rather
  // than crashing when it's absent.
  it.skipIf(!fs.existsSync(path.join(__dirname, "../../../bible-versions/MSB2025")))("should confirm zero real MSB2025 emitted nodes anywhere carry a strong attribute, across all 66 real book files", () => {
    const msb2025VersionDir = path.join(__dirname, "../../../bible-versions/MSB2025");
    const bookFiles = fs
      .readdirSync(msb2025VersionDir)
      .filter((name) => name.endsWith(".json") && name !== "_version.json");
    let strongAttributeTotal = 0;
    for (const file of bookFiles) {
      const verses = JSON.parse(fs.readFileSync(path.join(msb2025VersionDir, file), "utf8"));
      for (const verse of verses) strongAttributeTotal += countStrongAttributeNodes(verse.content);
    }
    expect(bookFiles).toHaveLength(66);
    expect(strongAttributeTotal).toBe(MSB2025_EMITTED_STRONG_ATTRIBUTES_IN_CORPUS);
  });
});

/**
 * A before/after comparison of the full xrf/var/trn/stu classification
 * distribution across WEBUS2020's own real 1,854 footnote bodies —
 * stronger evidence than a per-body "did the `var` verdict flip" check
 * alone. `namesAWitness`'s own `WITNESS_PHRASES` list is the only thing
 * that changed inside {@link classifyFootnote}; `isNothingButReferences`
 * (`xrf`) and `offersATranslationAlternative` (`trn`) are reproduced here
 * verbatim from `footnoteTypeRules.ts`, so the full four-type tally proves
 * nothing else moved.
 */
describe("The real before/after per-type footnote-classification distribution for WEBUS2020, measured directly rather than inferred from a collision check alone", () => {
  const REFERENCE_PATTERN = /\b(?:[1-4]\s?)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s\d+:\d+(?:[-–—,]\s?\d+)*\b/g;
  function isNothingButReferencesBeforePhase3(body: string): boolean {
    const withoutReferences = body.replace(REFERENCE_PATTERN, "").replace(/[;,.\s]/g, "");
    return withoutReferences.length === 0 && body.trim().length > 0;
  }
  const phrasesBeforePhase3 = [
    "manuscript",
    "Masoretic",
    "Samaritan Pentateuch",
    "Vulgate",
    "Septuagint",
    "Targum",
    "Dead Sea Scrolls",
    "some versions",
    "LXX",
    "DSS",
    "authorities read",
  ];
  const witnessSigla = /\b(?:TR|NU|MT)\b/i;
  function namesAWitnessBeforePhase3(body: string): boolean {
    return phrasesBeforePhase3.some((phrase) => body.includes(phrase)) || witnessSigla.test(body);
  }
  // Kept in sync with footnoteTypeRules.ts's own
  // TRANSLATION_ALTERNATIVE_PATTERNS — this block's job is to prove the
  // WITNESS_PHRASES additions (the var axis) changed nothing else, and
  // that only holds if this trn-axis copy matches the real, current array
  // rather than a stale snapshot.
  const TRANSLATION_ALTERNATIVE_PATTERNS = [
    /^Or,?\s/i,
    /^Hebrew[:,\s]/i,
    /^Greek[:,\s]/i,
    /^Gr\.\s/i,
    /^Aramaic[:,\s]/i,
    /^(?:Literally,?|Lit\.?)\s/i,
    /\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze at\b/i,
    /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+(?:also\s+)?correctly\s+translated|correctly\s+be\s+translated|be\s+(?:also\s+)?translated)\b/i,
    /\bsometimes (?:translated|rendered)\b/i,
    /\bword\s+(?:rendered|translated)\b/i,
    /\balso means?\b/i,
    /\bnot as a word, but as a grammatical marker\b/i,
  ];
  function offersATranslationAlternative(body: string): boolean {
    return TRANSLATION_ALTERNATIVE_PATTERNS.some((pattern) => pattern.test(body));
  }
  function classifyBeforePhase3(body: string): "xrf" | "var" | "trn" | "stu" {
    if (isNothingButReferencesBeforePhase3(body)) return "xrf";
    if (namesAWitnessBeforePhase3(body)) return "var";
    if (offersATranslationAlternative(body)) return "trn";
    return "stu";
  }

  it("should produce an identical xrf/var/trn/stu distribution before and after WITNESS_PHRASES's five newest additions, across every one of WEBUS2020's own real 1,854 footnote bodies, with zero per-body disagreements", () => {
    const before = { xrf: 0, var: 0, trn: 0, stu: 0 };
    const after = { xrf: 0, var: 0, trn: 0, stu: 0 };
    let bodyCount = 0;
    let perBodyDisagreements = 0;
    for (const file of WEB_IN_SCOPE_FILES) {
      const source = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        bodyCount++;
        const b = classifyBeforePhase3(plainText);
        const a = classifyFootnote(plainText);
        before[b]++;
        after[a]++;
        if (a !== b) perBodyDisagreements++;
      }
    }
    expect(bodyCount).toBe(FOOTNOTES_IN_CORPUS);
    expect(perBodyDisagreements).toBe(0);
    // The real, measured distribution — identical before and after.
    expect(after).toEqual(before);
    expect(after).toEqual({ xrf: 9, var: 230, trn: 688, stu: 927 });
  });
});

/**
 * The four safe trn-recovery additions covered below — a `Literally,?`/
 * `Lit\.?` opener, the `Behold`-gloss interjection pattern, the
 * bare-infinitive `\balso means?\b` broadening, and
 * `can|could|may...be...translated` accepting "also" after "be" — can only
 * ever move a body from `stu` to `trn`: `classifyFootnote`'s own
 * `xrf` → `var` → `trn` → `stu` order means a body already claimed by
 * `isNothingButReferences`/`namesAWitness` never reaches the `trn` check at
 * all.
 *
 * Two real, distinct WEBUS2020 verses match the bare-infinitive "also
 * mean" shape (Psalm 138:1 and Matthew 2:1's "the word for 'wise men'
 * (magoi) can also mean teachers, scientists..."), and 1 Peter 2:6's
 * Behold-gloss note names both original-language words in one note
 * ("Behold", from "הִנֵּה" or "ἰδοὺ") — the pattern's own anchoring on the
 * literal gloss-list construct, not a Hebrew-only or Greek-only assumption,
 * already covers it.
 */
describe("The four safe trn-recovery additions, proven inert against WEBUS2020's own real 81-book corpus except the 88 real, named fixtures", () => {
  // The exact prior pattern array, copied by hand since it isn't exported —
  // the same reconstruction technique used above, so the comparison is
  // against the real prior rule, not an approximation of it.
  const TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_7 = [
    /^Or,?\s/i,
    /^Hebrew[:\s]/i,
    /^Greek[:\s]/i,
    /^Gr\.\s/i,
    /^Aramaic[:\s]/i,
    /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+correctly\s+translated|correctly\s+be\s+translated|be\s+translated)\b/i,
    /\bsometimes (?:translated|rendered)\b/i,
    /\balso means\b/i,
  ];
  function offersATranslationAlternativeBeforePhase7(body: string): boolean {
    return TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_7.some((pattern) => pattern.test(body));
  }
  // xrf/var are untouched by this trn-only change, so reusing
  // classifyFootnote's current verdict for those two is exactly as
  // faithful to "before" as reconstructing them by hand — a body already
  // xrf/var can never be reached by a trn-only broadening anyway.
  function classifyBeforePhase7(body: string): string {
    const real = classifyFootnote(body);
    if (real === "xrf" || real === "var") return real;
    return offersATranslationAlternativeBeforePhase7(body) ? "trn" : "stu";
  }

  // Frozen snapshot of the array as it stood before the next, unrelated
  // trn pattern was added — one entry short of today's real array. This
  // block's job is to prove exactly what these four additions changed, in
  // isolation; comparing directly against the ever-current
  // `classifyFootnote` would let a later, unrelated trn-axis change
  // silently inflate this block's own counts — which is exactly what
  // happened once, caught only because the counts stopped matching.
  // Freezing both sides of the comparison (the same technique
  // {@link TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_7} uses) keeps
  // this block inert to any later trn-axis change.
  const TRANSLATION_ALTERNATIVE_PATTERNS_AFTER_PHASE_7 = [
    /^Or,?\s/i,
    /^Hebrew[:\s]/i,
    /^Greek[:\s]/i,
    /^Gr\.\s/i,
    /^Aramaic[:\s]/i,
    /^(?:Literally,?|Lit\.?)\s/i,
    /\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze at\b/i,
    /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+(?:also\s+)?correctly\s+translated|correctly\s+be\s+translated|be\s+(?:also\s+)?translated)\b/i,
    /\bsometimes (?:translated|rendered)\b/i,
    /\balso means?\b/i,
  ];
  function offersATranslationAlternativeAfterPhase7(body: string): boolean {
    return TRANSLATION_ALTERNATIVE_PATTERNS_AFTER_PHASE_7.some((pattern) => pattern.test(body));
  }
  function classifyAfterPhase7(body: string): string {
    const real = classifyFootnote(body);
    if (real === "xrf" || real === "var") return real;
    return offersATranslationAlternativeAfterPhase7(body) ? "trn" : "stu";
  }

  it("should confirm the four trn-recovery additions change exactly 88 real classifications across the whole 82-file in-scope corpus — every one stu -> trn, categorized by which new signal fired, matching the real, measured counts exactly", () => {
    const LIT_OPENER = /^(?:Literally,?|Lit\.?)\s/i;
    const BEHOLD_GLOSS = /\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze at\b/i;
    const ALSO_MEAN_BARE_ONLY = /\balso means?\b/i;

    let bodyCount = 0;
    let totalChanges = 0;
    const byPattern = { behold: 0, literally: 0, alsoMean: 0, mayBeAlso: 0, other: 0 };
    const nonStuToTrnChanges: string[] = [];

    for (const file of WEB_IN_SCOPE_FILES) {
      const source = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        bodyCount++;
        const before = classifyBeforePhase7(plainText);
        const after = classifyAfterPhase7(plainText);
        if (before === after) continue;
        totalChanges++;
        if (before !== "stu" || after !== "trn") nonStuToTrnChanges.push(`${before} -> ${after}: ${plainText}`);
        if (BEHOLD_GLOSS.test(plainText)) byPattern.behold++;
        else if (LIT_OPENER.test(plainText)) byPattern.literally++;
        else if (ALSO_MEAN_BARE_ONLY.test(plainText) && !/\balso means\b/.test(plainText)) byPattern.alsoMean++;
        else if (!offersATranslationAlternativeBeforePhase7(plainText)) byPattern.mayBeAlso++;
        else byPattern.other++;
      }
    }

    expect(bodyCount).toBe(FOOTNOTES_IN_CORPUS);
    expect(nonStuToTrnChanges).toEqual([]);
    expect(byPattern).toEqual({ behold: 52, literally: 27, alsoMean: 2, mayBeAlso: 7, other: 0 });
    expect(totalChanges).toBe(88);
  });

  it("should confirm the same four additions change exactly 87 real classifications restricted to the 66-book canonical corpus (deuterocanon's own one extra Behold instance, Daniel-Greek 2:31, sits outside this scope)", () => {
    const DEUTEROCANON_RAW_FILES = new Set([
      "41-TOBeng-web.usfm",
      "42-JDTeng-web.usfm",
      "43-ESGeng-web.usfm",
      "66-DAGeng-web.usfm",
      "45-WISeng-web.usfm",
      "46-SIReng-web.usfm",
      "47-BAReng-web.usfm",
      "52-1MAeng-web.usfm",
      "53-2MAeng-web.usfm",
      "54-1ESeng-web.usfm",
      "55-MANeng-web.usfm",
      "56-PS2eng-web.usfm",
      "57-3MAeng-web.usfm",
      "58-2ESeng-web.usfm",
      "59-4MAeng-web.usfm",
    ]);
    const canonicalFiles = WEB_IN_SCOPE_FILES.filter((file) => !DEUTEROCANON_RAW_FILES.has(file));

    let changes = 0;
    for (const file of canonicalFiles) {
      const source = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        if (classifyBeforePhase7(plainText) !== classifyAfterPhase7(plainText)) changes++;
      }
    }
    expect(changes).toBe(87);
  });
});

/**
 * Cross-corpus collision report for the `\balso means?\b` broadening, run
 * against every other shipped, richly-tagged version. The `Behold`-gloss
 * and "be [also] correctly translated" broadenings collide with zero other
 * version (measured directly below), so neither appears in the table. The
 * bare-infinitive broadening is different: it is real, generic English
 * grammar ("X also means/mean Y"), so it does collide with already-
 * classified bodies in seven other shipped versions — a deliberate,
 * accepted exception: none of those versions is reimported, reclassified,
 * or touched by this check.
 */
describe("The \\balso means?\\b broadening's own real, cross-corpus disagreement (informational; none of these versions are touched)", () => {
  it("should confirm zero other shipped version collides with the Behold-gloss or be-also-correctly-translated broadenings, and name every other version's own real, already-stu/var-tagged body the bare-infinitive broadening would flip if that version were ever run through this classifier", () => {
    const BEHOLD_GLOSS = /\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze at\b/i;
    const ALSO_MEAN_BARE = /\balso means?\b/i;
    const CAN_COULD_MAY_AFTER =
      /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+(?:also\s+)?correctly\s+translated|correctly\s+be\s+translated|be\s+(?:also\s+)?translated)\b/i;
    const CAN_COULD_MAY_BEFORE =
      /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+correctly\s+translated|correctly\s+be\s+translated|be\s+translated)\b/i;

    const versionsDir = path.join(__dirname, "../../../bible-versions");
    const otherVersionIds = fs
      .readdirSync(versionsDir)
      .filter((name) => fs.statSync(path.join(versionsDir, name)).isDirectory() && name !== "WEBUS2020");

    let beholdCollisions = 0;
    let mayBeAlsoCollisions = 0;
    const alsoMeanDisagreements: string[] = [];

    for (const versionId of otherVersionIds) {
      const versionDir = path.join(versionsDir, versionId);
      const files = fs.readdirSync(versionDir).filter((file) => file.endsWith(".json") && file !== "_version.json");
      for (const file of files) {
        const records = JSON.parse(fs.readFileSync(path.join(versionDir, file), "utf8")) as {
          content: unknown;
        }[];
        const bodies: { type: string; body: string }[] = [];
        const collect = (content: unknown): void => {
          if (Array.isArray(content)) {
            content.forEach(collect);
            return;
          }
          if (content === null || typeof content !== "object") return;
          const node = content as { foot?: { type?: string; content?: unknown }; content?: unknown; subtitle?: unknown; heading?: unknown };
          if (node.foot) bodies.push({ type: String(node.foot.type), body: flattenContentText(node.foot.content) });
          if ("content" in node) collect(node.content);
          if ("subtitle" in node) collect(node.subtitle);
          if ("heading" in node) collect(node.heading);
        };
        for (const record of records) collect(record.content);

        for (const { type, body } of bodies) {
          if (BEHOLD_GLOSS.test(body) && type !== "trn") beholdCollisions++;
          if (CAN_COULD_MAY_AFTER.test(body) && !CAN_COULD_MAY_BEFORE.test(body) && type !== "trn") mayBeAlsoCollisions++;
          if (ALSO_MEAN_BARE.test(body) && type !== "trn") {
            alsoMeanDisagreements.push(`${versionId} ${file} [${type}]: ${body}`);
          }
        }
      }
    }

    expect(beholdCollisions).toBe(0);
    expect(mayBeAlsoCollisions).toBe(0);
    // One of these 27 bodies (ESV2025's) is already classified `var`, so —
    // despite appearing here — it isn't actually reachable by a trn-only
    // broadening; classifyFootnote's ordering would claim it before the
    // trn check ever ran.
    expect(alsoMeanDisagreements.length).toBe(27);
    const disagreeingVersions = new Set(alsoMeanDisagreements.map((line) => line.split(" ")[0]));
    expect(disagreeingVersions).toEqual(new Set(["CSB2017", "ESV2025", "NCV1991", "NET2019", "NIV1984", "NLT1996", "NLT2015"]));
  });
});

/**
 * `\bword\s+(?:rendered|translated)\b/i` — the divine-title-naming template
 * WEB's own upstream corpus tags `trn` and this module used to tag `stu` on
 * purpose.
 *
 * 71 real changes, all `stu` -> `trn`: 41 "Hebrew word rendered 'God'..."
 * instances plus 30 "word translated 'Lord' is 'Adonai'" instances —
 * Psalms alone repeats the Elohim note 5 times, which is why the total
 * isn't a round per-book estimate. Zero changes of any other shape:
 * `classifyFootnote`'s `xrf` → `var` → `trn` → `stu` order means a body
 * already classified `var`/`xrf` is never reachable by a trn-only pattern
 * addition.
 */
describe("The rendered/translated pattern, proven inert against WEBUS2020's own real 81-book corpus except the 71 real Elohim/Adonai fixtures", () => {
  const TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_8 = [
    /^Or,?\s/i,
    /^Hebrew[:\s]/i,
    /^Greek[:\s]/i,
    /^Gr\.\s/i,
    /^Aramaic[:\s]/i,
    /^(?:Literally,?|Lit\.?)\s/i,
    /\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze at\b/i,
    /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+(?:also\s+)?correctly\s+translated|correctly\s+be\s+translated|be\s+(?:also\s+)?translated)\b/i,
    /\bsometimes (?:translated|rendered)\b/i,
    /\balso means?\b/i,
  ];
  function offersATranslationAlternativeBeforePhase8(body: string): boolean {
    return TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_8.some((pattern) => pattern.test(body));
  }
  // xrf/var are untouched by this change, so reusing classifyFootnote's
  // current verdict for those two is exactly as faithful to "before" as
  // reconstructing them by hand.
  function classifyBeforePhase8(body: string): string {
    const real = classifyFootnote(body);
    if (real === "xrf" || real === "var") return real;
    return offersATranslationAlternativeBeforePhase8(body) ? "trn" : "stu";
  }

  // Frozen snapshot of the array as it stood right after the
  // rendered/translated pattern was added — one entry short of today's
  // real array (objective 2026-08-22-001's own comma-opener and Aleph-Tav
  // additions land after this snapshot). This block's own two tests
  // originally compared `classifyBeforePhase8` directly against the
  // ever-current `classifyFootnote`, which is exactly the trap this same
  // file's own "four safe trn-recovery additions" block above already
  // named and avoided by freezing both sides: a later, unrelated trn-axis
  // addition inflated this block's own counts by 4 the moment it shipped,
  // caught only because the counts stopped matching. Freezing "after" too,
  // the same technique that block already uses, keeps this block inert to
  // any later trn-axis change.
  const TRANSLATION_ALTERNATIVE_PATTERNS_AFTER_PHASE_8 = [
    ...TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_8,
    /\bword\s+(?:rendered|translated)\b/i,
  ];
  function offersATranslationAlternativeAfterPhase8(body: string): boolean {
    return TRANSLATION_ALTERNATIVE_PATTERNS_AFTER_PHASE_8.some((pattern) => pattern.test(body));
  }
  function classifyAfterPhase8(body: string): string {
    const real = classifyFootnote(body);
    if (real === "xrf" || real === "var") return real;
    return offersATranslationAlternativeAfterPhase8(body) ? "trn" : "stu";
  }

  it("should confirm the rendered/translated pattern changes exactly 71 real classifications across the whole 82-file in-scope corpus — every one stu -> trn, none of any other shape", () => {
    let bodyCount = 0;
    let totalChanges = 0;
    const nonStuToTrnChanges: string[] = [];

    for (const file of WEB_IN_SCOPE_FILES) {
      const source = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        bodyCount++;
        const before = classifyBeforePhase8(plainText);
        const after = classifyAfterPhase8(plainText);
        if (before === after) continue;
        totalChanges++;
        if (before !== "stu" || after !== "trn") nonStuToTrnChanges.push(`${before} -> ${after}: ${plainText}`);
      }
    }

    expect(bodyCount).toBe(FOOTNOTES_IN_CORPUS);
    expect(nonStuToTrnChanges).toEqual([]);
    expect(totalChanges).toBe(71);
  });

  it("should confirm the same pattern changes exactly 69 real classifications restricted to the 66-book canonical corpus (the deuterocanon's own Daniel-Greek addition carries one real instance of each shape, outside this scope)", () => {
    const DEUTEROCANON_RAW_FILES = new Set([
      "41-TOBeng-web.usfm",
      "42-JDTeng-web.usfm",
      "43-ESGeng-web.usfm",
      "66-DAGeng-web.usfm",
      "45-WISeng-web.usfm",
      "46-SIReng-web.usfm",
      "47-BAReng-web.usfm",
      "52-1MAeng-web.usfm",
      "53-2MAeng-web.usfm",
      "54-1ESeng-web.usfm",
      "55-MANeng-web.usfm",
      "56-PS2eng-web.usfm",
      "57-3MAeng-web.usfm",
      "58-2ESeng-web.usfm",
      "59-4MAeng-web.usfm",
    ]);
    const canonicalFiles = WEB_IN_SCOPE_FILES.filter((file) => !DEUTEROCANON_RAW_FILES.has(file));

    let changes = 0;
    for (const file of canonicalFiles) {
      const source = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        if (classifyBeforePhase8(plainText) !== classifyAfterPhase8(plainText)) changes++;
      }
    }
    expect(changes).toBe(69);
  });
});

/**
 * Cross-corpus collision report for the
 * `\bword\s+(?:rendered|translated)\b/i` pattern, the same discipline the
 * `\balso means?\b` report above applies. None of the versions below is
 * reimported, reclassified, or touched by this check — a deliberate,
 * accepted exception, the same as above.
 */
describe("The rendered/translated pattern's own real, cross-corpus disagreement (informational; none of these versions are touched)", () => {
  it("should name every other shipped version's own real, already-stu-tagged body the general pattern would flip if that version were ever run through this classifier", () => {
    const GENERAL_PATTERN = /\bword\s+(?:rendered|translated)\b/i;

    const versionsDir = path.join(__dirname, "../../../bible-versions");
    const otherVersionIds = fs
      .readdirSync(versionsDir)
      .filter((name) => fs.statSync(path.join(versionsDir, name)).isDirectory() && name !== "WEBUS2020");

    const disagreements: string[] = [];

    for (const versionId of otherVersionIds) {
      const versionDir = path.join(versionsDir, versionId);
      const files = fs.readdirSync(versionDir).filter((file) => file.endsWith(".json") && file !== "_version.json");
      for (const file of files) {
        const records = JSON.parse(fs.readFileSync(path.join(versionDir, file), "utf8")) as {
          content: unknown;
        }[];
        const bodies: { type: string; body: string }[] = [];
        const collect = (content: unknown): void => {
          if (Array.isArray(content)) {
            content.forEach(collect);
            return;
          }
          if (content === null || typeof content !== "object") return;
          const node = content as {
            foot?: { type?: string; content?: unknown };
            content?: unknown;
            subtitle?: unknown;
            heading?: unknown;
          };
          if (node.foot) bodies.push({ type: String(node.foot.type), body: flattenContentText(node.foot.content) });
          if ("content" in node) collect(node.content);
          if ("subtitle" in node) collect(node.subtitle);
          if ("heading" in node) collect(node.heading);
        };
        for (const record of records) collect(record.content);

        for (const { type, body } of bodies) {
          if (GENERAL_PATTERN.test(body) && type !== "trn") disagreements.push(`${versionId} ${file} [${type}]: ${body}`);
        }
      }
    }

    // NET2019 accounts for 75 of these 82 bodies — its own internal 36
    // trn/32 stu/2 var split on this identical template signals an
    // unreviewed source, not a considered editorial line. None of these
    // four versions is reimported or reclassified by this check.
    expect(disagreements.length).toBe(82);
    const disagreeingVersions = new Set(disagreements.map((line) => line.split(" ")[0]));
    expect(disagreeingVersions).toEqual(new Set(["AMP1987", "ESV2025", "NET2019", "NIV1984"]));
  });
});

/**
 * Two more real `trn`-recovery additions (objective 2026-08-22-001's own
 * Finding 5, reopening a call objective 002 originally left as an accepted
 * `stu` residual): a comma-punctuated `Hebrew,`/`Greek,`/`Aramaic,` opener,
 * and the real "not as a word, but as a grammatical marker" Aleph-Tav
 * construct. Both additions can only ever move a body from `stu` to `trn`,
 * the same reasoning every earlier `trn`-axis addition in this file already
 * relies on: `classifyFootnote`'s own `xrf` → `var` → `trn` → `stu` order
 * means a body already claimed by an earlier check never reaches either of
 * these two new patterns at all.
 */
describe("The comma-opener and Aleph-Tav additions, proven inert against WEBUS2020's own real 82-file corpus except 4 real fixtures", () => {
  const TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_10 = [
    /^Or,?\s/i,
    /^Hebrew[:\s]/i,
    /^Greek[:\s]/i,
    /^Gr\.\s/i,
    /^Aramaic[:\s]/i,
    /^(?:Literally,?|Lit\.?)\s/i,
    /\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze at\b/i,
    /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+(?:also\s+)?correctly\s+translated|correctly\s+be\s+translated|be\s+(?:also\s+)?translated)\b/i,
    /\bsometimes (?:translated|rendered)\b/i,
    /\bword\s+(?:rendered|translated)\b/i,
    /\balso means?\b/i,
  ];
  function offersATranslationAlternativeBeforePhase10(body: string): boolean {
    return TRANSLATION_ALTERNATIVE_PATTERNS_BEFORE_PHASE_10.some((pattern) => pattern.test(body));
  }
  // xrf/var are untouched by this change, so reusing classifyFootnote's
  // current verdict for those two is exactly as faithful to "before" as
  // reconstructing them by hand.
  function classifyBeforePhase10(body: string): string {
    const real = classifyFootnote(body);
    if (real === "xrf" || real === "var") return real;
    return offersATranslationAlternativeBeforePhase10(body) ? "trn" : "stu";
  }

  it("should confirm the two additions change exactly 4 real classifications across the whole 82-file in-scope corpus — every one stu -> trn, none of any other shape (Exodus 17:15, Matthew 16:18's comma openers; Exodus 20:1, Zechariah 12:10's Aleph-Tav note)", () => {
    let bodyCount = 0;
    let totalChanges = 0;
    const nonStuToTrnChanges: string[] = [];
    const changedBodies: string[] = [];

    for (const file of WEB_IN_SCOPE_FILES) {
      const source = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        bodyCount++;
        const before = classifyBeforePhase10(plainText);
        const after = classifyFootnote(plainText);
        if (before === after) continue;
        totalChanges++;
        if (before !== "stu" || after !== "trn") nonStuToTrnChanges.push(`${before} -> ${after}: ${plainText}`);
        changedBodies.push(plainText);
      }
    }

    expect(bodyCount).toBe(FOOTNOTES_IN_CORPUS);
    expect(nonStuToTrnChanges).toEqual([]);
    expect(totalChanges).toBe(4);
    expect(changedBodies.sort()).toEqual(
      [
        "Hebrew, Yahweh Nissi",
        "Greek, petra, a rock mass or bedrock.",
        "After “God”, the Hebrew has the two letters “Aleph Tav” (the first and last letters of the Hebrew alphabet), not as a word, but as a grammatical marker.",
        "After “me”, the Hebrew has the two letters “Aleph Tav” (the first and last letters of the Hebrew alphabet), not as a word, but as a grammatical marker.",
      ].sort(),
    );
  });

  it("should confirm all 4 real changes sit in the 66-book canonical corpus, none in the 15 deuterocanon-only books", () => {
    const DEUTEROCANON_RAW_FILES = new Set([
      "41-TOBeng-web.usfm",
      "42-JDTeng-web.usfm",
      "43-ESGeng-web.usfm",
      "66-DAGeng-web.usfm",
      "45-WISeng-web.usfm",
      "46-SIReng-web.usfm",
      "47-BAReng-web.usfm",
      "52-1MAeng-web.usfm",
      "53-2MAeng-web.usfm",
      "54-1ESeng-web.usfm",
      "55-MANeng-web.usfm",
      "56-PS2eng-web.usfm",
      "57-3MAeng-web.usfm",
      "58-2ESeng-web.usfm",
      "59-4MAeng-web.usfm",
    ]);
    const canonicalFiles = WEB_IN_SCOPE_FILES.filter((file) => !DEUTEROCANON_RAW_FILES.has(file));

    let changes = 0;
    for (const file of canonicalFiles) {
      const source = fs.readFileSync(path.join(WEB_DIR, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        if (classifyBeforePhase10(plainText) !== classifyFootnote(plainText)) changes++;
      }
    }
    expect(changes).toBe(4);
  });
});

/**
 * Cross-corpus collision report for both additions, the same discipline
 * every earlier `trn`-axis addition in this file applies. Unlike the
 * `\balso means?\b`/`word rendered\|translated` broadenings above, neither
 * addition here collides with any other already-shipped version at all —
 * both are narrow, closed constructs (a bare comma after one of three
 * language names; one specific recurring sentence), not generic English
 * phrasing another translation's own house style would independently
 * reach for. None of the versions below is reimported, reclassified, or
 * touched by this check.
 */
describe("The comma-opener and Aleph-Tav additions' own real, cross-corpus disagreement (informational; none of these versions are touched)", () => {
  it("should confirm zero other shipped version collides with either addition", () => {
    const COMMA_OPENER = /^(?:Hebrew|Greek|Aramaic),/i;
    const ALEPH_TAV = /\bnot as a word, but as a grammatical marker\b/i;

    const versionsDir = path.join(__dirname, "../../../bible-versions");
    const otherVersionIds = fs
      .readdirSync(versionsDir)
      .filter((name) => fs.statSync(path.join(versionsDir, name)).isDirectory() && name !== "WEBUS2020");

    const disagreements: string[] = [];

    for (const versionId of otherVersionIds) {
      const versionDir = path.join(versionsDir, versionId);
      const files = fs.readdirSync(versionDir).filter((file) => file.endsWith(".json") && file !== "_version.json");
      for (const file of files) {
        const records = JSON.parse(fs.readFileSync(path.join(versionDir, file), "utf8")) as {
          content: unknown;
        }[];
        const bodies: { type: string; body: string }[] = [];
        const collect = (content: unknown): void => {
          if (Array.isArray(content)) {
            content.forEach(collect);
            return;
          }
          if (content === null || typeof content !== "object") return;
          const node = content as {
            foot?: { type?: string; content?: unknown };
            content?: unknown;
            subtitle?: unknown;
            heading?: unknown;
          };
          if (node.foot) bodies.push({ type: String(node.foot.type), body: flattenContentText(node.foot.content) });
          if ("content" in node) collect(node.content);
          if ("subtitle" in node) collect(node.subtitle);
          if ("heading" in node) collect(node.heading);
        };
        for (const record of records) collect(record.content);

        for (const { type, body } of bodies) {
          if ((COMMA_OPENER.test(body) || ALEPH_TAV.test(body)) && type !== "trn") {
            disagreements.push(`${versionId} ${file} [${type}]: ${body}`);
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
  });
});
