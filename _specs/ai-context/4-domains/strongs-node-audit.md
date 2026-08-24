# Strong's-Node Audit Domain

## Overview

Verse content is built one lexical node at a time, each carrying its own `strong` number, `marks`, and joining whitespace. That structure can drift out of alignment with this repo's own text-flow conventions during import or hand-editing: a connector word left unmerged, a joining space on the wrong side of a boundary, a verse that shouldn't open with whitespace at all, a heading missing the paragraph break that should follow it, a fraction that never got normalized. This domain owns detecting seven such drift patterns, corpus-wide, across every version this repo carries. Two of the seven (checks 6 and 7) were added on the USFM-import branch, in direct response to what real deuterocanon content exposed. See [usfm-import.md](./usfm-import.md).

[utils/auditNodes.ts](../../../utils/auditNodes.ts) is the sole owner: both the detection logic and the CLI. Unlike the cross-chapter link auditor (see [cross-chapter-links.md](./cross-chapter-links.md)), it has no `--fix` path: it only ever reports.

## Core Entities

### NodeShape

The shared, cheaply-computed read of one array element, whether a plain string, a `strong`-carrying object, a `ContentNested` wrapper, or a `heading`/`subtitle`/`bibleLink` boundary, is what every check below is built on:

- `text`: `undefined` for a wrapper/boundary/textless-sibling; the string otherwise
- `marks` / `script`: normalized to an empty array/`undefined` when absent, so two nodes can be compared for formatting agreement without null-checking first
- `strong`, `hasFoot`, `hasNestedContent`, `isTextlessStrongSibling`, `opensParagraph`, `endsBreak`, `isBoundary`: the flags each check reads to decide eligibility

### The seven findings

| # | Finding | Shape it flags | Direction it fixes toward |
| - | ------- | --------------- | -------------------------- |
| 1 | Unmerged node pairs | An untagged connector word immediately before a `strong`-carrying node | Forward-only; folds into the node *after* it, never the one before |
| 2 | Trailing whitespace | A `strong`-carrying node's own text ending in a space | N/A; the space belongs leading the next node instead |
| 3 | Leading punctuation | A `strong`-carrying node's own text starting with tight punctuation (comma, closing quote, …) | Backward; the punctuation belongs on the node *before* it |
| 4 | Mark-boundary spaces | A bare whitespace-only node between two real nodes sharing the same `marks`/`script` | Forward; rolls onto the leading edge of the node after it |
| 5 | Verse-initial spaces | A verse's own outermost content opening with whitespace | Collapse-or-trim, verse-scoped only (never inside a `ContentNested` wrapper) |
| 6 | Heading/subtitle paragraph mismatch | A heading/subtitle run whose real next node doesn't open a paragraph, in a book that elsewhere pairs the two | Add `paragraph: true` to the node right after the run |
| 7 | Unnormalized fraction | A node's own text still carrying a raw fraction shape (ASCII `N/M`, a precomposed vulgar-fraction glyph, or digits split by U+2044 but not yet raised/lowered) | Rewrite via the same `normalizeFractionText` the USFM importer applies on the way in |

Checks 1-5 and 7 are per-verse and run through `findStrongsNodeIssues`. Check 6 is the exception. It needs a whole book's own verse sequence to decide anything (see its own rule below), so it runs separately through `findHeadingParagraphMismatches`.

## User Workflows

- **Audit every version** – `npm run audit-nodes` (read-only report; also accepts `-- <versionId> --verbose` to scope and expand)
- **Audit one version, capped output** – `npx ts-node utils/auditNodes.ts KJV1769` (first 10 findings per check, then a "… N more" note)
- **List every finding** – `npx ts-node utils/auditNodes.ts KJV1769 --verbose`
- **Programmatic single-verse check** – `findStrongsNodeIssues(verse.content)` returns checks 1, 2, 3, 4, 5, and 7 for one verse's content tree without touching disk; check 6 needs a whole book, so it's not part of this call
- **Programmatic whole-book check** – `findHeadingParagraphMismatches(verses)` takes one book's verses, in on-disk order, and returns check 6's findings

## Key Business Rules

- **Read-only by design** – Every one of the seven checks only detects. There is no `--fix` flag anywhere in this file; fixing a finding is a manual, judgment-driven edit to the corpus, not something this tool can safely automate (the "which direction does this word belong" call the checks below make explicit is exactly the kind of judgment a mechanical fixer would get wrong on real Bible text).
- **Check 1 folds forward only, never backward** – A trailing connector with nothing `strong`-carrying after it in its own span is not a finding: with nothing to fold into, it's simply untagged text, and folding it backward would misattribute it under a Strong's number it has no lexical relationship to (Genesis 1:15 KJV1769 ends `{text: " upon the earth:", strong: "H776"}, " and it was so."`: untagged, trailing, correctly unflagged).
- **A `ContentNested` wrapper is never a merge target** – It carries `strong` but no top-level `text`, so a connector folding into it would have nowhere to land. `isRealAttachmentPoint`/`canJoinForward` both require actual text on the target side.
- **Mark/script agreement blocks a merge, not just formatting** – A small-caps divine name (`marks: ["sc"]`) staying split from an unmarked connector beside it isn't a bug; merging would either mis-mark the connector small-caps or break the small-caps convention. Both check 1 and check 4 share this same `agreesInFormatting` gate.
- **A textless Strong's sibling is transparent, not a boundary** – `{strong: "H853"}` (no `text`, no nested `content`) renders zero characters. Check 3 skips through it backward to find a real attachment point; check 4 skips through it forward to find the real node to test mark-agreement against (real Matthew 3:15 KJV1769 shape: `{text: " it becometh", marks: ["woc"]}, " ", {strong: "G2076"}, {text: "us", marks: ["woc"]}`. The space correctly rolls onto `"us"`, past the unmarked textless sibling).
- **`break`/`paragraph` mark real piece boundaries a formatting match can't paper over** – A `break: true` on the connector itself, or `paragraph: true` opening on the target, blocks a finding even when every other condition matches.
- **Verse-initial-space detection never recurses into a `ContentNested` wrapper** – A leading space inside one is completely ordinary (mid-sentence insertion, not a verse's own start), so this check looks only at a verse's own outermost `content[0]`.
- **`--verbose` survives npm's own flag-swallowing** – `npm run audit-nodes KJV1769 --verbose` (no `--` separator) never delivers a literal `--verbose` to `process.argv`. npm's CLI parsing consumes it as its own `--loglevel verbose` first. The tool also checks `process.env.npm_config_loglevel`, the one signal that invocation shape actually leaves behind, so verbose output still works as typed.
- **`validate.ts` runs this audit too** – `auditVersion(versionId)` is called directly from `utils/validate.ts`'s `main()`, once per version being validated, using the exported `isClean()`/`printFindingLines()` to render the same report shape rather than a second, divergent copy of it. A version with any finding fails validation alongside its schema checks.
- **Check 6 only holds a book to a convention it's already shown evidence of using.** A heading/subtitle run is judged against the following-paragraph convention only if the same book has at least one other run, not on its own chapter's first verse, where the real next node does open a paragraph. A book that never pairs the two at all (WEBUS2020's Psalms, Song of Solomon, and Psalm 151 genuinely never do, since sustained poetry never gets a paragraph marker inside a heading run) reports zero findings for check 6 by construction, rather than needing an allowlist of accepted exceptions.
- **Check 6 excludes a chapter's own first verse from evidence-gathering, not from the finding itself.** A chapter's first verse almost always opens a paragraph regardless of whether it also carries a heading, so treating that as evidence the book pairs headings with paragraphs would be circular (real WEBUS2020 Song of Solomon 4:1 carries a heading immediately followed by `paragraph: true`, but 3:1, 7:1, and 8:1 carry the identical paragraph flag with no heading at all). Once real evidence exists anywhere else in the book, every run is held to the convention, chapter-first or not.
- **Check 7 shares its rule with the USFM importer, not just its name.** `hasUnnormalizedFraction` calls the same `normalizeFractionText` (`utils/usfm/fractions.ts`) the import pipeline applies while building content in the first place, so a version imported by hand and a version imported from USFM are held to one fraction convention rather than two.

## Representative Code Examples

### Formatting agreement gates a merge

_From [utils/auditNodes.ts](../../../utils/auditNodes.ts)_

```typescript
function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
  return a.script === b.script && a.marks.length === b.marks.length && a.marks.every((mark, at) => mark === b.marks[at]);
}
```

### Skipping through a textless Strong's sibling (check 4)

_From [utils/auditNodes.ts](../../../utils/auditNodes.ts)_

```typescript
let j = i + 1;
while (j < nodes.length && shapes[j].isTextlessStrongSibling) j++;
if (j >= nodes.length) continue;

const target = shapes[j];
if (!isRealAttachmentPoint(target) || target.opensParagraph) continue;
if (!agreesInFormatting(left, target)) continue;
```

### Check 7 reuses the importer's own fraction rule

_From [utils/auditNodes.ts](../../../utils/auditNodes.ts)_

```typescript
function hasUnnormalizedFraction(shape: NodeShape): boolean {
  return shape.text !== undefined && normalizeFractionText(shape.text).changes > 0;
}
```

Unlike checks 1-5, this one has nothing to do with a node's placement relative to its neighbors; it applies to any text-bearing node, `strong`-carrying or not.

### The npm `--verbose`-swallowing fallback

_From [utils/auditNodes.ts](../../../utils/auditNodes.ts)_

```typescript
const verbose = args.includes("--verbose") || /^(verbose|silly)$/.test(process.env.npm_config_loglevel ?? "");
```
