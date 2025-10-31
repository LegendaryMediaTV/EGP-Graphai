import _ from "lodash";
import * as fs from "fs";
import Ajv from "ajv";
import validateJsonAgainstSchema from "../functions/validateJsonAgainstSchema";

const jsonPath = "./bible-books/bible-books.json";
const schemaPath = "./bible-books/bible-books-schema.json";
const versionsJsonPath = "./bible-versions/bible-versions.json";
const versionsSchemaPath = "./bible-versions/bible-versions-schema.json";

// First, validate against the schema
const result = validateJsonAgainstSchema(schemaPath, jsonPath);

console.log("Schema validation result:", result);

if (result.valid) {
  // Additional validation: Check books array integrity for each version
  const versionsContent = fs.readFileSync(versionsJsonPath, "utf-8");
  const versions = JSON.parse(versionsContent);

  let booksValidationPassed = true;

  for (const version of versions) {
    const books = version.books || [];
    if (books.length === 0) {
      console.log(`✅ ${version._id}: no books specified`);
      continue;
    }

    // Collect order values
    const orderValues = books.map((item: any) => item.order);
    const sortedOrders = _.sortBy(orderValues);

    // Check for duplicates
    const duplicates = _.filter(
      _.groupBy(books, "order"),
      (group) => group.length > 1
    );

    if (duplicates.length > 0) {
      console.error(`\n❌ ${version._id} has duplicate order numbers:`);
      duplicates.forEach((group) => {
        const bookIds = group.map((item: any) => item._id).join(", ");
        console.error(`  Order ${group[0].order}: ${bookIds}`);
      });
      booksValidationPassed = false;
    }

    // Check if starts at 1
    if (sortedOrders[0] !== 1) {
      console.error(
        `\n❌ ${version._id} does not start at 1 (starts at ${sortedOrders[0]})`
      );
      booksValidationPassed = false;
    }

    // Check for gaps in sequence
    const expectedCount = sortedOrders[sortedOrders.length - 1];
    if (sortedOrders.length !== expectedCount) {
      const allExpected = _.range(1, expectedCount + 1);
      const missing = _.difference(allExpected, sortedOrders);
      if (missing.length > 0) {
        console.error(
          `\n❌ ${version._id} has gaps in numbering. Missing: ${missing.join(
            ", "
          )}`
        );
        booksValidationPassed = false;
      }
    }

    // Success message
    if (
      sortedOrders[0] === 1 &&
      sortedOrders.length === expectedCount &&
      duplicates.length === 0
    ) {
      console.log(
        `✅ ${version._id}: ${sortedOrders.length} books, numbered 1–${expectedCount}`
      );
    }
  }

  if (!booksValidationPassed) {
    console.error("\n❌ Books validation failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All order validations passed!");
  }
} else {
  process.exit(1);
}

// Now, validate bible-versions
const versionsResult = validateJsonAgainstSchema(
  versionsSchemaPath,
  versionsJsonPath
);

console.log("\nBible versions schema validation result:", versionsResult);

if (!versionsResult.valid) {
  process.exit(1);
} else {
  console.log("\n✅ Bible versions validation passed!");
}

// Now, validate bible-versions verse files
console.log("\n🔍 Validating Bible verse files...");

const bibleVersionsDir = "./bible-versions";
const verseSchemaPath = "./bible-versions/bible-verses-schema.json";

// Get all version directories
const versionDirs = fs.readdirSync(bibleVersionsDir).filter((item) => {
  const itemPath = `${bibleVersionsDir}/${item}`;
  return fs.statSync(itemPath).isDirectory();
});

let verseValidationPassed = true;

// Load books for validation
const books = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
const validBookIds = new Set(books.map((book: any) => book._id));

// Load versions for book list validation
const versions = JSON.parse(fs.readFileSync(versionsJsonPath, "utf-8"));
const versionMap = new Map(versions.map((v: any) => [v._id, v]));

// Load and compile the verse schema once
const verseSchemaContent = fs.readFileSync(verseSchemaPath, "utf-8");
const verseSchema = JSON.parse(verseSchemaContent);
const bookSchemaContent = fs.readFileSync(schemaPath, "utf-8");
const bookSchema = JSON.parse(bookSchemaContent);
const contentSchemaContent = fs.readFileSync("content-schema.json", "utf-8");
const contentSchema = JSON.parse(contentSchemaContent);
const ajv = new Ajv();
ajv.addSchema(contentSchema);
ajv.addSchema(bookSchema);
const validateVerse = ajv.compile(verseSchema);

for (const version of versionDirs) {
  const versionPath = `${bibleVersionsDir}/${version}`;
  const verseFiles = fs
    .readdirSync(versionPath)
    .filter((file) => file.endsWith(".json"));

  console.log(`\n📖 Checking version: ${version}`);

  // Get expected book IDs from version's books array
  const versionObj = versionMap.get(version) as any;
  const expectedBookIds = new Set(
    (versionObj?.books || []).map((b: any) => b._id as string)
  );
  const expectedFiles = new Set(
    (versionObj?.books || []).map(
      (b: any) => `${b.order.toString().padStart(2, "0")}-${b._id}.json`
    )
  );
  const actualFiles = new Set(verseFiles);

  // Check for missing files
  for (const expectedFile of expectedFiles as Set<string>) {
    if (!actualFiles.has(expectedFile)) {
      const bookId = expectedFile.split("-")[1].replace(".json", "");
      console.error(`❌ Missing file for book ${bookId} in version ${version}`);
      verseValidationPassed = false;
    }
  }

  // Check for extra files
  for (const actualFile of actualFiles as Set<string>) {
    if (!expectedFiles.has(actualFile)) {
      const bookId = actualFile.split("-")[1].replace(".json", "");
      console.error(
        `❌ Extra file ${actualFile} in version ${version} (not in books array)`
      );
      verseValidationPassed = false;
    }
  }

  for (const file of verseFiles) {
    const filePath = `${versionPath}/${file}`;
    const bookIdFromFilename = file.split("-")[1].replace(".json", "");

    // Check if filename matches a valid book ID
    if (!validBookIds.has(bookIdFromFilename)) {
      console.error(
        `❌ Invalid filename: ${file} (book ID "${bookIdFromFilename}" not found in bible-books.json)`
      );
      verseValidationPassed = false;
      continue;
    }

    // Check that all verses have the correct book field
    const verses = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Validate each verse individually against the schema
    for (const verse of verses) {
      const valid = validateVerse(verse);
      if (!valid) {
        console.error(
          `❌ Schema validation failed for verse ${verse.chapter}:${verse.verse} in ${filePath}:`,
          validateVerse.errors
        );
        verseValidationPassed = false;
      }

      if (verse.book !== bookIdFromFilename) {
        console.error(
          `❌ Book field mismatch in ${filePath}: verse ${verse.chapter}:${verse.verse} has book="${verse.book}" but filename indicates "${bookIdFromFilename}"`
        );
        verseValidationPassed = false;
      }
    }

    console.log(`✅ ${file}: ${verses.length} verses validated`);
  }
}

if (!verseValidationPassed) {
  console.error("\n❌ Verse file validation failed!");
  process.exit(1);
} else {
  console.log("\n✅ All verse file validations passed!");
}
