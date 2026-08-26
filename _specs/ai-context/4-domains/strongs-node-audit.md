# Strong's-Node Audit Domain

## Overview

Verse content is built one lexical node at a time, each carrying its own `strong` number, `marks`, and joining whitespace. That structure can drift out of alignment with this repo's own text-flow conventions during import or hand-editing: a connector word left unmerged, a joining space on the wrong side of a boundary, a verse that shouldn't open with whitespace at all, a heading missing the paragraph break that should follow it, a fraction or an ellipsis that never got normalized, an ASCII straight quote where a curly one belongs, a footnote marker rendering after whitespace instead of hugging the word it annotates, a non-Latin letter with no `script` tag, a node repeating its predecessor's footnote while rendering nothing itself, two adjacent nodes differing in nothing but text, a non-standard whitespace character. This domain owns detecting sixteen such drift patterns, corpus-wide, across every version this repo carries. Checks 6 and 7 were added on the USFM-import branch, in direct response to what real deuterocanon content exposed (see [usfm-import.md](./usfm-import.md)); checks 8-11 were added to fold the standalone audit/fixer CLIs this domain used to ship into `npm run validate`'s own pass; checks 12-16 closed five further gaps a later review of this repo's own automated coverage found — see [validation.md](./validation.md) for where each one's fixer sits in the pass.

**The general rule behind check 12, worth stating on its own rather than just as one more row in the table below: a join or attachment convention needs a corpus-wide check for every attribute it can attach to, not just the one that happened to get one first.** Check 2 has enforced the leading-space convention for `strong` for a long time; `foot` had no mirror of it until check 12, and that asymmetry — not a rare edge case — is exactly where 9,396 real findings across four versions lived, all of them the identical defect (a footnote marker rendering a space away from the word it annotates) simply because nobody had yet asked the question for the second attribute that can carry the same boundary.

[utils/auditNodes.ts](../../../utils/auditNodes.ts) is the sole owner of the detection logic, and it has no `--fix` path of its own: it only ever reports. It also carries no `main()`, no CLI, and no npm script — `utils/validate.ts` is the only caller. That does not mean none of these sixteen findings ever gets repaired: checks 1, 6, 8, 9, 12, 13, 14, and 15 are repaired automatically, but the repair code lives outside this file. Checks 1, 6, 8, 9, 12, 14, and 15 each have a fixer under `utils/` or `functions/` that imports this file's own eligibility judgment (`canJoinForward`, `findHeadingParagraphMismatches`, `leadingTightPunctuationSplit`/`isRealAttachmentPoint`, `carriesFormatting`/`agreesInFormatting`, `findWhitespaceSourceIndex`, `isDuplicateFootnoteAnchor`, `isMergeableTextNode`) rather than re-deriving it. Check 13's own fixer runs the dependency the other way: its eligibility predicate, `hasMixedScriptText`, lives in `functions/tagScriptRunsInContent.ts`, and this file's own check 13 imports it from there — not the reverse — since `functions/` never imports from `utils/` anywhere in this codebase, and doing so here would have created a real import cycle (check 13's own predicate has nothing to do with node placement, the concern every other check here shares). See [validation.md](./validation.md) for the one-entry-point architecture this fits into.

## Core Entities

### NodeShape

The shared, cheaply-computed read of one array element, whether a plain string, a `strong`-carrying object, a `ContentNested` wrapper, or a `heading`/`subtitle`/`bibleLink` boundary, is what every check below is built on:

- `text`: `undefined` for a wrapper/boundary/textless-sibling; the string otherwise
- `marks` / `script`: normalized to an empty array/`undefined` when absent, so two nodes can be compared for formatting agreement without null-checking first
- `strong`, `hasFoot`, `hasNestedContent`, `isTextlessStrongSibling`, `opensParagraph`, `endsBreak`, `isBoundary`: the flags each check reads to decide eligibility

### The sixteen findings

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
| 12 | Footnote marker after whitespace | A `foot`-carrying node whose own marker renders immediately after whitespace — asks the render-order question, so a textless `{foot}` anchor whose predecessor's text ends in whitespace is caught too, not just a node whose own text ends in a space | Relocate the space onto the leading edge of the node after it, when the move is safe; declines and reports when there's no real next node at this array level, a `break`/`paragraph` boundary sits at the join, the next node's text already starts with whitespace, or the two sides disagree in `marks`/`script` |
| 13 | Untagged script run | A node's own text mixes a Latin letter with a Hebrew or Greek letter and carries no `script` tag; requires the mix, not just the non-Latin character alone, so an all-Greek node in an all-Greek version is never a finding | Split into an alternating sequence of plain-text and `{text, script}` nodes via `splitScriptRuns`; declines and reports when the node also carries `strong`, `foot`, `marks`, or any property beyond bare text, since splitting it would have to decide which fragment keeps the property |
| 14 | Duplicate footnote anchor | A node rendering no visible text of its own whose `foot` is byte-for-byte identical to the nearest node before it that wasn't itself already flagged | Delete the node outright; tight on purpose — the far more common shape of one note correctly annotating two real, separate word occurrences, each on its own text-bearing node, is never touched |
| 15 | Mergeable siblings | Two adjacent nodes that carry nothing but `text` (optionally `marks`/`script`) and agree on both | Normalize a `{text}`-only object to a bare string, then fold a maximal run of agreeing siblings into one node; a node carrying `strong`, `foot`, `bibleLink`, nested `content`, `paragraph`, or `break` is never eligible on either side |
| 16 | Non-standard whitespace | A node's own text carries a non-breaking space, an exotic Unicode space, a zero-width or word-joining control, a tab, or a bare newline | None. Report-only, permanently, for the same reason as check 11: replacing one needs to know whether the source meant it to hold two words together, a judgment the character alone cannot supply |

Check 6 no longer needs a whole book to decide anything: the rule is flat and corpus-wide (see its own rule below), so every check runs per-verse and checks 1 through 5 and 7 through 16 (fifteen checks) all run through `findStrongsNodeIssues`. Check 6 is still called separately, through `findHeadingParagraphMismatches`, only because it walks one book's own verse array rather than one verse's own content tree — not because it gathers cross-verse evidence.

## User Workflows

These checks run as part of `npm run validate` — see [validation.md](./validation.md) for the one-entry-point architecture. `auditNodes.ts` itself carries no CLI, no `main()`, and no npm script.

- **Programmatic single-verse check** – `findStrongsNodeIssues(verse.content)` returns checks 1 through 5 and 7 through 16 (fifteen checks total) for one verse's content tree without touching disk; check 6 needs a whole book's verse array, so it's not part of this call
- **Programmatic whole-book check** – `findHeadingParagraphMismatches(verses)` takes one book's verses, in on-disk order, and returns check 6's findings

## Key Business Rules

- **This file only detects; eight checks now repair themselves inside `validate.ts`'s own pass.** `auditNodes.ts` itself ships no `--fix` flag and never writes. Checks 1, 6, 8, 9, 12, 13, 14, and 15 are flat enough that a mechanical fix can't get the direction wrong, so `validate.ts`'s auto-fix pass calls exported transforms — `utils/fixUnmergedNodes.ts`, `utils/fixHeadingParagraphs.ts`, `utils/fixFootnotePunctuationOrder.ts`, `utils/fixMarkBoundaryEmbeddedSpaces.ts`, `utils/fixFootnoteMarkerSpacing.ts`, `functions/tagScriptRunsInContent.ts`, `utils/fixDuplicateFootnoteAnchors.ts`, and `functions/mergeEquivalentSiblingsInContent.ts` — that each own the "is this safe" decision for their one check. Seven of the eight import this file's own eligibility functions (`canJoinForward`, `findHeadingParagraphMismatches`, `leadingTightPunctuationSplit`/`isRealAttachmentPoint`, `carriesFormatting`/`agreesInFormatting`, `findWhitespaceSourceIndex`, `isDuplicateFootnoteAnchor`, `isMergeableTextNode`) rather than re-deriving the judgment, so there's exactly one decision per check, not two copies that could drift apart; check 13's fixer is the one exception, and its own eligibility predicate runs the dependency in the other direction — see the Overview above for why. None of the eight files carries a CLI or a `--fix` flag of its own — `validate.ts` calls each transform unconditionally as one step in its own pass. Checks 2, 3, 4, 5, 11, and 16 stay report-only: the "which direction does this word belong," or "what did this character mean to do," call they make explicit is exactly the kind of judgment a mechanical fix would get wrong on real Bible text. Checks 7 and 10 sit in between — each pairs with its own auto-fix (fraction normalization, ellipsis normalization), but that auto-fix is a plain text rewrite over every node, not a fix built from this file's own detection functions the way checks 1/6/8/9/12/14/15 are, and check 10's own detection is deliberately broader than what its auto-fix rewrites (see below).
- **Check 1 folds forward only, never backward** – A trailing connector with nothing `strong`-carrying after it in its own span is not a finding: with nothing to fold into, it's simply untagged text, and folding it backward would misattribute it under a Strong's number it has no lexical relationship to (Genesis 1:15 KJV1769 ends `{text: " upon the earth:", strong: "H776"}, " and it was so."`: untagged, trailing, correctly unflagged).
- **A `ContentNested` wrapper is never a merge target** – It carries `strong` but no top-level `text`, so a connector folding into it would have nowhere to land. `isRealAttachmentPoint`/`canJoinForward` both require actual text on the target side.
- **Mark/script agreement blocks a merge, not just formatting** – A small-caps divine name (`marks: ["sc"]`) staying split from an unmarked connector beside it isn't a bug; merging would either mis-mark the connector small-caps or break the small-caps convention. Both check 1 and check 4 share this same `agreesInFormatting` gate.
- **A textless Strong's sibling is transparent, not a boundary** – `{strong: "H853"}` (no `text`, no nested `content`) renders zero characters. Check 3 skips through it backward to find a real attachment point; check 4 skips through it forward to find the real node to test mark-agreement against (real Matthew 3:15 KJV1769 shape: `{text: " it becometh", marks: ["woc"]}, " ", {strong: "G2076"}, {text: "us", marks: ["woc"]}`. The space correctly rolls onto `"us"`, past the unmarked textless sibling).
- **`break`/`paragraph` mark real piece boundaries a formatting match can't paper over** – A `break: true` on the connector itself, or `paragraph: true` opening on the target, blocks a finding even when every other condition matches.
- **Verse-initial-space detection never recurses into a `ContentNested` wrapper** – A leading space inside one is completely ordinary (mid-sentence insertion, not a verse's own start), so this check looks only at a verse's own outermost `content[0]`.
- **`validate.ts` runs this audit too** – `auditVersion(versionId)` is called directly from `utils/validate.ts`'s `main()`, once per version being validated, using the exported `isClean()`/`printFindingLines()` to render the same report shape rather than a second, divergent copy of it. `validate.ts` always calls `printFindingLines` with `verbose: false` — there is no flag to change that, since neither this module nor `validate.ts` parses `process.argv` any more. A version with any finding fails validation alongside its schema checks.
- **Check 6 is flat and corpus-wide, with no per-book judgment.** A heading/subtitle run whose own real next node fails to open a paragraph is a finding everywhere, in every version and every book — no evidence-gathering step decides first whether a given book "elsewhere pairs the two," and no allowlist exempts one that doesn't. A run with nothing after it at all (the end of a book's own content) reports nothing, since there is no node for the convention to apply to.
- **Check 7 shares its rule with the USFM importer, not just its name.** `hasUnnormalizedFraction` calls the same `normalizeFractionText` (`functions/normalizeFractions.ts`) the import pipeline applies while building content in the first place, so a version imported by hand and a version imported from USFM are held to one fraction convention rather than two.
- **Checks 10, 11, and 16 each carry a deliberate asymmetry with their neighbors, or with each other.** Check 10 detects more than the ellipsis auto-fix rewrites: both report the same three-plus-dot and spaced-dot shapes, but check 10 also flags a bare two-period run, which the auto-fix refuses to touch as a standing rule (see `functions/normalizeEllipses.ts`'s own doc comment for why). Checks 11 and 16 detect only and never fix, permanently, for the identical reason: disambiguating a straight quote, or deciding what a non-breaking space was meant to hold together, needs context a character-level rule cannot supply.
- **Check 12 asks a render-order question, not a node-local one.** It doesn't just test whether a footed node's own `text` ends in whitespace — it asks whether the *visible text accumulated up to and including this node* ends in whitespace, which is what catches a textless `{foot}` anchor whose predecessor supplied the trailing space. A node-local test would miss that shape entirely.
- **Check 13 requires the mix, not the mere presence of a non-Latin letter.** An all-Greek string on an all-Greek version's node (BYZ2018's own 154,305 Greek nodes) is ordinary, correct verse text; the finding is a Latin letter and a Hebrew-or-Greek letter sharing one untagged string, contradicting the settled convention that a non-Latin run gets its own `{text, script}` node. `functions/tagScriptRunsInContent.ts`'s own `hasMixedScriptText` is the one place that judgment lives; both this check and its fixer call it.
- **Check 14 is deliberately tight, because the common case looks almost identical to the defect.** Two adjacent siblings sharing a byte-identical `foot` are common corpus-wide, and the large majority are correct: the same note genuinely annotating two real, separate word occurrences, each on its own text-bearing node (real ASV1901 shape: `"cursed art thou "` and `"above all cattle, and "` both carrying the identical "Or, from among" note). Only the shape where the *later* node renders no visible text of its own is a defect — a check that flagged the byte-identical pair alone would be wrong roughly nine times out of ten.
- **Check 15's merge is proven safe by measurement, not by assumption.** The dominant shape is structural residue — a heading like `{"heading": ["The Angel of the ", {"text": "Jehovah"}]}` — but merging would be wrong if a version used the second node's own split-off shape to carry a mark the first node lacked. YLT1898 was checked directly before shipping this check: it carries 98 nodes whose own text starts "Jehovah" and **zero** of them are `sc`-marked, so there is no small-caps convention here for a merge to destroy evidence of.

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

Unlike the placement checks (1-6, 8, 9, 12, 14, 15), this one has nothing to do with a node's position relative to its neighbors; it applies to any text-bearing node, `strong`-carrying or not. Checks 10, 11, 13, and 16 share that same shape.
