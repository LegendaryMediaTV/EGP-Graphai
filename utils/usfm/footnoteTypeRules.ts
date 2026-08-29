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
 * one deliberate exception (see {@link VERSIFICATION_VARIANT}'s own doc
 * comment). An earlier version of this file worked from literal phrase
 * lists lifted out of one edition's own footnotes (down to a source-side
 * typo, `"authorites insert"`), which meant every new edition run through
 * it needed its own pass of new literals. The rules below instead ask what
 * shape a footnote body has — is it nothing but citations, is it an
 * apparatus entry in symbolic notation, does it name a manuscript witness,
 * does it assert a different verse division, does it open with a
 * translation marker, does it weigh one language's reading against another
 * — so the same rules hold across editions without being re-derived from
 * each one's house style.
 *
 * **Order is load-bearing**, and each rule's own doc comment below explains
 * why it sits where it does. `xrf` runs first because it is a whole-body
 * test that a mixed note can never satisfy, so it is safe to try before
 * anything else, and it must resolve a body like `"Heb. 6:10"` (the
 * epistle) before any translation-opener rule gets a chance to misread
 * `Heb.` as Hebrew. Symbolic apparatus notation runs next (see
 * {@link APPARATUS_NOTATION}), then `var`'s named-witness checks ahead of
 * `trn` (see {@link namesAWitness}), then the versification-variant check
 * (see {@link VERSIFICATION_VARIANT}) — grouped with `namesAWitness`
 * as the same `var` signal, ordered after it only because nothing in either
 * rule's own body-shape could ever collide with the other, so their
 * relative order carries no weight — then `trn` itself, then the weaker
 * language-comparison `var` signal last (see
 * {@link LANGUAGE_AFTER_SEMICOLON}).
 */

import Footnote from "../../types/Footnote";

/** The four types this classifier can ever produce — `map` is never assigned (see {@link classifyFootnote}). */
export type ClassifiableFootnoteType = Exclude<NonNullable<Footnote["type"]>, "map">;

/**
 * WEB's own three self-documented Greek-text-tradition sigla (front matter,
 * "What are MT, TR, and NU?"), exported (not just the regex built from it
 * below) so `usfm/footnotes.ts`'s own footnote-initial capitalization fix
 * can anchor the identical vocabulary to a body's own *leading* word
 * instead of re-deriving a second copy of "which abbreviations count as a
 * witness siglon." That fix recapitalizes the *whole* abbreviation (Acts
 * 4:27's real "nu adds..." casing slip becomes "NU adds...", not "Nu
 * adds..."), a different shape of use than this module's own broader,
 * unanchored, anywhere-in-the-body {@link WITNESS_SIGLA} match below, so the
 * two call sites share the vocabulary, not the compiled pattern. Kept at
 * three names rather than widened to match `WITNESS_SIGLA`'s own seven,
 * since the capitalization fix has no reason to touch a body that doesn't
 * open with one of WEB's own documented three.
 */
export const WITNESS_SIGLA_NAMES = "TR|NU|MT";

/**
 * One reference-shaped run — a citation, not a claim about the text. The
 * book name or abbreviation is optional and, when present, at most **one**
 * word: `Ps.`, `1Sm`, `II Chron`, but never two words in a row. That cap is
 * what keeps a real body like `"Or, Jeshimon. See 23:19."` from being read
 * as a citation on "Jeshimon" — with two book words allowed, the pattern
 * would swallow "Jeshimon. See" into the reference itself and leave nothing
 * behind to prove the body is more than a citation (see
 * {@link isNothingButReferences}). Everything else here exists to cover the
 * real shapes citations actually take across editions: a numeral or Roman
 * prefix (`1`, `2`, `II`), `:verse`, `:title`, or `, title`, a sub-verse
 * letter (`:verse`), an `f.`/`ff.` continuation marker, a `-`/`–`/`—`
 * range, a comma-separated list of further verses, a trailing tradition
 * siglon (`Deuteronomy 32:43 LXX`, Hebrews 1:6's real `\x`-sourced
 * target), and, as a whole separate alternative rather than a variation on
 * this shape, a one-chapter book cited by name alone with no digit at all
 * (see {@link BARE_SINGLE_CHAPTER_BOOK}).
 */
/** A single sub-verse letter (`23:29–30a`, `23:30b–34`) — real CSB2017 shapes that split one verse into lettered parts for cross-referencing. Applies only where a verse number can appear, never the bare leading chapter number, since a chapter is never lettered this way. */
const VERSE_LETTER = "[a-c]?";
/**
 * AMP1987's own three-word abbreviation for Song of Solomon (`"S of Sol
 * 8:12"`, `"S. of Sol. 5:1"`), the one deliberate exception to the
 * book-prefix group's own one-word cap below. Safe as its own alternative
 * rather than a general widening of that cap, because this exact three-
 * token shape (`S`, `of`, `Sol`, each independently too short or too
 * generic to risk on its own) is specific enough that it cannot reproduce
 * the "Or, Jeshimon. See 23:19." collision the one-word cap exists to
 * prevent — a body would need this precise phrase, not just any two
 * capitalized words in a row, to match here at all.
 */
const SONG_OF_SOLOMON_PREFIX = "S\\.?\\s+of\\s+Sol\\.?\\s?";
/**
 * Obadiah cited bare, with no chapter or verse at all, the one real AMP1987
 * shape a citation can take without a single digit anywhere in it: Ezekiel
 * 25:14's own `"Isa 34; Ezek 35; Amos 1:11, 12; Obad"` closes a
 * semicolon-separated list by naming the whole one-chapter book rather than
 * a verse inside it, since Obadiah has only the one chapter to point to.
 * Scoped to this single book rather than every one-chapter book in the
 * canon (Philemon, 2 John, 3 John, Jude), because this is the only bare
 * book-name citation anywhere in the corpus — every other Obadiah, Jude,
 * and Philemon citation found here carries its own chapter:verse or bare
 * verse number, so there is no second real shape yet to generalize from.
 */
const BARE_SINGLE_CHAPTER_BOOK = "\\bObad\\b";
const REFERENCE = new RegExp(
  [
    "(?:",
    "(?:(?:[1-4]|I{1,3}|IV)\\s?)?", // 1 / 2 / II numeral prefix
    `(?:${SONG_OF_SOLOMON_PREFIX}|[A-Z][A-Za-z]{1,11}\\.?\\s?)?`, // one book name or abbreviation, never two, except Song of Solomon's own three-token form
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
 * an otherwise citation-only body into prose. `"See marginal note on 3:9."`
 * is the real shape this exists for: without treating "See", "marginal",
 * "note", and "on" as connective residue, deleting the citation `3:9`
 * leaves `"Seemarginalnoteon"` behind and the body wrongly falls through to
 * `stu`. `"See verse 12."` and `"See 2:13 margin."` are the same shape with
 * the lead-in on the other side of the reference.
 *
 * `title`/`titles` covers a different real shape from the same corpus:
 * CSB2017's own Psalm-heading cross-references write the collective
 * descriptor once at the end of a whole citation list rather than attaching
 * it to each number — `"Ps 60 title"`, `"Pss 45; 60; 69 titles"`. Neither
 * form is a single `REFERENCE` match on its own (there is no `:`/`,` tying
 * "title" to a specific number the way `REFERENCE`'s own `:title`/`,
 * title` tail expects), so without treating it as connective residue the
 * whole list falls through to `stu` on the leftover word alone.
 */
const CONNECTIVES =
  /\b(?:see|compare|cf|also|and|or|marginal|notes?|on|margin|verses?|ver|vv|titles?|chapters?|chs?|cp|ff|f|parallel|following|above|below|version|greek|hebrew|aramaic|latin|gk|heb|for)\b/gi;

/**
 * An anchored "Fulfilled in ..."/"Foretold in ..." lead-in — AMP1987's own
 * real construct citing where a prophecy or type was fulfilled or first
 * foretold (`"Fulfilled in II Chron 29:8"`, `"Foretold in Isa 21:2, 5,
 * 9"`), always exactly one of these two verbs at the body's own start
 * across 19 real "Fulfilled in" AMP1987 bodies (one more like it in
 * NKJV1982) and 4 real "Foretold in" ones. A scan of every AMP1987 body
 * opening `Word in ...` at all turns up only these two verbs and one
 * unrelated "Never in the history of the world..."; nothing else in this
 * corpus shares the construct. Stripped as its own anchored prefix rather
 * than folded into {@link CONNECTIVES}, because "in" alone is far too common
 * a word to remove as filler wherever it appears in a body — that would
 * strip real prose too, not just this lead-in — so this only ever touches
 * the body's own opening, immediately before the nothing-but-citations
 * check in {@link isNothingButReferences} runs. The 81 other real AMP1987
 * bodies that merely mention "fulfilled" somewhere (`"This prophecy was
 * literally fulfilled..."`) never open this way, so anchoring costs
 * nothing in coverage and keeps that ordinary discursive commentary `stu`.
 */
const FULFILLMENT_OPENER = /^\s*(?:fulfilled|foretold)\s+in\s+/i;

/**
 * The whole-body `xrf` test: a body is nothing-but-citations only if at
 * least one real citation matches, and deleting every citation plus every
 * connective plus punctuation leaves nothing behind. Requiring a real
 * citation match up front is what keeps `"Or, and"` — connectives with no
 * digit anywhere — from reading as a citation-only body just because "or"
 * and "and" are both in {@link CONNECTIVES}; with no reference to strip, the
 * residue check never even runs.
 *
 * A reference immediately followed by a trailing tradition siglon is still
 * "nothing but a reference": Hebrews 1:6's real `\x`-sourced target,
 * "Deuteronomy 32:43 LXX", would otherwise leave the trailing " LXX" behind
 * as residue and fall through to {@link namesAWitness}, misreading a
 * citation naming which tradition it quotes as a note contesting the
 * verse's own wording.
 *
 * {@link FULFILLMENT_OPENER} is stripped first so a body like "Fulfilled in
 * II Chron 29:8" is judged on its own citation content, `"II Chron 29:8"`,
 * the same way a bare citation list already is.
 */
function isNothingButReferences(body: string): boolean {
  if (!body.trim()) return false;
  const stripped = body.replace(FULFILLMENT_OPENER, "");
  const references = stripped.match(REFERENCE);
  if (!references) return false; // connectives alone are not a citation
  const residue = stripped
    .replace(REFERENCE, " ")
    .replace(CONNECTIVES, " ")
    .replace(/[;,.:\s()[\]–—-]/g, "");
  return residue.length === 0;
}

/**
 * Witness/text-tradition names spelled out in full, matched case-insensitively
 * anywhere in the body.
 *
 * **`Aquila`, the ancient Greek translator, is deliberately absent**,
 * though he is a genuine named witness in his own right. `Aquila` is also
 * an ordinary New Testament person's name, Priscilla's husband, appearing
 * as a character across Acts, Romans, 1 Corinthians, and 2 Timothy —
 * AMP1987's own real Acts 18:18 note, "...while others think Aquila is
 * meant," is settling which of two people made a vow, nothing to do with
 * translation history, and a bare match here would misread it as a
 * witness citation. Checked across every real corpus body naming the
 * translator (ASV1901, ESV2025, NET2019, NIV1984, NKJV1982): every one of
 * them names at least one other witness from this same list in the same
 * body, so this table still classifies every genuine case correctly
 * without `Aquila` carrying any of that weight on its own.
 */
const NAMED_WITNESSES =
  /\b(?:Septuagint|Vulgate|Syriac|Peshitta|Targum|Mas?soretic|Samaritan|Dead Sea Scrolls?|Symmachus|Theodotion|Alexandrinus|Vaticanus|Sinaiticus|Vatican|Aethiopic|Coptic|Armenian|Old Latin|Byzantine|Majority Text)\b/;

/**
 * `"the Latin"`/`"the Latin version(s)"`, matched only as the subject or
 * object of an actual reading-claim, never bare. Unlike this table's other
 * named witnesses, "Latin" is also an ordinary adjective for the language
 * itself, and this corpus's own real bodies use "(the) Latin" constantly
 * that way: word-origin notes (`"comes from the Latin word for 'skull'"`,
 * NLT1996/NLT2015/ASV1901/NET2019's several `calvaria`/Calvary notes;
 * `"the Latin term levir"`, `"the Latin term girgillus"`), a title's or a
 * loanword's own etymology (`"the Latin for the phrase"` naming the
 * Magnificat, `"the Latin loanword Niger"`, `"the Latin form of the name
 * 'Joshua'"`), an office's Latin equivalent (`"standard translation for
 * the Latin tribunus militum"`, four real NET2019 bodies), and even a
 * whole book's own patristic-citation history (YLT1898's James
 * introduction, "none of the Latin fathers before A.D. 300 quote it").
 * None of these is a claim about a reading at all, and a bare match on
 * "the Latin" wrongly read every one of them as a witness citation before
 * this fix. WEBUS2020's own 2 Esdras apparatus, by contrast, carries
 * dozens of real bodies built entirely around bare "The Latin has/omits/is
 * corrupt ..." as the note's whole content (2 Esdras exists only in
 * translation, so its own critical apparatus has no original-language
 * witness to name), and NET2019 pairs "the Latin version(s)" with a
 * reading verb the same way. Anchoring to a real claim-shaped predicate,
 * the same construct {@link WITNESS_CLAIM} already uses for a witness noun,
 * keeps the 2 Esdras/NET2019 cases `var` without reopening the false
 * positives above. Proverbs 16:16's own real "the Greek version...took it
 * as a participle, and the Latin as an imperative" elides its own verb
 * for the second clause, so this construct alone does not see a claim
 * there either — but that body still resolves `var` on the strength of
 * its own later, independent "the ancient versions also translate"
 * clause (see {@link WITNESS_PHRASE}), so nothing is actually lost.
 */
/**
 * Verbs safe to require directly after "the Latin"/"the Latin version(s)"
 * — tight enough that this is always the note's own predicate about what
 * the Latin reads. `has`/`have` belong here, not in
 * {@link LATIN_WITNESS_VERB_REVERSE}: real NET2019 Acts and John bodies
 * both open with an unrelated "may well have ..." clause well before "the
 * Latin" ever appears, and a wide reverse scan for so common an auxiliary
 * verb caught those two by accident, misreading ordinary sentence grammar
 * as a claim about what Latin says.
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
const LATIN_WITNESS_CLAIM = new RegExp(
  `\\bthe\\s+Latin(?:\\s+versions?)?\\b[^.]{0,15}?\\b${LATIN_WITNESS_VERB_FORWARD}\\b|\\b${LATIN_WITNESS_VERB_REVERSE}\\b[^.]{0,40}?\\bthe\\s+Latin\\b`,
  "i",
);

/**
 * The same witnesses in their abbreviated, period-terminated spellings
 * (e.g. `Tg.`, `Vss.`, `Sam.`). Kept as its own pattern rather than folded
 * into {@link NAMED_WITNESSES}'s alternation because a trailing `\b` can
 * never match after a period: `\.` and the space following it are both
 * non-word characters, so there is no boundary between them, and every
 * period-terminated alternative inside a `\b(?:...)\b` wrapper is silently
 * unreachable. Anchoring on the period itself is what makes these match at
 * all.
 *
 * **The trailing `(?![.\sa-z]*\d)` digit guard is not one shared concern —
 * it protects two unrelated collisions, only one of which touches `Syr`.**
 * `Sam` genuinely doubles as the book of (1/2) Samuel — ASV1901 cites it
 * constantly as `"1 Sam. 8:2"`, an ordinary citation nothing else in this
 * table would otherwise catch, so the guard blocks `Sam` whenever a
 * chapter:verse follows. `Vg`/`Tg`/`Vss` share the guard for the mirror
 * case of a witness abbreviation surfacing as one supporting citation deep
 * inside a much longer discursive note — real NET2019 word-study notes cite
 * `"Tg. 1 Kgs 10:22"` this way, and the note as a whole is `stu`, not `var`,
 * on the strength of one embedded reference.
 *
 * `Syr` has never needed this protection. Measured across all 508 real
 * bodies naming it corpus-wide, exactly 2 are followed by a digit within
 * the guard's own reach, and both are genuine `var` claims the guard was
 * wrongly silencing — real CSB2017 2 Chronicles 3:15's own `"Syr reads 18
 * cubits (27 feet); Hb reads 35 cubits"` is the shape that surfaced this:
 * with no other signal in the body, blocking `Syr` here left the whole
 * measurement dispute unclassified as anything but `stu`. `Syr` never
 * collides with a book name or a citation-heavy discursive genre the way
 * `Sam`/`Tg` do, so it's split out unguarded rather than folded back into
 * the shared group Sam's own fix was written for.
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
 * passage. The 2026 Byzantine edition's own note on 1 John 5:7-8 is the one
 * real case: strip the markdown and it reads `om. ℵ A B K L P Ψ 048 049 056
 * 0142 0296 33vid 1841 1862 2464`, where every other signal in this table
 * sees nothing. The uncial letters and Gregory-Aland numbers around it are
 * far too ordinary to match on; this symbol appears in a critical apparatus
 * and nowhere else.
 *
 * **The papyrus siglon `𝔓` is deliberately absent.** It appears in 25 of
 * that edition's entries and every one of them already carries `¦`, so it
 * would match nothing this table does not already catch. It is also a trap
 * to copy: `𝔓` is U+1D513, outside the BMP, and the 2026 source currently
 * holds U+D513 in all 52 places instead — a Hangul syllable that merely
 * looks similar, from a digit dropped somewhere upstream. A pattern built
 * by copying the character out of that source would silently never match.
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
 * unlike the already-present past-tense `emended`. CSB2017's own real
 * "Some emend to king" needs the present tense, but that shape is covered
 * more narrowly by {@link ELLIPTICAL_WITNESS_READING} instead — adding it
 * here too widens {@link WITNESS_CLAIM}'s own noun-then-verb reach and
 * catches it in unrelated bodies, e.g. real NET2019 Psalm 119:22's long
 * discursive word-study note, opening with an anchored `Heb` translation
 * marker and stored `trn`, which mentions "a Dead Sea scroll... emend the
 * form to" 400 characters in — a witness noun near "emend" only in the
 * most technical sense, not the note's own overall shape. Whether that
 * flip is actually wrong is a real judgment call this table's own
 * construct-not-wording philosophy shouldn't make unprompted; keeping the
 * present tense scoped to the one anchored, unambiguous construct it was
 * added for avoids forcing that call.
 */
const WITNESS_VERB_SOURCE =
  "(?:reads?|adds?|added|omits?|omitted|inserts?|inserted|lacks?|lacking|transposes?|transposed|emended|vary|varies|writes?|says?|has|have|do(?:es)? not have|reverses?|attested)";

/**
 * The one confirmed exception to {@link WITNESS_SIGLA}'s case-sensitivity:
 * Acts 4:27's real "nu adds..." is a genuine source-side casing slip
 * against 200+ upper-case occurrences elsewhere, and `classifyFootnote`
 * sees the raw body before `usfm/footnotes.ts`'s own
 * `capitalizeFootnoteOpening` runs, so the lower-case spelling is exactly
 * what reaches this function. Rather than lower-casing the whole
 * {@link WITNESS_SIGLA} check (which would let `Mt. 4:23` collide again,
 * this time via a case-insensitive match on "mt"), this narrow allowance
 * only fires when the lower-case siglon is immediately followed by a
 * reading verb (`nu adds`, `mt omits`) — `Mt. 4:23` has a period and a
 * digit after it, never a verb, so it can never satisfy this.
 */
const LOWERCASE_SIGLON_READING = new RegExp(`\\b(?:lxx|dss|mt|tr|nu|rp|fh)\\s+${WITNESS_VERB_SOURCE}\\b`);

/** Nouns that always name a manuscript witness, whatever the sentence around them. */
const STRONG_WITNESS_NOUN = "(?:manuscripts?|MSS?|mss?|copies|scrolls?)\\b\\.?";

/**
 * Nouns that mean a manuscript witness only when a reading verb sits next
 * to it, however quantified. `witnesses` is apparatus jargon and ordinary
 * scripture vocabulary at once, and the scripture sense is far commoner: of
 * 534 real bodies across the in-scope corpora that use the word, only 163
 * sit near a reading verb. KJV1769's `"Or, I will give unto my two
 * witnesses that they may prophesy"` is the shape this keeps out of `var`
 * — a quantifier and a witness noun, and nothing to do with manuscripts.
 *
 * `authorities` shares the exact same split personality, just against a
 * different everyday sense: real AMP1987/NET2019 bodies use it for
 * scholarly or governing authorities as often as for manuscript ones —
 * "the large majority of early authorities favored interpretation (1)"
 * (which side of a debated referent a scholarly consensus favors), "the
 * standard cubit... is assumed by most authorities to be about 18 inches"
 * (seven real NET2019 bodies converting an ancient unit, not naming a
 * witness at all), and "the decision of the Jewish authorities" (the
 * Sanhedrin, a governing body). Bare quantified "authorities" used to sit
 * in {@link STRONG_WITNESS_NOUN} on the assumption it always meant
 * manuscripts; it does not, and moving it here fixes all of the above
 * while keeping every real manuscript-witness use intact, since those
 * already pair it with a reading verb (`"many ancient authorities omit"`,
 * ASV1901's own real Matthew 5:22).
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
 * construct is the claim itself, but as a trailing clause under an `Or`
 * opener it only qualifies an alternative already offered, and the two
 * editions closest to this decision split on that: ASV1901 tags `"Or as
 * some read shake. See Ps. 69:23."` `trn` while KJV1769 tags `"Or, Zaccur,
 * as some read"` `var`. Anchoring follows ASV1901, the calibration corpus,
 * and leaves 4 real KJV1769 bodies as an accepted disagreement rather than
 * flipping ASV1901's own 2.
 */
const ELLIPTICAL_WITNESS_READING = /^\s*(?:some|many|others?|a few|several)\s+(?:reads?|emends?)\b/i;

/**
 * `"So some authorities."` — WEBUS2020's own real 1 Esdras 8:20 shape, the
 * terse `"So <witness>"` idiom this corpus already uses for named witnesses
 * (`"So the Septuagint..."`, `"So the Syriac..."`) but with a
 * {@link VERB_BOUND_WITNESS_NOUN} instead of a proper name. `witnesses`/
 * `authorities` normally need a nearby reading verb precisely because they
 * are ordinary vocabulary as often as apparatus jargon (see that constant's
 * own doc comment), and this opener has no verb at all — but anchored to
 * the body's own start, the same way {@link ELLIPTICAL_WITNESS_READING} is,
 * `"So"` here can only be standing in for `"[This/that] reads"`, the same
 * elliptical move that construct already makes for a bare `"Some read"`.
 */
const SOME_WITNESS_OPENER = new RegExp(`^\\s*so\\s+(?:the\\s+)?(?:${QUANTIFIER}\\s+)?${VERB_BOUND_WITNESS_NOUN}`, "i");

/**
 * The symbolic operators a critical edition's apparatus uses in place of
 * prose. A Greek or Hebrew edition does not write "some manuscripts read";
 * it prints the two competing readings and an operator between them, so
 * none of the vocabulary rules above can see it at all.
 *
 * - `⇒` separates the edition's own reading from a competing one
 *   (`"N Οἱ δὲ ⇒ -"`, BYZ2018's 2018 apparatus).
 * - A standalone `~` marks a verse the compared edition omits outright.
 *   BYZ2018 uses it for exactly the eleven verses modern critical editions
 *   drop, Matthew 17:21 through Romans 16:24.
 * - `¦` separates one witness group's reading from the next
 *   (`"δαυιδ ¦ HF TR δαβιδ ¦ TH WH δαυειδ"`), the notation the forthcoming
 *   2026 edition uses throughout.
 *
 * Measured across every footnote in the corpus: `⇒` and `~` together cover
 * all 7,522 of BYZ2018's bodies with no gaps, `¦` covers 10,225 of the 2026
 * edition's own 10,227 apparatus entries, and outside a Greek edition
 * exactly one body anywhere uses any of the three.
 *
 * **A leading Greek or Hebrew character is deliberately not a fourth
 * signal**, though the 2026 edition's own convention would suggest it, and
 * it would not help even where it seems most needed. That edition also
 * carries 647 longer publisher notes, written as the second of two
 * back-to-back footnotes on one word, and the worry is that those argue a
 * variant in prose rather than printing it in notation. Measured against
 * the real source, 646 of the 647 carry `¦` anyway. The two entries in the
 * whole edition that do not are Matthew 23:13-14's prose note on verse
 * renumbering and 1 John 5:7-8's bare witness list, and **neither one opens
 * with a Greek or Hebrew character** — the first opens in English, the
 * second on an italicized `om.`. Those two are covered here instead by a
 * quantified `editions` (see {@link WEAK_WITNESS_NOUN}) and by
 * {@link SIGLA_SYMBOLS}, both of which read the note rather than guessing at
 * the edition it came from. A leading-character rule would meanwhile
 * misread any translation gloss that opens with the original-language word
 * it is glossing.
 */
const APPARATUS_NOTATION = /[⇒¦]|(?:^|\s)~(?:\s|$)/;

/** Whether `body` is an apparatus entry in symbolic notation rather than prose — the other `var` signal, and the only one a Greek or Hebrew critical edition ever gives. */
function usesApparatusNotation(body: string): boolean {
  return APPARATUS_NOTATION.test(body);
}

/**
 * A language name, spelled out or abbreviated, for use only in the two
 * comparison-shaped constructs below — never matched bare, since a bare
 * mention of "Hebrew" or "Greek" is at least as often background etymology
 * (Genesis 25:26's "Isaac means 'he laughs'") as it is a claim about a
 * manuscript tradition.
 *
 * **`Hb`/`Gk` deliberately stay out of this list**, unlike
 * {@link LANGUAGE_OPENER}, which carries both. CSB2017 writes real bodies
 * like `"...for a goat-demon”; Hb obscure, also in vv. 10,26"` (Leviticus
 * 16:8) — a translation-difficulty caveat buried mid-body, not a
 * comparison between two named witnesses — and adding `Hb` here let
 * {@link LANGUAGE_AFTER_SEMICOLON} misread the semicolon before it as the
 * comparison boundary that construct exists for, flipping four real `stu`
 * bodies to `var` on no genuine signal. `LANGUAGE_OPENER` only ever
 * anchors to a body's own *start*, where "Hb"/"Gk" unambiguously introduce
 * a translation marker; this list's own two uses read anywhere in the
 * body, where the same two-letter forms are too short and too common a
 * shape to add without a real corpus case demonstrating the need.
 */
const LANGUAGE = "(?:Hebrew|Greek|Aramaic|Latin|Samaritan|Heb|Gr|Aram|Lat|Syr)\\.?";

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
 * clause break from whatever came first. This is the subtlest boundary in
 * the whole table: **a language name is a translation marker when it opens
 * the note, and a witness when it is one side of a comparison.** A body
 * opening with `"Hebrew lacks this word"` is `trn` — it is naming the
 * original-language reading behind the English translation. A body like
 * `"As in Greek manuscripts; the Hebrew omits this word."` puts "Hebrew"
 * after a semicolon, weighing it against "Greek manuscripts" already named
 * on the other side, and is `var`. Because this signal is weaker than
 * an opening translation marker, {@link classifyFootnote} only consults it
 * after {@link offersATranslationAlternative} has already had its chance to
 * claim the opener — see that function's own place in the ordering.
 */
const LANGUAGE_AFTER_SEMICOLON = new RegExp(`;\\s*(?:the\\s+)?${LANGUAGE}\\b`, "i");

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

/** Whether `body` is CLV1880's own versification-variant idiom — see {@link VERSIFICATION_VARIANT}'s own doc comment. */
function isVersificationVariant(body: string): boolean {
  return VERSIFICATION_VARIANT.test(body);
}

/**
 * Every spelling of an original-language name a real edition opens with,
 * written as a stem with optional tails rather than a list, because the
 * abbreviations vary by edition and by printing. KJV1769 alone spells
 * Chaldee seven ways across 136 real bodies (`Chald.`, `Chal.`, `Chalde,`,
 * `Chaldee,`, `Chald,`, `Chal,`, and `Cald.` with the h dropped), and
 * abbreviates Hebrew as `Heb.`, `Hebr.`, and `He.`. `ch?al(?:d(?:ee?)?)?`
 * covers the whole Chaldee family including the h-less variants; every
 * other stem works the same way. CSB2017 abbreviates Greek as `Gk`
 * specifically (never `Gr`) across dozens of real bodies (`"Gk lepros; a
 * term for various skin diseases"`, Matthew 8:2) — `gk` sits alongside
 * `gr(?:eek)?` for the identical reason `hb` already sits alongside
 * `heb(?:r(?:ew)?)?`.
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
 * language reading behind the current one: `Or`, `Lit`/`Lit.`/`Literally,`,
 * `Heb`/`Heb.`/`Hebrew`/`Hb`, `Gr`/`Gr.`/`Greek`, `Aram`/`Aramaic`, in any of
 * their real punctuation variants (a trailing period, comma, colon, or
 * semicolon, in any combination — `Lit.,`, `Hebrew:`, `Hebrew,`). Anchoring
 * to the body's own start, rather than matching these words anywhere, is
 * what keeps a bare in-sentence mention of "Hebrew" or "Greek" from
 * claiming `trn` on its own — ASV1901's `"The Greek word denotes an act of
 * reverence..."` is `stu`, and would not be if this matched anywhere.
 * (What keeps `"Or, Jeshimon. See 23:19."` off `xrf` is {@link REFERENCE}'s
 * own one-book-word cap, not this anchoring: `xrf` is settled before this
 * rule ever runs.) This single construct covers KJV's 2,146 `Heb.` notes,
 * YLT's 216 `Lit.,` notes, and ASV1901's 4,500 `Or,` notes — one shape,
 * re-derived per edition only in which punctuation variant each one
 * happens to prefer.
 */
const TRANSLATION_OPENER = new RegExp(
  `^\\s*["'“(]?\\s*(?:(?:${LANGUAGE_OPENER})\\b[.,:;]*|(?:${SHORT_LANGUAGE_OPENER})[.,])(?:[\\s“"']|$)`,
  "i",
);

/**
 * Sentence-shaped translation-alternative constructs, unanchored (unlike
 * {@link TRANSLATION_OPENER}) because each one names its own live-alternative
 * verb explicitly enough that it cannot be mistaken for background
 * etymology wherever in the body it falls: "can/could/may be translated",
 * "sometimes translated"/"sometimes rendered", "word(s) rendered/translated"
 * (WEB's own recurring "The Hebrew word rendered 'God' is 'Elohim'" and
 * "The word translated 'Lord' is 'Adonai'" both fall out of this one
 * generic construct, with no divine-title-specific literal needed), and
 * "also/alternately/alternatively translated/rendered/means".
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
 * Deliberately narrower than "any note that mentions Hebrew/Greek": a note
 * that only *names* an original-language term as background, with no verb
 * saying it was *rendered* or *translated* that way, offers no live
 * alternative (Genesis 25:26's "Isaac means 'he laughs'", Revelation 9:11's
 * "'Apollyon' means 'Destroyer'" are `stu`, not `trn` — neither one uses
 * "rendered"/"translated," or any of {@link TRANSLATION_OPENER}'s anchored
 * openers, they only report what a name means).
 */
function offersATranslationAlternative(body: string): boolean {
  return TRANSLATION_OPENER.test(body) || TRANSLATION_CONSTRUCTS.some((pattern) => pattern.test(body));
}

/**
 * Flattens any already-built `Content` value down to its own plain visible
 * text, ignoring every formatting property (`marks`, `script`, `strong`,
 * `paragraph`, `break`) — exactly the input {@link classifyFootnote} needs,
 * and also `usfm/verify.ts`'s own character-reconciliation question ("what
 * characters does this footnote body actually show"), deliberately blind to
 * how those characters got distributed across nodes. Shared here so both
 * call sites that re-derive a classifier body from already-built JSON — the
 * independent verifier and the version-agnostic `overhaulFootnotes.ts` CLI
 * — use one implementation; `usfm/footnotes.ts` (the importer) needs no
 * version of this, since it builds its own classify-input text directly
 * from the raw `\ft`/`\fq`/`\fqa` tokens, never from an already-built
 * `Content` tree.
 *
 * **A bare `{bibleLink}` node with no display override flattens to the
 * reference itself** — `types/Content.ts`'s own doc comment on
 * `ContentBibleLink.content` states this directly ("Optional display
 * override (defaults to the reference)"). Without this, every real
 * `xrf`-type footnote without a display override (2 Kings 12:4's
 * `{bibleLink: "Exodus 30:12"}`, most of this corpus's own cross-reference
 * footnotes) flattens to an empty string and silently misclassifies as
 * `stu` instead of `xrf` — latent until this function had a second caller,
 * since `usfm/verify.ts`'s own character-reconciliation check (its only
 * caller before) excludes `xrf`-type footnotes from the comparison that
 * calls it.
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
  return "stu";
}
