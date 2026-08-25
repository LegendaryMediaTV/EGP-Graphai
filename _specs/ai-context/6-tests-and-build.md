# Tests and Build Instructions

## Test Frameworks and Locations

### Test Framework

- **Vitest** – Modern test runner configured via `npm run test` (executes `vitest --run`)
- **Configuration** – No `vitest.config.ts` file present; uses default configuration

### Test Locations

- **Test directories** – Tests are in `__tests__/` folders alongside source files:
  - `functions/__tests__/contentSchema.test.ts`
  - `functions/__tests__/convertToSmallCaps.test.ts`
  - `functions/__tests__/getBibleVersions.test.ts`
  - `functions/__tests__/sortContentKeys.test.ts`
  - `functions/__tests__/writeJsonFile.test.ts`
  - `utils/__tests__/auditCrossChapterLinks.test.ts`
  - `utils/__tests__/auditNodes.test.ts`
  - `utils/__tests__/crossChapterLinks.test.ts`
  - `utils/__tests__/exportContent.test.ts`
  - `utils/__tests__/importUsfm.test.ts`
  - `utils/__tests__/overhaulFootnotes.test.ts`
  - `utils/__tests__/validate.test.ts`
  - `utils/usfm/__tests__/*.test.ts` (16 files: tokenizer, per-construct builders, and USFM-convention regression specs for the import pipeline)
  - `web/public/js/__tests__/footnoteText.test.ts`
- **Pattern** – `*.test.ts` files in `__tests__/` subdirectories, including under `web/public/js/` for the reader's own plain-JS utilities, and under `utils/usfm/__tests__/fixtures/` for the `.usfm` fixture files those specs read

## Coverage by Domain

### Content Schema Domain

- **Existing tests** – `functions/__tests__/contentSchema.test.ts` (4 tests)
- **Covered scenarios:**
  - Compiles `content-schema.json` directly with Ajv (not via the verse/version wrapper schemas)
  - A heading object with no `type` is valid (regression baseline for pre-existing data)
  - A heading object with `type: "acrostic"` or `type: "standard"` is valid
  - A heading object with an invalid `type` value is rejected

### Bible Versions Domain

- **Existing tests** – `functions/__tests__/getBibleVersions.test.ts` (23 tests)
- **Covered scenarios:**
  - Version discovery from `_version.json` files
  - Alphabetical sorting by `_id`
  - Handling missing `_version.json` directories
  - Handling malformed JSON files gracefully
  - Custom directory path support
  - Single version retrieval by ID
  - Duplicate-name disambiguation: colliding `name` values get their `_id`'s trailing-year suffix appended; unique names untouched; a non-string `name` skipped from grouping; an unparseable trailing year logged rather than thrown
  - `getBibleVersion()`'s singular lookup deliberately does not disambiguate

### Content Processing / Export Domain

- **Existing tests** – `utils/__tests__/exportContent.test.ts` (80 tests)
- **Covered scenarios:**
  - Plain text conversion with Strong's numbers and morphology
  - Markdown conversion with paragraph markers, footnotes, line breaks
  - Heading and subtitle rendering
  - Standard vs. acrostic heading rendering: triple-bracket marker in text, one-heading-level-smaller in markdown, across both the generic dispatch and the chapter/verse-leading special cases
  - Footnote marker placement and ordering, including a second footnote on the same word (textless-sibling shape) landing its marker before the Strong's number, matching the first footnote's position
  - Small caps rendering in text and markdown exports
  - Bold/italic rendering: markdown-only wrapping, and the shared-delimiter-span merge across adjacent same-marked siblings (regression coverage for the `**word****word**` bug)
  - Synthetic space insertion between an unseparated Strong's/morph/lemma tag and the word that follows
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

- **Existing tests** – `functions/__tests__/sortContentKeys.test.ts` (27 tests)
- **Covered scenarios:**
  - Basic key ordering (text, marks, strong, morph, etc.)
  - Marks array alphabetization
  - Nested content sorting (footnotes, headings, subtitles)
  - Heading `type` (standard/acrostic) sorts into the shared `type` slot alongside footnote `type`
  - Unknown key preservation and ordering
  - Verse-level key ordering (book, chapter, verse, content)

### File Writing Domain

- **Existing tests** – `functions/__tests__/writeJsonFile.test.ts` (10 tests)
- **Covered scenarios:**
  - `writeJsonFile()` produces the same bytes as formatting a compact (unindented) stringify
  - A short object collapses to one line rather than being forced onto three. This is the regression test for the compact-stringify fix (indenting before Prettier sees the text would lock every object onto its own lines regardless of length)
  - A file it writes is already a fixed point of Prettier formatting (re-running changes nothing)
  - Replacing the contents of a file that already exists
  - `writeFileAtomic()` writes text verbatim without reformatting
  - Multibyte (Hebrew/Greek) content is measured and written correctly
  - Retry-then-throw behavior when the target path can never be written (simulated with fake timers), and that no staging file is left behind

### Cross-Chapter Link Audit Domain

- **Existing tests** – `utils/__tests__/crossChapterLinks.test.ts` (36 tests), `utils/__tests__/auditCrossChapterLinks.test.ts` (8 tests)
- **Covered scenarios:**
  - Target-shape classification: `singleChapter`, `crossChapterRange`, `wholeChapterRange`, `mergedTarget`, `unparsed`. `wholeChapterRange` is a finding, split alongside `crossChapterRange`, not an out-of-scope shape
  - Dash-agnostic detection: en dash, em dash, and ASCII hyphen all recognized as the same range separator
  - Per-version chapter-length lookups (e.g. Ezra 4's last verse from ASV1901's own records) and per-version canon-scoped book resolution
  - Splitting a cross-chapter range into two chapter-scoped links, byte-for-byte display preservation, and idempotency on a second pass; a whole-chapter range splits the same way but with no verse anchor on either half (real YLT1898 fixtures, e.g. `"Romans 1–11"`)
  - Corpus-wide sweep across all 6 versions, `scanned` count as a guard against a walk that silently stops descending, and `exitCodeFor()`'s pass/fail behavior
  - Read-only guarantee. Auditing twice produces byte-identical results
  - Real fixtures drawn from this repo's own WEBUS2020 data (the only one of the 6 versions carrying any `bibleLink`) rather than synthetic examples, wherever a real occurrence exists

### Validation Domain

- **Existing tests** – `utils/__tests__/validate.test.ts` (36 tests)
- **Covered scenarios:**
  - `findMeaninglessContentNodes()`: formatting (`marks`/`script`) with no `text`, and empty `""` husks, flagged; `foot`/`strong`/`morph`/`lemma`/`bibleLink`/bare `paragraph`/`break` left alone; descends into `foot.content`, subtitles, and headings, not just the top level
  - `findStrongTrailingWhitespaceNodes()`: a `strong`-carrying node's own `text` ending in whitespace
  - `main()` gated behind `require.main === module`, so importing the module for its exported functions doesn't trigger a full validation run
  - `main()` also runs the cross-chapter link audit and the Strong's-node audit for each version it validates, both read-only. See [cross-chapter-links.md](../4-domains/cross-chapter-links.md) and [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for what each one checks

### Strong's-Node Audit Domain

- **Existing tests** – `utils/__tests__/auditNodes.test.ts` (72 tests)
- **Covered scenarios:** see [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for the domain narrative: all seven findings' positive/negative cases, `agreesInFormatting` mark/script agreement, textless-Strong's-sibling skip-through (both directions), `break`/`paragraph` boundary guards, verse-initial-space detection scoped to a verse's own outermost content, the heading/subtitle-paragraph convention's per-book evidence-gathering, fraction normalization reuse, and `exitCodeFor()`/`isClean()` across all seven checks combined

### USFM Import Pipeline Domain

- **Existing tests** – 18 files: `utils/__tests__/importUsfm.test.ts`, `utils/__tests__/overhaulFootnotes.test.ts`, and 16 files under `utils/usfm/__tests__/`
- **Current status: all 18 files load and pass in this checkout.** `npx vitest run` reports 29 of 29 test files and 925 of 925 tests passing repo-wide. This checkout carries the WEBUS2020 raw USFM corpus at the gitignored `imports/webus2020/ebible-usfm/`, and `utils/usfm/headings.ts`, `footnotes.ts`, and `verify.ts` now import their Hebrew/Greek run-splitting helper from the tracked `utils/usfm/splitScriptRuns.ts` rather than a missing `imports/_lib/` path. See [usfm-import.md](../4-domains/usfm-import.md#key-business-rules) for detail.
- **One dependency stays gitignored, not committed.** Because `imports/webus2020/ebible-usfm/` isn't tracked, a checkout without it would still fail the 7 files that read it directly: `utils/usfm/__tests__/metadata.test.ts`, `footnotes.test.ts`, `verify.test.ts`, `bMarkerUpstreamConvention.test.ts`, `bibleLinkTargetConventions.test.ts`, `chapterBoundaryUpstreamConvention.test.ts`, and `embeddedReferenceConventions.test.ts` (the last four via `upstreamHeadConvention.ts`'s `usfmFilesByRegistryId()`/`SOURCE_DIR`). The other 11 — `tokenize.test.ts`, `blockStructure.test.ts`, `footnoteTypeRules.test.ts`, `fractions.test.ts`, `headings.test.ts`, `inlineMarks.test.ts`, `paragraphNoise.test.ts`, `references.test.ts`, `segmentVerses.test.ts`, `importUsfm.test.ts`, and `overhaulFootnotes.test.ts` — never touch that corpus and pass regardless of whether it's present.
- **Covered scenarios:**
  - Lexing raw USFM into a flat token stream, including paired vs. unpaired marker interleaving (`tokenize.ts`)
  - Footnote type classification by construct (citation-only, names a witness, opens with a translation marker, compares languages across a semicolon) rather than by memorized phrases, plus the never-downgrade-to-`stu` rule and its `--hard-reset` counterpart (`footnoteTypeRules.ts`, `overhaulFootnotes.ts`)
  - Fraction notation normalization across its several raw input shapes (`fractions.ts`)
  - The shared Strong's-run/joining-space builder used by both verse content and footnote bodies (`inlineMarks.ts`)
  - The whole-book paragraph-noise suppression pass (`paragraphNoise.ts`)
  - Cross-reference resolution against the book registry, including embedded (unmarked) references in footnote prose (`references.ts`)
  - Retroactive footnote re-classification against content already on disk, including `--fix` write-back (`overhaulFootnotes.ts`)
  - The full import CLI, acrostic heading detection, footnote assembly, chapter-boundary and stanza-break handling, embedded/bracketed reference conventions, book-metadata extraction, and the independent `verify.ts` cross-check — all exercised now that the corpus and `splitScriptRuns` are both available

### Web Reader Domain

- **Existing tests** – `web/public/js/__tests__/footnoteText.test.ts` (7 tests) for `getFootnoteText()`; none yet for React components or the HTTP server
- **Covered scenarios:**
  - Plain string passthrough
  - `{bibleLink}` falls back to the raw reference when no display override is set; a `content` override is preferred over the raw link when present
  - Falls back to `.text` on a plain-text note
  - Mixed arrays of link/string segments joined into one string (real Psalm 111:10 and Matthew 5:3 WEBUS2020 reproduction cases for a reported flattening bug)
- **What should still be tested:**
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
# Import a translation from USFM source files
npx ts-node utils/importUsfm.ts path/to/usfm-files WEBUS2020

# Preview one chapter's import without writing anything
npx ts-node utils/importUsfm.ts path/to/usfm-files WEBUS2020 GEN 1

# Independently re-check a freshly imported version against its own USFM source
npx ts-node utils/usfm/verify.ts path/to/usfm-files WEBUS2020

# Re-run existing on-disk footnotes through the current classification rules
npm run overhaul-footnotes WEBUS2020
npm run overhaul-footnotes WEBUS2020 -- --fix

# Convert LORD/GOD to small caps format
npx ts-node utils/convertToSmallCaps.ts WEBUS2020

# Convert specific book only
npx ts-node utils/convertToSmallCaps.ts WEBUS2020 PSA

# Standardize content key order (manual, validation auto-sorts)
npx ts-node utils/sortBibleKeys.ts WEBUS2020

# Audit all versions for unsplit cross-chapter bibleLink ranges (dry-run)
npm run audit-links

# Audit one version, or add --fix to split and write its findings
npx ts-node utils/auditCrossChapterLinks.ts WEBUS2020 --fix

# Audit all versions for Strong's-node placement conventions (read-only, no --fix)
npm run audit-nodes

# Audit one version, listing every finding rather than the first 10 per check
npx ts-node utils/auditNodes.ts WEBUS2020 --verbose
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
- If modifying `content-schema.json`: `npx vitest --run functions/__tests__/contentSchema.test.ts` compiles it directly with Ajv against representative valid/invalid payloads

### When Modifying Content Processing (exportContent.ts)

**Relevant tests:** `npx vitest --run utils/__tests__/exportContent.test.ts`

**Test coverage includes:**

- Text format: verse numbers, Strong's, morph codes, paragraph markers, footnotes
- Markdown format: paragraph breaks, heading/subtitle rendering, footnote references
- Heading `type`: acrostic vs. standard marker rendering in both formats
- Bold/italic (`b`/`i`) mark rendering, especially the shared-delimiter-span merge across adjacent same-marked siblings, which is the highest-risk regression surface in this file
- Edge cases: mid-verse paragraphs, textless elements, trailing footnotes

### When Modifying File Writes (writeJsonFile.ts)

**Relevant tests:** `npx vitest --run functions/__tests__/writeJsonFile.test.ts`

**Test coverage includes:**

- Byte-for-byte parity with the Prettier output every writer used to produce via subprocess
- Atomic replace semantics and multibyte handling
- Retry-on-backoff and failure-naming behavior when a write can never land

Any of the callers (`validate.ts`, `exportContent.ts`, `convertToSmallCaps.ts`, `sortBibleKeys.ts`, `auditCrossChapterLinks.ts`, `importUsfm.ts`, `overhaulFootnotes.ts`) that changes how it invokes `writeJsonFile()`/`writeFileAtomic()` should re-run this suite plus its own.

### When Modifying the Cross-Chapter Link Audit (crossChapterLinks.ts / auditCrossChapterLinks.ts)

**Relevant tests:** `npx vitest --run utils/__tests__/crossChapterLinks.test.ts utils/__tests__/auditCrossChapterLinks.test.ts`

**Test coverage includes:**

- Target-shape classification and dash-agnostic detection
- Per-version chapter-length and book-canon resolution (never a shared table across versions)
- Split correctness for both `crossChapterRange` and `wholeChapterRange`, display-text preservation, and idempotency
- Corpus-wide sweep counts and the CLI's exit-code behavior

`findCrossChapterLinks()` is also called directly from `validate.ts`, one call per version being validated. Re-run `utils/__tests__/validate.test.ts` alongside this suite when changing its return shape.

### When Modifying Version Discovery (getBibleVersions.ts)

**Relevant tests:** `npx vitest --run functions/__tests__/getBibleVersions.test.ts`

**Test coverage includes:**

- Discovery of `_version.json` files from folders
- Error handling for malformed JSON
- Version sorting and retrieval
- Duplicate-name disambiguation, and its deliberate absence from the singular `getBibleVersion()` lookup

### When Modifying Validation Checks (validate.ts)

**Relevant tests:** `npx vitest --run utils/__tests__/validate.test.ts`

**Test coverage includes:**

- `findMeaninglessContentNodes()` and `findStrongTrailingWhitespaceNodes()`, both exported and callable independent of the CLI
- Recursion into every content-bearing branch (`foot.content`, subtitles, headings), not just the top level, which is the shape both checks exist to catch

`main()` also calls `findCrossChapterLinks()` and `auditVersion()` (from `auditNodes.ts`) directly, one call per version being validated. A change to either audit's exported function signature or return shape is a `validate.ts` change too, even though no test in `validate.test.ts` exercises that wiring directly (it's covered end-to-end by running `npm run validate` itself). Re-run the cross-chapter link and Strong's-node suites alongside this one when touching that boundary.

### When Modifying the Strong's-Node Audit (auditNodes.ts)

**Relevant tests:** `npx vitest --run utils/__tests__/auditNodes.test.ts`

**Test coverage includes:** see [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for the full rule set. This tool has no `--fix` path. It's read-only, so there's no write-back behavior to regression-test, only detection correctness across all seven findings. `isClean()` and `printFindingLines()` are exported alongside the audit functions specifically so `validate.ts` can reuse them rather than re-deriving the same clean/dirty check and report formatting.

### When Modifying Footnote Text Extraction (footnoteText.js)

**Relevant tests:** `npx vitest --run web/public/js/__tests__/footnoteText.test.ts`

**Test coverage includes:**

- Every `foot.content` shape: plain string, mixed array, `{bibleLink, content?}`, `{text}`
- Real-world reproduction cases for a footnote-flattening bug (Psalm 111:10, Matthew 5:3 in WEBUS2020)

This is a plain, unbundled `.js` file loaded as a `window` global in `index.html` before `ContentNode.js`. A change here should also be spot-checked in the browser, not just via its own test suite, since load order and global-namespace collisions aren't something Vitest can catch.

### When Modifying the USFM Import Pipeline (`utils/importUsfm.ts` / `utils/usfm/*.ts`)

**Relevant tests:** `npx vitest run utils/__tests__/importUsfm.test.ts utils/usfm`, but see the coverage note above first. Right now this only fully exercises `blockStructure.ts`, `footnoteTypeRules.ts`, `fractions.ts`, `inlineMarks.ts`, `paragraphNoise.ts`, and `references.ts`; the other modules' tests won't even load until the local `imports/_lib/splitScriptRuns` dependency and the WEBUS2020 USFM fixture are restored.

**Test coverage includes (where it loads):**

- Token-stream lexing and paired/unpaired marker interleaving
- Footnote classification by construct, in priority order (citation-only, strong witness signal, translation marker, weaker language-comparison witness signal, then study as fallback)
- Fraction notation normalization
- The shared Strong's-run/joining-space builder
- Whole-book paragraph-noise suppression
- Cross-reference resolution, including embedded references with no `\x` marker

`overhaulFootnotes.ts` shares `footnoteTypeRules.ts`'s `classifyFootnote()` with the importer, and additionally owns the rule that a recomputed `stu` never overwrites a stored non-`stu` type. A change to either the classifier's priority/constructs or that never-downgrade rule affects both entry points and should be tested against `utils/__tests__/overhaulFootnotes.test.ts` as well as `utils/usfm/__tests__/footnoteTypeRules.test.ts`.

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
- Target strings in `crossChapterLinks.test.ts` are drawn from this repo's own six versions wherever a real example exists, and marked as grammar illustrations in the small number of cases where no such target currently exists in the corpus
- Real, hand-crafted `.usfm` fixture files in `utils/usfm/__tests__/fixtures/*.usfm` (acrostic psalms, deuterocanon front matter, chapter-boundary edge cases, embedded references, and more), shared across the USFM pipeline's spec files via `utils/usfm/__tests__/fixtures.ts`
