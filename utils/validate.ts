import _ from "lodash";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import * as prettier from "prettier";
import validateJsonAgainstSchema from "../functions/validateJsonAgainstSchema";
import { getVersionDirectories } from "../functions/getBibleVersions";
import BibleVersion from "../types/Version";

const jsonPath = "./bible-books/bible-books.json";
const schemaPath = "./bible-books/bible-books-schema.json";
const versionsSchemaPath = "./bible-versions/bible-versions-schema.json";
const bibleVersionsDir = "./bible-versions";

/**
 * Format a JSON file with Prettier and write it back if changed.
 * @param filePath - Path to the JSON file
 * @returns true if the file was reformatted, false if unchanged
 */
async function formatJsonFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const formatted = await prettier.format(content, { parser: "json" });

  if (content !== formatted) {
    fs.writeFileSync(filePath, formatted);
    return true;
  }
  return false;
}

/**
 * Collect all JSON files to be validated and formatted.
 */
function collectJsonFiles(): string[] {
  const files: string[] = [];

  // Root-level schema
  files.push("content-schema.json");

  // Bible books
  files.push(jsonPath);
  files.push(schemaPath);

  // Bible versions schemas
  files.push(versionsSchemaPath);
  files.push("./bible-versions/bible-verses-schema.json");

  // Version folders and their files
  const versionDirs = getVersionDirectories(bibleVersionsDir);
  for (const versionDir of versionDirs) {
    const versionPath = path.join(bibleVersionsDir, versionDir);
    const jsonFiles = fs
      .readdirSync(versionPath)
      .filter((file) => file.endsWith(".json"));

    for (const file of jsonFiles) {
      files.push(path.join(versionPath, file));
    }
  }

  return files;
}

/**
 * Main validation function (async to support prettier)
 */
async function main() {
  // First, format all JSON files with Prettier
  console.log("🎨 Formatting JSON files with Prettier...\n");

  const jsonFiles = collectJsonFiles();
  let formattedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file)) {
      const wasFormatted = await formatJsonFile(file);
      if (wasFormatted) {
        formattedCount++;
        console.log(`  📝 Formatted: ${file}`);
      }
    }
  }

  if (formattedCount > 0) {
    console.log(`\n✅ Formatted ${formattedCount} file(s)\n`);
  } else {
    console.log("✅ All JSON files already formatted\n");
  }

  // First, validate bible-books against the schema
  const result = validateJsonAgainstSchema(schemaPath, jsonPath);

  console.log("Schema validation result:", result);

  if (!result.valid) {
    console.error("\n❌ Bible books schema validation failed:");
    if (result.errors) {
      result.errors.forEach((error) => {
        console.error(`  - ${error.instancePath || "Root"}: ${error.message}`);
        if (error.params && error.params.additionalProperty) {
          console.error(
            `    Extra property: "${error.params.additionalProperty}"`
          );
        }
      });
    }
    process.exit(1);
  }

  // Load bible-books for later validation
  const books = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const validBookIds = new Set(books.map((book: any) => book._id));

  // Now validate each _version.json file against the schema
  console.log("\n🔍 Validating Bible version files...");

  const versionDirs = getVersionDirectories(bibleVersionsDir);
  const versions: BibleVersion[] = [];
  let versionsValidationPassed = true;

  for (const versionDir of versionDirs) {
    const versionFilePath = `${bibleVersionsDir}/${versionDir}/_version.json`;

    console.log(`\n📖 Validating version: ${versionDir}`);

    // Validate _version.json against schema
    const versionResult = validateJsonAgainstSchema(
      versionsSchemaPath,
      versionFilePath
    );

    if (!versionResult.valid) {
      console.error(`❌ Schema validation failed for ${versionFilePath}:`);
      if (versionResult.errors) {
        versionResult.errors.forEach((error) => {
          console.error(
            `  - ${error.instancePath || "Root"}: ${error.message}`
          );
          if (error.params && error.params.additionalProperty) {
            console.error(
              `    Extra property: "${error.params.additionalProperty}"`
            );
          }
        });
      }
      versionsValidationPassed = false;
      continue;
    }

    // Load and store the version for further validation
    const versionContent = fs.readFileSync(versionFilePath, "utf-8");
    const version = JSON.parse(versionContent) as BibleVersion;
    versions.push(version);

    // Verify _id matches folder name
    if (version._id !== versionDir) {
      console.error(
        `❌ Version _id "${version._id}" does not match folder name "${versionDir}"`
      );
      versionsValidationPassed = false;
    }

    console.log(`✅ ${versionDir}/_version.json validated`);
  }

  if (!versionsValidationPassed) {
    console.error("\n❌ Version schema validation failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All version files validated against schema!");
  }

  // Additional validation: Check books array integrity for each version
  console.log("\n🔍 Validating book ordering...");
  let booksValidationPassed = true;

  for (const version of versions) {
    const versionBooks = version.books || [];
    if (versionBooks.length === 0) {
      console.log(`✅ ${version._id}: no books specified`);
      continue;
    }

    // Collect order values
    const orderValues = versionBooks.map((item) => item.order);
    const sortedOrders = _.sortBy(orderValues);

    // Check for duplicates
    const duplicates = _.filter(
      _.groupBy(versionBooks, "order"),
      (group) => group.length > 1
    );

    if (duplicates.length > 0) {
      console.error(`\n❌ ${version._id} has duplicate order numbers:`);
      duplicates.forEach((group) => {
        const bookIds = group.map((item) => item._id).join(", ");
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

  // Now, validate bible-versions verse files
  console.log("\n🔍 Validating Bible verse files...");

  const verseSchemaPath = "./bible-versions/bible-verses-schema.json";

  let verseValidationPassed = true;

  // Create version map for book list validation
  const versionMap = new Map(versions.map((v) => [v._id, v]));

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

  for (const versionDir of versionDirs) {
    const versionPath = `${bibleVersionsDir}/${versionDir}`;
    const verseFiles = fs
      .readdirSync(versionPath)
      .filter((file) => file.endsWith(".json") && file !== "_version.json");

    console.log(`\n📖 Checking version: ${versionDir}`);

    // Get expected book IDs from version's books array
    const versionObj = versionMap.get(versionDir);
    const expectedFiles = new Set(
      (versionObj?.books || []).map(
        (b) => `${b.order.toString().padStart(2, "0")}-${b._id}.json`
      )
    );
    const actualFiles = new Set(verseFiles);

    // Check for missing files
    for (const expectedFile of expectedFiles) {
      if (!actualFiles.has(expectedFile)) {
        const bookId = expectedFile.split("-")[1].replace(".json", "");
        console.error(
          `❌ Missing file for book ${bookId} in version ${versionDir}`
        );
        verseValidationPassed = false;
      }
    }

    // Check for extra files
    for (const actualFile of actualFiles) {
      if (!expectedFiles.has(actualFile)) {
        console.error(
          `❌ Extra file ${actualFile} in version ${versionDir} (not in books array)`
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
}

// Run the main function
main().catch((error) => {
  console.error("Validation failed with error:", error);
  process.exit(1);
});
