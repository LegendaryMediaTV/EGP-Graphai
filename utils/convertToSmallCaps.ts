#!/usr/bin/env ts-node

/**
 * Utility script to convert "Lord GOD" and "LORD" patterns to small caps formatting.
 *
 * Usage:
 *   npx ts-node utils/convertToSmallCaps.ts <version> [book-id]
 *
 * Arguments:
 *   <version>: Required. Graphai version ID (e.g., WEBUS2020, KJV1769, ASV1901)
 *   [book-id]: Optional. Graphai book ID (e.g., GEN, EXO, PSA, JHN) for single-book conversion
 *
 * Examples:
 *   npx ts-node utils/convertToSmallCaps.ts WEBUS2020          # Convert entire WEBUS2020
 *   npx ts-node utils/convertToSmallCaps.ts WEBUS2020 2SM      # Convert only 2 Samuel
 *   npx ts-node utils/convertToSmallCaps.ts KJV1769 JHN        # Convert only John
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { convertContentToSmallCaps } from "../functions/convertToSmallCaps";
import { writeJsonFile } from "../functions/writeJsonFile";

// Type definition for verse structure
interface Verse {
  book: string;
  chapter: number;
  verse: number;
  content: any;
}

// Load book registry for display names
const bookRegistry: Array<{ _id: string; name: string }> = JSON.parse(
  fs.readFileSync("./bible-books/bible-books.json", "utf-8")
);

function getBookName(bookId: string): string {
  const book = bookRegistry.find((b) => b._id === bookId);
  return book ? book.name : bookId;
}

/**
 * Get all JSON book files for a version (excluding _version.json)
 */
function getBookFiles(versionDir: string, bookId?: string): string[] {
  const files = fs
    .readdirSync(versionDir)
    .filter(
      (f) => f.endsWith(".json") && f !== "_version.json" && f.match(/^\d{2}-/)
    )
    .sort();

  if (bookId) {
    // Filter by book ID (case-insensitive)
    const normalizedBookId = bookId.toUpperCase();
    const matchingFiles = files.filter((f) => {
      const fileBookId = f.replace(/^\d{2}-/, "").replace(".json", "");
      return fileBookId.toUpperCase() === normalizedBookId;
    });

    if (matchingFiles.length === 0) {
      // Show available book IDs for this version
      const availableBooks = files.map((f) =>
        f.replace(/^\d{2}-/, "").replace(".json", "")
      );
      console.error(`Error: Book "${bookId}" not found in this version.`);
      console.error(`Available books: ${availableBooks.join(", ")}`);
      process.exit(1);
    }

    return matchingFiles;
  }

  return files;
}

/**
 * Count LORD/GOD occurrences in content for statistics
 */
function countPatterns(content: any): { lord: number; lordGod: number } {
  const text = JSON.stringify(content);
  const lordMatches = text.match(/\bLORD\b/g) || [];
  const lordGodMatches = text.match(/\b(Lord|LORD)\s+GOD\b/g) || [];
  return {
    lord: lordMatches.length,
    lordGod: lordGodMatches.length,
  };
}

/**
 * Process a single book file
 */
async function processBook(
  filePath: string,
  dryRun: boolean = false
): Promise<{
  converted: number;
  skipped: number;
  lordCount: number;
  lordGodCount: number;
}> {
  const verses: Verse[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  let converted = 0;
  let skipped = 0;
  let lordCount = 0;
  let lordGodCount = 0;

  const processedVerses = verses.map((verse) => {
    // Count patterns before conversion
    const counts = countPatterns(verse.content);
    lordCount += counts.lord;
    lordGodCount += counts.lordGod;

    // Skip if no patterns to convert
    if (counts.lord === 0 && counts.lordGod === 0) {
      skipped++;
      return verse;
    }

    // Convert content
    const convertedContent = convertContentToSmallCaps(verse.content);

    // Check if anything changed
    const originalStr = JSON.stringify(verse.content);
    const convertedStr = JSON.stringify(convertedContent);

    if (originalStr !== convertedStr) {
      converted++;
      return { ...verse, content: convertedContent };
    }

    skipped++;
    return verse;
  });

  if (!dryRun && converted > 0) {
    await writeJsonFile(filePath, processedVerses);
  }

  return { converted, skipped, lordCount, lordGodCount };
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const versionId = args[0];
  const bookId = args[1];
  const dryRun = args.includes("--dry-run");

  // Validate arguments
  if (!versionId) {
    console.error(
      "Usage: npx ts-node utils/convertToSmallCaps.ts <version> [book-id] [--dry-run]"
    );
    console.error("");
    console.error("Arguments:");
    console.error(
      "  <version>: Graphai version ID (e.g., WEBUS2020, KJV1769, ASV1901)"
    );
    console.error(
      "  [book-id]: Optional. Graphai book ID (e.g., GEN, EXO, PSA, JHN) for single-book conversion"
    );
    console.error(
      "  [--dry-run]: Show what would be converted without making changes"
    );
    console.error("");
    console.error("Examples:");
    console.error("  npx ts-node utils/convertToSmallCaps.ts WEBUS2020");
    console.error(
      "  npx ts-node utils/convertToSmallCaps.ts WEBUS2020 2SM        # 2 Samuel only"
    );
    console.error(
      "  npx ts-node utils/convertToSmallCaps.ts KJV1769 JHN          # John only"
    );
    console.error(
      "  npx ts-node utils/convertToSmallCaps.ts KJV1769 --dry-run"
    );
    process.exit(1);
  }

  // Check version directory exists
  const versionDir = path.join("./bible-versions", versionId);
  if (!fs.existsSync(versionDir)) {
    console.error(`Error: Version directory not found: ${versionDir}`);
    console.error(`Available versions:`);
    const versions = fs
      .readdirSync("./bible-versions")
      .filter((d) =>
        fs.statSync(path.join("./bible-versions", d)).isDirectory()
      );
    versions.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }

  // Get book files to process
  const bookFiles = getBookFiles(versionDir, bookId);

  if (bookFiles.length === 0) {
    if (bookId) {
      console.error(
        `Error: No book file found for "${bookId}" in ${versionId}`
      );
    } else {
      console.error(`Error: No book files found in ${versionDir}`);
    }
    process.exit(1);
  }

  console.log(`\n📖 Converting LORD/Lord GOD to small caps in ${versionId}\n`);
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be modified\n");
  }

  let totalConverted = 0;
  let totalSkipped = 0;
  let totalLordCount = 0;
  let totalLordGodCount = 0;

  // Process each book
  for (const bookFile of bookFiles) {
    const filePath = path.join(versionDir, bookFile);
    const bookId = bookFile.replace(/^\d{2}-/, "").replace(".json", "");
    const bookName = getBookName(bookId);

    const { converted, skipped, lordCount, lordGodCount } = await processBook(
      filePath,
      dryRun
    );

    totalConverted += converted;
    totalSkipped += skipped;
    totalLordCount += lordCount;
    totalLordGodCount += lordGodCount;

    if (converted > 0 || lordCount > 0 || lordGodCount > 0) {
      console.log(
        `  ${bookName.padEnd(20)} - ${converted} verses converted, ${lordCount} LORD, ${lordGodCount} Lord GOD patterns found`
      );
    }
  }

  console.log(`\n✅ Conversion complete!`);
  console.log(`   Total verses converted: ${totalConverted}`);
  console.log(`   Total verses unchanged: ${totalSkipped}`);
  console.log(`   Total LORD patterns: ${totalLordCount}`);
  console.log(`   Total Lord GOD patterns: ${totalLordGodCount}`);

  // Run validation if not dry run
  if (!dryRun && totalConverted > 0) {
    console.log(`\n🔍 Running validation on ${versionId}...\n`);
    try {
      execSync(`npm run validate`, { stdio: "inherit" });
      console.log(`\n✅ Validation passed!`);
    } catch (error) {
      console.error(`\n❌ Validation failed! Please check the output above.`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
