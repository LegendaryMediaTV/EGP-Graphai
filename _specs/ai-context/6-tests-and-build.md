# Tests and Build Instructions

## Test Frameworks and Locations

### Test Framework

- **Vitest** – Modern test runner configured via `npm run test` (executes `vitest --run`)
- **Configuration** – No `vitest.config.ts` file present; uses default configuration

### Test Locations

- **Test directories** – Tests are in `__tests__/` folders alongside source files:
  - `functions/__tests__/convertToSmallCaps.test.ts`
  - `functions/__tests__/getBibleVersions.test.ts`
  - `functions/__tests__/sortContentKeys.test.ts`
  - `functions/__tests__/writeJsonFile.test.ts`
  - `utils/__tests__/exportContent.test.ts`
- **Pattern** – `*.test.ts` files in `__tests__/` subdirectories

## Coverage by Domain

### Bible Versions Domain

- **Existing tests** – `functions/__tests__/getBibleVersions.test.ts` (17 tests)
- **Covered scenarios:**
  - Version discovery from `_version.json` files
  - Alphabetical sorting by `_id`
  - Handling missing `_version.json` directories
  - Handling malformed JSON files gracefully
  - Custom directory path support
  - Single version retrieval by ID

### Content Processing / Export Domain

- **Existing tests** – `utils/__tests__/exportContent.test.ts` (42 tests)
- **Covered scenarios:**
  - Plain text conversion with Strong's numbers and morphology
  - Markdown conversion with paragraph markers, footnotes, line breaks
  - Heading and subtitle rendering
  - Footnote marker placement and ordering
  - Small caps rendering in text and markdown exports
  - Edge cases: mid-verse paragraphs, textless elements, trailing footnotes
  - Real-world verse tests from KJV1769

### Small Caps Conversion Domain

- **Existing tests** – `functions/__tests__/convertToSmallCaps.test.ts` (40 tests)
- **Covered scenarios:**
  - Simple LORD to small caps conversion
  - Lord GOD (Adonai YHWH) pattern handling
  - LORD GOD (YHWH Elohim) pattern handling
  - Possessive forms (LORD's, GOD's)
  - Context-aware conversion (O LORD vs. THE LORD)
  - Nested content structure handling
  - Footnote content conversion
  - Real-world examples from multiple Bible versions

### Key Ordering Domain

- **Existing tests** – `functions/__tests__/sortContentKeys.test.ts` (26 tests)
- **Covered scenarios:**
  - Basic key ordering (text, marks, strong, morph, etc.)
  - Marks array alphabetization
  - Nested content sorting (footnotes, headings, subtitles)
  - Unknown key preservation and ordering
  - Verse-level key ordering (book, chapter, verse, content)

### File Writing Domain

- **Existing tests** – `functions/__tests__/writeJsonFile.test.ts` (9 tests)
- **Covered scenarios:**
  - `writeJsonFile()` produces the same bytes the old `prettier --write` subprocess did
  - A file it writes is already a fixed point of Prettier formatting (re-running changes nothing)
  - Replacing the contents of a file that already exists
  - `writeFileAtomic()` writes text verbatim without reformatting
  - Multibyte (Hebrew/Greek) content is measured and written correctly
  - Retry-then-throw behavior when the target path can never be written (simulated with fake timers), and that no staging file is left behind

### Validation Domain

- **Existing tests** – None (the file-write path it depends on — `functions/writeJsonFile.ts` — has its own coverage above)
- **What should be tested:**
  - `validateJsonAgainstSchema()` – Schema validation with $ref resolution
  - Version book ordering validation
  - Cross-schema validation
  - Automatic key sorting during validation

### Web Reader Domain

- **Existing tests** – None
- **What should be tested:**
  - API endpoint responses
  - Static file serving

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
# Auto-sorts keys in verse files to canonical order
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

### Content Utilities

```bash
# Convert LORD/GOD to small caps format
npx ts-node utils/convertToSmallCaps.ts WEBUS2020

# Convert specific book only
npx ts-node utils/convertToSmallCaps.ts WEBUS2020 PSA

# Standardize content key order (manual, validation auto-sorts)
npx ts-node utils/sortBibleKeys.ts WEBUS2020
```

### Run Tests

```bash
npm run test
# Or with Vitest options
npx vitest --run
npx vitest --run path/to/test.ts
```

## Change Impact and Recommendations

### When Modifying Schema Files

**Relevant validation:**

- Run `npm run validate` to ensure existing data still passes
- Test schema changes against sample valid and invalid data

### When Modifying Content Processing (exportContent.ts)

**Relevant tests:** `npx vitest --run utils/__tests__/exportContent.test.ts`

**Test coverage includes:**

- Text format: verse numbers, Strong's, morph codes, paragraph markers, footnotes
- Markdown format: paragraph breaks, heading/subtitle rendering, footnote references
- Edge cases: mid-verse paragraphs, textless elements, trailing footnotes

### When Modifying File Writes (writeJsonFile.ts)

**Relevant tests:** `npx vitest --run functions/__tests__/writeJsonFile.test.ts`

**Test coverage includes:**

- Byte-for-byte parity with the Prettier output every writer used to produce via subprocess
- Atomic replace semantics and multibyte handling
- Retry-on-backoff and failure-naming behavior when a write can never land

Any of the four callers (`validate.ts`, `exportContent.ts`, `convertToSmallCaps.ts`, `sortBibleKeys.ts`) that changes how it invokes `writeJsonFile()`/`writeFileAtomic()` should re-run this suite plus its own.

### When Modifying Version Discovery (getBibleVersions.ts)

**Relevant tests:** `npx vitest --run functions/__tests__/getBibleVersions.test.ts`

**Test coverage includes:**

- Discovery of `_version.json` files from folders
- Error handling for malformed JSON
- Version sorting and retrieval

### When Adding New Bible Versions

**Relevant validation:**

- Run `npm run validate` after adding `_version.json` and verse files
- Ensure book ordering starts at 1 and is sequential
- Version is automatically discovered by `getBibleVersions()`

### When Modifying Web Reader Components

**Relevant validation:**

- Manual testing in browser
- Check console for React errors

## Test Data Strategy

- Fixture files in `functions/__tests__/fixtures/versions/` for version discovery tests
- Inline verse data in `utils/__tests__/exportContent.test.ts` for export tests
- Real-world samples from KJV1769 for integration-style tests
- Scratch directories via `fs.mkdtempSync(os.tmpdir())` in `writeJsonFile.test.ts`, torn down in `afterAll`; failure-path tests use Vitest fake timers to collapse the retry backoff instead of waiting on it
