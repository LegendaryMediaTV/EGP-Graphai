#!/usr/bin/env ts-node

/**
 * Utility script to sort content keys in Bible version files according to canonical order.
 *
 * Usage:
 *   npx ts-node utils/sortBibleKeys.ts <version> [book-id] [--dry-run]
 *
 * Examples:
 *   npx ts-node utils/sortBibleKeys.ts NASB1995           # Sort entire version
 *   npx ts-node utils/sortBibleKeys.ts NASB1995 PSA       # Sort only Psalms
 *   npx ts-node utils/sortBibleKeys.ts NASB1995 --dry-run # Preview changes
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { sortVerseKeys } from "../functions/sortContentKeys";
import { writeJsonFile } from "../functions/writeJsonFile";

// Type definition for verse structure
interface Verse {
  book: string;
  chapter: number;
  verse: number;
  content: unknown;
  [key: string]: unknown;
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
    const normalizedBookId = bookId.toUpperCase();
    const matchingFiles = files.filter((f) => {
      const fileBookId = f.replace(/^\d{2}-/, "").replace(".json", "");
      return fileBookId.toUpperCase() === normalizedBookId;
    });

    if (matchingFiles.length === 0) {
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
 * Process a single book file
 */
async function processBook(
  filePath: string,
  dryRun: boolean = false
): Promise<{ changed: boolean; verseCount: number }> {
  const originalContent = fs.readFileSync(filePath, "utf-8");
  const verses: Verse[] = JSON.parse(originalContent);

  // Sort keys in each verse
  const sortedVerses = verses.map((verse) => sortVerseKeys(verse));

  // Compare parsed structures to avoid formatting differences
  // Serialize both with same method for accurate comparison
  const originalSerialized = JSON.stringify(verses);
  const sortedSerialized = JSON.stringify(sortedVerses);
  const changed = originalSerialized !== sortedSerialized;

  if (!dryRun && changed) {
    await writeJsonFile(filePath, sortedVerses);
  }

  return { changed, verseCount: verses.length };
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  const versionId = args[0];
  const bookId = args.find((a) => a !== "--dry-run" && a !== versionId);
  const dryRun = args.includes("--dry-run");

  if (!versionId) {
    console.error(
      "Usage: npx ts-node utils/sortBibleKeys.ts <version> [book-id] [--dry-run]"
    );
    console.error("");
    console.error("Examples:");
    console.error("  npx ts-node utils/sortBibleKeys.ts NASB1995");
    console.error(
      "  npx ts-node utils/sortBibleKeys.ts NASB1995 PSA       # Psalms only"
    );
    console.error("  npx ts-node utils/sortBibleKeys.ts NASB1995 --dry-run");
    process.exit(1);
  }

  const versionDir = path.join("./bible-versions", versionId);
  if (!fs.existsSync(versionDir)) {
    console.error(`Error: Version directory not found: ${versionDir}`);
    const versions = fs
      .readdirSync("./bible-versions")
      .filter((d) =>
        fs.statSync(path.join("./bible-versions", d)).isDirectory()
      );
    console.error(`Available versions: ${versions.join(", ")}`);
    process.exit(1);
  }

  const bookFiles = getBookFiles(versionDir, bookId);

  if (bookFiles.length === 0) {
    console.error(`Error: No book files found in ${versionDir}`);
    process.exit(1);
  }

  console.log(`\n🔧 Sorting content keys in ${versionId}\n`);
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be modified\n");
  }

  let totalChanged = 0;
  let totalUnchanged = 0;

  for (const bookFile of bookFiles) {
    const filePath = path.join(versionDir, bookFile);
    const fileBookId = bookFile.replace(/^\d{2}-/, "").replace(".json", "");
    const bookName = getBookName(fileBookId);

    const { changed, verseCount } = await processBook(filePath, dryRun);

    if (changed) {
      totalChanged++;
      console.log(
        `  ${bookName.padEnd(20)} - ${verseCount} verses (reordered)`
      );
    } else {
      totalUnchanged++;
    }
  }

  console.log(`\n✅ Sorting complete!`);
  console.log(`   Files with changes: ${totalChanged}`);
  console.log(`   Files unchanged: ${totalUnchanged}`);

  if (!dryRun && totalChanged > 0) {
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
