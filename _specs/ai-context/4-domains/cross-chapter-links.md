# Cross-Chapter Link Audit Domain

## Overview

A `bibleLink` cross-reference target must resolve inside a single chapter. A target whose range spans two chapters of the same book (e.g. a footnote pointing to `2 Kings 6:31–7:20`) resolves inside neither chapter on its own, so this repo's convention requires splitting it into two chapter-scoped links joined by a literal en dash instead. This domain owns detecting and fixing that one rule, corpus-wide, across every version this repo carries.

[utils/crossChapterLinks.ts](../../../utils/crossChapterLinks.ts) is the version-agnostic rule owner (classification and splitting logic). [utils/auditCrossChapterLinks.ts](../../../utils/auditCrossChapterLinks.ts) is the corpus-wide sweep and CLI built on top of it.

## Core Entities

### Target Shapes

| Shape               | Example                        | Meaning                                                                 |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `singleChapter`     | `"Exodus 3:3–4"`                | Both endpoints in the same chapter — no action needed                    |
| `crossChapterRange` | `"2 Kings 6:31–7:20"`           | Endpoints in different chapters of the same book — the one real finding  |
| `wholeChapterRange` | `"Isaiah 36–39"`                | A range already naming whole chapters — out of scope, not a finding      |
| `mergedTarget`       | `"Isaiah 66:10, 13"`           | Comma-joined targets confined to one chapter — excluded before dash parsing |
| `unparsed`          | `"Deuteronomy 32:43 LXX"`       | Does not match the `Book C[:V]` grammar at all — reported, never thrown  |

### CrossChapterFinding

One genuine cross-chapter-range `bibleLink`, as returned by `findCrossChapterLinks(versionId)`:

- `book` / `atBook` / `atChapter` / `atVerse` — the repo book id the range targets, and where the link itself sits (not always the same book — WEBUS2020's Hebrews 11:34 links to 2 Kings)
- `footnoteType`, `zone` — the enclosing footnote type (`stu`, `xrf`, …) and whether the link sits in verse content, a heading, or a subtitle
- `target`, `display?`, `dash` — the target exactly as written, its display override when present, and the actual dash character joining the range (en dash, em dash, or ASCII hyphen — never assumed to be the convention's own en dash)
- `fromChapter` / `toChapter` / `firstChapterLastVerse` — the range's two chapters and the first chapter's actual last verse, read from that version's own data

## User Workflows

- **Audit every version** – `npm run audit-links` (dry-run report, no writes)
- **Audit one version** – `npx ts-node utils/auditCrossChapterLinks.ts WEBUS2020`
- **Fix one version** – `npx ts-node utils/auditCrossChapterLinks.ts WEBUS2020 --fix` (the only path that writes)
- **Classify a single link programmatically** – `classifyBibleLink(versionId, target)`, callable directly outside the corpus sweep

## Key Business Rules

- **Dry-run by default** – Only `--fix` writes; every other invocation is a read-only report. This is the opposite polarity from `convertToSmallCaps.ts`'s `--dry-run` flag, which opts *out* of writing — a deliberate choice for a tool whose default use is "tell me the state," not "change it."
- **Non-zero exit on any finding** – `exitCodeFor()` returns 1 if any version still carries an unsplit `crossChapterRange`, so this can gate CI the same way `validate.ts` does.
- **Dash-agnostic detection, en-dash-only emission** – Detection accepts the whole dash class (en dash, em dash, ASCII hyphen, and related Unicode dashes) since real data doesn't always use the convention's own character (WEBUS2020's real Hebrews 11:34 finding used an em dash against that version's other 77 en-dash ranges). Splitting always emits the en dash regardless of which dash the source used.
- **Chapter length is version-scoped, never a shared table** – A chapter's last verse comes from that version's own verse records. Translations disagree (Romans 14 runs to verse 23 in ASV1901/CLV1880/KJV1769/YLT1898, but verse 26 in BYZ2018/WEBUS2020); a table built from one version and reused for another would silently mis-split a range in some of them.
- **Book resolution is canon-scoped** – A book name resolves only within the version being checked. A name valid elsewhere but outside a version's own canon (e.g. anything absent from BYZ2018's NT-only canon) is reported as unresolvable rather than guessed at.
- **Never throws on an unparseable target** – A target the grammar doesn't describe, or that names a book outside the version's canon, comes back reported in the result. A wrong link is worse than a missing one, but a shape the audit cannot verify is not a crash.
- **Idempotent splitting** – An already-split pair (`"2 Kings 6:31–33"` and `"2 Kings 7:1–20"`) classifies as `singleChapter` on a second pass, so re-running `--fix` is always safe.
- **Display text is never recomputed** – The two split halves' display text is read directly off the link's existing display and split at the same dash the target is split at, so concatenating both halves plus the separator reconstructs the original display byte-for-byte.

## Representative Code Examples

### Classifying one target

_From [utils/crossChapterLinks.ts](../../../utils/crossChapterLinks.ts)_

```typescript
export function classifyBibleLink(versionId: string, target: string): BibleLinkClassification {
  if (target.includes(",")) return { ...UNRESOLVED, shape: "mergedTarget" };

  const dashMatch = DASH.exec(target);
  const firstText = dashMatch ? target.slice(0, dashMatch.index) : target;
  const secondText = dashMatch ? target.slice(dashMatch.index + 1) : undefined;

  const from = parseEndpoint(firstText);
  if (!from) return UNRESOLVED;

  const book = resolveBookName(versionId, from.bookName);
  const firstChapterLastVerse = book === null ? null : (lastVerseOf(versionId, book, from.chapter) ?? null);
  // ... classify by dash presence and second-endpoint grammar
}
```

### The corpus-wide sweep

_From [utils/auditCrossChapterLinks.ts](../../../utils/auditCrossChapterLinks.ts)_

```typescript
export function auditVersions(versionIds: readonly string[] = allVersionIds()): readonly VersionAudit[] {
  return versionIds.map((version) => ({
    version,
    ...findCrossChapterLinks(version),
  }));
}

export function exitCodeFor(summaries: readonly VersionAudit[]): number {
  return summaries.some((summary) => summary.findings.length > 0) ? 1 : 0;
}
```

### Fixing and writing back

_From [utils/auditCrossChapterLinks.ts](../../../utils/auditCrossChapterLinks.ts)_

```typescript
async function applyFix(versionId: string): Promise<readonly FixedBook[]> {
  const fixedBooks = fixCrossChapterLinks(versionId);
  for (const { file, records } of fixedBooks) {
    await writeJsonFile(path.join(BIBLE_VERSIONS_DIR, versionId, file), records);
  }
  return fixedBooks;
}
```

`fixCrossChapterLinks()` itself is read-only — it returns replacement records rather than writing anything, matching `findCrossChapterLinks()`'s own contract. Only the CLI's `--fix` path, via `applyFix()`, ever writes to `bible-versions/`, and it goes through [functions/writeJsonFile.ts](../../../functions/writeJsonFile.ts) like every other writer in this repo.
