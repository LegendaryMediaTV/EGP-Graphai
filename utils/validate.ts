import _ from "lodash";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import validateJsonAgainstSchema from "../functions/validateJsonAgainstSchema";
import { getVersionDirectories } from "../functions/getBibleVersions";
import { sortVerseKeys } from "../functions/sortContentKeys";
import {
  formatJsonData,
  writeFileAtomic,
  writeJsonFile,
} from "../functions/writeJsonFile";
import Content from "../types/Content";
import BibleVersion from "../types/Version";

const jsonPath = "./bible-books/bible-books.json";
const schemaPath = "./bible-books/bible-books-schema.json";
const versionsSchemaPath = "./bible-versions/bible-versions-schema.json";
const bibleVersionsDir = "./bible-versions";

/**
 * Check if a file is a Bible verse file (not _version.json or schema)
 */
function isVerseFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return (
    filePath.includes("bible-versions") &&
    basename !== "_version.json" &&
    !basename.includes("schema") &&
    basename.match(/^\d{2}-[A-Z0-9]+\.json$/) !== null
  );
}

/**
 * Sort keys in a verse file according to canonical order
 */
async function sortVerseFileKeys(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  const sortedVerses = verses.map((verse: Record<string, unknown>) =>
    sortVerseKeys(verse)
  );

  const originalSerialized = JSON.stringify(verses);
  const sortedSerialized = JSON.stringify(sortedVerses);

  if (originalSerialized !== sortedSerialized) {
    await writeJsonFile(filePath, sortedVerses);
    return true;
  }

  return false;
}

/**
 * Format a JSON file and write it back if changed.
 *
 * Formats from the parsed data, not the file's raw text, so it always lands on
 * the canonical form {@link writeJsonFile} would produce for equivalent
 * content. Formatting the raw text would let Prettier preserve pre-existing
 * line breaks instead of re-deriving them from width, so a drifted file would
 * keep passing as "already formatted."
 *
 * @param filePath - Path to the JSON file
 * @returns true if the file was reformatted, false if unchanged
 */
async function formatJsonFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const formatted = await formatJsonData(JSON.parse(content));

  if (content !== formatted) {
    await writeFileAtomic(filePath, formatted);
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
 * Properties that carry a node's content instead of its text. A node rendering
 * through one of these has something for its formatting to apply to, so the
 * text-level rules below do not apply to it.
 *
 * `paragraph` is deliberately absent: it is a boolean flag on a text node but
 * nested content on a paragraph node, so it has to be told apart by its value.
 */
const CONTENT_BRANCHES = ["content", "heading", "subtitle"] as const;

/**
 * Find content nodes the schema accepts but that render as nothing.
 *
 * `content-schema.json` is purely structural: it does not require `text`
 * alongside `marks`, and it puts no `minLength` on `text`. Both gaps have
 * produced real defects that every structural check passed. Two shapes are
 * caught here:
 *
 * 1. **Formatting with nothing to format** — a node carrying `marks` and/or
 *    `script` but no text. One translation had verses opening with
 *    `{ marks: ["woc"], foot: … }`, and a downstream exporter dutifully
 *    wrapped the nothing in tags, emitting `[red][/red]°`. A renderer pairs
 *    tags with a non-greedy `\[red\](.+?)\[/red\]`, which cannot match zero
 *    characters, so the opening tag ran past its own closer and leaked literal
 *    tags into the verse. Several hundred nodes across two translations were
 *    this shape. The `foot` on such a node is legitimate — a footnote needs an
 *    anchor, not text — so only the formatting is at fault.
 *
 * 2. **An empty husk** — a node whose only property is an empty `text`, so it
 *    holds nothing and renders nothing. Two verses in one translation carried
 *    one each, inside footnote content, left behind when the marks came off
 *    `{ text: "", marks: ["b"] }`.
 *
 * Everything else a text-less node can carry is meaningful on its own and is
 * left alone: `foot` and `strong` (thousands of each), `morph`, `lemma`,
 * `bibleLink`, and the bare `paragraph` / `break` flags. Whitespace counts as
 * text: a single space is something for formatting to apply to.
 *
 * The walk descends through every content-bearing branch, including
 * `foot.content`, subtitles and headings. Guarding only the top-level path is
 * exactly how both husks survived the first cleanup pass.
 *
 * @param content - A verse's content tree
 * @returns One message per offending node, each naming its path within the
 *   tree (e.g. `content[0].foot.content[1]`); empty when the tree is clean
 */
export function findMeaninglessContentNodes(content: Content): string[] {
  const problems: string[] = [];

  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${at}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;

    const properties = node as Record<string, unknown>;
    const branch =
      CONTENT_BRANCHES.find((key) => key in properties) ??
      ("paragraph" in properties && typeof properties.paragraph !== "boolean"
        ? "paragraph"
        : undefined);

    if (branch) {
      walk(properties[branch], `${at}.${branch}`);
    } else {
      const text = properties.text;
      const hasText = typeof text === "string" && text !== "";
      const marks = Array.isArray(properties.marks)
        ? properties.marks
        : undefined;
      const script =
        typeof properties.script === "string" ? properties.script : undefined;

      if (!hasText && (marks || script)) {
        const dangling = [
          marks && `marks [${marks.join(", ")}]`,
          script && `script "${script}"`,
        ].filter(Boolean);
        problems.push(
          `${at}: ${dangling.join(" and ")} with no text to apply to`
        );
      } else if (
        !hasText &&
        Object.keys(properties).every((key) => key === "text")
      ) {
        problems.push(`${at}: empty node with nothing to render`);
      }
    }

    const foot = properties.foot;
    if (foot && typeof foot === "object") {
      walk((foot as { content?: unknown }).content, `${at}.foot.content`);
    }
  };

  walk(content, "content");
  return problems;
}

/**
 * Main validation function (async to support prettier)
 */
async function main() {
  console.log("🔑 Sorting keys in verse files...\n");

  const jsonFiles = collectJsonFiles();
  let sortedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasSorted = await sortVerseFileKeys(file);
      if (wasSorted) {
        sortedCount++;
        console.log(`  🔄 Sorted keys: ${file}`);
      }
    }
  }

  if (sortedCount > 0) {
    console.log(`\n✅ Sorted keys in ${sortedCount} file(s)\n`);
  } else {
    console.log("✅ All verse files already have correct key order\n");
  }

  console.log("🎨 Formatting JSON files with Prettier...\n");

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

      if (!validBookIds.has(bookIdFromFilename)) {
        console.error(
          `❌ Invalid filename: ${file} (book ID "${bookIdFromFilename}" not found in bible-books.json)`
        );
        verseValidationPassed = false;
        continue;
      }

      const verses = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      // Per-verse checks: schema, the book field against the filename, and
      // content that passes the schema but renders as nothing.
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

        // The schema checks structure; this checks that the structure says
        // something. See findMeaninglessContentNodes for what slipped past it.
        for (const problem of findMeaninglessContentNodes(verse.content)) {
          console.error(
            `❌ Meaningless content in ${filePath}: verse ${verse.chapter}:${verse.verse} — ${problem}`
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
if (require.main === module) {
  main().catch((error) => {
    console.error("Validation failed with error:", error);
    process.exit(1);
  });
}
