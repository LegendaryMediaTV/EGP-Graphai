import { ContentHeading, ContentObject, ContentSubtitle } from "../../types/Content";
import Footnote from "../../types/Footnote";
import { buildFootnoteContent, buildIntroParagraphFootnote } from "./footnotes";
import {
  buildAcrosticGlyphHeading,
  buildBookDivisionHeading,
  buildHeadingSpanContent,
  buildSpeakerHeading,
  buildSuperscriptionContent,
} from "./headings";
import { normalizeFractionText } from "./fractions";
import { attachFootToPieces, buildRunNodes, InlineMarkName, InlineTextPiece } from "./inlineMarks";
import { buildCrossReferenceContent } from "./references";
import { tokenize } from "./tokenize";

/**
 * One block of a verse's own content, split at a `\p`/`\m`/`\nb`/`\q1`/
 * `\q2`/`\q3`/`\b`/`\c` boundary. `paragraph`/`break` mirror
 * `content-schema.json`'s own flags exactly; a block carrying neither is a
 * plain, unflagged run of text that joins directly onto its neighbor
 * (`imports/guide.md` §6: "two adjacent nodes with no flag between them
 * came from one line and join with nothing"). `\b` and `\c` are both
 * boundaries in this split the same way the others are, but — unlike
 * every other marker named here — neither ever sets a flag on the block
 * it closes; each only ever opens the next one with `paragraph: true`
 * (see {@link VerseBlock.break}) — `\b` because WEBUS2020's own upstream
 * confirms a real stanza gap, `\c` because upstream gives every chapter
 * boundary the identical clean-cut treatment regardless of whether a
 * `\b` precedes it (Finding 7).
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
   * Whether a `\p`-family marker opened this block — or `\b` (a real
   * stanza break) or `\c` (a real chapter boundary, Finding 7) did, both
   * of which give the block they open the identical signal a `\p`-family
   * marker would.
   */
  readonly paragraph?: boolean;
  /**
   * Whether a `\q1`/`\q2`/`\q3` ordinary poetry-line marker closed this
   * block. `\b` (the real stanza break) and `\c` (a real chapter
   * boundary, Finding 7) deliberately never set this — each leaves the
   * block it closes clean instead, then opens the next real block with
   * {@link paragraph} in its place.
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
 * before a verse boundary) — confirmed directly against
 * `bible-versions/KJV1769/01-GEN.json` chapter 1, whose own `paragraph:
 * true` flags land exactly on WEBUS2020's own raw `\p` positions in the
 * same chapter. A marker outside this set has zero effect on block
 * boundaries at all — without `\li1`/`\pi1`/`\mi` included here, Ezra 8:2's
 * own three `\li1`-tagged list items merge into one run-on block with no
 * separation.
 */
const PARAGRAPH_MARKER_NAMES = new Set(["p", "m", "nb", "li1", "pi1", "mi"]);

/**
 * Unpaired markers that end an ordinary poetry line — `\q3` is included
 * for completeness even though this corpus carries zero in-scope
 * instances. Marks the *last* content-bearing block that precedes it,
 * reaching backward across a verse or chapter boundary when nothing has
 * accumulated since the last one — the KJV1769 "same rule,
 * two sides" convention, not a forward-looking paragraph.
 *
 * `\b` — the real stanza-break marker, USFM's own blank-line-between-poem-
 * stanzas convention — does *not* belong here, even though it looks like a
 * fourth poetry-line-ending marker at a glance. WEBUS2020's own upstream
 * `HEAD` confirms `\b` marks the opposite boundary: the line it closes
 * loses `break: true` entirely (an
 * ordinary line-wrap never happened here — a real stanza gap did), and the
 * next real block opens `paragraph: true` instead, the identical signal
 * {@link PARAGRAPH_MARKER_NAMES} already gives. `\b` gets its own dispatch
 * branch below rather than sharing either set — and, per Finding 7, `\c`
 * (the chapter marker) makes the identical `paragraph: true` promise on
 * its own, since upstream gives every chapter boundary this treatment,
 * `\b` or no `\b`. See {@link suppressNextBareBreakAfterCleanBoundary} for
 * the one real interaction this creates with the set below.
 */
const BREAK_MARKER_NAMES = new Set(["q1", "q2", "q3"]);

/**
 * Unpaired markers whose own trailing text is pure chrome — a front-matter
 * or display convention with nothing hosted inside it that dropping would
 * silently lose (checked directly: `\cl`'s own single in-scope instance
 * carries nothing but the plain word "Psalm," no footnote). Dropped
 * entirely, the same way front matter (`\toc1`-`\toc3`, `\id`, `\ide`, `\h`,
 * `\mt1`-`\mt3`) already is by the `started` guard below.
 *
 * `\pc` (2 Maccabees' own decorative dash divider), `\cp` (Psalm 151's own
 * chapter-number override, already harmless by position — `started` is
 * always `false` where it sits — added anyway for the same
 * explicit-accounting reason `\cl` is here), and `\is1` (Sirach's
 * and Esther-Greek's own bare section-title labels for the `\ip` prose that
 * follows — `\ip` itself is real content, handled separately below, never
 * chrome) join this set for the identical reason `\cl` already does: a
 * marker with real, measured, in-scope text that carries nothing worth
 * keeping. `\s1` (a real per-pericope section heading, 5 real deuterocanon
 * instances) has *moved out* of this set into
 * {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES} below — the 66-book scope's
 * own zero-instance finding no longer holds once the deuterocanon corpus is
 * in view.
 */
const CHROME_DROPPED_MARKER_NAMES = new Set(["cl", "pc", "cp", "is1"]);

/**
 * `\d` — a Psalm superscription (116 of 138 in-scope canonical instances,
 * plus Psalm 151's own) or one of Psalm 119's own 22 acrostic letter-name
 * markers (the identical USFM tag; `usfm/headings.ts`'s
 * `buildSuperscriptionContent` classifies by content, never by position).
 * `\sp` — a Song of Solomon speaker label. `\s1` — a real
 * per-pericope section heading, 5 real deuterocanon instances (Baruch 6,
 * Daniel 13/14's own chapter-start pericope titles, Daniel 3:23/24 and
 * 3:90/91's own mid-chapter insertion titles), dispatched through the
 * identical plain-`heading` path `\sp` already uses (`usfm/headings.ts`'s
 * `buildSpeakerHeading`, reused directly rather than a second, parallel
 * function — see the dispatch below). `\qc` — ASV1901's own Psalm 119
 * acrostic letter heading (22 real instances, `20-PSAeng-asv.usfm`), on a
 * different marker than `\d` and carrying the real Hebrew glyph inline
 * rather than a bare transliteration (`usfm/headings.ts`'s
 * `buildAcrosticGlyphHeading`, joined here rather than forked into a
 * parallel walk, since it needs the identical "span to the next marker"
 * shape the other three already have). All four are unpaired markers whose
 * own trailing text ends wherever the *next* marker of any kind begins
 * (`usfm/headings.ts`'s own `buildHeadingSpanContent`) and all four attach
 * to whatever real content comes next in source order — see
 * {@link pendingHeadingBlocks}'s own doc comment below for exactly how
 * "next" is determined, including across a verse boundary. This is also
 * what fixes ASV1901's own real `\qc` gap for its first, chapter-opening
 * occurrence (Psalm 119's own `\qc א ALEPH.`, sitting before `\v 1` ever
 * opens): unlike the generic "text" branch, which the `started` guard
 * excludes at true chapter start (losing the text outright), this
 * dispatch queues the heading into {@link pendingHeadingBlocks}
 * unconditionally, with no dependency on `started` at all — the identical
 * mechanism that already lets an ordinary `\d` Psalm superscription attach
 * correctly at chapter start.
 */
const SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES = new Set(["d", "sp", "s1", "qc"]);

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
   * Set the moment a real `\b` stanza break *or* a real `\c` chapter
   * marker is dispatched; consulted, and always cleared, on the very next
   * token that isn't part of the gap itself. This is the guard that keeps
   * WEB's own bare-`\q1`/`\q2`/`\q3` "stanza break, then resume" idiom
   * (764 real `\b` instances) — and, per Finding 7, the identical idiom at
   * a `\b`-less chapter boundary (178 real chapters open directly with a
   * bare `\qN`, most with no `\b` anywhere near `\c`) — from undoing the
   * clean cut either marker just made: both `\b` and `\c` drop (or, for
   * `\c`, simply never carry forward) `break: true` from the line before
   * the gap, but that bare `\qN` — carrying no text of its own before the
   * next real content — would otherwise run its own ordinary
   * {@link BREAK_MARKER_NAMES} dispatch and reach backward onto that same
   * line, adding a flag neither marker's own convention wants there
   * (`flushBlock`'s own doc comment: the reach-back's `if (!last.break)`
   * guard only ever adds the flag, never removes it, so it cannot tell
   * "never had one" apart from "deliberately cleared").
   *
   * Survives a whitespace-only text token in the gap (real in this
   * corpus's own raw USFM — `tokenize()` never merges a marker's own
   * trailing newline away, it becomes a genuine, if content-free, text
   * token); survives a `\c` marker itself, the real chapter-boundary shape
   * of the `\b`-adjacent idiom, `\b \c N \q1 \v M...` (Job 16:22→17:1's own
   * real shape, and — per Finding 7 — Deuteronomy 31:30→32:1's and Psalm
   * 90:17→91:1's own real `\b`-less shape, nothing at all between `\c` and
   * the bare `\qN`); survives `\ms1`, a Psalms book-division marker that
   * always sits directly after `\c` (Psalm 41:13→42:1, 72:20→73:1,
   * 89:52→90:1, 106:48→107:1's own real shape, `\c N \ms1 BOOK M \d ...
   * \q1 \v 1...` — `\ms1`'s own dispatch consumes its own trailing text in
   * the same jump, exactly the way {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES}
   * markers already do, so that real, non-whitespace text ("BOOK 2") never
   * reaches this guard as its own standalone token and clears it — Psalm
   * 41:13→42:1's own real shape caught this directly, the one real gap
   * simply adding `\ms1` to this survivor list alone would have left
   * open); and survives a {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES}
   * marker (`\d`/`\sp`/`\s1`/`\qc`) the same way, a Psalm superscription
   * routinely sitting between the gap's own start and the bare `\qN` that
   * follows it (Psalm 46:11→47:1's own real shape, `\b`-adjacent). Cleared
   * by anything else: real text, or any marker outside that survivor
   * list. This is deliberately narrower than "the next break-type marker,
   * whenever it comes" — it only ever catches the *immediately* following
   * one, matching how the idiom actually sits in the raw source.
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
  // ["i"]` — the same mark `imports/kjv/kjvContent.ts:195` already gives
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
   * The chapter number of every `\ms1` marker this book carries, in
   * source order — the raw text following `\ms1` is never read: the
   * repo's own already-shipped convention replaces WEB's own literal
   * "BOOK 1".."BOOK 5" wording wholesale with a computed word + range, so
   * nothing in the source is worth capturing beyond *which* chapter the
   * marker sits on. Unlike {@link pendingHeadingBlocks}, this never needs
   * same-verse-vs-next-verse resolution — every real in-scope instance
   * sits directly after `\c N` and before any `\v`, always destined for
   * that same chapter's own verse 1 — so it is resolved separately, in
   * one post-pass once every boundary and the book's own highest chapter
   * are known (see the end of this function).
   */
  const bookDivisionBoundaryChapters: number[] = [];

  /**
   * Every `\ip` block's own built footnote, in source order. Real
   * in-scope `\ip` blocks sit entirely in front matter, before `\c 1`
   * ever opens — `chapter` is still `0` and `started` still `false` the
   * whole time one is being read — so, like {@link bookDivisionBoundaryChapters},
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
   * whose only property is `foot` (matching ASV1901's own shape
   * for Luke 17:36).
   *
   * When the last piece already carries a `foot` of its own, a second,
   * textless `{foot}` piece is pushed instead of overwriting it — a real
   * in-scope shape (Acts 7:37's own footnote and cross-reference, both
   * anchored to the same preceding word, with nothing at all between
   * them). A single `ContentObject` can carry only one `foot`, so the
   * second note needs its own node; overwriting silently discarded a real
   * footnote in exactly this shape (3 instances in Acts, 1 in Hebrews)
   * until a full-corpus verify run caught it.
   */
  const attachFoot = (foot: Footnote): void => attachFootToPieces(blockInline, foot);

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
   * a lost flag: the one truly first block-affecting marker of a whole
   * book with nothing whatsoever before it (exactly one instance in this
   * corpus, Psalm 1's own opening `\q1`).
   *
   * WEB's own `\b`-then-`\q1`/`\q2`/`\q3` "stanza break, then resume"
   * idiom (764 times), and, per Finding 7, the identical idiom at a
   * `\b`-less chapter boundary (a bare `\qN` sitting directly behind `\c`,
   * with nothing else in between but whitespace/`\ms1`/a heading marker),
   * never reach this function's own `breakFlag` branch at all. Both `\b`'s
   * and `\c`'s own dispatch (see the marker-walk loop below) call
   * `flushBlock(false)`, so the line before the gap never gains
   * `break: true` in the first place — WEBUS2020's own upstream `HEAD`
   * confirms this is the real convention at every one of these boundaries,
   * with or without a `\b`. If the bare `\qN` that almost always
   * immediately follows either one were left to run its own ordinary
   * `BREAK_MARKER_NAMES` dispatch, this reach-back's own `if (!last.break)`
   * guard — which can only ever *add* `break: true`, never remove it —
   * would silently add the very flag the gap was just left clean of, since
   * it cannot distinguish "never had one" from "deliberately kept clean."
   * The marker-walk loop's own
   * {@link suppressNextBareBreakAfterCleanBoundary} guard absorbs that
   * bare `\qN` before it ever reaches `BREAK_MARKER_NAMES`'s dispatch, so
   * this function's own reach-back branch never actually sees it.
   */
  const flushBlock = (breakFlag: boolean): void => {
    const text = blockPieces.join("").replace(/\s+/g, " ").trim();
    blockPieces = [];
    const inline = blockInline;
    blockInline = [];
    const nodes = inline.length > 0 ? buildRunNodes(inline) : undefined;

    // `inline` mirrors `text` piece by piece for every ordinary word/prose
    // piece, but a standalone footnote piece (a `\f` marker with nothing
    // preceding it to attach to, e.g. Mark 16:9's own footnote opening its
    // verse with nothing before it) contributes to `inline` alone, never to
    // `blockPieces`/`text` — a footnote is not running verse prose.
    // Checking `nodes` here rather than raw `inline.length` matters: a
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
      // Nothing anywhere earlier in this book — the one confirmed,
      // harmless no-op case.
    }
  };

  const flush = (): void => {
    if (!started) return;
    const rawContent = pieces.join("").replace(/\s+/g, " ").trim();
    // A handful of verses (Luke 17:36, Acts 8:37/15:34/24:7, Romans 16:25)
    // carry a textual-variant footnote as their *entire* USFM content,
    // with no surrounding verse text — WEB omits the disputed reading and
    // only notes it. The `open "f"` branch above pushes a standalone
    // `{foot: ...}` piece into `blockInline` even with nothing preceding
    // it, and `flushBlock`'s own `nodes`-based check (see its own doc
    // comment) lets that survive into a real block — `blocks` below then
    // carries these verses as a content object whose only property is
    // `foot`, matching ASV1901's own shape for Luke 17:36.
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
    // early (another real source's Song of Solomon 1:2 precedent: `\sp Beloved`
    // between v1 and v2 belongs to v2, never v1) — reclaim it, in original
    // order, back into the pending queue so the *next* verse's own first
    // real push picks it up instead.
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

    // A real, narrower case than the one the comment above describes: a
    // verse with *no* fallback either, not even a footnote to fall back
    // to — MSB2025's own real Luke 17:36/Acts 8:37/15:34/24:7, a source
    // with zero \f/\x anywhere in its corpus, so a disputed verse it
    // still numbers is left with
    // nothing behind the number at all. `imports/guide.md`'s own
    // already-established rule for exactly this shape ("Omitted textual
    // variants... Emit no verse record at all") applies directly: this is
    // not a defect to paper over with an empty placeholder block (which a
    // real run of this corpus proved schema-invalid — `content` cannot be
    // an empty string), it is the correct, if unusual, verse-level
    // fallback for a verse with truly nothing to carry. WEB's own
    // disputed verses never reach this branch — every one keeps at least
    // its own footnote as a real block (see the comment above) — so this
    // is dead code for that corpus, exercised for the first time by a
    // source with none.
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

    // See {@link suppressNextBareBreakAfterCleanBoundary}'s own doc
    // comment for the full real-shape inventory this survivor list is
    // built from. A whitespace-only text token, `\c`, `\ms1`, and a
    // {@link SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES} marker all leave the
    // guard standing — none of them carries "real accumulated content"
    // for this guard's purposes, whether because they're content-free
    // (`\c`/`\ms1`) or because their own text lands in
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
        (token.name === "c" || token.name === "ms1" || SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES.has(token.name))
      ) {
        // Fall through below unchanged — `\c`'s own ordinary handling
        // (flush the (already-empty) accumulator, advance the chapter
        // number), `\ms1`'s own ordinary handling (record the boundary
        // chapter), or the heading/speaker branch's own ordinary handling
        // (force-flush the same already-empty accumulator, queue the
        // heading) still needs to run; the guard just must not clear here.
      } else if (token.type === "marker" && BREAK_MARKER_NAMES.has(token.name)) {
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
      // Finding 7: every real chapter boundary gets the identical clean
      // cut and chapter-paragraph-start guarantee `\b` already gives
      // (see {@link suppressNextBareBreakAfterCleanBoundary}), regardless
      // of what marker, if any, follows `\c` — WEBUS2020's own upstream
      // `HEAD` confirms this holds even with no `\b` anywhere near the
      // boundary (Deuteronomy 31:30→32:1, Psalm 90:17→91:1, and the four
      // `\ms1` book-division boundaries). Setting both here is a no-op
      // when `\b` already set them moments earlier (Job 16:22→17:1's own
      // shape survives `\c` in the guard's own survivor list above, so
      // this line finds them already `true`) — it only changes behavior
      // for the `\b`-less case this finding is about.
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

    if (token.type === "marker" && BREAK_MARKER_NAMES.has(token.name)) {
      flushBlock(true);
      skipToNextMarker = false;
      index++;
      continue;
    }

    if (token.type === "marker" && token.name === "ms1") {
      // The chapter number alone is enough — the raw "BOOK 1" text itself
      // is never read (see {@link bookDivisionBoundaryChapters}). `started`
      // is always `false` here (every real in-scope `\ms1` sits directly
      // after `\c N`, before any `\v`), so there is nothing else for this
      // marker to disturb. `buildHeadingSpanContent`'s own `pieces` are
      // discarded — only `nextIndex` matters — but reusing it to find the
      // real boundary (rather than just `index++`) matters for real: this
      // marker's own trailing text ("BOOK 2", real, non-whitespace
      // content) would otherwise reach
      // {@link suppressNextBareBreakAfterCleanBoundary}'s own guard as its
      // own standalone text token and clear it, since that guard only
      // ever whitelists whitespace-only text and specific marker names,
      // never text content — Psalm 41:13→42:1's own real shape caught
      // this directly (Finding 7).
      bookDivisionBoundaryChapters.push(chapter);
      const { nextIndex } = buildHeadingSpanContent(tokens, index + 1);
      skipToNextMarker = false;
      index = nextIndex;
      continue;
    }

    if (token.type === "marker" && token.name === "ip") {
      // Every `\ip` block becomes a footnote on the book's own verse
      // 1:1, attached to a textless leading node — resolved in the same
      // end-of-book post-pass {@link bookDivisionBoundaryChapters} already
      // uses, since a real in-scope `\ip` always sits in front matter,
      // before `started` is ever `true`. `buildIntroParagraphFootnote` (not
      // `buildFootnoteContent` directly — an `\ip` block carries no
      // `\f`...`\f*` markers of its own) finds this span's own real
      // boundary and hands it back unconsumed, the identical "next marker
      // of any kind, never consumed" contract `usfm/headings.ts`'s
      // `buildHeadingSpanContent` already establishes for `\d`/`\sp`/`\s1`.
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
      // A speaker label opens the speech that follows it. Song of
      // Solomon's own `\sp` marks a change of voice in a dialogue, and the
      // line after it begins a new paragraph whether or not a `\b` or `\c`
      // happens to sit beside the same boundary — which is why five of the
      // book's own 33 labels already carried `paragraph: true` from a
      // neighboring marker while the other 28 did not. Set here, after
      // `flushBlock` has consumed any flag belonging to the block *before*
      // the label, so it lands on the block after it instead.
      //
      // The other three markers in this set are not speech boundaries and
      // set nothing: a `\d` superscription sits above a psalm rather than
      // opening it, and a `\qc` acrostic letter sits inside continuous
      // poetry.
      if (token.name === "sp") pendingParagraph = true;
      skipToNextMarker = false;
      const { pieces: headingPieces, nextIndex } = buildHeadingSpanContent(tokens, index + 1);
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
      // A footnote embedded inside a `\d` Psalm superscription (Psalm
      // 46:0/90:0/145:0) never reaches this branch at all — the
      // `SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES` branch above consumes it
      // directly, inside `usfm/headings.ts`'s own
      // `buildHeadingSpanContent` (which reuses this exact same
      // `buildFootnoteContent` function for that purpose). This `started`
      // guard protects against a case this corpus is not known to
      // ever exercise for real — every real `\f` this branch actually
      // sees sits inside an already-open verse — kept as a defensive
      // no-op rather than an assumption this walk relies on, the same
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
      // No real in-scope `\x` span sits inside an unclosed `\d` heading
      // (checked directly, corpus-wide — unlike the 3 real `\f` cases
      // above, zero for `\x`), so the `started` guard here is a defensive
      // mirror of the footnote branch's own rule, not a gap this corpus
      // ever actually exercises.
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
      // See `utils/usfm/fractions.ts`.
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

  // The `\ms1` post-pass — see {@link bookDivisionBoundaryChapters} for why
  // this waits until every verse record exists: a boundary's own real
  // range end (a computed en-dash verse range derived from this run's own
  // emitted verse data, never hand-typed) is only knowable once
  // either the *next* boundary's own start chapter is known, or — for the
  // last boundary — the book's own highest chapter is known, both
  // requiring the whole book to already be walked. Each heading is
  // unshifted onto its own boundary chapter's verse 1, ahead of whatever a
  // `\d` subtitle may have already placed there via
  // {@link pendingHeadingBlocks}'s own drain, matching
  // a real source's own Psalm 42:1 ordering (the book-division heading
  // always comes first).
  if (bookDivisionBoundaryChapters.length > 0) {
    const maxChapter = records.reduce((max, record) => Math.max(max, record.chapter), 0);
    bookDivisionBoundaryChapters.forEach((startChapter, boundaryIndex) => {
      const endChapter =
        boundaryIndex + 1 < bookDivisionBoundaryChapters.length
          ? bookDivisionBoundaryChapters[boundaryIndex + 1] - 1
          : maxChapter;
      const heading = buildBookDivisionHeading(boundaryIndex, startChapter, endChapter);
      const verseOne = records.find((record) => record.chapter === startChapter && record.verse === 1);
      if (verseOne === undefined) {
        throw new Error(
          `segmentVerses: \\ms1 boundary #${boundaryIndex + 1} names chapter ${startChapter}, but this book has no verse 1 there to attach its own book-division heading to`,
        );
      }
      verseOne.blocks.unshift({ text: "", headingContent: heading });
    });
  }

  // The `\ip` post-pass mirrors the `\ms1` post-pass above
  // exactly: every real in-scope `\ip` sits in front matter, always destined
  // for the book's own *lowest*-numbered chapter's verse 1 (never resolved
  // during the walk itself, since `records` may not yet hold that verse).
  // Each footnote becomes its own textless `{foot}`-only node — the same
  // "textless sibling node" shape a bare Strong's tag with nothing of its
  // own to attach text to already uses (guide §6), here standing as a whole
  // block of its own rather than mid-run — unshifted in source order ahead
  // of anything a `\d`/`\ms1` may have already placed there, so an `\ip`
  // block (the outermost editorial framing around the whole book) always
  // reads first.
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
