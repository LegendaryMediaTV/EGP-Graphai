# TypeScript Utility Modules Style Guide

## Overview

TypeScript utility modules in this project handle data processing, validation, and file operations. They are executed via `ts-node` and follow a consistent structure for maintainability and clarity.

## Structure Pattern

```typescript
// 1. Imports (Node.js built-ins, then external, then internal)
import fs from "fs";
import path from "path";
import _ from "lodash";
import Ajv from "ajv";
import Content from "../types/Content";

// 2. Type imports/interfaces (if not in separate type file)
interface LocalInterface { ... }

// 3. Helper functions (private, not exported)
function helperFunction(): void { ... }

// 4. Main exported function(s)
export default function mainFunction(): ResultType { ... }

// 5. CLI entry point (if script can be run directly)
async function main(): Promise<void> {
  const arg1 = process.argv[2];
  // Process arguments and call functions
}

if (require.main === module) {
  main();
}
```

CLI entry points are `async` even when nothing in the script's own logic requires it, because every script that writes output (`validate.ts`, `exportContent.ts`, `convertToSmallCaps.ts`, `sortBibleKeys.ts`, `importUsfm.ts`, `overhaulFootnotes.ts`) `await`s a call into [functions/writeJsonFile.ts](../../../functions/writeJsonFile.ts). `exportContent.ts`'s `main()` also wraps its `require.main === module` call in `.catch()` to report failures with a non-zero exit rather than an unhandled rejection; `importUsfm.ts` does the same. Everything under `utils/` (and `functions/`) that repairs a node-placement, script-tagging, or cross-chapter-link finding — `crossChapterLinks.ts`, `auditNodes.ts`, `fixUnmergedNodes.ts`, `fixHeadingParagraphs.ts`, `fixFootnotePunctuationOrder.ts`, `fixMarkBoundaryEmbeddedSpaces.ts`, `fixFootnoteMarkerSpacing.ts`, `fixDuplicateFootnoteAnchors.ts`, `tagScriptRunsInContent.ts`, `mergeEquivalentSiblingsInContent.ts` — carries no CLI or `main()` of its own. `validate.ts` is their only caller, calling each transform unconditionally as one step in its own auto-fix pass; there is no `require.main` guard to write because there is no standalone entry point to guard.

## Naming and Organization

- **File names** – `camelCase.ts` (e.g., `exportContent.ts`, `validate.ts`)
- **Functions** – `camelCase` (e.g., `convertContentToText`, `validateJsonAgainstSchema`)
- **Interfaces** – `PascalCase` (e.g., `VerseSchema`, `ContentObject`)
- **Constants** – `SCREAMING_SNAKE_CASE` for true constants, `camelCase` for derived values
- **Folder placement** – Reusable functions in `functions/`, scripts in `utils/`

## State Management Patterns

- **No global mutable state** – Functions receive all needed data as parameters
- **Return results** – Functions return result objects rather than mutating inputs
- **Error handling** – Use try/catch with descriptive error objects
- **Process exit** – CLI scripts use `process.exit(1)` on failure

## Common Patterns

### Recursive Content Processing

```typescript
function processContent(content: Content): string {
  // Handle string
  if (typeof content === "string") {
    return content;
  }

  // Handle array
  if (Array.isArray(content)) {
    return content.map(item => processContent(item)).join("");
  }

  // Handle object variants
  if ("heading" in content) { ... }
  if ("paragraph" in content) { ... }

  // Handle text object
  const obj = content as ContentObject;
  return obj.text || "";
}
```

### File System Operations

```typescript
// Directory creation with recursive flag
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read and parse JSON
const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

// Write JSON data: formats in-process and writes via stage-then-rename
await writeJsonFile(outputPath, data);

// Write text that's already exactly what belongs on disk (Markdown, plain text)
await writeFileAtomic(outputPath, content);
```

Both helpers come from [functions/writeJsonFile.ts](../../../functions/writeJsonFile.ts). Neither utility script calls `fs.writeFileSync` directly for output it produces. The staged write and retry-on-backoff behavior guards against a Windows transient where something else (antivirus, an indexer) briefly holds the target file open.

### CLI Argument Handling

```typescript
function main(): void {
  const requiredArg = process.argv[2];
  const optionalArg = process.argv[3];

  if (!requiredArg) {
    // Handle all items
  } else {
    // Handle specific item
  }
}
```

A boolean flag that should read regardless of where it sits among the positional arguments is filtered out of `argv` first, then the remaining values are destructured positionally. See `importUsfm.ts`'s `parseArgv()`:

```typescript
export function parseArgv(argv: readonly string[]): ParsedArgv {
  const noStrongs = argv.includes("--no-strongs");
  const [sourceDir, versionId, book, chapterText] = argv.filter((argument) => argument !== "--no-strongs");
  return {
    sourceDir,
    versionId,
    book,
    chapter: chapterText !== undefined ? parseInt(chapterText, 10) : undefined,
    options: noStrongs ? { strongs: false } : {},
  };
}
```

## Example

```typescript
import fs from "fs";
import path from "path";
import Content, { ContentObject } from "../types/Content";
import VerseSchema from "../types/VerseSchema";

/**
 * Convert content to plain text representation.
 * Handles strings, objects, and arrays recursively.
 */
function convertContentToText(content: Content): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => convertContentToText(item)).join("");
  }

  if ("heading" in content) {
    return `[[${convertContentToText(content.heading)}]]`;
  }

  const obj = content as ContentObject;
  let result = obj.text || "";

  if (obj.strong) {
    result += " " + obj.strong;
  }

  return result;
}

/**
 * Process a single verse file and write output.
 */
async function processVerseFile(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const verses: VerseSchema[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const lines = verses.map((v) => convertVerseToText(v));
  await writeFileAtomic(outputPath, lines.join("\n"));
}

async function main(): Promise<void> {
  const version = process.argv[2];
  const bookId = process.argv[3];

  console.log(`Processing: ${version || "all versions"}`);
  // ... processing logic
}

if (require.main === module) {
  main();
}
```
