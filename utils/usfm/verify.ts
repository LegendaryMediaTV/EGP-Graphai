/**
 * Independent verifier for `utils/importUsfm.ts` — reads whatever is really
 * on disk and re-derives its own counts from the raw USFM source with its
 * own regexes, sharing no parsing/segmentation code with `tokenize.ts` or
 * `segmentVerses.ts` (`imports/guide.md` §5: "the verifier must not share
 * the importer's mechanisms" — a bug shared between the two sides would
 * cancel out and never be caught). Reusing `usfm/metadata.ts`'s
 * `resolveBookId`, `usfm/footnoteTypeRules.ts`'s `classifyFootnote`, and
 * `usfm/headings.ts`'s `isAcrosticLetterName` is not a mechanism-sharing
 * risk in that sense: each is a static, individually-checkable reference
 * table (the same category as `bible-books.json` itself, which both sides
 * already have to agree on), not a parsing/segmentation algorithm with
 * room for a symmetric bug.
 *
 * Checks, per construct:
 *
 *   Verses/chapters — per book, the emitted JSON's own record count equals
 *   that book's own `\v` marker count in the raw source, and the source's
 *   own highest `\c` number equals `_version.json`'s own declared
 *   `chapters`; whole-corpus totals are fixed in advance (38,058 verses,
 *   1,402 chapters — re-measured directly against the real 81 in-scope
 *   files, never trusted from a single run's own output).
 *
 *   Block structure (`\p`/`\m`/`\nb` → `paragraph`, `\q1`/`\q2`/`\q3`/`\b`
 *   → `break`) — see {@link countBlockMarkersIn} and
 *   {@link countEmittedBlockFlags}'s own doc comments for why the raw
 *   marker count and the emitted flag count are fixed against two
 *   *different* constants, not one.
 *
 *   Inline marks (`\wj`/`\wj*` → `marks: ["woc"]`, `\qs`/`\qs*` → `marks:
 *   ["i"]`) — see {@link countInlineMarkersIn} and
 *   {@link countEmittedMarkRuns}'s own doc comments for the same
 *   raw-count-vs-emitted-count split, and {@link WOC_RUNS_IN_CORPUS}'s own
 *   doc comment for why the two numbers do not agree here either.
 *
 *   Footnotes — four checks, per guide §5's own "the verifier must not
 *   share the importer's mechanisms" and "character reconciliation"
 *   sections:
 *     (a) the whole-corpus footnote total — 1,854 `\f`...`\f*` spans, fixed
 *         in advance — and, per book, that count (plus every real `\ip`
 *         block, minus every raw body that independently re-classifies as
 *         a real reference, see
 *         {@link INTRO_PARAGRAPHS_IN_CORPUS}/
 *         {@link REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS}) equals the
 *         emitted `foot`-node count exactly (see {@link FOOTNOTES_IN_CORPUS}).
 *     (b) the per-type distribution ({@link classifyFootnote} applied to
 *         each independently-extracted body) is computed and printed, not
 *         fixed — "resulting distribution" is reported after the
 *         classifier runs over the real corpus, not predicted in advance
 *         (guide §6) — except that `map` must be exactly zero (this corpus
 *         carries no source signal for it), and each raw body's own
 *         re-derived type must match what the importer actually emitted
 *         for the *same*, position-paired footnote (guide §5: "have the
 *         verifier re-derive the type from the source body and compare, so
 *         a body paired with the wrong marker is caught even when both
 *         bodies exist").
 *     (c) original-script run counts — {@link HEBREW_SCRIPT_RUNS_IN_CORPUS}
 *         (from the `\+wh`...`\+wh*` pair count) and
 *         {@link GREEK_SCRIPT_RUNS_IN_CORPUS} (from `splitScriptRuns`'s own
 *         character-range scan over every independently-extracted body) —
 *         against the emitted `script: "H"`/`script: "G"` node counts.
 *     (d) character reconciliation (guide §5's second harness leg): every
 *         character inside every `\f`...`\f*` span lands somewhere in the
 *         emitted `foot.content`, checked position-paired per book, not
 *         just totalled — see {@link extractFootnoteBodiesIn}'s own doc
 *         comment for exactly what counts as "every character" here (the
 *         `\fr` label is excluded by name, matching this repo's own
 *         already-established, deliberate drop of it, not a silent gap).
 *
 *   Cross-references (`\x`...`\x*`, always `xrf`-typed, plus any real `\f`
 *   body that independently re-classifies `xrf`) — the
 *   combined raw count and the emitted `xrf` foot-object count must match
 *   exactly (no deferral, unlike ordinary footnotes); every resolved
 *   target's own `bibleLink` node count is asserted as a relation, not a
 *   bare figure ({@link BIBLE_LINKS_IN_CORPUS} pre-split plus
 *   {@link CROSS_CHAPTER_RANGES} split, since a real run's own
 *   `regenerateDownstream` always applies the cross-chapter split before
 *   this verifier ever runs); the one real target left unresolved
 *   (Hebrews 1:6's siglum-suffixed target) is asserted by name.
 *
 *   Headings/subtitles/chrome — Psalm superscriptions (`\d` → `subtitle`,
 *   or `heading`/`type: "acrostic"` for Psalm 119's own 22 letter names),
 *   the five Psalter book-division headings (`\ms1`), Song of Solomon's
 *   speaker labels and the deuterocanon corpus's own per-pericope section
 *   headings (`\sp`/`\s1`, indistinguishable once emitted, see
 *   {@link SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS}), Numbers 21:14's and
 *   every real `\ip`/deuterocanon-footnote `\bk` book-title citation
 *   (delimiters dropped, `marks: ["i"]` added — the same mark `\qs`/`\add`
 *   already use, per Finding 6; checked for presence at Numbers 21:14,
 *   this verifier's one dedicated per-verse mark check), and Psalms' own
 *   `\cl` chapter-label override (dropped as chrome, checked to host
 *   nothing).
 *   The 5 real footnotes that sit inside a `\d`/`\s1` superscription
 *   or section heading (Psalm 46:0/90:0/145:0/151:1, Daniel-Greek 3:24) are
 *   asserted as a positive, structural check
 *   ({@link SUPERSCRIPTION_FOOTNOTES_IN_CORPUS}), not an exclusion from
 *   pairing — every raw footnote participates in the footnote
 *   position-paired comparison above, none excluded.
 *
 *   Marker inventory — every backslash-escaped marker name found anywhere
 *   in the 81 in-scope books falls into one of three named buckets
 *   (content-handled, chrome-dropped, or confirmed to occur zero times);
 *   anything else is reported by name as a real bug, never silently
 *   absorbed (see {@link markerNamesIn}). USFM's own table markers
 *   (`\tr`/`\tc.../\th...`) are asserted at zero in code, not left resting
 *   on recon alone (see {@link countTableMarkersIn}).
 *
 *   Strong's attributes — asserted at zero across every emitted node, a
 *   deliberate content decision (a quality assessment found this corpus's
 *   own Strong's tagging semantically implausible on roughly half of every
 *   sampled word), not a defect this verifier caught by surprise — see
 *   {@link STRONGS_ATTRIBUTES_IN_CORPUS}'s own doc comment for the full
 *   reasoning and {@link countStrongAttributeNodes} for the check itself.
 *
 * What stays independent throughout, per guide §5: every extraction
 * function above ({@link countMarkersIn}, {@link countBlockMarkersIn},
 * {@link countInlineMarkersIn}, {@link extractFootnoteBodiesIn},
 * {@link extractIntroParagraphsIn}, {@link extractCrossReferencesIn},
 * {@link extractHeadingMarkersIn}, {@link extractSuperscriptionsIn},
 * {@link countTableMarkersIn}, and every emitted-JSON walker) is this
 * verifier's own regex or recursive
 * descent, never a call into `tokenize.ts`, `segmentVerses.ts`,
 * `blockStructure.ts`, or any other importer-side parsing/segmentation
 * code — only the small, individually-checkable reference tables named
 * above are ever shared.
 *
 * Usage:
 *   npx ts-node utils/usfm/verify.ts <source-dir> <version-id>
 */

import * as fs from "fs";
import * as path from "path";
import { getBibleVersion } from "../../functions/getBibleVersions";
import { splitScriptRuns } from "../../imports/_lib/splitScriptRuns";
import { classifyFootnote, flattenContentText } from "./footnoteTypeRules";
import { isAcrosticLetterName } from "./headings";
import { resolveBookId } from "./metadata";

/**
 * How many verses the whole in-scope WEBUS2020 corpus declares — every `\v`
 * marker across every in-scope USFM file, counted directly and
 * independently of `tokenize.ts`/`segmentVerses.ts`. **38,058, not 31,103**
 * — the 66-book canonical figure plus 6,955 real verses across the 15
 * deuterocanon books, re-measured against the full 81-book corpus.
 */
export const VERSES_IN_CORPUS = 38058;

/**
 * How many chapters the whole in-scope WEBUS2020 corpus declares — every
 * `\c` marker, counted the same independent way. **1,402, not 1,189** —
 * plus 213 real deuterocanon chapters.
 */
export const CHAPTERS_IN_CORPUS = 1402;

/**
 * How many `\p`/`\m`/`\nb`/`\li1`/`\pi1`/`\mi` (paragraph-opening) markers
 * the whole in-scope corpus declares — **9,486**: the 66-book canonical
 * figure (8,372) plus 1,114 more across the 15 deuterocanon books, the
 * identical marker names. `\li1`/`\pi1`/`\mi` (Ezra/Nehemiah/Jeremiah/
 * Daniel's own letter-quoting sections) matter here because a marker
 * outside `PARAGRAPH_MARKER_NAMES` has zero effect on block boundaries —
 * before they joined that set, Ezra 8:2's own three `\li1`-tagged list
 * items would merge into one run-on block with no separation at all.
 *
 * **This is the raw source count only — see {@link EMITTED_PARAGRAPH_FLAGS_IN_CORPUS}
 * for the emitted `paragraph: true` count.** The two differ: `\b` (the
 * real stanza-break marker) is not one of these raw markers — it belongs
 * to the *break*-marker family {@link BREAK_MARKERS_IN_CORPUS} counts —
 * but it now also opens its own following block with `paragraph: true`,
 * reproducing WEB's own real, upstream-confirmed stanza-break convention.
 * So a raw `\b` contributes to the emitted paragraph-flag total without
 * ever being counted here. The two counts carry their own, separate
 * constants, the identical "raw marker count and emitted flag count are
 * fixed against two *different* constants" shape
 * {@link BREAK_MARKERS_IN_CORPUS}/{@link BREAK_FLAGS_IN_CORPUS} already
 * model.
 */
export const PARAGRAPH_MARKERS_IN_CORPUS = 9486;

/**
 * How many real `paragraph: true` flags the corpus actually emits —
 * measured directly against the real, full-corpus reimport, not derived
 * from {@link PARAGRAPH_MARKERS_IN_CORPUS}. **10,701** — 992 more than the
 * 9,486 raw `\p`/`\m`/`\nb`/`\li1`/`\pi1`/`\mi` markers from `\b`'s own
 * real stanza-break convention (Phase 5), plus 223 more again from
 * Finding 7's own real report: every chapter boundary that opens directly
 * with a bare `\q1`/`\q2`/`\q3` — no `\p`/`\m`, and no `\b` either — now
 * correctly opens its own first real block with `paragraph: true` too,
 * the identical signal Phase 5 already gave the `\b`-adjacent case, via
 * `\c`'s own dispatch rather than `\b`'s — see
 * {@link BREAK_FLAGS_IN_CORPUS}'s own doc comment for the matching drop
 * on the break side of both fixes.
 */
export const EMITTED_PARAGRAPH_FLAGS_IN_CORPUS = 10701;

/**
 * How many `\q1`/`\q2`/`\q3`/`\b` (poetry-line/stanza-break) markers the
 * whole in-scope corpus declares — **24,408**: the 66-book canonical
 * figure (19,616, with zero real `\q3`) plus 4,792 more across the 15
 * deuterocanon books — including this corpus's own first real `\q3` (7
 * instances), already a member of `BREAK_MARKER_NAMES`, needing no new
 * code. This is the *raw source* count, not the emitted flag count — see
 * {@link BREAK_FLAGS_IN_CORPUS}.
 */
export const BREAK_MARKERS_IN_CORPUS = 24408;

/**
 * How many real `break: true` flags the corpus actually emits — measured
 * directly against a real full-corpus run, not derived from
 * {@link BREAK_MARKERS_IN_CORPUS}. The two differ because two `\q`-family
 * markers with nothing but a footnote, a cross-reference, a heading's own
 * dropped text, or a verse/chapter number between them describe one
 * physical line boundary, and `content-schema.json`'s own `break` flag is
 * a boolean — it can hold that boundary exactly once, never twice. WEB's
 * own `\b`-then-`\q1` "stanza break, then resume" idiom (almost every one
 * of 764 `\b` markers immediately followed by a `\q1`) is the dominant
 * real example; Psalm 1's own opening `\q1`, with no earlier line in the
 * whole book to reach for at all, is the one true no-op. None of this is a
 * lost distinction the schema could otherwise express — poetry's own
 * indent level is already flattened away by this repo's own established
 * convention, and "how many consecutive line-marker events fired" was
 * never something `break: true` could carry either.
 *
 * A second reason the two counts differ: every real `\b` drops the
 * preceding line's own `break: true` entirely and opens the next block
 * with `paragraph: true` instead (see
 * {@link EMITTED_PARAGRAPH_FLAGS_IN_CORPUS}), matching WEB's own real,
 * upstream-confirmed convention — so each real `\b` contributes one fewer
 * `break: true` flag than an ordinary poetry-line marker would, on top of
 * the "two markers, one boundary" collapsing described above.
 *
 * A third reason, per Finding 7: at every real chapter boundary that
 * opens directly with a bare `\q1`/`\q2`/`\q3` — with or without a `\b`
 * — the *previous* chapter's own last real block no longer gains a
 * spurious `break: true` from the corpus's own bare-`\qN`-reaches-
 * backward idiom crossing the chapter boundary, the identical clean cut
 * `\b` already gave that same line where a real `\b` happens to precede
 * `\c`.
 *
 * **22,123**, re-measured directly against a real, full-corpus reimport
 * — 220 fewer than the prior 22,343, the matching drop on the break side
 * of Finding 7's own fix.
 */
export const BREAK_FLAGS_IN_CORPUS = 22123;

/**
 * How many `\wj`/`\wj*` markers the whole in-scope corpus declares — both
 * halves of every pair, measured directly, independently of
 * `tokenize.ts`/`segmentVerses.ts` — **4,580**, unchanged at the 81-book
 * scope: zero `\wj` markers occur anywhere in the 15 deuterocanon books
 * (confirmed directly, not assumed), since Words of Christ is a New
 * Testament, Gospel-quotation-specific construct and every deuterocanon
 * book is Old Testament apocrypha or intertestamental narrative.
 */
export const WOC_MARKERS_IN_CORPUS = 4580;

/** How many source `\wj`...`\wj*` pairs the whole in-scope corpus declares — half of {@link WOC_MARKERS_IN_CORPUS}, i.e. **2,290**. This is *not* the number of `marks: ["woc"]` runs the emitted corpus ends up with — see {@link countEmittedMarkRuns}'s own doc comment and {@link WOC_RUNS_IN_CORPUS} for the reason the two differ. */
export const WOC_SPANS_IN_CORPUS = 2290;

/**
 * How many real, contiguous `marks: ["woc"]` runs the emitted corpus
 * actually carries — not the same as {@link WOC_SPANS_IN_CORPUS}. A
 * footnote landing between two words of the same red-letter utterance
 * splits one Words-of-Christ quotation into two raw `\wj`...`\wj*` pairs;
 * once the footnote is dropped, the one leftover joining space carries no
 * mark of its own to keep them apart (`usfm/inlineMarks.ts`'s own
 * `foldWhitespaceIntoNeighbors` — a bare space has no color to preserve),
 * so the two spans reunite into one visual run. `content-schema.json`
 * itself has no way to record that two adjacent woc-marked nodes came from
 * separate source pairs, so the emitted run count, not the source pair
 * count, is the only meaningful thing to check on the output side.
 */
export const WOC_RUNS_IN_CORPUS = 2077;

/**
 * How many `\qs`/`\qs*` markers the whole in-scope corpus declares — both
 * halves of every pair, measured directly, independently of
 * `tokenize.ts`/`segmentVerses.ts` — **148**, unchanged at the 81-book
 * scope: zero `\qs` markers occur anywhere in the 15 deuterocanon books
 * (confirmed directly), since Selah is a Psalms-specific liturgical marker
 * and the one deuterocanon psalm (Psalm 151, `PS2`) carries none.
 */
export const SELAH_MARKERS_IN_CORPUS = 148;

/** How many Selah instances (`\qs`...`\qs*`) the whole in-scope corpus declares — half of {@link SELAH_MARKERS_IN_CORPUS}, i.e. **74**. Every one is its own short, self-contained "Selah." aside with no footnote ever interrupting it, so — unlike {@link WOC_SPANS_IN_CORPUS} — this figure equals the emitted run count exactly: 74 raw instances, 74 emitted `marks: ["i"]` runs. This counts `\qs` alone — see {@link VERSE_LEVEL_ITALIC_RUNS_IN_CORPUS} for the figure {@link countEmittedMarkRuns}'s own blanket, source-agnostic scan is actually checked against. */
export const SELAH_MARKS_IN_CORPUS = 74;

/**
 * How many `marks: ["i"]` runs the whole in-scope corpus emits at the top
 * level of ordinary verse content — {@link countEmittedMarkRuns}'s own
 * scan has no way to distinguish which construct produced a given run, so
 * this is the sum of every real source for one, not {@link
 * SELAH_MARKS_IN_CORPUS} alone: 74 from real `\qs` Selah instances, plus 1
 * more from Numbers 21:14's own real `\bk` book-title citation (Finding
 * 6) — **75**. `\add` contributes zero (WEBUS2020's own raw source never
 * carries one), and every deuterocanon `\ip`/Daniel-Greek `\bk` citation
 * lives inside a footnote body, never at this top level, so none of those
 * 28 more real spans (Numbers 21:14 aside) reach this count either — the
 * dedicated Numbers 21:14 check below (using {@link hasAnyMark}) is where
 * that one real verse-level instance is actually verified.
 */
export const VERSE_LEVEL_ITALIC_RUNS_IN_CORPUS = SELAH_MARKS_IN_CORPUS + 1;

/**
 * How many `\f`...`\f*` footnote spans the whole in-scope corpus declares —
 * counted directly, independently of `tokenize.ts`/`segmentVerses.ts` —
 * **1,854**: the 66-book canonical figure (1,130) plus 724 real `\f` spans
 * across the 15 deuterocanon books. Of those 724, 9 independently
 * re-classify `xrf` ("nothing but a reference", guide §6) — a shape the
 * canonical corpus never produces — see
 * {@link REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS} for the count and the
 * fix it required.
 */
export const FOOTNOTES_IN_CORPUS = 1854;

/**
 * How many raw `\f`-derived footnote bodies, out of {@link FOOTNOTES_IN_CORPUS}'s
 * 1,854, independently re-classify `xrf` — guide §6's "nothing but a
 * reference" test, re-derived here from each raw body via
 * {@link classifyFootnote}. **9**, all in the deuterocanon corpus (zero of
 * the 66 canonical books' 1,127 ever do): Baruch 1:11 ("See Deuteronomy
 * 11:21."), Baruch 2:25 ("See Jeremiah 32:36."), Wisdom 5:7 ("See Proverbs
 * 14:14."), Wisdom 11:4 ("See Deuteronomy 8:15; Psalms 114:8." — two
 * semicolon-joined targets), Sirach 24:15 ("See Exodus 30:34."), Sirach
 * 46:6 ("See Joshua 10:11"), 1 Maccabees 4:40 ("Compare Numbers 31:6."),
 * 1 Maccabees 7:17 ("Psalms 79:2, 3." — no lead-in word at all), 2
 * Maccabees 10:26 ("See Exodus 23:22."). Each resolves to a real
 * `bibleLink` via `usfm/references.ts`'s own `buildReferenceOnlyContent`
 * (every other `xrf` foot in the corpus, save the one
 * deliberately-unresolved Hebrews 1:6 case, carries a `bibleLink`).
 *
 * These 9 land in the emitted corpus's own `xrf` bucket, not the plain
 * `foot` bucket a `\f`-derived body normally lands in, so `main()` below
 * excludes them from the position-paired
 * {@link extractFootnoteBodiesIn}-vs-emitted-`foot`-object comparison —
 * the same adjustment that keeps that walk's two sides the same length,
 * book by book, that {@link INTRO_PARAGRAPHS_IN_CORPUS}'s own 16
 * `\ip`-derived pseudo-footnotes address from the other direction
 * (included rather than excluded).
 */
export const REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS = 9;

/**
 * How many real `\ip` ("introductory paragraph") blocks the whole in-scope
 * corpus declares — 16, all in the 15 deuterocanon books (Esther-Greek and
 * Sirach each carry two), wired into this whole-corpus loop only once
 * `_version.json` listed these books. Each becomes a real `foot` object on
 * that book's own verse 1:1 — see {@link extractIntroParagraphsIn}.
 */
export const INTRO_PARAGRAPHS_IN_CORPUS = 16;

/**
 * How many real `\+wh`...`\+wh*` pairs (a nested Hebrew-word-quotation
 * marker, always found inside a footnote's own `\ft`/`\fq` prose) the whole
 * in-scope corpus declares — **80**: the 66-book canonical figure (78)
 * plus 2 real pairs in the deuterocanon corpus, both in Daniel-Greek (1:2,
 * 2:31). Every pair produces exactly one emitted `{text, script: "H"}`
 * node (a `\+wh` span is always one contiguous Hebrew word in this corpus,
 * never split by anything else nested inside it), so this is also the
 * real, fixed-in-advance emitted `script: "H"` node count.
 */
export const HEBREW_SCRIPT_RUNS_IN_CORPUS = 80;

/**
 * How many real, contiguous Greek-script runs `splitScriptRuns(body, "G")`
 * finds across every independently-extracted footnote body in the whole
 * in-scope corpus — measured directly against the real corpus, not
 * predicted: **36** — the 66-book canonical figure (35, across 33 distinct
 * footnote bodies; two bodies each carry two separate Greek runs) plus 1
 * real bare-Greek run in the deuterocanon corpus (2 Maccabees 5:24's own
 * "Μυσάρχην" gloss, already tested by `footnotes.test.ts`'s own fixture).
 */
export const GREEK_SCRIPT_RUNS_IN_CORPUS = 36;

/**
 * How many real footnotes (Psalm 46:0, 90:0, 145:0 — confirmed by direct
 * measurement, not assumed) sit inside a `\d` Psalm superscription
 * preceding the chapter's own `\v 1`. Each is identified structurally by
 * {@link ExtractedFootnote.precededByUnclosedHeading}, never by matching
 * fixed body text — a fixed-text list would risk excluding the *wrong*
 * occurrence of an identical, otherwise-normal recurring boilerplate note
 * (Psalm 90:0's own "The Hebrew word rendered 'God' is 'Elohim'" is the
 * exact same wording this book also carries attached normally elsewhere).
 *
 * **Permanently 0, kept rather than deleted so the history stays
 * visible.** All three attach to their own superscription's `subtitle`
 * for real (`usfm/headings.ts`'s `buildSuperscriptionContent`/
 * `buildHeadingSpanContent`, reusing `buildFootnoteContent` directly), so
 * every raw `\f` body attaches somewhere and this constant never needs to
 * be subtracted from the position-paired comparison below —
 * {@link SUPERSCRIPTION_FOOTNOTES_IN_CORPUS} backs a positive assertion of
 * the same footnotes instead.
 */
export const FOOTNOTES_DEFERRED_TO_PHASE_6 = 0;

/**
 * Exactly 3 real footnotes (Psalm 46:0/90:0/145:0) sit inside a `\d` Psalm
 * superscription that precedes the chapter's own `\v 1` — confirmed by
 * {@link ExtractedFootnote.precededByUnclosedHeading}'s own structural
 * detection, never by matching fixed body text (see
 * {@link FOOTNOTES_DEFERRED_TO_PHASE_6}'s own doc comment). A plain,
 * positive structural check: these 3 specific footnotes really do sit
 * inside an unclosed heading, and they participate fully in the
 * position-paired comparison below — character-reconciling and
 * classifying correctly like every other footnote in the corpus, not
 * excluded from it.
 *
 * **5**: the 66-book canonical figure (3 — Psalm 46:0/90:0/145:0) plus 2
 * more once the deuterocanon corpus is in view — Psalm 151's own `\d`
 * superscription (`PS2` 1:1, an embedded "or, supernumerary" footnote) and
 * Daniel-Greek's own `\s1` section heading (`DAG` 3:24, "THE SONG OF THE
 * THREE HOLY CHILDREN"). `\s1` dispatches through the identical
 * `buildSpeakerHeading`/`buildHeadingSpanContent` path `\d` itself uses, so
 * the same embedded-footnote handling applies with zero code change —
 * confirmed by reading the real emitted JSON directly, not assumed from
 * the shared code path alone.
 */
export const SUPERSCRIPTION_FOOTNOTES_IN_CORPUS = 5;

/**
 * Of the 3 footnotes {@link SUPERSCRIPTION_FOOTNOTES_IN_CORPUS} names,
 * exactly one (Psalm 90:0's own "The Hebrew word rendered 'God' is
 * 'Elohim'") contains a `\+wh`-delimited Hebrew word.
 *
 * **Permanently 0, kept rather than deleted.** Psalm 90:0's own Hebrew
 * word attaches inside its own superscription's `subtitle`, the identical
 * `{text, script: "H"}` shape every other real instance gets — the
 * emitted total equals {@link HEBREW_SCRIPT_RUNS_IN_CORPUS} exactly, with
 * nothing left to subtract.
 */
export const HEBREW_SCRIPT_RUNS_DEFERRED_TO_PHASE_6 = 0;

/**
 * How many `\x`...`\x*` cross-reference spans the whole in-scope corpus
 * declares — counted directly by this verifier's own
 * {@link extractCrossReferencesIn}, independent of `tokenize.ts`/
 * `segmentVerses.ts`/`usfm/references.ts`'s own token-walking builder —
 * **363**: the 66-book canonical figure (340) plus 23 real `\x` spans
 * across the deuterocanon corpus (Tobit/Wisdom/1 Esdras/2 Esdras),
 * targeting real canonical books almost exclusively. The sole exception,
 * Wisdom 14:27's own self-reference to Wisdom 14:21, is resolvable now
 * that Wisdom itself is in-canon (`references.test.ts`'s own out-of-canon
 * fixture for this exact target still tests the rejection path directly,
 * independent of what any real version's own canon happens to contain).
 */
export const XREF_SPANS_IN_CORPUS = 363;

/**
 * How many real `bibleLink` nodes the whole in-scope corpus emits *before*
 * the cross-chapter split runs — **449**: the 66-book canonical figure
 * (409, of {@link XREF_SPANS_IN_CORPUS}'s own 340 spans' 410
 * semicolon-split targets, minus {@link UNRESOLVED_XREF_TARGETS_IN_CORPUS}'s
 * 1) plus 30 more from the deuterocanon corpus — 23 raw `\x` spans' worth
 * of targets (several multi-target, all resolving including Wisdom's own
 * now-in-canon self-reference) plus 10 from
 * {@link REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS}'s 9 real `\f`-derived
 * bodies (one, Wisdom 11:4, carries two semicolon-joined targets).
 */
export const BIBLE_LINKS_IN_CORPUS = 449;

/**
 * How many real `bibleLink` targets a real full import resolves to plain
 * text rather than a link — 1, Hebrews 1:6's own `"Deuteronomy 32:43 LXX"`,
 * a Septuagint-versification siglum suffix `usfm/references.ts`'s own
 * grammar is not confident about (guide §6/§8: "a wrong link is worse than
 * a missing one" — never guessed at). Zero real in-scope targets name a
 * book outside the 81-book canon (checked directly — see
 * `utils/usfm/__tests__/references.test.ts`'s own real, verbatim,
 * out-of-scope-book sourced fixture for the code path that handles this
 * case when it does occur elsewhere in the wider USFM corpus).
 */
export const UNRESOLVED_XREF_TARGETS_IN_CORPUS = 1;

/**
 * How many of this corpus's own `bibleLink`s the cross-chapter split
 * (`npm run audit-links <version> -- --fix`) turns into two — exactly 1,
 * the real WEBUS2020 Hebrews 11:34 finding (`"2 Kings 6:31—7:20"`, an
 * em-dash-joined range spanning 2 Kings 6 into 2 Kings 7, normalized to the
 * convention's en dash on split). Checked directly against every one of
 * the 410 real in-scope targets for a genuine `chapter:verse`-to-
 * `chapter:verse` dash shape — this is the only one. A real full import's
 * own final, post-split `bibleLink` node total is this plus
 * {@link BIBLE_LINKS_IN_CORPUS} — asserted as a relation, never a bare
 * figure (guide §6: a real run never rests in the pre-split state, so a
 * bare figure would break the moment the split actually runs).
 */
export const CROSS_CHAPTER_RANGES = 1;

/**
 * How many `\d` markers the whole in-scope corpus declares — 138 of them in
 * `20-PSAeng-web.usfm`, confirmed directly. Splits into
 * {@link ORDINARY_SUPERSCRIPTIONS_IN_CORPUS}
 * (117, → `subtitle`) and {@link ACROSTIC_HEADINGS_IN_CORPUS} (22, → Psalm
 * 119's own letter-name `heading`s) — the identical USFM tag for both, so
 * `usfm/headings.ts`'s `isAcrosticLetterName` is what actually tells them
 * apart, on both the importer's and this verifier's own side.
 *
 * **139, not 138** — plus 1 real `\d` superscription in the
 * deuterocanon corpus, Psalm 151's own (`PS2` 1:1) — the only deuterocanon
 * book with any Psalm-shaped superscription at all.
 */
export const SUPERSCRIPTIONS_IN_CORPUS = 139;

/**
 * {@link SUPERSCRIPTIONS_IN_CORPUS} minus the 22 real acrostic letter-name
 * markers — 117 ordinary Psalm superscriptions (116 canonical plus Psalm
 * 151's own), each landing as a real `subtitle` on its own psalm's verse 1.
 */
export const ORDINARY_SUPERSCRIPTIONS_IN_CORPUS = 117;

/** Psalm 119's own 22 real acrostic letter-name `\d` markers (ALEPH through TAV, including the combined "SIN AND SHIN" entry) — see `usfm/headings.ts`'s own `ACROSTIC_LETTER_NAMES` for the exact, measured list. Unchanged at the 81-book scope: the deuterocanon corpus carries no acrostic Psalm. */
export const ACROSTIC_HEADINGS_IN_CORPUS = 22;

/** The five Psalter book-division `\ms1` markers (BOOK 1 through BOOK 5), confirmed directly, all in `20-PSAeng-web.usfm`. Unchanged at the 81-book scope: the deuterocanon corpus carries no `\ms1` at all. */
export const BOOK_DIVISION_HEADINGS_IN_CORPUS = 5;

/**
 * Song of Solomon's own `\sp` speaker labels, confirmed directly, all 33 in
 * `23-SNGeng-web.usfm`. Unchanged at the 81-book scope: the deuterocanon
 * corpus carries no `\sp` at all — {@link SECTION_HEADINGS_IN_CORPUS} is
 * the deuterocanon corpus's own analogous construct (`\s1`), a different
 * raw marker sharing the same emitted `heading` shape (see
 * {@link SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS}).
 */
export const SPEAKER_HEADINGS_IN_CORPUS = 33;

/**
 * Baruch's and Daniel-Greek's own 5 real `\s1` per-pericope section
 * headings (3 in Baruch, 2 in Daniel-Greek) — dispatches through
 * `usfm/headings.ts`'s `buildSpeakerHeading`, the identical function `\sp`
 * itself uses (`usfm/segmentVerses.ts`'s own
 * `SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES` ternary), so its own emitted
 * `heading` node is indistinguishable in shape from a real `\sp` one — see
 * {@link SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS} for the combined emitted
 * total this verifier can actually observe.
 */
export const SECTION_HEADINGS_IN_CORPUS = 5;

/**
 * How many `heading`-shaped nodes (excluding the five `bookDivision`
 * headings, which carry their own distinct shape) the whole in-scope corpus
 * emits — {@link SPEAKER_HEADINGS_IN_CORPUS} (33, from `\sp`) plus
 * {@link SECTION_HEADINGS_IN_CORPUS} (5, from `\s1`) = 38. `\sp` and `\s1`
 * both dispatch through the identical `buildSpeakerHeading` function, and
 * `content-schema.json` itself has no way to record which raw marker
 * produced a given `heading` node — this verifier's own
 * {@link classifyHeadingNode} correctly buckets both as `"speaker"` (see
 * its own doc comment), so 38 is the only combined figure the emitted JSON
 * can actually be checked against; the two real markers' own separate raw
 * counts above are what distinguish them on the *source* side.
 */
export const SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS = 38;

/**
 * Asserted in code rather than left resting on an unverified claim (guide
 * §8: "a full-corpus run reads what the code actually does"): USFM's
 * table markers (`\tr` table row; `\tc1`-`\tc9`/`\tcr1`-`\tcr9` table
 * cell/right-aligned cell; `\th1`-`\th9`/`\thr1`-`\thr9` table header
 * cell/right-aligned header cell) occur zero times across the 81 in-scope
 * books — confirmed directly by {@link countTableMarkersIn}, not merely
 * assumed from an earlier, wider-corpus recon over the full 83-file
 * source.
 */
export const TABLE_MARKERS_IN_CORPUS = 0;

/**
 * How many emitted content-tree nodes anywhere in the corpus carry a real
 * `strong` attribute — **0**, a deliberate content decision, not a defect
 * this verifier caught. The importer can still attach every Strong's
 * number a USFM source carries (`strongs: false` only turns that off for
 * this corpus); a quality assessment found 44-56% of this corpus's (and
 * MSB2025's/ASV1901's) eBible-sourced Strong's tagging semantically
 * implausible — one Strong's number routinely smeared across several
 * unrelated English words in a verse — against under 1% for STEPBible's
 * own independently-tagged WEB edition. Both WEBUS2020 and MSB2025 (see
 * {@link MSB2025_EMITTED_STRONG_ATTRIBUTES_IN_CORPUS}) were regenerated
 * with `strongs: false` for that reason; this constant and
 * {@link countStrongAttributeNodes} lock that in as the permanent
 * expectation, not a temporary suppression to reverse later.
 */
export const STRONGS_ATTRIBUTES_IN_CORPUS = 0;

/**
 * Every constant above this point is WEBUS2020-specific — each one's own
 * doc comment says so, and `main()`'s own mismatch checks below are
 * written against them unconditionally. MSB2025 is a second real, shipped
 * version with its own, entirely different real totals, so its own
 * whole-corpus facts get their own, separately-named constants here rather
 * than overloading the WEBUS2020 ones or adding a version-id branch to
 * `main()` — this file's own `MSB2025_`-prefixed group, checked by
 * `verify.test.ts` directly against the real corpus, extends the same
 * pattern of a version-specific number in its own doc-commented constant to
 * a second version. `main()` itself is left untouched: retrofitting it to
 * compare against either version's own constants depending on which
 * `versionId` it was given would be exactly the kind of
 * per-version-conditional construct-handling this codebase avoids, and —
 * with MSB2025 exercising nothing beyond `\w`/`\v`/`\m`/`\c` (no footnotes,
 * no cross-references, no headings, no poetry) against `main()`'s own
 * dozens of WEBUS2020-shaped checks for constructs this corpus never
 * carries — would buy far more interface than these constants need to
 * prove.
 */

/**
 * How many verses the whole in-scope MSB2025 corpus's raw source declares —
 * every `\v` marker across all 66 real canonical files, independent of
 * `tokenize.ts`/`segmentVerses.ts`. **31,102** — one fewer than WEB's own
 * 81-book total's unrelated figure. The coincidence with ASV1901's own
 * 31,102 raw `\v` count is real but incidental — the two corpora do not
 * share a versification scheme, they simply agree at this one summary
 * digit.
 */
export const MSB2025_RAW_VERSES_IN_CORPUS = 31102;

/**
 * How many verse *records* the real importer emits for MSB2025 — 4 fewer
 * than {@link MSB2025_RAW_VERSES_IN_CORPUS}. Luke 17:36 and Acts 8:37/15:34/
 * 24:7 are real, traditionally-numbered, textually-disputed verses this
 * source still declares (a bare `\v N` with nothing at all following it,
 * not even a footnote — MSB2025 carries zero `\f`/`\x` anywhere) but
 * supplies no content for. `imports/guide.md`'s own already-established
 * rule for exactly this shape ("Omitted textual variants... Emit no verse
 * record at all") applies: `segmentVerses.ts`'s own `flush()` now skips
 * pushing a record when a verse's real content is nothing at all, rather
 * than falling back to a schema-invalid empty block — a real, generic gap
 * this phase's own full-corpus run surfaced for the first time (WEB's own
 * disputed verses always carry at least a footnote explaining the
 * omission, so this branch was dead code for that corpus until now).
 */
export const MSB2025_EMITTED_VERSES_IN_CORPUS = 31098;

/** How many chapters the whole in-scope MSB2025 corpus declares — every `\c` marker, summed across all 66 books' own `_version.json` entries. */
export const MSB2025_CHAPTERS_IN_CORPUS = 1189;

/**
 * How many raw `\m` markers the whole in-scope MSB2025 corpus declares —
 * **exactly equal to {@link MSB2025_RAW_VERSES_IN_CORPUS}**, not merely
 * close to it: every single `\v` in this corpus is immediately preceded by
 * its own bare `\m`, corpus-wide, with zero `\p`/`\nb`/`\q1`-`\q3`/`\b`
 * anywhere. This constant is about the *raw source* only — it no longer
 * implies the emitted `paragraph: true` count matches it too, now that
 * `usfm/paragraphNoise.ts` suppresses the emitted flag down to each
 * chapter's own first verse (see
 * {@link MSB2025_EMITTED_PARAGRAPH_FLAGS_IN_CORPUS}).
 */
export const MSB2025_RAW_PARAGRAPH_MARKERS_IN_CORPUS = 31102;

/**
 * How many emitted `paragraph: true` flags the real MSB2025 corpus
 * carries — **exactly equal to {@link MSB2025_CHAPTERS_IN_CORPUS}**, one
 * per chapter, not an incidental near-match. This corpus's real shape —
 * one bare `\m` before every surviving verse, never rare — meant the
 * plain paragraph-marker rule (`PARAGRAPH_MARKER_NAMES` already includes
 * `"m"`, added for WEB's own 80 rare instances) would otherwise put
 * `paragraph: true` on literally every verse's sole block: source noise
 * from the eBible export's own line-formatting tool, not real per-verse
 * paragraph structure. `usfm/paragraphNoise.ts`'s own
 * `suppressUniformParagraphNoise`, wired into `utils/importUsfm.ts`'s real
 * write path, detects this exact 100%-uniform, zero-exception shape and
 * strips the flag down to each chapter's own first verse — which is what
 * this constant, unlike {@link MSB2025_RAW_PARAGRAPH_MARKERS_IN_CORPUS},
 * actually measures.
 */
export const MSB2025_EMITTED_PARAGRAPH_FLAGS_IN_CORPUS = 1189;

/** How many emitted `break: true` flags the real MSB2025 corpus carries — zero, confirmed against the real, full emitted output: this corpus has no `\q1`-`\q3`/`\b` anywhere to produce one. */
export const MSB2025_EMITTED_BREAK_FLAGS_IN_CORPUS = 0;

/**
 * How many emitted content-tree nodes anywhere in the real MSB2025 corpus
 * carry a real `strong` attribute — **0**, the identical deliberate content
 * decision {@link STRONGS_ATTRIBUTES_IN_CORPUS}'s own doc comment explains
 * in full for WEBUS2020. MSB2025 previously carried 648,488 such nodes (one
 * per raw `\w` span — this source's own Strong's tagging never merges
 * adjacent words the way WEBUS2020's does) before being regenerated with
 * `strongs: false` for the identical reason.
 */
export const MSB2025_EMITTED_STRONG_ATTRIBUTES_IN_CORPUS = 0;

export interface BookCounts {
  /** How many `\v` markers the raw source carries. */
  readonly verses: number;
  /** How many `\c` markers the raw source carries. */
  readonly chapters: number;
  /** The highest chapter number any `\c` marker names — the figure `_version.json`'s own `chapters` field should equal. */
  readonly maxChapter: number;
}

/**
 * Independently counts `\v` and `\c` markers in one book's raw USFM
 * source, with a regex of its own — never `tokenize.ts`.
 */
export function countMarkersIn(source: string): BookCounts {
  const verseMatches = source.match(/\\v[ \t]+\d+/g) ?? [];
  const chapterMatches = [...source.matchAll(/\\c[ \t]+(\d+)/g)];
  const maxChapter = chapterMatches.reduce((max, match) => Math.max(max, Number(match[1])), 0);

  return { verses: verseMatches.length, chapters: chapterMatches.length, maxChapter };
}

/**
 * Independently counts every USFM table marker in one book's raw source —
 * `\tr`, `\tc1`-`\tc9`/`\tcr1`-`\tcr9`, `\th1`-`\th9`/`\thr1`-`\thr9` — with
 * a regex of its own, never `tokenize.ts`. The trailing `\b` anchor is load-
 * bearing for the same reason {@link countBlockMarkersIn}'s own anchor is:
 * without it, the bare `tr`/`tc`/`th` branch would also match inside an
 * unrelated marker name that merely starts with those letters. Spelling out
 * the numbered cell/header alternatives directly (rather than a bare
 * `\d+`-suffixed `tc`/`th`) keeps this from ever matching `\toc1`-`\toc3`
 * (front-matter table-of-contents entries, a real and frequent marker in
 * this corpus) — `toc1` starts with `t`, `o`, `c`, `1`; the letter right
 * after `\t` is `o`, which none of this pattern's alternatives permit.
 */
export function countTableMarkersIn(source: string): number {
  return (source.match(/\\t(?:r|cr?[1-9]|hr?[1-9])\b/g) ?? []).length;
}

export interface BlockMarkerCounts {
  /** Raw `\p`/`\m`/`\nb`/`\li1`/`\pi1`/`\mi` occurrences. */
  readonly paragraphMarkers: number;
  /** Raw `\q1`/`\q2`/`\q3`/`\b` occurrences. */
  readonly breakMarkers: number;
}

/**
 * Independently counts one book's own raw `\p`/`\m`/`\nb`/`\li1`/`\pi1`/`\mi`
 * and `\q1`/`\q2`/`\q3`/`\b` markers, with a regex of its own — never
 * `tokenize.ts`/`segmentVerses.ts`. The `\b` word-boundary anchor after
 * each marker name is load-bearing: without it, `\p` would also match
 * inside `\periph`, and `\m` inside `\mt1`/`\ms1` (real, unrelated markers
 * in this corpus) — matching the same fixed-string-or-proven-escaping
 * discipline already established for every other ad hoc marker check in
 * this file. `\li1`/`\pi1`/`\mi` (Ezra/Nehemiah's own embedded-letter
 * formatting) join this count — see
 * {@link PARAGRAPH_MARKERS_IN_CORPUS}'s own doc comment for the real gap
 * this closes. Naming them as whole alternatives, each still anchored by
 * the trailing `\b`, is what keeps `\p`'s own alternative from
 * accidentally matching just the leading "p" of "pi1" — a letter-to-letter
 * boundary is never a word boundary, so `\p\b` alone already cannot match
 * mid-word there either way, but spelling out `pi1` as its own full
 * alternative is the direct, unambiguous way to count it, not an
 * incidental side effect of the anchor.
 */
export function countBlockMarkersIn(source: string): BlockMarkerCounts {
  const paragraphMarkers = (source.match(/\\(?:p|m|nb|li1|pi1|mi)\b/g) ?? []).length;
  const breakMarkers = (source.match(/\\(?:q1|q2|q3|b)\b/g) ?? []).length;
  return { paragraphMarkers, breakMarkers };
}

/**
 * Independently walks one verse's own emitted `content` tree and counts
 * every `paragraph: true`/`break: true` flag, with its own recursive
 * descent — never `blockStructure.ts`'s `buildBlockContent`. Descends into
 * a `ContentNested` wrapper's own `content` property too, so this same
 * function keeps working unchanged if a future extension starts nesting
 * flagged blocks inside a `marks`/`strong`-bearing wrapper.
 */
export function countEmittedBlockFlags(content: unknown): { paragraph: number; break: number } {
  if (Array.isArray(content)) {
    return content.reduce(
      (totals, item) => {
        const sub = countEmittedBlockFlags(item);
        return { paragraph: totals.paragraph + sub.paragraph, break: totals.break + sub.break };
      },
      { paragraph: 0, break: 0 },
    );
  }

  if (content !== null && typeof content === "object") {
    const node = content as { paragraph?: unknown; break?: unknown; content?: unknown };
    let paragraph = node.paragraph === true ? 1 : 0;
    let brk = node.break === true ? 1 : 0;
    if ("content" in node) {
      const sub = countEmittedBlockFlags(node.content);
      paragraph += sub.paragraph;
      brk += sub.break;
    }
    return { paragraph, break: brk };
  }

  return { paragraph: 0, break: 0 };
}

/** One book's own raw inline-mark marker counts, independently derived by {@link countInlineMarkersIn}. */
export interface InlineMarkerCounts {
  /** Raw `\wj`/`\wj*` occurrences (both halves — see {@link WOC_MARKERS_IN_CORPUS}). */
  readonly wocMarkers: number;
  /** Raw `\qs`/`\qs*` occurrences (both halves — see {@link SELAH_MARKERS_IN_CORPUS}). */
  readonly selahMarkers: number;
}

/**
 * Independently counts one book's own raw `\wj`/`\wj*` and `\qs`/`\qs*`
 * markers, with a regex of its own — never `tokenize.ts`/
 * `segmentVerses.ts`/`inlineMarks.ts`. A trailing `\b` word boundary matches
 * both the open form (`\wj `) and the close form (`\wj*`) identically —
 * "j"/"s" is a word character, the space or `*` that follows either is not,
 * so the boundary fires either way — which is why each raw count already
 * carries both halves of every pair (see {@link WOC_MARKERS_IN_CORPUS}'s own
 * doc comment).
 */
export function countInlineMarkersIn(source: string): InlineMarkerCounts {
  const wocMarkers = (source.match(/\\wj\b/g) ?? []).length;
  const selahMarkers = (source.match(/\\qs\b/g) ?? []).length;
  return { wocMarkers, selahMarkers };
}

/**
 * Independently counts the real, contiguous runs of `mark`-carrying leaf
 * nodes across one verse's own emitted `content` tree — not how many nodes
 * carry the mark (one `\wj` span routinely produces a dozen separate
 * Strong's-tagged nodes, all `marks: ["woc"]`, for one span), but how many
 * separate *runs* of them survive, in source order. Descends into a
 * `ContentNested`/`heading`/`subtitle`/`paragraph` wrapper's own `content`
 * property the same way {@link countEmittedBlockFlags} does, treating every
 * leaf inside as carrying the wrapper's own mark too — this module itself
 * never emits such a wrapper, but this keeps the function correct
 * unchanged if a future one does.
 */
export function countEmittedMarkRuns(content: unknown, mark: string): number {
  const leaves: boolean[] = [];
  collectMarkedLeaves(content, mark, leaves);

  let runs = 0;
  for (let index = 0; index < leaves.length; index++) {
    if (leaves[index] && !leaves[index - 1]) runs++;
  }
  return runs;
}

/**
 * Recursion helper for {@link countEmittedMarkRuns} — appends one boolean
 * per leaf node to `leaves`, in document order, recording whether that
 * leaf carries `mark`. A wrapper node's own mark applies to every leaf
 * found inside it.
 */
function collectMarkedLeaves(content: unknown, mark: string, leaves: boolean[]): void {
  if (Array.isArray(content)) {
    for (const item of content) collectMarkedLeaves(item, mark, leaves);
    return;
  }

  if (content !== null && typeof content === "object") {
    const node = content as { marks?: unknown; content?: unknown };
    const hasMark = Array.isArray(node.marks) && node.marks.includes(mark);
    if ("content" in node) {
      const before = leaves.length;
      collectMarkedLeaves(node.content, mark, leaves);
      if (hasMark) for (let index = before; index < leaves.length; index++) leaves[index] = true;
      return;
    }
    leaves.push(hasMark);
    return;
  }

  // A bare string leaf, or any other non-object token — never carries a mark of its own.
  leaves.push(false);
}

/** One `\f`...`\f*` span's own real content, independently extracted. */
export interface ExtractedFootnote {
  /**
   * The concatenated `\ft`/`\fq`/`\fqa` text, `\fr`'s own reference label
   * dropped, `\+wh`/`\+wh*` delimiter syntax stripped (its own enclosed
   * Hebrew characters kept) — the plain-text shape both
   * {@link classifyFootnote} and the character-reconciliation check
   * compare against, independent of how `usfm/footnotes.ts` built the same
   * span into real nodes.
   */
  readonly plainText: string;
  /**
   * `true` when the nearest preceding `\v`/`\c`/`\d` marker before this
   * span is `\d` — i.e., this footnote sits inside a Psalm superscription
   * that precedes the chapter's own `\v 1`, where it attaches to that
   * superscription's own `subtitle` rather than to any verse (see
   * `usfm/headings.ts`'s own `buildHeadingSpanContent`, and
   * {@link FOOTNOTES_DEFERRED_TO_PHASE_6} for why this needed its own
   * detection in the first place). Detected structurally (a backward scan
   * for the nearest marker), never by matching this span's own text
   * against a fixed list — a list of known *bodies* would risk excluding
   * the wrong occurrence if the same boilerplate note (e.g. "The Hebrew
   * word rendered 'God' is 'Elohim'") also appears attached normally
   * elsewhere in the same book.
   */
  readonly precededByUnclosedHeading: boolean;
}

/** Marker names `usfm/segmentVerses.ts`'s own `HEADING_MARKER_NAMES` treats as opening a skip-until-next-marker span — mirrored here only to detect {@link ExtractedFootnote.precededByUnclosedHeading}, never to build or drop any heading content itself (that belongs to `usfm/headings.ts`). */
const HEADING_MARKER_PATTERN = /\\(?:d|ms1|sp|cl|s1)\b/g;
/** Matches a `\v`/`\c` marker — the boundary {@link precededByUnclosedHeading} checks a heading marker against to tell whether it has since closed. */
const VERSE_OR_CHAPTER_MARKER_PATTERN = /\\[vc]\b/g;

/**
 * `true` when the nearest `\v`/`\c` marker before `beforeIndex` in `source`
 * is further back (or absent) than the nearest heading marker
 * ({@link HEADING_MARKER_PATTERN}) — i.e., a heading marker has opened and
 * nothing has closed it since.
 */
function precededByUnclosedHeading(source: string, beforeIndex: number): boolean {
  const before = source.slice(0, beforeIndex);

  let lastHeadingIndex = -1;
  for (const match of before.matchAll(HEADING_MARKER_PATTERN)) lastHeadingIndex = match.index;
  if (lastHeadingIndex === -1) return false;

  let lastVerseOrChapterIndex = -1;
  for (const match of before.matchAll(VERSE_OR_CHAPTER_MARKER_PATTERN)) lastVerseOrChapterIndex = match.index;

  return lastHeadingIndex > lastVerseOrChapterIndex;
}

/** Matches one whole `\f`...`\f*` span, capturing everything between the open and its matching close — a regex of this verifier's own, never `tokenize.ts`. */
const FOOTNOTE_SPAN_PATTERN = /\\f\s?\+?\s*(.*?)\\f\*/gs;

/**
 * Splits a footnote span's own inner text at each `\fr`/`\ft`/`\fq`/`\fqa`/
 * `\fl` sub-marker boundary. `fqa` must be tried before `fq` in the
 * alternation — regex alternation matches the first alternative that
 * succeeds at a given position, so `fq|fqa` would match the 2-character
 * `fq` prefix of every real `\fqa` occurrence and leave its own trailing `a`
 * behind as a stray, spurious plain-text character (this bug produced a
 * real, wrong extra "a" in this verifier's own raw-body extraction for
 * every footnote using `\fqa` — e.g. 2 Chronicles 36:2, 1 Timothy 1:1 —
 * caught by this verifier's own character-reconciliation check disagreeing
 * with the importer's real, correctly-tokenized output, exactly the kind of
 * independent-mechanism bug guide §5 says this comparison exists to catch).
 *
 * `fl` — Esther-Greek's own footnote-label sub-marker, occurring
 * zero times in the 66-book canonical corpus — joined the alternation for
 * the identical reason `usfm/footnotes.ts`'s own `KEPT_SUB_MARKERS` did:
 * without it, this verifier's own independent extraction would disagree
 * with the real, corrected importer output the same way the pre-fix
 * importer itself once did, defeating the character-reconciliation check's
 * whole purpose for every Esther-Greek footnote.
 */
const FOOTNOTE_SUB_MARKER_PATTERN = /\\(fr|ft|fqa|fq|fl)\s*/;

/**
 * Independently extracts every `\f`...`\f*` span in `source`, in source
 * order — a regex of this verifier's own, never `tokenize.ts`/
 * `segmentVerses.ts`/`usfm/footnotes.ts`'s own token-walking builder (guide
 * §5). `\fr`'s own label is dropped (this repo's own already-established
 * convention — a print-pagination artifact, not content the
 * character-reconciliation check should expect
 * to find anywhere in the emitted JSON), and `\+wh`/`\+wh*`'s own delimiter
 * syntax is stripped, keeping the Hebrew characters it wraps (the
 * delimiter itself is markup, not content — the character-reconciliation
 * check cares about the letters, not the backslash-escaped marker name
 * that happened to bracket them in the source).
 */
export function extractFootnoteBodiesIn(source: string): ExtractedFootnote[] {
  const results: ExtractedFootnote[] = [];
  for (const match of source.matchAll(FOOTNOTE_SPAN_PATTERN)) {
    const parts = match[1].split(FOOTNOTE_SUB_MARKER_PATTERN);
    let body = "";
    for (let index = 1; index < parts.length; index += 2) {
      if (parts[index] === "fr") continue;
      body += parts[index + 1] ?? "";
    }
    // The close form (`\+wh*`) has nothing trailing it to consume — strip
    // it first. The open form (`\+wh`) is always followed by exactly one
    // mandatory marker-to-content separator space (`tokenize.ts`'s own
    // `skipSeparator()` convention), which is syntax, not content — strip
    // it together with the marker itself, in that order, or the separator
    // space is left behind as a stray leading space on the Hebrew word it
    // introduces (a second real bug this verifier's own character-
    // reconciliation check caught: Genesis 1:1's own "\+wh אֱלֹהִ֑ים\+wh*"
    // was coming out as "“ אֱלֹהִ֑ים”" with a phantom space, not "“אֱלֹהִ֑ים”").
    //
    // `\+bk`/`\+bk*` (a nested-form book-title citation, real only inside
    // Daniel-Greek's own 3 real footnotes) strips the same way, for a
    // related but no longer identical reason: `usfm/footnotes.ts`'s own
    // `buildFootnoteContent` does now dispatch specially on `\bk`/`\+bk`
    // (Finding 6 — the enclosed text gets `marks: ["i"]`, the same mark
    // `\fq`/`\fqa` already use), but the delimiters themselves are still
    // markup, never content — the mark lands on the emitted node as a
    // property, not as literal characters, so this verifier's own
    // character-only comparison strips them exactly as it always did.
    // {@link countNestedBkPairsIn} counts these same raw markers
    // independently, for a different purpose (its own doc comment).
    results.push({
      plainText: body
        .replace(/\\\+wh\*/g, "")
        .replace(/\\\+wh /g, "")
        .replace(/\\\+bk\*/g, "")
        .replace(/\\\+bk /g, ""),
      precededByUnclosedHeading: precededByUnclosedHeading(source, match.index),
    });
  }
  return results;
}

/** Collapses runs of whitespace to one space and trims — the same normalization every plain-text comparison in this file already uses, applied here so the character-reconciliation check is not defeated by a boundary space landing on a different side of a node split. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Matches one whole `\x`...`\x*` cross-reference span, capturing everything between the open and its matching close — a regex of this verifier's own, never `tokenize.ts`, the identical shape as {@link FOOTNOTE_SPAN_PATTERN} for the sibling construct. */
const XREF_SPAN_PATTERN = /\\x\s?\+?\s*(.*?)\\x\*/gs;

/** Splits an `\x` span's own inner text at each `\xo`/`\xt` sub-marker boundary — `\xo`'s own reference-locator label is dropped, keeping only `\xt`'s own target list (the identical already-established `\fr`-drop convention, `usfm/references.ts`'s own doc comment). */
const XREF_SUB_MARKER_PATTERN = /\\(xo|xt)\s*/;

/** One `\x`...`\x*` span's own real target list, independently extracted — the raw, semicolon-split target strings `usfm/references.ts`'s own resolver is compared against. */
export interface ExtractedCrossReference {
  /** Every `\xt`-listed target, semicolon-split, in source order. */
  readonly targets: readonly string[];
}

/**
 * Independently extracts every `\x`...`\x*` span in `source`, in source
 * order — a regex of this verifier's own, never `tokenize.ts`/
 * `segmentVerses.ts`/`usfm/references.ts`'s own token-walking builder
 * (guide §5), the identical relationship {@link extractFootnoteBodiesIn}
 * already has to `usfm/footnotes.ts`.
 */
export function extractCrossReferencesIn(source: string): ExtractedCrossReference[] {
  const results: ExtractedCrossReference[] = [];
  for (const match of source.matchAll(XREF_SPAN_PATTERN)) {
    const parts = match[1].split(XREF_SUB_MARKER_PATTERN);
    let targetText = "";
    for (let index = 1; index < parts.length; index += 2) {
      if (parts[index] === "xt") targetText += parts[index + 1] ?? "";
    }
    results.push({ targets: targetText.trim().split("; ") });
  }
  return results;
}

/**
 * Two literal separator strings a real, post-`--fix` corpus can carry
 * alongside real `bibleLink` nodes, neither one an unresolved target of its
 * own: `"; "`, `usfm/references.ts`'s own multi-target join, and the bare
 * en dash `utils/crossChapterLinks.ts`'s own `splitCrossChapterLink`
 * inserts between a cross-chapter range's own two split halves (that
 * module's own `EN_DASH` — duplicated here as a literal rather than
 * imported, since importing it would mean importing that module's own
 * split-performing code, which this verifier must never call — guide §5).
 * Measured directly against the real corpus after a real `--fix` run: the
 * genuine Hebrews 11:34 split leaves exactly this separator behind.
 */
const XREF_SEPARATOR_STRINGS = new Set(["; ", "–"]);

/**
 * Counts one emitted `xrf` footnote's own real `bibleLink` nodes versus
 * targets left as plain, unresolved text — neither separator string in
 * {@link XREF_SEPARATOR_STRINGS} is either, and both are skipped rather
 * than counted as an unresolved target.
 */
export function countXrefLinkNodes(content: unknown): { links: number; unresolved: number } {
  const items = Array.isArray(content) ? content : [content];
  let links = 0;
  let unresolved = 0;
  for (const item of items) {
    if (typeof item === "string" && XREF_SEPARATOR_STRINGS.has(item)) continue;
    if (typeof item === "string") {
      unresolved++;
      continue;
    }
    if (item !== null && typeof item === "object" && "bibleLink" in item) links++;
  }
  return { links, unresolved };
}

/**
 * Recursively collects every `foot` object across one verse's own emitted
 * `content` tree, in document order — descends into a `ContentNested`
 * wrapper's own `content` property, and a `subtitle`/`heading` wrapper's
 * own value too. This is what lets the 3 real footnotes embedded inside a
 * Psalm superscription (Psalm 46:0/90:0/145:0) be found at all: each one
 * sits inside a `{subtitle: [...]}` node's own array.
 */
function collectFootnotes(content: unknown, sink: { type: unknown; content: unknown }[]): void {
  if (Array.isArray(content)) {
    for (const item of content) collectFootnotes(item, sink);
    return;
  }
  if (content === null || typeof content !== "object") return;

  const node = content as {
    foot?: { type?: unknown; content?: unknown };
    content?: unknown;
    subtitle?: unknown;
    heading?: unknown;
  };
  if (node.foot !== undefined && node.foot !== null) sink.push({ type: node.foot.type, content: node.foot.content });
  if ("content" in node) collectFootnotes(node.content, sink);
  if ("subtitle" in node) collectFootnotes(node.subtitle, sink);
  if ("heading" in node) collectFootnotes(node.heading, sink);
}

/**
 * `true` when any node anywhere in `content` carries a non-empty `marks`
 * array — Numbers 21:14's own check: the `\bk` book-title citation is
 * plain text with no mark added, and this asserts that for
 * the *whole* verse, not just the citation's own span, since a wrongly
 * merged/re-tagged node elsewhere in the same verse would be just as real
 * a defect.
 */
function hasAnyMark(content: unknown): boolean {
  if (Array.isArray(content)) return content.some(hasAnyMark);
  if (content === null || typeof content !== "object") return false;
  const node = content as { marks?: unknown; content?: unknown };
  if (Array.isArray(node.marks) && node.marks.length > 0) return true;
  if ("content" in node) return hasAnyMark(node.content);
  return false;
}

/**
 * Recursively counts leaf nodes carrying `script: "H"`/`script: "G"` across
 * one verse's own emitted `content` tree — the same descent shape as
 * {@link collectFootnotes}/{@link collectMarkedLeaves}, counting nodes
 * rather than runs (a footnote's own Hebrew/Greek word is always its own
 * single node, never split across a mark boundary the way a Words-of-Christ
 * span can be, so "how many nodes" and "how many runs" coincide here — see
 * {@link HEBREW_SCRIPT_RUNS_IN_CORPUS}'s own doc comment). Descends into a
 * `subtitle`/`heading` wrapper's own value too — Psalm 90:0's own
 * `\+wh`-tagged Hebrew word sits inside its superscription's `subtitle`, a
 * place a plain verse-content tree never has.
 */
export function countScriptNodes(content: unknown, script: "H" | "G"): number {
  if (Array.isArray(content)) return content.reduce((total, item) => total + countScriptNodes(item, script), 0);
  if (content === null || typeof content !== "object") return 0;

  const node = content as {
    script?: unknown;
    content?: unknown;
    foot?: { content?: unknown };
    subtitle?: unknown;
    heading?: unknown;
  };
  let count = node.script === script ? 1 : 0;
  if ("content" in node) count += countScriptNodes(node.content, script);
  if (node.foot?.content !== undefined) count += countScriptNodes(node.foot.content, script);
  if ("subtitle" in node) count += countScriptNodes(node.subtitle, script);
  if ("heading" in node) count += countScriptNodes(node.heading, script);
  return count;
}

/**
 * Recursively counts leaf nodes carrying a real `strong` attribute across
 * one verse's own emitted `content` tree — the identical descent shape as
 * {@link countScriptNodes}, checking `strong` instead of `script`. Backs
 * {@link STRONGS_ATTRIBUTES_IN_CORPUS}/{@link MSB2025_EMITTED_STRONG_ATTRIBUTES_IN_CORPUS},
 * both fixed at 0 — the Strong's-tagging follow-up's own locking check that
 * neither shipped corpus's real, regenerated (`strongs: false`) output ever
 * quietly regains a `strong` value.
 */
export function countStrongAttributeNodes(content: unknown): number {
  if (Array.isArray(content)) return content.reduce((total, item) => total + countStrongAttributeNodes(item), 0);
  if (content === null || typeof content !== "object") return 0;

  const node = content as {
    strong?: unknown;
    content?: unknown;
    foot?: { content?: unknown };
    subtitle?: unknown;
    heading?: unknown;
  };
  let count = typeof node.strong === "string" ? 1 : 0;
  if ("content" in node) count += countStrongAttributeNodes(node.content);
  if (node.foot?.content !== undefined) count += countStrongAttributeNodes(node.foot.content);
  if ("subtitle" in node) count += countStrongAttributeNodes(node.subtitle);
  if ("heading" in node) count += countStrongAttributeNodes(node.heading);
  return count;
}

/** Raw `\d`/`\ms1`/`\sp` marker counts for one book. */
export interface HeadingMarkerCounts {
  /** Raw `\d` occurrences (both ordinary superscriptions and Psalm 119's own acrostic letter names — the identical tag, see {@link SUPERSCRIPTIONS_IN_CORPUS}). */
  readonly superscriptions: number;
  /** Raw `\ms1` occurrences. */
  readonly bookDivisions: number;
  /** Raw `\sp` occurrences. */
  readonly speakerLabels: number;
}

/**
 * Independently counts one book's own raw `\d`/`\ms1`/`\sp` markers, with a
 * regex of its own — never `tokenize.ts`/`segmentVerses.ts`. Each is a
 * single, short, unpaired marker name with nothing else in this corpus
 * sharing its own spelling, so the trailing `\b` anchor alone is enough
 * (the identical, already-established discipline {@link countBlockMarkersIn}'s
 * own doc comment describes for every other ad hoc marker check).
 */
export function extractHeadingMarkersIn(source: string): HeadingMarkerCounts {
  return {
    superscriptions: (source.match(/\\d\b/g) ?? []).length,
    bookDivisions: (source.match(/\\ms1\b/g) ?? []).length,
    speakerLabels: (source.match(/\\sp\b/g) ?? []).length,
  };
}

/** One `\d` span's own real text, independently extracted — stray `\w`/`\+w` tags and their own `strong` attribute stripped (see this module's own doc comment for why: two of Psalm 119's own 22 real acrostic markers, "HE" and "SIN AND SHIN", carry one because WEB's own tagger read a transliterated Hebrew letter name that happens to also be an ordinary English word), any embedded footnote stripped too (never present on a real acrostic marker, and not needed here — {@link extractFootnoteBodiesIn} already finds it independently, for the character-reconciliation check that construct gets on its own). */
export interface ExtractedSuperscription {
  /** The span's own real text, embedded `\w`/`\+w`/footnote markup stripped. */
  readonly plainText: string;
}

/**
 * Matches one whole `\d`...`\q1` span — every one of the 139 real in-scope
 * `\d` markers is followed by `\q1`, confirmed directly (not assumed) by
 * walking the raw source past every embedded `\w`/`\+w`/`\f` sub-span to
 * find each one's own real terminating marker. A regex of this verifier's
 * own, never `tokenize.ts`/`usfm/headings.ts`'s own token-walking
 * `buildHeadingSpanContent` (which stops at *any* marker, not just `\q1` —
 * the more general rule the importer needs since `\sp` can also end at
 * `\p`; this verifier only ever needs the one real shape `\d` itself
 * actually uses).
 */
const SUPERSCRIPTION_SPAN_PATTERN = /\\d[ \t]+(.*?)\\q1\b/gs;

/**
 * Independently extracts every `\d` span's own plain text, in source order
 * — a regex of this verifier's own, never `usfm/headings.ts`'s
 * `buildHeadingSpanContent` (guide §5).
 */
export function extractSuperscriptionsIn(source: string): ExtractedSuperscription[] {
  const results: ExtractedSuperscription[] = [];
  for (const match of source.matchAll(SUPERSCRIPTION_SPAN_PATTERN)) {
    const withoutFootnote = match[1].replace(/\\f\s?\+?\s*.*?\\f\*/gs, "");
    const plainText = withoutFootnote
      .replace(/\|strong="[^"]*"/g, "")
      .replace(/\\\+?w\*/g, "")
      .replace(/\\\+?w /g, "")
      .replace(/\s+/g, " ")
      .trim();
    results.push({ plainText });
  }
  return results;
}

/**
 * Matches one whole `\s1`...`\p` span — every one of the 5 real
 * in-scope `\s1` markers is followed by `\p`, confirmed directly against the
 * real `47-BAReng-web.usfm`/`66-DAGeng-web.usfm` source, the identical
 * "confirmed directly, not assumed" discipline {@link SUPERSCRIPTION_SPAN_PATTERN}'s
 * own `\d`...`\q1` shape already established for its own construct.
 */
const SECTION_HEADING_SPAN_PATTERN = /\\s1[ \t]+(.*?)\\p\b/gs;

/**
 * Independently extracts every `\s1` span's own plain text, in source order
 * — a regex of this verifier's own, never `usfm/headings.ts`'s
 * `buildHeadingSpanContent` (guide §5). Reuses {@link ExtractedSuperscription}
 * rather than a second, near-identical interface — the shape ("this span's
 * own plain text, embedded footnote already stripped") is exactly the same
 * one `\d` already needed; only the `\w`-tag-stripping step is dropped, since
 * zero real `\s1` instances carry a Strong's-tagged word (confirmed
 * directly, unlike `\d`'s own two acrostic-letter artifacts).
 */
export function extractSectionHeadingsIn(source: string): ExtractedSuperscription[] {
  const results: ExtractedSuperscription[] = [];
  for (const match of source.matchAll(SECTION_HEADING_SPAN_PATTERN)) {
    const withoutFootnote = match[1].replace(/\\f\s?\+?\s*.*?\\f\*/gs, "");
    results.push({ plainText: withoutFootnote.replace(/\s+/g, " ").trim() });
  }
  return results;
}

/**
 * Independently counts one book's own raw `\+bk`/`\+bk*` (nested-form book-
 * title citation) markers, both halves — the identical "each half matches
 * its own `\b` word boundary" counting convention {@link countInlineMarkersIn}'s
 * own doc comment already establishes for `\wj`/`\qs`. Deliberately does
 * *not* match the plain, non-nested `\bk`/`\bk*` form Numbers 21:14 and every
 * real `\ip` block's own book-title citation use — a literal `\+` immediately
 * after the backslash is required, so `\bk` (no `+`) never matches at all.
 */
export function countNestedBkPairsIn(source: string): number {
  return (source.match(/\\\+bk\b/g) ?? []).length;
}

/** Raw `\pc`/`\cp`/`\is1` marker counts for one book — real, in-scope, single-instance constructs each needing its own explicit chrome-drop accounting (`usfm/segmentVerses.ts`'s own `CHROME_DROPPED_MARKER_NAMES`), distinct from `\cl`'s own already-established count above. `\ide` joins none of these: it is already a member of {@link CHROME_MARKER_NAMES} (a front-matter marker every book in this corpus carries once), needing no new count of its own. */
export interface Phase9ChromeMarkerCounts {
  /** Raw `\pc` occurrences (2 Maccabees' own decorative dash divider). */
  readonly pc: number;
  /** Raw `\cp` occurrences (Psalm 151's own chapter-number override). */
  readonly cp: number;
  /** Raw `\is1` occurrences (Sirach's and Esther-Greek's own bare section-title labels for the `\ip` prose that follows). */
  readonly is1: number;
}

/**
 * Independently counts one book's own raw `\pc`/`\cp`/`\is1` markers, with a
 * regex of its own — never `tokenize.ts`/`segmentVerses.ts`. `\is1`'s own
 * trailing `\b` anchor keeps it from ever matching `\ip`'s own leading two
 * characters (a letter-to-digit transition, "s" to "1", is never itself a
 * word boundary either way, but the two marker names share no common prefix
 * at all, so this is stated for completeness rather than a real risk).
 */
export function countPhase9ChromeMarkersIn(source: string): Phase9ChromeMarkerCounts {
  return {
    pc: (source.match(/\\pc\b/g) ?? []).length,
    cp: (source.match(/\\cp\b/g) ?? []).length,
    is1: (source.match(/\\is1\b/g) ?? []).length,
  };
}

/**
 * Paired, character-style USFM markers whose own open/close tokens flow
 * through an `\ip` block's own prose rather than ending it — the same
 * marker names `tokenize.ts`'s own `PAIRED_MARKER_NAMES` treats as inline
 * (`usfm/footnotes.ts`'s own `buildIntroParagraphFootnote` stops at the
 * next `"marker"`-type token, which a paired marker's own open/close token
 * never is). Restated here as this verifier's own independent fact (guide
 * §5 — a small, individually-checkable name list, not a parsing mechanism)
 * rather than imported from `tokenize.ts` itself.
 */
const IP_INLINE_MARKER_NAMES = new Set(["w", "wh", "wj", "f", "x", "bk", "qs"]);

/**
 * Independently extracts every real `\ip` block's own plain prose text, in
 * source order — a regex-driven scan of this verifier's own, never
 * `usfm/footnotes.ts`'s token-walking `buildIntroParagraphFootnote`. An
 * `\ip` block's own real boundary is the next marker that is *not* one of
 * {@link IP_INLINE_MARKER_NAMES}'s own paired inline forms — confirmed
 * against all 16 real in-scope instances (14 end at `\c`, Esther-Greek's
 * own first block ends at its own second `\ip`, Sirach's own first block
 * ends at `\is1`); inline delimiters (`\bk`/`\bk*` and their `+`-nested
 * forms) are stripped, matching the emitted footnote's own plain-text
 * shape.
 *
 * Returned as {@link ExtractedFootnote}s (`precededByUnclosedHeading`
 * always `false` — a real `\ip` block always sits in front matter, before
 * any `\d`/`\ms1`/`\sp`/`\s1` heading marker could ever open) so `main()`
 * below can prepend them directly to a book's own real `\f`-derived
 * {@link extractFootnoteBodiesIn} list for the position-paired comparison.
 * Composing the two lists this way is safe because both share the property
 * that guarantees correct ordering: `usfm/segmentVerses.ts`'s own
 * end-of-book post-pass always places every `\ip`-derived footnote ahead of
 * the book's own verse 1:1 content, so it is always first in the emitted
 * footnote sequence — exactly where source order already puts the raw
 * `\ip` block itself (always before the book's first `\c`).
 */
export function extractIntroParagraphsIn(source: string): ExtractedFootnote[] {
  const markerPositions: { index: number; end: number; name: string }[] = [];
  for (const match of source.matchAll(/\\(\+)?([A-Za-z][A-Za-z0-9]*)(\*)?/g)) {
    markerPositions.push({ index: match.index, end: match.index + match[0].length, name: match[2] });
  }

  const results: ExtractedFootnote[] = [];
  for (let index = 0; index < markerPositions.length; index++) {
    if (markerPositions[index].name !== "ip") continue;

    let end = source.length;
    for (let next = index + 1; next < markerPositions.length; next++) {
      if (!IP_INLINE_MARKER_NAMES.has(markerPositions[next].name)) {
        end = markerPositions[next].index;
        break;
      }
    }

    const plainText = source
      .slice(markerPositions[index].end, end)
      .replace(/\\\+?(?:w|wh|wj|f|x|bk|qs)\*/g, "")
      .replace(/\\\+?(?:w|wh|wj|f|x|bk|qs)\b\|?[^\s\\]*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    results.push({ plainText, precededByUnclosedHeading: false });
  }
  return results;
}

/**
 * One emitted heading-like node's own real classification — an ordinary
 * Psalm superscription (`subtitle`), one of Psalm 119's own 22
 * acrostic letter names (`acrostic` — a `heading` carrying `type:
 * "acrostic"`), one of the five Psalter book-division headings
 * (`bookDivision` — a `heading` whose own value is an array starting with
 * a `marks: ["sc"]` node, the one shape `usfm/headings.ts`'s
 * `buildBookDivisionHeading` ever produces), or `speaker` — every other
 * `heading`, which now means both a Song of Solomon speaker label (`\sp`)
 * *and* a deuterocanon per-pericope section heading (`\s1`): both
 * dispatch through the identical `buildSpeakerHeading` function
 * (`usfm/segmentVerses.ts`'s own ternary), producing an indistinguishable
 * `heading` shape — see {@link SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS} for
 * the combined figure this bucket is checked against.
 */
export type HeadingKind = "subtitle" | "acrostic" | "bookDivision" | "speaker";

/** Classifies one emitted node as a {@link HeadingKind} by its shape — see that type's own doc comment for the distinguishing rule for each kind. Returns `undefined` for a node that carries neither a `subtitle` nor a `heading`. */
function classifyHeadingNode(node: { subtitle?: unknown; heading?: unknown; type?: unknown }): HeadingKind | undefined {
  if ("subtitle" in node) return "subtitle";
  if (!("heading" in node)) return undefined;
  if (node.type === "acrostic") return "acrostic";

  const heading = node.heading;
  const firstItem = Array.isArray(heading) ? heading[0] : undefined;
  const firstItemMarks =
    firstItem !== null && typeof firstItem === "object" ? (firstItem as { marks?: unknown }).marks : undefined;
  if (Array.isArray(firstItemMarks) && firstItemMarks.includes("sc")) return "bookDivision";

  return "speaker";
}

/**
 * Recursively finds every heading-like node across one verse's own
 * emitted `content` tree, classified by {@link classifyHeadingNode} — the
 * same descent shape {@link collectFootnotes}/{@link countScriptNodes}
 * already use for `content`, never descending *into* a heading/subtitle
 * node once found (this corpus never nests one heading inside another).
 */
export function collectHeadingBlocks(content: unknown, sink: HeadingKind[]): void {
  if (Array.isArray(content)) {
    for (const item of content) collectHeadingBlocks(item, sink);
    return;
  }
  if (content === null || typeof content !== "object") return;

  const node = content as { subtitle?: unknown; heading?: unknown; type?: unknown; content?: unknown };
  const kind = classifyHeadingNode(node);
  if (kind !== undefined) {
    sink.push(kind);
    return;
  }
  if ("content" in node) collectHeadingBlocks(node.content, sink);
}

/**
 * `true` when the real, single in-scope `\cl` span — everything between
 * `\cl` and the next `\c` marker — carries nothing but plain chrome text
 * (guide §6: "deleting a container deletes its contents," checked
 * directly rather than assumed). Any backslash anywhere in that whole
 * span (a footnote, a Strong's tag, anything else USFM might have hidden
 * inside it) fails this check outright — the span is required to be
 * nothing but plain prose, not merely to start with some.
 */
export function clSpanHostsNothingButChrome(source: string): boolean {
  const match = /\\cl\b([\s\S]*?)\\c\b/.exec(source);
  if (match === null) return false;
  const span = match[1];
  return !span.includes("\\") && span.trim().length > 0;
}

/**
 * Reads one USFM file's own `\id` value directly, with a regex of its own
 * — never `tokenize.ts`/`metadata.ts`'s `extractBookMetadata`.
 *
 * @returns The raw id, or `undefined` when the file carries no `\id` at
 *   all (front matter/glossary files are not expected to fail this — they
 *   are simply never looked up, since the caller only ever asks about ids
 *   `_version.json` already lists).
 */
function usfmIdOf(source: string): string | undefined {
  return /^\\id\s+(\S+)/.exec(source)?.[1];
}

/** Every real `.usfm` file in `sourceDir`, keyed by this repo's own registry book id. */
function usfmFilesByRegistryId(sourceDir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith(".usfm")) continue;
    const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const usfmId = usfmIdOf(source);
    if (usfmId === undefined) continue;
    files.set(resolveBookId(usfmId), file);
  }
  return files;
}

/** One book's own emitted verse file name, e.g. `01-GEN.json` — the version's own registry `order`, matching `utils/importUsfm.ts`'s own `bookFilename`. */
function bookFilename(order: number, id: string): string {
  return `${order.toString().padStart(2, "0")}-${id}.json`;
}

/** One verse record as it actually sits in the emitted JSON on disk — read back, never rebuilt from the importer's own in-memory shape. */
interface EmittedVerse {
  /** The book's own registry id. */
  readonly book: string;
  /** 1-based chapter number. */
  readonly chapter: number;
  /** 1-based verse number. */
  readonly verse: number;
  /** The verse's own emitted Graphai content tree, read as `unknown` since this verifier must not assume the importer's own `Content` type is what's actually on disk. */
  readonly content: unknown;
}

/**
 * The whole-corpus marker-inventory sweep (guide §5's character-
 * reconciliation harness applied one level up — not to a footnote's own
 * body, but to the *whole marker inventory*): every backslash-escaped
 * marker name this verifier finds anywhere in the 81 in-scope books must
 * fall into one of three named buckets, or be reported by name as a real
 * bug, never silently absorbed.
 *
 * `\+w`/`\+wh`'s own `+`-nested form is folded into `w`/`wh` here (the
 * identical equivalence `tokenize.ts`'s own `MARKER_PATTERN` already
 * establishes for the importer — this is the one static grammar fact, not
 * a parsing mechanism, both sides are supposed to agree on) — see
 * {@link markerNamesIn}.
 */

/**
 * Every marker name this importer's own token dispatch gives real content
 * handling to — verse/chapter boundaries, every paired marker
 * `tokenize.ts` itself recognizes, every paragraph-opening and
 * break-ending marker, the four heading constructs, and the
 * footnote/cross-reference sub-markers `usfm/footnotes.ts`/
 * `usfm/references.ts` each consume directly.
 *
 * Exported so a test can assert bucket membership directly — this file's
 * own design principle (guide §5) is full independent testability, not just
 * exercise via the `main()` CLI, the same reason {@link extractHeadingMarkersIn}
 * and every other extraction function here is already exported.
 *
 * A few names belong here for less obvious reasons: `s1` is a real
 * per-pericope section heading once the deuterocanon corpus is in view,
 * not the zero-occurrence marker it is in the 66-book canon alone (see
 * {@link CONFIRMED_ZERO_MARKER_NAMES}); `fl` is a footnote sub-marker,
 * joining `fr`/`ft`/`fq`/`fqa` in the same bucket for the identical
 * reason; `ip` is the textless-leading-footnote construct (see
 * {@link extractIntroParagraphsIn}), a real content handler in its own
 * right, not chrome; `add` and `qc` both already had real content
 * handling elsewhere in this importer — this table had simply never been
 * told.
 */
export const CONTENT_HANDLED_MARKER_NAMES = new Set([
  "v",
  "c",
  "w",
  "wh",
  "wj",
  "f",
  "x",
  "bk",
  "qs",
  "add", // tokenize.ts's PAIRED_MARKER_NAMES; segmentVerses.ts's insideAdd
  "p",
  "m",
  "nb",
  "li1",
  "pi1",
  "mi",
  "q1",
  "q2",
  "q3",
  "b",
  "d",
  "ms1",
  "sp",
  "s1",
  "qc", // SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES / buildAcrosticGlyphHeading
  "ip",
  "fr",
  "ft",
  "fq",
  "fqa",
  "fl",
  "xo",
  "xt",
]);

/**
 * Front-matter/chrome markers dropped by name, informational only, never
 * re-emitted as content
 * (`\toc1`-`\toc3`/`\id`/`\ide`/`\h`/`\mt1`-`\mt3`, already covered by
 * `_version.json`'s own merge) plus the `\cl` chapter-label-override
 * decision (see {@link clSpanHostsNothingButChrome}).
 *
 * Exported for the same test-visibility reason
 * {@link CONTENT_HANDLED_MARKER_NAMES} is.
 *
 * `pc` (2 Maccabees' own decorative dash divider), `cp` (Psalm 151's own
 * chapter-number override), and `is1` (Sirach's/Esther-Greek's own bare
 * section-title labels for the `\ip` prose that follows) are real,
 * in-scope, chrome-worthy markers only once the deuterocanon corpus is in
 * view — none occur in the 66-book canon alone. `s1`, despite looking like
 * a similar chrome-only heading label, is content-handled instead (see
 * {@link CONTENT_HANDLED_MARKER_NAMES}).
 */
export const CHROME_MARKER_NAMES = new Set([
  "cl",
  "toc1",
  "toc2",
  "toc3",
  "id",
  "ide",
  "h",
  "mt1",
  "mt2",
  "mt3",
  "pc",
  "cp",
  "is1",
]);

/**
 * Markers confirmed, by direct corpus measurement, to occur zero times
 * across the 81 in-scope books — asserted as a real, executed check below
 * (guide §8: "a full-corpus run reads what the code actually does," not
 * recon trusted blindly).
 *
 * Exported for the same test-visibility reason
 * {@link CONTENT_HANDLED_MARKER_NAMES} is.
 *
 * Only `ili`/`k` remain here — both real USFM markers this tokenizer's own
 * supported grammar could in principle carry, confirmed zero across all 15
 * deuterocanon files too, not just the 66 canonical ones. `fl`/`ip`/`s1`/
 * `pc`/`cp`/`is1` look like similarly rare candidates but are not zero once
 * the deuterocanon corpus is in view — see
 * {@link CONTENT_HANDLED_MARKER_NAMES}/{@link CHROME_MARKER_NAMES} for
 * where each is actually handled.
 */
export const CONFIRMED_ZERO_MARKER_NAMES = new Set(["ili", "k"]);

/**
 * Every distinct backslash-escaped marker name in `source`, `+`-nested or
 * not (`\+w`/`\+wh` fold into `w`/`wh`, `tokenize.ts`'s own equivalence) —
 * a regex of this verifier's own, never `tokenize.ts` itself.
 *
 * Exported for the same test-visibility reason
 * {@link CONTENT_HANDLED_MARKER_NAMES} is — `main()`'s own whole-corpus
 * sweep is WEBUS2020-specific (every mismatch it reports is checked against
 * that corpus's own fixed-in-advance constants), so a second version's own
 * marker-inventory sweep (MSB2025's, run from `verify.test.ts`) needs this
 * function directly rather than a second, duplicated regex.
 */
export function markerNamesIn(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/\\(\+)?([A-Za-z][A-Za-z0-9]*)(\*)?/g)) {
    names.add(match[2]);
  }
  return names;
}

/**
 * CLI entry point — runs every check this module's own top-of-file doc
 * comment describes against one real, on-disk version and exits non-zero
 * on the first mismatch.
 */
function main(): void {
  const [sourceDir, versionId] = process.argv.slice(2);
  if (!sourceDir || !versionId) {
    console.error("Usage: npx ts-node utils/usfm/verify.ts <source-dir> <version-id>");
    process.exit(1);
  }

  const version = getBibleVersion(versionId);
  if (version === undefined) {
    console.error(`${versionId}: no _version.json found`);
    process.exit(1);
  }
  const books = [...(version.books ?? [])].sort((a, b) => a.order - b.order);

  const filesByRegistryId = usfmFilesByRegistryId(sourceDir);
  const repoRoot = path.resolve(__dirname, "../..");
  const versionDir = path.join(repoRoot, "bible-versions", versionId);

  const mismatches: string[] = [];
  let verseTotal = 0;
  let chapterTotal = 0;
  let paragraphMarkerTotal = 0;
  let breakMarkerTotal = 0;
  let paragraphFlagTotal = 0;
  let breakFlagTotal = 0;
  let wocMarkerTotal = 0;
  let selahMarkerTotal = 0;
  let wocRunTotal = 0;
  let selahRunTotal = 0;
  let footnoteTotal = 0;
  let emittedFootnoteTotal = 0;
  let deferredFootnoteTotal = 0;
  let introParagraphTotal = 0;
  let referenceOnlyFootnoteTotal = 0;
  let hebrewPairTotal = 0;
  let hebrewNodeTotal = 0;
  let greekRunTotal = 0;
  let greekNodeTotal = 0;
  let strongAttributeTotal = 0;
  let mapTypeTotal = 0;
  const typeDistribution: Record<string, number> = { xrf: 0, var: 0, trn: 0, stu: 0, map: 0 };
  let characterMismatchCount = 0;
  let typeMismatchCount = 0;
  let xrefSpanTotal = 0;
  let emittedXrefFootnoteTotal = 0;
  let bibleLinkNodeTotal = 0;
  let unresolvedXrefTargetTotal = 0;

  // Headings/subtitles.
  let rawSuperscriptionTotal = 0;
  let rawOrdinarySuperscriptionTotal = 0;
  let rawAcrosticHeadingTotal = 0;
  let rawBookDivisionTotal = 0;
  let rawSpeakerLabelTotal = 0;
  let rawSectionHeadingTotal = 0;
  let emittedSubtitleTotal = 0;
  let emittedAcrosticHeadingTotal = 0;
  let emittedBookDivisionTotal = 0;
  let emittedSpeakerHeadingTotal = 0;
  let bkMarkerTotal = 0;
  let clMarkerTotal = 0;
  // USFM table markers, asserted at zero (see TABLE_MARKERS_IN_CORPUS).
  let tableMarkerTotal = 0;
  const unknownMarkerNames = new Set<string>();
  const confirmedZeroViolations: string[] = [];

  for (const book of books) {
    const file = filesByRegistryId.get(book._id);
    if (file === undefined) {
      mismatches.push(`${book._id}: no USFM source file found in ${sourceDir}`);
      continue;
    }

    const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const counts = countMarkersIn(source);
    const blockCounts = countBlockMarkersIn(source);
    const inlineCounts = countInlineMarkersIn(source);

    const emittedPath = path.join(versionDir, bookFilename(book.order, book._id));
    if (!fs.existsSync(emittedPath)) {
      mismatches.push(`${book._id}: no emitted verse file found at ${emittedPath}`);
      continue;
    }
    const emitted: EmittedVerse[] = JSON.parse(fs.readFileSync(emittedPath, "utf8"));

    if (emitted.length !== counts.verses) {
      mismatches.push(
        `${book._id}: ${emitted.length} verse(s) emitted; source declares ${counts.verses} \\v marker(s)`,
      );
    }
    if (counts.maxChapter !== book.chapters) {
      mismatches.push(
        `${book._id}: source's own highest chapter is ${counts.maxChapter}; _version.json declares ${book.chapters}`,
      );
    }
    if (counts.chapters !== counts.maxChapter) {
      mismatches.push(
        `${book._id}: source carries ${counts.chapters} \\c marker(s) but its own highest chapter number is ${counts.maxChapter} — a gap or duplicate chapter number`,
      );
    }

    verseTotal += counts.verses;
    chapterTotal += counts.maxChapter;
    paragraphMarkerTotal += blockCounts.paragraphMarkers;
    breakMarkerTotal += blockCounts.breakMarkers;
    wocMarkerTotal += inlineCounts.wocMarkers;
    selahMarkerTotal += inlineCounts.selahMarkers;

    for (const verse of emitted) {
      const flags = countEmittedBlockFlags(verse.content);
      paragraphFlagTotal += flags.paragraph;
      breakFlagTotal += flags.break;
      wocRunTotal += countEmittedMarkRuns(verse.content, "woc");
      selahRunTotal += countEmittedMarkRuns(verse.content, "i");
      hebrewNodeTotal += countScriptNodes(verse.content, "H");
      greekNodeTotal += countScriptNodes(verse.content, "G");
      strongAttributeTotal += countStrongAttributeNodes(verse.content);
    }

    // Footnotes. Raw bodies are extracted in source order; every raw
    // footnote participates in the position-paired comparison below,
    // including the 3 that sit inside a `\d` superscription's own
    // subtitle ({@link SUPERSCRIPTION_FOOTNOTES_IN_CORPUS}) — none
    // excluded. Emitted footnotes are collected in the emitted JSON's own
    // verse order — since the importer's own walk and this verifier's own
    // regex both read the book strictly front to back, the Nth raw span
    // and the Nth emitted `foot` object are the same footnote, letting
    // this check compare them directly rather than only totalling each
    // side.
    const rawFootnotes = extractFootnoteBodiesIn(source);
    const superscriptionFootnoteCount = rawFootnotes.filter((footnote) => footnote.precededByUnclosedHeading).length;

    // 9 real `\f` bodies, corpus-wide, independently re-classify
    // `xrf` (guide §6's own "nothing but a reference" test — real only in
    // the deuterocanon corpus, see {@link REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS})
    // and land in the emitted corpus's own `xrf` bucket, not the plain
    // `foot` bucket a `\f`-derived body normally lands in. Excluded here so
    // the position-paired walk below compares like with like; `\ip`-derived
    // pseudo-footnotes (see {@link extractIntroParagraphsIn}) are prepended
    // instead, since they
    // always precede a book's own real `\f` spans in source order and
    // always land in the same plain `foot` bucket.
    const referenceOnlyRawFootnotes = rawFootnotes.filter((footnote) => classifyFootnote(footnote.plainText) === "xrf");
    const nonXrfRawFootnotes = rawFootnotes.filter((footnote) => classifyFootnote(footnote.plainText) !== "xrf");
    const rawIntroParagraphs = extractIntroParagraphsIn(source);
    const pairableRawFootnotes = [...rawIntroParagraphs, ...nonXrfRawFootnotes];

    // Every `foot` object the emitted JSON carries, of *any* type — `\f`-
    // derived and `\x`-derived alike, since `collectFootnotes`'s own
    // recursive walk has no way to know which marker produced a given
    // `foot` object, only what it looks like once built. Split by type
    // immediately: every real `\x`-derived footnote always classifies
    // `xrf` (`usfm/references.ts`'s own `buildCrossReferenceContent` —
    // unconditionally), and so does a `\f`-derived one whose
    // own body is nothing but a reference — `type === "xrf"` still cleanly
    // separates the two buckets this verifier checks, just no longer
    // exactly along marker-provenance lines the way it does in the 66-book
    // canonical corpus alone.
    const allEmittedFootnotes: { type: unknown; content: unknown }[] = [];
    for (const verse of emitted) collectFootnotes(verse.content, allEmittedFootnotes);
    const emittedFootnotes = allEmittedFootnotes.filter((footnote) => footnote.type !== "xrf");
    const emittedXrefFootnotes = allEmittedFootnotes.filter((footnote) => footnote.type === "xrf");

    hebrewPairTotal += (source.match(/\\\+wh\*/g) ?? []).length;
    footnoteTotal += rawFootnotes.length;
    emittedFootnoteTotal += emittedFootnotes.length;
    deferredFootnoteTotal += superscriptionFootnoteCount;
    introParagraphTotal += rawIntroParagraphs.length;
    referenceOnlyFootnoteTotal += referenceOnlyRawFootnotes.length;

    // Cross-references. Every real in-scope `\x` span attaches to an
    // already-open verse (checked directly, corpus-wide: zero sit inside
    // an unclosed `\d` heading the way 3 real `\f` spans do), so — unlike
    // footnotes — there is no deferred count to subtract here. The emitted
    // `xrf` bucket's own real source is two markers: every
    // raw `\x` span, plus every reference-only `\f` body this book carries.
    const rawXrefs = extractCrossReferencesIn(source);
    xrefSpanTotal += rawXrefs.length;
    emittedXrefFootnoteTotal += emittedXrefFootnotes.length;
    if (rawXrefs.length + referenceOnlyRawFootnotes.length !== emittedXrefFootnotes.length) {
      mismatches.push(
        `${book._id}: ${rawXrefs.length} raw \\x...\\x* span(s) plus ${referenceOnlyRawFootnotes.length} reference-only \\f body(ies) but ${emittedXrefFootnotes.length} emitted xrf foot object(s)`,
      );
    }
    for (const emittedXref of emittedXrefFootnotes) {
      const { links, unresolved } = countXrefLinkNodes(emittedXref.content);
      bibleLinkNodeTotal += links;
      unresolvedXrefTargetTotal += unresolved;
    }

    if (pairableRawFootnotes.length !== emittedFootnotes.length) {
      mismatches.push(
        `${book._id}: ${pairableRawFootnotes.length} raw \\f...\\f*/\\ip span(s) (non-xrf) but ${emittedFootnotes.length} emitted foot object(s)`,
      );
    }

    const pairCount = Math.min(pairableRawFootnotes.length, emittedFootnotes.length);
    for (let index = 0; index < pairCount; index++) {
      const raw = pairableRawFootnotes[index];
      const emittedFootnote = emittedFootnotes[index];

      const rawType = classifyFootnote(raw.plainText);
      typeDistribution[rawType] = (typeDistribution[rawType] ?? 0) + 1;
      greekRunTotal += (() => {
        const split = splitScriptRuns(raw.plainText, "G");
        return typeof split === "string" ? 0 : split.filter((segment) => typeof segment !== "string").length;
      })();

      if (emittedFootnote.type === "map") mapTypeTotal++;
      if (emittedFootnote.type !== rawType) {
        typeMismatchCount++;
        mismatches.push(
          `${book._id} footnote #${index + 1}: verifier re-derived type "${rawType}" from the raw body, but the emitted foot carries "${String(emittedFootnote.type)}"`,
        );
      }

      const expectedText = normalizeWhitespace(raw.plainText);
      const actualText = normalizeWhitespace(flattenContentText(emittedFootnote.content));
      if (expectedText !== actualText) {
        characterMismatchCount++;
        mismatches.push(
          `${book._id} footnote #${index + 1}: raw body "${expectedText}" does not character-reconcile with emitted foot.content "${actualText}"`,
        );
      }
    }

    // Headings/subtitles. Raw counts, independent of
    // `usfm/headings.ts`'s own token-walking `buildHeadingSpanContent` —
    // {@link extractHeadingMarkersIn} for the three marker names, and
    // {@link extractSuperscriptionsIn} plus the shared, static
    // `isAcrosticLetterName` table for the ordinary/acrostic split (the
    // identical "small shared reference table, not a parsing mechanism"
    // relationship this file's own `resolveBookId`/`classifyFootnote`
    // imports already have — this module's own doc comment).
    const headingMarkers = extractHeadingMarkersIn(source);
    rawSuperscriptionTotal += headingMarkers.superscriptions;
    rawBookDivisionTotal += headingMarkers.bookDivisions;
    rawSpeakerLabelTotal += headingMarkers.speakerLabels;
    // `\s1` dispatches through the identical `buildSpeakerHeading`
    // function `\sp` itself uses, so its own raw count is tracked
    // separately from `\sp`'s (see {@link SECTION_HEADINGS_IN_CORPUS}) even
    // though the two share one emitted total (see
    // {@link SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS}).
    rawSectionHeadingTotal += extractSectionHeadingsIn(source).length;

    const rawSuperscriptions = extractSuperscriptionsIn(source);
    if (rawSuperscriptions.length !== headingMarkers.superscriptions) {
      mismatches.push(
        `${book._id}: ${headingMarkers.superscriptions} raw \\d marker(s) but ${rawSuperscriptions.length} extracted \\d...\\q1 span(s) — every real in-scope \\d is expected to end at \\q1`,
      );
    }
    for (const superscription of rawSuperscriptions) {
      if (isAcrosticLetterName(superscription.plainText)) rawAcrosticHeadingTotal++;
      else rawOrdinarySuperscriptionTotal++;
    }

    // Emitted counts — classified from the already-built JSON, never from
    // `usfm/blockStructure.ts`'s own construction code (guide §5).
    const headingKinds: HeadingKind[] = [];
    for (const verse of emitted) collectHeadingBlocks(verse.content, headingKinds);
    for (const kind of headingKinds) {
      if (kind === "subtitle") emittedSubtitleTotal++;
      else if (kind === "acrostic") emittedAcrosticHeadingTotal++;
      else if (kind === "bookDivision") emittedBookDivisionTotal++;
      else emittedSpeakerHeadingTotal++;
    }

    // Numbers 21:14's own \bk/\bk* book-title citation — `usfm/
    // segmentVerses.ts`'s own dedicated `insideBk` dispatch now tags its
    // enclosed text `marks: ["i"]` (Finding 6), the same mark `\qs`/`\add`
    // already use; the delimiters themselves still never appear in the
    // emitted text, exactly as before. Verified here, not merely assumed:
    // the raw corpus carries exactly 1 `\bk`/`\bk*` pair, and the one
    // verse that carries it emits at least one `marks: ["i"]` node in its
    // own content — no longer plain text, correcting this verifier's own
    // prior Q4 finding, which held only until Finding 6 landed.
    //
    // The identical `insideBk`/`marks: ["i"]` dispatch also now governs
    // every `\bk` citation inside a deuterocanon `\ip` block (17 pairs
    // across the 16 real `\ip` blocks, unevenly spread — Baruch and
    // Sirach's own first block each carry two, 2 Esdras carries three,
    // the rest one apiece) and every `\+bk` (nested-form) citation inside
    // Daniel-Greek's own 3 real footnotes (11 more pairs, real only
    // there) — but every one of those 28 more real spans lives inside a
    // `foot.content`, never at the top level of ordinary verse content,
    // so none of them is reachable from `hasAnyMark(numbers21_14.content)`
    // below or from {@link VERSE_LEVEL_ITALIC_RUNS_IN_CORPUS}'s own
    // verse-level scan — this verifier has no dedicated check confirming
    // their own marks land correctly, a real gap named rather than
    // silently left; `utils/usfm/__tests__/footnotes.test.ts` and
    // `utils/usfm/__tests__/segmentVerses.test.ts` cover them directly,
    // at the unit level, instead.
    bkMarkerTotal += (source.match(/\\bk\b/g) ?? []).length;
    if (book._id === "NUM") {
      const numbers21_14 = emitted.find((verse) => verse.chapter === 21 && verse.verse === 14);
      if (numbers21_14 === undefined) {
        mismatches.push("NUM: no emitted verse found for Numbers 21:14 — cannot verify the \\bk citation");
      } else {
        const text = flattenContentText(numbers21_14.content);
        if (!text.includes("Book of the Wars of")) {
          mismatches.push(`NUM 21:14: expected the \\bk book title's own real text, found "${text}"`);
        }
        if (!hasAnyMark(numbers21_14.content)) {
          mismatches.push(
            "NUM 21:14: expected the \\bk book title's own text to carry marks: [\"i\"] (Finding 6), found none",
          );
        }
      }
    }

    // Psalms' own \cl chapter-label override — dropped as chrome, but only
    // after confirming directly that nothing (no footnote, no other
    // content) was hosted inside it.
    clMarkerTotal += (source.match(/\\cl\b/g) ?? []).length;
    if (book._id === "PSA" && !clSpanHostsNothingButChrome(source)) {
      mismatches.push("PSA: the \\cl span hosts something other than plain chrome text — dropping it would lose real content");
    }

    // The zero-tables finding, re-measured directly against this book's
    // own real source rather than trusted forward from an earlier,
    // wider-corpus recon.
    tableMarkerTotal += countTableMarkersIn(source);

    // Every marker name this book's own raw source carries must be
    // accounted for — content-handled, chrome-dropped, or confirmed to
    // occur zero times. Anything else is named directly, never silently
    // absorbed.
    for (const name of markerNamesIn(source)) {
      if (!CONTENT_HANDLED_MARKER_NAMES.has(name) && !CHROME_MARKER_NAMES.has(name) && !CONFIRMED_ZERO_MARKER_NAMES.has(name)) {
        unknownMarkerNames.add(`${name} (${book._id})`);
      }
    }
    for (const name of CONFIRMED_ZERO_MARKER_NAMES) {
      const count = (source.match(new RegExp(`\\\\${name}\\b`, "g")) ?? []).length;
      if (count > 0) {
        confirmedZeroViolations.push(
          `${book._id}: \\${name} occurs ${count} time(s) — this marker was confirmed zero in-scope during planning, no longer true`,
        );
      }
    }
  }

  if (verseTotal !== VERSES_IN_CORPUS) {
    mismatches.push(`${verseTotal} verse(s) across the corpus; ${VERSES_IN_CORPUS} are fixed in advance`);
  }
  if (chapterTotal !== CHAPTERS_IN_CORPUS) {
    mismatches.push(`${chapterTotal} chapter(s) across the corpus; ${CHAPTERS_IN_CORPUS} are fixed in advance`);
  }
  if (paragraphMarkerTotal !== PARAGRAPH_MARKERS_IN_CORPUS) {
    mismatches.push(
      `${paragraphMarkerTotal} raw \\p/\\m/\\nb marker(s) across the corpus; ${PARAGRAPH_MARKERS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (paragraphFlagTotal !== EMITTED_PARAGRAPH_FLAGS_IN_CORPUS) {
    mismatches.push(
      `${paragraphFlagTotal} emitted paragraph:true flag(s) across the corpus; ${EMITTED_PARAGRAPH_FLAGS_IN_CORPUS} are fixed in advance (see EMITTED_PARAGRAPH_FLAGS_IN_CORPUS's own doc comment for why this differs from the raw marker count)`,
    );
  }
  if (breakMarkerTotal !== BREAK_MARKERS_IN_CORPUS) {
    mismatches.push(
      `${breakMarkerTotal} raw \\q1/\\q2/\\q3/\\b marker(s) across the corpus; ${BREAK_MARKERS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (breakFlagTotal !== BREAK_FLAGS_IN_CORPUS) {
    mismatches.push(
      `${breakFlagTotal} emitted break:true flag(s) across the corpus; ${BREAK_FLAGS_IN_CORPUS} are fixed in advance (see BREAK_FLAGS_IN_CORPUS's own doc comment for why this differs from the raw marker count)`,
    );
  }
  if (wocMarkerTotal !== WOC_MARKERS_IN_CORPUS) {
    mismatches.push(`${wocMarkerTotal} raw \\wj marker(s) across the corpus; ${WOC_MARKERS_IN_CORPUS} are fixed in advance`);
  }
  if (wocRunTotal !== WOC_RUNS_IN_CORPUS) {
    mismatches.push(
      `${wocRunTotal} emitted marks:["woc"] run(s) across the corpus; ${WOC_RUNS_IN_CORPUS} are fixed in advance (see WOC_RUNS_IN_CORPUS's own doc comment for why this differs from the raw \\wj-pair count)`,
    );
  }
  if (selahMarkerTotal !== SELAH_MARKERS_IN_CORPUS) {
    mismatches.push(
      `${selahMarkerTotal} raw \\qs marker(s) across the corpus; ${SELAH_MARKERS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (selahRunTotal !== VERSE_LEVEL_ITALIC_RUNS_IN_CORPUS) {
    mismatches.push(
      `${selahRunTotal} emitted marks:["i"] run(s) at the top level of verse content across the corpus; ${VERSE_LEVEL_ITALIC_RUNS_IN_CORPUS} are fixed in advance (${SELAH_MARKS_IN_CORPUS} real \\qs Selah instances plus 1 from Numbers 21:14's own \\bk citation, Finding 6)`,
    );
  }
  if (footnoteTotal !== FOOTNOTES_IN_CORPUS) {
    mismatches.push(`${footnoteTotal} raw \\f...\\f* span(s) across the corpus; ${FOOTNOTES_IN_CORPUS} are fixed in advance`);
  }
  if (deferredFootnoteTotal !== SUPERSCRIPTION_FOOTNOTES_IN_CORPUS) {
    mismatches.push(
      `${deferredFootnoteTotal} footnote(s) structurally detected inside a \\d/\\s1 superscription/section heading; ${SUPERSCRIPTION_FOOTNOTES_IN_CORPUS} are fixed in advance (Psalm 46:0/90:0/145:0/151:1, Daniel-Greek 3:24) — still a real, positive structural check even though Phase 6 no longer excludes them from pairing`,
    );
  }
  if (introParagraphTotal !== INTRO_PARAGRAPHS_IN_CORPUS) {
    mismatches.push(`${introParagraphTotal} raw \\ip block(s) across the corpus; ${INTRO_PARAGRAPHS_IN_CORPUS} are fixed in advance`);
  }
  if (referenceOnlyFootnoteTotal !== REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS) {
    mismatches.push(
      `${referenceOnlyFootnoteTotal} raw \\f body(ies) independently re-classify xrf ("nothing but a reference"); ${REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS} are fixed in advance`,
    );
  }
  // FOOTNOTES_DEFERRED_TO_PHASE_6 is permanently 0 — every raw \f body
  // still attaches somewhere. Two more real adjustments apply to this
  // relation: REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS's own 9 raw \f
  // bodies move *out* of this bucket (into the xrf one, asserted below),
  // and INTRO_PARAGRAPHS_IN_CORPUS's own 16 \ip-derived pseudo-footnotes
  // move *in* (they carry no raw \f span of their own at all).
  if (
    emittedFootnoteTotal !==
    FOOTNOTES_IN_CORPUS - FOOTNOTES_DEFERRED_TO_PHASE_6 - REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS + INTRO_PARAGRAPHS_IN_CORPUS
  ) {
    mismatches.push(
      `${emittedFootnoteTotal} emitted foot object(s) across the corpus; ${FOOTNOTES_IN_CORPUS} raw minus ${FOOTNOTES_DEFERRED_TO_PHASE_6} deferred to Phase 6 minus ${REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS} reference-only (moved to the xrf bucket) plus ${INTRO_PARAGRAPHS_IN_CORPUS} \\ip-derived = ${FOOTNOTES_IN_CORPUS - FOOTNOTES_DEFERRED_TO_PHASE_6 - REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS + INTRO_PARAGRAPHS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (mapTypeTotal !== 0) {
    mismatches.push(
      `${mapTypeTotal} emitted foot(s) carry type "map"; this corpus has no source signal for it — 0 are fixed in advance (guide §6: never stretch a guess into existence)`,
    );
  }
  if (hebrewPairTotal !== HEBREW_SCRIPT_RUNS_IN_CORPUS) {
    mismatches.push(
      `${hebrewPairTotal} raw \\+wh...\\+wh* pair(s) across the corpus; ${HEBREW_SCRIPT_RUNS_IN_CORPUS} are fixed in advance`,
    );
  }
  // HEBREW_SCRIPT_RUNS_DEFERRED_TO_PHASE_6 is permanently 0 — Psalm 90:0's
  // own \+wh-tagged Hebrew word attaches inside its superscription's
  // subtitle, so this equals HEBREW_SCRIPT_RUNS_IN_CORPUS exactly, no
  // subtraction, still the same relation as before.
  if (hebrewNodeTotal !== HEBREW_SCRIPT_RUNS_IN_CORPUS - HEBREW_SCRIPT_RUNS_DEFERRED_TO_PHASE_6) {
    mismatches.push(
      `${hebrewNodeTotal} emitted script:"H" node(s) across the corpus; ${HEBREW_SCRIPT_RUNS_IN_CORPUS} raw minus ${HEBREW_SCRIPT_RUNS_DEFERRED_TO_PHASE_6} deferred to Phase 6 = ${HEBREW_SCRIPT_RUNS_IN_CORPUS - HEBREW_SCRIPT_RUNS_DEFERRED_TO_PHASE_6} are fixed in advance`,
    );
  }
  if (greekRunTotal !== GREEK_SCRIPT_RUNS_IN_CORPUS) {
    mismatches.push(
      `${greekRunTotal} raw bare-Greek run(s) (splitScriptRuns) across the corpus; ${GREEK_SCRIPT_RUNS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (greekNodeTotal !== GREEK_SCRIPT_RUNS_IN_CORPUS) {
    mismatches.push(
      `${greekNodeTotal} emitted script:"G" node(s) across the corpus; ${GREEK_SCRIPT_RUNS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (xrefSpanTotal !== XREF_SPANS_IN_CORPUS) {
    mismatches.push(`${xrefSpanTotal} raw \\x...\\x* span(s) across the corpus; ${XREF_SPANS_IN_CORPUS} are fixed in advance`);
  }
  // The emitted xrf bucket's own real source is two markers — every raw
  // \x span (no footnote-style deferral applies here) plus
  // REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS's own 9 real \f bodies.
  if (emittedXrefFootnoteTotal !== XREF_SPANS_IN_CORPUS + REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS) {
    mismatches.push(
      `${emittedXrefFootnoteTotal} emitted xrf foot object(s) across the corpus; ${XREF_SPANS_IN_CORPUS} raw \\x spans plus ${REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS} reference-only \\f bodies = ${XREF_SPANS_IN_CORPUS + REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS} are fixed in advance`,
    );
  }
  if (unresolvedXrefTargetTotal !== UNRESOLVED_XREF_TARGETS_IN_CORPUS) {
    mismatches.push(
      `${unresolvedXrefTargetTotal} cross-reference target(s) left as plain text across the corpus; ${UNRESOLVED_XREF_TARGETS_IN_CORPUS} are fixed in advance (Hebrews 1:6's own siglum-suffixed "Deuteronomy 32:43 LXX")`,
    );
  }
  // Asserted as a relation (guide §6), never a bare figure: a real run's
  // own `regenerateDownstream` always calls `npm run audit-links <version>
  // -- --fix` before `npm run validate`, so this verifier — run against
  // whatever a real run actually left on disk — never finds the corpus
  // resting in its pre-split state. The bare pre-split figure
  // (`BIBLE_LINKS_IN_CORPUS`) and the number of splits that run performs
  // (`CROSS_CHAPTER_RANGES`) are each fixed and named individually above;
  // only their sum is a property this verifier can ever actually observe.
  if (bibleLinkNodeTotal !== BIBLE_LINKS_IN_CORPUS + CROSS_CHAPTER_RANGES) {
    mismatches.push(
      `${bibleLinkNodeTotal} emitted bibleLink node(s) across the corpus; ${BIBLE_LINKS_IN_CORPUS} pre-split plus ${CROSS_CHAPTER_RANGES} cross-chapter split(s) = ${BIBLE_LINKS_IN_CORPUS + CROSS_CHAPTER_RANGES} are fixed in advance`,
    );
  }

  // Headings/subtitles.
  if (rawSuperscriptionTotal !== SUPERSCRIPTIONS_IN_CORPUS) {
    mismatches.push(`${rawSuperscriptionTotal} raw \\d marker(s) across the corpus; ${SUPERSCRIPTIONS_IN_CORPUS} are fixed in advance`);
  }
  if (rawOrdinarySuperscriptionTotal !== ORDINARY_SUPERSCRIPTIONS_IN_CORPUS) {
    mismatches.push(
      `${rawOrdinarySuperscriptionTotal} raw \\d marker(s) classify as an ordinary superscription across the corpus; ${ORDINARY_SUPERSCRIPTIONS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (rawAcrosticHeadingTotal !== ACROSTIC_HEADINGS_IN_CORPUS) {
    mismatches.push(
      `${rawAcrosticHeadingTotal} raw \\d marker(s) classify as an acrostic letter name across the corpus; ${ACROSTIC_HEADINGS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (rawBookDivisionTotal !== BOOK_DIVISION_HEADINGS_IN_CORPUS) {
    mismatches.push(`${rawBookDivisionTotal} raw \\ms1 marker(s) across the corpus; ${BOOK_DIVISION_HEADINGS_IN_CORPUS} are fixed in advance`);
  }
  if (rawSpeakerLabelTotal !== SPEAKER_HEADINGS_IN_CORPUS) {
    mismatches.push(`${rawSpeakerLabelTotal} raw \\sp marker(s) across the corpus; ${SPEAKER_HEADINGS_IN_CORPUS} are fixed in advance`);
  }
  if (rawSectionHeadingTotal !== SECTION_HEADINGS_IN_CORPUS) {
    mismatches.push(`${rawSectionHeadingTotal} raw \\s1 marker(s) across the corpus; ${SECTION_HEADINGS_IN_CORPUS} are fixed in advance`);
  }
  if (emittedSubtitleTotal !== ORDINARY_SUPERSCRIPTIONS_IN_CORPUS) {
    mismatches.push(
      `${emittedSubtitleTotal} emitted subtitle node(s) across the corpus; ${ORDINARY_SUPERSCRIPTIONS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (emittedAcrosticHeadingTotal !== ACROSTIC_HEADINGS_IN_CORPUS) {
    mismatches.push(
      `${emittedAcrosticHeadingTotal} emitted acrostic heading node(s) across the corpus; ${ACROSTIC_HEADINGS_IN_CORPUS} are fixed in advance`,
    );
  }
  if (emittedBookDivisionTotal !== BOOK_DIVISION_HEADINGS_IN_CORPUS) {
    mismatches.push(
      `${emittedBookDivisionTotal} emitted book-division heading node(s) across the corpus; ${BOOK_DIVISION_HEADINGS_IN_CORPUS} are fixed in advance`,
    );
  }
  // \sp and \s1 both dispatch through buildSpeakerHeading and are
  // indistinguishable in the emitted JSON (see SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS's
  // own doc comment) — this is the one combined figure the emitted corpus
  // can actually be checked against, even though the raw side tracks the
  // two markers separately (rawSpeakerLabelTotal/rawSectionHeadingTotal,
  // asserted above).
  if (emittedSpeakerHeadingTotal !== SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS) {
    mismatches.push(
      `${emittedSpeakerHeadingTotal} emitted speaker/section heading node(s) across the corpus; ${SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS} are fixed in advance`,
    );
  }

  // Numbers 21:14's \bk, Psalms' \cl, and every deuterocanon \ip block's
  // own \bk citation — verified present and correctly handled rather than
  // merely assumed.
  if (bkMarkerTotal !== 36) {
    mismatches.push(
      `${bkMarkerTotal} raw \\bk/\\bk* marker(s) across the corpus; 36 (Numbers 21:14's own pair, plus 34 more across 17 pairs inside real \\ip blocks) are fixed in advance`,
    );
  }
  if (clMarkerTotal !== 1) {
    mismatches.push(`${clMarkerTotal} raw \\cl marker(s) across the corpus; 1 is fixed in advance`);
  }

  // The zero-tables finding, asserted in code rather than left resting on
  // an unverified recon claim.
  if (tableMarkerTotal !== TABLE_MARKERS_IN_CORPUS) {
    mismatches.push(
      `${tableMarkerTotal} raw USFM table marker(s) (\\tr/\\tc.../\\th...) across the corpus; ${TABLE_MARKERS_IN_CORPUS} are fixed in advance — this source was confirmed to carry no tables anywhere in the 66 in-scope books`,
    );
  }

  // The Strong's-tagging follow-up's own locking check (see
  // STRONGS_ATTRIBUTES_IN_CORPUS's own doc comment): this corpus was
  // deliberately regenerated with strongs: false, so zero emitted nodes
  // should ever carry a real strong attribute again.
  if (strongAttributeTotal !== STRONGS_ATTRIBUTES_IN_CORPUS) {
    mismatches.push(
      `${strongAttributeTotal} emitted node(s) carry a "strong" attribute across the corpus; ${STRONGS_ATTRIBUTES_IN_CORPUS} are fixed in advance — this corpus was deliberately regenerated with strongs: false (see STRONGS_ATTRIBUTES_IN_CORPUS's own doc comment)`,
    );
  }

  // The whole-corpus character-reconciliation sweep. Every marker name
  // found anywhere in the 81 in-scope books must be content-handled,
  // chrome-dropped, or confirmed to occur zero times — an unknown name is
  // a bug to name here, not to silently absorb.
  if (unknownMarkerNames.size > 0) {
    mismatches.push(`${unknownMarkerNames.size} unaccounted-for marker name(s) found: ${[...unknownMarkerNames].join(", ")}`);
  }
  if (confirmedZeroViolations.length > 0) {
    mismatches.push(...confirmedZeroViolations);
  }

  console.log(`Verse total: ${verseTotal} (${VERSES_IN_CORPUS} fixed in advance)`);
  console.log(`Chapter total: ${chapterTotal} (${CHAPTERS_IN_CORPUS} fixed in advance)`);
  console.log(
    `Paragraph markers: ${paragraphMarkerTotal} raw (${PARAGRAPH_MARKERS_IN_CORPUS} fixed in advance), ${paragraphFlagTotal} emitted (${EMITTED_PARAGRAPH_FLAGS_IN_CORPUS} fixed in advance)`,
  );
  console.log(
    `Break markers: ${breakMarkerTotal} raw, ${breakFlagTotal} emitted (${BREAK_MARKERS_IN_CORPUS} raw / ${BREAK_FLAGS_IN_CORPUS} emitted fixed in advance)`,
  );
  console.log(
    `Words-of-Christ markers: ${wocMarkerTotal} raw (${WOC_SPANS_IN_CORPUS} source spans fixed in advance), ${wocRunTotal} emitted marks:["woc"] run(s) (${WOC_RUNS_IN_CORPUS} fixed in advance)`,
  );
  console.log(
    // The console-only "fixed in advance" figure on the raw side was
    // SELAH_MARKS_IN_CORPUS (74, half the real pair count) before this
    // phase — the wrong constant for a raw marker total, though never a
    // real mismatch risk, since only the `if` check above (correctly
    // compared against SELAH_MARKERS_IN_CORPUS) can ever fail the run.
    // Fixed here while already touching this line for Finding 6's own
    // verse-level-run figure, below.
    `Selah markers: ${selahMarkerTotal} raw (${SELAH_MARKERS_IN_CORPUS} fixed in advance), ${selahRunTotal} emitted marks:["i"] run(s) at the top level of verse content (${VERSE_LEVEL_ITALIC_RUNS_IN_CORPUS} fixed in advance — ${SELAH_MARKS_IN_CORPUS} real Selah instances plus 1 from Numbers 21:14's own \\bk citation, Finding 6)`,
  );
  console.log(
    `Footnotes: ${footnoteTotal} raw \\f...\\f* span(s) (${FOOTNOTES_IN_CORPUS} fixed in advance) + ${introParagraphTotal} raw \\ip block(s) (${INTRO_PARAGRAPHS_IN_CORPUS} fixed in advance), ${emittedFootnoteTotal} emitted non-xrf foot object(s) — all attached, including ${deferredFootnoteTotal} inside a \\d/\\s1 superscription/section heading (${SUPERSCRIPTION_FOOTNOTES_IN_CORPUS} fixed in advance); ${referenceOnlyFootnoteTotal} raw \\f body(ies) resolve as real references instead (${REFERENCE_ONLY_FOOTNOTE_BODIES_IN_CORPUS} fixed in advance, Phase 10)`,
  );
  console.log(
    `  Type distribution (computed from the real corpus, not fixed in advance): xrf ${typeDistribution.xrf}, var ${typeDistribution.var}, trn ${typeDistribution.trn}, stu ${typeDistribution.stu}, map ${typeDistribution.map} (map is fixed at 0)`,
  );
  console.log(`  Per-footnote type mismatches (verifier's own re-derivation vs. the emitted foot): ${typeMismatchCount}`);
  console.log(`  Character-reconciliation mismatches: ${characterMismatchCount}`);
  console.log(
    `Original-script runs: ${hebrewPairTotal} raw \\+wh pairs / ${hebrewNodeTotal} emitted script:"H" node(s) (${HEBREW_SCRIPT_RUNS_IN_CORPUS} fixed in advance), ${greekRunTotal} raw bare-Greek run(s) / ${greekNodeTotal} emitted script:"G" node(s) (${GREEK_SCRIPT_RUNS_IN_CORPUS} fixed in advance)`,
  );
  console.log(
    `Cross-references: ${xrefSpanTotal} raw \\x...\\x* span(s) (${XREF_SPANS_IN_CORPUS} fixed in advance), ${emittedXrefFootnoteTotal} emitted xrf foot object(s) — ${bibleLinkNodeTotal} bibleLink node(s) (${BIBLE_LINKS_IN_CORPUS} pre-split + ${CROSS_CHAPTER_RANGES} cross-chapter split(s) fixed in advance), ${unresolvedXrefTargetTotal} target(s) left as plain text (${UNRESOLVED_XREF_TARGETS_IN_CORPUS} fixed in advance)`,
  );
  console.log(
    `Superscriptions: ${rawSuperscriptionTotal} raw \\d marker(s) (${SUPERSCRIPTIONS_IN_CORPUS} fixed in advance) — ${rawOrdinarySuperscriptionTotal} ordinary (${emittedSubtitleTotal} emitted subtitle node(s)), ${rawAcrosticHeadingTotal} acrostic (${emittedAcrosticHeadingTotal} emitted acrostic heading node(s))`,
  );
  console.log(
    `Book divisions: ${rawBookDivisionTotal} raw \\ms1 marker(s) (${BOOK_DIVISION_HEADINGS_IN_CORPUS} fixed in advance), ${emittedBookDivisionTotal} emitted heading node(s)`,
  );
  console.log(
    `Speaker/section labels: ${rawSpeakerLabelTotal} raw \\sp marker(s) (${SPEAKER_HEADINGS_IN_CORPUS} fixed in advance) + ${rawSectionHeadingTotal} raw \\s1 marker(s) (${SECTION_HEADINGS_IN_CORPUS} fixed in advance), ${emittedSpeakerHeadingTotal} combined emitted heading node(s) (${SPEAKER_OR_SECTION_HEADINGS_IN_CORPUS} fixed in advance)`,
  );
  console.log(
    `\\bk citations (Numbers 21:14 plus every deuterocanon \\ip block's own, non-nested form; Finding 6 — now tagged marks: ["i"], not plain text): ${bkMarkerTotal} raw marker(s) (36 fixed in advance); Psalms' own \\cl: ${clMarkerTotal} raw marker(s) (1 fixed in advance)`,
  );
  console.log(
    `Marker-inventory sweep: ${unknownMarkerNames.size} unaccounted-for marker name(s), ${confirmedZeroViolations.length} confirmed-zero marker(s) that turned out not to be zero`,
  );
  console.log(
    `Table markers (\\tr/\\tc.../\\th...): ${tableMarkerTotal} raw marker(s) across the corpus (${TABLE_MARKERS_IN_CORPUS} fixed in advance)`,
  );
  console.log(
    `Strong's attributes: ${strongAttributeTotal} emitted node(s) carry one (${STRONGS_ATTRIBUTES_IN_CORPUS} fixed in advance — this corpus was deliberately regenerated with strongs: false)`,
  );

  if (mismatches.length > 0) {
    console.error(`\n${mismatches.length} mismatch(es):`);
    for (const mismatch of mismatches) console.error(`  ${mismatch}`);
    process.exit(1);
  }

  console.log(
    "\nAll checks clean, at the real 81-book scope for the first time (Phase 10): every book's own verse/chapter count round-trips, every paragraph/break flag is accounted for, every Words-of-Christ/Selah run is accounted for, every footnote (including the 5 that sit inside a \\d/\\s1 superscription/section heading, and the 9 that independently re-classify as a real cross-reference instead) character-reconciles with its own real, typed foot object, every \\ip block resolves to a real footnote on its own book's verse 1:1, every cross-reference resolves to a real bibleLink or is accounted for as an explicitly left plain-text target, every heading/subtitle/book-division/speaker-or-section-label construct lands in its own real, classified shape, Numbers 21:14's \\bk citation now carries marks: [\"i\"] rather than plain text (Finding 6), and Psalms' own \\cl is verified rather than assumed, the whole-corpus marker inventory has nothing left unaccounted for, the corpus carries zero USFM table markers, and (the Strong's-tagging follow-up) zero emitted nodes carry a \"strong\" attribute.",
  );
}

if (require.main === module) main();
