# Validation Domain

## Overview

The Validation domain ensures data integrity across all Bible JSON files, and `npm run validate` is the sole entry point for every normalization and validation rule this repo enforces on `bible-versions/**` — see "One Entry Point" below. Its own seventeen-step auto-fix pass normalizes key ordering, JSON formatting, `bibleLink` dashes and ranges, fractions, and ellipses; tags an untagged non-Latin script run; repairs several Strong's-node placement conventions, including where a footnote marker's own joining space belongs; drops a meaningless empty-text remnant and a duplicate footnote anchor; unlinks a `bibleLink` target the version cannot resolve; and merges adjacent siblings that differ in nothing but text — then proves that whole pass is a fixed point of itself before checking anything else. It then validates schemas, book ordering, file naming, verse structure, and cross-references between entities, and finally runs five report-only audits for the same version(s): declared chapter counts, cross-chapter links, truncated ranges, Strong's-node placement, and unresolvable `bibleLink` targets. Runs as a pre-commit check and CI gate.

**One version, CLV1880, is permanently expected to fail the declared-chapter-count audit** on exactly two findings (its own Esther and Daniel, both missing that edition's deuterocanonical additions) until that content is imported — see [bible-versions.md](../4-domains/bible-versions.md). A red `npm run validate` naming only those two findings is this repo's accepted state, not a bug to fix.

## Core Entities

### Validation Targets

| Target                | Schema                       | Description      |
| --------------------- | ---------------------------- | ---------------- |
| `bible-books.json`    | `bible-books-schema.json`    | Book registry    |
| `bible-versions.json` | `bible-versions-schema.json` | Version registry |
| `{version}/*.json`    | `bible-verses-schema.json`   | Verse files      |

### Validation Checks

The auto-fix pass runs first, in this order, then a fixed-point check confirming that pass has nothing left to change on a second application, then the hierarchical checks, then five report-only audits. See "One Entry Point" below for why this is the only way any of it runs.

1. **Key Sorting** – Auto-sorts verse and content keys to canonical order
2. **JSON Formatting** – Reformats each file's parsed data through the same Prettier-based pass `writeJsonFile` uses, so a file a later step rewrites needs no separate reformatting pass
3. **bibleLink Dash Normalization** – Converts a hyphen to an en dash (U+2013) only when it sits between two digits, in a `bibleLink` target or its `content` display override; a hyphenated word in free-form display text survives untouched
4. **Truncated bibleLink Range Reconstruction** – Completes a `bibleLink` target cut off short of the multi-verse range its own display text already names; declines a display that spans two chapters, leaving that case to the split step immediately after it; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
5. **Cross-Chapter Range Split** – Splits a `bibleLink` target spanning two chapters into two chapter-scoped links joined by a literal en dash; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
6. **Fraction Normalization** – Rewrites a raw fraction shape (an ASCII `N/M` slash, a precomposed vulgar-fraction glyph, or digits already split by U+2044 but not yet raised/lowered) to this repo's superscript/U+2044/subscript convention
7. **Ellipsis Normalization** – Rewrites an un-normalized dot run to U+2026, this repo's ellipsis convention; deliberately leaves a bare two-period run untouched as a standing rule (see [strongs-node-audit.md](../4-domains/strongs-node-audit.md), check 10)
8. **Untagged Script-Run Tagging** – Splits a node's own text at a Hebrew or Greek letter run embedded in otherwise-Latin prose into its own `{text, script}` node (check 13); declines and reports when the node also carries `strong`, `foot`, `marks`, or any property beyond bare text, since splitting it would have to decide which fragment keeps the property; see [strongs-node-audit.md](../4-domains/strongs-node-audit.md), check 13
9. **Unmerged Connector Merge** – Folds an untagged connector forward into the `strong`/`foot`/`break`-carrying neighbor immediately after it (Strong's-node check 1); see [strongs-node-audit.md](../4-domains/strongs-node-audit.md)
10. **Footnote Punctuation Reorder** – Moves tight closing punctuation ahead of a footnote marker that would otherwise render before it, when the move is safe (check 8); declines and leaves a real finding in place otherwise
11. **Mark-Boundary Space Relocation** – Relocates a bare whitespace node onto the leading edge of a same-marked neighbor, when the move is safe (check 9); declines and leaves a real finding in place otherwise
12. **Footnote-Marker Spacing Relocation** – Moves a joining space off the trailing edge of a `foot`-carrying node onto the leading edge of the node after it — the same leading-space convention check 2 already enforces for `strong`, extended here to `foot` (check 12). Asks the render-order question, not just "does this node's own text end in whitespace," so a textless `{foot}` anchor is caught too; declines and leaves a real finding in place when there is no real next node at this array level, a `break`/`paragraph` boundary sits at the join, the next node's own text already starts with whitespace, or the two sides disagree in `marks`/`script`; see [strongs-node-audit.md](../4-domains/strongs-node-audit.md), check 12
13. **Empty Text Key Drop** – Drops an empty `text: ""` key from a node that carries something else alongside it (real KJV1769 shape: `{text: "", foot: {...}}`), leaving every other property untouched. A node whose *only* property is an empty `text`, or that carries no properties at all, is a different question this step doesn't answer — see check 25 below
14. **Duplicate Footnote Anchor Removal** – Deletes a node that renders no visible text of its own whose `foot` is byte-for-byte identical to the nearest surviving node before it (check 14). The far more common shape — one note correctly annotating two real, separate word occurrences, each on its own text-bearing node — is never touched, since the later node there still renders text of its own; see [strongs-node-audit.md](../4-domains/strongs-node-audit.md), check 14
15. **Unresolvable bibleLink Unlink** – Strips the `bibleLink` wrapper off a target that parses but names a book, chapter, or verse the version does not carry, keeping its display text (or the bare target string when there is no override) as plain content; declines when an override is present but renders no visible text; never touches a target the endpoint grammar cannot parse at all — that is a different, deliberately excluded case; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
16. **Mergeable Sibling Merge** – Normalizes a `{text}`-only object into a bare string, then folds a maximal run of adjacent siblings that agree in `marks`/`script` into one node (check 15). A node carrying `strong`, `foot`, `bibleLink`, nested `content`, `paragraph`, or `break` is never eligible on either side; see [strongs-node-audit.md](../4-domains/strongs-node-audit.md), check 15
17. **Heading Paragraph Flag** – Adds a missing `paragraph: true` to the node right after a heading/subtitle run (check 6), flat and corpus-wide, with no per-book judgment
18. **Auto-Fix Pass Fixed-Point Check** – Re-applies steps 3 through 17 above, in the same order, to the in-memory content of every file the pass just changed, and fails by name — file, verse, and step — if any of them would still report a change on this second application. On a settled corpus nothing changed, so nothing is even re-read; the moment two steps interact, this catches it in the run that introduced the interaction rather than requiring a second, manual `npm run validate` to notice
19. **Schema Validation** – JSON conforms to JSON Schema Draft-07
20. **Book Order Integrity** – Orders start at 1, sequential, no gaps or duplicates
21. **File Existence** – Expected verse files exist for each book in version
22. **File Naming** – Files match `{order}-{bookId}.json` pattern
23. **Book Field Match** – Verse `book` field matches filename book ID
24. **Reference Integrity** – Book IDs in versions exist in books registry
25. **Meaningless Content Nodes** – Flags a node that renders nothing: `marks`/`script` with no `text` to apply them to (a non-greedy bold/italic delimiter pairing can't match zero characters and leaks into surrounding text), or an empty `text: ""` riding alongside anything else the node still carries — not only when `text` is the node's *sole* key, but also a husk like `{text: "", foot: {...}}` that keeps a stray `foot`/`break` after its own marks were stripped. `foot`, `strong`, `morph`, `lemma`, `bibleLink`, and bare `paragraph`/`break` are meaningful with **no `text` key at all**, and none of those combinations is ever flagged; the gap this check closes is specifically an empty *string*, never an absent key
26. **Strong's Trailing Whitespace** – Flags a `strong`-carrying node whose own `text` ends in whitespace, violating the convention that a joining space belongs on the *following* node's leading edge, not the tagged node's trailing edge
27. **Declared Chapter Count Audit** (report-only) – Compares a book's declared `chapters` count in `_version.json` against the highest chapter its own verse file actually carries, in both directions. **CLV1880's Esther and Daniel are a standing, accepted exception**, not a bug to fix — see [bible-versions.md](../4-domains/bible-versions.md) before treating this finding as a regression
28. **Cross-Chapter Link Audit** (report-only) – Delegates to `findCrossChapterLinks()` for each version being validated; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
29. **Truncated bibleLink Range Audit** (report-only) – Delegates to `findTruncatedRanges()` for each version being validated, its own labeled count distinct from check 28 above; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
30. **Strong's-Node Placement Audit** (report-only) – Delegates to `auditVersion()` for each version being validated, covering all sixteen checks that domain owns; see [strongs-node-audit.md](../4-domains/strongs-node-audit.md)
31. **Unresolvable bibleLink Target Audit** (report-only) – Delegates to `findUnresolvableTargets()` for each version being validated, reporting whatever step 15 above declined to unlink; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)

### Canonical Key Order

Content objects follow this canonical key order:

1. `subtitle` – Section subtitle
2. `heading` – Section heading
3. `paragraph` – Paragraph marker (boolean or object)
4. `type` – Footnote type
5. `text` – Text content
6. `content` – Nested content array
7. `script` – Script indicator (H/G)
8. `marks` – Formatting marks (alphabetized)
9. `break` – Line break indicator
10. `foot` – Footnote reference
11. `strong` – Strong's number
12. `morph` – Morphological code
13. `lemma` – Lexical lemma

Verse objects follow: `book`, `chapter`, `verse`, `content`

## User Workflows

- **Run Validation** – Execute `npm run validate` before committing changes
- **CI Validation** – Validation runs automatically in CI pipeline
- **Error Investigation** – Validation outputs specific error locations and messages
- **Key Standardization** – Keys are auto-sorted on validation; manual sorting via `npx ts-node utils/sortBibleKeys.ts <version>`

## Key Business Rules

- **Exit on Failure** – Script exits with code 1 on any validation failure
- **Auto Key Sorting** – Validation automatically normalizes key order before formatting
- **Cascading Schemas** – Content schema referenced by verse schema, which is used by version validation
- **AJV Schema Registration** – All referenced schemas must be registered with AJV before validation
- **Comprehensive Output** – Each check logs success (✅) or failure (❌) with details
- **Both New Checks Are Exported, Standalone Functions** – `findMeaninglessContentNodes()` and `findStrongTrailingWhitespaceNodes()` each take a verse's `content` tree directly and return path-labeled problem strings (e.g. `content[0].foot.content[1]`), independent of the CLI, usable from tests or other tooling without running the full validation pass
- **Import-Safe Entry Point** – `main()` only runs when this module is the process entry point (`require.main === module`), so tests can import `validate.ts` for its exported functions without triggering a full validation run as a side effect
- **The trailing audits are peers, not a pipeline** – The hierarchical checks above them each assume the earlier ones held, so a failure exits immediately. The declared-chapter-count audit, the cross-chapter link audit, the truncated-range audit, the Strong's-node audit, and the unresolvable-`bibleLink`-target audit depend on neither each other nor anything upstream, so all five always run to completion and report in full before `main()` exits non-zero. A version that fails one still gets audited by the others in the same run. This matters beyond thoroughness: CLV1880's own declared-chapter-count finding is now a permanent, accepted part of every run (see [bible-versions.md](../4-domains/bible-versions.md)), so if that audit exited early the other four would never run at all — a real regression in any of them would go unnoticed forever behind the one accepted red finding.

## One Entry Point

`npm run validate` is the only way any normalization or validation in this repo runs. There is no separate audit script anywhere in the tree, and no `--fix` flag anywhere — not on `validate` itself, not on anything it calls into. Every rule this repo enforces on `bible-versions/**` falls into exactly one of two buckets: repaired automatically by validate's own auto-fix pass, because the rewrite is unambiguous and decidable from the text alone, or reported by it with enough detail to act on, because deciding what to do needs a judgment call a mechanical fix would get wrong on real Bible text. A destructive rule, or one that only makes sense as a reading of the raw markup a specific source produces, stays in import-time tooling instead and never runs here. Losing the standalone `--fix` preview these checks used to ship as separate CLIs is not a safety regression: nothing in this pipeline commits itself. Every run leaves its work sitting in the working tree, and `git diff` is the review surface — it shows the exact bytes that changed, which is strictly more information than a console count ever was.

The consequence for import scripts falls directly out of that. Because `validate.ts` enforces every normalization invariant this repo has, for every source a version's content came from — imported, hand-keyed, or edited by hand afterward — a per-source importer no longer needs to enforce any of those invariants itself; it only needs to produce content that a subsequent `npm run validate` can normalize and check like any other. That is why eleven one-off scripts under `imports/` (edition-specific fixers, a one-time OT morphology migration, a small-caps casing pass, and the rest) were retired outright rather than promoted into this pass: each encoded a rule that either already lived here or belonged one time, at import, and never again.

`utils/overhaulFootnotes.ts` and `utils/usfm/footnoteTypeRules.ts` are the one deliberate exception, staying out of the recurring pass on purpose. Footnote-type re-classification is more destructive than anything else this pipeline runs: its own safe default depends on preserving a prior human judgment it has no way to re-derive (a stored, non-`stu` type it refuses to overwrite without evidence), and its `--hard-reset` mode discards every stored type and rebuilds all of them from the classifier alone. A rule whose safe default depends on preserving a judgment it cannot recompute is not a candidate for a pass that runs on every commit; it belongs at import time and as an opt-in manual CLI, run deliberately rather than silently. A future reader should not "finish the job" by wiring this into `validate.ts`.

One import script's rule was investigated and rejected outright, not merely retired for being redundant. `imports/fixMarkedWhitespace.ts` split a marked leaf's own leading/trailing whitespace out into a bare sibling, unconditionally. Measured against the live corpus, 25,600 of its 25,702 real targets carry `marks: ["woc"]` — words of Christ — a mark neither export ever renders visibly, so promoting the rule would have meant real code and a corpus-wide rewrite for a change nobody would ever see. Check 9's own narrower, user-confirmed form of the same idea is what actually ships instead.

The `bibleLink` work follows the same shape. The hyphen guard converts a hyphen to an en dash only when it sits between two digits, so a hyphenated word inside a free-form display override survives untouched; every separator already in the corpus satisfies that condition, so the narrower guard changes nothing on real data today — it only closes a gap the old blanket replacement left open for the next hand-edited note. The truncated-range check and its reconstruction live in `crossChapterLinks.ts` rather than in `validate.ts` itself, because completing a range and splitting one that spans two chapters are the same family of judgment, built on the same per-version chapter-length index that module already owns; a truncated range whose own display spans two chapters is declined by the reconstruction step and left for the cross-chapter split immediately after it, rather than being reconstructed and then re-split. This is the one rule in the repo with no real corpus findings behind it — every target already carries its own dash — so it was proven by a unit-test fixture plus one live round trip instead: a real node hand-broken into the truncated shape, repaired by a single `validate` run, and reverted.

## What This Pipeline Enforces, Stated Plainly

A few rules this pipeline holds every version to are easy to miss from the checks list alone, because each one crosses several checks or otherwise lives in a doc comment rather than a check name. Stated directly, so a reader never has to look elsewhere for them:

- **Schema-valid is not meaning-valid, in two distinct ways.** A node can satisfy `content-schema.json`'s `oneOf`/`additionalProperties: false` shape and still render nothing: `marks`/`script` applied to a node with no `text` at all (a non-greedy bold/italic delimiter can't wrap zero characters, so the opening delimiter leaks into the surrounding text), or an empty `text: ""` riding alongside whatever else the node still carries. Ajv is silent on both; check 25 catches both.
- **A joining space belongs on the leading edge of what comes after it, never the trailing edge of what comes before it — for every attribute that can own that boundary, not only the first one that happened to get a check.** This repo enforces it for `strong` (check 26) and, as of check 12, for `foot` too: a footnote marker renders wherever the accumulated visible text before it already ends, so a footed node whose own text ends in a space puts its own marker one character away from the word it annotates rather than hugging it. See [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for this stated as its own general rule, not just as the two checks that follow from it.
- **One convention is one shared function, never a parallel table.** The USFM importer and this pipeline's own checker read the identical code for fraction normalization (`functions/normalizeFractions.ts`), ellipsis normalization (`functions/normalizeEllipses.ts`), and non-Latin script-run splitting (`utils/usfm/splitScriptRuns.ts`), so a hand-edited verse and an imported one are held to one rule each, never two that could quietly drift apart.
- **A dash check is scoped to the construct, not the character.** Step 3's hyphen-to-en-dash rewrite fires only inside a `bibleLink` target or its display override, and only when the hyphen sits between two digits — a hyphenated word in ordinary prose is never touched, by design.
- **Corpus completeness is checked at three separate grains, not assumed from a green schema.** File existence and naming (checks 21-22) confirm every book a version declares has exactly one file; book ordering (check 20) confirms no gap or duplicate in the numbering; and the declared chapter count audit (check 27) confirms each book's own `_version.json` entry agrees with the chapters its file actually carries. A version can pass every schema check and still be missing real content — CLV1880's own Esther and Daniel are exactly that today.
- **No reformatting churn.** Step 2 reformats a file's *parsed* data through the same Prettier pass `writeJsonFile` always uses, not its raw on-disk text, so a file no other step touches is never rewritten merely because Prettier's own formatting has drifted from what's committed.
- **"Report what it can't fix" is not a separate code path — it falls out of the pass ordering.** Every gated step among truncated-range reconstruction (step 4), untagged script-run tagging (step 8), footnote punctuation reorder (step 10), mark-boundary space relocation (step 11), footnote-marker spacing relocation (step 12), and the unresolvable-`bibleLink` unlink (step 15) either fixes a finding or declines it with a named reason. Whatever it declines is still sitting on disk by the time the report-only audits run after the pass, so the identical finding surfaces there with actionable detail — with no extra code written to make that connection happen.

## Representative Code Examples

### Key Sorting During Validation

_From [utils/validate.ts](../../utils/validate.ts)_

```typescript
import { sortVerseKeys } from "../functions/sortContentKeys";
import { writeJsonFile } from "../functions/writeJsonFile";

async function sortVerseFileKeys(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  // Sort keys in each verse
  const sortedVerses = verses.map((verse: Record<string, unknown>) =>
    sortVerseKeys(verse)
  );

  // Check if anything changed
  const originalSerialized = JSON.stringify(verses);
  const sortedSerialized = JSON.stringify(sortedVerses);

  if (originalSerialized !== sortedSerialized) {
    await writeJsonFile(filePath, sortedVerses);
    return true;
  }

  return false;
}
```

`writeJsonFile()` formats the JSON in-process and writes it through a stage-then-rename helper rather than `fs.writeFileSync`. See [Writing files](../../documentation/EGP-Graphai/data-pipeline.md#writing-files) for why, and the [TypeScript utilities style guide](../5-style-guides/typescript-utilities.md) for the pattern used across all four writer scripts.

### Schema Validation Function

_From [functions/validateJsonAgainstSchema.ts](../functions/validateJsonAgainstSchema.ts)_

```typescript
export default function validateJsonAgainstSchema(
  schemaPath: string,
  jsonPath: string
): { valid: boolean; errors?: any[] } {
  try {
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);
    const jsonContent = fs.readFileSync(jsonPath, "utf-8");
    const data = JSON.parse(jsonContent);

    const ajv = new Ajv();

    // Load additional schemas for $ref resolution
    try {
      const contentSchemaContent = fs.readFileSync(
        "content-schema.json",
        "utf-8"
      );
      ajv.addSchema(JSON.parse(contentSchemaContent));
    } catch (e) {
      /* Ignore if not found */
    }

    if (schemaPath !== "./bible-books/bible-books-schema.json") {
      try {
        const bookSchemaContent = fs.readFileSync(
          "bible-books/bible-books-schema.json",
          "utf-8"
        );
        ajv.addSchema(JSON.parse(bookSchemaContent));
      } catch (e) {
        /* Ignore if not found */
      }
    }

    const validate = ajv.compile(schema);
    const valid = validate(data);
    return { valid, errors: valid ? undefined : (validate.errors ?? []) };
  } catch (error: any) {
    return { valid: false, errors: [error.message] };
  }
}
```

### Book Order Validation

_From [utils/validate.ts](../utils/validate.ts)_

```typescript
for (const version of versions) {
  const books = version.books || [];
  const orderValues = books.map((item: any) => item.order);
  const sortedOrders = _.sortBy(orderValues);

  // Check for duplicates
  const duplicates = _.filter(
    _.groupBy(books, "order"),
    (group) => group.length > 1
  );

  if (duplicates.length > 0) {
    console.error(`❌ ${version._id} has duplicate order numbers:`);
    booksValidationPassed = false;
  }

  // Check if starts at 1
  if (sortedOrders[0] !== 1) {
    console.error(`❌ ${version._id} does not start at 1`);
    booksValidationPassed = false;
  }

  // Check for gaps in sequence
  const expectedCount = sortedOrders[sortedOrders.length - 1];
  if (sortedOrders.length !== expectedCount) {
    const allExpected = _.range(1, expectedCount + 1);
    const missing = _.difference(allExpected, sortedOrders);
    if (missing.length > 0) {
      console.error(`❌ ${version._id} has gaps. Missing: ${missing.join(", ")}`);
      booksValidationPassed = false;
    }
  }

  if (/* all checks pass */) {
    console.log(`✅ ${version._id}: ${sortedOrders.length} books, numbered 1–${expectedCount}`);
  }
}
```

### Verse File Validation

_From [utils/validate.ts](../utils/validate.ts)_

```typescript
for (const version of versionDirs) {
  const versionPath = `${bibleVersionsDir}/${version}`;
  const verseFiles = fs
    .readdirSync(versionPath)
    .filter((file) => file.endsWith(".json"));

  // Check for missing files
  for (const expectedFile of expectedFiles) {
    if (!actualFiles.has(expectedFile)) {
      console.error(`❌ Missing file for book in version ${version}`);
      verseValidationPassed = false;
    }
  }

  // Check for extra files
  for (const actualFile of actualFiles) {
    if (!expectedFiles.has(actualFile)) {
      console.error(`❌ Extra file ${actualFile} not in books array`);
      verseValidationPassed = false;
    }
  }

  for (const file of verseFiles) {
    const bookIdFromFilename = file.split("-")[1].replace(".json", "");

    // Check if filename matches a valid book ID
    if (!validBookIds.has(bookIdFromFilename)) {
      console.error(`❌ Invalid filename: book ID not found`);
      verseValidationPassed = false;
      continue;
    }

    // Validate each verse against schema
    const verses = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    for (const verse of verses) {
      const valid = validateVerse(verse);
      if (!valid) {
        console.error(`❌ Schema validation failed for verse`);
        verseValidationPassed = false;
      }

      // Check book field matches filename
      if (verse.book !== bookIdFromFilename) {
        console.error(`❌ Book field mismatch`);
        verseValidationPassed = false;
      }
    }

    console.log(`✅ ${file}: ${verses.length} verses validated`);
  }
}
```

### Meaningless Content Node Detection

_From [utils/validate.ts](../../../utils/validate.ts)_

```typescript
export function findMeaninglessContentNodes(content: Content): string[] {
  const problems: string[] = [];

  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${at}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;

    const properties = node as Record<string, unknown>;
    // formatting (marks/script) with no text is flagged; an empty text: "" is
    // flagged too, whatever else the node carries alongside it (foot, break, ...);
    // a node with no text key at all is meaningful on its own and never flagged
    // ...
  };

  walk(content, "content");
  return problems;
}
```

The walk descends through every content-bearing branch, including `foot.content`, subtitles, and headings, not just the top level; guarding only the top-level path is exactly how the two shapes this check targets survived an earlier cleanup pass undetected.

### Exit on Failure

_From [utils/validate.ts](../utils/validate.ts)_

```typescript
if (!booksValidationPassed) {
  console.error("\n❌ Books validation failed!");
  process.exit(1);
}

if (!versionsResult.valid) {
  console.error("\n❌ Bible versions schema validation failed:");
  process.exit(1);
}

if (!verseValidationPassed) {
  console.error("\n❌ Verse file validation failed!");
  process.exit(1);
}
```

### The trailing audits run as peers, then gate together

_From [utils/validate.ts](../../../utils/validate.ts)_

```typescript
// All five loops run to completion regardless of one another's outcome.
// Unlike the hierarchical exits above, none of the five audits depends on
// any of the others — including the declared-chapter-count audit, whose own
// CLV1880 findings are now a permanent, accepted part of every run and must
// never block the other four from running to completion.
for (const versionDir of versionDirs) {
  const mismatches = declaredChapterMismatchesByVersion.get(versionDir) ?? [];
  if (mismatches.length > 0) declaredChapterMismatchesPassed = false;
}

for (const versionDir of versionDirs) {
  const { findings } = findCrossChapterLinks(versionDir);
  if (findings.length > 0) crossChapterLinksPassed = false;
}

for (const versionDir of versionDirs) {
  const { findings } = findTruncatedRanges(versionDir);
  if (findings.length > 0) truncatedRangesPassed = false;
}

for (const versionDir of versionDirs) {
  const summary = auditNodeConventions(versionDir);
  if (!nodeConventionsAreClean(summary)) nodeConventionsPassed = false;
}

for (const versionDir of versionDirs) {
  const { findings } = findUnresolvableTargets(versionDir);
  if (findings.length > 0) unresolvableTargetsPassed = false;
}

if (
  !declaredChapterMismatchesPassed ||
  !crossChapterLinksPassed ||
  !truncatedRangesPassed ||
  !nodeConventionsPassed ||
  !unresolvableTargetsPassed
) {
  process.exit(1);
}
```
