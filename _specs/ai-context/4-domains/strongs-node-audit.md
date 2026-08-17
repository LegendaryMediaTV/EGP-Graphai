# Strong's-Node Audit Domain

## Overview

Verse content is built one lexical node at a time, each carrying its own `strong` number, `marks`, and joining whitespace. That structure can drift out of alignment with this repo's own text-flow conventions during import or hand-editing — a connector word left unmerged, a joining space on the wrong side of a boundary, a verse that shouldn't open with whitespace at all. This domain owns detecting five such drift patterns, corpus-wide, across every version this repo carries.

[utils/auditStrongsNodes.ts](../../../utils/auditStrongsNodes.ts) is the sole owner — both the detection logic and the CLI. Unlike the cross-chapter link auditor (see [cross-chapter-links.md](./cross-chapter-links.md)), it has no `--fix` path: it only ever reports.

## Core Entities

### NodeShape

The shared, cheaply-computed read of one array element — a plain string, a `strong`-carrying object, a `ContentNested` wrapper, or a `heading`/`subtitle`/`bibleLink` boundary — that every check below is built on:

- `text` — `undefined` for a wrapper/boundary/textless-sibling; the string otherwise
- `marks` / `script` — normalized to an empty array/`undefined` when absent, so two nodes can be compared for formatting agreement without null-checking first
- `strong`, `hasFoot`, `hasNestedContent`, `isTextlessStrongSibling`, `opensParagraph`, `endsBreak`, `isBoundary` — the flags each check reads to decide eligibility

### The five findings

| Finding | Shape it flags | Direction it fixes toward |
| ------- | --------------- | -------------------------- |
| Unmerged node pairs | An untagged connector word immediately before a `strong`-carrying node | Forward-only — folds into the node *after* it, never the one before |
| Trailing whitespace | A `strong`-carrying node's own text ending in a space | N/A — the space belongs leading the next node instead |
| Leading punctuation | A `strong`-carrying node's own text starting with tight punctuation (comma, closing quote, …) | Backward — the punctuation belongs on the node *before* it |
| Mark-boundary spaces | A bare whitespace-only node between two real nodes sharing the same `marks`/`script` | Forward — rolls onto the leading edge of the node after it |
| Verse-initial spaces | A verse's own outermost content opening with whitespace | Collapse-or-trim, verse-scoped only (never inside a `ContentNested` wrapper) |

## User Workflows

- **Audit every version** – `npm run audit-strongs-nodes` (read-only report; also accepts `-- <versionId> --verbose` to scope and expand)
- **Audit one version, capped output** – `npx ts-node utils/auditStrongsNodes.ts KJV1769` (first 10 findings per check, then a "… N more" note)
- **List every finding** – `npx ts-node utils/auditStrongsNodes.ts KJV1769 --verbose`
- **Programmatic single-verse check** – `findStrongsNodeIssues(verse.content)` returns all five findings for one verse's content tree without touching disk

## Key Business Rules

- **Read-only by design** – Every one of the five checks only detects. There is no `--fix` flag anywhere in this file; fixing a finding is a manual, judgment-driven edit to the corpus, not something this tool can safely automate (the "which direction does this word belong" call the checks below make explicit is exactly the kind of judgment a mechanical fixer would get wrong on real Bible text).
- **Check 1 folds forward only, never backward** – A trailing connector with nothing `strong`-carrying after it in its own span is not a finding: with nothing to fold into, it's simply untagged text, and folding it backward would misattribute it under a Strong's number it has no lexical relationship to (Genesis 1:15 KJV1769 ends `{text: " upon the earth:", strong: "H776"}, " and it was so."` — untagged, trailing, correctly unflagged).
- **A `ContentNested` wrapper is never a merge target** – It carries `strong` but no top-level `text`, so a connector folding into it would have nowhere to land. `isRealAttachmentPoint`/`canJoinForward` both require actual text on the target side.
- **Mark/script agreement blocks a merge, not just formatting** – A small-caps divine name (`marks: ["sc"]`) staying split from an unmarked connector beside it isn't a bug; merging would either mis-mark the connector small-caps or break the small-caps convention. Both check 1 and check 4 share this same `agreesInFormatting` gate.
- **A textless Strong's sibling is transparent, not a boundary** – `{strong: "H853"}` (no `text`, no nested `content`) renders zero characters. Check 3 skips through it backward to find a real attachment point; check 4 skips through it forward to find the real node to test mark-agreement against (real Matthew 3:15 KJV1769 shape: `{text: " it becometh", marks: ["woc"]}, " ", {strong: "G2076"}, {text: "us", marks: ["woc"]}` — the space correctly rolls onto `"us"`, past the unmarked textless sibling).
- **`break`/`paragraph` mark real piece boundaries a formatting match can't paper over** – A `break: true` on the connector itself, or `paragraph: true` opening on the target, blocks a finding even when every other condition matches.
- **Verse-initial-space detection never recurses into a `ContentNested` wrapper** – A leading space inside one is completely ordinary (mid-sentence insertion, not a verse's own start), so this check looks only at a verse's own outermost `content[0]`.
- **`--verbose` survives npm's own flag-swallowing** – `npm run audit-strongs-nodes KJV1769 --verbose` (no `--` separator) never delivers a literal `--verbose` to `process.argv` — npm's CLI parsing consumes it as its own `--loglevel verbose` first. The tool also checks `process.env.npm_config_loglevel`, the one signal that invocation shape actually leaves behind, so verbose output still works as typed.

## Representative Code Examples

### Formatting agreement gates a merge

_From [utils/auditStrongsNodes.ts](../../../utils/auditStrongsNodes.ts)_

```typescript
function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
  return a.script === b.script && a.marks.length === b.marks.length && a.marks.every((mark, at) => mark === b.marks[at]);
}
```

### Skipping through a textless Strong's sibling (check 4)

_From [utils/auditStrongsNodes.ts](../../../utils/auditStrongsNodes.ts)_

```typescript
let j = i + 1;
while (j < nodes.length && shapes[j].isTextlessStrongSibling) j++;
if (j >= nodes.length) continue;

const target = shapes[j];
if (!isRealAttachmentPoint(target) || target.opensParagraph) continue;
if (!agreesInFormatting(left, target)) continue;
```

### The npm `--verbose`-swallowing fallback

_From [utils/auditStrongsNodes.ts](../../../utils/auditStrongsNodes.ts)_

```typescript
const verbose = args.includes("--verbose") || /^(verbose|silly)$/.test(process.env.npm_config_loglevel ?? "");
```
