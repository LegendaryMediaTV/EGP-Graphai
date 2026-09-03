import { ContentHeading, ContentObject, ContentSubtitle } from "../../types/Content";
import Footnote from "../../types/Footnote";
import { buildFootnoteContent, buildIntroParagraphFootnote } from "./footnotes";
import {
  buildAcrosticGlyphHeading,
  buildBookDivisionHeading,
  buildHeadingSpanContent,
  buildSpeakerHeading,
  buildSuperscriptionContent,
  headingSpanText,
  HeadingSpanResult,
  isAcrosticGlyphHeading,
  psalterBookDivisionNumber,
} from "./headings";
import { normalizeFractionText } from "../../functions/normalizeFractions";
import { attachFootToPieces, buildRunNodes, InlineMarkName, InlineTextPiece } from "./inlineMarks";
import { buildCrossReferenceContent, buildReferenceOnlyContent } from "./references";
import { tokenize } from "./tokenize";

/**
 * One block of a verse's own content, split at a `\p`/`\m`/`\nb`/`\q1`/
 * `\q2`/`\q3`/`\b`/`\c` boundary. `paragraph`/`break` mirror
 * `content-schema.json`'s own flags exactly; a block carrying neither is a
 * plain, unflagged run of text that joins directly onto its neighbor —
 * two blocks with no flag between them came from the same source line and
 * render with nothing separating them. `\b` and `\c` are both
 * boundaries here too, but unlike the others neither ever sets a flag on
 * the block it closes — each only opens the next block with
 * `paragraph: true` instead (see {@link VerseBlock.break} and the `\c`
 * dispatch below for why both get this treatment).
 */
export interface VerseBlock {
  /** The block's own plain text, with every mark/footnote/heading stripped — the fallback rendering when {@link nodes} is absent. */
  readonly text: string;
  /**
   * The block's own already-merged, Strong's/marks-aware content
   * (`usfm/inlineMarks.ts`'s `buildRunNodes`), present whenever the
   * block's raw text carried at least one `\w`/`\+w`/`\wj`/`\qs` event —
   * which is virtually always, given how densely WEBUS2020 tags Strong's
   * numbers. Absent for the rare block with none of those, which renders
   * from {@link text} alone (see `usfm/blockStructure.ts`).
   */
  readonly nodes?: readonly ContentObject[];
  /**
   * Whether a `\p`-family marker opened this block — or `\b` (a stanza
   * break) or `\c` (a chapter boundary) did, both of which give the block
   * they open the identical signal a `\p`-family marker would.
   */
  readonly paragraph?: boolean;
  /**
   * Whether a `\q1`/`\q2`/`\q3` ordinary poetry-line marker closed this
   * block. `\b` (a stanza break) and `\c` (a chapter boundary) deliberately
   * never set this — each leaves the block it closes clean instead, then
   * opens the next real block with {@link paragraph} in its place.
   */
  readonly break?: boolean;
  /**
   * A fully-built `subtitle`/`heading` object, standing alone as its own
   * array item — never merged with a neighboring text block, never
   * carrying `paragraph`/`break` itself (see `usfm/blockStructure.ts`'s
   * own doc comment for how this shape renders). `text` is still required
   * by this interface but is never read for a block shaped this way, so
   * it is set to `""`.
   */
  readonly headingContent?: ContentHeading | ContentSubtitle;
}

/** One verse's own segmentation record. `rawContent` is a diagnostic, plain-text collapse of the same underlying text {@link blocks} carries in richer, block-flagged form. */
export interface VerseRecord {
  /** This repo's own registry book id, stamped from the caller — never read from the source's own `\id` (see `usfm/metadata.ts`'s `resolveBookId`). */
  readonly book: string;
  /** Chapter number, from the nearest preceding `\c` marker. */
  readonly chapter: number;
  /** Verse number, from this record's own `\v` marker. */
  readonly verse: number;
  /** A diagnostic, plain-text collapse of this verse's own content — never written to disk; {@link blocks} is the real output. */
  readonly rawContent: string;
  /** This verse's own content, split into paragraph/break/heading-flagged blocks. */
  readonly blocks: readonly VerseBlock[];
}

/**
 * Unpaired markers that open a real prose paragraph — `\m`/`\nb`/`\li1`/
 * `\pi1`/`\mi` all behave identically to `\p` for this purpose (no indent
 * concept in the schema). Marks the *first* content-bearing block that
 * follows, wherever it falls (chapter start, mid-chapter, or immediately
 * before a verse boundary). A marker outside this set has zero effect on
 * block boundaries at all — without `\li1`/`\pi1`/`\mi` included here,
 * Ezra 8:2's own three `\li1`-tagged list items would merge into one
 * run-on block with no separation.
 */
const PARAGRAPH_MARKER_NAMES = new Set(["p", "m", "nb", "li1", "pi1", "mi"]);

/**
 * Unpaired markers that end an ordinary poetry line — `\q1`, `\q2`, and
 * `\q3` all behave identically. Marks the *last* content-bearing block
 * that precedes it, reaching backward across a verse or chapter boundary
 * when nothing has accumulated since the last one — the KJV1769
 * "same rule, two sides" convention, not a forward-looking paragraph.
 *
 * `\b` — the stanza-break marker, USFM's blank-line-between-poem-stanzas
 * convention — does *not* belong here, even though it looks like a fourth
 * poetry-line-ending marker. `\b` marks the opposite boundary: the line it
 * closes loses `break: true` entirely, and the next real block opens
 * `paragraph: true` instead, the identical signal
 * {@link PARAGRAPH_MARKER_NAMES} already gives — so it gets its own
 * dispatch branch below rather than sharing either set. `\c` (the chapter
 * marker) makes the identical `paragraph: true` promise on its own; see
 * its dispatch below for why. See
 * {@link suppressNextBareBreakAfterCleanBoundary} for the one real
 * interaction this creates with the set below.
 */
const BREAK_MARKER_NAMES = new Set(["q1", "q2", "q3"]);

/**
 * Unpaired markers whose own trailing text is pure chrome — a front-matter
 * or display convention with nothing hosted inside it that dropping would
 * silently lose. Dropped entirely, the same way front matter (`\toc1`-
 * `\toc3`, `\id`, `\ide`, `\h`, `\mt1`-`\mt3`) already is by the `started`
 * guard below.
 *
 * `\pc` (a decorative dash divider), `\cp` (a chapter-number override,
 * already harmless by position since `started` is always `false` where it
 * sits), and `\is1` (a bare section-title label for the `\ip` prose that
 * follows — `\ip` itself is real content, handled separately below, never
 * chrome) join `\cl` here for the same reason: each carries only measured,
 * in-scope text with nothing worth keeping. `\s1` looks like it belongs
 * here too, but it is a real per-pericope section heading in the
 * deuterocanon corpus, so it lives in
 * {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES} below instead.
 */
const CHROME_DROPPED_MARKER_NAMES = new Set(["cl", "pc", "cp", "is1"]);

/**
 * `\d` — a Psalm superscription, or one of Psalm 119's own acrostic
 * letter-name markers (the identical USFM tag; `usfm/headings.ts`'s
 * `buildSuperscriptionContent` classifies by content, never by position).
 * `\sp` — a Song of Solomon speaker label. `\s1` — a real per-pericope
 * section heading in the deuterocanon corpus, dispatched through the
 * identical plain-`heading` path `\sp` already uses (`usfm/headings.ts`'s
 * `buildSpeakerHeading`, reused directly rather than forked into a second,
 * parallel function — see the dispatch below). `\qc` — an acrostic letter
 * heading *when its own text is a letter name* (ASV1901's own Psalm 119
 * `\qc א ALEPH.`, carrying the real Hebrew glyph inline rather than a bare
 * transliteration: `usfm/headings.ts`'s `buildAcrosticGlyphHeading`, joined
 * here rather than forked into a parallel walk, since it needs the
 * identical "span to the next marker" shape the other three already have).
 * A `\qc` that is *not* a letter name is USFM's ordinary centered poetic
 * line — its own text is verse content, not a heading span — so it is
 * dispatched with `\q1`/`\q2`/`\q3` instead; `acrosticGlyphSpanAt` in the
 * walk below is the one place that decides which of the two a given `\qc`
 * is. All four are unpaired markers whose own trailing text ends
 * wherever the *next* marker of any kind begins
 * (`usfm/headings.ts`'s own `buildHeadingSpanContent`) and all four attach
 * to whatever real content comes next in source order — see
 * {@link pendingHeadingBlocks}'s own doc comment below for exactly how
 * "next" is determined, including across a verse boundary. This is also
 * what lets ASV1901's own `\qc` attach correctly for its first,
 * chapter-opening occurrence (Psalm 119's own `\qc א ALEPH.`, sitting
 * before `\v 1` ever opens): unlike the generic "text" branch, which the
 * `started` guard excludes at true chapter start (losing the text
 * outright), this dispatch queues the heading into
 * {@link pendingHeadingBlocks} unconditionally, with no dependency on
 * `started` at all — the identical mechanism that already lets an
 * ordinary `\d` Psalm superscription attach correctly at chapter start.
 */
const SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES = new Set(["d", "sp", "s1", "qc"]);

/**
 * USFM's major-section heading and its three deeper levels. Graphai's own
 * content schema has no heading level, so all four reduce to one ordinary
 * `heading` built from the marker's own printed text — and any of the four
 * whose text is a Psalter book-division label (`usfm/headings.ts`'s
 * `psalterBookDivisionNumber`) becomes the computed `Book <Ordinal>
 * (Psalms <start>–<end>)` heading instead.
 *
 * Only `\ms1` is attested on disk (ten markers, all Psalter divisions).
 * The other three are here because the alternative is silent corruption
 * rather than a missing feature: a marker that reaches the generic branch
 * below keeps `skipToNextMarker` false, so its heading text is swept into
 * the surrounding verse's own prose, where nothing downstream can see that
 * a heading was ever lost.
 */
const MAJOR_SECTION_MARKER_NAMES = new Set(["ms", "ms1", "ms2", "ms3"]);

/**
 * The parentheses a source prints around an `\mr` reference range —
 * display convention, never part of a reference — dropped before the text
 * is resolved into `bibleLink` targets, the same way `usfm/headings.ts`'s
 * `LETTER_NAME_PUNCTUATION` drops an acrostic heading's own display
 * punctuation before classifying it.
 */
const MAJOR_SECTION_REFERENCE_PARENTHESES = /^\s*\(|\)\s*$/g;

/**
 * Segments one book's raw USFM source into one verse record per `\v`
 * marker.
 *
 * Every construct-bearing marker (`\wj`'s own marks, poetry's own
 * break/paragraph flags, `\f`'s own footnote — `usfm/footnotes.ts`'s
 * `buildFootnoteContent` — `\x`'s own cross-reference —
 * `usfm/references.ts`'s `buildCrossReferenceContent` — and `\d`/`\sp`'s
 * own subtitle/heading — `usfm/headings.ts`'s `buildHeadingSpanContent`) is
 * handled for real, never collapsed to plain text; nothing is silently
 * dropped except pure chrome (see {@link CHROME_DROPPED_MARKER_NAMES}),
 * never part of the verse's own running prose to begin with.
 *
 * @param source - One book's raw USFM text.
 * @param book - This repo's own registry book id to stamp on every record
 *   (the caller's responsibility — see `usfm/metadata.ts`'s `resolveBookId`
 *   for why this must not be read from the source's own `\id` directly).
 * @param canonBookIds - The target version's own book ids, passed straight
 *   through to `usfm/references.ts`'s `buildCrossReferenceContent` for
 *   every `\x` span this book carries — see that function's own doc
 *   comment for why this must be the caller's already-loaded
 *   `_version.json` book list, never a `bible-versions/` disk read done
 *   here. Omitted (the default), a caller that does not care about
 *   canon-scoping — a unit test, most of them — accepts every book the
 *   registry knows, no restriction at all.
 * @param includeStrongs - `false` suppresses every `strong` attribute this
 *   walk would otherwise attach, at its one real attachment point (the
 *   `close "w"` branch below) — `utils/importUsfm.ts`'s own
 *   `ImportOptions.strongs` toggle. Defaults to `true`: every Strong's
 *   number the source carries is attached.
 */
export function segmentVerses(
  source: string,
  book: string,
  canonBookIds?: ReadonlySet<string>,
  includeStrongs = true,
): VerseRecord[] {
  const tokens = tokenize(source);
  const records: { book: string; chapter: number; verse: number; rawContent: string; blocks: VerseBlock[] }[] = [];

  let chapter = 0;
  let verse = 0;
  let pieces: string[] = [];
  let asidePieces: string[] = [];
  let started = false;
  /**
   * `true` from a {@link CHROME_DROPPED_MARKER_NAMES} marker until the next
   * marker of any kind clears it — suppresses that span's own plain text
   * and `\w`-wrapped words from joining the verse's content.
   */
  let skipToNextMarker = false;

  // Block-tracking state, layered onto the `pieces` walk above without
  // touching it: `blockPieces` accumulates the text of whichever block is
  // currently open; `currentVerseBlocks` holds every block already
  // finalized for the verse being built; `pendingParagraph` survives
  // across `flush()` calls on purpose (see below).
  let blockPieces: string[] = [];
  let currentVerseBlocks: VerseBlock[] = [];
  let pendingParagraph = false;

  /**
   * Set the moment a `\b` stanza break or a `\c` chapter marker is
   * dispatched; consulted, and always cleared, on the very next token that
   * isn't part of the gap itself. Without this guard, WEB's own bare-
   * `\q1`/`\q2`/`\q3` "stanza break, then resume" idiom would undo the
   * clean cut either marker just made: both `\b` and `\c` drop (or, for
   * `\c`, simply never carry forward) `break: true` from the line before
   * the gap, but a bare `\qN` with nothing of its own before the next real
   * content would otherwise run its own ordinary
   * {@link BREAK_MARKER_NAMES} dispatch and reach backward onto that same
   * line — adding a flag neither marker's own convention wants there
   * (`flushBlock`'s own doc comment: the reach-back's `if (!last.break)`
   * guard only ever adds the flag, never removes it, so it cannot tell
   * "never had one" apart from "deliberately cleared").
   *
   * Survives a whitespace-only text token in the gap (`tokenize()` never
   * merges a marker's own trailing newline away, so it becomes a genuine,
   * if content-free, text token); survives a `\c` marker itself, whether
   * or not a `\b` precedes it — the real shape this idiom takes at a
   * chapter boundary is `\b \c N \q1 \v M...`, or, with no `\b` at all,
   * just `\c N \q1 \v M...`; survives a
   * {@link MAJOR_SECTION_MARKER_NAMES} marker, which a Psalms book
   * division sits on — its own dispatch
   * consumes its own trailing text in the same jump, exactly the way
   * {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES} markers already do, so
   * that real, non-whitespace text never reaches this guard as its own
   * standalone token and clears it; and survives a
   * {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES} marker (`\d`/`\sp`/
   * `\s1`, and a `\qc` that really is a letter heading) the same way,
   * since a Psalm superscription routinely sits between the gap's own
   * start and the bare `\qN` that follows it — a `\qc` carrying a poetic
   * line instead is absorbed here exactly as a bare `\qN` is.
   * Cleared by anything else: real text, or any marker outside that
   * survivor list — deliberately narrower than "the next break-type
   * marker, whenever it comes," since it only ever catches the
   * *immediately* following one, matching how the idiom actually sits in
   * the raw source.
   */
  let suppressNextBareBreakAfterCleanBoundary = false;

  // Inline-marks tracking, layered onto the walk above the same way
  // `blockPieces` was: `blockInline` mirrors `blockPieces`'s own text,
  // piece by piece, but keeps each piece's own `strong`/active `marks`
  // instead of flattening them away. `insideWj`/`insideQs`/`insideAdd`/
  // `insideBk` persist across verse/block/chapter boundaries on purpose —
  // a `\wj` span routinely spans many paragraphs of red-letter discourse —
  // and are never reset by `flushBlock`/`flush`, unlike the per-block
  // state above. `insideAdd` (ASV1901's real `\add`/`\add*` — translator-
  // supplied words, USFM's own standard italics convention) mirrors
  // `insideQs`'s own shape exactly, mapping to the identical `marks:
  // ["i"]` — the same mark `imports/kjv/kjvContent.ts` already gives
  // KJV1769's own HTML-sourced equivalent construct. `insideBk` (USFM's
  // own standard "quoted book title" character style, real at Numbers
  // 21:14) maps to the identical `marks: ["i"]` for the same reason: the
  // user's own call was that ebible.org's own bold+italic HTML rendering
  // of `\bk` is that renderer's own presentational choice, not something
  // `\bk`'s own semantics require, so it reuses this pipeline's existing
  // italic mark rather than adding a new one.
  // `insideWord`/`pendingWordText` bridge one `\w`/`\+w` span's own
  // open/text/close token triple, since the word's text and its `strong`
  // attribute arrive on different tokens (see the `close`/"w" branch
  // below for why).
  let blockInline: InlineTextPiece[] = [];
  let insideWj = false;
  let insideQs = false;
  let insideAdd = false;
  let insideBk = false;
  let insideWord = false;
  let pendingWordText: string | undefined;

  /**
   * Every `\d`/`\sp`-built heading/subtitle block still waiting for a real
   * home, in source order. A heading's own real position is "immediately
   * before whichever content comes next" — which might still be *this*
   * verse (Song of Solomon 1:4's own mid-verse `\sp Friends`, sitting
   * between two blocks of the same verse) or might be the *next* one
   * (1:1's own trailing `\sp Beloved`, which belongs to verse 2, never
   * verse 1, even though the marker itself sits inside verse 1's own token
   * stream before the `\v 2` boundary — matching a real source's own
   * Song of Solomon 1:2 shape for the identical construct). Resolved in three
   * cooperating steps:
   *
   * 1. Every `d`/`sp` marker first force-flushes whatever was already
   *    accumulating ({@link flushBlock}`(false)`), so that content becomes
   *    its own complete block *before* the heading is even queued.
   * 2. {@link flushBlock}'s own real-block-push branch drains this queue
   *    immediately before pushing whatever new block just triggered it —
   *    so a heading queued earlier in the *same* verse lands directly
   *    ahead of the next real content in that same verse (the mid-verse
   *    case).
   * 3. `flush()` (a verse boundary) un-drains any *trailing* heading-only
   *    block(s) sitting at the end of the verse about to be finalized —
   *    step 2 will have drained them there prematurely if nothing real
   *    followed before the boundary — putting them back here so the
   *    *next* verse's own first real push (step 2, run again) picks them
   *    up instead.
   *
   * Persists across `flush()` calls on purpose, the same relationship
   * {@link pendingParagraph} already has to a verse boundary — a heading
   * queued in one verse can be *for* the next one.
   */
  let pendingHeadingBlocks: VerseBlock[] = [];

  /**
   * Every *Psalter book division* this book carries, in source order —
   * every {@link MAJOR_SECTION_MARKER_NAMES} marker `usfm/headings.ts`'s
   * `psalterBookDivisionNumber` accepts, and no other; every one it
   * rejects keeps its own printed text and goes through
   * {@link pendingHeadingBlocks} like any other heading instead.
   *
   * The repo's shipped convention replaces the source's literal "BOOK
   * 1"/"BOOK I" wording wholesale with a spelled-out ordinal plus a
   * computed chapter range, so the two numbers here are all the source has
   * to say: `ordinal`, the division's own printed numeral, and
   * `startChapter`, the chapter its range opens on.
   *
   * Unlike {@link pendingHeadingBlocks}, this never needs
   * same-verse-vs-next-verse resolution — a division heading always
   * belongs to its own chapter's verse 1 — so it resolves separately, in
   * one post-pass once every division and the book's own highest chapter
   * are known (see the end of this function).
   */
  const bookDivisions: { readonly ordinal: number; readonly startChapter: number }[] = [];

  /**
   * Every `\ip` block's own built footnote, in source order. Real
   * in-scope `\ip` blocks sit entirely in front matter, before `\c 1`
   * ever opens — `chapter` is still `0` and `started` still `false` the
   * whole time one is being read — so, like {@link bookDivisions},
   * this never needs same-verse-vs-next-verse resolution: every one is
   * always destined for the book's own lowest-numbered chapter's verse 1,
   * resolved in one post-pass once that chapter is known (see the end of
   * this function). Esther-Greek's and Sirach's own two-`\ip`-block books
   * push two entries here, in the same source order they appear in — the
   * post-pass then unshifts them onto verse 1 together, preserving that
   * order, rather than one node absorbing or overwriting the other (the
   * identical "two notes at one attachment point need two sibling nodes"
   * shape {@link attachFoot}'s own doc comment already established for
   * Acts 7:37).
   */
  const introParagraphFootnotes: Footnote[] = [];

  /**
   * Attaches one already-built `foot` (a footnote's or a cross-reference's)
   * to whatever text run its own marker immediately follows, splitting
   * that run if needed — automatic here, since `tokenize()` already places
   * a text-token boundary exactly at the marker's own position, so there
   * is never a run left to split mid-token. When nothing precedes it at
   * all in this block (Mark 16:9's own footnote opens its verse with
   * nothing before it), the note stands on its own —
   * `content-schema.json`'s own `minProperties: 1` allows a content object
   * whose only property is `foot`.
   *
   * When the last piece already carries a `foot` of its own, a second,
   * textless `{foot}` piece is pushed instead of overwriting it — a real
   * in-scope shape (a footnote and a cross-reference both anchored to the
   * same preceding word, with nothing at all between them, as in Acts
   * 7:37). A single `ContentObject` can carry only one `foot`, so the
   * second note needs its own node; overwriting would silently discard
   * one of the two.
   */
  const attachFoot = (foot: Footnote): void => attachFootToPieces(blockInline, foot);

  /**
   * The span belonging to the `\qc` marker at `markerIndex`, but only when
   * that `\qc` really is an acrostic letter heading
   * (`usfm/headings.ts`'s `isAcrosticGlyphHeading`) — `undefined` for a
   * `\qc` that is USFM's ordinary centered poetic line, whose trailing text
   * is verse content the main walk must read for itself.
   *
   * A pure lookahead: `buildHeadingSpanContent` consumes nothing and
   * mutates nothing, so a rejected peek is thrown away and the same tokens
   * are walked again as ordinary text.
   */
  const acrosticGlyphSpanAt = (markerIndex: number): HeadingSpanResult | undefined => {
    const span = buildHeadingSpanContent(tokens, markerIndex + 1);
    return isAcrosticGlyphHeading(span.pieces) ? span : undefined;
  };

  /**
   * The chapter a heading ending at `spanEndIndex` actually opens — the
   * one the *next* `\c` names when the heading is written ahead of it, and
   * the one already in scope otherwise.
   *
   * Both layouts are legal USFM and both are real: WEBUS2020 writes `\c 42
   * \ms1 BOOK 2`, ASV1901 writes `\ms1 BOOK II \c 42`. Reading the chapter
   * counter alone would make the second layout name the chapter *before*
   * the one the division opens, so the two layouts would print different
   * ranges for the identical construct.
   *
   * The scan stops at the first `\c` or `\v`, whichever comes first: a
   * heading with a verse between it and the next chapter marker belongs to
   * the chapter it is already in. Everything else in between is stepped
   * over, so an `\mr` sitting between the heading and its `\c` changes
   * nothing.
   */
  const chapterOpenedAfter = (spanEndIndex: number): number => {
    for (let at = spanEndIndex; at < tokens.length; at++) {
      const ahead = tokens[at];
      if (ahead.type !== "marker") continue;
      if (ahead.name === "c") return Number(ahead.value);
      if (ahead.name === "v") break;
    }
    return chapter;
  };

  /**
   * Finalizes whatever text has accumulated since the last block boundary
   * into a {@link VerseBlock}, tagging it `paragraph: true` if a `\p`-family
   * marker opened it and clearing that pending flag either way.
   *
   * When nothing has accumulated, a break-type marker reaches backward
   * instead — onto the last real block already finalized, checking
   * `currentVerseBlocks`'s own last block before reaching into past
   * records ("same rule, two sides" — a poetry-line marker always
   * attaches to whichever side of it has real text, forward or back).
   * Checking the current verse's own blocks first is what lets a
   * `\d`/`\sp`-forced early flush (see {@link pendingHeadingBlocks}) still
   * receive its own rightful `break: true` from whatever break-type marker
   * follows the heading. Skips over a trailing heading-only block to find
   * the real block behind it — never a candidate for `break: true` itself.
   *
   * One case falls out of this reach-back as a harmless no-op rather than
   * a lost flag: the very first block-affecting marker in a book, with
   * nothing whatsoever before it (Psalm 1's own opening `\q1`).
   *
   * The `\b`-then-bare-`\qN` "stanza break, then resume" idiom — and the
   * identical idiom at a chapter boundary — never reaches this function's
   * own `breakFlag` branch at all: `\b`'s and `\c`'s own dispatch always
   * call `flushBlock(false)`, so the line before the gap never gains
   * `break: true` in the first place, and
   * {@link suppressNextBareBreakAfterCleanBoundary} absorbs the bare
   * `\qN` that follows before it ever reaches this function's own
   * reach-back branch below. See that guard's own doc comment for why
   * this matters: this reach-back's `if (!last.break)` check can only
   * ever *add* `break: true`, never remove it, so without the guard it
   * would silently resurrect the very flag the gap was just left clean
   * of.
   */
  const flushBlock = (breakFlag: boolean): void => {
    const text = blockPieces.join("").replace(/\s+/g, " ").trim();
    blockPieces = [];
    const inline = blockInline;
    blockInline = [];
    const nodes = inline.length > 0 ? buildRunNodes(inline) : undefined;

    // `inline` mirrors `text` piece by piece for every ordinary word/prose
    // piece, but a standalone footnote piece — nothing preceding it to
    // attach to (see `attachFoot`'s own doc comment above) — contributes to
    // `inline` alone, never to `blockPieces`/`text`, since a footnote is
    // not running verse prose. Checking `nodes` here rather than raw
    // `inline.length` matters: a
    // trailing whitespace-only piece (real at the piece level, gone once
    // `buildRunNodes`'s own edge-trim runs) must not, by itself, manufacture
    // a spurious empty block. Without this check, a block that is *only* a
    // footnote would look empty and be silently absorbed by the break-flag
    // reach-back below instead of surviving as its own real block.
    if (text.length > 0 || (nodes !== undefined && nodes.length > 0)) {
      const paragraphFlag = pendingParagraph;
      pendingParagraph = false;
      // Any heading queued since the last real push belongs directly
      // ahead of the block about to be pushed — see
      // {@link pendingHeadingBlocks}, step 2.
      if (pendingHeadingBlocks.length > 0) {
        currentVerseBlocks.push(...pendingHeadingBlocks);
        pendingHeadingBlocks = [];
      }
      currentVerseBlocks.push({
        text,
        ...(nodes !== undefined && nodes.length > 0 ? { nodes } : {}),
        ...(paragraphFlag ? { paragraph: true as const } : {}),
        ...(breakFlag ? { break: true as const } : {}),
      });
      return;
    }

    if (breakFlag) {
      let index = currentVerseBlocks.length - 1;
      while (index >= 0 && currentVerseBlocks[index].headingContent !== undefined) index--;
      if (index >= 0) {
        const last = currentVerseBlocks[index];
        if (!last.break) currentVerseBlocks[index] = { ...last, break: true };
        return;
      }

      for (let recordIndex = records.length - 1; recordIndex >= 0; recordIndex--) {
        const blocks = records[recordIndex].blocks;
        if (blocks.length === 0) continue;
        const last = blocks[blocks.length - 1];
        if (!last.break) blocks[blocks.length - 1] = { ...last, break: true };
        return;
      }
      // Nothing anywhere earlier in this book — a harmless no-op; see
      // this function's own doc comment above.
    }
  };

  /**
   * Finalizes whatever has accumulated for the current verse into a
   * {@link VerseRecord} and pushes it onto `records` — called at every
   * `\v`/`\c` boundary, and once more after the last token. A no-op before
   * the book's first `\v` (`started` still `false`). The two real edge
   * cases it handles are documented at their own branches below: a verse
   * whose entire content is a textual-variant footnote, and a verse with no
   * fallback content at all.
   */
  const flush = (): void => {
    if (!started) return;
    const rawContent = pieces.join("").replace(/\s+/g, " ").trim();
    // A textual-variant footnote can be a verse's *entire* USFM content,
    // with no surrounding verse text (Luke 17:36 is one real example) —
    // WEB omits the disputed reading and only notes it. The `open "f"`
    // branch above pushes a standalone `{foot: ...}` piece into
    // `blockInline` even with nothing preceding it, and `flushBlock`'s own
    // `nodes`-based check (see its own doc comment) lets that survive into
    // a real block — `blocks` below then carries these verses as a content
    // object whose only property is `foot`.
    //
    // `rawOrFallback`/`asidePieces` keep `rawContent` — a diagnostic field
    // only, never written to disk — populated with real text even for
    // these verses: the `open "f"` branch feeds the same, already-stripped
    // text into `asidePieces` for exactly this reason. A cross-reference
    // never feeds `asidePieces` at all, since no in-scope `\x` span is
    // ever a whole verse's own entire content the way a footnote can be.
    const rawOrFallback = rawContent.length > 0 ? rawContent : asidePieces.join("").replace(/\s+/g, " ").trim();

    flushBlock(false);

    // Step 3 of {@link pendingHeadingBlocks}: a heading drained onto the
    // end of `currentVerseBlocks` belongs to *this* verse only if real
    // content actually followed it. When it is still sitting at the very
    // end with nothing real after it, that drain happened one verse too
    // early — reclaim it, in original order, back into the pending queue so
    // the *next* verse's own first real push picks it up instead.
    let trailingHeadingCount = 0;
    while (
      trailingHeadingCount < currentVerseBlocks.length &&
      currentVerseBlocks[currentVerseBlocks.length - 1 - trailingHeadingCount].headingContent !== undefined
    ) {
      trailingHeadingCount++;
    }
    if (trailingHeadingCount > 0) {
      const reclaimed = currentVerseBlocks.splice(currentVerseBlocks.length - trailingHeadingCount, trailingHeadingCount);
      pendingHeadingBlocks = [...reclaimed, ...pendingHeadingBlocks];
    }

    // A narrower case than the one above: a verse with no fallback at
    // all, not even a footnote — a source with zero \f/\x anywhere in its
    // corpus (MSB2025's own Acts 8:37) can still number a disputed verse
    // with nothing behind the number. Emitting no record at all is the
    // right call here: a placeholder block isn't an option either way,
    // since `content-schema.json` requires `content` to be a non-empty
    // string, and this shape has no real content to give it.
    // WEB's own disputed verses never reach this branch — every one keeps
    // at least its own footnote as a real block (see the comment above).
    if (currentVerseBlocks.length === 0 && rawOrFallback.length === 0) {
      pieces = [];
      asidePieces = [];
      currentVerseBlocks = [];
      return;
    }

    const blocks = currentVerseBlocks.length > 0 ? currentVerseBlocks : [{ text: rawOrFallback }];

    records.push({ book, chapter, verse, rawContent: rawOrFallback, blocks });
    pieces = [];
    asidePieces = [];
    currentVerseBlocks = [];
  };

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];

    // Which of `\qc`'s two USFM readings this token is, decided once
    // because the guard and the dispatch below both act on the answer and
    // must not disagree. `undefined` for any token that isn't an
    // acrostic-heading `\qc` — see {@link acrosticGlyphSpanAt}.
    const acrosticGlyphSpan =
      token.type === "marker" && token.name === "qc" ? acrosticGlyphSpanAt(index) : undefined;
    /** This token is a `\qc` in its ordinary USFM reading: a centered poetic line, belonging with `\q1`/`\q2`/`\q3` rather than with the heading markers. */
    const isPoeticLineQc = token.type === "marker" && token.name === "qc" && acrosticGlyphSpan === undefined;

    // See {@link suppressNextBareBreakAfterCleanBoundary}'s own doc
    // comment for the full real-shape inventory this survivor list is
    // built from. A whitespace-only text token, `\c`, a
    // {@link MAJOR_SECTION_MARKER_NAMES} marker, and a
    // {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES} marker other than a
    // poetic-line `\qc` all leave the
    // guard standing — none of them carries "real accumulated content"
    // for this guard's purposes, whether because they're content-free
    // (`\c`, or a major-section marker opening a book division) or
    // because their own text lands in
    // {@link pendingHeadingBlocks}, a channel `flushBlock`'s own reach-back
    // already looks straight past. The bare `\qN` itself is absorbed here,
    // before `BREAK_MARKER_NAMES`'s own dispatch ever sees it; anything
    // else means the gap this guard was armed for didn't hold the idiom
    // after all, so it no longer applies.
    if (suppressNextBareBreakAfterCleanBoundary) {
      if (token.type === "text" && token.text.trim().length === 0) {
        // Fall through below unchanged — this whitespace-only token still
        // needs its own ordinary handling (a no-op once `flushBlock`'s own
        // trim runs), it just must not clear the guard.
      } else if (
        token.type === "marker" &&
        !isPoeticLineQc &&
        (token.name === "c" ||
          MAJOR_SECTION_MARKER_NAMES.has(token.name) ||
          SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES.has(token.name))
      ) {
        // Fall through below unchanged — `\c`'s own ordinary handling
        // (flush the (already-empty) accumulator, advance the chapter
        // number), a major-section marker's own ordinary handling (record
        // the book division, or queue its heading), or the heading/speaker branch's own ordinary handling
        // (force-flush the same already-empty accumulator, queue the
        // heading) still needs to run; the guard just must not clear here.
      } else if (token.type === "marker" && (BREAK_MARKER_NAMES.has(token.name) || isPoeticLineQc)) {
        suppressNextBareBreakAfterCleanBoundary = false;
        skipToNextMarker = false;
        index++;
        continue;
      } else {
        suppressNextBareBreakAfterCleanBoundary = false;
      }
    }

    if (token.type === "marker" && token.name === "c") {
      flush();
      started = false;
      skipToNextMarker = false;
      chapter = Number(token.value);
      // Every chapter boundary gets the identical clean cut and
      // chapter-paragraph-start guarantee `\b` gives (see
      // {@link suppressNextBareBreakAfterCleanBoundary}), regardless of
      // whether a `\b` precedes it — upstream treats every chapter start
      // this way, `\b` or no `\b`. Setting both here is a no-op when `\b`
      // already set them moments earlier (its own shape survives `\c` in
      // the guard's own survivor list above, so this line finds them
      // already `true`); it only changes behavior for the `\b`-less case.
      pendingParagraph = true;
      suppressNextBareBreakAfterCleanBoundary = true;
      index++;
      continue;
    }

    if (token.type === "marker" && token.name === "v") {
      flush();
      verse = Number(token.value);
      started = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "marker" && PARAGRAPH_MARKER_NAMES.has(token.name)) {
      flushBlock(false);
      pendingParagraph = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "marker" && token.name === "b") {
      // The real stanza break — the identical
      // `flushBlock(false); pendingParagraph = true;` call
      // `PARAGRAPH_MARKER_NAMES` already makes above, not
      // `flushBlock(true)`: the line this closes loses `break: true`
      // entirely rather than gaining it, and the next real block opens
      // `paragraph: true` instead. See
      // {@link suppressNextBareBreakAfterCleanBoundary} for why the bare
      // `\qN` that almost always immediately follows must not be allowed
      // to run its own ordinary dispatch afterward.
      flushBlock(false);
      pendingParagraph = true;
      suppressNextBareBreakAfterCleanBoundary = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    // `\q1`/`\q2`/`\q3`, and a `\qc` in its ordinary USFM reading: a
    // centered poetic line ends the line before it exactly as the numbered
    // poetry markers do. `index++` here — never the peeked span's own
    // `nextIndex` — leaves its trailing text to the walk below as verse
    // content.
    if ((token.type === "marker" && BREAK_MARKER_NAMES.has(token.name)) || isPoeticLineQc) {
      flushBlock(true);
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "marker" && MAJOR_SECTION_MARKER_NAMES.has(token.name)) {
      // Walking the span before deciding anything is what makes the
      // book-division test possible, and matters either way: this marker's
      // own trailing text ("BOOK 2", real, non-whitespace content) would
      // otherwise reach {@link suppressNextBareBreakAfterCleanBoundary}'s
      // own guard as a standalone text token and clear it, since that
      // guard whitelists only whitespace-only text and specific marker
      // names, never text content.
      const { pieces: headingPieces, nextIndex } = buildHeadingSpanContent(tokens, index + 1);
      // `\mr` is defined by its position: it follows the heading it is the
      // reference range of. Consuming it from here rather than from a
      // dispatch of its own makes "the heading it belongs to" a fact of
      // this iteration instead of a pointer left standing for a later one.
      const reference = tokens[nextIndex];
      const referenceSpan =
        reference?.type === "marker" && reference.name === "mr"
          ? buildHeadingSpanContent(tokens, nextIndex + 1)
          : undefined;

      const divisionNumber = psalterBookDivisionNumber(book, headingPieces);
      if (divisionNumber !== undefined) {
        // The heading itself is built in the post-pass at the end of this
        // function, once the range it prints is knowable. An `\mr` on a
        // division is dropped along with the division's own printed label:
        // it prints the very range this run recomputes from the book's own
        // chapters, so nothing it carries is lost by recomputing it.
        bookDivisions.push({ ordinal: divisionNumber, startChapter: chapterOpenedAfter(nextIndex) });
      } else {
        // Every other major-section heading keeps the text it actually
        // prints and takes the identical path `\s1` already takes — see
        // the {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES} dispatch
        // below, whose own doc comment covers all three steps.
        // A heading's own reference range is encoded as an `xrf` footnote
        // on the heading's text node — the shape already shipped
        // corpus-wide (NKJV1982 807 of them, MSB2025 1,325, CSB2017 5) —
        // reached through the same `attachFootToPieces` + `buildRunNodes`
        // pipeline every other footnote-in-a-run goes through, so `\mr`
        // lands as `{heading: {text, foot}}` rather than as a second shape
        // meaning the same thing.
        if (referenceSpan !== undefined) {
          attachFootToPieces(headingPieces, {
            type: "xrf",
            content: buildReferenceOnlyContent(
              headingSpanText(referenceSpan.pieces).replace(MAJOR_SECTION_REFERENCE_PARENTHESES, ""),
              canonBookIds,
            ),
          });
        }
        flushBlock(false);
        pendingParagraph = true;
        pendingHeadingBlocks.push({ text: "", headingContent: buildSpeakerHeading(headingPieces) });
      }
      skipToNextMarker = false;
      index = referenceSpan?.nextIndex ?? nextIndex;
      continue;
    }

    if (token.type === "marker" && token.name === "mr") {
      // Every `\mr` belonging to a heading was consumed by the branch
      // above, so one reaching here has no heading to be the reference
      // range *of*. The established encoding hangs the range on its
      // heading's own text node and there is no such node here — the same
      // stance the book-division post-pass below takes for a division
      // naming a chapter with no verse 1.
      const { pieces } = buildHeadingSpanContent(tokens, index + 1);
      throw new Error(
        `segmentVerses: \\mr ${JSON.stringify(headingSpanText(pieces))} follows no major-section heading, so there is no heading text to hang its reference range on`,
      );
    }

    if (token.type === "marker" && token.name === "ip") {
      // `buildIntroParagraphFootnote` (not `buildFootnoteContent` directly —
      // an `\ip` block carries no `\f`...`\f*` markers of its own) finds
      // this span's own real boundary and hands it back unconsumed, the
      // identical "next marker of any kind, never consumed" contract
      // `usfm/headings.ts`'s `buildHeadingSpanContent` already establishes
      // for `\d`/`\sp`/`\s1`. See {@link introParagraphFootnotes} for how
      // this resolves at end of book.
      const { footnote, nextIndex } = buildIntroParagraphFootnote(tokens, index + 1, canonBookIds);
      introParagraphFootnotes.push(footnote);
      skipToNextMarker = false;
      index = nextIndex;
      continue;
    }

    if (token.type === "marker" && SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES.has(token.name)) {
      // Force whatever was already accumulating to finalize as its own
      // block *before* the heading is built — see
      // {@link pendingHeadingBlocks}'s own doc comment, step 1. A no-op
      // when nothing has accumulated (the ordinary Psalm-superscription
      // case, chapter start, before any verse has opened).
      flushBlock(false);
      // A heading opens whatever follows it. This repo's convention is
      // flat and corpus-wide (`utils/auditNodes.ts`'s heading-paragraph
      // check): a heading or
      // subtitle followed by anything that is not itself a heading or
      // subtitle carries `paragraph: true` on that next node, in every
      // version and every book. The raw sources rarely write it — a `\sp`
      // or `\d` is normally followed by a bare `\q1`, never a `\p` — so
      // this dispatch supplies it rather than leaving the flag to whatever
      // `\b` or `\c` happens to share the boundary.
      //
      // Set after `flushBlock`, which has already consumed any flag
      // belonging to the block *before* the heading, so this one lands on
      // the block after it instead.
      pendingParagraph = true;
      skipToNextMarker = false;
      // A `\qc` reaching this branch was already walked by the peek that
      // classified it; reusing that span keeps the classification and the
      // content built from it from being two reads that could disagree.
      const { pieces: headingPieces, nextIndex } = acrosticGlyphSpan ?? buildHeadingSpanContent(tokens, index + 1);
      const headingContent =
        token.name === "d"
          ? buildSuperscriptionContent(headingPieces)
          : token.name === "qc"
            ? buildAcrosticGlyphHeading(headingPieces)
            : buildSpeakerHeading(headingPieces);
      pendingHeadingBlocks.push({ text: "", headingContent });
      index = nextIndex;
      continue;
    }

    if (token.type === "marker") {
      skipToNextMarker = CHROME_DROPPED_MARKER_NAMES.has(token.name);
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "f") {
      skipToNextMarker = false;
      const { footnote, plainText, nextIndex } = buildFootnoteContent(tokens, index + 1, canonBookIds);
      index = nextIndex;
      // A footnote embedded inside a `\d` Psalm superscription (e.g. Psalm
      // 46:0) never reaches this branch at all — the
      // `SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES` branch above consumes it
      // directly, inside `usfm/headings.ts`'s own
      // `buildHeadingSpanContent` (which reuses this exact same
      // `buildFootnoteContent` function for that purpose). This `started`
      // guard protects against a case this corpus is not known to ever
      // exercise for real — every real `\f` this branch actually sees
      // sits inside an already-open verse — kept as a defensive no-op
      // rather than an assumption this walk relies on, the same
      // discipline the sibling `open "x"` branch below already applies to
      // its own identical guard.
      if (started) {
        // The classification/diagnostic text a footnote-only verse's own
        // empty-verse fallback needs (see `flush()`'s own doc comment) —
        // fed from the identical extraction `buildFootnoteContent` already
        // did for classification, not a second, separately-maintained one.
        asidePieces.push(plainText);
        attachFoot(footnote);
      }
      continue;
    }

    if (token.type === "open" && token.name === "x") {
      skipToNextMarker = false;
      const { footnote, nextIndex } = buildCrossReferenceContent(tokens, index + 1, canonBookIds);
      index = nextIndex;
      // No real in-scope `\x` span sits inside an unclosed `\d` heading,
      // so the `started` guard here is a defensive mirror of the
      // footnote branch's own rule, not a gap this corpus ever actually
      // exercises.
      if (started) attachFoot(footnote);
      continue;
    }

    if (token.type === "open" && token.name === "w") {
      insideWord = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "close" && token.name === "w") {
      insideWord = false;
      const wordText = pendingWordText ?? "";
      pendingWordText = undefined;
      // `includeStrongs` gates right here, at the one place a `strong`
      // attribute is ever read off a token — every downstream pass
      // (connector-merging, punctuation-movement) already keys off whether
      // a node carries `strong` at all, so suppressing it here is enough:
      // a run with no `strong` anywhere naturally collapses to plain,
      // connector-merged text, with no second code path needed for it.
      const strong = includeStrongs ? token.attributes?.strong : undefined;
      if (started && !skipToNextMarker && (wordText.length > 0 || strong !== undefined)) {
        const marks: InlineMarkName[] = [
          ...(insideWj ? (["woc"] as const) : []),
          ...(insideQs || insideAdd || insideBk ? (["i"] as const) : []),
        ];
        blockInline.push({
          text: wordText,
          ...(strong !== undefined ? { strong } : {}),
          // A mark on a payload with no text is meaningless
          // (`content-schema.json`'s own `minProperties: 1` is satisfied by
          // `strong` alone here — see `inlineMarks.ts`'s own doc comment for
          // why a textless Strong's sibling still stands on its own) — never
          // observed in this corpus (every real `\w` wraps real text), but
          // this is the one place a truly empty `\w||strong="..."\w*` could
          // arise, so the rule is honored here regardless.
          ...(wordText.length > 0 && marks.length > 0 ? { marks } : {}),
        });
      }
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "wj") {
      insideWj = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "close" && token.name === "wj") {
      insideWj = false;
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "qs") {
      insideQs = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "close" && token.name === "qs") {
      insideQs = false;
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "add") {
      insideAdd = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "close" && token.name === "add") {
      insideAdd = false;
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "bk") {
      insideBk = true;
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "close" && token.name === "bk") {
      insideBk = false;
      index++;
      continue;
    }

    if (token.type === "open" || token.type === "close") {
      skipToNextMarker = false;
      index++;
      continue;
    }

    // token.type === "text"
    if (started && !skipToNextMarker) {
      // Normalized once, right here, where this raw token's text first
      // becomes part of the verse's own text representation — every
      // downstream use (`pieces`/`rawContent`, `blockPieces`/a block's own
      // `text`, and `blockInline`/a block's own `nodes`, whether directly
      // or via `pendingWordText`) reads the identical normalized string.
      // See `functions/normalizeFractions.ts`.
      const text = normalizeFractionText(token.text).value;
      pieces.push(text);
      blockPieces.push(text);
      if (insideWord) {
        // The word's own text arrives before its `strong` attribute does —
        // `tokenize.ts`'s own close token carries the attribute, not the
        // open — so this piece cannot be finalized until `close`/"w" above
        // is reached.
        pendingWordText = text;
      } else {
        const marks: InlineMarkName[] = [
          ...(insideWj ? (["woc"] as const) : []),
          ...(insideQs || insideAdd || insideBk ? (["i"] as const) : []),
        ];
        blockInline.push({ text, ...(marks.length > 0 ? { marks } : {}) });
      }
    }
    index++;
  }
  flush();

  // The book-division post-pass — see {@link bookDivisions} for why this
  // waits until every verse record exists: a division's own real range end
  // (a computed en-dash chapter range derived from this run's own emitted
  // verse data, never hand-typed) is only knowable once either the *next*
  // division's own start chapter is known, or — for the last division —
  // the book's own highest chapter is known, both requiring the whole book
  // to already be walked. Each heading is unshifted onto its own start
  // chapter's verse 1, ahead of whatever a `\d` subtitle may have already
  // placed there via {@link pendingHeadingBlocks}'s own drain, matching a
  // real source's own Psalm 42:1 ordering (the book-division heading
  // always comes first).
  if (bookDivisions.length > 0) {
    const maxChapter = records.reduce((max, record) => Math.max(max, record.chapter), 0);
    bookDivisions.forEach(({ ordinal, startChapter }, at) => {
      const endChapter = at + 1 < bookDivisions.length ? bookDivisions[at + 1].startChapter - 1 : maxChapter;
      const heading = buildBookDivisionHeading(ordinal - 1, startChapter, endChapter);
      const verseOne = records.find((record) => record.chapter === startChapter && record.verse === 1);
      if (verseOne === undefined) {
        throw new Error(
          `segmentVerses: book division "BOOK ${ordinal}" opens on chapter ${startChapter}, but this book has no verse 1 there to attach its own division heading to`,
        );
      }
      verseOne.blocks.unshift({ text: "", headingContent: heading });
    });
  }

  // The `\ip` post-pass mirrors the book-division post-pass above — see
  // {@link introParagraphFootnotes} for why this waits until the whole book
  // is walked. Each footnote becomes its own textless `{foot}`-only node —
  // the same "textless sibling node" shape a bare Strong's tag with nothing
  // of its own to attach text to already uses (guide §6), here standing as
  // a whole block of its own rather than mid-run — unshifted in source
  // order ahead of anything a `\d` or a major-section heading may have
  // already placed there, so
  // an `\ip` block (the outermost editorial framing around the whole book)
  // always reads first.
  //
  // Verse 1 already carries `paragraph: true` on whichever of its own
  // blocks the real `\p` marker opened — normally its first block, before
  // any `\ip` footnote block(s) take that position instead. That flag has
  // to move onto the first footnote block along with them: the renderer
  // (`web/public/js/VerseRenderer.js`) only ever inspects a verse's own
  // *first* content node to decide where its pre-verse-number paragraph
  // break belongs, so leaving the flag behind strands it on a node that is
  // no longer first, and it renders as a break in the middle of the verse —
  // after the verse number and footnote icon — instead of before both.
  if (introParagraphFootnotes.length > 0) {
    const minChapter = records.reduce((min, record) => Math.min(min, record.chapter), Infinity);
    const verseOne = records.find((record) => record.chapter === minChapter && record.verse === 1);
    if (verseOne === undefined) {
      throw new Error(
        `segmentVerses: found ${introParagraphFootnotes.length} \\ip block(s) but this book has no chapter ${minChapter} verse 1 to attach their own textless footnote node(s) to`,
      );
    }
    const footBlocks = introParagraphFootnotes.map((foot) => ({ text: "", nodes: [{ foot }] }) as VerseBlock);
    const paragraphBlockIndex = verseOne.blocks.findIndex((block) => block.paragraph === true);
    if (paragraphBlockIndex !== -1) {
      const { paragraph: _paragraph, ...rest } = verseOne.blocks[paragraphBlockIndex];
      // A block whose only reason to exist was carrying `paragraph: true` —
      // no text, no nodes, no break, no heading — contributes nothing once
      // that flag moves onto the footnote block ahead of it, and is dropped
      // outright rather than left behind as a hollow block. A real corpus
      // instance (WEBUS2020's own Prayer of Manasses 1:1, whose `\p` opens
      // directly on a plain-string "O " with nothing of its own to carry
      // the flag) already relies on `content-schema.json`'s own bare-object
      // shape for "flag with nothing else" — leaving that shape behind
      // empty here would violate the schema's own `minProperties: 1`.
      if (rest.text === "" && (rest.nodes?.length ?? 0) === 0 && !rest.break && !rest.headingContent) {
        verseOne.blocks.splice(paragraphBlockIndex, 1);
      } else {
        verseOne.blocks[paragraphBlockIndex] = rest;
      }
      footBlocks[0] = { ...footBlocks[0], paragraph: true };
    }
    verseOne.blocks.unshift(...footBlocks);
  }

  return records;
}
