# Cross-Chapter Link Audit Domain

## Overview

A `bibleLink` cross-reference target must resolve inside a single chapter, and must resolve to a chapter and verse the version being read actually carries. Two distinct problems fall out of that. A target whose range spans two chapters of the same book (e.g. a footnote pointing to `2 Kings 6:31–7:20`) resolves inside neither chapter on its own, so this repo's convention requires splitting it into two chapter-scoped links joined by a literal en dash. A target that parses cleanly but names a chapter or verse the version does not carry reads correctly right up until someone clicks it — worse than no link at all, and the reason it gets unlinked rather than left in place. A third, related problem — a target cut off short of the multi-verse range its own display text already names — gets completed before either of the other two rules ever sees it. This domain owns detecting and fixing all three, corpus-wide, across every version this repo carries.

A book name failing to resolve within that canon is deliberately *not* one of these three problems either, even though resolution itself still only checks that version's own canon. A footnote can legitimately name a book the version being read doesn't carry (an NT-only version's own footnote can still say "see Isaiah 7:14" without contradiction), so an unresolved book name is left alone rather than flagged — only a chapter or verse a *resolved* book doesn't carry counts as unresolvable.

[utils/crossChapterLinks.ts](../../../utils/crossChapterLinks.ts) is the version-agnostic owner of all three rules: classification, splitting, truncated-range reconstruction, and unresolvable-target detection and unlinking. It ships no CLI, no `main()`, and no npm script of its own — `utils/validate.ts` is the only caller, running every check and fixer here as steps inside its own single auto-fix pass and its own trailing report-only audits. See [validation.md](./validation.md) for the one-entry-point architecture this fits into.

## Core Entities

### Target Shapes

| Shape               | Example                        | Meaning                                                                 |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `singleChapter`     | `"Exodus 3:3–4"`                | Both endpoints in the same chapter; no action needed                    |
| `crossChapterRange` | `"2 Kings 6:31–7:20"`           | Endpoints in different chapters of the same book, each naming a verse; a finding |
| `wholeChapterRange` | `"Romans 1–11"`                 | Endpoints in different chapters, neither naming a verse; also a finding, split the same way but with no verse anchor on either half |
| `mergedTarget`       | `"Isaiah 66:10, 13"`           | Comma-joined targets confined to one chapter; excluded before dash parsing |
| `unparsed`          | `"Deuteronomy 32:43 LXX"`       | Does not match the `Book C[:V]` grammar at all; reported, never thrown  |

### CrossChapterFinding

One genuine cross-chapter-range `bibleLink`, as returned by `findCrossChapterLinks(versionId)`:

- `book` / `atBook` / `atChapter` / `atVerse`; the repo book id the range targets, and where the link itself sits (not always the same book: WEBUS2020's Hebrews 11:34 links to 2 Kings)
- `footnoteType`, `zone`; the enclosing footnote type (`stu`, `xrf`, …) and whether the link sits in verse content, a heading, or a subtitle
- `target`, `display?`, `dash`; the target exactly as written, its display override when present, and the actual dash character joining the range (en dash, em dash, or ASCII hyphen; never assumed to be the convention's own en dash)
- `fromChapter` / `toChapter` / `firstChapterLastVerse`; the range's two chapters and the first chapter's actual last verse, read from that version's own data

### UnresolvableTargetResult / UnresolvableTargetFinding

One judgment on a single `bibleLink` target's own two endpoints, returned by `findUnresolvableTarget(versionId, target)` and swept corpus-wide by `findUnresolvableTargets(versionId)`:

- `null` when the target resolves — both endpoints of a range, or the one endpoint of a bare reference, name a book within this version's own canon and a chapter and verse this version's own data actually carries. `null` also covers a book name that fails to resolve within that canon at all (whether the registry doesn't know it, or it's simply not one of this version's own books): with no resolved book to judge chapter/verse against, there is nothing left to call unresolvable, so it's left alone the same way an unparseable target is
- Otherwise a `reason` (`"chapter-not-carried"` or `"verse-not-carried"`) naming which judgment failed, the `bookName`/`chapter`/`verse` it failed at, and `lastChapterInVersion`, this version's own real chapter count for that book, so a report line never leaves a reader to look that number up by hand
- A target the endpoint grammar cannot parse at all (`classifyBibleLink`'s `"unparsed"` shape), or a comma-joined merged target (`"mergedTarget"`), is excluded before either of these judgments runs — neither shape was ever resolved to a book/chapter/verse to judge in the first place, so neither can ever be a finding here. This is what keeps WEBUS2020's real `"Deuteronomy 32:43 LXX"` siglum — a deliberate versification marker `utils/usfm/verify.ts` already asserts by name as expected — out of this check entirely
- A range is checked `from` endpoint first, `to` endpoint second, returning on the first unresolvable one found — a range unresolvable at both ends is still one finding, not two

## User Workflows

- **Runs only as part of `npm run validate`** – Every check and fixer this module owns runs inside that one command; there is no separate CLI, no `npm run audit-links`, and no `--fix` flag anywhere in this file. See [validation.md](./validation.md).
- **Classify a single link programmatically** – `classifyBibleLink(versionId, target)`, callable directly outside the corpus sweep
- **Judge a single target's resolvability programmatically** – `findUnresolvableTarget(versionId, target)`, the single-target entry point both the corpus sweep and the fixer are built on, directly callable the same way `classifyBibleLink` is

## Key Business Rules

- **Dash-agnostic detection, en-dash-only emission** – Detection accepts the whole dash class (en dash, em dash, ASCII hyphen, and related Unicode dashes) since real data doesn't always use the convention's own character (WEBUS2020's real Hebrews 11:34 finding used an em dash against that version's other 77 en-dash ranges). Splitting always emits the en dash regardless of which dash the source used.
- **Chapter length is version-scoped, never a shared table** – A chapter's last verse comes from that version's own verse records. Translations disagree (Romans 14 runs to verse 23 in ASV1901/CLV1880/KJV1769/YLT1898, but verse 26 in BYZ2018/WEBUS2020); a table built from one version and reused for another would silently mis-split a range in some of them. The same per-version index also now tracks *which* verse numbers a chapter actually carries, not just the highest one, which is what makes the unresolvable-target check possible — a chapter can carry verses up to 50 and still be missing verse 46 in the middle, a gap the highest-verse-number alone can't see.
- **Book resolution still checks only the version's own canon, but a failed resolution is no longer a finding** – `resolveBookName` still restricts matches to the books the version being checked actually carries, same as always (`bible-books.json` also carries apocryphal books absent from every version's canon here, and matching against the whole registry unrestricted would let one of those resolve where it should not for *this* purpose). What changed is what happens when that lookup fails: a footnote can legitimately cite a book outside its own version's canon (BYZ2018's NT-only footnotes can still name an Old Testament book), so an endpoint whose book doesn't resolve is now left alone rather than reported unresolvable — only a chapter or verse a *resolved* book doesn't carry still counts.
- **Never throws on an unparseable target** – A target the grammar doesn't describe, or whose book doesn't resolve within the version's own canon, comes back as `null` (nothing to judge) or a parse-failure report rather than a crash. A wrong link is worse than a missing one, but a shape the audit cannot verify — or a book name it cannot resolve — is never treated as a finding on its own.
- **Idempotent splitting** – An already-split pair (`"2 Kings 6:31–33"` and `"2 Kings 7:1–20"`) classifies as `singleChapter` on a second pass, so re-running `npm run validate` is always safe. A split whole-chapter pair (`"Romans 1"` and `"Romans 11"`) is idempotent the same way. Each bare chapter reference also classifies as `singleChapter`.
- **Display text is never recomputed** – The two split halves' display text is read directly off the link's existing display and split at the same dash the target is split at, so concatenating both halves plus the separator reconstructs the original display byte-for-byte.
- **A whole-chapter split carries no verse anchor** – `crossChapterRange`'s two halves each get a verse (Part A tacks on `fromChapter`'s own last verse, Part B gets `toChapter:1`); a `wholeChapterRange` split has no verse to carry on either side, so Part A is `fromChapter` verbatim and Part B is just `${bookName} ${toChapter}`. `splitCrossChapterLink()` branches on the classified shape to pick the right formula.
- **An unresolvable target loses its `bibleLink` wrapper and keeps its display text — a general rule, not a one-off editorial call.** A target that parses but names a chapter or verse the version doesn't carry is unlinked rather than reported-only, because this repo already holds the rule that a wrong link is worse than a missing one, applied here to a target that is worse than uncertain: it reads correctly until someone clicks it. `unlinkUnresolvableTargetsInContent` substitutes exactly `link.content ?? link.bibleLink` in the node's own place — a string override becomes plain content, no override becomes the bare target string, an object or array override is kept as its own content unchanged — and that is **rendering-neutral by construction**, because it is literally what `exportContent.ts`'s own renderer already displays for each of those shapes. The one thing this transform declines rather than guesses at: an override that is present but itself renders no visible text (`"empty-override"`) is left alone, since a node whose display was already meaningless is a different, pre-existing problem this step has no business papering over by deleting text.
- **A target the endpoint grammar cannot parse at all is a different question from a target that parses and names a verse the version lacks, and the two are never conflated.** `classifyBibleLink`'s `"unparsed"` and `"mergedTarget"` shapes are excluded before the unresolvable-target judgment ever runs, so neither an unparseable reference nor a comma-joined merged target is ever reported as unresolvable, and neither is ever unlinked. This is what protects WEBUS2020's real `"Deuteronomy 32:43 LXX"` siglum.
- **`validate.ts` runs every check here, reads and writes both** – `findCrossChapterLinks`, `findTruncatedRanges`, and `findUnresolvableTargets` each run read-only as one of the report-only trailing audits in `main()`; `fixCrossChapterLinks`, `reconstructTruncatedRangesInContent`, and `unlinkUnresolvableTargetsInContent` each run as a step inside the same function's auto-fix pass, before those audits. A version with any finding fails validation alongside its schema checks. See [validation.md](./validation.md) for exactly where each step sits in the real pass order.
- **The unlink runs after the truncated-range reconstruction and the cross-chapter split, and before the sibling-merge step that follows it, and both bounds are load-bearing.** It must see a target only after those two earlier steps have already settled it, never judge one they would still rewrite; and unlinking replaces a `bibleLink` node with plain text, which can leave two or three adjacent bare strings where there was one node — exactly the shape the sibling-merge step exists to collapse, in the same pass rather than a hypothetical next run.
- **One open, deliberate divergence — recorded here rather than resolved silently.** A whole-chapter range with no verse on either end (`"Romans 1–11"`-shaped) is classified `wholeChapterRange` and split the same way a `crossChapterRange` is, on the reasoning that a target spanning two chapters resolves inside neither, so both get cut into two chapter-scoped halves regardless of whether either end names a verse. Reference material outside this repo argues the opposite for exactly this shape: a whole-chapter range already names something navigable on its own, and splitting it doesn't make it more navigable — it should be left alone. **Zero targets of this shape exist in this corpus today**, so nothing rests on the disagreement yet, but the two positions genuinely conflict for the first real import that carries one. Recorded here as an open decision for whoever handles that import to make, rather than settled silently in either direction.

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

### Judging one target's own resolvability

_From [utils/crossChapterLinks.ts](../../../utils/crossChapterLinks.ts)_

```typescript
function unresolvableEndpoint(
  versionId: string,
  bookName: string,
  book: string | null,
  chapter: number,
  verse: number | null,
): UnresolvableTargetResult | null {
  if (book === null) return null;
  if (lastVerseOf(versionId, book, chapter) === undefined) {
    return { reason: "chapter-not-carried", bookName, book, chapter, verse, lastChapterInVersion: lastChapterOf(versionId, book) ?? null };
  }
  if (verse !== null && !verseExistsIn(versionId, book, chapter, verse)) {
    return { reason: "verse-not-carried", bookName, book, chapter, verse, lastChapterInVersion: lastChapterOf(versionId, book) ?? null };
  }
  return null;
}
```

`book` is still resolved against `versionId`'s own canon before this function ever runs (`resolveBookName` is unchanged), so `book === null` here can mean either a name the registry doesn't know at all or one that's simply outside this version's canon — either way, nothing left to judge, so it returns `null` rather than a finding. Checking the specific verse only after the chapter itself resolves is what catches the real ASV1901 Mark 9:44→9:46 case: that chapter carries verses up to 50, so a check stopping at "is the target verse within the chapter's own highest number" would call it resolvable. The gap is in the middle, not at the edge, so `verseExistsIn` — checking the actual verse set, not just its maximum — is what this judgment depends on.

### Fixing and writing back, inside `validate.ts`'s own pass

_From [utils/validate.ts](../../../utils/validate.ts)_

```typescript
// Version-scoped rather than file-scoped, unlike the steps around it:
// fixCrossChapterLinks needs a whole version's chapter-length index, built
// from every book file together, so it reads and returns per version
// rather than taking one file path.
for (const versionDir of versionDirs) {
  for (const { file, records, splits } of fixCrossChapterLinks(versionDir)) {
    await writeJsonFile(path.join(bibleVersionsDir, versionDir, file), records);
    crossChapterFilesFixedCount++;
    crossChapterSplitsCount += splits;
  }
}
```

`fixCrossChapterLinks()` itself is read-only. It returns replacement records rather than writing anything, matching `findCrossChapterLinks()`'s own contract; its one caller, `validate.ts`'s own auto-fix pass, decides whether and where to write them, through [functions/writeJsonFile.ts](../../../functions/writeJsonFile.ts) like every other writer in this repo. `unlinkUnresolvableTargetsInContent` and `reconstructTruncatedRangesInContent` are called the same way, as their own steps later in the same pass — see [validation.md](./validation.md) for the exact order and why it matters.
