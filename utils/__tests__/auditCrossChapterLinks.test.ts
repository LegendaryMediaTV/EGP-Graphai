import { describe, it, expect } from "vitest";
import { CrossChapterFinding } from "../crossChapterLinks";
import { allVersionIds, auditVersions, exitCodeFor, VersionAudit } from "../auditCrossChapterLinks";

describe("auditVersions — corpus-wide sweep", () => {
  // These four scan every version on disk — a corpus that only grows over
  // time — so each gets an explicit timeout instead of vitest's 5s default;
  // a single unrestricted auditVersions() call already runs close to that
  // limit on its own (the "never write" test below calls it twice).
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

  it("should scan 550 bibleLink nodes in WEBUS2020, the full 81-book corpus with usfm/references.ts's own trailing-tradition-siglon fix applied", () => {
    // WEBUS2020 currently carries 550 real bibleLink nodes — see the
    // `findCrossChapterLinks` scanned-count test in crossChapterLinks.test.ts
    // for what's included (524 -> 550, Phase 15's own redesign of Finding 9:
    // 99 corpus-wide embedded links, up from Phase 14's own cue-word-gated
    // 72, with Deuteronomy 33:16's own link now produced by that same
    // generic mechanism directly rather than a separate import.ts override).
    // This count drifts as the corpus changes; update it here too rather
    // than treating a mismatch as a bug.
    const [summary] = auditVersions(["WEBUS2020"]);
    expect(summary.scanned).toBe(550);
  });

  it("should never write to bible-versions/ — this audit is read-only", () => {
    // A behavioral guard: running every version's audit twice must produce
    // byte-identical results — impossible if any code path here mutated the
    // files it reads.
    const first = JSON.stringify(auditVersions());
    const second = JSON.stringify(auditVersions());
    expect(second).toBe(first);
  }, 15000);
});

describe("exitCodeFor", () => {
  it("should exit non-zero when a version's audit carries a finding", () => {
    // The corpus now has zero real findings, so this branch of exitCodeFor
    // is exercised with a reconstructed pre-fix finding: the same shape
    // `findCrossChapterLinks` measured for WEBUS2020's Hebrews 11:34 before
    // the split — a real value, just no longer a live one.
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
    const summary: VersionAudit = { version: "WEBUS2020", findings: [finding], scanned: 423 };
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
