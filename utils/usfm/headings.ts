/**
 * This module's own construct family: Psalm superscriptions (`\d`), the
 * Psalm 119 acrostic letter markers (also `\d` in WEBUS2020's own corpus —
 * the identical USFM tag, only distinguishable by what its own text
 * actually is — or `\qc` in ASV1901's, a different marker carrying the
 * real Hebrew glyph rather than a bare transliteration), the five Psalter
 * book-division headings (`\ms1`), and Song of Solomon's speaker labels
 * (`\sp`).
 *
 * `\d`/`\sp`/`\qc` share the same real shape a footnote or cross-reference
 * already has — a run of text (and, for `\d`, occasionally an embedded
 * `\f`...`\f*` footnote) that ends wherever the next marker begins — so
 * this module's own {@link buildHeadingSpanContent} is built the same way
 * `usfm/footnotes.ts`'s `buildFootnoteContent` and `usfm/references.ts`'s
 * `buildCrossReferenceContent` are: `(tokens, startIndex) -> {..., nextIndex}`.
 * The one real difference is that `\d`/`\sp`/`\qc` are *unpaired* markers
 * (no `\d*`/`\qc*` closing tag USFM's own grammar ever defines) — their own
 * span ends at the *next marker of any kind*, not at a matching close
 * token, so this walker's own stopping condition is "anything that isn't
 * plain text, an embedded `\w`/`+w` wrapper (discarded — see below), or an
 * embedded footnote" rather than a specific close-tag name.
 *
 * `\ms1`'s own computed verse range needs to see every boundary in the book
 * before it can know where any one of them ends — a genuine lookahead this
 * module's own {@link buildBookDivisionHeading} takes as plain numbers,
 * leaving the lookahead itself to whichever caller already knows the whole
 * book (`usfm/segmentVerses.ts`'s own post-pass, once the token walk is
 * done and every verse record already exists).
 */

import Content, { ContentHeading, ContentSubtitle } from "../../types/Content";
import { buildFootnoteContent } from "./footnotes";
import { attachFootToPieces, buildRunNodes, collapseContentNodes, InlineTextPiece } from "./inlineMarks";
import { splitScriptRuns } from "./splitScriptRuns";
import { Token } from "./tokenize";

/**
 * Psalm 119's own 22 real, transliterated acrostic letter-name headings,
 * measured directly against the raw source (`\d ALEPH` through `\d TAV`,
 * `20-PSAeng-web.usfm`), after stripping the two real `\w`-tag artifacts
 * WEB's own Strong's tagger left on "HE" and "AND" (both plain English
 * dictionary words that happen to also be transliterated Hebrew letter
 * names — see {@link buildHeadingSpanContent}'s own doc comment for why
 * that stripping happens unconditionally, not just for these two). This is
 * WEB's own real spelling, typo and all ("KAPF", not the more standard
 * "KAPH") — a faithful transcription of the source, not a corrected list.
 * A membership check against
 * this exact set — "does this heading's text reduce to nothing but a
 * canonical letter name" — is how `\d` classification tells an acrostic
 * marker apart from an ordinary superscription; both use the identical
 * USFM tag, so position can never be the signal.
 */
const ACROSTIC_LETTER_NAMES = new Set([
  "ALEPH",
  "BETH",
  "GIMEL",
  "DALETH",
  "HE",
  "VAV",
  "ZAYIN",
  "HETH",
  "TETH",
  "YODH",
  "KAPF",
  "LAMEDH",
  "MEM",
  "NUN",
  "SAMEKH",
  "AYIN",
  "PE",
  "TZADHE",
  "QOPH",
  "RESH",
  "SIN AND SHIN",
  "TAV",
]);

/**
 * `true` when `text` (already whitespace-normalized) is exactly one of
 * Psalm 119's own 22 real acrostic letter names — see
 * {@link ACROSTIC_LETTER_NAMES}'s own doc comment. Exported on its own,
 * separate from the token-walking machinery below, so `usfm/verify.ts` can
 * import this one static classification rule directly — the same
 * shared-reference-table relationship `resolveBookId`/`classifyFootnote`
 * already have with the verifier: never a parsing/segmentation algorithm
 * with room for a symmetric bug, just the one small table both sides are
 * *supposed* to agree on.
 */
export function isAcrosticLetterName(text: string): boolean {
  return ACROSTIC_LETTER_NAMES.has(text);
}

/** The result of walking one `\d`/`\sp` span's own text. */
export interface HeadingSpanResult {
  /** The span's own already-classified text pieces, ready for `buildRunNodes`/`collapseContentNodes` or a plain-text classification check. */
  readonly pieces: InlineTextPiece[];
  /** The index of the marker/token that ended this span — never consumed; the caller resumes its own dispatch from here, in the same iteration, since a heading span has no closing tag of its own to skip past. */
  readonly nextIndex: number;
}

/**
 * Walks the token stream from `startIndex` (the token immediately after a
 * `\d` or `\sp` marker) through plain text, an embedded `\w`/`+w` wrapper
 * (discarded — see below), and an embedded `\f`...`\f*` footnote (reused
 * from `usfm/footnotes.ts`'s `buildFootnoteContent` directly, never
 * forked), stopping at the first token that is none of those.
 *
 * **`\w`/`\+w`'s own `strong` attribute is discarded unconditionally, not
 * merely for the two real cases that need it.** Confirmed directly: no
 * in-scope `\d` line carries a `\w` tag except two of Psalm 119's
 * own acrostic markers (`\d \w HE|strong="H3588"\w*`, `\d SIN \w
 * AND|strong="H4941"\w* SHIN`) — WEB's own Strong's tagger ran over the
 * *whole* file without knowing a `\d` line is a heading rather than verse
 * prose, and both "HE" and "AND" happen to also be ordinary English
 * dictionary words it tagged like any other. A Strong's number on a letter
 * name (or a speaker label) is meaningless either way — no established
 * convention anywhere in this repo puts `strong` on a `heading`/`subtitle`
 * node — so this walker never builds a `strong`-carrying piece at all; it
 * only needs to *see* the `\w`/`\w*` boundary well enough to keep walking
 * past it without ending the span early.
 */
export function buildHeadingSpanContent(tokens: readonly Token[], startIndex: number): HeadingSpanResult {
  const pieces: InlineTextPiece[] = [];
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.type === "text") {
      pieces.push({ text: token.text });
      index++;
      continue;
    }

    if ((token.type === "open" || token.type === "close") && token.name === "w") {
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "f") {
      const { footnote, nextIndex } = buildFootnoteContent(tokens, index + 1);
      attachFootToPieces(pieces, footnote);
      index = nextIndex;
      continue;
    }

    // A marker, or any other open/close pair — never observed inside a
    // \d/\sp span in the in-scope corpus beyond the cases above, but this
    // is the correct, general stopping condition regardless: nothing here
    // assumes one of those other shapes actually exists.
    break;
  }

  return { pieces, nextIndex: index };
}

/** Collapses `pieces` into plain text the way {@link ACROSTIC_LETTER_NAMES} membership is checked against — whitespace-normalized, trimmed, `strong`/`marks`/`foot` all irrelevant since a heading-span piece never carries them (see {@link buildHeadingSpanContent}'s own doc comment). */
function plainTextOf(pieces: readonly InlineTextPiece[]): string {
  return pieces
    .map((piece) => piece.text ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classifies and builds one `\d` span's own final content: "does this
 * heading's text reduce to nothing but a canonical letter name," checked
 * against the piece's own plain text, not its position in the book (both
 * the ordinary superscriptions and the acrostic markers use the identical
 * `\d` tag).
 *
 * An acrostic marker never carries an embedded footnote in this corpus, so
 * classification only ever needs the plain text; an ordinary
 * superscription's own `pieces` are run through the same
 * `buildRunNodes`/`collapseContentNodes` pipeline `usfm/footnotes.ts`
 * already uses for a footnote's own body, matching the same
 * footnote-in-run shape already established elsewhere in this pipeline —
 * so a footnote-bearing superscription (e.g. Psalm 46:0) lands inside the
 * subtitle's own content the same way a footnote lands inside any other
 * run.
 */
export function buildSuperscriptionContent(
  pieces: readonly InlineTextPiece[],
): ContentHeading | ContentSubtitle {
  const plainText = plainTextOf(pieces);
  if (isAcrosticLetterName(plainText)) {
    return { heading: plainText, type: "acrostic" };
  }

  const nodes = buildRunNodes(pieces);
  const content: Content = collapseContentNodes(nodes);
  return { subtitle: content };
}

/**
 * Builds one `\qc` span's own final content — Psalm 119's real acrostic
 * letter heading, on a different USFM marker than `\d`, carrying the real
 * Hebrew glyph inline rather than `\d`'s bare transliteration (`\qc א
 * ALEPH.`, `20-PSAeng-asv.usfm`). Unlike `\d`, which shares its tag with
 * ordinary Psalm superscriptions and needs {@link isAcrosticLetterName} to
 * tell the two apart, every `\qc` instance in this corpus is this exact
 * construct and nothing else, so this builder needs no content-based
 * classification at all; it always produces the acrostic shape.
 *
 * `splitScriptRuns` (`usfm/splitScriptRuns.ts`, already proven for
 * WEB's own bare-Greek footnote content) separates the leading Hebrew
 * letter from its trailing transliterated name, matching the already-
 * established `{heading: [{text, script: "H"}, " <NAME>"], type:
 * "acrostic"}` shape for a source that really prints the glyph. This
 * source's own trailing period (`" ALEPH."`, not `" ALEPH"`) is kept —
 * real source punctuation, not chrome.
 */
export function buildAcrosticGlyphHeading(pieces: readonly InlineTextPiece[]): ContentHeading {
  const text = plainTextOf(pieces);
  return { heading: splitScriptRuns(text, "H"), type: "acrostic" };
}

/**
 * Builds one `\sp` speaker label's own final content — always a plain
 * `heading`, never inline italic text: the source marks a speaker label
 * with the same construct it uses for section headings, and encoding it as
 * structure is stronger than folding it into the verse text as a styled
 * run. Every in-scope instance is a bare name with no embedded footnote or
 * Strong's tag, so this never needs anything beyond the same run-building
 * pipeline {@link buildSuperscriptionContent} already uses for its own
 * subtitle case — reused here rather than forked, even though this
 * corpus's own real data never exercises the footnote path for `\sp`.
 */
export function buildSpeakerHeading(pieces: readonly InlineTextPiece[]): ContentHeading {
  const nodes = buildRunNodes(pieces);
  const content: Content = collapseContentNodes(nodes);
  return { heading: content };
}

/**
 * The five Psalter book divisions' own spelled-out ordinal words, in the
 * order WEB's own five `\ms1` markers occur — not derived from the
 * source's own raw "BOOK 1".."BOOK 5" text, since this deliberately departs
 * from WEB's own literal wording to match this repo's already-shipped
 * convention, so a boundary's own *position* in the book (first, second,
 * ...), not any digit parsed out of the source, is what selects a word
 * here.
 */
const ORDINAL_WORDS = ["One", "Two", "Three", "Four", "Five"];

/**
 * Builds one Psalter book-division heading — `[{text: "Book <Word>", marks:
 * ["sc"]}, " (Psalms <start>–<end>)"]`, matching the already-established
 * output shape exactly. `start`/`end` are plain numbers the caller must
 * compute from its own already-segmented verse data
 * (`usfm/segmentVerses.ts`'s own post-pass, once every `\ms1` boundary's
 * own chapter is known and the book's own highest chapter is known too) —
 * never hand-typed, and never recomputed here, since this function has no
 * access to "the rest of the book" on its own.
 *
 * @param index - 0 for the first `\ms1` this book carries, 1 for the
 *   second, and so on — selects {@link ORDINAL_WORDS}.
 * @throws When `index` names a boundary beyond the five WEB's own Psalter
 *   ever produces — a genuinely new construct a future source might need,
 *   not something to guess a sixth word for. An unrepresented case belongs
 *   to a human decision, not a silent extrapolation.
 */
export function buildBookDivisionHeading(index: number, start: number, end: number): ContentHeading {
  const word = ORDINAL_WORDS[index];
  if (word === undefined) {
    throw new Error(
      `buildBookDivisionHeading: no ordinal word for book-division index ${index} — only ${ORDINAL_WORDS.length} are known (${ORDINAL_WORDS.join(", ")})`,
    );
  }

  return { heading: [{ text: `Book ${word}`, marks: ["sc"] }, ` (Psalms ${start}–${end})`] };
}
