# Tests and Build Instructions

## Test Frameworks and Locations

### Test Framework

- **Vitest** – Modern test runner configured via `npm run test` (executes `vitest --run`)
- **Configuration** – No `vitest.config.ts` file present; uses default configuration

### Test Locations

- **Test directories** – Tests are in `__tests__/` folders alongside source files:
  - `functions/__tests__/*.test.ts` (10 files): schema, small-caps conversion, version discovery, key sorting, atomic writes, and the shared text-normalization helpers (`normalizeFractions.test.ts`, `normalizeEllipses.test.ts`, `mapContentText.test.ts`, `tagScriptRunsInContent.test.ts`, `mergeEquivalentSiblingsInContent.test.ts`) both `validate.ts` and the USFM importer call into
  - `utils/__tests__/*.test.ts` (12 files): export, cross-chapter links, validation, the Strong's-node audit, USFM import, footnote re-classification, and six of the eight node-placement auto-fixers' own suites (`fixUnmergedNodes.test.ts`, `fixHeadingParagraphs.test.ts`, `fixFootnotePunctuationOrder.test.ts`, `fixMarkBoundaryEmbeddedSpaces.test.ts`, `fixFootnoteMarkerSpacing.test.ts`, `fixDuplicateFootnoteAnchors.test.ts`)
  - `utils/usfm/__tests__/*.test.ts` (15 files: tokenizer, per-construct builders, and USFM-convention regression specs for the import pipeline)
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

- **Existing tests** – `utils/__tests__/exportContent.test.ts` (115 tests)
- **Covered scenarios:**
  - Plain text conversion with Strong's numbers and morphology
  - Markdown conversion with paragraph markers, footnotes, line breaks
  - Heading and subtitle rendering
  - Standard vs. acrostic heading rendering: triple-bracket marker in text, one-heading-level-smaller in markdown, across both the generic dispatch and the chapter/verse-leading special cases
  - Footnote marker placement and ordering, including a second footnote on the same word (textless-sibling shape) landing its marker before the Strong's number, matching the first footnote's position
  - Small caps rendering in text and markdown exports
  - Bold/italic rendering: markdown-only wrapping, and the shared-delimiter-span merge across adjacent same-marked siblings (regression coverage for the `**word****word**` bug)
  - Synthetic space insertion between an unseparated Strong's/morph/lemma tag and the word that follows
  - Markdown escaping of a literal `_`/`*` in content text (BYZ2018 Beta-code apparatus sigla), never applied to a delimiter the renderer emits itself; the text export escapes nothing
  - A leading subtitle rendering above the verse line, mirroring the existing leading-heading hoist, across every leading-run shape the corpus carries
  - Edge cases: mid-verse paragraphs, textless elements, trailing footnotes
  - Real-world verse tests from KJV1769 and BYZ2018

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

### Shared Content-Normalization Helpers Domain

- **Existing tests** – `functions/__tests__/normalizeFractions.test.ts` (24), `functions/__tests__/normalizeEllipses.test.ts` (19), `functions/__tests__/mapContentText.test.ts` (14), `functions/__tests__/tagScriptRunsInContent.test.ts` (19), `functions/__tests__/mergeEquivalentSiblingsInContent.test.ts` (18)
- **Covered scenarios:**
  - Fraction normalization across raw ASCII `N/M`, precomposed vulgar-fraction glyphs, and digits already split by U+2044 but not yet raised/lowered — the one function both `validate.ts`'s auto-fix pass and the USFM importer call
  - Ellipsis normalization to U+2026, including the deliberate standing exception (a bare two-period run is reported but never auto-rewritten)
  - `mapContentText()`: the shared tree-walk both normalizers use to rewrite every text-bearing node's own text without duplicating recursion logic per rule
  - Script-run tagging: splitting a node's own text at a Hebrew or Greek letter run embedded in otherwise-Latin prose into alternating plain-text and `{text, script}` nodes; declining and reporting when the node also carries `strong`, `foot`, `marks`, or anything beyond bare text
  - Equivalent-sibling merging: normalizing a `{text}`-only object to a bare string, then folding a maximal run of adjacent siblings agreeing in `marks`/`script` into one node; a node carrying `strong`, `foot`, `bibleLink`, nested `content`, `paragraph`, or `break` is never eligible on either side

### Cross-Chapter Link and bibleLink Target Domain

- **Existing tests** – `utils/__tests__/crossChapterLinks.test.ts` (89 tests)
- **Covered scenarios:**
  - Target-shape classification: `singleChapter`, `crossChapterRange`, `wholeChapterRange`, `mergedTarget`, `unparsed`. `wholeChapterRange` is a finding, split alongside `crossChapterRange`, not an out-of-scope shape
  - Dash-agnostic detection: en dash, em dash, and ASCII hyphen all recognized as the same range separator; splitting always emits an en dash
  - Per-version chapter-length lookups (e.g. Ezra 4's last verse from ASV1901's own records) and per-version canon-scoped book resolution
  - Splitting a cross-chapter range into two chapter-scoped links, byte-for-byte display preservation, and idempotency on a second pass; a whole-chapter range splits the same way but with no verse anchor on either half (real YLT1898 fixtures, e.g. `"Romans 1–11"`)
  - Truncated-range reconstruction: completing a target cut off short of the multi-verse range its own display text already names, declining a display spanning two chapters and leaving that case to the cross-chapter split
  - Unresolvable-target judgment (`findUnresolvableTarget`/`findUnresolvableTargets`): a target resolving cleanly returns `null`; an unresolvable one names `book-not-in-canon`, `chapter-not-carried`, or `verse-not-carried`, checked chapter before verse so a real gap in the middle of a chapter (not just past its highest verse) is caught; a range is checked `from` before `to`, one finding even when both ends fail
  - Unresolvable-target unlinking: substituting exactly the node's own `content ?? bibleLink` in its place, rendering-neutral by construction; an `"unparsed"` or `"mergedTarget"` shape, and an override present but rendering no visible text, are both excluded from ever being judged or unlinked
  - Corpus-wide sweep across all versions and the `scanned` count as a guard against a walk that silently stops descending
  - Read-only guarantee for every finder — auditing twice produces byte-identical results
  - Real fixtures drawn from this repo's own corpus wherever a real occurrence exists, including WEBUS2020's real em-dash and `"Deuteronomy 32:43 LXX"` siglum cases

### Validation Domain

- **Existing tests** – `utils/__tests__/validate.test.ts`
- **Covered scenarios:**
  - `findMeaninglessContentNodes()`: formatting (`marks`/`script`) with no `text`, and an empty `""` husk riding alongside other properties, flagged; `foot`/`strong`/`morph`/`lemma`/`bibleLink`/bare `paragraph`/`break` left alone; descends into `foot.content`, subtitles, and headings, not just the top level
  - `findStrongTrailingWhitespaceNodes()`: a `strong`-carrying node's own `text` ending in whitespace
  - `main()` gated behind `require.main === module`, so importing the module for its exported functions doesn't trigger a full validation run
  - The full auto-fix pass, in pass order, and the fixed-point re-application check that fails by name — file, verse, step — if a second pass would still find something to change
  - `main()` also runs the report-only audits (declared chapter counts, cross-chapter links, truncated ranges, Strong's-node placement, unresolvable `bibleLink` targets) for each version it validates, as peers that all run to completion regardless of one another's outcome. See [validation.md](../4-domains/validation.md), [cross-chapter-links.md](../4-domains/cross-chapter-links.md), and [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for what each one checks

### Strong's-Node Audit Domain

- **Existing tests** – `utils/__tests__/auditNodes.test.ts` (the largest test suite in the repo)
- **Covered scenarios:** see [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for the domain narrative: every finding's positive/negative cases, `agreesInFormatting` mark/script agreement, textless-Strong's-sibling skip-through (both directions), `break`/`paragraph` boundary guards, verse-initial-space detection scoped to a verse's own outermost content, the flat corpus-wide heading/subtitle-paragraph convention, fraction/ellipsis normalization reuse, the footnote-marker-after-whitespace render-order judgment, mixed-script-run detection, duplicate-footnote-anchor detection tight enough to spare the far more common two-real-occurrences shape, mergeable-sibling detection, and `exitCodeFor()`/`isClean()` across every check combined

### Node-Placement Auto-Fix Domain

- **Existing tests** – `utils/__tests__/fixUnmergedNodes.test.ts` (5), `fixHeadingParagraphs.test.ts` (4), `fixFootnotePunctuationOrder.test.ts` (5), `fixMarkBoundaryEmbeddedSpaces.test.ts` (5), `fixFootnoteMarkerSpacing.test.ts` (23), `fixDuplicateFootnoteAnchors.test.ts` (8)
- **Covered scenarios:** each fixer reuses `auditNodes.ts`'s own eligibility judgment (`canJoinForward`, `findHeadingParagraphMismatches`, `leadingTightPunctuationSplit`/`isRealAttachmentPoint`, `carriesFormatting`/`agreesInFormatting`, `findWhitespaceSourceIndex`, `isDuplicateFootnoteAnchor`) rather than re-deriving it, so these suites are largely regression coverage confirming the fix direction matches the audit's own judgment. `fixFootnoteMarkerSpacing.test.ts` is the largest of the six because the footnote-marker-spacing check asks a render-order question (accumulated visible text, not just the node's own trailing character) with several declining conditions to cover: no real next node, a `break`/`paragraph` boundary at the join, the next node already starting with whitespace, or a `marks`/`script` disagreement. None of these six files has a CLI or `--fix` flag of its own — `validate.ts` calls each transform unconditionally as one step in its own auto-fix pass. The other two self-repairing checks (script-run tagging and sibling merge) are tested under `functions/__tests__/` — see the Shared Content-Normalization Helpers Domain above

### USFM Import Pipeline Domain

- **Existing tests** – 17 files: `utils/__tests__/importUsfm.test.ts`, `utils/__tests__/overhaulFootnotes.test.ts`, and 15 files under `utils/usfm/__tests__/`
- **Current status: all 17 files load and pass in this checkout.** `npx vitest run` reports 38 of 38 test files and 1,265 of 1,265 tests passing repo-wide. This checkout carries the WEBUS2020 raw USFM corpus at the gitignored `imports/webus2020/ebible-usfm/`, and `utils/usfm/headings.ts`, `footnotes.ts`, and `verify.ts` import their Hebrew/Greek run-splitting helper from the tracked `utils/usfm/splitScriptRuns.ts`, not any gitignored path. See [usfm-import.md](../4-domains/usfm-import.md#key-business-rules) for detail.
- **One dependency stays gitignored, not committed.** Because `imports/webus2020/ebible-usfm/` isn't tracked, a checkout without it would still fail whichever specs read it directly: `utils/usfm/__tests__/metadata.test.ts`, `footnotes.test.ts`, `verify.test.ts`, `bMarkerUpstreamConvention.test.ts`, `bibleLinkTargetConventions.test.ts`, `chapterBoundaryUpstreamConvention.test.ts`, and `embeddedReferenceConventions.test.ts` (the last four via `upstreamHeadConvention.ts`'s `usfmFilesByRegistryId()`/`SOURCE_DIR`). The rest — `tokenize.test.ts`, `blockStructure.test.ts`, `footnoteTypeRules.test.ts`, `headings.test.ts`, `inlineMarks.test.ts`, `paragraphNoise.test.ts`, `references.test.ts`, `segmentVerses.test.ts`, `importUsfm.test.ts`, and `overhaulFootnotes.test.ts` — never touch that corpus and pass regardless of whether it's present.
- **Covered scenarios:**
  - Lexing raw USFM into a flat token stream, including paired vs. unpaired marker interleaving (`tokenize.ts`)
  - Footnote type classification by construct (citation-only, names a witness in prose or via symbolic apparatus notation, opens with a translation marker, compares languages across a semicolon) rather than by memorized phrases, plus the never-downgrade-to-`stu` rule and its `--hard-reset` counterpart (`footnoteTypeRules.ts`, `overhaulFootnotes.ts`)
  - The shared Strong's-run/joining-space builder used by both verse content and footnote bodies (`inlineMarks.ts`)
  - The whole-book paragraph-noise suppression pass (`paragraphNoise.ts`)
  - Cross-reference resolution against the book registry, including embedded (unmarked) references in footnote prose (`references.ts`)
  - Retroactive footnote re-classification against content already on disk, including `--fix` write-back (`overhaulFootnotes.ts`)
  - The full import CLI, acrostic heading detection, footnote assembly, chapter-boundary and stanza-break handling, embedded/bracketed reference conventions, book-metadata extraction, and the independent `verify.ts` cross-check — all exercised now that the corpus is available
  - Fraction normalization is no longer tested here: it moved to the shared `functions/normalizeFractions.ts`, covered under the Shared Content-Normalization Helpers Domain above

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
# The one command that runs every normalization and validation rule this repo
# enforces: an auto-fix pass, a fixed-point re-check, hierarchical
# schema/structure checks, then report-only audits
# Exit code 0 = success, 1 = failure or a remaining report-only finding
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
```

There is no standalone audit or fixer CLI for cross-chapter links, `bibleLink` targets, or Strong's-node placement. `crossChapterLinks.ts` and `auditNodes.ts`, and every node-placement fixer under `utils/` and `functions/`, are library modules with no `main()` — `npm run validate` above is the only way any of that logic runs. See [validation.md](../4-domains/validation.md#one-entry-point).

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
- Markdown format: paragraph breaks, heading/subtitle rendering, footnote references, literal `_`/`*` escaping
- Heading `type`: acrostic vs. standard marker rendering in both formats
- Bold/italic (`b`/`i`) mark rendering, especially the shared-delimiter-span merge across adjacent same-marked siblings, which is the highest-risk regression surface in this file
- Edge cases: mid-verse paragraphs, textless elements, trailing footnotes

### When Modifying File Writes (writeJsonFile.ts)

**Relevant tests:** `npx vitest --run functions/__tests__/writeJsonFile.test.ts`

**Test coverage includes:**

- Byte-for-byte parity with the Prettier output every writer used to produce via subprocess
- Atomic replace semantics and multibyte handling
- Retry-on-backoff and failure-naming behavior when a write can never land

Any of the callers (`validate.ts`, `exportContent.ts`, `convertToSmallCaps.ts`, `sortBibleKeys.ts`, `importUsfm.ts`, `overhaulFootnotes.ts`) that changes how it invokes `writeJsonFile()`/`writeFileAtomic()` should re-run this suite plus its own.

### When Modifying Cross-Chapter Link or bibleLink Target Rules (crossChapterLinks.ts)

**Relevant tests:** `npx vitest --run utils/__tests__/crossChapterLinks.test.ts`

**Test coverage includes:**

- Target-shape classification and dash-agnostic detection
- Per-version chapter-length and book-canon resolution (never a shared table across versions)
- Split correctness for both `crossChapterRange` and `wholeChapterRange`, display-text preservation, and idempotency
- Truncated-range reconstruction and unresolvable-target judgment/unlinking
- Corpus-wide sweep counts

`crossChapterLinks.ts` has no CLI of its own — every function it exports (`fixCrossChapterLinks`, `findCrossChapterLinks`, `reconstructTruncatedRangesInContent`, `findTruncatedRanges`, `unlinkUnresolvableTargetsInContent`, `findUnresolvableTargets`) is called directly from `validate.ts`, one call per version being validated. Re-run `utils/__tests__/validate.test.ts` alongside this suite when changing any of their return shapes.

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
- The auto-fix pass's own step order and its fixed-point re-application check

`main()` also calls every exported function from `crossChapterLinks.ts` and `auditNodes.ts` (plus the eight node-placement fixers) directly, one call per version or per file. A change to any of their exported signatures or return shapes is a `validate.ts` change too, even though no test in `validate.test.ts` exercises that wiring directly (it's covered end-to-end by running `npm run validate` itself). Re-run the cross-chapter-link, Strong's-node-audit, and node-placement auto-fix suites alongside this one when touching that boundary.

### When Modifying the Strong's-Node Audit (auditNodes.ts)

**Relevant tests:** `npx vitest --run utils/__tests__/auditNodes.test.ts`

**Test coverage includes:** see [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for the full rule set. `auditNodes.ts` itself has no `--fix` path — it's read-only detection across every finding. `isClean()` and `printFindingLines()` are exported alongside the audit functions specifically so `validate.ts` can reuse them rather than re-deriving the same clean/dirty check and report formatting. Several checks each have a separate fixer file that imports this file's own eligibility functions rather than re-deriving them (the script-run check's fixer runs that dependency in the other direction — see [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for why); changing an eligibility function here should trigger a re-run of that check's own fixer suite too — see the Node-Placement Auto-Fix Domain above for which suite that is.

### When Modifying Footnote Text Extraction (footnoteText.js)

**Relevant tests:** `npx vitest --run web/public/js/__tests__/footnoteText.test.ts`

**Test coverage includes:**

- Every `foot.content` shape: plain string, mixed array, `{bibleLink, content?}`, `{text}`
- Real-world reproduction cases for a footnote-flattening bug (Psalm 111:10, Matthew 5:3 in WEBUS2020)

This is a plain, unbundled `.js` file loaded as a `window` global in `index.html` before `ContentNode.js`. A change here should also be spot-checked in the browser, not just via its own test suite, since load order and global-namespace collisions aren't something Vitest can catch.

### When Modifying the USFM Import Pipeline (`utils/importUsfm.ts` / `utils/usfm/*.ts`)

**Relevant tests:** `npx vitest run utils/__tests__/importUsfm.test.ts utils/usfm`, but see the coverage note above first if the WEBUS2020 raw USFM corpus isn't present in this checkout — several of the `utils/usfm/__tests__/` files read it directly and report a named skip instead of running without it.

**Test coverage includes:**

- Token-stream lexing and paired/unpaired marker interleaving
- Footnote classification by construct, in priority order (citation-only, strong witness signal — prose or symbolic apparatus notation, translation marker, weaker language-comparison witness signal, then study as fallback)
- The shared Strong's-run/joining-space builder
- Whole-book paragraph-noise suppression
- Cross-reference resolution, including embedded references with no `\x` marker

Fraction normalization is shared with `validate.ts` via `functions/normalizeFractions.ts` — test it under `functions/__tests__/normalizeFractions.test.ts`, not here. `overhaulFootnotes.ts` shares `footnoteTypeRules.ts`'s `classifyFootnote()` with the importer, and additionally owns the rule that a recomputed `stu` never overwrites a stored non-`stu` type. A change to either the classifier's priority/constructs or that never-downgrade rule affects both entry points and should be tested against `utils/__tests__/overhaulFootnotes.test.ts` as well as `utils/usfm/__tests__/footnoteTypeRules.test.ts`.

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
- Real-world samples from KJV1769 and BYZ2018 for integration-style tests
- Scratch directories via `fs.mkdtempSync(os.tmpdir())` in `writeJsonFile.test.ts`, torn down in `afterAll`; failure-path tests use Vitest fake timers to collapse the retry backoff instead of waiting on it
- Target strings in `crossChapterLinks.test.ts` are drawn from this repo's own versions wherever a real example exists, and marked as grammar illustrations in the small number of cases where no such target currently exists in the corpus
- Real, hand-crafted `.usfm` fixture files in `utils/usfm/__tests__/fixtures/*.usfm` (acrostic psalms, deuterocanon front matter, chapter-boundary edge cases, embedded references, and more), shared across the USFM pipeline's spec files via `utils/usfm/__tests__/fixtures.ts`
