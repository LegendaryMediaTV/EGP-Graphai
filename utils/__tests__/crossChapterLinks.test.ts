import { afterAll, beforeAll, describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Content from "../../types/Content";
import {
  classifyBibleLink,
  completeTruncatedRange,
  CrossChapterFinding,
  findUnresolvableTarget,
  formatCrossChapterFinding,
  formatTruncatedRangeFinding,
  formatUnresolvableTargetFinding,
  reconstructTruncatedRangesInContent,
  splitCrossChapterLink,
  splitCrossChapterLinksInContent,
  TruncatedRangeFinding,
  findSingleChapterShorthand,
  normalizeSingleChapterShorthandInContent,
  UnresolvableTargetFinding,
} from "../crossChapterLinks";

/**
 * Two synthetic "versions" written to isolated temp dirs, not the real
 * bible-versions/ corpus — real book ids (so name resolution still hits the
 * real bible-books.json registry) but invented chapter/verse content.
 * `readVersionBookFiles` treats an absolute path as a directory to read
 * directly, so this needed no change to any function signature.
 *
 * FAKE_A and FAKE_B share Romans 14 at two different lengths, to prove
 * chapter length comes from whichever version is asked, never a shared
 * table. Every other book exists only where a specific test needs it — an
 * absent book resolves to `null` rather than throwing, so most grammar-only
 * tests need no fixture data for their own book name at all.
 */
function writeFixtureVersion(root: string, books: Record<string, Record<number, number[]>>): void {
  fs.mkdirSync(root, { recursive: true });
  for (const [book, chapters] of Object.entries(books)) {
    const records = Object.entries(chapters).flatMap(([chapter, verses]) =>
      verses.map((verse) => ({ book, chapter: Number(chapter), verse, content: [`${book} ${chapter}:${verse}`] })),
    );
    fs.writeFileSync(path.join(root, `${book}.json`), JSON.stringify(records));
  }
}

const FAKE_A = fs.mkdtempSync(path.join(os.tmpdir(), "crossChapterLinks-test-a-"));
const FAKE_B = fs.mkdtempSync(path.join(os.tmpdir(), "crossChapterLinks-test-b-"));

beforeAll(() => {
  writeFixtureVersion(FAKE_A, {
    EXO: { 3: [1, 2, 3, 4], 12: range(1, 25) },
    "2KG": { 6: range(1, 10), 7: range(1, 8) },
    ROM: { 14: range(1, 6) },
    MRK: { 9: [1, 2, 3, 4, 5, 6, 8, 9, 10] }, // verse 7 deliberately omitted — a genuine gap, not just "past the end"
    JUD: { 1: range(1, 5) }, // single-chapter book — no chapter 2 at all
    EZR: { 4: range(1, 15) },
    "3JN": { 1: range(1, 8) },
    GEN: { 1: [1], 2: [1] },
    "2SM": { 22: range(1, 12) },
    REV: { 4: [1, 2, 3], 20: [1, 2, 3] },
    "2CO": { 10: [1, 2], 12: [1, 2] },
    MAT: { 1: [1], 5: [1] },
  });
  writeFixtureVersion(FAKE_B, {
    ROM: { 14: range(1, 9) }, // deliberately longer than FAKE_A's, and no GEN at all (mirrors an NT-only canon)
    MRK: { 9: [7] }, // the one verse FAKE_A omits — pooled, the corpus carries it
  });
});

afterAll(() => {
  fs.rmSync(FAKE_A, { recursive: true, force: true });
  fs.rmSync(FAKE_B, { recursive: true, force: true });
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe("classifyBibleLink — target shape", () => {
  it("should classify an em-dash cross-chapter target as crossChapterRange", () => {
    expect(classifyBibleLink(FAKE_A, "2 Kings 6:5—7:3").shape).toBe("crossChapterRange");
  });

  it("should classify the same target written with an en dash as crossChapterRange", () => {
    expect(classifyBibleLink(FAKE_A, "2 Kings 6:5–7:3").shape).toBe("crossChapterRange");
  });

  it("should classify the same target written with an ASCII hyphen as crossChapterRange", () => {
    expect(classifyBibleLink(FAKE_A, "2 Kings 6:5-7:3").shape).toBe("crossChapterRange");
  });

  it("should classify a same-chapter verse range as singleChapter", () => {
    expect(classifyBibleLink(FAKE_A, "Exodus 3:3–4").shape).toBe("singleChapter");
  });

  it("should classify a whole-chapter range as wholeChapterRange — a finding, split with no verse anchor (see the splitCrossChapterLink suite below)", () => {
    expect(classifyBibleLink(FAKE_A, "Revelation 4–20").shape).toBe("wholeChapterRange");
  });

  it("should classify a bare chapter reference as singleChapter (grammar illustration)", () => {
    expect(classifyBibleLink(FAKE_A, "Psalm 23").shape).toBe("singleChapter");
  });

  it("should classify a comma-merged target as mergedTarget, not crossChapterRange", () => {
    expect(classifyBibleLink(FAKE_A, "Isaiah 66:10, 13").shape).toBe("mergedTarget");
  });

  it("should not misread a merged target's internal dash-and-comma as a second endpoint", () => {
    expect(classifyBibleLink(FAKE_A, "Ezekiel 34:11–12, 15, 22").shape).toBe("mergedTarget");
  });

  it("should report an unparsed siglum-suffixed target rather than throw", () => {
    expect(() => classifyBibleLink(FAKE_A, "Deuteronomy 32:43 LXX")).not.toThrow();
    expect(classifyBibleLink(FAKE_A, "Deuteronomy 32:43 LXX").shape).toBe("unparsed");
  });

  it("should find the em-dash target even though an en-dash-only pattern would miss it", () => {
    const target = "2 Kings 6:5—7:3"; // U+2014 EM DASH
    const enDashOnly = /–/; // U+2013 EN DASH only — the convention's own emitted character
    expect(enDashOnly.test(target)).toBe(false); // proves a naive en-dash-only detector reports a false all-clear
    expect(classifyBibleLink(FAKE_A, target).shape).toBe("crossChapterRange");
  });
});

describe("classifyBibleLink — per-version chapter lengths", () => {
  it("should read Ezra 4's last verse from this fixture's own records", () => {
    expect(classifyBibleLink(FAKE_A, "Ezra 4:8–6:18").firstChapterLastVerse).toBe(15);
  });

  it("should read 2 Kings 6's last verse from this fixture's own records", () => {
    expect(classifyBibleLink(FAKE_A, "2 Kings 6:5—7:3").firstChapterLastVerse).toBe(10);
  });

  it("should read Romans 14's last verse as 6 from FAKE_A but 9 from FAKE_B, same function, different version", () => {
    expect(classifyBibleLink(FAKE_A, "Romans 14:1").firstChapterLastVerse).toBe(6);
    expect(classifyBibleLink(FAKE_B, "Romans 14:1").firstChapterLastVerse).toBe(9);
  });

  it("should report a chapter this version does not carry as unknown, not default it to 0", () => {
    const result = classifyBibleLink(FAKE_B, "Genesis 1:1");
    expect(result.firstChapterLastVerse).toBeNull();
    expect(result.firstChapterLastVerse).not.toBe(0);
  });
});

describe("classifyBibleLink — book-name resolution restricted to a version's own canon", () => {
  it("should resolve '2 Kings' to 2KG in FAKE_A", () => {
    expect(classifyBibleLink(FAKE_A, "2 Kings 6:5—7:3").book).toBe("2KG");
  });

  it("should report 'Psalms of Solomon' as unresolvable rather than throw (a real bible-books.json entry, but absent from this fixture's canon)", () => {
    expect(() => classifyBibleLink(FAKE_A, "Psalms of Solomon 8:32")).not.toThrow();
    expect(classifyBibleLink(FAKE_A, "Psalms of Solomon 8:32").book).toBeNull();
  });

  it("should report a name valid in one version's canon as unresolvable in another version that doesn't carry it", () => {
    expect(classifyBibleLink(FAKE_A, "Genesis 1:1").book).toBe("GEN");
    expect(classifyBibleLink(FAKE_B, "Genesis 1:1").book).toBeNull();
  });
});

describe("formatCrossChapterFinding (was auditCrossChapterLinks.ts's own function, moved here)", () => {
  it("should format a finding into the one-line report format", () => {
    const finding: CrossChapterFinding = {
      book: "2KG",
      atBook: "HEB",
      atChapter: 11,
      atVerse: 34,
      footnoteType: "xrf",
      zone: "verse",
      target: "2 Kings 6:31—7:20",
      dash: "—",
      fromChapter: 6,
      toChapter: 7,
      firstChapterLastVerse: 33,
    };
    expect(formatCrossChapterFinding(finding)).toBe(
      'HEB 11:34 [xrf/verse]: "2 Kings 6:31—7:20" spans 2KG 6–7 — unsplit',
    );
  });
});

describe("splitCrossChapterLink — a cross-chapter node (pure function only — must not write to disk)", () => {
  it("should split a cross-chapter target into two chapter-scoped halves, normalizing the emitted separator to the en dash", () => {
    const link = { bibleLink: "2 Kings 6:5—7:3" }; // em dash, no content override at all
    const split = splitCrossChapterLink(FAKE_A, link);

    expect(split).not.toBeNull();
    const [partA, dash, partB] = split!;
    expect(partA).toEqual({ bibleLink: "2 Kings 6:5–10", content: "2 Kings 6:5" });
    expect(dash).toBe("–"); // the convention's own en dash, even though the source used an em dash
    expect(partB).toEqual({ bibleLink: "2 Kings 7:1–3", content: "7:3" });
  });

  it("should re-derive Part A's own chapter-length from this fixture's own data rather than hardcode it", () => {
    expect(classifyBibleLink(FAKE_A, "2 Kings 6:5—7:3").firstChapterLastVerse).toBe(10);
  });

  it("should return null for a target that needs no split", () => {
    expect(splitCrossChapterLink(FAKE_A, { bibleLink: "Exodus 3:3–4" })).toBeNull();
  });
});

describe("splitCrossChapterLink — whole-chapter ranges (pure function only — must not write to disk)", () => {
  it("should split a whole-chapter range into two bare chapter references, with no verse anchor on either half", () => {
    const link = { bibleLink: "Matthew 1–5", content: "ch. i–v" };
    const split = splitCrossChapterLink(FAKE_A, link);

    expect(split).not.toBeNull();
    const [partA, dash, partB] = split!;
    expect(partA).toEqual({ bibleLink: "Matthew 1", content: "ch. i" });
    expect(dash).toBe("–");
    expect(partB).toEqual({ bibleLink: "Matthew 5", content: "v" });
  });

  it("should read Part B's chapter number, not fold it into a verse the way crossChapterRange does", () => {
    const [, , partB] = splitCrossChapterLink(FAKE_A, { bibleLink: "2 Corinthians 10–12" })!;
    expect(partB).toEqual({ bibleLink: "2 Corinthians 12", content: "12" });
  });

  it("should drop Part A's content override when its display matches its own target, but keep Part B's bare chapter number as an override (its display never gained the book name a bare target needs)", () => {
    const [partA, , partB] = splitCrossChapterLink(FAKE_A, { bibleLink: "Revelation 4–20" })!;
    expect(partA).toEqual({ bibleLink: "Revelation 4" });
    expect(partB).toEqual({ bibleLink: "Revelation 20", content: "20" });
  });
});

describe("splitCrossChapterLink — chapter-existence guard", () => {
  // Every fixture here uses Jude (JUD) — single-chapter in this fixture, so
  // "chapter 2" is guaranteed absent without depending on any other data.

  it("should throw for a wholeChapterRange target whose fromChapter is absent (this fixture's Jude has only chapter 1)", () => {
    expect(() => splitCrossChapterLink(FAKE_A, { bibleLink: "Jude 2–3" })).toThrow(/cannot derive .*chapter length for:/);
  });

  it("should throw for a wholeChapterRange target whose toChapter is absent (this fixture's Jude has only chapter 1)", () => {
    expect(() => splitCrossChapterLink(FAKE_A, { bibleLink: "Jude 1–2" })).toThrow(/carries no Jude 2 for:/);
  });

  it("should throw for a crossChapterRange target whose toChapter is absent", () => {
    expect(() => splitCrossChapterLink(FAKE_A, { bibleLink: "Jude 1:5–2:3" })).toThrow(/carries no Jude 2 for:/);
  });

  it("should still throw for a crossChapterRange target whose fromChapter is absent — already threw before this guard; kept so the hoisting refactor cannot regress it", () => {
    expect(() => splitCrossChapterLink(FAKE_A, { bibleLink: "Jude 2:5–3:1" })).toThrow(/cannot derive .*chapter length for:/);
  });
});

describe("splitCrossChapterLinksInContent — the content-array splice", () => {
  it("should splice a bare {bibleLink} footnote content into its three-part replacement", () => {
    const { content, splits } = splitCrossChapterLinksInContent(FAKE_A, { bibleLink: "2 Kings 6:5—7:3" });

    expect(splits).toBe(1);
    expect(content).toEqual([{ bibleLink: "2 Kings 6:5–10", content: "2 Kings 6:5" }, "–", { bibleLink: "2 Kings 7:1–3", content: "7:3" }]);
  });

  it("should splice a bibleLink inside a mixed array of surrounding content, leaving the other entries untouched and in order", () => {
    const original = [{ bibleLink: "1 Kings 19:1–3" }, "; ", { bibleLink: "2 Kings 6:5—7:3" }];
    const { content, splits } = splitCrossChapterLinksInContent(FAKE_A, original);

    expect(splits).toBe(1);
    expect(content).toEqual([
      { bibleLink: "1 Kings 19:1–3" },
      "; ",
      { bibleLink: "2 Kings 6:5–10", content: "2 Kings 6:5" },
      "–",
      { bibleLink: "2 Kings 7:1–3", content: "7:3" },
    ]);
  });

  it("should leave content with no cross-chapter link untouched and report zero splits", () => {
    const original = [{ text: "quenched the power of fire," }, { bibleLink: "Daniel 3:1–30" }];
    const { content, splits } = splitCrossChapterLinksInContent(FAKE_A, original);

    expect(splits).toBe(0);
    expect(content).toEqual(original);
  });
});

describe("splitCrossChapterLinksInContent — idempotence", () => {
  it("should report zero splits and leave already-split content unchanged on a second pass", () => {
    const original = [{ bibleLink: "1 Kings 19:1–3" }, "; ", { bibleLink: "2 Kings 6:5—7:3" }];
    const first = splitCrossChapterLinksInContent(FAKE_A, original);
    expect(first.splits).toBe(1);

    const second = splitCrossChapterLinksInContent(FAKE_A, first.content);
    expect(second.splits).toBe(0);
    expect(second.content).toEqual(first.content);
  });
});

// A bibleLink whose target is truncated short of the range its own display
// override names. Every fixture here is hand-authored against the synthetic
// FAKE_A/FAKE_B chapter data above, not any real translation's own text.
describe("completeTruncatedRange — whole-chapter-equivalence gate", () => {
  it("should NOT be a finding: a bare-chapter target whose display spells out that exact chapter's own verses 1..last", () => {
    expect(
      completeTruncatedRange(FAKE_A, { bibleLink: "2 Samuel 22", content: "2 Sam. 22:1–12" })
    ).toBeNull();
  });
});

describe("completeTruncatedRange — the whole-chapter gate rejects a display that only looks equivalent", () => {
  it("should be a finding when the display range starts somewhere other than verse 1", () => {
    const result = completeTruncatedRange(FAKE_A, { bibleLink: "2 Samuel 22", content: "2 Sam. 22:5–12" });
    expect(result).not.toBeNull();
  });

  it("should be a finding when the display's claimed chapter length disagrees with this version's own data (FAKE_A's Romans 14 ends at 6, not 9)", () => {
    const result = completeTruncatedRange(FAKE_A, { bibleLink: "Romans 14", content: "Rom. 14:1–9" });
    expect(result).not.toBeNull();
  });

  it("should NOT be a finding for the identical target and display checked against a version whose Romans 14 really does end at 9 (FAKE_B)", () => {
    // Same gate, different version — reads real per-version data, not a
    // shared assumption (mirrors classifyBibleLink's per-version tests above).
    expect(
      completeTruncatedRange(FAKE_B, { bibleLink: "Romans 14", content: "Rom. 14:1–9" })
    ).toBeNull();
  });
});

describe("completeTruncatedRange — a same-chapter truncation", () => {
  it("should be a finding carrying the reconstructed target, en-dash separated", () => {
    const result = completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 12:3", content: "Ex. 12.3–20" });
    expect(result).not.toBeNull();
    expect(result!.reconstructedTarget).toBe("Exodus 12:3–20");
    expect(result!.declineReason).toBeNull();
  });
});

describe("completeTruncatedRange — a cross-chapter display is declined here, not reconstructed", () => {
  it("should be a finding with no reconstructed target when the display's range crosses a chapter boundary", () => {
    const result = completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 12:3", content: "Ex. 12.3–13.5" });
    expect(result).not.toBeNull();
    expect(result!.reconstructedTarget).toBeNull();
    expect(result!.declineReason).not.toBeNull();
  });

  it("should not name a command in the decline reason — there is no separate invocation left to name", () => {
    const result = completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 12:3", content: "Ex. 12.3–13.5" })!;
    expect(result.declineReason).not.toMatch(/npm|npx/);
  });
});

describe("completeTruncatedRange — not findings", () => {
  it("should not flag a target and display that already agree", () => {
    expect(
      completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 3:1–4", content: "Exodus 3:1–4" })
    ).toBeNull();
  });

  it("should not flag a display with no range at all", () => {
    expect(
      completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 12:3", content: "Exodus 12:3" })
    ).toBeNull();
  });

  it("should not flag a node with no display override", () => {
    expect(completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 12:3" })).toBeNull();
  });

  it("should not flag a display whose range endpoints do not parse", () => {
    expect(
      completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 12:3", content: "Ex. 12.3-ff" })
    ).toBeNull();
  });

  it("should not flag the deliberate siglum shape just because it classifies as unparsed", () => {
    expect(
      completeTruncatedRange(FAKE_A, { bibleLink: "Deuteronomy 32:43 LXX" })
    ).toBeNull();
  });

  it("should never flag a mergedTarget — a merge is confined to one chapter by construction", () => {
    expect(
      completeTruncatedRange(FAKE_A, { bibleLink: "Isaiah 66:10, 13", content: "Isa. 66:10-13" })
    ).toBeNull();
  });

  it("should not flag a target that already carries its own same-chapter range (nothing to complete)", () => {
    expect(
      completeTruncatedRange(FAKE_A, { bibleLink: "Exodus 12:3–20", content: "Ex. 12.3–20" })
    ).toBeNull();
  });
});

describe("formatTruncatedRangeFinding", () => {
  it("should format a completed-range finding into the one-line report format", () => {
    const finding: TruncatedRangeFinding = {
      book: "EXO",
      atBook: "EXO",
      atChapter: 12,
      atVerse: 3,
      footnoteType: "xrf",
      zone: "verse",
      target: "Exodus 12:3",
      display: "Ex. 12.3–20",
      reconstructedTarget: "Exodus 12:3–20",
      declineReason: null,
    };
    expect(formatTruncatedRangeFinding(finding)).toBe(
      'EXO 12:3 [xrf/verse]: "Exodus 12:3" truncated short of display "Ex. 12.3–20" — completes to "Exodus 12:3–20"',
    );
  });

  it("should format a declined finding without naming a command", () => {
    const finding: TruncatedRangeFinding = {
      book: "EXO",
      atBook: "EXO",
      atChapter: 12,
      atVerse: 3,
      footnoteType: "xrf",
      zone: "verse",
      target: "Exodus 12:3",
      display: "Ex. 12.3–13.5",
      reconstructedTarget: null,
      declineReason: "cross-chapter",
    };
    expect(formatTruncatedRangeFinding(finding)).not.toMatch(/npm|npx/);
  });
});

describe("reconstructTruncatedRangesInContent — the content-tree transform", () => {
  it("should replace bibleLink with the reconstructed target and leave content untouched", () => {
    const { content, changed, skipped } = reconstructTruncatedRangesInContent(FAKE_A, [
      "See ",
      { bibleLink: "Exodus 12:3", content: "Ex. 12:3–20" },
      ".",
    ]);
    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(content).toEqual(["See ", { bibleLink: "Exodus 12:3–20", content: "Ex. 12:3–20" }, "."]);
  });

  it("should read the endpoint correctly regardless of the display's own dot-notation punctuation, and always emit U+2013", () => {
    const { content, changed } = reconstructTruncatedRangesInContent(FAKE_A, {
      bibleLink: "Exodus 12:3",
      content: "Ex. 12.3-20",
    });
    expect(changed).toBe(true);
    expect(content).toEqual({ bibleLink: "Exodus 12:3–20", content: "Ex. 12.3-20" });
  });

  it("should leave a cross-chapter display's node unchanged and report it as skipped", () => {
    const original = { bibleLink: "Exodus 12:3", content: "Ex. 12.3–13.5" };
    const { content, changed, skipped } = reconstructTruncatedRangesInContent(FAKE_A, original);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
    expect(skipped).toEqual(["cross-chapter"]);
  });

  it("should leave a whole-chapter near-miss unchanged — not even seen as a finding", () => {
    const original = { bibleLink: "2 Samuel 22", content: "2 Sam. 22:1–12" };
    const { content, changed, skipped } = reconstructTruncatedRangesInContent(FAKE_A, original);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
    expect(skipped).toEqual([]);
  });

  it("should be idempotent — reconstructing an already-reconstructed node changes nothing", () => {
    const first = reconstructTruncatedRangesInContent(FAKE_A, {
      bibleLink: "Exodus 12:3",
      content: "Ex. 12:3–20",
    });
    expect(first.changed).toBe(true);

    const second = reconstructTruncatedRangesInContent(FAKE_A, first.content);
    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });
});

// A bibleLink names a location in Scripture, so it is judged against every
// version pooled together, never against the one version it is written in.
// FAKE_A's Mark 9 omits verse 7 — the shape a textual-variant footnote is
// written about — and FAKE_B carries it, so the pooled corpus resolves a
// link FAKE_A alone cannot.
describe("findUnresolvableTarget — the single-target entry point (G4)", () => {
  it("should report a verse no pooled version carries", () => {
    const result = findUnresolvableTarget("Mark 9:7", [FAKE_A]);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("verse-not-carried");
    expect(result!.book).toBe("MRK");
    expect(result!.chapter).toBe(9);
    expect(result!.verse).toBe(7);
  });

  it("should not flag that same verse once a version carrying it joins the pool — a link is not scoped to the version it sits in", () => {
    expect(findUnresolvableTarget("Mark 9:7", [FAKE_A, FAKE_B])).toBeNull();
  });

  it("should not flag a neighboring verse in the same chapter that the pool does carry", () => {
    expect(findUnresolvableTarget("Mark 9:6", [FAKE_A])).toBeNull();
  });

  it("should report a chapter no pooled version carries, naming the highest chapter one of them does", () => {
    const result = findUnresolvableTarget("Jude 2:1", [FAKE_A]);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("chapter-not-carried");
    expect(result!.book).toBe("JUD");
    expect(result!.chapter).toBe(2);
    expect(result!.lastChapterAnywhere).toBe(1);
  });

  it("should never flag a target naming a book no pooled version carries — book membership alone is never a finding", () => {
    expect(findUnresolvableTarget("Genesis 1:1", [FAKE_B])).toBeNull();
  });

  it("should not flag a target that resolves", () => {
    expect(findUnresolvableTarget("Exodus 3:3–4", [FAKE_A])).toBeNull();
  });

  it("should pool chapter lengths rather than take one version's — FAKE_A's Romans 14 ends at 6, FAKE_B's at 9", () => {
    expect(findUnresolvableTarget("Romans 14:8", [FAKE_A])).not.toBeNull();
    expect(findUnresolvableTarget("Romans 14:8", [FAKE_A, FAKE_B])).toBeNull();
  });

  it("should never flag a target the endpoint grammar cannot parse at all", () => {
    expect(findUnresolvableTarget("Deuteronomy 32:43 LXX", [FAKE_A])).toBeNull();
  });

  it("should never flag a comma-merged target — one never resolves to a book/chapter/verse to judge", () => {
    expect(findUnresolvableTarget("Isaiah 66:10, 13", [FAKE_A])).toBeNull();
  });
});

describe("formatUnresolvableTargetFinding", () => {
  it("should format a verse-not-carried finding into the one-line report format", () => {
    const finding: UnresolvableTargetFinding = {
      reason: "verse-not-carried",
      bookName: "Mark",
      book: "MRK",
      chapter: 9,
      verse: 46,
      lastChapterAnywhere: 16,
      atBook: "MRK",
      atChapter: 9,
      atVerse: 44,
      footnoteType: "var",
      zone: "verse",
      target: "Mark 9:46",
    };
    expect(formatUnresolvableTargetFinding(finding)).toBe(
      'MRK 9:44 [var/verse]: "Mark 9:46" does not resolve — Mark 9:46 — no version carries that verse',
    );
  });

  it("should name the highest chapter any version records in a chapter-not-carried finding's message", () => {
    const finding: UnresolvableTargetFinding = {
      reason: "chapter-not-carried",
      bookName: "Jude",
      book: "JUD",
      chapter: 2,
      verse: 1,
      lastChapterAnywhere: 1,
      atBook: "JUD",
      atChapter: 1,
      atVerse: 1,
      footnoteType: null,
      zone: "verse",
      target: "Jude 2:1",
    };
    expect(formatUnresolvableTargetFinding(finding)).toContain("1 chapter(s) in Jude");
  });
});

// A one-chapter book is cited by verse alone. That shorthand looks exactly
// like a chapter number, so the target needs the chapter written in while
// the display keeps the shorthand a reader expects to see.
describe("findSingleChapterShorthand — the single-target entry point", () => {
  it("should read a bare number after a one-chapter book as the verse it is", () => {
    expect(findSingleChapterShorthand("Jude 3", undefined, [FAKE_A])).toEqual({
      target: "Jude 1:3",
      display: "Jude 3",
    });
  });

  it("should read the ambiguous `Book 1` as verse one when nothing displays over the target", () => {
    expect(findSingleChapterShorthand("Jude 1", undefined, [FAKE_A])).toEqual({
      target: "Jude 1:1",
      display: "Jude 1",
    });
  });

  it("should read the ambiguous `Book 1` as verse one when the display names a number", () => {
    expect(findSingleChapterShorthand("Jude 1", "1", [FAKE_A])).toEqual({
      target: "Jude 1:1",
      display: "Jude 1",
    });
  });

  it("should leave the ambiguous `Book 1` alone when the display is a bare book name — a cross-reference pointing at the book", () => {
    expect(findSingleChapterShorthand("Jude 1", "Jude", [FAKE_A])).toBeNull();
  });

  it("should still rewrite any other number regardless of the display — a one-chapter book has no chapter two to mean", () => {
    expect(findSingleChapterShorthand("Jude 3", "Jude", [FAKE_A])).toEqual({
      target: "Jude 1:3",
      display: "Jude 3",
    });
  });

  it("should carry a range across, since only the first endpoint names the book", () => {
    expect(findSingleChapterShorthand("Jude 3–5", undefined, [FAKE_A])).toEqual({
      target: "Jude 1:3–5",
      display: "Jude 3–5",
    });
  });

  it("should leave a target that already spells its chapter out alone — the rewrite is idempotent", () => {
    expect(findSingleChapterShorthand("Jude 1:3", undefined, [FAKE_A])).toBeNull();
    expect(findSingleChapterShorthand("Jude 1:3–5", undefined, [FAKE_A])).toBeNull();
  });

  it("should leave a multi-chapter book's bare chapter alone — that target means the chapter", () => {
    expect(findSingleChapterShorthand("Genesis 2", undefined, [FAKE_A])).toBeNull();
  });

  it("should leave a book no pooled version carries alone — nothing says how many chapters it has", () => {
    expect(findSingleChapterShorthand("Jude 3", undefined, [FAKE_B])).toBeNull();
  });

  it("should never touch a target the endpoint grammar cannot parse", () => {
    expect(findSingleChapterShorthand("Deuteronomy 32:43 LXX", undefined, [FAKE_A])).toBeNull();
  });
});

// The fixer — normalizeSingleChapterShorthandInContent. What a reader sees
// never changes: a node with no display override of its own gains the
// shorthand it was already showing.
describe("normalizeSingleChapterShorthandInContent — the fixer", () => {
  it("should write the chapter into the target and leave an existing display override untouched", () => {
    const { content, changed } = normalizeSingleChapterShorthandInContent(
      { bibleLink: "Jude 3", content: "3" },
      [FAKE_A],
    );
    expect(changed).toBe(true);
    expect(content).toEqual({ bibleLink: "Jude 1:3", content: "3" });
  });

  it("should give a node with no display override the shorthand it was already rendering", () => {
    const { content, changed } = normalizeSingleChapterShorthandInContent({ bibleLink: "Jude 3" }, [FAKE_A]);
    expect(changed).toBe(true);
    expect(content).toEqual({ bibleLink: "Jude 1:3", content: "Jude 3" });
  });

  it("should leave a resolvable multi-chapter target untouched", () => {
    const original = { bibleLink: "Genesis 2" };
    const { content, changed } = normalizeSingleChapterShorthandInContent(original, [FAKE_A]);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
  });

  it("should leave a whole-book cross-reference alone, reading its own display override to tell", () => {
    const original = { bibleLink: "Jude 1", content: "Jude" };
    const { content, changed } = normalizeSingleChapterShorthandInContent(original, [FAKE_A]);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
  });

  it("should be idempotent — running it again on already-rewritten content changes nothing", () => {
    const first = normalizeSingleChapterShorthandInContent({ bibleLink: "Jude 3" }, [FAKE_A]);
    expect(first.changed).toBe(true);
    const second = normalizeSingleChapterShorthandInContent(first.content, [FAKE_A]);
    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });

  it("should rewrite inside an array without disturbing its neighbors", () => {
    const original: Content = [
      "see v. ",
      { bibleLink: "Jude 3", content: "3" },
      " and ",
      { bibleLink: "Exodus 3:2" },
      ".",
    ];
    const { content, changed } = normalizeSingleChapterShorthandInContent(original, [FAKE_A]);
    expect(changed).toBe(true);
    expect(content).toEqual([
      "see v. ",
      { bibleLink: "Jude 1:3", content: "3" },
      " and ",
      { bibleLink: "Exodus 3:2" },
      ".",
    ]);
  });

  it("should recurse into heading, subtitle, and foot.content the same way the cross-chapter split does", () => {
    const { content, changed } = normalizeSingleChapterShorthandInContent(
      { text: "a word", foot: { type: "trn", content: [{ bibleLink: "Jude 3", content: "3" }] } },
      [FAKE_A],
    );
    expect(changed).toBe(true);
    expect(content).toEqual({
      text: "a word",
      foot: { type: "trn", content: [{ bibleLink: "Jude 1:3", content: "3" }] },
    });
  });
});
