#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { crosswalkVersionID } from "../functions/crosswalkVersionID";
import { crosswalkBookSequence } from "../functions/crosswalkBookSequence";
import { convertBBVerseMetadata } from "../functions/convertBBVerseMetadata";
import { convertBBToGraphai } from "../functions/convertBBToGraphai";

// Load book registry for progress messages
const bookRegistry: Array<{ _id: string; name: string }> = JSON.parse(
  fs.readFileSync("./bible-books/bible-books.json", "utf-8")
);

// Load version registry for book order lookup
const versionRegistry: Array<{
  _id: string;
  books: Array<{ _id: string; order: number }>;
}> = JSON.parse(
  fs.readFileSync("./bible-versions/bible-versions.json", "utf-8")
);

function getBookName(bookId: string): string {
  const book = bookRegistry.find((b) => b._id === bookId);
  return book ? book.name : bookId;
}

function main() {
  try {
    // Parse command-line arguments
    const bbVersionId = process.argv[2];
    const bbBookSequence = process.argv[3];

    // Validate required version argument
    if (!bbVersionId) {
      console.error("Usage: ts-node importFromBB.ts <version> [book-sequence]");
      console.error(
        "  <version>: BB version ID (asv, byz, kjv, vul, webp, ylt)"
      );
      console.error(
        "  [book-sequence]: Optional BB book sequence (101-139 OT, 201-227 NT) for single-book migration"
      );
      console.error("Examples:");
      console.error(
        "  ts-node importFromBB.ts kjv          # Migrate entire KJV version"
      );
      console.error(
        "  ts-node importFromBB.ts kjv 204      # Migrate only John from KJV"
      );
      process.exit(1);
    }

    // Convert BB version ID to Graphai version ID
    const graphaiVersionId = crosswalkVersionID(bbVersionId);

    // Load BB export file
    const bbFilePath = `./exports/bb/BibleDB.bibleVerses-${bbVersionId}.json`;
    if (!fs.existsSync(bbFilePath)) {
      throw new Error(`BB export file not found: ${bbFilePath}`);
    }

    const bbVerses: Array<{
      chapter: string;
      sequence: string;
      number: number;
      text: string;
      paragraphs?: number[];
      footnotes?: { type?: string; text: string }[];
    }> = JSON.parse(fs.readFileSync(bbFilePath, "utf-8"));

    console.log(`Loaded ${bbVerses.length} verses from ${bbFilePath}`);

    // Split into individual book files
    const versionDir = path.join(
      __dirname,
      "../../exports/bb",
      graphaiVersionId
    );
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const books: Record<string, any[]> = {};
    for (const verse of bbVerses) {
      const bookSeq = verse.sequence.substring(0, 3);
      if (!books[bookSeq]) books[bookSeq] = [];
      books[bookSeq].push(verse);
    }

    for (const [bookSeq, verses] of Object.entries(books)) {
      const bookData = crosswalkBookSequence(bookSeq);
      const bookOrder = bookData.order.toString().padStart(2, "0");
      const bookID = bookData._id;
      const bookFileName = `${bookOrder}-${bookID}.json`;
      const bookFilePath = path.join(versionDir, bookFileName);
      fs.writeFileSync(bookFilePath, JSON.stringify(verses, null, 2) + "\n");

      // Format with Prettier
      execSync(`prettier --write "${bookFilePath}"`);
    }

    console.log(`Split into ${Object.keys(books).length} book files`);

    // Determine migration mode
    if (bbBookSequence) {
      // Single-book migration
      migrateSingleBookFromFile(bbBookSequence, graphaiVersionId);
    } else {
      // Full-version migration
      migrateFullVersionFromFiles(graphaiVersionId);
    }

    // Run validation
    console.log("Running validation...");
    execSync("npm run validate", { stdio: "inherit" });

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error(
      "Migration failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

function migrateSingleBookFromFile(
  bbBookSequence: string,
  graphaiVersionId: string
) {
  // Validate book sequence
  const bookInfo = crosswalkBookSequence(bbBookSequence);

  // Load the book file
  const versionDir = path.join(__dirname, "../../exports/bb", graphaiVersionId);
  const bookOrder = bookInfo.order.toString().padStart(2, "0");
  const bookID = bookInfo._id;
  const bookFileName = `${bookOrder}-${bookID}.json`;
  const bookFilePath = path.join(versionDir, bookFileName);

  if (!fs.existsSync(bookFilePath)) {
    throw new Error(`Book file not found: ${bookFilePath}`);
  }

  const bookVerses: any[] = JSON.parse(fs.readFileSync(bookFilePath, "utf-8"));

  console.log(
    `Migrating ${bookVerses.length} verses for ${bookInfo._id} (${getBookName(
      bookInfo._id
    )})`
  );

  // Group verses by chapter
  const chapters = new Map<number, Array<any>>();
  for (const verse of bookVerses) {
    const { chapter } = convertBBVerseMetadata(verse);
    if (!chapters.has(chapter)) {
      chapters.set(chapter, []);
    }
    chapters.get(chapter)!.push(verse);
  }

  // Process each chapter
  const graphaiVerses: Array<{
    book: string;
    chapter: number;
    verse: number;
    content: any[];
  }> = [];

  for (const [chapterNum, chapterVerses] of Array.from(chapters.entries())) {
    // Sort verses by verse number
    chapterVerses.sort((a, b) => a.number - b.number);

    for (const verse of chapterVerses) {
      const metadata = convertBBVerseMetadata(verse);

      // Fix for Psalms missing paragraph markers on first verse of each chapter
      let paragraphs = verse.paragraphs;
      if (metadata.verse === 1 && (!paragraphs || paragraphs.length === 0)) {
        paragraphs = [0];
      }

      // Validate paragraph markers are at spaces for non-zero positions
      if (paragraphs) {
        for (const pos of paragraphs) {
          if (pos > 0 && pos < verse.text.length && verse.text[pos] !== " ") {
            throw new Error(
              `Invalid paragraph marker at position ${pos} in ${verse.sequence}: expected space at marker position, found '${verse.text[pos]}'`
            );
          }
        }
      }

      const content = convertBBToGraphai({
        text: verse.text,
        paragraphs: paragraphs,
        footnotes: verse.footnotes,
        heading: verse.heading,
        headingFootnote: verse.headingFootnote,
      });

      // If content has only one element, unwrap it from the array
      const contentValue = content.length === 1 ? content[0] : content;

      graphaiVerses.push({
        book: metadata.book,
        chapter: metadata.chapter,
        verse: metadata.verse,
        content: contentValue,
      });
    }
  }

  // Sort all verses by chapter, then verse
  graphaiVerses.sort((a, b) => {
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  // Create output directory
  const outputDir = `./bible-versions/${graphaiVersionId}`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write the book file
  const outputFile = path.join(outputDir, bookFileName);
  fs.writeFileSync(outputFile, JSON.stringify(graphaiVerses, null, 2) + "\n");

  // Format with Prettier
  execSync(`prettier --write "${outputFile}"`);

  console.log(`Wrote ${graphaiVerses.length} verses to ${outputFile}`);
}

function migrateFullVersionFromFiles(graphaiVersionId: string) {
  const versionDir = path.join(__dirname, "../../exports/bb", graphaiVersionId);
  if (!fs.existsSync(versionDir)) {
    throw new Error(`Version directory not found: ${versionDir}`);
  }

  const bookFiles = fs
    .readdirSync(versionDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  console.log(`Migrating ${bookFiles.length} books...`);

  let totalBooks = 0;
  let totalChapters = 0;
  let totalVerses = 0;

  // Create output directory
  const outputDir = `./bible-versions/${graphaiVersionId}`;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Process each book file
  for (const bookFile of bookFiles) {
    const bookFilePath = path.join(versionDir, bookFile);
    const bookVerses: any[] = JSON.parse(
      fs.readFileSync(bookFilePath, "utf-8")
    );

    // Extract book ID from filename
    const match = bookFile.match(/^(\d{2})-(\w+)\.json$/);
    if (!match) continue;
    const bookID = match[2];

    console.log(`Processing ${getBookName(bookID)}...`);

    // Group verses by chapter
    const chapters = new Map<number, Array<any>>();
    for (const verse of bookVerses) {
      const { chapter } = convertBBVerseMetadata(verse);
      if (!chapters.has(chapter)) {
        chapters.set(chapter, []);
      }
      chapters.get(chapter)!.push(verse);
    }

    // Process each chapter
    const graphaiVerses: Array<{
      book: string;
      chapter: number;
      verse: number;
      content: any[];
    }> = [];

    for (const [chapterNum, chapterVerses] of Array.from(chapters.entries())) {
      // Sort verses by verse number
      chapterVerses.sort((a, b) => a.number - b.number);

      for (const verse of chapterVerses) {
        const metadata = convertBBVerseMetadata(verse);

        // Fix for Psalms missing paragraph markers on first verse of each chapter
        let paragraphs = verse.paragraphs;
        if (metadata.verse === 1 && (!paragraphs || paragraphs.length === 0)) {
          paragraphs = [0];
        }

        // Validate paragraph markers are at spaces for non-zero positions
        if (paragraphs) {
          for (const pos of paragraphs) {
            if (pos > 0 && pos < verse.text.length && verse.text[pos] !== " ") {
              throw new Error(
                `Invalid paragraph marker at position ${pos} in ${verse.sequence}: expected space at marker position, found '${verse.text[pos]}'`
              );
            }
          }
        }

        const content = convertBBToGraphai({
          text: verse.text,
          paragraphs: paragraphs,
          footnotes: verse.footnotes,
          heading: verse.heading,
          headingFootnote: verse.headingFootnote,
        });

        // If content has only one element, unwrap it from the array
        const contentValue = content.length === 1 ? content[0] : content;

        graphaiVerses.push({
          book: metadata.book,
          chapter: metadata.chapter,
          verse: metadata.verse,
          content: contentValue,
        });
      }
    }

    // Sort all verses by chapter, then verse
    graphaiVerses.sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    // Write book file
    const outputPath = path.join(outputDir, bookFile);
    fs.writeFileSync(outputPath, JSON.stringify(graphaiVerses, null, 2) + "\n");

    // Format with Prettier
    execSync(`prettier --write "${outputPath}"`);

    totalBooks++;
    totalChapters += chapters.size;
    totalVerses += graphaiVerses.length;
  }

  console.log(
    `Migration complete: ${totalBooks} books, ${totalChapters} chapters, ${totalVerses} verses`
  );
}

// Run the script
if (require.main === module) {
  main();
}
