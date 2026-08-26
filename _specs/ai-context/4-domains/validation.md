# Validation Domain

## Overview

The Validation domain ensures data integrity across all Bible JSON files, and `npm run validate` is the sole entry point for every normalization and validation rule this repo enforces on `bible-versions/**` — see "One Entry Point" below. Its own auto-fix pass normalizes key ordering, JSON formatting, `bibleLink` dashes and ranges, fractions, and ellipses, and repairs four Strong's-node placement conventions. It then validates schemas, book ordering, file naming, verse structure, and cross-references between entities, and finally runs the cross-chapter link, truncated-range, and Strong's-node placement audits for the same version(s). Runs as a pre-commit check and CI gate.

## Core Entities

### Validation Targets

| Target                | Schema                       | Description      |
| --------------------- | ---------------------------- | ---------------- |
| `bible-books.json`    | `bible-books-schema.json`    | Book registry    |
| `bible-versions.json` | `bible-versions-schema.json` | Version registry |
| `{version}/*.json`    | `bible-verses-schema.json`   | Verse files      |

### Validation Checks

The auto-fix pass runs first, in this order, then the hierarchical checks, then the three report-only audits. See "One Entry Point" below for why this is the only way any of it runs.

1. **Key Sorting** – Auto-sorts verse and content keys to canonical order
2. **JSON Formatting** – Reformats each file's parsed data through the same Prettier-based pass `writeJsonFile` uses, so a file a later step rewrites needs no separate reformatting pass
3. **bibleLink Dash Normalization** – Converts a hyphen to an en dash (U+2013) only when it sits between two digits, in a `bibleLink` target or its `content` display override; a hyphenated word in free-form display text survives untouched
4. **Truncated bibleLink Range Reconstruction** – Completes a `bibleLink` target cut off short of the multi-verse range its own display text already names; declines a display that spans two chapters, leaving that case to the split step immediately after it; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
5. **Cross-Chapter Range Split** – Splits a `bibleLink` target spanning two chapters into two chapter-scoped links joined by a literal en dash; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
6. **Fraction Normalization** – Rewrites a raw fraction shape (an ASCII `N/M` slash, a precomposed vulgar-fraction glyph, or digits already split by U+2044 but not yet raised/lowered) to this repo's superscript/U+2044/subscript convention
7. **Ellipsis Normalization** – Rewrites an un-normalized dot run to U+2026, this repo's ellipsis convention; deliberately leaves a bare two-period run untouched as a standing rule (see [strongs-node-audit.md](../4-domains/strongs-node-audit.md), check 10)
8. **Unmerged Connector Merge** – Folds an untagged connector forward into the `strong`/`foot`/`break`-carrying neighbor immediately after it (Strong's-node check 1); see [strongs-node-audit.md](../4-domains/strongs-node-audit.md)
9. **Footnote Punctuation Reorder** – Moves tight closing punctuation ahead of a footnote marker that would otherwise render before it, when the move is safe (check 8); declines and leaves a real finding in place otherwise
10. **Mark-Boundary Space Relocation** – Relocates a bare whitespace node onto the leading edge of a same-marked neighbor, when the move is safe (check 9); declines and leaves a real finding in place otherwise
11. **Heading Paragraph Flag** – Adds a missing `paragraph: true` to the node right after a heading/subtitle run (check 6), flat and corpus-wide, with no per-book judgment
12. **Schema Validation** – JSON conforms to JSON Schema Draft-07
13. **Book Order Integrity** – Orders start at 1, sequential, no gaps or duplicates
14. **File Existence** – Expected verse files exist for each book in version
15. **File Naming** – Files match `{order}-{bookId}.json` pattern
16. **Book Field Match** – Verse `book` field matches filename book ID
17. **Reference Integrity** – Book IDs in versions exist in books registry
18. **Meaningless Content Nodes** – Flags a node that renders nothing: `marks`/`script` with no `text` to apply them to (a non-greedy bold/italic delimiter pairing can't match zero characters and leaks into surrounding text), or an empty `{text: ""}` husk left over from stripped marks. `foot`, `strong`, `morph`, `lemma`, `bibleLink`, and bare `paragraph`/`break` flags are left alone. Each is meaningful on its own even without `text`
19. **Strong's Trailing Whitespace** – Flags a `strong`-carrying node whose own `text` ends in whitespace, violating the convention that a joining space belongs on the *following* node's leading edge, not the tagged node's trailing edge
20. **Cross-Chapter Link Audit** (report-only) – Delegates to `findCrossChapterLinks()` for each version being validated; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
21. **Truncated bibleLink Range Audit** (report-only) – Delegates to `findTruncatedRanges()` for each version being validated, its own labeled count distinct from check 20 above; see [cross-chapter-links.md](../4-domains/cross-chapter-links.md)
22. **Strong's-Node Placement Audit** (report-only) – Delegates to `auditVersion()` for each version being validated, covering all eleven checks that domain owns; see [strongs-node-audit.md](../4-domains/strongs-node-audit.md)

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
- **The three trailing audits are peers, not a pipeline** – The hierarchical checks above them each assume the earlier ones held, so a failure exits immediately. The cross-chapter link audit, the truncated-range audit, and the Strong's-node audit depend on neither each other nor anything upstream, so all three always run to completion and report in full before `main()` exits non-zero. A version that fails one still gets audited by the other two in the same run.

## One Entry Point

`npm run validate` is the only way any normalization or validation in this repo runs. There is no separate audit script anywhere in the tree, and no `--fix` flag anywhere — not on `validate` itself, not on anything it calls into. Every rule this repo enforces on `bible-versions/**` falls into exactly one of two buckets: repaired automatically by validate's own auto-fix pass, because the rewrite is unambiguous and decidable from the text alone, or reported by it with enough detail to act on, because deciding what to do needs a judgment call a mechanical fix would get wrong on real Bible text. A destructive rule, or one that only makes sense as a reading of the raw markup a specific source produces, stays in import-time tooling instead and never runs here. Losing the standalone `--fix` preview these checks used to ship as separate CLIs is not a safety regression: nothing in this pipeline commits itself. Every run leaves its work sitting in the working tree, and `git diff` is the review surface — it shows the exact bytes that changed, which is strictly more information than a console count ever was.

The consequence for import scripts falls directly out of that. Because `validate.ts` enforces every normalization invariant this repo has, for every source a version's content came from — imported, hand-keyed, or edited by hand afterward — a per-source importer no longer needs to enforce any of those invariants itself; it only needs to produce content that a subsequent `npm run validate` can normalize and check like any other. That is why eleven one-off scripts under `imports/` (edition-specific fixers, a one-time OT morphology migration, a small-caps casing pass, and the rest) were retired outright rather than promoted into this pass: each encoded a rule that either already lived here or belonged one time, at import, and never again.

`utils/overhaulFootnotes.ts` and `utils/usfm/footnoteTypeRules.ts` are the one deliberate exception, staying out of the recurring pass on purpose. Footnote-type re-classification is more destructive than anything else this pipeline runs: its own safe default depends on preserving a prior human judgment it has no way to re-derive (a stored, non-`stu` type it refuses to overwrite without evidence), and its `--hard-reset` mode discards every stored type and rebuilds all of them from the classifier alone. A rule whose safe default depends on preserving a judgment it cannot recompute is not a candidate for a pass that runs on every commit; it belongs at import time and as an opt-in manual CLI, run deliberately rather than silently. A future reader should not "finish the job" by wiring this into `validate.ts`.

One import script's rule was investigated and rejected outright, not merely retired for being redundant. `imports/fixMarkedWhitespace.ts` split a marked leaf's own leading/trailing whitespace out into a bare sibling, unconditionally. Measured against the live corpus, 25,600 of its 25,702 real targets carry `marks: ["woc"]` — words of Christ — a mark neither export ever renders visibly, so promoting the rule would have meant real code and a corpus-wide rewrite for a change nobody would ever see. Check 9's own narrower, user-confirmed form of the same idea is what actually ships instead.

The `bibleLink` work follows the same shape. The hyphen guard converts a hyphen to an en dash only when it sits between two digits, so a hyphenated word inside a free-form display override survives untouched; every separator already in the corpus satisfies that condition, so the narrower guard changes nothing on real data today — it only closes a gap the old blanket replacement left open for the next hand-edited note. The truncated-range check and its reconstruction live in `crossChapterLinks.ts` rather than in `validate.ts` itself, because completing a range and splitting one that spans two chapters are the same family of judgment, built on the same per-version chapter-length index that module already owns; a truncated range whose own display spans two chapters is declined by the reconstruction step and left for the cross-chapter split immediately after it, rather than being reconstructed and then re-split. This is the one rule in the repo with no real corpus findings behind it — every target already carries its own dash — so it was proven by a unit-test fixture plus one live round trip instead: a real node hand-broken into the truncated shape, repaired by a single `validate` run, and reverted.

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
    // formatting (marks/script) with no text, or an empty "" husk, both flagged;
    // foot/strong/morph/lemma/bibleLink/paragraph/break left alone as meaningful on their own
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

### The three trailing audits run as peers, then gate together

_From [utils/validate.ts](../../../utils/validate.ts)_

```typescript
// All three loops run to completion regardless of one another's outcome.
// Unlike the hierarchical exits above, none of the three audits depends on
// either of the other two.
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

if (!crossChapterLinksPassed || !truncatedRangesPassed || !nodeConventionsPassed) {
  process.exit(1);
}
```
