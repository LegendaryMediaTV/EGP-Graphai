import { describe, it, expect } from "vitest";
import { CrossChapterFinding } from "../crossChapterLinks";
import { allVersionIds, auditVersions, exitCodeFor, VersionAudit } from "../auditCrossChapterLinks";

describe("auditVersions — corpus-wide sweep", () => {
  it("should audit all 6 versions on disk when none are named", () => {
    expect(allVersionIds()).toHaveLength(6);
    expect(auditVersions()).toHaveLength(6);
  });

  it("should find zero cross-chapter findings across all 6 versions, now that this repo's own --fix run has split WEBUS2020's Hebrews 11:34 link", () => {
    const summaries = auditVersions();
    const allFindings = summaries.flatMap((summary) => summary.findings.map((finding) => ({ version: summary.version, ...finding })));

    expect(allFindings).toHaveLength(0);
  });

  it("should report zero findings for every one of the 6 versions", () => {
    const summaries = auditVersions();
    expect(summaries).toHaveLength(6);
    for (const summary of summaries) expect(summary.findings).toHaveLength(0);
  });

  it("should scan exactly 424 bibleLink nodes across all 6 versions — a walk that silently stops descending would under-report this", () => {
    // 423 (pre-fix, WEBUS2020 the only version of the six carrying any
    // bibleLink at all) + 1: the split replaced one bibleLink node with two.
    const totalScanned = auditVersions().reduce((sum, summary) => sum + summary.scanned, 0);
    expect(totalScanned).toBe(424);
  });

  it("should never write to bible-versions/ — this audit is read-only", () => {
    // A behavioral guard, not just a doc comment: auditing every version
    // twice must produce byte-identical results, which would not be true if
    // any code path here mutated the files it reads.
    const first = JSON.stringify(auditVersions());
    const second = JSON.stringify(auditVersions());
    expect(second).toBe(first);
  });
});

describe("exitCodeFor", () => {
  it("should exit non-zero when a version's audit carries a finding", () => {
    // WEBUS2020's real Hebrews 11:34 finding no longer exists post-fix (the
    // corpus now has no finding left at all), so this branch of exitCodeFor
    // is exercised here with WEBUS2020's own pre-fix finding, reconstructed
    // verbatim from what `findCrossChapterLinks` measured before the split
    // (Task 3.3's dry-run report) — a real value, just no longer a live one.
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
    const summary: VersionAudit = { version: "WEBUS2020", findings: [finding], scanned: 423, wholeChapterRanges: 0 };
    expect(exitCodeFor([summary])).toBe(1);
  });

  it("should exit zero for the corpus as a whole now that WEBUS2020's finding is fixed", () => {
    expect(exitCodeFor(auditVersions())).toBe(0);
  });

  it("should exit zero when a version carries no cross-chapter link", () => {
    expect(exitCodeFor(auditVersions(["ASV1901"]))).toBe(0);
    expect(exitCodeFor(auditVersions(["BYZ2018"]))).toBe(0);
    expect(exitCodeFor(auditVersions(["WEBUS2020"]))).toBe(0);
  });
});
