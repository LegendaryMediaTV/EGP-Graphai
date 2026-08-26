# Strong's-Node Audit Domain

## Overview

Verse content is built one lexical node at a time, each carrying its own `strong` number, `marks`, and joining whitespace. That structure can drift out of alignment with this repo's own text-flow conventions during import or hand-editing: a connector word left unmerged, a joining space on the wrong side of a boundary, a verse that shouldn't open with whitespace at all, a heading missing the paragraph break that should follow it, a fraction or an ellipsis that never got normalized, an ASCII straight quote where a curly one belongs. This domain owns detecting eleven such drift patterns, corpus-wide, across every version this repo carries. Checks 6 and 7 were added on the USFM-import branch, in direct response to what real deuterocanon content exposed (see [usfm-import.md](./usfm-import.md)); checks 8-11 were added to fold the standalone audit/fixer CLIs this domain used to ship into `npm run validate`'s own pass.

[utils/auditNodes.ts](../../../utils/auditNodes.ts) is the sole owner of the detection logic, and it has no `--fix` path of its own: it only ever reports. It also carries no `main()`, no CLI, and no npm script — `utils/validate.ts` is the only caller. That does not mean none of these eleven findings ever gets repaired: checks 1, 6, 8, and 9 are repaired automatically, but the repair code lives in `validate.ts`'s own auto-fix pass, not here. See [validation.md](./validation.md) for the one-entry-point architecture this fits into.

## Core Entities

### NodeShape

The shared, cheaply-computed read of one array element, whether a plain string, a `strong`-carrying object, a `ContentNested` wrapper, or a `heading`/`subtitle`/`bibleLink` boundary, is what every check below is built on:

- `text`: `undefined` for a wrapper/boundary/textless-sibling; the string otherwise
- `marks` / `script`: normalized to an empty array/`undefined` when absent, so two nodes can be compared for formatting agreement without null-checking first
- `strong`, `hasFoot`, `hasNestedContent`, `isTextlessStrongSibling`, `opensParagraph`, `endsBreak`, `isBoundary`: the flags each check reads to decide eligibility

### The eleven findings

| # | Finding | Shape it flags | Direction it fixes toward |
| - | ------- | --------------- | -------------------------- |
| 1 | Unmerged node pairs | An untagged connector word immediately before a `strong`-carrying node | Forward-only; folds into the node *after* it, never the one before |
| 2 | Trailing whitespace | A `strong`-carrying node's own text ending in a space | N/A; the space belongs leading the next node instead |
| 3 | Leading punctuation | A `strong`-carrying node's own text starting with tight punctuation (comma, closing quote, …) | Backward; the punctuation belongs on the node *before* it |
| 4 | Mark-boundary spaces | A bare whitespace-only node between two real nodes sharing the same `marks`/`script` | Forward; rolls onto the leading edge of the node after it |
| 5 | Verse-initial spaces | A verse's own outermost content opening with whitespace | Collapse-or-trim, verse-scoped only (never inside a `ContentNested` wrapper) |
| 6 | Heading/subtitle paragraph mismatch | A heading/subtitle run whose real next node doesn't open a paragraph | Add `paragraph: true` to the node right after the run |
| 7 | Unnormalized fraction | A node's own text still carrying a raw fraction shape (ASCII `N/M`, a precomposed vulgar-fraction glyph, or digits split by U+2044 but not yet raised/lowered) | Rewrite via the same `normalizeFractionText` the USFM importer applies on the way in |
| 8 | Footnote punctuation order | A `foot`-carrying, text-bearing node immediately followed by a real sibling whose own text starts with tight punctuation (check 3's own definition) that belongs to the same span | Move the punctuation ahead of the footnote marker, onto the footed node itself, when the move is safe |
| 9 | Mark-boundary embedded spaces | A node whose own `marks`/`script` are non-empty and whose own `text` starts or ends with whitespace that disagrees in formatting with the real node immediately across that boundary | Relocate the space onto the leading/trailing edge of the node on the other side, when the move is safe |
| 10 | Un-normalized ellipsis | A node's own text still carrying a dot run this repo's ellipsis convention would rewrite to U+2026, or the one two-period shape that convention deliberately never rewrites on its own | Rewrite via the same `normalizeEllipsisText` the shipped auto-fix applies — narrower than this check, since the two-period shape is reported but never auto-fixed |
| 11 | ASCII straight quote, apostrophe, or backtick | A node's own text still carrying an ASCII `'`, `"`, or backtick | None. Report-only, permanently: disambiguating a straight `'` needs context a character-level rule cannot supply |

Check 6 no longer needs a whole book to decide anything: the rule is flat and corpus-wide (see its own rule below), so every check runs per-verse and 1, 2, 3, 4, 5, 7, 8, 9, 10, and 11 all run through `findStrongsNodeIssues`. Check 6 is still called separately, through `findHeadingParagraphMismatches`, only because it walks one book's own verse array rather than one verse's own content tree — not because it gathers cross-verse evidence.

## User Workflows

These checks run as part of `npm run validate` — see [validation.md](./validation.md) for the one-entry-point architecture. `auditNodes.ts` itself carries no CLI, no `main()`, and no npm script.

- **Programmatic single-verse check** – `findStrongsNodeIssues(verse.content)` returns checks 1, 2, 3, 4, 5, 7, 8, 9, 10, and 11 for one verse's content tree without touching disk; check 6 needs a whole book's verse array, so it's not part of this call
- **Programmatic whole-book check** – `findHeadingParagraphMismatches(verses)` takes one book's verses, in on-disk order, and returns check 6's findings

## Key Business Rules

- **This file only detects; four checks now repair themselves inside `validate.ts`'s own pass.** `auditNodes.ts` itself ships no `--fix` flag and never writes. Checks 1, 6, 8, and 9 are flat enough that a mechanical fix can't get the direction wrong, so `validate.ts`'s auto-fix pass calls exported transforms (`utils/fixUnmergedNodes.ts`, `utils/fixHeadingParagraphs.ts`, `utils/fixFootnotePunctuationOrder.ts`, `utils/fixMarkBoundaryEmbeddedSpaces.ts`) that import this file's own eligibility functions (`canJoinForward`, `findHeadingParagraphMismatches`, `leadingTightPunctuationSplit`/`isRealAttachmentPoint`, `carriesFormatting`/`agreesInFormatting`) rather than re-deriving the judgment, so there's exactly one "is this safe" decision per check, not two copies that could drift apart. None of the four files carries a CLI or a `--fix` flag of its own any more — `validate.ts` calls each transform unconditionally as one step in its own pass. Checks 2, 3, 4, 5, and 11 stay report-only: the "which direction does this word belong" call they make explicit is exactly the kind of judgment a mechanical fix would get wrong on real Bible text. Checks 7 and 10 sit in between — each pairs with its own auto-fix (fraction normalization, ellipsis normalization), but that auto-fix is a plain text rewrite over every node, not a fix built from this file's own detection functions the way checks 1/6/8/9 are, and check 10's own detection is deliberately broader than what its auto-fix rewrites (see below).
- **Check 1 folds forward only, never backward** – A trailing connector with nothing `strong`-carrying after it in its own span is not a finding: with nothing to fold into, it's simply untagged text, and folding it backward would misattribute it under a Strong's number it has no lexical relationship to (Genesis 1:15 KJV1769 ends `{text: " upon the earth:", strong: "H776"}, " and it was so."`: untagged, trailing, correctly unflagged).
- **A `ContentNested` wrapper is never a merge target** – It carries `strong` but no top-level `text`, so a connector folding into it would have nowhere to land. `isRealAttachmentPoint`/`canJoinForward` both require actual text on the target side.
- **Mark/script agreement blocks a merge, not just formatting** – A small-caps divine name (`marks: ["sc"]`) staying split from an unmarked connector beside it isn't a bug; merging would either mis-mark the connector small-caps or break the small-caps convention. Both check 1 and check 4 share this same `agreesInFormatting` gate.
- **A textless Strong's sibling is transparent, not a boundary** – `{strong: "H853"}` (no `text`, no nested `content`) renders zero characters. Check 3 skips through it backward to find a real attachment point; check 4 skips through it forward to find the real node to test mark-agreement against (real Matthew 3:15 KJV1769 shape: `{text: " it becometh", marks: ["woc"]}, " ", {strong: "G2076"}, {text: "us", marks: ["woc"]}`. The space correctly rolls onto `"us"`, past the unmarked textless sibling).
- **`break`/`paragraph` mark real piece boundaries a formatting match can't paper over** – A `break: true` on the connector itself, or `paragraph: true` opening on the target, blocks a finding even when every other condition matches.
- **Verse-initial-space detection never recurses into a `ContentNested` wrapper** – A leading space inside one is completely ordinary (mid-sentence insertion, not a verse's own start), so this check looks only at a verse's own outermost `content[0]`.
- **`validate.ts` runs this audit too** – `auditVersion(versionId)` is called directly from `utils/validate.ts`'s `main()`, once per version being validated, using the exported `isClean()`/`printFindingLines()` to render the same report shape rather than a second, divergent copy of it. `validate.ts` always calls `printFindingLines` with `verbose: false` — there is no flag to change that, since neither this module nor `validate.ts` parses `process.argv` any more. A version with any finding fails validation alongside its schema checks.
- **Check 6 is flat and corpus-wide, with no per-book judgment.** A heading/subtitle run whose own real next node fails to open a paragraph is a finding everywhere, in every version and every book — no evidence-gathering step decides first whether a given book "elsewhere pairs the two," and no allowlist exempts one that doesn't. A run with nothing after it at all (the end of a book's own content) reports nothing, since there is no node for the convention to apply to.
- **Check 7 shares its rule with the USFM importer, not just its name.** `hasUnnormalizedFraction` calls the same `normalizeFractionText` (`utils/usfm/fractions.ts`) the import pipeline applies while building content in the first place, so a version imported by hand and a version imported from USFM are held to one fraction convention rather than two.
- **Checks 10 and 11 each carry a deliberate asymmetry with their neighbors.** Check 10 detects more than the ellipsis auto-fix rewrites: both report the same three-plus-dot and spaced-dot shapes, but check 10 also flags a bare two-period run, which the auto-fix refuses to touch as a standing rule (see `functions/normalizeEllipses.ts`'s own doc comment for why). Check 11 detects only and never fixes, permanently — see the findings table above.

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

Unlike the placement checks (1-6, 8, 9), this one has nothing to do with a node's position relative to its neighbors; it applies to any text-bearing node, `strong`-carrying or not. Checks 10 and 11 share that same shape.
