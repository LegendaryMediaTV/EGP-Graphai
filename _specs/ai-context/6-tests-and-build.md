# Tests and Build Instructions

## Test Frameworks and Locations

### Test Framework

- **Vitest** – Modern test runner configured via `npm run test` (executes `vitest --run`)
- **Configuration** – No `vitest.config.ts` file present; uses default configuration
- **Suite size** – 43 test files, 1,571 tests, all passing. Every test reads only tracked files: a `.usfm` fixture, content this repo ships under `bible-versions/`, or a temp directory it writes itself. A fresh clone runs the whole suite with nothing beyond `npm install`, and nothing is skipped — the `fs.existsSync` guards and `describe.skip` placeholders that once stood in for specs needing a local raw-USFM corpus are gone

### Test Locations

- **Test directories** – Tests are in `__tests__/` folders alongside source files:
  - `functions/__tests__/*.test.ts` (12 files): schema, small-caps conversion, version discovery, key sorting, atomic writes, and the seven shared text-normalization helpers `validate.ts`'s auto-fix pass calls into (`normalizeFractions.test.ts`, `normalizeEllipses.test.ts`, `normalizeStraightQuotes.test.ts`, `normalizeGreekDiacritics.test.ts`, `mapContentText.test.ts`, `tagScriptRunsInContent.test.ts`, `mergeEquivalentSiblingsInContent.test.ts`), of which the USFM importer also uses `normalizeFractions.ts`
  - `utils/__tests__/*.test.ts` (14 files): export, cross-chapter links, validation, the Strong's-node audit, USFM import, footnote re-classification, embedded-reference re-linking, and seven of the nine node-placement auto-fixers' own suites (`fixUnmergedNodes.test.ts`, `fixHeadingParagraphs.test.ts`, `fixFootnotePunctuationOrder.test.ts`, `fixMarkBoundaryEmbeddedSpaces.test.ts`, `fixMarkBoundarySpaces.test.ts`, `fixFootnoteMarkerSpacing.test.ts`, `fixDuplicateFootnoteAnchors.test.ts`)
  - `utils/usfm/__tests__/*.test.ts` (16 files: tokenizer, per-construct builders, the Hebrew/Greek script-run splitter, and USFM-convention regression specs for the import pipeline)
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

- **Existing tests** – `functions/__tests__/getBibleVersions.test.ts` (17 tests)
- **Covered scenarios:**
  - Every case runs against a fixture directory (`functions/__tests__/fixtures/versions/`, plus small ones each `describe` writes and tears down itself), never the real shipped `bible-versions/` tree, so no assertion depends on which translations happen to be checked in
  - Version discovery from `_version.json` files
  - Alphabetical sorting by `_id`
  - Handling missing `_version.json` directories
  - Handling malformed JSON files gracefully
  - Custom directory path support
  - Single version retrieval by ID
  - Duplicate-name disambiguation: colliding `name` values get their `_id`'s trailing-year suffix appended; unique names untouched; a non-string `name` skipped from grouping; an unparseable trailing year logged rather than thrown
  - `getBibleVersion()`'s singular lookup deliberately does not disambiguate

### Content Processing / Export Domain

- **Existing tests** – `utils/__tests__/exportContent.test.ts` (175 tests)
- **Covered scenarios:**
  - Plain text conversion with Strong's numbers and morphology
  - Markdown conversion with paragraph markers, footnotes, line breaks
  - Heading and subtitle rendering
  - Standard vs. acrostic heading rendering: triple-bracket marker in text, one-heading-level-smaller in markdown, across both the generic dispatch and the chapter/verse-leading special cases
  - Footnote marker placement and ordering, including a second footnote on the same word (textless-sibling shape) landing its marker before the Strong's number, matching the first footnote's position
  - Small caps rendering in text and markdown exports
  - Abbreviation resolution through a version registry, markup and all, plus the bare-id fallback when the registry does not define it
  - Superscript rendering: a `<sup>` tag in markdown, inline in plain text, with whitespace kept outside the tag so neighbors do not fuse
  - A mark-bearing registry name sharing one emphasis span with the prose beside it, and the two guard cases (a bare-string name, an array name) staying opaque
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

- **Existing tests** – `functions/__tests__/normalizeFractions.test.ts` (24), `functions/__tests__/normalizeEllipses.test.ts` (19), `functions/__tests__/normalizeStraightQuotes.test.ts` (14), `functions/__tests__/normalizeGreekDiacritics.test.ts` (11), `functions/__tests__/mapContentText.test.ts` (14), `functions/__tests__/tagScriptRunsInContent.test.ts` (19), `functions/__tests__/mergeEquivalentSiblingsInContent.test.ts` (18)
- **Covered scenarios:**
  - Fraction normalization across raw ASCII `N/M`, precomposed vulgar-fraction glyphs, and digits already split by U+2044 but not yet raised/lowered — the one function both `validate.ts`'s auto-fix pass and the USFM importer call
  - Ellipsis normalization to U+2026, including the deliberate standing exception (a bare two-period run is reported but never auto-rewritten)
  - Straight-quote normalization: directing each `'`/`"` by what precedes it — start of string, whitespace, or an opening bracket opens, anything else closes, which makes a mid-word or possessive apostrophe U+2019 for free; a run of adjacent quote characters inheriting one direction rather than each character being judged alone; re-running the function on its own output changing nothing; `'80s` covered as the one known miss, where a leading elision opens instead of closing; and `normalizeQuotesInContent()` reaching `foot.content` through the same `mapContentText()` walk
  - Greek dialytika repair: composing a dialytika written after its accent, or left uncomposed, into the letter it belongs to, one base-plus-marks cluster at a time; the Greek ano teleia and question mark that a whole-string NFC pass would fold are left untouched
  - `mapContentText()`: the shared tree-walk all three normalizers above use to rewrite every text-bearing node's own text without duplicating recursion logic per rule
  - Script-run tagging: splitting a node's own text at a Hebrew or Greek letter run embedded in otherwise-Latin prose into alternating plain-text and `{text, script}` nodes; declining and reporting when the node also carries `strong`, `foot`, `marks`, or anything beyond bare text
  - Equivalent-sibling merging: normalizing a `{text}`-only object to a bare string, then folding a maximal run of adjacent siblings agreeing in `marks`/`script` into one node; a node carrying `strong`, `foot`, `bibleLink`, nested `content`, `paragraph`, or `break` is never eligible on either side

### Cross-Chapter Link and bibleLink Target Domain

- **Existing tests** – `utils/__tests__/crossChapterLinks.test.ts` (81 tests)
- **Covered scenarios:**
  - Every case runs against `FAKE_A`/`FAKE_B`, two synthetic version directories written to `os.tmpdir()` in `beforeAll` and removed in `afterAll` — real book ids, so name resolution still hits the real `bible-books.json` registry, but invented chapter/verse records. They reach the module through `readVersionBookFiles`'s absolute-path seam, so nothing else in the module had to change
  - Target-shape classification: `singleChapter`, `crossChapterRange`, `wholeChapterRange`, `mergedTarget`, `unparsed`. `wholeChapterRange` is a finding, split alongside `crossChapterRange`, not an out-of-scope shape
  - Dash-agnostic detection: en dash, em dash, and ASCII hyphen all recognized as the same range separator; splitting always emits an en dash
  - Per-version chapter lengths read from whichever version is asked — `FAKE_A`'s Romans 14 ends at 6 and `FAKE_B`'s at 9, same function, never a shared table — and per-version canon-scoped book resolution, where a book outside the version's canon comes back `null` rather than throwing
  - Splitting a cross-chapter range into two chapter-scoped links, display preservation through each half's own `content` override (dropped where the half's display already matches its target), and idempotency on a second pass; a whole-chapter range splits the same way but with no verse anchor on either half
  - The chapter-existence guard: a split naming a chapter the version does not carry throws by name rather than deriving a length from nothing — covered for both range shapes, at either end of the range
  - Truncated-range reconstruction: completing a target cut off short of the multi-verse range its own display text already names, declining a display spanning two chapters and leaving that case to the cross-chapter split, and the whole-chapter-equivalence gate that reads the version's own chapter length rather than assuming one
  - Unresolvable-target judgment (`findUnresolvableTarget`): a target resolving cleanly returns `null`; an unresolvable one names `chapter-not-carried` or `verse-not-carried`. A target whose book doesn't resolve within the version's own canon at all (`FAKE_B`'s own `"Genesis 1:1"`, an OT reference against an NT-only fake canon) also returns `null` — nothing left to judge, not a finding. `FAKE_A`'s Mark 9 deliberately omits verse 7 — a real gap mid-chapter, the same shape as ASV1901's Mark 9:44/46 variant case, distinct from a verse past the chapter's highest
  - Unresolvable-target unlinking: substituting exactly the node's own `content ?? bibleLink` in its place, rendering-neutral by construction, recursing into `foot.content`; an `"unparsed"` or `"mergedTarget"` shape, and an override present but rendering no visible text, are all excluded from ever being judged or unlinked
  - `formatCrossChapterFinding`/`formatTruncatedRangeFinding`/`formatUnresolvableTargetFinding`'s one-line report strings, including the rule that a decline reason never names a command to run
  - Target strings stay real in shape even where the version data behind them is synthetic — WEBUS2020's real em-dash `"2 Kings 6:5—7:3"` and the `"Deuteronomy 32:43 LXX"` siglum case both appear verbatim
  - The version-walking entry points `validate.ts` actually calls (`fixCrossChapterLinks`, `findCrossChapterLinks`, `findTruncatedRanges`, `findUnresolvableTargets`) have no suite of their own — each test targets the per-target or per-content function one of them delegates to

### Validation Domain

- **Existing tests** – `utils/__tests__/validate.test.ts` (75 tests)
- **Covered scenarios:**
  - `collectJsonFiles()`'s scoping — every version-scoped path belongs to the requested version and no other, and the shared root-level/registry files come along regardless of scope — measured against two throwaway version directories written to `os.tmpdir()` and passed as the optional `versionsRoot`, so the assertions don't move when a translation is added to or removed from `bible-versions/`
  - `findMeaninglessContentNodes()`: formatting (`marks`/`script`) with no `text`, and an empty `""` husk riding alongside other properties, flagged; `foot`/`strong`/`morph`/`lemma`/`bibleLink`/bare `paragraph`/`break` left alone; descends into `foot.content`, subtitles, and headings, not just the top level
  - `findStrongTrailingWhitespaceNodes()`: a `strong`-carrying node's own `text` ending in whitespace
  - `main()` gated behind `require.main === module`, so importing the module for its exported functions doesn't trigger a full validation run
  - The full auto-fix pass, in pass order, and the fixed-point re-application check that fails by name — file, verse, step — if a second pass would still find something to change
  - `main()` also runs the report-only audits (declared chapter counts, cross-chapter links, truncated ranges, Strong's-node placement, unresolvable `bibleLink` targets) for each version it validates, as peers that all run to completion regardless of one another's outcome. See [validation.md](../4-domains/validation.md), [cross-chapter-links.md](../4-domains/cross-chapter-links.md), and [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for what each one checks

### Strong's-Node Audit Domain

- **Existing tests** – `utils/__tests__/auditNodes.test.ts` (176 tests, the largest suite outside the USFM import pipeline)
- **Covered scenarios:** see [strongs-node-audit.md](../4-domains/strongs-node-audit.md) for the domain narrative: every finding's positive/negative cases, `agreesInFormatting` mark/script agreement, textless-Strong's-and-textless-foot-sibling skip-through (both directions), the mark-boundary-space check's exact-vs-subset match and its smaller-mark-set direction (including the backward case and the blocked-both-directions exemption), `break`/`paragraph` boundary guards, verse-initial-space detection scoped to a verse's own outermost content, the flat heading/subtitle-paragraph convention, fraction/ellipsis normalization reuse, the footnote-marker-after-whitespace render-order judgment, mixed-script-run detection, duplicate-footnote-anchor detection tight enough to spare the far more common two-real-occurrences shape, mergeable-sibling detection, and `exitCodeFor()`/`isClean()` across every check combined. Every fixture is in-memory `Content`: the file no longer imports `auditVersion`/`auditVersions` at all, and the read-only guarantee now comes from calling `findStrongsNodeIssues()` twice on the same content rather than from walking `bible-versions/` twice

### Node-Placement Auto-Fix Domain

- **Existing tests** – `utils/__tests__/fixUnmergedNodes.test.ts` (5), `fixHeadingParagraphs.test.ts` (4), `fixFootnotePunctuationOrder.test.ts` (7), `fixMarkBoundaryEmbeddedSpaces.test.ts` (10), `fixMarkBoundarySpaces.test.ts` (13), `fixFootnoteMarkerSpacing.test.ts` (25), `fixDuplicateFootnoteAnchors.test.ts` (8)
- **Covered scenarios:** each fixer reuses `auditNodes.ts`'s own eligibility judgment (`canJoinForward`, `findHeadingParagraphMismatches`, `leadingTightPunctuationSplit`/`isRealAttachmentPoint`, `carriesFormatting`/`agreesInFormatting`, `findWhitespaceSourceIndex`, `isDuplicateFootnoteAnchor`, `isFormattingSubsetOf`) rather than re-deriving it, so these suites are largely regression coverage confirming the fix direction matches the audit's own judgment. `fixFootnoteMarkerSpacing.test.ts` is the largest of the seven because the footnote-marker-spacing check asks a render-order question (accumulated visible text, not just the node's own trailing character) with several declining conditions to cover: no real next node, a `break`/`paragraph` boundary at the join, the next node already starting with whitespace, or a `marks`/`script` disagreement. `fixMarkBoundarySpaces.test.ts` covers the exact-match forward case, the subset-match direction that can go either way depending on which side is smaller, and the blocked-direction case where an already-correctly-tagged blank is left untouched. None of these seven files has a CLI or `--fix` flag of its own — `validate.ts` calls each transform unconditionally as one step in its own auto-fix pass. The other two self-repairing checks (script-run tagging and sibling merge) are tested under `functions/__tests__/` — see the Shared Content-Normalization Helpers Domain above

### USFM Import Pipeline Domain

- **Existing tests** – 19 files: `utils/__tests__/importUsfm.test.ts` (19), `utils/__tests__/overhaulFootnotes.test.ts` (22), `utils/__tests__/overhaulReferences.test.ts` (20), and 16 under `utils/usfm/__tests__/`: `footnoteTypeRules.test.ts` (231, the largest test file in the repo), `segmentVerses.test.ts` (141), `verify.test.ts` (77), `footnotes.test.ts` (55), `references.test.ts` (69), `inlineMarks.test.ts` (28), `headings.test.ts` (30), `blockStructure.test.ts` (14), `embeddedReferenceConventions.test.ts` (12), `metadata.test.ts` (10), `tokenize.test.ts` (10), `paragraphNoise.test.ts` (7), `splitScriptRuns.test.ts` (2), `bMarkerUpstreamConvention.test.ts` (1), `bibleLinkTargetConventions.test.ts` (1), `chapterBoundaryUpstreamConvention.test.ts` (1)
- **No local setup.** All 19 run in a fresh clone. Every spec drives a production function directly against either a tracked `.usfm` fixture read through `readFixture()` or a raw-USFM string copied verbatim from the source, and `utils/usfm/headings.ts`, `footnotes.ts`, and `verify.ts` import their Hebrew/Greek run-splitting helper from the tracked `utils/usfm/splitScriptRuns.ts`, which now has its own dedicated suite covering the Hebrew presentation-form range a shipped acrostic heading needed. See [usfm-import.md](../4-domains/usfm-import.md#key-business-rules) for detail.
- **`footnoteTypeRules.test.ts` grew from 132 to 231 tests, and `headings.test.ts` doubled from 15 to 30.** The footnote-classifier growth covers a registry-driven book-name slot (recognizing a spelled-out, multi-word, or long book name in a citation instead of only a one-word abbreviation) and a guard against reading a printed-edition or manuscript siglon standing where a book name would go (`WH 76` is the number 276, not chapter 76 of an invented book). The headings growth covers acrostic letter names in the several spellings different shipped and non-shipped editions use for the same Hebrew letter, combined two-letter stanza headings joined in any of several real styles, and Psalter book-division headings recognized by their printed "BOOK n" text on any of the `\ms`/`\ms1`/`\ms2`/`\ms3` markers rather than assumed onto `\ms1` alone.
- **The four convention specs pin named examples, not corpus totals.** All four used to sweep WEBUS2020's raw source and assert aggregate counts; each now checks the construct against real, named occurrences instead:
  - `bMarkerUpstreamConvention.test.ts` — the `\b` stanza-break fix's two-part convention (no `break` on the line before, `paragraph` on the line after) at Ezra 4:16→17's real `\b \p \v 17` shape, from `ezra-4-16-17-b-p.usfm`, with `upstreamMatchesRule`/`fixedOutputMatchesRule` comparing `segmentVerses()`'s output against WEBUS2020's own committed content for those two verses, inlined as a literal. The 66-book sweep and its nine named edition-drift exceptions are gone; none was safe to freeze into a fixture, Judges 5:11 least of all — the drift it names is still moving
  - `chapterBoundaryUpstreamConvention.test.ts` — Psalm 33:22→34:1 from `psalm-33-22-34-1-textless-footnote-node.usfm`, the one named exception where a textless footnote-anchored node reads as a heading to `upstreamMatchesRule`'s heuristic and so reports a mismatch, while `segmentVerses()` itself still produces the right paragraph start. The bare-`\qN` case it also used to count is already covered in detail by `segmentVerses.test.ts`
  - `bibleLinkTargetConventions.test.ts` — Findings 8b (a Psalms cross-reference targets the canonical singular "Psalm") and 8c (a verse list inside a target gets the space its own comma is missing), by calling `buildCrossReferenceContent()` on Matthew 4:6's and Matthew 5:4's real `\xt` spans
  - `embeddedReferenceConventions.test.ts` — a fully-qualified reference sitting inside ordinary footnote prose becomes a `bibleLink` on the strength of naming its own book, with no `\x` marker and no "See "/"Compare " cue word required. Each case passes a verbatim footnote body to `buildFootnoteContent()`: positives (Matthew 27:35's "and"-joined pair, Proverbs 31:10-31's self-referential acrostic note, Mark 16:9-20, John 8:11's dash-joined pair, Daniel-Greek 3:24, 1 Esdras's three body-initial references). A named-book chapter-only mention now links too, reversing this scanner's own earlier verse-mandatory rule: Genesis 3:24's real "See Ezekiel 10." links the whole chapter, as do the three "Psalm NN is an acrostic poem" notes and the chapter-only "Luke 22" prefix of Esther-Greek 8:13's own malformed "Luke 22. 25." (leaving the malformed ". 25." as ordinary trailing text rather than guessing it into a verse the source never named)
- **`footnotes.test.ts`, `metadata.test.ts`, and `verify.test.ts` lost their corpus reads too.** `footnotes.test.ts` dropped its corpus-wide `capitalizeFootnoteOpening()` collision check, which ran every real `\f` body through the rewriter and asserted the resulting counts, leaving the named per-construct fixtures. `metadata.test.ts` reads `genesis-front-matter-and-chapter-markers.usfm` for the `_id`/name/title/`chapters: 50` extraction, and checks the 17 known USFM/registry mismatches against `resolveBookId`'s own table rather than re-deriving them from ASV1901's and MSB2025's raw `\id` lines. `verify.test.ts` now unit-tests the independent counters and extractors (`countMarkersIn`, `countBlockMarkersIn`, `countEmittedBlockFlags`, `countStrongAttributeNodes`, `extractCrossReferencesIn`, `extractFootnoteBodiesIn`, `extractSectionHeadingsIn`, `extractIntroParagraphsIn`, and the rest) against fixtures and small literals, checks marker-inventory bucket membership (`CONTENT_HANDLED_MARKER_NAMES`/`CHROME_MARKER_NAMES`/`CONFIRMED_ZERO_MARKER_NAMES`, including `\qc` for ASV1901's Psalm 119 acrostic headings), and pins a handful of `classifyFootnote`/`buildReferenceOnlyContent` regressions against real quoted bodies (a trailing `LXX` siglon, a `"See "` lead-in, the `Literally,`/`also mean`/`word rendered`/`Hebrew,` translation constructs). No whole-corpus totals, no cross-corpus classifier-disagreement measurements
- **`importUsfm.test.ts`** copies `genesis-1-2.usfm` into its own temp directory rather than pointing `runImport()` at the shared fixtures directory, so a future fixture carrying a second `\id GEN` line cannot silently swap the source under it — `usfmFilesByRegistryId` resolves a book to whichever file names it last, with no error when two do, and that has already happened once. Preview mode still reads the real shipped WEBUS2020 `_version.json` read-only, and `execSync` is mocked at the regeneration boundary so no test can fire a real `npm run validate`
- **Covered scenarios:**
  - Lexing raw USFM into a flat token stream, including paired vs. unpaired marker interleaving (`tokenize.ts`)
  - Footnote type classification by construct (citation-only, names a witness in prose or via symbolic apparatus notation, opens with a translation marker, compares languages across a semicolon) rather than by memorized phrases, plus the never-downgrade-to-`stu` rule and its `--hard-reset` counterpart (`footnoteTypeRules.ts`, `overhaulFootnotes.ts`)
  - The shared Strong's-run/joining-space builder used by both verse content and footnote bodies (`inlineMarks.ts`)
  - The whole-book paragraph-noise suppression pass (`paragraphNoise.ts`)
  - Cross-reference resolution against the book registry, including embedded (unmarked) references in footnote prose (`references.ts`)
  - Retroactive footnote re-classification against content already on disk, including `--fix` write-back (`overhaulFootnotes.ts`)
  - The import CLI's own seams (`ImportOptions.outputDir` redirecting every read and write away from `bible-versions/`, and the downstream-regeneration guard that must never fire when it diverges), acrostic heading detection, footnote assembly, chapter-boundary and stanza-break handling, embedded/bracketed reference conventions, book-metadata extraction, and the independent `verify.ts` cross-check
  - Fraction normalization is no longer tested here: it moved to the shared `functions/normalizeFractions.ts`, covered under the Shared Content-Normalization Helpers Domain above

### Web Reader Domain

- **Existing tests** – `web/public/js/__tests__/footnoteText.test.ts` (10 tests) for `getFootnoteText()`; none yet for React components or the HTTP server
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

### Type Checking

```bash
npm run type-check
# npx tsc --noEmit — surfaces type errors with no build output; Vitest and
# ts-node both type-check the files they touch as they run, but this is the
# one command that checks the whole tree at once, including files nothing
# currently imports or tests
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

Everything here runs against synthetic version directories in `os.tmpdir()`, reached through `readVersionBookFiles`'s absolute-path seam. Adding a case usually means adding a book to `writeFixtureVersion`'s own map, not finding a real translation that happens to carry the shape.

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
- `collectJsonFiles()`'s scoping, against temp version directories passed as its optional `versionsRoot` — that parameter exists for this test and defaults to the real `bible-versions/`, so production callers pass one argument as before

`main()` also calls every exported function from `crossChapterLinks.ts` and `auditNodes.ts` (plus the nine node-placement fixers) directly, one call per version or per file. A change to any of their exported signatures or return shapes is a `validate.ts` change too, even though no test in `validate.test.ts` exercises that wiring directly (it's covered end-to-end by running `npm run validate` itself). Re-run the cross-chapter-link, Strong's-node-audit, and node-placement auto-fix suites alongside this one when touching that boundary.

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

**Relevant tests:** `npx vitest run utils/__tests__/importUsfm.test.ts utils/usfm` — all 19 files run anywhere the repo is checked out; none needs a local raw-USFM corpus.

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
- Synthetic input directories in place of the real corpus, wherever a module's real input is a folder it reads off disk: `crossChapterLinks.test.ts`'s `FAKE_A`/`FAKE_B` version directories (real book ids, so name resolution still hits the real `bible-books.json`, but invented chapter/verse records), `validate.test.ts`'s two-version `versionsRoot`, `getBibleVersions.test.ts`'s fixture directories, and `importUsfm.test.ts`'s single-book `.usfm` source copy. Two seams in production code make the first two possible — `readVersionBookFiles` treats an absolute `versionId` as a directory to read directly, and `collectJsonFiles` takes an optional `versionsRoot` — both defaulting to `bible-versions/`, so no production caller changed. A test written this way keeps passing when a translation is added, removed, or re-imported
- Target strings in `crossChapterLinks.test.ts` keep the shape real translations actually write, even where the version data behind them is synthetic, and are marked as grammar illustrations in the small number of cases where no such target exists in the corpus
- Real, verbatim `.usfm` fixture files in `utils/usfm/__tests__/fixtures/*.usfm` — each a byte-exact line-range extract from a raw source, never hand-typed, since an invented fixture would test the parser against a cleaner grammar than real USFM uses. A sampling: acrostic psalms, deuterocanon front matter, chapter-boundary edge cases, embedded references, a book's whole front matter and chapter markers (`genesis-front-matter-and-chapter-markers.usfm`), a `\b \p` stanza-break boundary (`ezra-4-16-17-b-p.usfm`), and a textless footnote-anchored chapter start (`psalm-33-22-34-1-textless-footnote-node.usfm`). Shared across the USFM pipeline's spec files via `readFixture()` in `utils/usfm/__tests__/fixtures.ts`
