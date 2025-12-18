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
function main(): void {
  const arg1 = process.argv[2];
  // Process arguments and call functions
}

if (require.main === module) {
  main();
}
```

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

// Write with consistent encoding
fs.writeFileSync(outputPath, content, "utf-8");
```

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
function processVerseFile(inputPath: string, outputPath: string): void {
  const verses: VerseSchema[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const lines = verses.map((v) => convertVerseToText(v));
  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
}

function main(): void {
  const version = process.argv[2];
  const bookId = process.argv[3];

  console.log(`Processing: ${version || "all versions"}`);
  // ... processing logic
}

if (require.main === module) {
  main();
}
```
