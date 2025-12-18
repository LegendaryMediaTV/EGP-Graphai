# Tests and Build Instructions

## Test Frameworks and Locations

### Test Framework

- **Vitest** – Modern test runner configured via `npm run test` (executes `vitest --run`)
- **Configuration** – No `vitest.config.ts` file present; uses default configuration

### Test Locations

- **Currently** – No test files exist in the repository
- **Expected patterns** – `*.test.ts`, `*.spec.ts`, or `__tests__/` directories
- **Recommended location** – Create tests alongside source files or in dedicated `__tests__/` folders

## Coverage by Domain

### Bible Data Domain

- **Existing tests** – None
- **What should be tested:**
  - Schema validation correctness (valid data passes, invalid data fails)
  - Book ID uniqueness and format validation
  - Version book ordering validation (sequential, no gaps)
  - Verse file naming pattern validation
  - Book field matching filename validation

### Content Processing Domain

- **Existing tests** – None
- **What should be tested:**
  - `convertContentToText()` – All content variants (string, object, array, nested)
  - `convertContentToMarkdownText()` – Markdown-specific transformations
  - Recursive content handling for deeply nested structures
  - Footnote extraction and lettering
  - Strong's number formatting
  - Line break and paragraph handling

### Export Domain

- **Existing tests** – None
- **What should be tested:**
  - `convertVerseToText()` – Output format correctness
  - `convertVerseToMarkdown()` – Markdown output with footnotes
  - Chapter grouping and header generation
  - File naming and directory creation
  - CLI argument handling

### Validation Domain

- **Existing tests** – None
- **What should be tested:**
  - `validateJsonAgainstSchema()` – Schema validation with $ref resolution
  - Error message formatting
  - Cross-schema validation (content schema referenced by verse schema)

### Web Reader Domain

- **Existing tests** – None
- **What should be tested:**
  - API endpoint responses (`/api/versions`, `/api/books`, `/api/content/:v/:b`)
  - Static file serving
  - MIME type mapping
  - Directory traversal prevention

## Build and Run Commands

### Install Dependencies

```bash
npm install
```

### Development Server

```bash
npm run dev
# Starts web server at http://localhost:3000
```

### Validation

```bash
npm run validate
# Validates all JSON schemas and data integrity
# Exit code 0 = success, 1 = failure
```

### Export Bible Data

```bash
# Export all versions
npm run export

# Export specific version
npx ts-node utils/exportContent.ts WEBUS2020

# Export specific book from version
npx ts-node utils/exportContent.ts WEBUS2020 GEN
```

### Run Tests

```bash
npm run test
# Or with Vitest options
npx vitest --run
npx vitest --run path/to/test.ts
```

### TypeScript Compilation (Manual)

```bash
npx tsc
# Outputs to ./dist (not typically needed due to ts-node usage)
```

## Change Impact and Recommendations

### When Modifying Schema Files

**Relevant validation:**

- Run `npm run validate` to ensure existing data still passes
- Test schema changes against sample valid and invalid data

**Recommended new tests:**

- Unit tests for schema validation edge cases
- Tests for $ref resolution across schemas

### When Modifying Content Processing (exportContent.ts)

**Relevant validation:**

- Compare export output before/after changes
- Manual verification of exported text and markdown

**Recommended new tests:**

- Unit tests for `convertContentToText()` with all Content variants
- Unit tests for `convertVerseToMarkdown()` with footnotes
- Snapshot tests for expected output format

### When Modifying Web Reader Components

**Relevant validation:**

- Manual testing in browser
- Check console for React errors

**Recommended new tests:**

- Component rendering tests (React Testing Library)
- Integration tests for API endpoints
- E2E tests for user flows (Playwright or Cypress)

### When Adding New Bible Versions

**Relevant validation:**

- Run `npm run validate` after adding version entry and verse files
- Ensure book ordering starts at 1 and is sequential

**Recommended new tests:**

- Automated check that all expected files exist
- Verify verse file content matches expected structure

## Test Development Guidelines

### Recommended Test Structure

```typescript
// utils/__tests__/exportContent.test.ts
import { describe, it, expect } from "vitest";
import { convertContentToText } from "../exportContent";

describe("convertContentToText", () => {
  it("handles plain string content", () => {
    expect(convertContentToText("Hello")).toBe("Hello");
  });

  it("handles text object with strong number", () => {
    const content = { text: "word", strong: "G1234" };
    expect(convertContentToText(content)).toBe("word G1234");
  });

  it("handles nested array content", () => {
    const content = ["Hello", { text: " " }, "World"];
    expect(convertContentToText(content)).toBe("Hello World");
  });
});
```

### Priority Test Areas

1. **High Priority** – Content processing functions (most complex logic)
2. **High Priority** – Validation logic (data integrity)
3. **Medium Priority** – Export formatting (output correctness)
4. **Medium Priority** – API endpoints (data serving)
5. **Lower Priority** – UI components (visual, harder to test)

### Test Data Strategy

- Create fixture files with representative Bible content
- Include edge cases: empty content, deeply nested arrays, all footnote types
- Use actual verse data samples from existing versions
