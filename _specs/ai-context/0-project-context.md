# EGP Graphai - Project Context

> **Updated:** August 23, 2026  
> **Repository:** [LegendaryMediaTV/EGP-Graphai](https://github.com/LegendaryMediaTV/EGP-Graphai)

## Project Summary

EGP Graphai (γραφαὶ – "writings" or "scriptures" in Koine Greek) is a comprehensive JSON standard for Bible resources with structured data, rich metadata including Strong's numbers, morphological codes, lexical lemmas, and conversion tools for text and markdown formats.

### Key Capabilities

- **Multi-Version Support** – Stores and serves multiple Bible translations (ASV, KJV, WEB, BYZ Greek, YLT, CLV)
- **Rich Annotations** – Strong's numbers, morphological parsing, lexical lemmas per word
- **Flexible Content Model** – Recursive structure supporting paragraphs, headings, subtitles, footnotes
- **Export Formats** – Text with Strong's annotations, paragraph-formatted Markdown, with bold/italic rendering
- **Web Reader** – React-based SPA for reading and studying with toggleable tools
- **Validation** – JSON Schema validation ensuring data integrity, automatic key sorting, and structural sanity checks (meaningless nodes, trailing whitespace); also runs the two audits below for each version it validates
- **Cross-Chapter Link Audit** – Detects and fixes `bibleLink` targets that span two chapters of the same book, whether both ends name a verse or only a chapter
- **Strong's-Node Placement Audit** – Read-only sweep for seven ways a node's text-flow placement can drift from this repo's own conventions
- **USFM Import** – Converts USFM translation source files directly into verse JSON (`utils/importUsfm.ts`, `utils/usfm/`), with an independent post-import checker (`usfm/verify.ts`) and a retroactive footnote re-classification tool (`overhaulFootnotes.ts`)

## Recent Changes (USFM Import Pipeline & WEBUS2020 Apocrypha)

- **New USFM → Graphai Import Pipeline** – `utils/importUsfm.ts` plus eleven supporting modules under `utils/usfm/` (`tokenize.ts`, `segmentVerses.ts`, `blockStructure.ts`, `headings.ts`, `footnotes.ts`, `footnoteTypeRules.ts`, `references.ts`, `inlineMarks.ts`, `fractions.ts`, `metadata.ts`, `paragraphNoise.ts`) convert USFM translation source into this repo's verse JSON. `segmentVerses.ts` is the pipeline's largest module: it's the only place that decides paragraph/stanza/chapter boundaries from the token stream `tokenize.ts` produces; everything else renders a span it's already identified
- **Independent Post-Import Verifier** – `utils/usfm/verify.ts` deliberately never imports `tokenize.ts` or `segmentVerses.ts`, re-deriving verse/chapter/footnote/marker counts straight from raw USFM so a shared bug can't cancel itself out between the importer and its own check. Standalone CLI, not part of `npm run validate`
- **Retroactive Footnote Re-Classification** – New `npm run overhaul-footnotes <version> [--fix]` (`utils/overhaulFootnotes.ts`) reruns footnotes already on disk through the same `classifyFootnote()` table the importer uses, for versions that predate this pipeline
- **A Real Import Regenerates Downstream via Subprocess** – After writing, `importUsfm.ts` shells out to `audit-links --fix` and `validate` as separate child processes rather than in-process calls, specifically because `crossChapterLinks.ts` caches its version index for the process lifetime
- **WEBUS2020 Apocrypha Added** – WEBUS2020 grew from 66 to 81 books: 15 deuterocanon books inserted at order 40–54, between Malachi (39) and Matthew (now 55), then the whole version was reimported through this pipeline. Only two book-registry entries (`PS2`, `DAG`) were new; the other 13 ids already existed in `bible-books.json`. `testament` still only distinguishes `"OT" | "NT"`; apocrypha is grouped under `"OT"`, not a new value
- **WEBUS2020 Imports Without Strong's Numbers** – `--no-strongs` is set for this translation specifically, after a quality review found its automatically assigned Strong's numbers unreliable across a large share of sampled words
- **Known Gap: Local Import Scaffolding Isn't Shipped** – `headings.ts`, `footnotes.ts`, and `verify.ts` import a Hebrew/Greek run-splitting helper from a gitignored `imports/_lib/` path, and one fixture test expects source USFM under an equally absent `imports/webus2020/` path. Neither exists in this checkout. Running `npx vitest run` reports 10 of 29 test files failing to load for this reason. See [6-tests-and-build.md](6-tests-and-build.md#usfm-import-pipeline-domain) for the exact list
- **Test Coverage** – 18 new test files (16 under `utils/usfm/__tests__/`, plus `importUsfm.test.ts` and `overhaulFootnotes.test.ts`); 8 of them load and pass today, the other 10 are blocked by the gap above. Total suite: 522 tests passing across 19 of 29 files
- See [4-domains/usfm-import.md](4-domains/usfm-import.md), [documentation/EGP-Graphai/usfm-import.md](../documentation/EGP-Graphai/usfm-import.md), and [4-domains/bible-books.md](4-domains/bible-books.md#core-entities) for full detail

## Previous Changes (Whole-Chapter Link Splitting, YLT1898 Node Bugfixes & Audit Tooling)

- **Whole-Chapter Ranges Now a Finding, Not Excluded** – `wholeChapterRange` (e.g. `"Romans 1–11"`) used to be classified separately and explicitly excluded from `findings` as out of scope. It's now split the same way as `crossChapterRange`, just with no verse anchor on either half. `splitCrossChapterLink()` branches on the classified shape to pick the right formula. `findCrossChapterLinks()` no longer returns a separate `wholeChapterRanges` count
- **Real YLT1898 Findings Fixed** – Nine outline references across Romans, 1–2 Corinthians, and Revelation's introductory footnotes (e.g. `"Romans 1–11"`) split into their chapter-scoped halves via `auditCrossChapterLinks.ts --fix`
- **YLT1898 Node Bugfixes** – A missing array wrapper on `marks` (`"marks": "sc"` instead of `["sc"]`) in five books' introductory footnotes, and four stray joining-space nodes that should have led the following word instead. Both are exactly the shapes `auditNodes.ts` and `validate.ts`'s content checks exist to catch
- **`auditStrongsNodes.ts` Renamed to `auditNodes.ts`** – npm script renamed `audit-strongs-nodes` → `audit-nodes` to match; `isClean()` and `printFindingLines()` are now exported for reuse
- **`validate.ts` Now Runs Both Corpus-Wide Audits** – For each version it validates, `main()` also calls `findCrossChapterLinks()` and `auditVersion()` (read-only, never `--fix`), reusing each module's own report formatting rather than duplicating it. The two run to completion regardless of each other's outcome, unlike the hierarchical schema-checking phases before them, so a version failing one still gets audited by the other in the same run
- **Test Coverage Expansion** – 5 new tests for the whole-chapter split behavior, bringing the suite to 320 tests across 11 files
- See [4-domains/cross-chapter-links.md](4-domains/cross-chapter-links.md), [4-domains/strongs-node-audit.md](4-domains/strongs-node-audit.md), and [4-domains/validation.md](4-domains/validation.md#key-business-rules) for full detail

## Previous Changes (Strong's-Node Audit & Export/Validation Fixes)

- **Strong's-Node Audit Tool** – New [utils/auditNodes.ts](../../utils/auditNodes.ts) sweeps every version for five drift patterns: unmerged connector/Strong's-node pairs, trailing whitespace on a `strong`-carrying node, leading punctuation glued to the wrong neighbor, a bare joining space stranded between two same-formatting nodes, and a verse whose own content opens with a space. Read-only. No `--fix` path; see [4-domains/strongs-node-audit.md](4-domains/strongs-node-audit.md)
- **`--verbose` Survives npm's Own Flag-Swallowing** – `npm run audit-nodes KJV1769 --verbose` (no `--` separator) never delivers a literal `--verbose` to the script; npm's own CLI parsing consumes it first. The tool also checks `process.env.npm_config_loglevel`, the one signal that invocation shape leaves behind, so verbose output still works as typed
- **Corpus Cleaned Up** – Every finding the new checks (and the pre-existing unmerged-pair/punctuation checks) surfaced across KJV1769 and WEBUS2020 was fixed. This restored the leading-space convention through the Words-of-Christ-heavy Gospels/Acts/Revelation text and removed 73 verse-initial spaces from WEBUS2020, all verified byte-for-byte text-preserving against the pre-fix corpus
- **Export: Bold/Italic Rendering Added** – `exportContent.ts` now wraps `b`/`i` marks in markdown (`**bold**`, `_italic_`; a no-op in the text export). Adjacent siblings sharing the same open marks share one delimiter pair instead of each emitting its own. This fixes broken markdown like `**word****word**` for a bold+italic quotation built word-by-word
- **Export: Two Rendering Fixes** – A word's second footnote (forced to ride as a textless sibling, since only one `foot` is allowed per node) now places its marker before the Strong's number, matching the first footnote's position; a Strong's/morph/lemma tag with nothing separating it from the following word now gets a synthetic space, fixing fused output like `H2822was`
- **Validation: Two New Structural Checks** – `findMeaninglessContentNodes()` (formatting with no text to apply it to, or an empty `""` husk) and `findStrongTrailingWhitespaceNodes()` (a `strong`-carrying node's own trailing-whitespace convention violation), both exported and independently testable
- **Web Reader: Shared Footnote-Text Extraction** – New `web/public/js/footnoteText.js` (`window.getFootnoteText`) replaces two slightly different inline flattening implementations in `ContentNode.js`. The leaf-content path previously silently dropped `bibleLink`-shaped footnote segments; both paths now share the same, more complete recursive logic. Footnote markers also now render before the verse-break instead of after
- **Bible Versions: Duplicate Display Names Disambiguated** – `getBibleVersions()` now appends each colliding version's own trailing-year suffix (parsed from `_id`) when two versions share an exact-match display `name`, so the picker never shows duplicates; the singular `getBibleVersion()` lookup deliberately does not do this
- **ASV1901 Overhaul & KJV1769 Bugfixes** – Data-only changes across several commits: ASV1901 re-imported corpus-wide, plus KJV1769 corrections for straight quotes, small caps, and spacing
- **Test Coverage Expansion** – 125 new tests, bringing the suite to 312 tests across 11 files (up from 187 across 8)
- See [4-domains/strongs-node-audit.md](4-domains/strongs-node-audit.md), [4-domains/export-system.md](4-domains/export-system.md#key-business-rules), [4-domains/validation.md](4-domains/validation.md#key-business-rules), [4-domains/web-reader.md](4-domains/web-reader.md#key-business-rules), and [4-domains/bible-versions.md](4-domains/bible-versions.md#key-business-rules) for full detail

## Previous Changes (Acrostic Heading Node)

- **Heading `type` Discriminator** – The heading content node gains an optional `type: "standard" | "acrostic"` (default `"standard"`), mirroring the existing `Footnote.type` pattern; added to [content-schema.json](../../content-schema.json) and [types/Content.ts](../../types/Content.ts)'s `ContentHeading`
- **Distinct Rendering** – Acrostic headings render one heading level smaller in markdown (`####` vs. `###`), with a triple-bracket marker in text export (`[[[...]]]` vs. `[[...]]`), and one Tailwind size step smaller in the web reader (`h4`/`text-lg` vs. `h3`/`text-xl`); see [utils/exportContent.ts](../../utils/exportContent.ts) and [web/public/js/ContentNode.js](../../web/public/js/ContentNode.js)
- **Shared Visibility Toggle** – Acrostic headings are governed by the same "Show Headings" setting as standard ones; no new toggle was added
- **Real Data Tagged** – All 66 existing acrostic stanza-marker headings (22 each) across WEBUS2020, KJV1769, and CLV1880's Psalm 119 now carry `"type": "acrostic"`, confirmed by exhaustive scan to be the only heading nodes anywhere in the Psalms corpus; ASV1901, YLT1898, and BYZ2018 had none to tag
- **JSON Write Pipeline Fixed** – [functions/writeJsonFile.ts](../../functions/writeJsonFile.ts) stringified with an indent argument before handing text to Prettier, which locked every object onto its own lines regardless of length (Prettier preserves a pre-existing line break rather than re-deriving it from width). Now stringifies compact first via a shared `formatJsonData()` helper, which [utils/validate.ts](../../utils/validate.ts)'s own formatting pass also calls, so both paths always converge on the same width-driven canonical form instead of possibly drifting
- **Whole Corpus Reformatted** – Running the fixed `npm run validate` once reformatted 208 files; verified value-for-value against Git history that every change was pure whitespace except the five files with the acrostic-heading edits above, which changed by exactly the intended amount and nothing else
- **Test Coverage Added** – 11 new tests (4 for the schema addition, 1 for key-sort coverage, 5 for export rendering, 1 regression test pinning the compact-stringify fix), bringing the suite to 187 tests across 8 files
- See [4-domains/content-verses.md](4-domains/content-verses.md#heading-types) for the acrostic heading domain detail and [data-pipeline.md](../documentation/EGP-Graphai/data-pipeline.md#writing-files) for the write-pipeline fix

## Previous Changes (Cross-Chapter Link Audit)

- **New Rule Owner** – [utils/crossChapterLinks.ts](../../utils/crossChapterLinks.ts) classifies every `bibleLink` target shape (`singleChapter`, `crossChapterRange`, `wholeChapterRange`, `mergedTarget`, `unparsed`) and splits a genuine cross-chapter range into two chapter-scoped links joined by an en dash
- **New Corpus Sweep & CLI** – [utils/auditCrossChapterLinks.ts](../../utils/auditCrossChapterLinks.ts) audits every version (dry-run by default) and writes fixes only when run with `--fix`; exits non-zero on any unsplit finding so it can gate CI like `validate.ts`
- **Version-Scoped, Never Shared** – Chapter length and book-name resolution are both read from each version's own data, never a table borrowed from another translation, since versification and canon differ between them
- **Real Finding Fixed** – WEBUS2020's Hebrews 11:34 footnote (`"2 Kings 6:31—7:20"`) split into `"2 Kings 6:31–33"` and `"2 Kings 7:1–20"`
- **Test Coverage Added** – 39 new tests (31 for classification/splitting, 8 for the corpus sweep and CLI), bringing the suite to 176 tests across 7 files
- See [4-domains/cross-chapter-links.md](4-domains/cross-chapter-links.md) for full domain detail

## Previous Changes (Atomic File Writes & Dependency Updates)

- **Atomic File Writes** – New [functions/writeJsonFile.ts](../../functions/writeJsonFile.ts) module (`writeFileAtomic` + `writeJsonFile`) stages writes to a temp file and renames over the target, retrying transient failures on a backoff; see [Writing files](../documentation/EGP-Graphai/data-pipeline.md#writing-files)
- **Four Writers Migrated** – `validate.ts`, `exportContent.ts`, `convertToSmallCaps.ts`, and `sortBibleKeys.ts` all now write through this module instead of `fs.writeFileSync` + a per-file `npx prettier --write` subprocess; their `processBook`/`main` functions are now `async`
- **Test Coverage Expansion** – Added 9 new tests for the write helper (Prettier-subprocess byte parity, atomic replace semantics, multibyte handling, retry/backoff and failure-naming under fake timers)
- **Dependency Updates** – `@types/lodash` 4.17.24 → 4.17.25, `@types/node` 24.12.4 → 24.13.3 (capped at v24 to match Node runtime), `prettier` 3.8.3 → 3.9.6, `vitest` 4.1.7 → 4.1.10; `typescript` held at 6.0.3 (7.x is a major, skipped)
- **Override Removed** – The `ajv` → `fast-uri` override was dropped; `fast-uri` now resolves to a safe version naturally without it

## Previous Changes (Branch: Add-bibleLink-node)

- **Bible Reference Links** – New `bibleLink` content variant for cross-reference targets; optional `content` override for display text
- **Schema, Types, Sorter Updated** – `content-schema.json`, [types/Content.ts](../../types/Content.ts), and canonical key order in [functions/sortContentKeys.ts](../../functions/sortContentKeys.ts) all recognize `bibleLink`
- **Export Dispatch** – [utils/exportContent.ts](../../utils/exportContent.ts) renders the override when present, otherwise the reference string
- **Web Reader Anchor** – [web/public/js/ContentNode.js](../../web/public/js/ContentNode.js) renders `bibleLink` as a clickable anchor with `onBibleLinkClick` callback
- **WEB Translation Migration** – WEBUS2020 footnotes updated to use `bibleLink` for embedded references; verse ranges normalized to en-dash separators with spaces after commas
- **Dependency Updates** – `vitest` 4.1.5 → 4.1.7, `@types/node` 24.12.2 → 24.12.4 (capped at v24 to match Node runtime), `fast-uri` override for high-severity advisories

## Previous Changes (Branch: Standardize-Bible-verse-key-order)

- **Key Ordering Standardization** – Added automatic key sorting during validation
- **Small Caps Utilities** – CLI tool for batch conversion of LORD/GOD to small caps format
- **Key Sorting Utilities** – CLI tool for standardizing key order across verse files
- **Test Coverage Expansion** – Added 66 new tests (40 for small caps, 26 for key sorting)
- **Enhanced Validation** – Modified validation script to auto-sort keys to canonical order

## Previous Changes (Branch: Converted-uppercase-to-small-caps)

- **Small Caps Support** – Added `sc` formatting mark for divine names (LORD/GOD rendered as small caps)
- **Nested Content Structure** – Extended content schema with `ContentNested` for shared properties
- **Divine Name Migration** – Converted uppercase LORD/GOD to small caps in KJV, ASV, WEB, YLT versions
- **Export Compatibility** – Text/markdown exports render small caps as uppercase
- **Web Reader Styling** – CSS `font-variant: small-caps` for proper visual rendering

## Previous Changes (Branch: Refactor-Bible-versions)

- **Version Metadata Refactored** – Moved from single `bible-versions.json` to per-folder `_version.json` files
- **New `getBibleVersions()` Function** – Discovers versions from folder structure dynamically
- **New `types/Version.ts`** – TypeScript interfaces for version metadata
- **Export System Refactored** – Unified rendering architecture with configurable options
- **Test Coverage Added** – 49 tests (17 for version discovery, 32 for export)
- **Font-Responsive Width** – Web reader content width scales with font size

## Quick Reference

| Command            | Purpose                            |
| ------------------ | ---------------------------------- |
| `npm install`      | Install dependencies               |
| `npm run dev`      | Start web reader at localhost:3000 |
| `npm run validate` | Validate all JSON data             |
| `npm run export`   | Export to text/markdown            |
| `npm run test`     | Run Vitest tests                   |
| `npm run audit-links` | Audit all versions for unsplit cross-chapter `bibleLink`s |
| `npm run audit-nodes` | Audit all versions for Strong's-node placement drift (read-only) |
| `npm run overhaul-footnotes <version>` | Re-classify a version's on-disk footnotes against the current rules (add `--fix` to write) |

## Context Documents

### Developer Documentation (narrative)

| Document                                                           | Description                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| [Supplemental Docs README](../documentation/EGP-Graphai/README.md) | Entry point for human-readable developer documentation |
| [content-model.md](../documentation/EGP-Graphai/content-model.md)  | Narrative walkthrough of the recursive content shapes  |
| [data-pipeline.md](../documentation/EGP-Graphai/data-pipeline.md)  | Validation, transforms, and export flow                |
| [usfm-import.md](../documentation/EGP-Graphai/usfm-import.md)      | USFM → Graphai import pipeline and verification         |
| [web-reader.md](../documentation/EGP-Graphai/web-reader.md)        | Web reader architecture and component layout           |

### Domain Analysis

| Document                                                     | Description                                           |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| [1-techstack.md](1-techstack.md)                             | Languages, frameworks, libraries, and domain analysis |
| [2-file-categorization.json](2-file-categorization.json)     | File organization by role                             |
| [3-architectural-domains.json](3-architectural-domains.json) | Architecture patterns and constraints                 |

### Business Domains

| Document                                                   | Description                           |
| ---------------------------------------------------------- | ------------------------------------- |
| [4-domains/bible-versions.md](4-domains/bible-versions.md) | Bible version registry and management |
| [4-domains/bible-books.md](4-domains/bible-books.md)       | Canonical book metadata               |
| [4-domains/content-verses.md](4-domains/content-verses.md) | Content structure and verse data      |
| [4-domains/export-system.md](4-domains/export-system.md)   | Export formats and processing         |
| [4-domains/validation.md](4-domains/validation.md)         | Data validation system                |
| [4-domains/cross-chapter-links.md](4-domains/cross-chapter-links.md) | Cross-chapter `bibleLink` detection and splitting |
| [4-domains/strongs-node-audit.md](4-domains/strongs-node-audit.md) | Strong's-node placement drift detection (read-only) |
| [4-domains/usfm-import.md](4-domains/usfm-import.md)       | USFM → Graphai import pipeline, verification, and apocrypha addition |
| [4-domains/web-reader.md](4-domains/web-reader.md)         | Web application architecture          |

### Style Guides

| Document                                                                         | Description                        |
| -------------------------------------------------------------------------------- | ---------------------------------- |
| [5-style-guides/typescript-utilities.md](5-style-guides/typescript-utilities.md) | TypeScript utility module patterns |
| [5-style-guides/type-definitions.md](5-style-guides/type-definitions.md)         | TypeScript interface conventions   |
| [5-style-guides/react-components.md](5-style-guides/react-components.md)         | React component patterns           |
| [5-style-guides/ui-components.md](5-style-guides/ui-components.md)               | UI component patterns              |
| [5-style-guides/json-schemas.md](5-style-guides/json-schemas.md)                 | JSON Schema conventions            |

### Testing & Build

| Document                                     | Description                                       |
| -------------------------------------------- | ------------------------------------------------- |
| [6-tests-and-build.md](6-tests-and-build.md) | Test framework, build commands, coverage analysis |

## Architecture Overview

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TB
    subgraph Data["Data Layer"]
        BS[bible-books-schema.json]
        BB[bible-books.json]
        VS[bible-versions-schema.json]
        VJ[_version.json files]
        CS[content-schema.json]
        VRS[bible-verses-schema.json]
        VF[Verse Files *.json]
    end

    subgraph Processing["Processing Layer"]
        VAL[validate.ts]
        EXP[exportContent.ts]
        VJS[validateJsonAgainstSchema.ts]
        GBV[getBibleVersions.ts]
        SCK[sortContentKeys.ts]
        CSC[convertToSmallCaps.ts]
        CCL[crossChapterLinks.ts]
        WJF[writeJsonFile.ts]
        ASN[auditNodes.ts]
    end

    subgraph Types["Type Definitions"]
        TC[Content.ts]
        TV[VerseSchema.ts]
        TB[Book.ts]
        TF[Footnote.ts]
        TBV[Version.ts]
    end

    subgraph Web["Web Layer"]
        SRV[server.ts]
        APP[App.js]
        BC[BibleContent.js]
        FT[footnoteText.js]
        CN[ContentNode.js]
        UI[UI Components]
    end

    subgraph Output["Output"]
        TXT[text-vbv-strongs/]
        MD[markdown-par/]
    end

    subgraph USFM["USFM Import"]
        USF[/USFM source files/]
        IMP[importUsfm.ts]
        VFY[usfm/verify.ts]
        OHF[overhaulFootnotes.ts]
    end

    BS --> VAL
    VS --> VAL
    VRS --> VAL
    CS --> VRS
    BB --> VAL
    VJ --> VAL
    VF --> VAL

    VF --> EXP
    EXP --> TXT
    EXP --> MD

    VF --> CCL
    VF --> ASN
    VAL -->|"read-only, per version"| CCL
    VAL -->|"read-only, per version"| ASN

    VAL --> WJF
    EXP --> WJF
    CSC --> WJF
    SCK --> WJF
    CCL -->|--fix| WJF

    USF --> IMP
    IMP --> VF
    IMP --> WJF
    IMP --> VJ
    IMP -->|"subprocess, --fix"| CCL
    IMP -->|"subprocess"| VAL
    USF -.->|"independent check"| VFY
    VF --> OHF
    OHF -->|"--fix"| WJF

    TC --> EXP
    TV --> EXP

    VJ --> GBV
    GBV --> SRV
    SRV --> BB
    SRV --> VF

    APP --> BC
    BC --> CN
    FT --> CN
    APP --> UI
```

## Critical Patterns

### Content Processing (Recursive)

All code handling Content must handle three variants:

1. **String** – Plain text
2. **Object** – Structured with text, annotations, formatting
3. **Array** – Collection of content items (recursive)

```typescript
function processContent(content: Content): void {
  if (typeof content === "string") {
    /* handle string */
  }
  if (Array.isArray(content)) {
    content.forEach(processContent);
  }
  if (typeof content === "object") {
    /* handle object variants */
  }
}
```

### Schema Validation Chain

```
content-schema.json
       ↓ (referenced by)
bible-verses-schema.json
       ↓ (referenced by)
bible-versions-schema.json ← bible-books-schema.json
```

### Frontend Component Registration

Each React component must register on `window` for cross-file access:

```javascript
window.ComponentName = ComponentName;
```

## Key Constraints

1. **No Build Step for Frontend** – JSX transpiled at runtime via Babel
2. **No Database** – All data as flat JSON files
3. **Sequential Book Ordering** – Orders must be 1-indexed, sequential, no gaps
4. **Canonical Key Order** – Content keys must follow specific order (subtitle → heading → bibleLink → paragraph → type → text → content → script → marks → break → foot → strong → morph → lemma)
5. **Strong's Number Format** – Must match `^[GH][0-9]{1,4}$`
6. **Verse File Naming** – Must follow `{order}-{bookId}.json` pattern
7. **Exit on Validation Failure** – Scripts exit with code 1 on any error
8. **Leading-Space Convention** – A joining space belongs on the leading edge of the node it joins, never the trailing edge of the node before it, and never as a verse's own opening character. This convention is audited (read-only) by `auditNodes.ts`
9. **USFM Verifier Independence** – `usfm/verify.ts` must never import `tokenize.ts`, `segmentVerses.ts`, or anything that imports them; it exists to catch a bug the importer itself can't see by re-deriving its checks straight from raw USFM
10. **Footnote Classification Has One Source of Truth** – `usfm/footnoteTypeRules.ts`'s `classifyFootnote()` is called by both the importer and `overhaulFootnotes.ts`; don't duplicate its logic elsewhere

## Test Status

⚠️ **522 tests passing, 10 of 29 test files fail to load** (Vitest):

Pre-existing suite, all passing:

- `functions/__tests__/contentSchema.test.ts` – 4 tests for the heading `type` schema addition
- `functions/__tests__/convertToSmallCaps.test.ts` – 40 tests for small caps conversion
- `functions/__tests__/sortContentKeys.test.ts` – 27 tests for key ordering
- `functions/__tests__/getBibleVersions.test.ts` – 23 tests for version discovery and duplicate-name disambiguation
- `functions/__tests__/writeJsonFile.test.ts` – 10 tests for atomic file writes and JSON canonicalization
- `utils/__tests__/exportContent.test.ts` – 80 tests for export functionality, including bold/italic and footnote/spacing fixes
- `utils/__tests__/crossChapterLinks.test.ts` – 36 tests for cross-chapter target classification and splitting, including whole-chapter ranges
- `utils/__tests__/auditCrossChapterLinks.test.ts` – 8 tests for the corpus-wide sweep and CLI
- `utils/__tests__/validate.test.ts` – 36 tests for the meaningless-content-node and Strong's-trailing-whitespace checks
- `utils/__tests__/auditNodes.test.ts` – 72 tests for all seven Strong's-node placement checks
- `web/public/js/__tests__/footnoteText.test.ts` – 7 tests for shared footnote-text extraction

USFM import pipeline (18 new files): `utils/__tests__/overhaulFootnotes.test.ts` and 7 of the 16 `utils/usfm/__tests__/` files load and pass. `utils/__tests__/importUsfm.test.ts` and the other 9 `utils/usfm/__tests__/` files fail to load, blocked by missing local scaffolding, not by a code defect. See [6-tests-and-build.md](6-tests-and-build.md#usfm-import-pipeline-domain) for the exact file-by-file breakdown.

See [6-tests-and-build.md](6-tests-and-build.md) for test details and coverage.

---

_This context documentation was generated to assist AI agents in understanding and modifying the EGP Graphai codebase. Refer to individual domain documents for detailed information._
