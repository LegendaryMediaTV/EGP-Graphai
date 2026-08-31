/**
 * The shared footnote-type classification table: a pure, side-effect-free
 * lookup with no I/O, imported by both `usfm/footnotes.ts` (the importer)
 * and `usfm/verify.ts` (the independent verifier) — neither may import the
 * other's parsing/segmentation code, but both must agree on this one table.
 *
 * Classifies an already-extracted footnote body (the concatenated `\ft`/
 * `\fq`/`\fqa` text, `\fr`'s own reference label already dropped) into one
 * of four ordered types — `xrf` → `var` → `trn` → `stu` — never `map` (see
 * {@link classifyFootnote}'s own doc comment for why).
 *
 * **This table classifies by construct, not by memorized wording**, with
 * two deliberate exceptions ({@link VERSIFICATION_VARIANT} and
 * {@link UNCERTAIN_MEANING_CAVEAT}, each argued in its own doc comment). An
 * earlier version worked from literal phrase lists lifted out of one
 * edition's own footnotes — down to a source-side typo,
 * `"authorites insert"` — which meant every new edition run through it
 * needed its own pass of new literals. The rules below ask instead what
 * *shape* a body has, so the same rules hold across editions without being
 * re-derived from each one's house style.
 *
 * **Order is load-bearing**, and each rule's own doc comment below explains
 * why it sits where it does. The one ordering decision not local to a rule:
 * `xrf` runs first because it is a whole-body test a mixed note can never
 * satisfy, so it is safe to try before anything else — and it must resolve
 * a citation of the epistle whose abbreviation is spelled like a language
 * name before any translation-opener rule reads that abbreviation as the
 * language. Two of the `var` checks (see {@link namesAWitness} and
 * {@link VERSIFICATION_VARIANT}) carry no relative order between them at
 * all, since neither rule's body-shape could collide with the other's.
 */

import Footnote from "../../types/Footnote";

/** The four types this classifier can ever produce — `map` is never assigned (see {@link classifyFootnote}). */
export type ClassifiableFootnoteType = Exclude<NonNullable<Footnote["type"]>, "map">;

/**
 * The three self-documented Greek-text-tradition sigla, exported (not just
 * the regex built from them below) so `usfm/footnotes.ts`'s own
 * footnote-initial capitalization fix can anchor the identical vocabulary
 * to a body's own *leading* word instead of keeping a second copy of "which
 * abbreviations count as a witness siglon." That fix only ever looks at a
 * body's opening word, a narrower use than this module's own unanchored,
 * anywhere-in-the-body {@link WITNESS_SIGLA} match below, so the two call
 * sites share the vocabulary rather than the compiled pattern — and this
 * stays at three names rather than widening to that constant's own seven.
 */
export const WITNESS_SIGLA_NAMES = "TR|NU|MT";

/** A single sub-verse letter (`23:29–30a`, `23:30b–34`) — real CSB2017 shapes that split one verse into lettered parts for cross-referencing. Applies only where a verse number can appear, never the bare leading chapter number, since a chapter is never lettered this way. */
const VERSE_LETTER = "[a-c]?";
/**
 * The one three-word book abbreviation a real edition prints, and the one
 * deliberate exception to the book-prefix group's own one-word cap below.
 * Safe as its own alternative rather than a general widening of that cap:
 * each of its three tokens is independently too short or too generic to
 * risk alone, so a body has to carry this precise phrase — not just any two
 * capitalized words in a row — to match here at all, which is what keeps it
 * clear of the collision the cap exists to prevent (see {@link REFERENCE}).
 */
const SONG_OF_SOLOMON_PREFIX = "S\\.?\\s+of\\s+Sol\\.?\\s?";
/**
 * The one shape a citation can take without a single digit anywhere in it: a
 * one-chapter book named alone, `‹citation›; ‹bare book name›`, because a
 * book with only one chapter has no verse inside it to point at. It occurs
 * in **both** the abbreviated and the fully spelled-out form — matching only
 * the abbreviation, with a word boundary at its tail, silently rejected every
 * spelled-out occurrence — and covering both reaches 4 bodies across 3
 * versions, each of them a citation list and nothing else.
 *
 * Still scoped to this one book rather than every one-chapter book in the
 * canon, and that scoping is measured rather than assumed: a census of every
 * footnote in every version, run with the alternation widened to the
 * remaining one-chapter books in both their abbreviated and two-word
 * numbered forms, produced **zero** additional matches corpus-wide. Every
 * other one-chapter citation carries its own number, so widening would be a
 * rule with nothing behind it — and the two-word forms would put two
 * capitalized words in a row back inside a citation, the collision
 * {@link REFERENCE}'s own one-word cap exists to prevent.
 */
const BARE_SINGLE_CHAPTER_BOOK = "\\bObad(?:iah)?\\b";
/**
 * The original-language names in their **spelled-out** form, as distinct
 * from the abbreviations that carry the same meaning (see
 * {@link LANGUAGE_ABBREVIATION}). The distinction is not stylistic: a
 * spelled-out language name collides with no book name anywhere in the
 * canon, while several of the abbreviations *are* ordinary book
 * abbreviations. Two rules turn on that one fact — the one-word book slot
 * below and {@link LANGUAGE_AFTER_SEMICOLON} far further down — so it is
 * stated once here and consumed at both.
 *
 * The slot below must refuse these names outright. A language name
 * introducing an original-language reading is one capitalized word like any
 * other, so `‹language› ‹reading›` with a numeral for the reading matches
 * whole as a single citation and the note reads as nothing but
 * cross-references, the name never reaching the residue strip to be weighed
 * as a translation signal. The abbreviations deliberately are **not**
 * refused: doing so would stop ordinary citations matching at all.
 */
const SPELLED_OUT_LANGUAGE = "(?:Hebrew|Greek|Aramaic|Latin|Samaritan)";
/**
 * The word standing between a book name and a number to say the number is
 * a chapter rather than a verse — `‹book› ch ‹n›`, `‹book› chs ‹n›–‹m›`,
 * `‹book› ch ‹n›, ‹n›, ‹n›`. An edition reaches for it exactly where a
 * citation has no verse to give: a whole chapter, or a run of them.
 *
 * It has to live inside {@link REFERENCE} rather than be swept up as
 * connective residue, even though {@link CONNECTIVES} already deletes the
 * bare word. Deleting it there leaves the book name stranded: the citation
 * pattern stops at the book because no digit follows it, matches only the
 * number further along, and the name it never reached survives the residue
 * strip and reads as prose. Consuming the word here keeps the name attached
 * to the citation it belongs to.
 *
 * Lowercase only, deliberately. Capitalized, the same two letters open a
 * versification note about the host verse's own numbering rather than a
 * citation of another passage, and that construct is a different type's
 * business (see {@link VERSIFICATION_VARIANT}).
 */
const CHAPTER_WORD = "(?:chs?\\.?\\s)";
/**
 * One reference-shaped run — a citation, not a claim about the text. The
 * book name or abbreviation is optional and, when present, at most **one**
 * word, never two in a row. That cap is what keeps a body shaped
 * `‹translation opener›, ‹place name›. See ‹citation›.` from being read as
 * a citation on the place name: with two book words allowed, the pattern
 * would swallow that name and the word after it into the reference, leaving
 * nothing behind to prove the body is more than a citation (see
 * {@link isNothingButReferences}). The alternation's remaining shapes are
 * labelled line by line below.
 *
 * The slot is also barred from accepting a spelled-out language name (see
 * {@link SPELLED_OUT_LANGUAGE}) — the same concern as the one-word cap,
 * carried one class of word further. Two citation shapes sit outside the
 * run entirely: {@link BARE_SINGLE_CHAPTER_BOOK} and
 * {@link SONG_OF_SOLOMON_PREFIX}.
 */
const REFERENCE = new RegExp(
  [
    "(?:",
    "(?:(?:[1-4]|I{1,3}|IV)\\s?)?", // 1 / 2 / II numeral prefix
    `(?:${SONG_OF_SOLOMON_PREFIX}|(?!${SPELLED_OUT_LANGUAGE}\\b)[A-Z][A-Za-z]{1,11}\\.?\\s?)?`, // one book name or abbreviation, never two and never a language name, except Song of Solomon's own three-token form
    `${CHAPTER_WORD}?`, // "ch"/"chs" saying the number that follows is a chapter, not a verse
    "\\d+", // chapter (or a bare verse continuing a previous citation)
    `(?::\\d+${VERSE_LETTER}|:title|,\\s?title)?`, // :verse, :verse-letter, :title, ", title"
    "(?:\\s?f{1,2}\\.?)?", // 7f. / 7ff.
    `(?:[-–—]\\s?\\d+${VERSE_LETTER}(?::\\d+${VERSE_LETTER})?(?:\\s?f{1,2}\\.?)?)?`, // a-b range, either end optionally lettered
    `(?:\\s?,\\s?\\d+${VERSE_LETTER}(?::\\d+${VERSE_LETTER})?(?:\\s?f{1,2}\\.?)?)*`, // , 11, 18, 12a
    "(?:\\s(?:LXX|MT|TR|NU))?", // trailing tradition siglon
    ")",
    `|${BARE_SINGLE_CHAPTER_BOOK}`, // or a one-chapter book cited by name alone, with no digit at all
  ].join(""),
  "g",
);

/**
 * Words that may sit between citations, or lead into one, without turning
 * an otherwise citation-only body into prose. `"See marginal note on
 * ‹citation›."` is the real shape this exists for: without treating "See",
 * "marginal", "note", and "on" as connective residue, deleting the citation
 * leaves `"Seemarginalnoteon"` behind and the body wrongly falls through to
 * `stu`. The lead-in also occurs on the other side of the reference.
 *
 * `title`/`titles` covers a different real shape: a heading
 * cross-reference writes the collective descriptor once at the end of a
 * whole citation list rather than attaching it to each number. With no
 * `:`/`,` tying the word to a specific number the way {@link REFERENCE}'s
 * own `:title`/`, title` tail expects, no such list is a single match on
 * its own, so without treating the word as connective residue the whole
 * list falls through to `stu` on the leftover alone.
 *
 * `mg` is the two-letter siglum for the same margin `marginal`/`margin`
 * already cover, appended to a citation to say the reading is the one
 * printed in that edition's own margin — `‹citation› mg`, and once
 * `‹citation› and mg`. It carries no claim about this verse's wording, only
 * about where the cited reading is found, so it is filler in exactly the
 * sense the spelled-out words beside it already are. Adding the
 * abbreviation states the same policy in the shorter spelling rather than
 * introducing a new one.
 *
 * Language names are deliberately **not** in this list, though they were
 * once. Everything here is deleted wherever it matches, and a language name
 * is filler in only one position — see {@link PARENTHETICAL_LANGUAGE_TAG}
 * for the narrower rule that replaced them, and for the measurement that
 * settled it.
 */
const CONNECTIVES =
  /\b(?:see|compare|cf|also|and|or|marginal|notes?|on|margin|mg|verses?|ver|vv|titles?|chapters?|chs?|cp|ff|f|parallel|following|above|below|version|for)\b/gi;

/**
 * An anchored "Fulfilled in ..."/"Foretold in ..." lead-in — the construct
 * citing where a prophecy or type was fulfilled or first foretold, always
 * exactly one of these two verbs at the body's own start, across the 24
 * bodies corpus-wide that take the shape. Stripped as its own anchored
 * prefix rather than folded into {@link CONNECTIVES}, because "in" alone is
 * far too common a word to remove as filler wherever it appears — that
 * would strip real prose too — so this only ever touches the body's own
 * opening, immediately before the nothing-but-citations check in
 * {@link isNothingButReferences} runs. The 81 other bodies that merely
 * mention "fulfilled" somewhere never open this way, so anchoring costs
 * nothing in coverage and keeps that discursive commentary `stu`.
 */
const FULFILLMENT_OPENER = /^\s*(?:fulfilled|foretold)\s+in\s+/i;

/**
 * A private-use placeholder standing where a citation was deleted, so the
 * residue strip in {@link isNothingButReferences} can still tell "a citation
 * sat here" apart from ordinary whitespace. Nothing in a real body can
 * contain it, and {@link RESIDUE_FILLER} clears it at the end of the same
 * pass, so it never escapes that one pipeline.
 */
const CITATION_MARKER = "\uE000";

/**
 * A `with` joining two citations, `‹citation› with ‹citation›`, optionally
 * reached through the comma or semicolon that closed the first one. Between
 * two citations the word is connective tissue and nothing more.
 *
 * **Requiring a citation on *both* sides is the whole rule.** Carried as an
 * unconditional connective instead — one more word in {@link CONNECTIVES} —
 * it would also delete itself out of the one shape where the word is not
 * filler at all: a translation note offering that very word as its
 * alternative reading, `‹translation opener› with‹punctuation› ‹citation›`,
 * which then has nothing left but a citation. 3 real bodies take that
 * shape, and every one has an opener rather than a citation on its left, so
 * the flanking test separates them cleanly: 7 bodies corpus-wide become
 * citation-only under this rule, and nothing else changes type.
 */
const INTER_CITATION_WITH = new RegExp(`${CITATION_MARKER}[\\s,;]*\\bwith\\b[\\s,;]*${CITATION_MARKER}`, "gi");

/**
 * What may be left over without proving a body is more than citations: the
 * punctuation that separates and terminates them, whitespace, and the
 * {@link CITATION_MARKER} slots standing in for the deleted citations
 * themselves.
 */
const RESIDUE_FILLER = new RegExp(`[;,.:\\s()\\[\\]–—${CITATION_MARKER}-]`, "g");

/**
 * A language name inside parentheses, tagging a citation with which
 * original-language text it is being read in: `‹citation› (‹language›)`,
 * `‹citation› (‹language› version)`, two abbreviations sharing one
 * parenthesis, or a tag carrying a citation of its own. The tag decorates
 * the citation and claims nothing about this verse, so a list carrying one
 * is still nothing but citations. 161 bodies corpus-wide take the shape.
 *
 * **Parenthesization is the whole distinction, and measurement rather than
 * reading settled it.** The obvious remedy — deleting a language name
 * wherever it appears, by carrying the names in {@link CONNECTIVES} as this
 * table once did — moves 177 bodies corpus-wide and **regresses 174 of
 * them**, since the common real shape is the parenthesized tag above, which
 * then loses its citation-only reading. Restricting the deletion to
 * parentheses moves 3 and regresses none. Outside parentheses a language
 * name governs what follows it, and `‹language› ‹reading›` is the strongest
 * translation-or-variant signal this table has, so deleting it there works
 * directly against the rules that depend on it.
 *
 * Stripped before the citations are, so a tag carrying a citation of its own
 * leaves nothing behind either way. Its vocabulary is wider than
 * {@link LANGUAGE}'s, taking in the two-letter abbreviations that constant
 * deliberately omits: inside parentheses a short form has nothing to collide
 * with, which is exactly what is not true out in the open body.
 */
const PARENTHETICAL_LANGUAGE_TAG = /\([^)]*\b(?:greek|hebrew|aramaic|latin|gk|gr|heb|hb|aram|lat)\b[^)]*\)/gi;

/**
 * The whole-body `xrf` test: a body is nothing-but-citations only if at
 * least one real citation matches, and deleting every citation plus every
 * connective plus punctuation leaves nothing behind. Requiring a real
 * citation match up front is what keeps `"Or, and"` — connectives with no
 * digit anywhere — from reading as a citation-only body just because "or"
 * and "and" are both in {@link CONNECTIVES}; with no reference to strip, the
 * residue check never even runs.
 *
 * A citation immediately followed by a trailing tradition siglon is still
 * nothing but a citation: `‹citation› ‹siglon›` would otherwise leave the
 * siglon behind as residue and fall through to {@link namesAWitness},
 * misreading a citation that names which tradition it quotes as a note
 * contesting the verse's own wording.
 *
 * Each strip in the pipeline below is named, and its own constant carries
 * why it is there and why it runs where it does — {@link FULFILLMENT_OPENER},
 * {@link PARENTHETICAL_LANGUAGE_TAG}, {@link CITATION_MARKER}, and
 * {@link INTER_CITATION_WITH}.
 */
function isNothingButReferences(body: string): boolean {
  if (!body.trim()) return false;
  const stripped = body.replace(FULFILLMENT_OPENER, "");
  const references = stripped.match(REFERENCE);
  if (!references) return false; // connectives alone are not a citation
  const residue = stripped
    .replace(PARENTHETICAL_LANGUAGE_TAG, " ")
    .replace(REFERENCE, CITATION_MARKER)
    .replace(INTER_CITATION_WITH, CITATION_MARKER) // two citations joined by that word collapse back to one
    .replace(CONNECTIVES, " ")
    .replace(RESIDUE_FILLER, "");
  return residue.length === 0;
}

/**
 * Witness/text-tradition names spelled out in full, matched case-insensitively
 * anywhere in the body.
 *
 * **`Aquila`, the ancient Greek translator, is deliberately absent**,
 * though he is a genuine named witness in his own right. The name is also
 * an ordinary New Testament person's, appearing as a character across
 * several books, and a note settling which of two people is meant has
 * nothing to do with translation history — a bare match here would misread
 * it as a witness citation. Measured across every corpus body naming the
 * translator: every one names at least one other witness from this same
 * list in the same body, so no genuine case loses its classification
 * without `Aquila` carrying any of that weight on its own.
 */
const NAMED_WITNESSES =
  /\b(?:Septuagint|Vulgate|Syriac|Peshitta|Targum|Mas?soretic|Samaritan|Dead Sea Scrolls?|Symmachus|Theodotion|Alexandrinus|Vaticanus|Sinaiticus|Vatican|Aethiopic|Coptic|Armenian|Old Latin|Byzantine|Majority Text)\b/;

/**
 * Verbs safe to require directly after "the Latin"/"the Latin version(s)"
 * — tight enough that this is always the note's own predicate about what
 * the Latin reads. `has`/`have` belong here, not in
 * {@link LATIN_WITNESS_VERB_REVERSE}: real bodies open with an unrelated
 * "may well have ..." clause well before "the Latin" ever appears, and a
 * wide reverse scan for so common an auxiliary caught those by accident,
 * misreading ordinary sentence grammar as a claim about what Latin says.
 */
const LATIN_WITNESS_VERB_FORWARD =
  "(?:has|have|omits?|reads?|adds?|expands?|assumes?|assumed|is\\s+(?:corrupt|defective|incorrect|imperfect))";
/**
 * Verbs safe to require directly before "the Latin", in the reverse word
 * order a real body sometimes takes (`"is not supported by ... the
 * Latin"`, `"The translation follows the Latin and Greek versions"`).
 * Deliberately narrower than {@link LATIN_WITNESS_VERB_FORWARD}: none of
 * these is a common auxiliary verb, so scanning a wider gap ahead of them
 * for "the Latin" carries none of that construct's own risk.
 */
const LATIN_WITNESS_VERB_REVERSE = "(?:reflects?|reflected|follows|supports?|supported)";
/**
 * `"the Latin"`/`"the Latin version(s)"`, matched only as the subject or
 * object of an actual reading-claim, never bare. Unlike this table's other
 * named witnesses, "Latin" is also the ordinary adjective for the language
 * itself, and real bodies use it that way constantly — word and loanword
 * etymologies, a title's origin, an office's Latin equivalent, a book's own
 * patristic-citation history. None of those is a claim about a reading, and
 * a bare match read every one of them as a witness citation before this fix.
 *
 * The genuine cases are real too: one apparatus in this corpus is built
 * almost entirely around a bare `"The Latin has/omits/is corrupt ..."` as
 * the note's whole content, its book surviving only in translation and so
 * having no original-language witness to name. Anchoring to a claim-shaped
 * predicate — the same construct {@link WITNESS_CLAIM} uses for a witness
 * noun — keeps those without reopening the false positives above.
 */
const LATIN_WITNESS_CLAIM = new RegExp(
  `\\bthe\\s+Latin(?:\\s+versions?)?\\b[^.]{0,15}?\\b${LATIN_WITNESS_VERB_FORWARD}\\b|\\b${LATIN_WITNESS_VERB_REVERSE}\\b[^.]{0,40}?\\bthe\\s+Latin\\b`,
  "i",
);

/**
 * The same witnesses in their abbreviated, period-terminated spellings.
 * Kept as its own pattern rather than folded into
 * {@link NAMED_WITNESSES}'s alternation because a trailing `\b` can never
 * match after a period: `\.` and the space following it are both non-word
 * characters, so there is no boundary between them, and every
 * period-terminated alternative inside a `\b(?:...)\b` wrapper is silently
 * unreachable. Anchoring on the period itself is what makes these match at
 * all.
 *
 * **The trailing `(?![.\sa-z]*\d)` digit guard is not one shared concern —
 * it protects two unrelated collisions, only one of which touches `Syr`.**
 * `Sam` doubles as a book of the canon, cited constantly inside ordinary
 * prose notes that nothing else in this table would catch, so the guard
 * blocks it whenever a chapter:verse follows. `Vg`/`Tg`/`Vss` share the
 * guard for the mirror case: a witness abbreviation surfacing as one
 * supporting citation deep inside a much longer discursive note, which is
 * `stu` on the strength of that one embedded reference, not `var`.
 *
 * `Syr` has never needed this protection. Measured across all 508 real
 * bodies naming it corpus-wide, exactly 2 are followed by a digit within
 * the guard's own reach, and both are genuine `var` claims the guard was
 * wrongly silencing — a measurement dispute between two witnesses, with no
 * other signal in the body, left unclassified as anything but `stu`. `Syr`
 * never collides with a book name or a citation-heavy discursive genre the
 * way `Sam`/`Tg` do, so it is split out unguarded rather than folded back
 * into the shared group `Sam`'s own fix was written for.
 */
const WITNESS_ABBREVIATIONS =
  /\bSyr(?![a-z])|\b(?:Vg|Tg|Vss)(?![a-z])(?![.\sa-z]*\d)|\b(?:Kt|Qr|M\.T)\.|^Sam[.,]?\s(?![.\sa-z]*\d)/;

/**
 * `ℵ` (U+2135), the siglon for Codex Sinaiticus. Kept out of
 * {@link NAMED_WITNESSES}'s alternation for the same reason
 * {@link WITNESS_ABBREVIATIONS} is, one step further along — it is not a word
 * character, so a `\b` on either side of it can never match.
 *
 * It earns its place on a bare witness list with no prose around it at all,
 * the shape a critical edition uses when it simply names who omits a
 * passage — one body in the corpus is that shape, and every other signal in
 * this table sees nothing there. The uncial letters and Gregory-Aland
 * numbers alongside it are far too ordinary to match on; this symbol
 * appears in a critical apparatus and nowhere else.
 *
 * **The papyrus siglon `𝔓` is deliberately absent.** It appears in 25 of
 * that edition's entries and every one already carries `¦`, so it would
 * match nothing this table does not already catch. It is also a trap to
 * copy: `𝔓` is U+1D513, outside the BMP, and the source currently holds
 * U+D513 in all 52 places instead — a Hangul syllable that merely looks
 * similar, from a digit dropped somewhere upstream. A pattern built by
 * copying the character out of that source would silently never match.
 */
const SIGLA_SYMBOLS = /ℵ/u;

/**
 * The short-form tradition sigla, matched **case-sensitively** on purpose.
 * A case-insensitive version of this exact pattern is the single defect
 * that produced the largest share of this classifier's old disagreements
 * with ASV1901: matched with `/i`, `MT` also matches every citation of
 * Matthew abbreviated `Mt.` (`Mt. 4:23`), reading the epistle-free Gospel
 * as a claim about the Masoretic Text. Case-sensitive matching costs
 * nothing here, since every real siglon in scope is written upper-case.
 */
const WITNESS_SIGLA = /\b(?:LXX|DSS|MT|TR|NU|RP|FH)\b/;

/**
 * Reading-verb vocabulary shared by {@link LOWERCASE_SIGLON_READING},
 * {@link WITNESS_CLAIM}, and {@link WITNESS_CLAIM_REVERSE} — the verbs a
 * witness or manuscript can take when a note describes what it says.
 *
 * **The present tense `emends?` deliberately stays out of this list**,
 * unlike the already-present past-tense `emended`. The one construct that
 * needs it is anchored and unambiguous, and
 * {@link ELLIPTICAL_WITNESS_READING} covers it there instead. Added here it
 * widens {@link WITNESS_CLAIM}'s own noun-then-verb reach into unrelated
 * bodies — a long discursive word-study note mentioning a scroll emending a
 * form 400 characters in is a witness noun near "emend" only in the most
 * technical sense, not the note's own overall shape — and whether flipping
 * those is right is a judgment this table's construct-not-wording
 * philosophy should not make unprompted.
 */
const WITNESS_VERB_SOURCE =
  "(?:reads?|adds?|added|omits?|omitted|inserts?|inserted|lacks?|lacking|transposes?|transposed|emended|vary|varies|writes?|says?|has|have|do(?:es)? not have|reverses?|attested)";

/**
 * The one confirmed exception to {@link WITNESS_SIGLA}'s case-sensitivity:
 * one body's lower-case siglon is a genuine source-side casing slip against
 * 200+ upper-case occurrences elsewhere, and `classifyFootnote` sees the
 * raw body before `usfm/footnotes.ts`'s own `capitalizeFootnoteOpening`
 * runs, so that spelling is exactly what reaches this function. Lower-casing
 * the whole {@link WITNESS_SIGLA} check would let the Gospel abbreviation
 * collide with a siglon again through a case-insensitive match, so this
 * narrow allowance only fires when the lower-case siglon is immediately
 * followed by a reading verb — a citation of that Gospel has a period and a
 * digit after it, never a verb, so it can never satisfy this.
 */
const LOWERCASE_SIGLON_READING = new RegExp(`\\b(?:lxx|dss|mt|tr|nu|rp|fh)\\s+${WITNESS_VERB_SOURCE}\\b`);

/** Nouns that always name a manuscript witness, whatever the sentence around them. */
const STRONG_WITNESS_NOUN = "(?:manuscripts?|MSS?|mss?|copies|scrolls?)\\b\\.?";

/**
 * Nouns that mean a manuscript witness only when a reading verb sits next
 * to it, however quantified. Both are apparatus jargon and ordinary
 * vocabulary at once, and the ordinary sense is far commoner: of 534 real
 * bodies using `witnesses`, only 163 sit near a reading verb — quoted
 * scripture about two witnesses prophesying is a quantifier and a witness
 * noun with nothing to do with manuscripts.
 *
 * `authorities` splits the same way against a different everyday sense: a
 * scholarly consensus favoring one reading of a debated referent, an
 * assumed measurement, a governing body. It used to sit in
 * {@link STRONG_WITNESS_NOUN} on the assumption it always meant
 * manuscripts; it does not, and moving it here keeps every real
 * manuscript-witness use intact, since those already pair it with a
 * reading verb.
 *
 * Used only by {@link WITNESS_CLAIM}, {@link WITNESS_CLAIM_REVERSE}, and
 * {@link SOME_WITNESS_OPENER}, never by {@link WITNESS_PHRASE}.
 */
const VERB_BOUND_WITNESS_NOUN = "(?:witnesses|authorities)\\b";
/** Witness nouns valid in a claim shape (near a reading verb) — the union of {@link STRONG_WITNESS_NOUN} and {@link VERB_BOUND_WITNESS_NOUN}, used by {@link WITNESS_CLAIM} and {@link WITNESS_CLAIM_REVERSE}. */
const CLAIM_WITNESS_NOUN = `(?:${STRONG_WITNESS_NOUN}|${VERB_BOUND_WITNESS_NOUN})`;

/**
 * Nouns that name a witness only when quantified (see {@link QUANTIFIER}) or
 * paired with a reading verb (see {@link WITNESS_CLAIM}). ASV1901's real
 * `"The Hebrew text has taken, taken."` is the body that forced this split:
 * unquantified, "text" is just as often background description as it is a
 * claim about a manuscript tradition, and that note is `stu`, not `var`.
 */
const WEAK_WITNESS_NOUN = "(?:texts?|versions?|traditions?|readings?|editions?)\\b";
/** Witness nouns valid once quantified — the union of {@link STRONG_WITNESS_NOUN} and {@link WEAK_WITNESS_NOUN}, used by {@link WITNESS_PHRASE}. */
const WITNESS_NOUN = `(?:${STRONG_WITNESS_NOUN}|${WEAK_WITNESS_NOUN})`;

/** Determiners that turn a witness noun into a claim about a body of manuscripts, rather than a bare mention of "the text" or "a manuscript." */
const QUANTIFIER =
  "(?:some|other|others|many|most|a few|few|one|two|three|several|certain|early|earliest|earlier|oldest|older|ancient|later|latter|various|numerous|best|another|alternate|alt)";

/** A quantifier followed, within two words, by a witness noun — `"some ancient authorities"`, `"other mss"`, `"two early manuscripts"`. This is what lets a weak noun like `"text"`/`"version"` count once it is quantified, without letting a bare, unquantified one count on its own. */
const WITNESS_PHRASE = new RegExp(`\\b${QUANTIFIER}(?:\\s+\\S+){0,2}\\s+${WITNESS_NOUN}`, "i");

/** A strong witness noun near a reading verb, either order — `"authorities insert"` (ASV1901's own "Many ancient authorities insert...", John 5:4) and its reverse, `"omitted by the best ancient authorities"` (ASV1901's Mark 9:44/9:46). Deliberately restricted to {@link STRONG_WITNESS_NOUN}: a weak noun near a verb is still not enough on its own (see {@link WEAK_WITNESS_NOUN}'s own doc comment). */
const WITNESS_CLAIM = new RegExp(`\\b${CLAIM_WITNESS_NOUN}[^.]{0,40}?\\b${WITNESS_VERB_SOURCE}\\b`, "i");
/**
 * The reverse word order of {@link WITNESS_CLAIM} — verb before noun, e.g.
 * `"omitted by the best ancient authorities"` (see that constant's own doc
 * comment). Given a wider gap than the forward direction's own 40:
 * ASV1901's own real "are omitted by some of the most ancient and other
 * important authorities" (Matthew 16:2) puts 49 characters between the
 * verb and the noun, an unusually long quantifier phrase but still one clause,
 * and this construct exists specifically to cover ASV1901's own reverse
 * "omitted by ..." phrasing.
 */
const WITNESS_CLAIM_REVERSE = new RegExp(`\\b${WITNESS_VERB_SOURCE}\\b[^.]{0,60}?\\b${CLAIM_WITNESS_NOUN}`, "i");

/** ASV1901's own real `"Another reading is, Ai."` phrasing — a witness claim with no named witness, no siglon, and no witness noun at all, just this fixed idiom. */
const ANOTHER_READING = /\banother reading\b/i;

/**
 * `"Some read, our"` — a witness claim with the witness noun left out, since
 * "some read" can only mean "some *manuscripts* read." KJV1769 writes 24 of
 * its variants this way, and CSB2017 and NLT2015 several hundred more.
 * `"Some emend to X"` is the identical elliptical shape with a different
 * verb — CSB2017's own real "Some emend to king" (2 Kings 6:33) and eight
 * more like it — so the same construct covers both.
 *
 * **Anchored to the body's own start on purpose.** As a whole note the
 * construct is the claim itself, but as a trailing clause under a
 * translation opener it only qualifies an alternative already offered, and
 * the two editions closest to this decision genuinely disagree about which
 * way to read that. Anchoring follows the calibration corpus, and leaves 4
 * bodies in the other edition as an accepted disagreement rather than
 * flipping the calibration corpus's own 2.
 */
const ELLIPTICAL_WITNESS_READING = /^\s*(?:some|many|others?|a few|several)\s+(?:reads?|emends?)\b/i;

/**
 * `"So some authorities."` — the terse `"So <witness>"` idiom this corpus
 * already uses for named witnesses, but with a
 * {@link VERB_BOUND_WITNESS_NOUN} instead of a proper name. Those nouns
 * normally need a nearby reading verb precisely because they are ordinary
 * vocabulary as often as apparatus jargon (see that constant's own doc
 * comment), and this opener has no verb at all — but anchored to the body's
 * own start, the same way {@link ELLIPTICAL_WITNESS_READING} is, `"So"` can
 * only be standing in for `"[This/that] reads"`, the same elliptical move
 * that construct already makes for a bare `"Some read"`.
 */
const SOME_WITNESS_OPENER = new RegExp(`^\\s*so\\s+(?:the\\s+)?(?:${QUANTIFIER}\\s+)?${VERB_BOUND_WITNESS_NOUN}`, "i");

/**
 * The symbolic operators a critical edition's apparatus uses in place of
 * prose. A Greek or Hebrew edition does not write "some manuscripts read";
 * it prints the two competing readings and an operator between them, so
 * none of the vocabulary rules above can see it at all.
 *
 * - `⇒` separates the edition's own reading from a competing one.
 * - A standalone `~` marks a verse the compared edition omits outright,
 *   used for exactly the eleven verses modern critical editions drop.
 * - `¦` separates one witness group's reading from the next, the notation
 *   the forthcoming edition uses throughout.
 *
 * Measured across every footnote in the corpus: `⇒` and `~` together cover
 * all 7,522 bodies of the edition that uses them, with no gaps; `¦` covers
 * 10,225 of another's 10,227 apparatus entries; and outside a Greek edition
 * exactly one body anywhere uses any of the three.
 *
 * **A leading Greek or Hebrew character is deliberately not a fourth
 * signal**, though one edition's own convention would suggest it. The worry
 * it would answer is that edition's 647 longer publisher notes, which argue
 * a variant in prose rather than printing it in notation — but 646 of them
 * carry `¦` anyway, and the two that do not open in English and on an
 * italicized `om.` respectively, not on a Greek or Hebrew character at all.
 * Those two are covered here instead by a quantified `editions` (see
 * {@link WEAK_WITNESS_NOUN}) and by {@link SIGLA_SYMBOLS}, both of which
 * read the note rather than guessing at the edition it came from. A
 * leading-character rule would meanwhile misread any translation gloss that
 * opens with the original-language word it is glossing.
 */
const APPARATUS_NOTATION = /[⇒¦]|(?:^|\s)~(?:\s|$)/;

/** Whether `body` is an apparatus entry in symbolic notation rather than prose — the other `var` signal, and the only one a Greek or Hebrew critical edition ever gives. */
function usesApparatusNotation(body: string): boolean {
  return APPARATUS_NOTATION.test(body);
}

/**
 * The abbreviated half of the vocabulary assembled just below, split out
 * from the spelled-out half ({@link SPELLED_OUT_LANGUAGE}, declared far
 * above next to the citation pattern that also needs it) because one rule
 * below has to treat the two halves differently. At least one of these
 * forms is also an ordinary book abbreviation, which is the whole reason
 * the split exists.
 */
const LANGUAGE_ABBREVIATION = "(?:Heb|Gr|Aram|Lat|Syr)";

/**
 * A language name, spelled out or abbreviated, for use only in the two
 * comparison-shaped constructs below — never matched bare, since a bare
 * mention of a language is at least as often background etymology as it is
 * a claim about a manuscript tradition.
 *
 * **The two-letter forms `Hb`/`Gk` deliberately stay out of this list**,
 * unlike {@link LANGUAGE_OPENER}, which carries both. Real bodies bury a
 * translation-difficulty caveat mid-body behind a semicolon — `‹reading›;
 * ‹language› obscure` — and adding `Hb` here let
 * {@link LANGUAGE_AFTER_SEMICOLON} misread that semicolon as the comparison
 * boundary the construct exists for, flipping four real `stu` bodies to
 * `var` on no genuine signal. `LANGUAGE_OPENER` only ever anchors to a
 * body's own *start*, where those forms unambiguously introduce a
 * translation marker; this list's own two uses read anywhere in the body,
 * where the same forms are too short and too common a shape to add without
 * a real corpus case demonstrating the need.
 */
const LANGUAGE = `(?:${SPELLED_OUT_LANGUAGE}|${LANGUAGE_ABBREVIATION})\\.?`;

/**
 * A language name carrying its own witness noun — `"Greek version"`, `"Heb
 * mss"`. This is strong enough to count as naming a witness outright
 * (folded into {@link namesAWitness} below, not the weaker
 * {@link comparesLanguageWitnesses}), because a language paired with
 * "version"/"manuscripts"/"mss"/"copies" is not naming the original-
 * language reading behind a translation, it is naming one side of a
 * textual comparison — the same role {@link WITNESS_NOUN} plays for named
 * and sigla-based witnesses. A body like `"As in Greek manuscripts; the
 * Hebrew omits this word."` is `var` because of this clause alone,
 * independent of the semicolon test below.
 */
const LANGUAGE_WITNESS = new RegExp(`\\b${LANGUAGE}\\s+(?:versions?|manuscripts?|mss?|copies)\\b`, "i");

/**
 * A language name following a semicolon — weaker evidence than
 * {@link LANGUAGE_WITNESS}, since nothing here confirms the language is
 * paired with a witness noun, only that it appears on the far side of a
 * clause break from whatever came first. The boundary it draws: **a
 * language name is a translation marker when it opens the note, and a
 * witness when it is one side of a comparison.** A body opening
 * `"Hebrew lacks this word"` is `trn`, naming the original-language reading
 * behind the English. `"As in Greek manuscripts; the Hebrew omits this
 * word."` puts the same language after a semicolon, weighing it against a
 * witness already named on the other side, and is `var`. Being the weaker
 * signal, it is consulted only after {@link offersATranslationAlternative}
 * has had its chance to claim the opener.
 *
 * **An abbreviated language name followed by a number is a cited book, not
 * a language.** This file's own header already names that collision as the
 * reason the citation-only test runs first; this rule runs after it and was
 * still exposed to it. A discursive study note that happens to close on a
 * semicolon-separated citation list has the shape this construct looks for
 * — a clause break, then something spelled like a language — purely because
 * one cited book abbreviates the way one language does. What separates them
 * is what follows: a language governs a reading, and a reading is not a
 * numeral. Matching the two halves of the vocabulary on those different
 * terms reaches **16 bodies across 4 versions**, every one a study note with
 * no textual claim in it, and loses no genuine variant. The restriction is
 * written inside the pattern rather than as a separate test on the whole
 * body, so a note carrying both a real language comparison and, elsewhere,
 * a cited book of that spelling keeps its variant reading.
 *
 * **A competing-witness requirement was measured and rejected — do not
 * re-add it.** The rationale above invites it: if a language is a witness
 * only when it is *one side* of a comparison, then requiring something on
 * the other side looks like the missing check. It is not. Requiring it
 * moves **74 bodies across 10 versions** out of `var`, and the largest
 * family among them is `‹citation›; ‹language› ‹reading›` — a note saying
 * the translation follows a parallel passage while the original-language
 * text reads otherwise. That is textual criticism and the competitor *is*
 * the cited passage, named by citation rather than by witness noun, so the
 * test cannot see it. The defect this construct really had is the
 * abbreviation collision above, not a missing competitor.
 */
const LANGUAGE_AFTER_SEMICOLON = new RegExp(
  `;\\s*(?:the\\s+)?(?:${SPELLED_OUT_LANGUAGE}|${LANGUAGE_ABBREVIATION}(?!\\.?\\s+\\d))\\.?\\b`,
  "i",
);

/** The weaker of the two language-comparison signals — see {@link LANGUAGE_AFTER_SEMICOLON}'s own doc comment for why it runs last, after {@link offersATranslationAlternative}. */
function comparesLanguageWitnesses(body: string): boolean {
  return LANGUAGE_AFTER_SEMICOLON.test(body);
}

/** Whether `body` names a manuscript witness or text-tradition — the `var` signal. Runs before {@link offersATranslationAlternative} so a witness note that also happens to say "reads" (`"LXX reads 'angels' instead of 'gods'"`) is not caught by the translation-alternative rule instead. */
function namesAWitness(body: string): boolean {
  return (
    NAMED_WITNESSES.test(body) ||
    LATIN_WITNESS_CLAIM.test(body) ||
    WITNESS_ABBREVIATIONS.test(body) ||
    SIGLA_SYMBOLS.test(body) ||
    WITNESS_SIGLA.test(body) ||
    LOWERCASE_SIGLON_READING.test(body) ||
    WITNESS_PHRASE.test(body) ||
    WITNESS_CLAIM.test(body) ||
    WITNESS_CLAIM_REVERSE.test(body) ||
    LANGUAGE_WITNESS.test(body) ||
    ANOTHER_READING.test(body) ||
    ELLIPTICAL_WITNESS_READING.test(body) ||
    SOME_WITNESS_OPENER.test(body)
  );
}

/**
 * The whole-body idiom asserting a verse's content was originally numbered
 * differently — `"Originally verse 20:29."`, always this exact shape. It is
 * overwhelmingly CLV1880's own versification apparatus (2,938 of the
 * corpus's 2,944 real bodies), but the identical wording also turns up
 * verbatim in a handful of GNB1992 (5, at 1 Chronicles 19:20, 2 Corinthians
 * 13:12–13, 3 John 1:15, and Revelation 12:18) and NLT1996 (1, the same
 * Revelation 12:18) footnotes — all long-recognized spots where editions'
 * own verse numbering genuinely diverges, not a coincidental phrase collision.
 * Since the construct is fixed wording rather than a generalized pattern
 * (see this file's own top-of-file doc comment), it fires wherever that
 * exact phrasing appears, without being scoped to one edition, and it is a
 * `var` signal on the same footing as a named witness: two editions
 * disagreeing about which verse a clause belongs to are disagreeing about
 * the text's own division the same way two manuscripts disagree about its
 * wording, not offering background commentary about it. Kept as its own
 * named check rather than folded into {@link namesAWitness} — despite
 * running right alongside it in {@link classifyFootnote}'s own ordering —
 * because this construct never names a manuscript or text-tradition at
 * all, and folding it in would misdescribe what that function tests.
 */
const VERSIFICATION_VARIANT = /^\s*originally verse\s+\d+:\d+\.?\s*$/i;

/**
 * The same versification claim worded from the other direction: a whole body
 * that is nothing but a language name and a verse number — `‹language› verse
 * ‹n›` — asserts that the original-language text divides the verses
 * differently from the translation, which is a disagreement about the text's
 * own division and not commentary about it. Grouped with
 * {@link VERSIFICATION_VARIANT} rather than left to the translation rules,
 * which would otherwise claim it on the opening language name alone.
 *
 * **The whole-body anchor is the entire safety of this rule.** Every other
 * wording-shaped construct in this file is backed by hundreds or thousands
 * of real bodies; **only 2 bodies corpus-wide take this shape**, which is
 * thin evidence and is recorded as such. What justifies it on that little is
 * that the shape is a *construct* rather than a memorized phrase, and that
 * anchoring to the whole body leaves it nowhere else to reach: the same
 * words with so much as one word of prose around them are a remark about a
 * verse, which this must not touch. Widen the anchor and the rule stops
 * being safe.
 */
const LANGUAGE_VERSIFICATION = new RegExp(
  `^\\s*(?:the\\s+)?${LANGUAGE}\\s+(?:verse|chapter)\\s+\\d+(?::\\d+)?\\.?\\s*$`,
  "i",
);

/** Whether `body` is one of the two whole-body versification idioms — see {@link VERSIFICATION_VARIANT} and {@link LANGUAGE_VERSIFICATION} for what each one claims. */
function isVersificationVariant(body: string): boolean {
  return VERSIFICATION_VARIANT.test(body) || LANGUAGE_VERSIFICATION.test(body);
}

/**
 * Every spelling of an original-language name a real edition opens with,
 * written as a stem with optional tails rather than a list, because the
 * abbreviations vary by edition and by printing. One edition alone spells
 * one of these languages seven ways across 136 real bodies — including a
 * spelling with a letter dropped — and abbreviates another three ways; each
 * stem covers its whole family, the malformed spellings included. The
 * two-letter forms sit alongside their longer stems for the same reason: an
 * edition may use only the short one.
 */
const LANGUAGE_OPENER = "or|lit(?:erally)?|heb(?:r(?:ew)?)?|hb|gr(?:eek)?|gk|aram(?:aic)?|ch?al(?:d(?:ee?)?)?";

/**
 * `He.`, KJV1769's shortest abbreviation for Hebrew (2 Samuel 21:16's `"He.
 * the staff, or the head"`). Held apart from {@link LANGUAGE_OPENER} because
 * two letters is short enough to be an ordinary word, so this one must
 * carry its own period or comma — a note opening `"He said..."` is prose,
 * not a Hebrew gloss.
 */
const SHORT_LANGUAGE_OPENER = "he";

/**
 * An *anchored* opener naming a live English alternative or the original-
 * language reading behind the current one, in any of the real punctuation
 * variants an edition prints (see {@link LANGUAGE_OPENER} for the
 * vocabulary). Anchoring to the body's own start, rather than matching
 * these words anywhere, is what keeps a bare in-sentence mention of a
 * language from claiming `trn` on its own — a note observing what a Greek
 * word denotes is `stu`, and would not be if this matched anywhere. (What
 * keeps a translation opener followed by a place name off `xrf` is
 * {@link REFERENCE}'s own one-book-word cap, not this anchoring: `xrf` is
 * settled before this rule ever runs.) This single construct covers one
 * edition's 2,146 language-marker notes, another's 216 literal-rendering
 * notes, and a third's 4,500 `Or,` notes — one shape, re-derived per
 * edition only in which punctuation variant each happens to prefer.
 */
const TRANSLATION_OPENER = new RegExp(
  `^\\s*["'“(]?\\s*(?:(?:${LANGUAGE_OPENER})\\b[.,:;]*|(?:${SHORT_LANGUAGE_OPENER})[.,])(?:[\\s“"']|$)`,
  "i",
);

/**
 * Sentence-shaped translation-alternative constructs, unanchored (unlike
 * {@link TRANSLATION_OPENER}) because each one names its own
 * live-alternative verb explicitly enough that it cannot be mistaken for
 * background etymology wherever in the body it falls. The generic
 * `word(s) rendered`/`word(s) translated` shape is what makes an edition's
 * recurring divine-title boilerplate fall out on its own, with no
 * title-specific literal needed.
 */
const TRANSLATION_CONSTRUCTS = [
  /\b(?:can|could|may)\s+(?:also\s+)?(?:be\s+)?(?:also\s+)?(?:more\s+)?(?:correctly|literally|accurately)?\s*(?:be\s+)?(?:translated|rendered)\b/i,
  /\bsometimes (?:translated|rendered)\b/i,
  /\bwords?\s+(?:rendered|translated)\b/i,
  /\b(?:also|alternately|alternatively)\s+(?:translated|rendered|means?)\b/i,
] as const;

/**
 * Whether `body` offers a live English alternative reading, or names the
 * original-language reading behind the current one — the `trn` signal.
 * Deliberately narrower than "any note that mentions a language": a note
 * that only *names* an original-language term as background, with no verb
 * saying it was *rendered* or *translated* that way, offers no live
 * alternative and stays `stu`. A name-etymology note reporting what a name
 * means is the recurring shape that distinction keeps out.
 */
function offersATranslationAlternative(body: string): boolean {
  return TRANSLATION_OPENER.test(body) || TRANSLATION_CONSTRUCTS.some((pattern) => pattern.test(body));
}

/**
 * A note reporting that the original-language wording is hard to render —
 * `meaning of the ‹language›[ ‹noun›] is uncertain`. It offers no
 * alternative and names no competing witness, which makes it a remark about
 * *translating* the text rather than about what the text is. 287 bodies
 * corpus-wide carry it.
 *
 * **This is the table's second deliberate piece of memorized wording**,
 * alongside {@link VERSIFICATION_VARIANT}: `meaning of the` and
 * `is uncertain` are fixed literals and only the language and the optional
 * noun vary — a fixed predicate over an open subject, not a grammatical
 * shape.
 *
 * **It is consulted last, after every stronger signal, and that ordering is
 * the whole of the rule's safety** — the same weaker-after-stronger
 * principle {@link LANGUAGE_AFTER_SEMICOLON}'s own doc comment states. 39 of
 * the 287 name a manuscript witness as well, and a note claiming the meaning
 * is uncertain *while* naming a witness is textual criticism, not a
 * translation remark; ahead of the witness checks this rule would take all
 * 39.
 *
 * **Last means after {@link comparesLanguageWitnesses} too, not merely after
 * the witness checks.** Folding this into
 * {@link offersATranslationAlternative} as a tidy-up would seat it one step
 * ahead of the language-comparison check. Nothing would move today, since no
 * matching body reaches that check at all — but **7 of the 287 already
 * satisfy {@link LANGUAGE_AFTER_SEMICOLON}**, held at `var` by a witness
 * noun standing beside the language name and by nothing else. Drop that one
 * noun and the body lands on the language-comparison check, on the
 * `‹citation›; ‹language› ‹reading›` family that check exists for.
 *
 * **Not anchored to the whole body**, unlike {@link LANGUAGE_VERSIFICATION}
 * just above, and the difference is in what the words mean rather than in
 * how much an anchor would reach: `‹language› verse ‹n›` inside a longer
 * body is a remark about a verse and means something else entirely, where
 * this caveat means the same thing wherever it sits. An anchor would also
 * miss the 19 of the 155 bodies this rule decides that carry anything besides
 * the caveat — among them every body that prompted the rule.
 *
 * **The language slot is these three names only**, declared inline rather
 * than reusing {@link SPELLED_OUT_LANGUAGE}, which carries five and would
 * silently widen the rule past what it was measured at. The noun slot is any
 * one word and optional: the nouns that occur run well past the three
 * commonest, and a bare `meaning of the ‹language› is uncertain` with no noun
 * at all is a real shape a noun-bearing pattern would miss. Widening the
 * *language* slot to any single word is the like-for-like loosening, measured
 * and rejected: 20 more bodies, 8 of them moving, one a name-etymology note
 * of exactly the shape {@link offersATranslationAlternative}'s own doc
 * comment already keeps out.
 */
const UNCERTAIN_MEANING_CAVEAT = /meaning of the (?:Hebrew|Greek|Aramaic)(?:\s+\w+)?\s+is uncertain/i;

/** The weakest of the `trn` signals — see {@link UNCERTAIN_MEANING_CAVEAT}'s own doc comment for why it is consulted last, after every other check including {@link comparesLanguageWitnesses}. */
function reportsAnUncertainMeaning(body: string): boolean {
  return UNCERTAIN_MEANING_CAVEAT.test(body);
}

/**
 * Flattens any already-built `Content` value down to its own plain visible
 * text, ignoring every formatting property — exactly the input
 * {@link classifyFootnote} needs, and also `usfm/verify.ts`'s own
 * character-reconciliation question ("what characters does this footnote
 * body actually show"), deliberately blind to how those characters got
 * distributed across nodes. Shared here so both call sites that re-derive a
 * classifier body from already-built JSON use one implementation;
 * `usfm/footnotes.ts` (the importer) needs no version of it, since it builds
 * its own classify-input text directly from the raw `\ft`/`\fq`/`\fqa`
 * tokens, never from an already-built `Content` tree.
 *
 * **A bare `{bibleLink}` node with no display override flattens to the
 * reference itself**, which `types/Content.ts`'s own doc comment on
 * `ContentBibleLink.content` states directly. Without this, every real
 * `xrf`-type footnote without a display override — most of this corpus's
 * cross-reference footnotes — flattens to an empty string and silently
 * misclassifies as `stu`. It stayed latent until this function had a second
 * caller, since the character-reconciliation check that was its only caller
 * before excludes `xrf`-type footnotes from the comparison that calls it.
 */
export function flattenContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(flattenContentText).join("");
  if (content !== null && typeof content === "object") {
    const node = content as {
      text?: unknown;
      content?: unknown;
      bibleLink?: unknown;
    };
    if (typeof node.text === "string") return node.text;
    if ("content" in node) return flattenContentText(node.content);
    if (typeof node.bibleLink === "string") return node.bibleLink;
  }
  return "";
}

/**
 * Classifies one already-extracted footnote body into the ordered
 * `xrf` → `var` → `trn` → `stu` types.
 *
 * **`map` is never returned.** No source label reaching this function ever
 * carries an unambiguous map-reference signal comparable to the other three
 * types' own constructs, so producing `map` here would stretch a guess into
 * existence rather than read one off the body. This function's own return
 * type (excluding `map`) makes that a compile-time guarantee, not just a
 * runtime habit.
 *
 * @param body - The footnote's own concatenated `\ft`/`\fq`/`\fqa` text
 *   (`\fr`'s reference label already dropped, per the already-established
 *   repo convention — see `usfm/footnotes.ts`'s own doc comment).
 */
export function classifyFootnote(body: string): ClassifiableFootnoteType {
  if (isNothingButReferences(body)) return "xrf";
  if (usesApparatusNotation(body)) return "var";
  if (namesAWitness(body)) return "var";
  if (isVersificationVariant(body)) return "var";
  if (offersATranslationAlternative(body)) return "trn";
  if (comparesLanguageWitnesses(body)) return "var";
  if (reportsAnUncertainMeaning(body)) return "trn";
  return "stu";
}
