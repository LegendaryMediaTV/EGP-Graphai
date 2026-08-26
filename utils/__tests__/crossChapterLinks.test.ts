import { describe, it, expect } from "vitest";
import { getVersionDirectories } from "../../functions/getBibleVersions";
import Content from "../../types/Content";
import {
  classifyBibleLink,
  completeTruncatedRange,
  CrossChapterFinding,
  findCrossChapterLinks,
  findTruncatedRanges,
  findUnresolvableTarget,
  findUnresolvableTargets,
  fixCrossChapterLinks,
  formatCrossChapterFinding,
  formatTruncatedRangeFinding,
  formatUnresolvableTargetFinding,
  reconstructTruncatedRangesInContent,
  splitCrossChapterLink,
  splitCrossChapterLinksInContent,
  TruncatedRangeFinding,
  unlinkUnresolvableTargetsInContent,
  UnresolvableTargetFinding,
} from "../crossChapterLinks";

// Target strings are drawn from this repo's own versions wherever a real
// example exists — WEBUS2020 and YLT1898 are the only ones carrying any
// `bibleLink` at all, so most fixtures are theirs. One shape absent from real
// data (a bare chapter reference) is marked below as a grammar illustration,
// not an occurrence.

describe("classifyBibleLink — target shape", () => {
  it("should classify an em-dash cross-chapter target as crossChapterRange (the real WEBUS2020 Hebrews 11:34 finding)", () => {
    expect(classifyBibleLink("WEBUS2020", "2 Kings 6:31—7:20").shape).toBe("crossChapterRange");
  });

  it("should classify the same target written with an en dash as crossChapterRange", () => {
    expect(classifyBibleLink("WEBUS2020", "2 Kings 6:31–7:20").shape).toBe("crossChapterRange");
  });

  it("should classify the same target written with an ASCII hyphen as crossChapterRange", () => {
    expect(classifyBibleLink("WEBUS2020", "2 Kings 6:31-7:20").shape).toBe("crossChapterRange");
  });

  it("should classify a same-chapter verse range as singleChapter (real WEBUS2020 target, Exodus 3:3-4 footnote)", () => {
    expect(classifyBibleLink("WEBUS2020", "Exodus 3:3–4").shape).toBe("singleChapter");
  });

  it("should classify a whole-chapter range as wholeChapterRange — a finding, split with no verse anchor (real YLT1898 target, pre-fix; see the splitCrossChapterLink and fixCrossChapterLinks suites below for the real, now-applied split)", () => {
    expect(classifyBibleLink("YLT1898", "Romans 1–11").shape).toBe("wholeChapterRange");
  });

  it("should classify a bare chapter reference as singleChapter (grammar illustration, same reason)", () => {
    expect(classifyBibleLink("WEBUS2020", "Psalm 23").shape).toBe("singleChapter");
  });

  it("should classify a comma-merged target as mergedTarget, not crossChapterRange (real WEBUS2020 target, Matthew 5:4 footnote)", () => {
    expect(classifyBibleLink("WEBUS2020", "Isaiah 66:10, 13").shape).toBe("mergedTarget");
  });

  it("should not misread a merged target's internal dash-and-comma as a second endpoint (real WEBUS2020 target, John 10:11 footnote)", () => {
    expect(classifyBibleLink("WEBUS2020", "Ezekiel 34:11–12, 15, 22").shape).toBe("mergedTarget");
  });

  it("should report an unparsed siglum-suffixed target rather than throw (real WEBUS2020 target, Hebrews 1:6 footnote)", () => {
    expect(() => classifyBibleLink("WEBUS2020", "Deuteronomy 32:43 LXX")).not.toThrow();
    expect(classifyBibleLink("WEBUS2020", "Deuteronomy 32:43 LXX").shape).toBe("unparsed");
  });

  it("should find the em-dash target even though an en-dash-only pattern would miss it", () => {
    const target = "2 Kings 6:31—7:20"; // U+2014 EM DASH
    const enDashOnly = /–/; // U+2013 EN DASH only — the convention's own emitted character
    expect(enDashOnly.test(target)).toBe(false); // proves a naive en-dash-only detector reports a false all-clear
    expect(classifyBibleLink("WEBUS2020", target).shape).toBe("crossChapterRange");
  });
});

describe("classifyBibleLink — per-version chapter lengths", () => {
  it("should read Ezra 4's last verse (24) from ASV1901's own records", () => {
    expect(classifyBibleLink("ASV1901", "Ezra 4:8–6:18").firstChapterLastVerse).toBe(24);
  });

  it("should read 2 Kings 6's last verse (33) from WEBUS2020's own records", () => {
    expect(classifyBibleLink("WEBUS2020", "2 Kings 6:31—7:20").firstChapterLastVerse).toBe(33);
  });

  it("should read Romans 14's last verse as 23 from ASV1901 but 26 from WEBUS2020, same function, different version", () => {
    expect(classifyBibleLink("ASV1901", "Romans 14:1").firstChapterLastVerse).toBe(23);
    expect(classifyBibleLink("WEBUS2020", "Romans 14:1").firstChapterLastVerse).toBe(26);
  });

  it("should read 3 John 1's last verse as 14 from both WEBUS2020 and YLT1898", () => {
    expect(classifyBibleLink("WEBUS2020", "3 John 1:1").firstChapterLastVerse).toBe(14);
    expect(classifyBibleLink("YLT1898", "3 John 1:1").firstChapterLastVerse).toBe(14);
  });

  it("should report a chapter this version does not carry as unknown, not default it to 0", () => {
    // BYZ2018 is NT-only (27 books) — Genesis is entirely absent from its canon.
    const result = classifyBibleLink("BYZ2018", "Genesis 1:1");
    expect(result.firstChapterLastVerse).toBeNull();
    expect(result.firstChapterLastVerse).not.toBe(0);
  });
});

describe("classifyBibleLink — book-name resolution restricted to a version's own canon", () => {
  it("should resolve '2 Kings' to 2KG in WEBUS2020", () => {
    expect(classifyBibleLink("WEBUS2020", "2 Kings 6:31—7:20").book).toBe("2KG");
  });

  it("should report 'Psalms of Solomon' as unresolvable in WEBUS2020 rather than throw (a real bible-books.json entry, but absent from every version's canon here)", () => {
    expect(() => classifyBibleLink("WEBUS2020", "Psalms of Solomon 8:32")).not.toThrow();
    expect(classifyBibleLink("WEBUS2020", "Psalms of Solomon 8:32").book).toBeNull();
  });

  it("should report a name valid in one version's canon as unresolvable in BYZ2018's NT-only canon", () => {
    // Genesis resolves in every version here but BYZ2018 carries no Old Testament.
    expect(classifyBibleLink("WEBUS2020", "Genesis 1:1").book).toBe("GEN");
    expect(classifyBibleLink("BYZ2018", "Genesis 1:1").book).toBeNull();
  });
});

describe("findCrossChapterLinks", () => {
  it("should report zero findings for WEBUS2020 now that this repo's own --fix run has split its one Hebrews 11:34 link", () => {
    expect(findCrossChapterLinks("WEBUS2020").findings).toHaveLength(0);
  });

  it("should report zero findings for YLT1898 now that this repo's own --fix run has split its nine whole-chapter-range links", () => {
    expect(findCrossChapterLinks("YLT1898").findings).toHaveLength(0);
  });

  it("should report zero findings for a version with no bibleLinks at all", () => {
    expect(findCrossChapterLinks("ASV1901").findings).toHaveLength(0);
    expect(findCrossChapterLinks("BYZ2018").findings).toHaveLength(0);
  });

  it("should count every bibleLink node scanned, not just the ones that turn out to be findings", () => {
    // This total drifts as the corpus changes — update it here rather than
    // treating a mismatch as a bug in findCrossChapterLinks.
    const { scanned, findings } = findCrossChapterLinks("WEBUS2020");
    expect(scanned).toBe(550);
    expect(findings.length).toBeLessThan(scanned);
  });
});

describe("findCrossChapterLinks — corpus-wide sweep (was auditCrossChapterLinks.ts's auditVersions())", () => {
  // Scans every version on disk — a corpus that only grows over time — so
  // this gets an explicit timeout instead of vitest's 5s default.
  it("should find zero cross-chapter findings across every version on disk", () => {
    const allFindings = getVersionDirectories().flatMap((version) => findCrossChapterLinks(version).findings);
    expect(allFindings).toHaveLength(0);
  }, 15000);

  it("should never write to bible-versions/ — running the sweep twice must produce byte-identical results", () => {
    // Impossible if any code path here mutated the files it reads.
    const sweep = () => getVersionDirectories().map((version) => findCrossChapterLinks(version));
    expect(JSON.stringify(sweep())).toBe(JSON.stringify(sweep()));
  }, 15000);
});

describe("formatCrossChapterFinding (was auditCrossChapterLinks.ts's own function, moved here)", () => {
  it("should format the real pre-fix Hebrews 11:34 finding into the one-line report format", () => {
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

describe("splitCrossChapterLink — the real WEBUS2020 Hebrews 11:34 node (pure function only — must not write to bible-versions/WEBUS2020/)", () => {
  it("should split 2 Kings 6:31—7:20 into two chapter-scoped halves, normalizing the emitted separator to the en dash", () => {
    const link = { bibleLink: "2 Kings 6:31—7:20" }; // real node — em dash, no content override at all
    const split = splitCrossChapterLink("WEBUS2020", link);

    expect(split).not.toBeNull();
    const [partA, dash, partB] = split!;
    expect(partA).toEqual({ bibleLink: "2 Kings 6:31–33", content: "2 Kings 6:31" });
    expect(dash).toBe("–"); // the convention's own en dash, even though the source used an em dash
    expect(partB).toEqual({ bibleLink: "2 Kings 7:1–20", content: "7:20" });
  });

  it("should re-derive Part A's chapter-6 last verse (33) from WEBUS2020's own data rather than hardcode it", () => {
    expect(classifyBibleLink("WEBUS2020", "2 Kings 6:31—7:20").firstChapterLastVerse).toBe(33);
  });

  it("should return null for a target that needs no split", () => {
    expect(splitCrossChapterLink("WEBUS2020", { bibleLink: "Exodus 3:3–4" })).toBeNull();
  });
});

describe("splitCrossChapterLink — whole-chapter ranges (pure function only — must not write to bible-versions/YLT1898/)", () => {
  it("should split a whole-chapter range into two bare chapter references, with no verse anchor on either half (real YLT1898 target, pre-fix)", () => {
    const link = { bibleLink: "Romans 1–11", content: "ch. i–xi" };
    const split = splitCrossChapterLink("YLT1898", link);

    expect(split).not.toBeNull();
    const [partA, dash, partB] = split!;
    expect(partA).toEqual({ bibleLink: "Romans 1", content: "ch. i" });
    expect(dash).toBe("–");
    expect(partB).toEqual({ bibleLink: "Romans 11", content: "xi" });
  });

  it("should read Part B's chapter number, not fold it into a verse the way crossChapterRange does", () => {
    const [, , partB] = splitCrossChapterLink("YLT1898", { bibleLink: "2 Corinthians 10–12" })!;
    expect(partB).toEqual({ bibleLink: "2 Corinthians 12", content: "12" });
  });

  it("should drop Part A's content override when its display matches its own target, but keep Part B's bare chapter number as an override (its display never gained the book name a bare target needs)", () => {
    const [partA, , partB] = splitCrossChapterLink("YLT1898", { bibleLink: "Revelation 4–20" })!;
    expect(partA).toEqual({ bibleLink: "Revelation 4" });
    expect(partB).toEqual({ bibleLink: "Revelation 20", content: "20" });
  });
});

describe("splitCrossChapterLink — chapter-existence guard", () => {
  // Every fixture here uses Jude (JUD) against YLT1898 — both are part of
  // this repo's own corpus, and Jude is single-chapter in every version
  // checked, so "chapter 2" is guaranteed absent without depending on data
  // this repo doesn't have.

  it("should throw for a wholeChapterRange target whose fromChapter is absent (Jude 2–3, YLT1898's Jude has only chapter 1)", () => {
    expect(() => splitCrossChapterLink("YLT1898", { bibleLink: "Jude 2–3" })).toThrow("cannot derive YLT1898's chapter length for:");
  });

  it("should throw for a wholeChapterRange target whose toChapter is absent (Jude 1–2, YLT1898's Jude has only chapter 1)", () => {
    expect(() => splitCrossChapterLink("YLT1898", { bibleLink: "Jude 1–2" })).toThrow("YLT1898 carries no Jude 2 for:");
  });

  it("should throw for a crossChapterRange target whose toChapter is absent (Jude 1:5–2:3)", () => {
    expect(() => splitCrossChapterLink("YLT1898", { bibleLink: "Jude 1:5–2:3" })).toThrow("YLT1898 carries no Jude 2 for:");
  });

  it("should still throw for a crossChapterRange target whose fromChapter is absent (Jude 2:5–3:1) — already threw before this guard; kept so the hoisting refactor cannot regress it", () => {
    expect(() => splitCrossChapterLink("YLT1898", { bibleLink: "Jude 2:5–3:1" })).toThrow("cannot derive YLT1898's chapter length for:");
  });
});

describe("splitCrossChapterLinksInContent — the content-array splice", () => {
  it("should splice a bare {bibleLink} footnote content into its three-part replacement", () => {
    const { content, splits } = splitCrossChapterLinksInContent("WEBUS2020", { bibleLink: "2 Kings 6:31—7:20" });

    expect(splits).toBe(1);
    expect(content).toEqual([{ bibleLink: "2 Kings 6:31–33", content: "2 Kings 6:31" }, "–", { bibleLink: "2 Kings 7:1–20", content: "7:20" }]);
  });

  it("should splice a bibleLink inside a mixed array of surrounding content, leaving the other entries untouched and in order (the real WEBUS2020 Hebrews 11:34 shape)", () => {
    const original = [{ bibleLink: "1 Kings 19:1–3" }, "; ", { bibleLink: "2 Kings 6:31—7:20" }];
    const { content, splits } = splitCrossChapterLinksInContent("WEBUS2020", original);

    expect(splits).toBe(1);
    expect(content).toEqual([
      { bibleLink: "1 Kings 19:1–3" },
      "; ",
      { bibleLink: "2 Kings 6:31–33", content: "2 Kings 6:31" },
      "–",
      { bibleLink: "2 Kings 7:1–20", content: "7:20" },
    ]);
  });

  it("should leave content with no cross-chapter link untouched and report zero splits", () => {
    const original = [{ text: "quenched the power of fire," }, { bibleLink: "Daniel 3:1–30" }];
    const { content, splits } = splitCrossChapterLinksInContent("WEBUS2020", original);

    expect(splits).toBe(0);
    expect(content).toEqual(original);
  });
});

describe("splitCrossChapterLinksInContent — idempotence", () => {
  it("should report zero splits and leave already-split content unchanged on a second pass", () => {
    const original = [{ bibleLink: "1 Kings 19:1–3" }, "; ", { bibleLink: "2 Kings 6:31—7:20" }];
    const first = splitCrossChapterLinksInContent("WEBUS2020", original);
    expect(first.splits).toBe(1);

    const second = splitCrossChapterLinksInContent("WEBUS2020", first.content);
    expect(second.splits).toBe(0);
    expect(second.content).toEqual(first.content);
  });
});

describe("fixCrossChapterLinks — read-only, whole-version application", () => {
  it("should report nothing left to fix for WEBUS2020, now that this repo's own --fix run has already split 58-HEB.json's Hebrews 11:34 link", () => {
    expect(fixCrossChapterLinks("WEBUS2020")).toHaveLength(0);
  });

  it("should report nothing left to fix for YLT1898, now that this repo's own --fix run has already split its nine whole-chapter-range links", () => {
    expect(fixCrossChapterLinks("YLT1898")).toHaveLength(0);
  });

  it("should never write to disk itself — calling it twice must not change what it returns", () => {
    expect(JSON.stringify(fixCrossChapterLinks("WEBUS2020"))).toBe(JSON.stringify(fixCrossChapterLinks("WEBUS2020")));
  });

  it("should report no book needing a fix for a version with no bibleLinks at all", () => {
    expect(fixCrossChapterLinks("ASV1901")).toHaveLength(0);
    expect(fixCrossChapterLinks("BYZ2018")).toHaveLength(0);
  });
});

// A bibleLink whose target is truncated short of the range its own display
// override names. This corpus carries zero real instances, so every fixture
// here is hand-authored — but each version's chapter-length fact it depends
// on (ASV1901's real Romans 14 and 2 Samuel 22) is real, checked against
// that version's own data.
describe("completeTruncatedRange — the real ASV1901 PSA 18:1 near-miss (whole-chapter-equivalence gate)", () => {
  it("should NOT be a finding: a bare-chapter target whose display spells out that exact chapter's own verses 1..51 (ASV1901's real 2 Samuel 22 length)", () => {
    // The real, unedited ASV1901 PSA 18:1 footnote link — a false positive
    // here would flag real, correct content.
    expect(
      completeTruncatedRange("ASV1901", { bibleLink: "2 Samuel 22", content: "2 Sam. 22:1–51" })
    ).toBeNull();
  });
});

describe("completeTruncatedRange — the whole-chapter gate rejects a display that only looks equivalent", () => {
  it("should be a finding when the display range starts somewhere other than verse 1 (ASV1901's real 2 Samuel 22 still ends at 51)", () => {
    const result = completeTruncatedRange("ASV1901", { bibleLink: "2 Samuel 22", content: "2 Sam. 22:5–51" });
    expect(result).not.toBeNull();
  });

  it("should be a finding when the display's claimed chapter length disagrees with this version's own data (ASV1901's real Romans 14 ends at 23, not 26)", () => {
    const result = completeTruncatedRange("ASV1901", { bibleLink: "Romans 14", content: "Rom. 14:1–26" });
    expect(result).not.toBeNull();
  });

  it("should NOT be a finding for the identical target and display checked against a version whose Romans 14 really does end at 26 (WEBUS2020)", () => {
    // Same shape, same function, different version — the gate reads real
    // per-version data rather than a shared assumption, matching
    // classifyBibleLink's own per-version chapter-length tests above.
    expect(
      completeTruncatedRange("WEBUS2020", { bibleLink: "Romans 14", content: "Rom. 14:1–26" })
    ).toBeNull();
  });
});

describe("completeTruncatedRange — a same-chapter truncation", () => {
  it("should be a finding carrying the reconstructed target, en-dash separated", () => {
    const result = completeTruncatedRange("ASV1901", { bibleLink: "Exodus 12:3", content: "Ex. 12.3–20" });
    expect(result).not.toBeNull();
    expect(result!.reconstructedTarget).toBe("Exodus 12:3–20");
    expect(result!.declineReason).toBeNull();
  });
});

describe("completeTruncatedRange — a cross-chapter display is declined here, not reconstructed", () => {
  it("should be a finding with no reconstructed target when the display's range crosses a chapter boundary", () => {
    const result = completeTruncatedRange("ASV1901", { bibleLink: "Exodus 12:3", content: "Ex. 12.3–13.5" });
    expect(result).not.toBeNull();
    expect(result!.reconstructedTarget).toBeNull();
    expect(result!.declineReason).not.toBeNull();
  });

  it("should not name a command in the decline reason — there is no separate invocation left to name", () => {
    const result = completeTruncatedRange("ASV1901", { bibleLink: "Exodus 12:3", content: "Ex. 12.3–13.5" })!;
    expect(result.declineReason).not.toMatch(/npm|npx/);
  });
});

describe("completeTruncatedRange — not findings", () => {
  it("should not flag a target and display that already agree (real ASV1901 Joshua 21:22–29)", () => {
    expect(
      completeTruncatedRange("ASV1901", { bibleLink: "Joshua 21:22–29", content: "Josh. 21:22–29" })
    ).toBeNull();
  });

  it("should not flag a display with no range at all", () => {
    expect(
      completeTruncatedRange("ASV1901", { bibleLink: "Exodus 12:3", content: "Exodus 12:3" })
    ).toBeNull();
  });

  it("should not flag a node with no display override", () => {
    expect(completeTruncatedRange("ASV1901", { bibleLink: "Exodus 12:3" })).toBeNull();
  });

  it("should not flag a display whose range endpoints do not parse", () => {
    expect(
      completeTruncatedRange("ASV1901", { bibleLink: "Exodus 12:3", content: "Ex. 12.3-ff" })
    ).toBeNull();
  });

  it("should not flag the deliberate siglum shape just because it classifies as unparsed (real WEBUS2020 Hebrews 1:6 target)", () => {
    expect(
      completeTruncatedRange("WEBUS2020", { bibleLink: "Deuteronomy 32:43 LXX" })
    ).toBeNull();
  });

  it("should never flag a mergedTarget (real WEBUS2020 Matthew 5:4 target) — a merge is confined to one chapter by construction", () => {
    expect(
      completeTruncatedRange("WEBUS2020", { bibleLink: "Isaiah 66:10, 13", content: "Isa. 66:10-13" })
    ).toBeNull();
  });

  it("should not flag a target that already carries its own same-chapter range (nothing to complete)", () => {
    expect(
      completeTruncatedRange("ASV1901", { bibleLink: "Exodus 12:3–20", content: "Ex. 12.3–20" })
    ).toBeNull();
  });
});

describe("findTruncatedRanges — corpus-wide sweep", () => {
  it("should find zero truncated-range findings across every version on disk", () => {
    const allFindings = getVersionDirectories().flatMap((version) => findTruncatedRanges(version).findings);
    expect(allFindings).toHaveLength(0);
  }, 15000);

  it("should never write to bible-versions/ — running the sweep twice must produce byte-identical results", () => {
    const sweep = () => getVersionDirectories().map((version) => findTruncatedRanges(version));
    expect(JSON.stringify(sweep())).toBe(JSON.stringify(sweep()));
  }, 15000);
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
  it("should replace bibleLink with the reconstructed target and leave content untouched (ASV1901-shaped fixture)", () => {
    const { content, changed, skipped } = reconstructTruncatedRangesInContent("ASV1901", [
      "See ",
      { bibleLink: "Exodus 12:3", content: "Ex. 12:3–20" },
      ".",
    ]);
    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(content).toEqual(["See ", { bibleLink: "Exodus 12:3–20", content: "Ex. 12:3–20" }, "."]);
  });

  it("should read the endpoint correctly regardless of the display's own dot-notation punctuation, and always emit U+2013", () => {
    const { content, changed } = reconstructTruncatedRangesInContent("ASV1901", {
      bibleLink: "Exodus 12:3",
      content: "Ex. 12.3-20",
    });
    expect(changed).toBe(true);
    expect(content).toEqual({ bibleLink: "Exodus 12:3–20", content: "Ex. 12.3-20" });
  });

  it("should leave a cross-chapter display's node unchanged and report it as skipped", () => {
    const original = { bibleLink: "Exodus 12:3", content: "Ex. 12.3–13.5" };
    const { content, changed, skipped } = reconstructTruncatedRangesInContent("ASV1901", original);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
    expect(skipped).toEqual(["cross-chapter"]);
  });

  it("should leave the real ASV1901 PSA 18:1 whole-chapter near-miss unchanged — not even seen as a finding", () => {
    const original = { bibleLink: "2 Samuel 22", content: "2 Sam. 22:1–51" };
    const { content, changed, skipped } = reconstructTruncatedRangesInContent("ASV1901", original);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
    expect(skipped).toEqual([]);
  });

  it("should be idempotent — reconstructing an already-reconstructed node changes nothing", () => {
    const first = reconstructTruncatedRangesInContent("ASV1901", {
      bibleLink: "Exodus 12:3",
      content: "Ex. 12:3–20",
    });
    expect(first.changed).toBe(true);

    const second = reconstructTruncatedRangesInContent("ASV1901", first.content);
    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });
});

// A bibleLink target must resolve to a verse the version actually carries.
// The real ASV1901 Mark 9:44 case is the shape this exists for: its own
// footnote explains that verses 44 and 46 "are omitted by the best ancient
// authorities," and its link to "Mark 9:46" lands nowhere, since ASV1901
// never recorded that verse. The tests below classify the bare target
// string directly, so they hold regardless of whether the corpus itself
// still links to it.
describe("findUnresolvableTarget — the single-target entry point (G4)", () => {
  it("should report the real ASV1901 Mark 9:44 finding — a target naming a verse the chapter does not carry (ASV1901's Mark 9 runs to verse 50, but verse 46 itself was never recorded)", () => {
    const result = findUnresolvableTarget("ASV1901", "Mark 9:46");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("verse-not-carried");
    expect(result!.book).toBe("MRK");
    expect(result!.chapter).toBe(9);
    expect(result!.verse).toBe(46);
  });

  it("should not flag Mark 9:44 itself, the neighboring target in the same footnote — ASV1901 does carry a record for it", () => {
    expect(findUnresolvableTarget("ASV1901", "Mark 9:44")).toBeNull();
  });

  it("should report a target naming a chapter the version does not carry, naming this version's own real last chapter (YLT1898's real Jude has only chapter 1)", () => {
    const result = findUnresolvableTarget("YLT1898", "Jude 2:1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("chapter-not-carried");
    expect(result!.book).toBe("JUD");
    expect(result!.chapter).toBe(2);
    expect(result!.lastChapterInVersion).toBe(1);
  });

  it("should report a target naming a book outside the version's own canon, with its own reason (BYZ2018 carries no Old Testament)", () => {
    const result = findUnresolvableTarget("BYZ2018", "Genesis 1:1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("book-not-in-canon");
    expect(result!.book).toBeNull();
    expect(result!.bookName).toBe("Genesis");
  });

  it("should not flag a target that resolves (real WEBUS2020 Exodus 3:3–4 footnote target)", () => {
    expect(findUnresolvableTarget("WEBUS2020", "Exodus 3:3–4")).toBeNull();
  });

  it("should read this version's own real last verse rather than a shared table — ASV1901's Romans 14 ends at 23", () => {
    const result = findUnresolvableTarget("ASV1901", "Romans 14:26");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("verse-not-carried");
  });

  it("should not flag the identical verse number checked against a version whose chapter really does run that long (WEBUS2020's Romans 14 ends at 26)", () => {
    expect(findUnresolvableTarget("WEBUS2020", "Romans 14:26")).toBeNull();
  });

  it("should never flag a target the endpoint grammar cannot parse at all — the real WEBUS2020 Hebrews 1:6 siglum verify.ts already asserts by name", () => {
    expect(findUnresolvableTarget("WEBUS2020", "Deuteronomy 32:43 LXX")).toBeNull();
  });

  it("should never flag a comma-merged target — classifyBibleLink never resolves one to a book/chapter/verse to judge (real WEBUS2020 Matthew 5:4 target)", () => {
    expect(findUnresolvableTarget("WEBUS2020", "Isaiah 66:10, 13")).toBeNull();
  });
});

describe("findUnresolvableTargets — corpus-wide sweep (G4)", () => {
  it("should report zero findings corpus-wide, now that this repo's own --fix run has unlinked its one real ASV1901 Mark 9:44 finding", () => {
    const allFindings = getVersionDirectories().flatMap((version) => findUnresolvableTargets(version).findings);
    expect(allFindings).toHaveLength(0);
  }, 15000);

  it("should never write to bible-versions/ — running the sweep twice must produce byte-identical results", () => {
    const sweep = () => getVersionDirectories().map((version) => findUnresolvableTargets(version));
    expect(JSON.stringify(sweep())).toBe(JSON.stringify(sweep()));
  }, 15000);
});

describe("formatUnresolvableTargetFinding", () => {
  it("should format a verse-not-carried finding into the one-line report format", () => {
    const finding: UnresolvableTargetFinding = {
      reason: "verse-not-carried",
      bookName: "Mark",
      book: "MRK",
      chapter: 9,
      verse: 46,
      lastChapterInVersion: 16,
      atBook: "MRK",
      atChapter: 9,
      atVerse: 44,
      footnoteType: "var",
      zone: "verse",
      target: "Mark 9:46",
    };
    expect(formatUnresolvableTargetFinding(finding)).toBe(
      'MRK 9:44 [var/verse]: "Mark 9:46" does not resolve — Mark 9:46 — this version carries no such verse',
    );
  });

  it("should name this version's own real chapter count in a chapter-not-carried finding's message", () => {
    const finding: UnresolvableTargetFinding = {
      reason: "chapter-not-carried",
      bookName: "Jude",
      book: "JUD",
      chapter: 2,
      verse: 1,
      lastChapterInVersion: 1,
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

// The fixer — unlinkUnresolvableTargetsInContent. Its substitution is
// exactly what a reader was already seeing: a string override collapses to
// that override as plain content; no override at all collapses to the
// target string; an object or array override keeps that value as its own
// content; a resolvable node is untouched; an unparsed target is never
// touched; an override present but empty declines with a named reason.
describe("unlinkUnresolvableTargetsInContent — the fixer (G4)", () => {
  it("should collapse the real ASV1901 Mark 9:44 shape's string override to plain content", () => {
    const { content, changed, skipped } = unlinkUnresolvableTargetsInContent("ASV1901", {
      bibleLink: "Mark 9:46",
      content: "46",
    });
    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(content).toBe("46");
  });

  it("should collapse to the target string itself when there is no display override at all — what the reader was already seeing", () => {
    const { content, changed } = unlinkUnresolvableTargetsInContent("ASV1901", { bibleLink: "Mark 9:46" });
    expect(changed).toBe(true);
    expect(content).toBe("Mark 9:46");
  });

  it("should keep an object override as its own content, not the target string (synthetic — no real corpus case)", () => {
    const override: Content = { text: "the omitted verse", marks: ["i"] };
    const { content, changed } = unlinkUnresolvableTargetsInContent("ASV1901", {
      bibleLink: "Mark 9:46",
      content: override,
    });
    expect(changed).toBe(true);
    expect(content).toEqual(override);
  });

  it("should keep an array override as its own content, not the target string (synthetic — no real corpus case)", () => {
    const override: Content = [{ text: "the " }, { text: "omitted", marks: ["i"] }, { text: " verse" }];
    const { content, changed } = unlinkUnresolvableTargetsInContent("ASV1901", {
      bibleLink: "Mark 9:46",
      content: override,
    });
    expect(changed).toBe(true);
    expect(content).toEqual(override);
  });

  it("should leave a resolvable bibleLink node untouched", () => {
    const original = { bibleLink: "Mark 9:44" };
    const { content, changed, skipped } = unlinkUnresolvableTargetsInContent("ASV1901", original);
    expect(changed).toBe(false);
    expect(skipped).toEqual([]);
    expect(content).toEqual(original);
  });

  it("should never touch a target the endpoint grammar cannot parse — the real WEBUS2020 Hebrews 1:6 siglum verify.ts already asserts by name", () => {
    const original = { bibleLink: "Deuteronomy 32:43 LXX" };
    const { content, changed } = unlinkUnresolvableTargetsInContent("WEBUS2020", original);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
  });

  it("should decline with a named reason, rather than deleting text outright, when the override is present but empty (synthetic)", () => {
    const original = { bibleLink: "Mark 9:46", content: { text: "" } };
    const { content, changed, skipped } = unlinkUnresolvableTargetsInContent("ASV1901", original);
    expect(changed).toBe(false);
    expect(content).toEqual(original);
    expect(skipped).toEqual(["empty-override"]);
  });

  it("should splice the real ASV1901 Mark 9:44 footnote array in place, leaving the resolvable neighbors untouched", () => {
    const original = [
      { bibleLink: "Mark 9:44" },
      " and ",
      { bibleLink: "Mark 9:46", content: "46" },
      " (which are identical with ",
      { bibleLink: "Mark 9:48" },
      ") are omitted by the best ancient authorities.",
    ];
    const { content, changed, skipped } = unlinkUnresolvableTargetsInContent("ASV1901", original);
    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(content).toEqual([
      { bibleLink: "Mark 9:44" },
      " and ",
      "46",
      " (which are identical with ",
      { bibleLink: "Mark 9:48" },
      ") are omitted by the best ancient authorities.",
    ]);
  });

  it("should be idempotent — running it again on already-unlinked content changes nothing", () => {
    const first = unlinkUnresolvableTargetsInContent("ASV1901", { bibleLink: "Mark 9:46", content: "46" });
    expect(first.changed).toBe(true);

    const second = unlinkUnresolvableTargetsInContent("ASV1901", first.content);
    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });

  it("should recurse into heading, subtitle, and foot.content the same way the cross-chapter split does", () => {
    const { content, changed } = unlinkUnresolvableTargetsInContent("ASV1901", {
      text: "omitted",
      foot: { type: "var", content: [{ bibleLink: "Mark 9:46", content: "46" }] },
    });
    expect(changed).toBe(true);
    expect(content).toEqual({ text: "omitted", foot: { type: "var", content: ["46"] } });
  });
});
