import { describe, it, expect } from "vitest";
import { classifyBibleLink, findCrossChapterLinks, fixCrossChapterLinks, splitCrossChapterLink, splitCrossChapterLinksInContent } from "../crossChapterLinks";

// Target strings are drawn from this repo's own six versions (ASV1901,
// BYZ2018, CLV1880, KJV1769, WEBUS2020, YLT1898) wherever a real example
// exists — WEBUS2020 is the only one with any `bibleLink` at all (423
// corpus-wide), so most fixtures are its own. Two shapes absent from this
// repo's data (`wholeChapterRange`, a bare chapter reference) are marked
// below as grammar illustrations, not real occurrences.

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

  it("should classify a whole-chapter range as wholeChapterRange, not a finding (grammar illustration — no such target exists in this repo's own six versions today)", () => {
    expect(classifyBibleLink("WEBUS2020", "Isaiah 36–39").shape).toBe("wholeChapterRange");
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
    // YLT1898's 3 John has 14 verses, matching the standard versification and
    // every other version here — an earlier import miscounted it as 15.
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

  it("should report '1 Esdras' as unresolvable in WEBUS2020 rather than throw (absent from every version's canon here)", () => {
    expect(() => classifyBibleLink("WEBUS2020", "1 Esdras 8:32")).not.toThrow();
    expect(classifyBibleLink("WEBUS2020", "1 Esdras 8:32").book).toBeNull();
  });

  it("should report a name valid in one version's canon as unresolvable in BYZ2018's NT-only canon", () => {
    // Genesis resolves in every version here but BYZ2018 carries no Old Testament.
    expect(classifyBibleLink("WEBUS2020", "Genesis 1:1").book).toBe("GEN");
    expect(classifyBibleLink("BYZ2018", "Genesis 1:1").book).toBeNull();
  });
});

describe("findCrossChapterLinks", () => {
  it("should report zero findings for WEBUS2020 now that this repo's own --fix run has split its one Hebrews 11:34 link", () => {
    // `auditCrossChapterLinks.ts WEBUS2020 --fix` already rewrote 58-HEB.json
    // for real; both split halves classify as singleChapter, so the finding
    // is gone rather than merely changed.
    expect(findCrossChapterLinks("WEBUS2020").findings).toHaveLength(0);
  });

  it("should report zero findings for a version with no bibleLinks at all", () => {
    expect(findCrossChapterLinks("ASV1901").findings).toHaveLength(0);
    expect(findCrossChapterLinks("BYZ2018").findings).toHaveLength(0);
  });

  it("should count every bibleLink node scanned, not just the ones that turn out to be findings", () => {
    const { scanned, findings } = findCrossChapterLinks("WEBUS2020");
    expect(scanned).toBe(424); // 423 (pre-fix) + 1: the split replaced one bibleLink node with two
    expect(findings.length).toBeLessThan(scanned);
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
    // Whole-version equivalent of the idempotence proof above: 58-HEB.json's
    // real fix is already applied, so there's nothing left to do.
    expect(fixCrossChapterLinks("WEBUS2020")).toHaveLength(0);
  });

  it("should never write to disk itself — calling it twice must not change what it returns", () => {
    expect(JSON.stringify(fixCrossChapterLinks("WEBUS2020"))).toBe(JSON.stringify(fixCrossChapterLinks("WEBUS2020")));
  });

  it("should report no book needing a fix for a version with no bibleLinks at all", () => {
    expect(fixCrossChapterLinks("ASV1901")).toHaveLength(0);
    expect(fixCrossChapterLinks("BYZ2018")).toHaveLength(0);
  });
});
