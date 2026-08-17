# Validation Domain

## Overview

The Validation domain ensures data integrity across all Bible JSON files. It validates schemas, book ordering, file naming, verse structure, and cross-references between entities. Validation also auto-normalizes key ordering in verse files. Runs as a pre-commit check and CI gate.

## Core Entities

### Validation Targets

| Target                | Schema                       | Description      |
| --------------------- | ---------------------------- | ---------------- |
| `bible-books.json`    | `bible-books-schema.json`    | Book registry    |
| `bible-versions.json` | `bible-versions-schema.json` | Version registry |
| `{version}/*.json`    | `bible-verses-schema.json`   | Verse files      |

### Validation Checks

1. **Key Sorting** – Auto-sorts verse and content keys to canonical order
2. **Schema Validation** – JSON conforms to JSON Schema Draft-07
3. **Book Order Integrity** – Orders start at 1, sequential, no gaps or duplicates
4. **File Existence** – Expected verse files exist for each book in version
5. **File Naming** – Files match `{order}-{bookId}.json` pattern
6. **Book Field Match** – Verse `book` field matches filename book ID
7. **Reference Integrity** – Book IDs in versions exist in books registry
8. **Meaningless Content Nodes** – Flags a node that renders nothing: `marks`/`script` with no `text` to apply them to (a non-greedy bold/italic delimiter pairing can't match zero characters and leaks into surrounding text), or an empty `{text: ""}` husk left over from stripped marks. `foot`, `strong`, `morph`, `lemma`, `bibleLink`, and bare `paragraph`/`break` flags are left alone — each is meaningful on its own even without `text`
9. **Strong's Trailing Whitespace** – Flags a `strong`-carrying node whose own `text` ends in whitespace, violating the convention that a joining space belongs on the *following* node's leading edge, not the tagged node's trailing edge

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
- **Both New Checks Are Exported, Standalone Functions** – `findMeaninglessContentNodes()` and `findStrongTrailingWhitespaceNodes()` each take a verse's `content` tree directly and return path-labeled problem strings (e.g. `content[0].foot.content[1]`), independent of the CLI — usable from tests or other tooling without running the full validation pass
- **Import-Safe Entry Point** – `main()` only runs when this module is the process entry point (`require.main === module`), so tests can import `validate.ts` for its exported functions without triggering a full validation run as a side effect

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

`writeJsonFile()` formats the JSON in-process and writes it through a stage-then-rename helper rather than `fs.writeFileSync` — see [Writing files](../../documentation/EGP-Graphai/data-pipeline.md#writing-files) for why, and the [TypeScript utilities style guide](../5-style-guides/typescript-utilities.md) for the pattern used across all four writer scripts.

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

The walk descends through every content-bearing branch — `foot.content`, subtitles, and headings — not just the top level; guarding only the top-level path is exactly how the two shapes this check targets survived an earlier cleanup pass undetected.

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
