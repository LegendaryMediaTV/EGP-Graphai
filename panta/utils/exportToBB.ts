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
      // Extract subtitle
      const subtitleText =
        typeof item.subtitle === "string"
          ? item.subtitle
          : Array.isArray(item.subtitle)
          ? convertGraphaiToBB(item.subtitle).text
          : "";

      subtitle = { text: subtitleText };

      // Extract footnotes if present
      if (item.foot && Array.isArray(item.foot)) {
        subtitle.footnotes = item.foot.map((foot: any) => {
          const footResult = convertGraphaiToBB(foot.content);
          return {
            type: foot.type,
            text: footResult.text || "",
          };
        });
      }
    } else {
      cleanedContent.push(item);
    }
  }

  return { subtitle, cleanedContent };
}
const bookNameToSequence: Record<string, string> = {
  genesis: "101",
  exodus: "102",
  leviticus: "103",
  numbers: "104",
  deuteronomy: "105",
  joshua: "106",
  judges: "107",
  ruth: "108",
  "1-samuel": "109",
  "2-samuel": "110",
  "1-kings": "111",
  "2-kings": "112",
  "1-chronicles": "113",
  "2-chronicles": "114",
  ezra: "115",
  nehemiah: "116",
  esther: "117",
  job: "118",
  psalms: "119",
  proverbs: "120",
  ecclesiastes: "121",
  song: "122",
  isaiah: "123",
  jeremiah: "124",
  lamentations: "125",
  ezekiel: "126",
  daniel: "127",
  hosea: "128",
  joel: "129",
  amos: "130",
  obadiah: "131",
  jonah: "132",
  micah: "133",
  nahum: "134",
  habakkuk: "135",
  zephaniah: "136",
  haggai: "137",
  zechariah: "138",
  malachi: "139",
  matthew: "201",
  mark: "202",
  luke: "203",
  john: "204",
  acts: "205",
  romans: "206",
  "1-corinthians": "207",
  "2-corinthians": "208",
  galatians: "209",
  ephesians: "210",
  philippians: "211",
  colossians: "212",
  "1-thessalonians": "213",
  "2-thessalonians": "214",
  "1-timothy": "215",
  "2-timothy": "216",
  titus: "217",
  philemon: "218",
  hebrews: "219",
  james: "220",
  "1-peter": "221",
  "2-peter": "222",
  "1-john": "223",
  "2-john": "224",
  "3-john": "225",
  jude: "226",
  revelation: "227",
};

// Mapping from book abbreviation to sequence
const bookAbbrevToSequence: Record<string, string> = {
  GEN: "101",
  EXO: "102",
  LEV: "103",
  NUM: "104",
  DEU: "105",
  JSH: "106",
  JDG: "107",
  RTH: "108",
  "1SM": "109",
  "2SM": "110",
  "1KG": "111",
  "2KG": "112",
  "1CH": "113",
  "2CH": "114",
  EZR: "115",
  NEH: "116",
  EST: "117",
  JOB: "118",
  PSA: "119",
  PRV: "120",
  ECC: "121",
  SOS: "122",
  ISA: "123",
  JER: "124",
  LAM: "125",
  EZK: "126",
  DAN: "127",
  HOS: "128",
  JOL: "129",
  AMS: "130",
  OBD: "131",
  JNA: "132",
  MIC: "133",
  NAH: "134",
  HAB: "135",
  ZPH: "136",
  HAG: "137",
  ZEC: "138",
  MAL: "139",
  MAT: "201",
  MRK: "202",
  LUK: "203",
  JHN: "204",
  ACT: "205",
  ROM: "206",
  "1CO": "207",
  "2CO": "208",
  GAL: "209",
  EPH: "210",
  PHP: "211",
  COL: "212",
  "1TH": "213",
  "2TH": "214",
  "1TM": "215",
  "2TM": "216",
  TIT: "217",
  PHM: "218",
  HEB: "219",
  JAS: "220",
  "1PT": "221",
  "2PT": "222",
  "1JN": "223",
  "2JN": "224",
  "3JN": "225",
  JUD: "226",
  REV: "227",
};

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
  PSA: "psalms",
  PRV: "proverbs",
  ECC: "ecclesiastes",
  SOS: "song-of-songs",
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
      const bookSequence = bookAbbrevToSequence[verse.book];
      const bookNum = parseInt(bookSequence);
      const sequence = bookNum * 1000000 + verse.chapter * 1000 + verse.verse;

      return {
        _id: `${version}-${sequence}`,
        version,
        chapter: `${bookAbbrevToName[verse.book]}-${verse.chapter}`,
        sequence: sequence.toString(),
        number: verse.verse,
        text: bbResult.text,
        ...(bbResult.footnotes && { footnotes: bbResult.footnotes }),
        ...(bbResult.paragraphs && { paragraphs: bbResult.paragraphs }),
        ...(subtitle && { subtitle }),
      };
    });

    // Write book file
    const bookOrder = bookAbbrevToSequence[bookAbbrev];
    const bookInfo = crosswalkBookSequence(bookOrder.toString());
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
