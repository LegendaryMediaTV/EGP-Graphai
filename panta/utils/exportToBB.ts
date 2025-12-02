#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { convertGraphaiToBB } from "../functions/convertGraphaiToBB";
import { crosswalkVersionID } from "../functions/crosswalkVersionID";
import { crosswalkBookSequence } from "../functions/crosswalkBookSequence";

interface ExportOptions {
  version?: string;
  book?: string;
  outputDir?: string;
}

// Helper function to extract subtitle from content
function extractSubtitle(content: any): {
  subtitle?: { text: string; footnotes?: { type?: string; text: string }[] };
  cleanedContent: any[];
} {
  let subtitle:
    | { text: string; footnotes?: { type?: string; text: string }[] }
    | undefined;
  const cleanedContent: any[] = [];

  // Normalize content to array
  let contentArray: any[];
  if (Array.isArray(content)) {
    contentArray = content;
  } else if (typeof content === "object" && content !== null) {
    contentArray = [content];
  } else if (typeof content === "string") {
    contentArray = [{ text: content }];
  } else {
    contentArray = [];
  }

  for (const item of contentArray) {
    if (
      typeof item === "object" &&
      item !== null &&
      item.subtitle !== undefined
    ) {
      // Extract subtitle - handle both string and object formats
      let subtitleText = "";
      let subtitleFoot: any = null;

      if (typeof item.subtitle === "string") {
        subtitleText = item.subtitle;
      } else if (Array.isArray(item.subtitle)) {
        subtitleText = convertGraphaiToBB(item.subtitle).text || "";
      } else if (typeof item.subtitle === "object" && item.subtitle !== null) {
        // Subtitle is an object with text and possibly foot properties
        subtitleText = item.subtitle.text || "";
        subtitleFoot = item.subtitle.foot;
      }

      subtitle = { text: subtitleText };

      // Extract footnote from subtitle object (single foot)
      if (subtitleFoot) {
        const footResult = convertGraphaiToBB(subtitleFoot.content);
        subtitle.footnotes = [
          {
            type: subtitleFoot.type,
            text: footResult.text || "",
          },
        ];
      }

      // Extract footnotes if present at item level (array of feet)
      if (item.foot && Array.isArray(item.foot)) {
        const footArray = item.foot.map((foot: any) => {
          const footResult = convertGraphaiToBB(foot.content);
          return {
            type: foot.type,
            text: footResult.text || "",
          };
        });
        subtitle.footnotes = subtitle.footnotes
          ? [...subtitle.footnotes, ...footArray]
          : footArray;
      }
    } else {
      cleanedContent.push(item);
    }
  }

  return { subtitle, cleanedContent };
}

// Build reverse lookup from crosswalkBookSequence: abbreviation -> sequence
function getBookSequenceFromAbbrev(abbrev: string): string {
  // All possible sequences
  const sequences = [
    ...Array.from({ length: 39 }, (_, i) => (101 + i).toString()),
    ...Array.from({ length: 27 }, (_, i) => (201 + i).toString()),
  ];

  for (const seq of sequences) {
    const bookInfo = crosswalkBookSequence(seq);
    if (bookInfo._id === abbrev) {
      return seq;
    }
  }
  throw new Error(`Unknown book abbreviation: ${abbrev}`);
}

// Mapping from book abbreviation to full name
const bookAbbrevToName: Record<string, string> = {
  GEN: "genesis",
  EXO: "exodus",
  LEV: "leviticus",
  NUM: "numbers",
  DEU: "deuteronomy",
  JSH: "joshua",
  JDG: "judges",
  RTH: "ruth",
  "1SM": "1-samuel",
  "2SM": "2-samuel",
  "1KG": "1-kings",
  "2KG": "2-kings",
  "1CH": "1-chronicles",
  "2CH": "2-chronicles",
  EZR: "ezra",
  NEH: "nehemiah",
  EST: "esther",
  JOB: "job",
  PSA: "psalm",
  PRV: "proverbs",
  ECC: "ecclesiastes",
  SOS: "song-of-solomon",
  ISA: "isaiah",
  JER: "jeremiah",
  LAM: "lamentations",
  EZK: "ezekiel",
  DAN: "daniel",
  HOS: "hosea",
  JOL: "joel",
  AMS: "amos",
  OBD: "obadiah",
  JNA: "jonah",
  MIC: "micah",
  NAH: "nahum",
  HAB: "habakkuk",
  ZPH: "zephaniah",
  HAG: "haggai",
  ZEC: "zechariah",
  MAL: "malachi",
  MAT: "matthew",
  MRK: "mark",
  LUK: "luke",
  JHN: "john",
  ACT: "acts",
  ROM: "romans",
  "1CO": "1-corinthians",
  "2CO": "2-corinthians",
  GAL: "galatians",
  EPH: "ephesians",
  PHP: "philippians",
  COL: "colossians",
  "1TH": "1-thessalonians",
  "2TH": "2-thessalonians",
  "1TM": "1-timothy",
  "2TM": "2-timothy",
  TIT: "titus",
  PHM: "philemon",
  HEB: "hebrews",
  JAS: "james",
  "1PT": "1-peter",
  "2PT": "2-peter",
  "1JN": "1-john",
  "2JN": "2-john",
  "3JN": "3-john",
  JUD: "jude",
  REV: "revelation",
};

async function exportVersion(
  version: string,
  bookFilter?: string
): Promise<void> {
  console.log(`Exporting ${version}${bookFilter ? ` ${bookFilter}` : ""}...`);

  // Map version ID
  let versionId: string;
  try {
    versionId = crosswalkVersionID(version);
  } catch (error) {
    throw new Error(`Version '${version}' not found`);
  }

  // Find all book files for this version
  const bookDir = path.join(__dirname, "../../bible-versions", versionId);
  if (!fs.existsSync(bookDir)) {
    throw new Error(`Version '${version}' data not found`);
  }
  const bookFiles = fs.readdirSync(bookDir).filter((f) => f.endsWith(".json"));

  let selectedBooks: string[] = bookFiles;

  if (bookFilter) {
    // Validate book sequence
    if (!/^\d{3}$/.test(bookFilter)) {
      throw new Error(
        `Book sequence must be a 3-digit number (101-139 OT, 201-227 NT), got '${bookFilter}'`
      );
    }
    const bookSequence = bookFilter;

    // Get book metadata
    const bookMeta = crosswalkBookSequence(bookSequence);
    if (!bookMeta) {
      throw new Error(`Book metadata not found for sequence '${bookFilter}'`);
    }

    // Find the specific book file
    const bookFile = bookFiles.find((f) => f.includes(`-${bookMeta._id}.json`));
    if (!bookFile) {
      throw new Error(`Book '${bookFilter}' not found in version '${version}'`);
    }
    selectedBooks = [bookFile];
  }

  // Collect all verses
  const allVerses: any[] = [];

  for (const bookFile of selectedBooks) {
    const bookPath = path.join(bookDir, bookFile);
    const graphaiData = JSON.parse(fs.readFileSync(bookPath, "utf-8"));
    allVerses.push(...graphaiData);
  }

  // Sort verses by sequence
  allVerses.sort((a, b) => parseInt(a.sequence) - parseInt(b.sequence));

  // Group Graphai verses by book
  const bookGroups: Record<string, any[]> = {};
  for (const verse of allVerses) {
    const bookAbbrev = verse.book;
    if (!bookGroups[bookAbbrev]) bookGroups[bookAbbrev] = [];
    bookGroups[bookAbbrev].push(verse);
  }

  // Write book-based BB files and collect all BB verses
  const bbVersionDir = path.join(__dirname, "../../exports/bb", versionId);
  if (!fs.existsSync(bbVersionDir)) {
    fs.mkdirSync(bbVersionDir, { recursive: true });
  }

  const allBBVerses: any[] = [];

  for (const [bookAbbrev, bookVerses] of Object.entries(bookGroups)) {
    console.log(
      `Exporting book: ${bookAbbrevToName[bookAbbrev] || bookAbbrev}`
    );

    // Convert book verses to BB format
    const bbBookVerses = bookVerses.map((verse: any) => {
      // Extract subtitle from content
      const { subtitle, cleanedContent } = extractSubtitle(verse.content);

      const bbResult = convertGraphaiToBB(cleanedContent);

      // Calculate sequence: bookNum * 1000000 + chapter * 1000 + verse
      const bookSequence = getBookSequenceFromAbbrev(verse.book);
      const bookNum = parseInt(bookSequence);
      const sequence = bookNum * 1000000 + verse.chapter * 1000 + verse.verse;

      return {
        _id: `${version}-${sequence}`,
        version,
        chapter: `${bookAbbrevToName[verse.book]}-${verse.chapter}`,
        sequence: sequence.toString(),
        number: verse.verse,
        ...(subtitle && { subtitle }),
        text: bbResult.text,
        ...(bbResult.footnotes && { footnotes: bbResult.footnotes }),
        ...(bbResult.paragraphs && { paragraphs: bbResult.paragraphs }),
      };
    });

    // Write book file
    const bookOrder = getBookSequenceFromAbbrev(bookAbbrev);
    const bookInfo = crosswalkBookSequence(bookOrder);
    const bookOrderPadded = bookInfo.order.toString().padStart(2, "0");
    const bookFileName = `${bookOrderPadded}-${bookInfo._id}.json`;
    const bookFilePath = path.join(bbVersionDir, bookFileName);
    fs.writeFileSync(
      bookFilePath,
      JSON.stringify(bbBookVerses, null, 2) + "\n"
    );

    // Format with Prettier
    execSync(`prettier --write "${bookFilePath}"`);

    // Collect for full export
    allBBVerses.push(...bbBookVerses);
  }

  // Sort all BB verses by sequence
  allBBVerses.sort((a, b) => parseInt(a.sequence) - parseInt(b.sequence));

  // Prepare final bbData
  let bbData: any[];
  if (bookFilter) {
    // Single book: merge with existing file
    const outputPath = path.join(
      __dirname,
      "../../exports/bb",
      `BibleDB.bibleVerses-${version}.json`
    );
    let existingVerses: any[] = [];
    if (fs.existsSync(outputPath)) {
      existingVerses = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
    }
    // Remove existing verses for this book
    const bookSequencePrefix = bookFilter;
    existingVerses = existingVerses.filter(
      (v) => !v.sequence.startsWith(bookSequencePrefix)
    );
    // Add new verses
    bbData = [...existingVerses, ...allBBVerses];
    bbData.sort((a, b) => parseInt(a.sequence) - parseInt(b.sequence));
  } else {
    // Full version: replace
    bbData = allBBVerses;
  }

  // Validate the output
  const { default: validateBBExport } = await import("./validateBBExport");
  const tempFile = path.join(
    __dirname,
    "../../exports/bb",
    `BibleDB.bibleVerses-${version}.json.tmp`
  );
  fs.writeFileSync(tempFile, JSON.stringify(bbData, null, 2));
  const validation = validateBBExport(tempFile);
  fs.unlinkSync(tempFile);

  if (!validation.valid) {
    throw new Error(
      `Validation failed: ${validation.errors
        ?.map((e) => e.message)
        .join(", ")}`
    );
  }

  // Write to output
  const outputPath = path.join(
    __dirname,
    "../../exports/bb",
    `BibleDB.bibleVerses-${version}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(bbData, null, 2) + "\n");

  // Format with Prettier
  execSync(`prettier --write "${outputPath}"`);

  console.log(`Exported ${allBBVerses.length} verses to ${outputPath}`);
}

export async function exportToBB(options: ExportOptions): Promise<void> {
  const { version, book } = options;

  if (!version) {
    // Export all versions
    const versions = ["asv", "byz", "kjv", "vul", "webp", "ylt"];
    for (const v of versions) {
      try {
        await exportVersion(v);
      } catch (error) {
        console.error(
          `Failed to export ${v}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  } else {
    // Export specific version
    await exportVersion(version, book);
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const version = args[0];
  const book = args[1];

  if (args.length > 2) {
    console.error("Usage: ts-node exportToBB.ts [version] [book]");
    console.error(
      "  [version]: Optional BB version ID (asv, byz, kjv, vul, webp, ylt)"
    );
    console.error(
      "  [book]: Optional book sequence (101-139 OT, 201-227 NT) for single-book export"
    );
    console.error("  If no version specified, exports all versions");
    process.exit(1);
  }

  exportToBB({ version, book })
    .then(() => {
      console.log("Export completed successfully");
    })
    .catch((error) => {
      console.error("Error:", error.message);
      process.exit(1);
    });
}
