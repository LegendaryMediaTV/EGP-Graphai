/**
 * This module's own construct family: Psalm superscriptions (`\d`), the
 * Psalm 119 acrostic letter markers (also `\d` in WEBUS2020's own corpus —
 * the identical USFM tag, only distinguishable by what its own text
 * actually is — or `\qc` in ASV1901's, a different marker carrying the
 * real Hebrew glyph rather than a bare transliteration), the Psalter's
 * five book-division headings (`\ms`/`\ms1`/`\ms2`/`\ms3`), and Song of
 * Solomon's speaker labels (`\sp`).
 *
 * Three of those four markers mean something more general in USFM than the
 * construct this module builds from them: `\d` is any Psalm
 * superscription, `\qc` any centered poetic line, `\ms` and its numbered
 * levels any major-section heading. So each of the three is recognized by
 * what it actually prints — {@link isAcrosticLetterName},
 * {@link isAcrosticGlyphHeading}, {@link psalterBookDivisionNumber} —
 * never by which marker it is or where in the book it sits, which for
 * `\qc` and `\ms1` would encode the single use their one source on disk
 * happens to make of them.
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
 * A book division's own computed verse range needs to see every division
 * in the book before it can know where any one of them ends — a genuine
 * lookahead this module's own {@link buildBookDivisionHeading} takes as plain numbers,
 * leaving the lookahead itself to whichever caller already knows the whole
 * book (`usfm/segmentVerses.ts`'s own post-pass, once the token walk is
 * done and every verse record already exists).
 */

import Content, { ContentHeading, ContentSubtitle } from "../../types/Content";
import { buildFootnoteContent } from "./footnotes";
import { attachFootToPieces, buildRunNodes, collapseContentNodes, InlineTextPiece } from "./inlineMarks";
import { splitNonLatinScriptRuns } from "./splitScriptRuns";
import { Token } from "./tokenize";

/**
 * Every transliterated name the 22 Hebrew letters go by in an acrostic
 * heading, one group per letter, uppercased for the case-insensitive
 * lookup {@link isAcrosticLetterName} does.
 *
 * The canonical 22 are read from this repo's own already-shipped tagged
 * acrostic data (`bible-versions/NKJV1982/19-PSA.json`) rather than typed
 * out from memory; every variant beside them is attested in another
 * shipped version's own acrostic headings (named per group) or is a
 * standard transliteration of the same letter. The breadth is deliberate:
 * the question asked here is "is this text nothing but a letter name," and
 * a source spelling Ṣade "Tsade" means the same construct WEB spells
 * "TZADHE".
 *
 * "KAPF" (WEBUS2020) and "HHETH" (ASV1901) are their own sources'
 * misspellings, kept rather than corrected so already-imported data still
 * classifies — the standard spellings sit beside them.
 */
const ACROSTIC_LETTER_NAMES = new Set([
  "ALEPH", "ALEF", // NET2019: "Alef"
  "BETH", "BET", // KJV1769: "Bet"
  "GIMEL",
  "DALETH", "DALET", "DELETH", // KJV1769/NET2019: "Dalet"; CLV1880: "deleth"
  "HE",
  "WAW", "VAV", // WEBUS2020/ASV1901/LSB2021/NASB1995: "VAV"
  "ZAYIN", "ZAIN", "ZAI", // KJV1769/YLT1898: "Zain"; CLV1880: "zai"
  "HETH", "HET", "CHETH", "KHET", "HHETH", // KJV1769: "Het"; CSB2017/YLT1898: "Cheth"; NET2019: "Khet"; ASV1901: "HHETH"
  "TETH", "TET", // KJV1769/NET2019: "Tet"
  "YOD", "YODH", "IOTH", // WEBUS2020/ESV2025/LSB2021: "YODH"; CLV1880: "ioth"
  "KAPH", "KAF", "CAPH", "CAF", "KAPF", // NET2019: "Kaf"; CLV1880: "caf"; WEBUS2020: "KAPF"
  "LAMED", "LAMEDH", // WEBUS2020/ESV2025/LSB2021: "LAMEDH"
  "MEM", "ME", // CLV1880: "me"
  "NUN",
  "SAMEK", "SAMEKH", "SAMECH", // WEBUS2020/LSB2021: "SAMEKH"; CLV1880/YLT1898: "Samech"
  "AYIN", "AIN", // KJV1769/CLV1880: "Ain"
  "PE", "FE", // CLV1880: "fe"
  // CSB2017/NET2019: "Tsade"; MSB2025: "TZADE"; WEBUS2020: "TZADHE"; KJV1769: "Zade"; CLV1880: "sade"
  "TSADDE", "TSADHE", "TSADE", "TSADI", "TZADE", "TZADHE", "TZADI", "SADHE", "SADE", "ZADE",
  "QOPH", "QOF", "KOPH", "COF", // NET2019: "Qof"; MSB2025/YLT1898: "KOPH"; CLV1880: "cof"
  "RESH", "RES", // CLV1880: "res"
  "SIN", "SHIN", "SEN", // CLV1880: "sen"; the combined "SIN AND SHIN" form is LETTER_NAME_JOINERS' job, never an entry here
  "TAU", "TAV", "TAW", "THAV", "THAU", // WEBUS2020/ASV1901: "TAV"; ESV2025/NIV1984: "Taw"; CLV1880: "thau"
]);

/**
 * How a source joins two letter names into one combined acrostic stanza
 * heading — "SIN AND SHIN" (WEBUS2020), "SIN and SHIN" (MSB2025),
 * "Sin/Shin" (NET2019), "Sin – Shin" and "He – Vav" (LSB2021). Splitting
 * on the joiner and requiring *every* part to be a letter name covers all
 * five with one rule, rather than a table entry per joiner style per pair.
 */
const LETTER_NAME_JOINERS = /\s+(?:AND|&)\s+|\s*[/\-–—]\s*/;

/** Punctuation a source prints around a letter name that is display convention rather than part of the name — ASV1901's own trailing period (`\qc א ALEPH.`) and NET2019's own parentheses ("(Alef)"). */
const LETTER_NAME_PUNCTUATION = /^[\s.,;:()[\]"'“”‘’]+|[\s.,;:()[\]"'“”‘’]+$/g;

/**
 * `true` when `text` (already whitespace-normalized) is nothing but an
 * acrostic letter name — one of {@link ACROSTIC_LETTER_NAMES}, or two of
 * them joined into a combined stanza heading (see
 * {@link LETTER_NAME_JOINERS}), with display punctuation and letter case
 * both ignored.
 *
 * Exported on its own, separate from the token-walking machinery below, so
 * `usfm/verify.ts` can import this one static classification rule directly
 * — the same shared-reference-table relationship
 * `resolveBookId`/`classifyFootnote` already have with the verifier: never
 * a parsing/segmentation algorithm with room for a symmetric bug, just the
 * one small table both sides are *supposed* to agree on.
 */
export function isAcrosticLetterName(text: string): boolean {
  const parts = text
    .toUpperCase()
    .split(LETTER_NAME_JOINERS)
    .map((part) => part.replace(LETTER_NAME_PUNCTUATION, ""))
    .filter((part) => part.length > 0);

  return parts.length > 0 && parts.every((part) => ACROSTIC_LETTER_NAMES.has(part));
}

/** The result of walking one heading span's own text (`\d`/`\sp`/`\s1`, the `\ms` family and the `\mr` after one, and a `\qc` the caller has yet to classify). */
export interface HeadingSpanResult {
  /** The span's own already-classified text pieces, ready for `buildRunNodes`/`collapseContentNodes` or a plain-text classification check. */
  readonly pieces: InlineTextPiece[];
  /** The index of the marker/token that ended this span — never consumed; the caller resumes its own dispatch from here, in the same iteration, since a heading span has no closing tag of its own to skip past. */
  readonly nextIndex: number;
}

/**
 * Walks the token stream from `startIndex` (the token immediately after a
 * heading-span marker — `\d`/`\sp`/`\s1`/`\qc`, any of the `\ms` family,
 * or the `\mr` reference range after one) through plain text,
 * an embedded `\w`/`+w` wrapper
 * (discarded — see below), and an embedded `\f`...`\f*` footnote (reused
 * from `usfm/footnotes.ts`'s `buildFootnoteContent` directly, never
 * forked), stopping at the first token that is none of those.
 *
 * **`\w`/`\+w`'s own `strong` attribute is discarded unconditionally, not
 * merely for the two real cases that need it.** No in-scope `\d` line
 * carries a `\w` tag except two of Psalm 119's own acrostic markers (`\d \w
 * HE|strong="H3588"\w*`, and a `\w` sitting mid-string in `\d SIN \w
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

/**
 * Collapses `pieces` into the plain text the span actually prints —
 * whitespace-normalized, trimmed, `strong`/`marks`/`foot` all irrelevant
 * since a heading-span piece never carries them (see
 * {@link buildHeadingSpanContent}'s own doc comment).
 *
 * Exported so `usfm/segmentVerses.ts` reads an `\mr` reference range's own
 * text by the same rule every classification here is checked against,
 * rather than keeping a second, quietly divergent notion of what a span
 * prints.
 */
export function headingSpanText(pieces: readonly InlineTextPiece[]): string {
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
  const plainText = headingSpanText(pieces);
  if (isAcrosticLetterName(plainText)) {
    return { heading: plainText, type: "acrostic" };
  }

  const nodes = buildRunNodes(pieces);
  const content: Content = collapseContentNodes(nodes);
  return { subtitle: content };
}

/**
 * Anything in a heading's text that is not part of a transliterated letter
 * name: the Hebrew glyph a source prints ahead of the name, and the
 * combining points that ride on it.
 *
 * Written as "everything that is not Latin, punctuation, a digit, or
 * whitespace" rather than by naming Hebrew's own codepoint ranges, so no
 * range table has to be right for this classifier to be. A list of blocks can
 * be short by one — `usfm/splitScriptRuns.ts`'s Hebrew range really was,
 * missing the presentation-form shin CSB2017 ships, until that block was
 * added — and needs extending again for every script a future source prints
 * ahead of a letter name. The complement of Latin already covers Greek and
 * Syriac too. Missing a glyph here would demote a real letter heading to a
 * poetic line.
 */
const NON_LATIN_GLYPHS = /[^\p{Script=Latin}\p{White_Space}\p{Punctuation}\p{Number}]+/gu;

/**
 * `true` when one `\qc` span's own text is an acrostic letter heading —
 * the construct ASV1901 writes as `\qc א ALEPH.` — rather than the
 * centered poetic line `\qc` means in USFM generally.
 *
 * The glyph a source prints ahead of the name is dropped before the test
 * rather than spelled into {@link ACROSTIC_LETTER_NAMES} 22 times over
 * (see {@link NON_LATIN_GLYPHS}). A source printing no glyph at all (`\qc
 * ALEPH`) classifies the same way — there is simply nothing to drop.
 */
export function isAcrosticGlyphHeading(pieces: readonly InlineTextPiece[]): boolean {
  return isAcrosticLetterName(headingSpanText(pieces).replace(NON_LATIN_GLYPHS, " "));
}

/**
 * Builds one `\qc` acrostic letter heading's own final content — Psalm
 * 119's letter heading on a different USFM marker than `\d`, carrying the
 * real Hebrew glyph inline rather than `\d`'s bare transliteration (`\qc א
 * ALEPH.`, `20-PSAeng-asv.usfm`). Only for a span
 * {@link isAcrosticGlyphHeading} has already accepted; a `\qc` that is
 * USFM's ordinary centered poetic line is verse content, never a heading,
 * and never reaches this builder (`usfm/segmentVerses.ts`'s own dispatch).
 *
 * {@link splitNonLatinScriptRuns} (`usfm/splitScriptRuns.ts`) separates the
 * leading glyph from its trailing transliterated name, matching the
 * established `{heading: [{text, script: "H"}, " <NAME>"], type: "acrostic"}`
 * shape for a source that really prints the glyph. This source's own
 * trailing period (`" ALEPH."`, not `" ALEPH"`) is kept — real source
 * punctuation, not chrome.
 *
 * Scans for both Hebrew and Greek, not Hebrew alone — the mirror of the
 * asymmetry {@link piecesForPlainText} (`usfm/footnotes.ts`) closed. No real
 * Greek acrostic exists anywhere in this corpus (acrostic Psalms are a
 * Hebrew construct), but scanning Hebrew only here was the same shape of gap
 * that let a different call site ship an untagged word, so it closes here
 * too rather than waiting for a future import to prove it out.
 */
export function buildAcrosticGlyphHeading(pieces: readonly InlineTextPiece[]): ContentHeading {
  const text = headingSpanText(pieces);
  return { heading: splitNonLatinScriptRuns(text), type: "acrostic" };
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

/** The registry book id (`usfm/metadata.ts`'s `resolveBookId`) of the one book a Psalter book division can possibly belong to — {@link buildBookDivisionHeading} writes the word "Psalms" into its own output, so a division heading in any other book would be a contradiction in terms. */
const PSALMS_BOOK_ID = "PSA";

/**
 * A Psalter book-division label as the two sources on disk print it:
 * WEBUS2020's Arabic "BOOK 1".."BOOK 5" and ASV1901's Roman "BOOK
 * I".."BOOK V", with or without trailing punctuation. The numeral is
 * required — it is what makes the text a *division* label rather than one
 * of the countless ordinary major-section headings the `\ms` family also
 * marks — and captured, since the division's own number is read off it.
 */
const BOOK_DIVISION_LABEL = /^BOOK\s+(\d+|[IVXLCDM]+)[.:]?$/i;

/** Each Roman digit {@link BOOK_DIVISION_LABEL} admits, and what it is worth. */
const ROMAN_DIGIT_VALUES: ReadonlyMap<string, number> = new Map([
  ["I", 1],
  ["V", 5],
  ["X", 10],
  ["L", 50],
  ["C", 100],
  ["D", 500],
  ["M", 1000],
]);

/**
 * What a {@link BOOK_DIVISION_LABEL} numeral is worth — Arabic read
 * directly, Roman by the subtractive rule (`IV` is 4, not 6). Both
 * spellings are real on disk (WEBUS2020 Arabic, ASV1901 Roman) and mean
 * the same thing, so reading them apart here lets everything downstream
 * deal in one plain number.
 */
function numeralValue(numeral: string): number {
  if (/^\d+$/.test(numeral)) return Number(numeral);

  const digits = [...numeral.toUpperCase()].map((digit) => ROMAN_DIGIT_VALUES.get(digit) as number);
  return digits.reduce((total, value, at) => total + (value < (digits[at + 1] ?? 0) ? -value : value), 0);
}

/**
 * Which Psalter book division one major-section span names — 1 for "BOOK
 * 1"/"BOOK I", 5 for "BOOK 5"/"BOOK V" — or `undefined` when the span is
 * not a division label at all, the ordinary major-section heading `\ms`
 * and friends mean in USFM generally.
 *
 * Answering "is it" and "which one" in one call keeps a caller from
 * recognizing the construct by one reading of the label and then naming it
 * by a second reading that disagrees.
 *
 * Both halves of the recognition are load-bearing:
 * {@link buildBookDivisionHeading} discards the marker's own text and
 * writes the word "Psalms" into a computed range, so a division heading in
 * another book would contradict itself, and a major-section heading inside
 * Psalms can still be an ordinary section title.
 *
 * @param book - The registry book id the caller is segmenting, as handed to
 *   `segmentVerses` — never read from the source's own `\id`.
 * @param pieces - The major-section span's own already-walked pieces
 *   ({@link buildHeadingSpanContent}).
 */
export function psalterBookDivisionNumber(
  book: string,
  pieces: readonly InlineTextPiece[],
): number | undefined {
  if (book !== PSALMS_BOOK_ID) return undefined;

  const label = BOOK_DIVISION_LABEL.exec(headingSpanText(pieces));
  return label === null ? undefined : numeralValue(label[1]);
}

/**
 * The five Psalter book divisions' own spelled-out ordinal words. This
 * repo's shipped convention departs from the source's literal "BOOK
 * 1"/"BOOK I" wording, but the *numeral* the source prints is what selects
 * a word here — a file whose first division reads "BOOK 2" says "Book
 * Two", not "Book One" for being first.
 */
const ORDINAL_WORDS = ["One", "Two", "Three", "Four", "Five"];

/**
 * Builds one Psalter book-division heading — `[{text: "Book <Word>", marks:
 * ["sc"]}, " (Psalms <start>–<end>)"]`, matching the already-established
 * output shape exactly. `start`/`end` are plain numbers the caller computes
 * from its own already-segmented verse data, never recomputed here: this
 * function has no access to "the rest of the book" on its own.
 *
 * @param index - Which of the five divisions this is, zero-based: 0 for
 *   "BOOK 1"/"BOOK I", 4 for "BOOK 5"/"BOOK V" — selects
 *   {@link ORDINAL_WORDS}. Where that number comes from is the caller's own
 *   decision: `usfm/segmentVerses.ts` reads it off the label
 *   ({@link psalterBookDivisionNumber}), while a source with no numeral to
 *   read has only the division's position to go on.
 * @throws When `index` names a division beyond the five the Psalter has —
 *   an unrepresented case belongs to a human decision, not a guessed sixth
 *   word.
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
