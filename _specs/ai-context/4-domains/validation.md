# Validation Domain

## Overview

The Validation domain ensures data integrity across all Bible JSON files. It validates schemas, book ordering, file naming, verse structure, and cross-references between entities. Validation runs as a pre-commit check and CI gate.

## Core Entities

### Validation Targets

| Target                | Schema                       | Description      |
| --------------------- | ---------------------------- | ---------------- |
| `bible-books.json`    | `bible-books-schema.json`    | Book registry    |
| `bible-versions.json` | `bible-versions-schema.json` | Version registry |
| `{version}/*.json`    | `bible-verses-schema.json`   | Verse files      |

### Validation Checks

1. **Schema Validation** – JSON conforms to JSON Schema Draft-07
2. **Book Order Integrity** – Orders start at 1, sequential, no gaps or duplicates
3. **File Existence** – Expected verse files exist for each book in version
4. **File Naming** – Files match `{order}-{bookId}.json` pattern
5. **Book Field Match** – Verse `book` field matches filename book ID
6. **Reference Integrity** – Book IDs in versions exist in books registry

## User Workflows

- **Run Validation** – Execute `npm run validate` before committing changes
- **CI Validation** – Validation runs automatically in CI pipeline
- **Error Investigation** – Validation outputs specific error locations and messages

## Key Business Rules

- **Exit on Failure** – Script exits with code 1 on any validation failure
- **Cascading Schemas** – Content schema referenced by verse schema, which is used by version validation
- **AJV Schema Registration** – All referenced schemas must be registered with AJV before validation
- **Comprehensive Output** – Each check logs success (✅) or failure (❌) with details

## Representative Code Examples

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
    return { valid, errors: valid ? undefined : validate.errors ?? [] };
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
