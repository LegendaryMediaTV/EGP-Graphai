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
import Content, { ContentBibleLink } from "../types/Content";
import BibleVersion from "../types/Version";
import { findCrossChapterLinks } from "./crossChapterLinks";
import { formatCrossChapterFinding } from "./auditCrossChapterLinks";
import {
  auditVersion as auditNodeConventions,
  isClean as nodeConventionsAreClean,
  printFindingLines as printNodeConventionFindings,
} from "./auditNodes";

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
 * Sort keys in a verse file according to canonical order and write it back
 * if anything changed.
 *
 * @returns true if the file was re-sorted, false if unchanged
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
 * Formats the parsed data, not the file's raw text — otherwise Prettier
 * would preserve pre-existing line breaks, and a drifted file could keep
 * passing as "already formatted."
 *
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
 * Normalize `bibleLink` dashes in one verse file and write it back if
 * anything changed.
 *
 * Uses {@link normalizeBibleLinkDashesInContent}'s own per-verse `changed`
 * flag directly, unlike {@link sortVerseFileKeys}'s whole-array
 * serialize-and-diff (needed there only because `sortVerseKeys` itself
 * returns no such flag).
 */
async function normalizeBibleLinkDashesInFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, "utf-8");
  const verses = JSON.parse(content);

  let anyChanged = false;
  const rewrittenVerses = verses.map((verse: Record<string, unknown>) => {
    const rewritten = normalizeBibleLinkDashesInContent(verse.content as Content);
    if (!rewritten.changed) return verse;
    anyChanged = true;
    return { ...verse, content: rewritten.content };
  });

  if (anyChanged) {
    await writeJsonFile(filePath, rewrittenVerses);
    return true;
  }
  return false;
}

/**
 * Collect all JSON files to be validated and formatted.
 *
 * The root-level schema, the bible-books registry, and the two
 * bible-versions-wide schemas are always included regardless of scope —
 * every version depends on them.
 *
 * @param versionDirs - Version folder names to scope collection to — e.g.
 *   `["YLT1898"]` for one requested version, or `getVersionDirectories()`'s
 *   full result to collect every version's files
 */
export function collectJsonFiles(versionDirs: string[]): string[] {
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
 * Properties that hold a node's nested content instead of its own text — when
 * one is present, the checks below recurse into it instead of applying at
 * this level.
 *
 * `paragraph` is deliberately excluded: it's a boolean flag on a text node but
 * nested content on a paragraph node, so it must be told apart by its value,
 * not by key alone.
 */
const CONTENT_BRANCHES = ["content", "heading", "subtitle"] as const;

/**
 * Find content nodes the schema accepts but that render as nothing.
 *
 * `content-schema.json` doesn't require `text` alongside `marks`, and puts no
 * `minLength` on `text` — both gaps have let real defects through structural
 * checks. Two shapes are caught:
 *
 * 1. **Formatting with nothing to format** — a node with `marks` and/or
 *    `script` but no text. A non-greedy tag-matching renderer can't wrap zero
 *    characters, so the opening delimiter leaks into the surrounding text
 *    instead of rendering nothing.
 * 2. **An empty husk** — a node whose only property is an empty `text`, the
 *    residue left when marks are stripped from a shape like
 *    `{ text: "", marks: ["b"] }` without also removing the now-pointless node.
 *
 * Everything else a text-less node can carry — `foot`, `strong`, `morph`,
 * `lemma`, `bibleLink`, bare `paragraph` / `break` flags — is meaningful on
 * its own; whitespace counts as text.
 *
 * The walk recurses into every content-bearing branch (`foot.content`,
 * subtitles, headings) — guarding only the top-level path is how both husks
 * above survived the first cleanup pass.
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
 * Find content nodes carrying a `strong` value whose own `text` ends in
 * trailing whitespace.
 *
 * The established convention (e.g. KJV1769 Genesis 1:1:
 * `{ text: "In the beginning", strong: "H7225" }`,
 * `{ text: " God", strong: "H430" }`) puts a joining space as the
 * **leading** character of the node after the gap, never trailing on the
 * node before it. An importer that inverts this breaks any exporter
 * assuming the leading-space shape (double spaces, misplaced tags).
 *
 * A textless sibling — e.g. a multi-number Strong's tag's extra numbers,
 * `{ strong: "H853" }` — never matches here, since an empty string can't
 * end in whitespace, so it needs no special exclusion.
 *
 * @param content - A verse's content tree
 * @returns One message per offending node, each naming its path within the
 *   tree (e.g. `content[0].foot.content[1]`); empty when the tree is clean
 */
export function findStrongTrailingWhitespaceNodes(content: Content): string[] {
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
    } else if (
      typeof properties.strong === "string" &&
      typeof properties.text === "string" &&
      /\s$/.test(properties.text)
    ) {
      problems.push(
        `${at}: strong "${properties.strong}" carries text "${properties.text}" ending in whitespace`
      );
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
 * Fix one `bibleLink` node's ASCII hyphens — in the target itself and in a
 * string `content` override — dropping `content` once it's redundant with
 * the (now-fixed) `bibleLink`, even if the redundancy predates this fix and
 * involves no hyphen at all. Never invents a `content` key, and never
 * touches one that's absent or not a string.
 *
 * Not exported — a caller reaches this only through
 * {@link normalizeBibleLinkDashesInContent}, which is the one that knows
 * when a node in the tree is a `bibleLink` at all.
 */
function fixBibleLinkNode(node: ContentBibleLink): { content: ContentBibleLink; changed: boolean } {
  const bibleLink = node.bibleLink.includes("-")
    ? node.bibleLink.split("-").join("–")
    : node.bibleLink;

  const content =
    typeof node.content === "string" && node.content.includes("-")
      ? node.content.split("-").join("–")
      : node.content;

  if (typeof content === "string" && content === bibleLink) {
    return { content: { bibleLink }, changed: true };
  }

  if (bibleLink === node.bibleLink && content === node.content) {
    return { content: node, changed: false };
  }

  return {
    content: content === undefined ? { bibleLink } : { bibleLink, content },
    changed: true,
  };
}

/**
 * Normalize every `bibleLink` node's ASCII hyphens to en dashes, via
 * {@link fixBibleLinkNode} — never touching any other `content` key in the
 * tree (a paragraph's or heading's own `content` is left alone even when it
 * contains a hyphen).
 *
 * The traversal order — array, `bibleLink`, `heading`, `subtitle`,
 * `paragraph`-as-content, then nested `content`, then `foot` — mirrors
 * `crossChapterLinks.ts`'s own `splitCrossChapterLinksInContent` shape, but
 * deliberately not {@link CONTENT_BRANCHES}'s: that shape treats a
 * `bibleLink`'s own `content` as just another branch to recurse into, which
 * is wrong here since it's display text to rewrite in place, not a subtree.
 * The `"bibleLink" in node` check has to come before the generic
 * `"content" in node` check, and the walk stops there rather than recursing
 * into that node's own `content`.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @returns The rewritten tree (structurally new only where something
 *   changed) and whether anything changed at all
 */
export function normalizeBibleLinkDashesInContent(
  content: Content
): { content: Content; changed: boolean } {
  if (content === null || content === undefined || typeof content !== "object") {
    return { content, changed: false };
  }

  if (Array.isArray(content)) {
    let changed = false;
    const items = content.map((item) => {
      const rewritten = normalizeBibleLinkDashesInContent(item);
      changed = changed || rewritten.changed;
      return rewritten.content;
    });
    return { content: items, changed };
  }

  if ("bibleLink" in content) {
    return fixBibleLinkNode(content);
  }

  if ("heading" in content) {
    const rewritten = normalizeBibleLinkDashesInContent(content.heading);
    return { content: { ...content, heading: rewritten.content }, changed: rewritten.changed };
  }

  if ("subtitle" in content) {
    const rewritten = normalizeBibleLinkDashesInContent(content.subtitle);
    return { content: { ...content, subtitle: rewritten.content }, changed: rewritten.changed };
  }

  if ("paragraph" in content && content.paragraph !== undefined && typeof content.paragraph !== "boolean") {
    const rewritten = normalizeBibleLinkDashesInContent(content.paragraph);
    return { content: { ...content, paragraph: rewritten.content }, changed: rewritten.changed };
  }

  let result: Content = content;
  let changed = false;
  if ("content" in content) {
    const rewritten = normalizeBibleLinkDashesInContent(content.content);
    result = { ...content, content: rewritten.content };
    changed = rewritten.changed;
  }
  if (content.foot) {
    const rewritten = normalizeBibleLinkDashesInContent(content.foot.content);
    result = { ...(result as typeof content), foot: { ...content.foot, content: rewritten.content } };
    changed = changed || rewritten.changed;
  }
  return { content: result, changed };
}

/**
 * Validates (and normalizes) one version, or every version when none is
 * requested: sorts verse keys, formats JSON files, normalizes `bibleLink`
 * dashes, then checks bible-books, each version's `_version.json`, book
 * ordering, and every verse file's schema and content. Exits the process
 * with a non-zero code on the first validation phase that fails.
 *
 * The schema/structure phases above are hierarchical — each later phase
 * assumes the earlier ones held, so a failure there exits immediately rather
 * than continuing on data it can no longer trust. The two corpus-wide audits
 * that run last, `crossChapterLinks.ts` (unsplit `bibleLink` ranges) and
 * `auditNodes.ts` (Strong's-node placement conventions), are peers of each
 * other with no such dependency, so both always run and report in full
 * before `main` exits non-zero — a version that fails one still gets audited
 * by the other in the same pass, rather than needing a second `validate` run
 * to find out.
 *
 * @param requestedVersion - A single version id to validate (e.g.
 *   `"YLT1898"`, from `process.argv[2]`). Omitted → every version directory
 *   on disk is validated, including by the two trailing audits, which scope
 *   to the same `versionDirs`. An unmatched id isn't checked for existence
 *   up front — it surfaces as a natural filesystem error later, matching
 *   `exportContent.ts`, `auditCrossChapterLinks.ts`, and `auditNodes.ts`.
 */
async function main(requestedVersion?: string) {
  const versionDirs = requestedVersion
    ? [requestedVersion]
    : getVersionDirectories(bibleVersionsDir);

  console.log("🔑 Sorting keys in verse files...\n");

  const jsonFiles = collectJsonFiles(versionDirs);
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

  console.log("🔧 Normalizing bibleLink dashes...\n");

  let dashNormalizedCount = 0;

  for (const file of jsonFiles) {
    if (fs.existsSync(file) && isVerseFile(file)) {
      const wasNormalized = await normalizeBibleLinkDashesInFile(file);
      if (wasNormalized) {
        dashNormalizedCount++;
        console.log(`  🔄 Normalized bibleLink dashes: ${file}`);
      }
    }
  }

  if (dashNormalizedCount > 0) {
    console.log(`\n✅ Normalized bibleLink dashes in ${dashNormalizedCount} file(s)\n`);
  } else {
    console.log("✅ All bibleLink dashes already normalized\n");
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

        // See findStrongTrailingWhitespaceNodes for the convention this
        // enforces and why a violation is a real defect, not just style.
        for (const problem of findStrongTrailingWhitespaceNodes(
          verse.content
        )) {
          console.error(
            `❌ Strong's text ends in whitespace in ${filePath}: verse ${verse.chapter}:${verse.verse} — ${problem}`
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

  // Cross-chapter bibleLink audit: every unsplit range this version's own
  // content carries. See crossChapterLinks.ts for the rule; utils/validate.ts
  // only ever reports here — never --fix.
  console.log("\n🔗 Auditing cross-chapter bibleLink targets...");
  let crossChapterLinksPassed = true;

  for (const versionDir of versionDirs) {
    const { findings } = findCrossChapterLinks(versionDir);
    if (findings.length === 0) {
      console.log(`✅ ${versionDir}: no unsplit cross-chapter links`);
      continue;
    }

    console.error(`❌ ${versionDir}: ${findings.length} unsplit cross-chapter link(s):`);
    for (const finding of findings) {
      console.error(`  ${formatCrossChapterFinding(finding)}`);
    }
    crossChapterLinksPassed = false;
  }

  // Strong's-node placement audit: the five conventions auditNodes.ts owns
  // (unmerged pairs, trailing whitespace, leading punctuation, mark-boundary
  // spaces, verse-initial spaces). Also report-only here.
  console.log("\n🧩 Auditing Strong's-node placement conventions...");
  let nodeConventionsPassed = true;

  for (const versionDir of versionDirs) {
    const summary = auditNodeConventions(versionDir);
    if (nodeConventionsAreClean(summary)) {
      console.log(`✅ ${versionDir}: no Strong's-node placement findings`);
      continue;
    }

    console.error(`❌ ${versionDir}: Strong's-node placement findings:`);
    printNodeConventionFindings(summary, false);
    nodeConventionsPassed = false;
  }

  if (!crossChapterLinksPassed || !nodeConventionsPassed) {
    if (!crossChapterLinksPassed) {
      console.error("\n❌ Cross-chapter link audit failed! Run `npm run audit-links -- <version> --fix` to split them.");
    }
    if (!nodeConventionsPassed) {
      console.error("\n❌ Strong's-node audit failed! Run `npm run audit-nodes -- <version> --verbose` for full detail.");
    }
    process.exit(1);
  }

  console.log("\n✅ Cross-chapter link and Strong's-node audits both passed!");
}

// Guard so importing this module (e.g. from tests) doesn't also run main()
// and call process.exit
if (require.main === module) {
  main(process.argv[2]).catch((error) => {
    console.error("Validation failed with error:", error);
    process.exit(1);
  });
}
