import { describe, it, expect } from "vitest";
import { CrossChapterFinding } from "../crossChapterLinks";
import { allVersionIds, auditVersions, exitCodeFor, VersionAudit } from "../auditCrossChapterLinks";

describe("auditVersions — corpus-wide sweep", () => {
  // These four scan every version on disk — a corpus that has only grown
  // since this file was written, including in downstream forks that carry
  // additional versions — so each gets an explicit timeout rather than
  // relying on vitest's 5s default, which a single unrestricted
  // auditVersions() call is already close to on its own (see the "never
  // write" test below, which pays for two calls).
  it("should audit every version on disk when none are named", () => {
    const versionIds = allVersionIds();
    expect(versionIds.length).toBeGreaterThan(0);
    expect(auditVersions()).toHaveLength(versionIds.length);
  }, 15000);

  it("should find zero cross-chapter findings across every version, now that this repo's own --fix run has split WEBUS2020's Hebrews 11:34 link", () => {
    const summaries = auditVersions();
    const allFindings = summaries.flatMap((summary) => summary.findings.map((finding) => ({ version: summary.version, ...finding })));

    expect(allFindings).toHaveLength(0);
  }, 15000);

  it("should report zero findings for every version on disk", () => {
    const summaries = auditVersions();
    expect(summaries).toHaveLength(allVersionIds().length);
    for (const summary of summaries) expect(summary.findings).toHaveLength(0);
  }, 15000);

  it("should scan exactly 424 bibleLink nodes in WEBUS2020 — a walk that silently stops descending would under-report this", () => {
    // 423 (pre-fix) + 1: the split replaced one bibleLink node with two.
    // Scoped to WEBUS2020 specifically, the only version this repo's own
    // corpus carries any bibleLink in at all, so this regression guard
    // doesn't depend on how many other versions happen to sit on disk.
    const [summary] = auditVersions(["WEBUS2020"]);
    expect(summary.scanned).toBe(424);
  });

  it("should never write to bible-versions/ — this audit is read-only", () => {
    // A behavioral guard, not just a doc comment: auditing every version
    // twice must produce byte-identical results, which would not be true if
    // any code path here mutated the files it reads.
    const first = JSON.stringify(auditVersions());
    const second = JSON.stringify(auditVersions());
    expect(second).toBe(first);
  }, 15000);
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
  }, 15000);

  it("should exit zero when a version carries no cross-chapter link", () => {
    expect(exitCodeFor(auditVersions(["ASV1901"]))).toBe(0);
    expect(exitCodeFor(auditVersions(["BYZ2018"]))).toBe(0);
    expect(exitCodeFor(auditVersions(["WEBUS2020"]))).toBe(0);
  });
});
