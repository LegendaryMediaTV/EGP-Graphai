# USFM Import Domain

## Overview

Converts USFM (Unified Standard Format Markers) translation source files into Graphai verse JSON, so a translation authored in the format most Bible-translation tools export doesn't need hand-transcription into the schema. This is how WEBUS2020's deuterocanonical books were brought into the corpus. For the narrative walkthrough, see [usfm-import.md](../../documentation/EGP-Graphai/usfm-import.md) in the supplemental docs.

The pipeline lives in `utils/usfm/` (tokenizer through per-construct builders), with `utils/importUsfm.ts` as the orchestrator, `utils/usfm/verify.ts` as an independent post-import checker, and `utils/overhaulFootnotes.ts` as a retroactive tool that reuses the importer's footnote-classification rules against content already on disk.

## Core Entities

### `ParsedArgv` / `ImportOptions` (`utils/importUsfm.ts`)

```typescript
export interface ParsedArgv {
  readonly sourceDir?: string;
  readonly versionId?: string;
  readonly book?: string;
  readonly chapter?: number;
  readonly options: ImportOptions;
}
```

`ImportOptions.strongs?: boolean` (default `true`) is the only option the CLI exposes via `--no-strongs`; `bookTitle`/`copyright`/`license` overrides and `outputDir` redirection exist on the type for wrapper scripts that call `runImport()` directly, not for the bare CLI.

### `BookMetadata` (`utils/usfm/metadata.ts`)

```typescript
export interface BookMetadata {
  readonly _id: string; // resolved registry id, never the raw USFM \id
  readonly name: string; // from \h
  readonly title: string; // from \toc1
  readonly chapters: number; // highest \c seen
}
```

### Three distinct `VerseRecord` interfaces

`utils/auditNodes.ts`, `utils/importUsfm.ts`, and `utils/usfm/segmentVerses.ts` each declare their own `VerseRecord` interface. They share a name and a similar `{book, chapter, verse, content}` shape but are not the same type and are not interchangeable. A function typed against one will not accept a value built for another. Check which file's `VerseRecord` a given function actually imports before assuming compatibility.

## User Workflows

```bash
# Rebuild every book _version.json already lists
npx ts-node utils/importUsfm.ts <source-dir> <version-id>

# Rebuild one book, then regenerate downstream (npm run validate)
npx ts-node utils/importUsfm.ts <source-dir> <version-id> <book>

# Preview one chapter's JSON on stdout; nothing is written, downstream is skipped
npx ts-node utils/importUsfm.ts <source-dir> <version-id> <book> <chapter>

# Suppress every Strong's number this run would otherwise attach
npx ts-node utils/importUsfm.ts <source-dir> <version-id> --no-strongs

# Independently re-check a freshly imported version against its own USFM source
npx ts-node utils/usfm/verify.ts <source-dir> <version-id>

# Retroactively re-run existing on-disk footnotes through the current classification rules
npm run overhaul-footnotes <version-id> [-- --hard-reset --fix]
```

## Key Business Rules

- **Footnote classification is construct-based, not phrase-based, and its priority isn't a flat four-step order.** `classifyFootnote()` in `footnoteTypeRules.ts` checks cross-reference first, then a strong witness/textual-variant signal, then a translation-alternative signal, then a weaker witness/variant signal (a language name compared across a semicolon), then falls back to study. Detection asks what shape a body has (citation-only, names a manuscript witness, opens with a translation marker, compares two language readings) rather than matching literal phrases lifted from one edition's own house style, so the same table holds across different translations. Every footnote gets exactly one type; `map` is never assigned by this pipeline.
- **Symbolic apparatus notation is `var`, checked right after `xrf`.** A Greek or Hebrew critical edition prints its apparatus as operators between competing readings rather than as the prose every vocabulary rule looks for, so `⇒` (one reading against another), a standalone `~` (the compared edition omits the verse), and `¦` (one witness group's reading against the next) each mark a variant on their own. Without this construct all 7,522 of BYZ2018's bodies fall through to `stu`. A leading Greek or Hebrew character is deliberately *not* a fourth signal: it says which edition a note came from rather than what the note is, so it misreads a translation gloss that opens with the original-language word it glosses.
- **`overhaulFootnotes.ts` doesn't downgrade a real stored type to `stu` unless `--hard-reset` is given.** `stu` is `classifyFootnote()`'s own fallback for "no construct matched," not a considered judgment that a note is untyped, so `reclassifyFootnotesIn()` skips any recomputed `stu` result when the stored type is something else real. A corpus with many bare-gloss `trn` notes and no textual marker at all is the case this protects. Every other reclassification, including every upgrade out of `stu`, still applies unconditionally.
- **`--hard-reset` re-derives every type from scratch.** It gives the stored type no weight at all, for a corpus whose existing types aren't worth keeping (a bulk-typed placeholder, an earlier machine pass now known to be wrong). It exists because without it a stored non-`stu` type is unreachable by `stu`, so a clean re-derivation would otherwise require blanking every type by hand first. Composes with `--fix`.
- **`verify.ts` must never import `tokenize.ts` or `segmentVerses.ts`** (or anything that imports them). It exists specifically to catch a bug the importer itself couldn't see, which requires deriving its own counts independently from raw USFM rather than reusing the importer's parsing.
- **`importUsfm.ts` is intentionally absent from `package.json`'s `scripts`.** Its own header comment is the documented invocation, since the tool takes an arbitrary local source directory that varies per translation.
- **A real (non-preview, non-redirected) import shells out to `npm run validate` as a subprocess**, not an in-process function call, and that one subprocess is the only downstream step there is. `regenerateDownstream` does this specifically because `crossChapterLinks.ts` builds and caches its version index once per process, and a fresh process is the only way to guarantee that cache isn't stale mid-import. There is no separate `audit-links` script to shell out to any more — the cross-chapter split, the truncated-range reconstruction, and every other normalization and audit rule this repo enforces on `bible-versions/**` all run as part of that one `npm run validate` call; see [validation.md](./validation.md) for the one-entry-point architecture this relies on.
- **`--no-strongs` is a per-translation decision, not a general default.** It exists because a quality review found WEBUS2020's automatically assigned Strong's numbers unreliable across a large share of sampled words for that translation specifically.
- **Deuterocanon insertion changed only two rows of `bible-books/bible-books.json`.** WEBUS2020 grew from 66 to 81 books (order 40–54, inserted between Malachi at order 39 and Matthew, now order 55), but 13 of the 15 deuterocanon book ids the registry needed were already present in `bible-books.json`, even though no other translation in this repo carries verse files for them; only `PS2` (Psalm 151) and `DAG` (Greek Daniel additions) were new. `testament` stays `"OT" | "NT"`; apocrypha is grouped under `"OT"`, not a third value.
- **`splitScriptRuns` moved from a missing external scaffold to a tracked module.** `utils/usfm/headings.ts`, `footnotes.ts`, and `verify.ts` all import it from `./splitScriptRuns` (`utils/usfm/splitScriptRuns.ts`), not from the gitignored `imports/_lib/` path earlier versions of this pipeline assumed. `splitScriptRuns.ts` now also exports `splitNonLatinScriptRuns`, a thin composition that runs the per-script splitter for every script this repo tags (Hebrew, then Greek) rather than just one — `headings.ts` and `footnotes.ts` each call it instead of hardcoding a single script, closing a real asymmetry where a footnote body was only ever scanned for Greek and a heading only for Hebrew, so an undelimited run in the other script shipped untagged (see [content-verses.md](./content-verses.md) for the corpus-wide convention this closes the importer's own side of). The dependency that remains gitignored is the WEBUS2020 raw USFM corpus at `imports/webus2020/ebible-usfm/`, which `metadata.test.ts`, `verify.test.ts`, and the upstream-convention specs read directly; it's present in this checkout but, being gitignored, isn't guaranteed to exist in a fresh one. Running the full suite (`npx vitest run`) currently reports all 38 test files passing; see [6-tests-and-build.md](../6-tests-and-build.md) for what a checkout without that corpus would still be missing.
- **The independent verifier's own rules, stated directly rather than left to its doc comment alone.** `verify.ts` holds this repo's largest concentration of automated checks against one import, all built on the same principle: derive an independent count from the raw source and compare, rather than trust the importer's own bookkeeping.
  - **Every construct's count is fixed in advance, per class, not as a single total.** Over twenty separate `*_IN_CORPUS` constants are each checked per book and in aggregate, because a matching grand total can hide two errors that happen to cancel out.
  - **The construct inventory is asserted in both directions.** A marker name no rule recognizes fails by name; a rule that matches zero markers corpus-wide also fails by name — silence in either direction is a real finding, not an assumed clean bill of health.
  - **Marks carry no text, so a lost formatting run is invisible to a plain-text comparison alone.** `countInlineMarkersIn` (raw source) is checked against `countEmittedMarkRuns` (emitted JSON), with a separate constant wherever the two legitimately differ by design.
  - **Character reconciliation is checked position-paired, not merely totalled.** Every footnote's own raw body is paired against the Nth emitted `foot` and diffed character-for-character, so a total that happens to match cannot hide a real mismatch inside it.
  - **A footnote's type is re-derived from its own source body and compared, not merely counted.** `classifyFootnote` runs again independently, so a body correctly counted but paired with the wrong marker is still caught.
  - **A declared deferral is tracked by count and must reach zero.** `FOOTNOTES_EXCLUDED_FROM_CORPUS` and `HEBREW_SCRIPT_RUNS_EXCLUDED_FROM_CORPUS` are both permanently asserted at `0`, with the reason in their own doc comments — a phase may defer a construct, but it must say so and drive the count down, not leave it unstated.
  - This is also why `verify.ts` must never import `tokenize.ts`, `segmentVerses.ts`, or anything that imports them (already stated above): every one of these rules is only as strong as the independence of the count it compares against, and reusing the importer's own parsing would let the importer check its own homework.

## Representative Code Examples

### CLI argument parsing

_From [utils/importUsfm.ts](../../../utils/importUsfm.ts)_

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

### Footnote type classification

_From [utils/usfm/footnoteTypeRules.ts](../../../utils/usfm/footnoteTypeRules.ts)_

```typescript
export function classifyFootnote(body: string): ClassifiableFootnoteType {
  if (isNothingButReferences(body)) return "xrf";
  if (namesAWitness(body)) return "var";
  if (offersATranslationAlternative(body)) return "trn";
  if (comparesLanguageWitnesses(body)) return "var";
  return "stu";
}
```

`namesAWitness` and `offersATranslationAlternative` each test several independent constructs (named witnesses, tradition sigla, quantified witness nouns, anchored translation openers, sentence-shaped translation verbs); `comparesLanguageWitnesses` is deliberately the weakest signal and checked last, since a bare language name is at least as often background etymology as a real textual claim.

### Acrostic heading detection

_From [utils/usfm/headings.ts](../../../utils/usfm/headings.ts)_

```typescript
export function isAcrosticLetterName(text: string): boolean {
  return ACROSTIC_LETTER_NAMES.has(text);
}
```

Psalm 119's 22 stanza markers share the plain `\d` marker with every ordinary Psalm superscription; this lookup, not marker choice or position, is what tells them apart.

### Book id crosswalk

_From [utils/usfm/metadata.ts](../../../utils/usfm/metadata.ts)_

```typescript
export function resolveBookId(usfmId: string): string {
  return USFM_TO_REGISTRY_ID[usfmId] ?? usfmId;
}
```

`USFM_TO_REGISTRY_ID` maps USFM book ids that don't match this repo's own registry ids (17 canonical plus 5 deuterocanon) to the id `bible-books.json` actually uses; anything not in the table passes through unchanged.

### Deuterocanon insertion in WEBUS2020's book order

_From [bible-versions/WEBUS2020/_version.json](../../../bible-versions/WEBUS2020/_version.json)_

```json
{ "_id": "MAL", "order": 39 },
{ "_id": "TOB", "order": 40 },
{ "_id": "JDT", "order": 41 },
{ "_id": "ESG", "order": 42 },
{ "_id": "DAG", "order": 43 },
{ "_id": "WIS", "order": 44 },
{ "_id": "SIR", "order": 45 },
{ "_id": "BAR", "order": 46 },
{ "_id": "1MC", "order": 47 },
{ "_id": "2MC", "order": 48 },
{ "_id": "1ES", "order": 49 },
{ "_id": "PMA", "order": 50 },
{ "_id": "PS2", "order": 51 },
{ "_id": "3MC", "order": 52 },
{ "_id": "2ES", "order": 53 },
{ "_id": "4MC", "order": 54 },
{ "_id": "MAT", "order": 55 }
```

(Fields other than `_id`/`order` omitted for brevity; each book entry also carries `name`, `title`, and `chapters`.)
