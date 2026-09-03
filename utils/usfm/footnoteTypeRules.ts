/**
 * The shared footnote-type classification table. Classifies an
 * already-extracted footnote body (the concatenated `\ft`/`\fq`/`\fqa` text,
 * `\fr`'s own reference label already dropped) into one of four ordered types —
 * `xrf` → `var` → `trn` → `stu` — never `map` (see {@link classifyFootnote}).
 *
 * Imported by both `usfm/footnotes.ts` (the importer) and `usfm/verify.ts` (the
 * independent verifier). Neither may import the other's parsing or segmentation
 * code, but both must agree on this one table. Its only input beyond the body it
 * is handed is `bible-books/bible-books.json`, read once at module load (see
 * {@link REGISTRY_BOOK_NAME}); classification itself stays a pure function of
 * the body's own text.
 *
 * This table classifies by construct, not by memorized wording, with two
 * deliberate exceptions ({@link VERSIFICATION_VARIANT} and
 * {@link UNCERTAIN_MEANING_CAVEAT}). An earlier version worked from literal
 * phrase lists lifted out of one edition's own footnotes — down to a
 * source-side typo, `"authorites insert"` — so every new edition needed its own
 * pass of new literals. Asking what *shape* a body has instead holds across
 * editions.
 *
 * Order is load-bearing. The one ordering decision not local to a single rule:
 * `xrf` runs first because it is a whole-body test a mixed note can never
 * satisfy, and because it must resolve a citation of the epistle whose
 * abbreviation is spelled like a language name before any translation-opener
 * rule reads that abbreviation as the language.
 */

import * as fs from "fs";
import * as path from "path";
import Footnote from "../../types/Footnote";

/** The four types this classifier can ever produce — `map` is never assigned (see {@link classifyFootnote}). */
export type ClassifiableFootnoteType = Exclude<NonNullable<Footnote["type"]>, "map">;

/**
 * The three self-documented Greek-text-tradition sigla, exported so
 * `usfm/footnotes.ts`'s footnote-initial capitalization fix shares this
 * vocabulary instead of keeping its own copy. That fix inspects only a body's
 * leading word, so the two call sites share the names rather than the compiled
 * pattern, and this list stays at three rather than {@link WITNESS_SIGLA}'s
 * seven.
 */
export const WITNESS_SIGLA_NAMES = "TR|NU|MT";

/** A single sub-verse letter (`23:29–30a`, `23:30b–34`), splitting one verse into lettered parts for cross-referencing. Applies only where a verse number can appear, never the bare leading chapter number — a chapter is never lettered this way. */
const VERSE_LETTER = "[a-c]?";
/**
 * The one three-word book abbreviation a real edition prints, and the one
 * deliberate exception to {@link REFERENCE}'s one-word book cap. Safe as its
 * own alternative rather than a widening of that cap: each of its three tokens
 * is independently too short or too generic to risk alone, so a body has to
 * carry this precise phrase to match at all.
 */
const SONG_OF_SOLOMON_PREFIX = "S\\.?\\s+of\\s+Sol\\.?\\s?";
/**
 * The one shape a citation can take without a single digit anywhere in it: a
 * one-chapter book named alone, `‹citation›; ‹bare book name›`, because a book
 * with only one chapter has no verse inside it to point at. It occurs in both
 * the abbreviated and the fully spelled-out form — matching only the
 * abbreviation, with a word boundary at its tail, silently rejected every
 * spelled-out occurrence — and covering both reaches 4 bodies across 3
 * versions, each a citation list and nothing else.
 *
 * Deliberately scoped to this one book rather than every one-chapter book in
 * the canon. A census of every footnote in every version, with the alternation
 * widened to the remaining one-chapter books in both their abbreviated and
 * two-word numbered forms, produced zero additional matches: every other
 * one-chapter citation carries its own number. The two-word forms would also
 * put two capitalized words in a row back inside a citation, which
 * {@link REFERENCE}'s one-word cap exists to prevent.
 */
const BARE_SINGLE_CHAPTER_BOOK = "\\bObad(?:iah)?\\b";
/**
 * The original-language names in their spelled-out form, as distinct from the
 * abbreviations carrying the same meaning ({@link LANGUAGE_ABBREVIATION}). A
 * spelled-out language name collides with no book name anywhere in the canon,
 * while several of the abbreviations *are* ordinary book abbreviations — the one
 * fact both the book slot below and {@link LANGUAGE_AFTER_SEMICOLON} turn on.
 *
 * The slot below must refuse these names outright. A language name introducing
 * an original-language reading is one capitalized word like any other, so
 * `‹language› ‹reading›` with a numeral for the reading matches whole as a
 * single citation and the note reads as nothing but cross-references. The
 * abbreviations are deliberately not refused: that would stop ordinary
 * citations matching at all.
 */
const SPELLED_OUT_LANGUAGE = "(?:Hebrew|Greek|Aramaic|Latin|Samaritan)";
/**
 * The sigla that name a printed edition or a manuscript tradition and nothing
 * else, so no citation can want one in the book slot below. The same concern
 * as {@link SPELLED_OUT_LANGUAGE}, one class of word further along: a siglum
 * standing before the reading it carries is one capitalized word, so
 * `‹siglum› ‹number›` matches whole as a citation and the note reads `xrf`
 * before any witness rule is consulted. MSB2025's Acts 27:37 exposed it —
 * `WH 76`, a variant reading of the number 276, read as chapter 76 of a book
 * called `WH`. Adding a siglum to {@link WITNESS_SIGLA} cannot reach that,
 * because the citation-only test runs first; the fix has to be in the citation
 * grammar.
 *
 * Measured over all 321,204 footnote bodies on disk: 4 carry a siglum before a
 * bare number and exactly one is typed `xrf`, so this bar moves one body.
 *
 * `MT`, `NU`, `NA`, `NE`, and `TH` are deliberately absent, though
 * {@link WITNESS_SIGLA} carries every one. Each also stands where a book
 * abbreviation would — `NE 4:6` for Nehemiah, `MT` against `Mt.` for Matthew —
 * so barring them would stop ordinary citations of those books matching at all.
 * The sigla named here collide with no book in the canon, so the bar costs
 * nothing.
 *
 * The slot a siglum does legitimately occupy is the *trailing* one, after a
 * citation that names its own book (`Deuteronomy 32:43 LXX`), and that is
 * untouched.
 */
const EDITION_ONLY_SIGLUM = "(?:LXX|DSS|TR|RP|FH|CT|GOC|F35|WH|ALT|ECM|SBL|Scrivener)";
/**
 * The word standing between a book name and a number to say the number is a
 * chapter rather than a verse — `‹book› ch ‹n›`, `‹book› chs ‹n›–‹m›`. An
 * edition reaches for it exactly where a citation has no verse to give: a whole
 * chapter, or a run of them.
 *
 * It has to live inside {@link REFERENCE} rather than be swept up as
 * connective residue, even though {@link CONNECTIVES} already deletes the bare
 * word. Deleting it there strands the book name: the citation pattern stops at
 * the book because no digit follows it, matches only the number further along,
 * and the name it never reached survives the residue strip as prose.
 *
 * Lowercase only. Capitalized, the same two letters open a versification note
 * about the host verse's own numbering rather than a citation of another
 * passage (see {@link VERSIFICATION_VARIANT}).
 */
const CHAPTER_WORD = "(?:chs?\\.?\\s)";
/**
 * The generic book slot: one capitalized ASCII word of two to twelve letters,
 * standing for any book name or abbreviation without needing to know which
 * books exist. Declared on its own because two rules ask the same question of
 * it — {@link REFERENCE} matches with it, and {@link REGISTRY_BOOK_NAME} uses
 * it to decide which registry spellings it already covers. Written twice, the
 * two would drift.
 */
const ONE_WORD_BOOK = "[A-Z][A-Za-z]{1,11}";
/** {@link ONE_WORD_BOOK} as a whole-string test, for {@link REGISTRY_BOOK_NAME}'s own filter. */
const ONE_WORD_BOOK_ONLY = new RegExp(`^${ONE_WORD_BOOK}$`);
/** Absolute path to the repo-wide book registry, read once by {@link registryBookNames}. */
const BIBLE_BOOKS_FILE = path.resolve(__dirname, "../../bible-books/bible-books.json");
/** The one `bible-books/bible-books.json` entry shape this module reads — the same two fields `usfm/references.ts` builds its own candidate list from. */
interface BibleBookRegistryEntry {
  /** The book's own canonical display name, e.g. `"Genesis"`. */
  readonly name: string;
  /** Alternate spellings a citation might name the book with instead. */
  readonly alt?: readonly string[];
}
/** Regex metacharacters, escaped so a registry spelling carrying one (`Esther (Greek)`) is matched literally. */
const REGEX_METACHARACTER = /[\\^$.*+?()[\]{}|]/g;

/**
 * Every book spelling in `bible-books/bible-books.json` that
 * {@link ONE_WORD_BOOK} cannot express, as one alternation, longest first.
 * Two shapes qualify: a name longer than twelve letters, and a name written
 * in more than one word.
 *
 * The registry is the answer, not a hand-kept list beside it. An edition that
 * spells its references out meets the one-word slot's cap immediately:
 * `Thessalonians` is thirteen letters, so every `1 Thessalonians 5:1–11` in a
 * citation list failed to match, the name survived the residue strip as prose,
 * and a cross-reference block typed `stu`. `Song of Solomon` failed the same way
 * on word count. Both are ordinary English spellings of canonical books, so any
 * edition writing them out hits the same wall.
 *
 * Requiring the whole spelling is what keeps this clear of the collision
 * {@link REFERENCE}'s one-word cap exists to prevent: these alternatives are not
 * a widening of that cap, since a body has to carry one of a closed set of exact
 * phrases. {@link SONG_OF_SOLOMON_PREFIX} stays alongside this list because the
 * registry carries no `S. of Sol.` spelling.
 *
 * Leading ordinals are stripped (`1 Thessalonians` enters as
 * `Thessalonians`), since {@link REFERENCE}'s numeral prefix already matches
 * them and already accepts the Roman-numeral spelling prose substitutes.
 */
const REGISTRY_BOOK_NAME = registryBookNames();

/** Reads {@link BIBLE_BOOKS_FILE} and builds {@link REGISTRY_BOOK_NAME}'s alternation — see that constant's own doc comment for what it selects and why. */
function registryBookNames(): string {
  const entries: BibleBookRegistryEntry[] = JSON.parse(fs.readFileSync(BIBLE_BOOKS_FILE, "utf8"));
  const spellings = new Set<string>();
  for (const entry of entries) {
    for (const spelling of [entry.name, ...(entry.alt ?? [])]) {
      const withoutOrdinal = spelling.replace(/^[1-4]\s?/, "");
      if (!ONE_WORD_BOOK_ONLY.test(withoutOrdinal)) spellings.add(withoutOrdinal);
    }
  }
  return [...spellings]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((spelling) => spelling.replace(REGEX_METACHARACTER, "\\$&"))
    .join("|");
}
/**
 * One reference-shaped run — a citation, not a claim about the text. The book
 * name or abbreviation is optional and, when present, at most one word, never
 * two in a row. That cap is what keeps a body shaped
 * `‹translation opener›, ‹place name›. See ‹citation›.` from being read as a
 * citation on the place name: with two book words allowed, the pattern would
 * swallow that name and the word after it into the reference, leaving nothing
 * behind to prove the body is more than a citation (see
 * {@link isNothingButReferences}).
 *
 * The cap governs the *generic* slot ({@link ONE_WORD_BOOK}) and nothing else.
 * A spelling the repo's own book registry recognizes is admitted whole, however
 * long or however many words ({@link REGISTRY_BOOK_NAME}), because a closed set
 * of exact phrases cannot swallow an arbitrary capitalized word the way a
 * general two-word slot would. The generic slot is also barred from a
 * spelled-out language name ({@link SPELLED_OUT_LANGUAGE}) and an edition's
 * siglum ({@link EDITION_ONLY_SIGLUM}). Two citation shapes sit outside the run
 * entirely: {@link BARE_SINGLE_CHAPTER_BOOK} and
 * {@link SONG_OF_SOLOMON_PREFIX}.
 *
 * A range of whole books — `Joshua–Malachi` — is deliberately not described
 * here. It names no chapter, so there is nothing for it to resolve to, and over
 * all 322,529 footnote bodies on disk exactly one is a whole-book range and
 * nothing else (`recon/measureBookRangeCitations.ts`). What the same scan turns
 * up in quantity is the collision a rule for it would walk into — `Luke-Acts`,
 * `Ezra-Nehemiah`, `Bar-Jonah`, two book names hyphenated as an ordinary
 * compound noun rather than a citation. One body is not a population, so the
 * construct is left as prose and reported by name.
 */
const REFERENCE = new RegExp(
  [
    "(?:",
    "(?:(?:[1-4]|I{1,3}|IV)\\s?)?", // 1 / 2 / II numeral prefix
    `(?:${SONG_OF_SOLOMON_PREFIX}|(?:${REGISTRY_BOOK_NAME})\\.?\\s?|(?!${SPELLED_OUT_LANGUAGE}\\b)(?!${EDITION_ONLY_SIGLUM}\\b)${ONE_WORD_BOOK}\\.?\\s?)?`, // a book named in full out of the registry, or one book word, never two, never a language name and never an edition's siglum, plus Song of Solomon's own three-token abbreviation
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
 * `title`/`titles` covers a different real shape: a heading cross-reference
 * writes the collective descriptor once at the end of a whole citation list
 * rather than attaching it to each number. With no `:`/`,` tying the word to a
 * specific number the way {@link REFERENCE}'s `:title`/`, title` tail expects,
 * no such list is a single match, so untreated the whole list falls through to
 * `stu` on that leftover alone.
 *
 * `mg` is the two-letter siglum for the same margin `marginal`/`margin` already
 * cover, appended to a citation to say the reading is the one printed in that
 * edition's margin. It claims nothing about this verse's wording, only about
 * where the cited reading is found.
 *
 * Language names are deliberately not in this list, though they were once.
 * Everything here is deleted wherever it matches, and a language name is filler
 * in only one position — see {@link PARENTHETICAL_LANGUAGE_TAG}.
 */
const CONNECTIVES =
  /\b(?:see|compare|cf|also|and|or|marginal|notes?|on|margin|mg|verses?|ver|vv|titles?|chapters?|chs?|cp|ff|f|parallel|following|above|below|version|for)\b/gi;

/**
 * An anchored "Fulfilled in ..."/"Foretold in ..."/"Cited in ..." lead-in —
 * the construct naming where a verse is quoted, or where a prophecy or type
 * was fulfilled or first foretold, always exactly one of these three verbs
 * at the body's own start. Stripped as its own anchored prefix rather than
 * folded into {@link CONNECTIVES}, because "in" alone is far too common a word
 * to remove as filler wherever it appears. The 81 other bodies that merely
 * mention "fulfilled" somewhere never open this way, so anchoring costs nothing
 * in coverage and keeps that discursive commentary `stu`.
 *
 * `fulfilled`/`foretold` cover 24 bodies corpus-wide. `cited` covers 184 more,
 * all the MSB's own lead-in for the same construct, reaching no body in any
 * other version on disk — one edition's spelling of a shape the other two
 * verbs already describe, not a new one.
 */
const FULFILLMENT_OPENER = /^\s*(?:fulfilled|foretold|cited)\s+in\s+/i;

/**
 * A private-use placeholder standing where a citation was deleted, so the
 * residue strip in {@link isNothingButReferences} can tell "a citation sat
 * here" apart from ordinary whitespace. Nothing in a real body can contain it,
 * and {@link RESIDUE_FILLER} clears it at the end of the same pass, so it never
 * escapes that pipeline.
 */
const CITATION_MARKER = "\uE000";

/**
 * A `with` joining two citations, `‹citation› with ‹citation›`, optionally
 * reached through the comma or semicolon that closed the first one. Between
 * two citations the word is connective tissue and nothing more.
 *
 * Requiring a citation on *both* sides is the whole rule. Carried as an
 * unconditional connective instead — one more word in {@link CONNECTIVES} — it
 * would also delete itself out of the one shape where the word is not filler at
 * all: a translation note offering that very word as its alternative reading,
 * `‹translation opener› with‹punctuation› ‹citation›`, which then has nothing
 * left but a citation. 3 real bodies take that shape, every one with an opener
 * rather than a citation on its left, so the flanking test separates them
 * cleanly: 7 bodies become citation-only, and nothing else changes type.
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
 * Parenthesization is the whole distinction. The obvious remedy — deleting a
 * language name wherever it appears, by carrying the names in
 * {@link CONNECTIVES} as this table once did — moves 177 bodies corpus-wide and
 * regresses 174 of them, since the common real shape is the parenthesized tag
 * above, which then loses its citation-only reading. Restricting the deletion to
 * parentheses moves 3 and regresses none. Outside parentheses a language name
 * governs what follows it, and `‹language› ‹reading›` is the strongest
 * translation-or-variant signal this table has.
 *
 * Stripped before the citations are, so a tag carrying a citation of its own
 * leaves nothing behind either way. Its vocabulary is wider than
 * {@link LANGUAGE}'s, taking in the two-letter abbreviations that constant
 * omits: inside parentheses a short form has nothing to collide with.
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
 */
function isNothingButReferences(body: string): boolean {
  if (!body.trim()) return false;
  const stripped = body.replace(FULFILLMENT_OPENER, "");
  const references = stripped.match(REFERENCE);
  if (!references) return false; // connectives alone are not a citation
  const residue = stripped
    .replace(PARENTHETICAL_LANGUAGE_TAG, " ")
    .replace(REFERENCE, CITATION_MARKER)
    .replace(INTER_CITATION_WITH, CITATION_MARKER)
    .replace(CONNECTIVES, " ")
    .replace(RESIDUE_FILLER, "");
  return residue.length === 0;
}

/**
 * Witness/text-tradition names spelled out in full, matched case-insensitively
 * anywhere in the body.
 *
 * `Aquila`, the ancient Greek translator, is deliberately absent, though he is a
 * genuine named witness. The name is also an ordinary New Testament person's,
 * and a note settling which of two people is meant has nothing to do with
 * translation history — a bare match would misread it as a witness citation.
 * Every corpus body naming the translator names at least one other witness from
 * this list in the same body, so no genuine case loses its classification.
 */
const NAMED_WITNESSES =
  /\b(?:Septuagint|Vulgate|Syriac|Peshitta|Targum|Mas?soretic|Samaritan|Dead Sea Scrolls?|Symmachus|Theodotion|Alexandrinus|Vaticanus|Sinaiticus|Vatican|Aethiopic|Coptic|Armenian|Old Latin|Byzantine|Majority Text)\b/;

/**
 * Verbs safe to require directly after "the Latin"/"the Latin version(s)" —
 * tight enough that this is always the note's own predicate about what the
 * Latin reads. `has`/`have` belong here, not in
 * {@link LATIN_WITNESS_VERB_REVERSE}: real bodies open with an unrelated "may
 * well have ..." clause well before "the Latin" appears, and a wide reverse
 * scan for so common an auxiliary caught those by accident.
 */
const LATIN_WITNESS_VERB_FORWARD =
  "(?:has|have|omits?|reads?|adds?|expands?|assumes?|assumed|is\\s+(?:corrupt|defective|incorrect|imperfect))";
/**
 * Verbs safe to require directly before "the Latin", in the reverse word order
 * a real body sometimes takes (`"is not supported by ... the Latin"`, `"The
 * translation follows the Latin and Greek versions"`). Narrower than
 * {@link LATIN_WITNESS_VERB_FORWARD}: none is a common auxiliary, so scanning a
 * wider gap ahead of them carries none of that construct's risk.
 */
const LATIN_WITNESS_VERB_REVERSE = "(?:reflects?|reflected|follows|supports?|supported)";
/**
 * `"the Latin"`/`"the Latin version(s)"`, matched only as the subject or object
 * of an actual reading-claim, never bare. Unlike this table's other named
 * witnesses, "Latin" is also the ordinary adjective for the language itself,
 * and real bodies use it that way constantly — word etymologies, a title's
 * origin, an office's Latin equivalent, a book's patristic-citation history.
 * None of those is a claim about a reading, and a bare match read every one as a
 * witness citation.
 *
 * The genuine cases are real too: one apparatus in this corpus is built almost
 * entirely around a bare `"The Latin has/omits/is corrupt ..."` as the note's
 * whole content, its book surviving only in translation and so having no
 * original-language witness to name. Anchoring to a claim-shaped predicate, as
 * {@link WITNESS_CLAIM} does for a witness noun, keeps those without reopening
 * the false positives above.
 */
const LATIN_WITNESS_CLAIM = new RegExp(
  `\\bthe\\s+Latin(?:\\s+versions?)?\\b[^.]{0,15}?\\b${LATIN_WITNESS_VERB_FORWARD}\\b|\\b${LATIN_WITNESS_VERB_REVERSE}\\b[^.]{0,40}?\\bthe\\s+Latin\\b`,
  "i",
);

/**
 * The same witnesses in their abbreviated, period-terminated spellings. Kept as
 * its own pattern rather than folded into {@link NAMED_WITNESSES}'s alternation
 * because a trailing `\b` can never match after a period: `\.` and the space
 * following it are both non-word characters, so there is no boundary between
 * them, and every period-terminated alternative inside a `\b(?:...)\b` wrapper
 * is silently unreachable. Anchoring on the period itself is what makes these
 * match at all.
 *
 * The trailing `(?![.\sa-z]*\d)` digit guard protects two unrelated collisions,
 * only one of which touches `Syr`. `Sam` doubles as a book of the canon, cited
 * constantly inside ordinary prose notes nothing else here would catch, so the
 * guard blocks it whenever a chapter:verse follows. `Vg`/`Tg`/`Vss` share it for
 * the mirror case: a witness abbreviation surfacing as one supporting citation
 * deep inside a longer discursive note, which is `stu` on the strength of that
 * embedded reference, not `var`.
 *
 * `Syr` has never needed the guard. Of all 508 real bodies naming it, exactly 2
 * are followed by a digit within the guard's reach, and both are genuine `var`
 * claims it was wrongly silencing. `Syr` collides with no book name and with no
 * citation-heavy discursive genre the way `Sam`/`Tg` do, so it is split out
 * unguarded.
 */
const WITNESS_ABBREVIATIONS =
  /\bSyr(?![a-z])|\b(?:Vg|Tg|Vss)(?![a-z])(?![.\sa-z]*\d)|\b(?:Kt|Qr|M\.T)\.|^Sam[.,]?\s(?![.\sa-z]*\d)/;

/**
 * `ℵ` (U+2135), the siglon for Codex Sinaiticus. Kept out of
 * {@link NAMED_WITNESSES}'s alternation for the same reason
 * {@link WITNESS_ABBREVIATIONS} is, one step further along — it is not a word
 * character, so a `\b` on either side of it can never match.
 *
 * It earns its place on a bare witness list with no prose around it at all, the
 * shape a critical edition uses when it simply names who omits a passage — one
 * body in the corpus is that shape, and every other signal in this table sees
 * nothing there. The uncial letters and Gregory-Aland numbers alongside it are
 * far too ordinary to match on; this symbol appears in a critical apparatus and
 * nowhere else.
 *
 * The papyrus siglon `𝔓` is deliberately absent. It appears in 25 of that
 * edition's entries and every one already carries `¦`, so it would match
 * nothing this table does not already catch. It is also a trap to copy: `𝔓` is
 * U+1D513, outside the BMP, and the source holds U+D513 in all 52 places
 * instead — a Hangul syllable that merely looks similar, from a digit dropped
 * upstream. A pattern built by copying the character out of that source would
 * silently never match.
 */
const SIGLA_SYMBOLS = /ℵ/u;

/**
 * The short-form tradition sigla, matched case-sensitively on purpose. A
 * case-insensitive version of this exact pattern produced the largest share of
 * this classifier's old disagreements with ASV1901: under `/i`, `MT` also
 * matches every citation of Matthew abbreviated `Mt.` (`Mt. 4:23`), reading the
 * Gospel as a claim about the Masoretic Text. Case-sensitivity costs nothing,
 * since every real siglon in scope is written upper-case.
 *
 * The eleven printed-edition sigla below the first alternative are the MSB's own
 * apparatus, an edition citing modern critical editions by name where the older
 * list here knew only manuscript traditions. 1,764 of its 6,644 bodies name one
 * with no already-known siglum beside it, so leaving them off left every one of
 * those in `stu`.
 *
 * Two of them collide, and both guards were measured over every footnote in
 * every version on disk (314,596 bodies) as well as the MSB's own. Neither guard
 * costs the MSB a single body.
 *
 * `NA`, `NE`, and `TH` name editions another apparatus cites *with its own
 * printing number* — NET2019 writes `NA²⁸` 145 times, in notes about where that
 * edition sets a verse division or brackets a word, which are remarks about an
 * edition rather than claims about this verse's text. The same two letters also
 * stand where a book abbreviation would (`NE 4:6` for Nehemiah). One guard
 * covers both: a siglum naming an edition names the edition, never a numbered
 * printing of it and never a chapter and verse.
 *
 * `SBL` abbreviates both the SBL Greek New Testament and the society that
 * publishes *SBL Seminar Papers*, and 5 real NET2019 notes cite that journal in
 * a bibliography. An edition's siglum stands alone or immediately before the
 * reading it carries, while a publication's name continues into the rest of its
 * title, so a following two-word Title Case phrase is the guard. It admits every
 * MSB shape, including a siglum before a proper-noun reading (`SBL Semein;`),
 * because a reading is one capitalized word and a title is more than one.
 *
 * `HF` is deliberately absent, though the MSB prints it 30 times: every one
 * names another siglum in the same body, so it would classify nothing this
 * pattern does not already reach. It is also the reverse of the `FH` this list
 * already carries for the same Hodges–Farstad edition; which of the two orders
 * is intended is an open question about that older entry.
 */
const WITNESS_SIGLA = new RegExp(
  [
    "\\b(?:LXX|DSS|MT|TR|NU|RP|FH)\\b", // manuscript traditions and printed editions the list already knew
    "\\b(?:CT|GOC|F35|WH|ALT|ECM|Scrivener)\\b", // printed editions with no measured collision anywhere in the corpus
    // …and not a numbered printing of one, nor a book abbreviation before a
    // chapter. Superscript and subscript digits join the ASCII ones because a
    // printing number is set as a superscript.
    "\\b(?:NA|NE|TH)\\b(?![\\s.]*[\\d\\u00B2\\u00B3\\u00B9\\u2070-\\u209F])",
    "\\bSBL\\b(?!\\s+[A-Z][a-z]+\\s+[A-Z])", // …and not the first word of that society's own publication title
  ].join("|"),
);

/**
 * Reading-verb vocabulary shared by {@link LOWERCASE_SIGLON_READING},
 * {@link WITNESS_CLAIM}, and {@link WITNESS_CLAIM_REVERSE} — the verbs a
 * witness or manuscript can take when a note describes what it says.
 *
 * The present tense `emends?` deliberately stays out of this list, unlike the
 * past-tense `emended` already here. The one construct that needs it is
 * anchored and unambiguous, and {@link ELLIPTICAL_WITNESS_READING} covers it
 * there instead. Added here it widens {@link WITNESS_CLAIM}'s noun-then-verb
 * reach into unrelated bodies: a long discursive word-study note mentioning a
 * scroll emending a form 400 characters in is a witness noun near "emend" only
 * in the most technical sense.
 */
const WITNESS_VERB_SOURCE =
  "(?:reads?|adds?|added|omits?|omitted|inserts?|inserted|lacks?|lacking|transposes?|transposed|emended|vary|varies|writes?|says?|has|have|do(?:es)? not have|reverses?|attested)";

/**
 * The one confirmed exception to {@link WITNESS_SIGLA}'s case-sensitivity: one
 * body's lower-case siglon is a source-side casing slip against 200+ upper-case
 * occurrences elsewhere, and {@link classifyFootnote} sees the raw body before
 * `usfm/footnotes.ts`'s `capitalizeFootnoteOpening` runs, so that spelling is
 * what reaches this function. Lower-casing the whole {@link WITNESS_SIGLA} check
 * would reopen the Gospel-abbreviation collision, so this allowance fires only
 * when the lower-case siglon is immediately followed by a reading verb — a
 * citation of that Gospel has a period and a digit after it, never a verb.
 */
const LOWERCASE_SIGLON_READING = new RegExp(`\\b(?:lxx|dss|mt|tr|nu|rp|fh)\\s+${WITNESS_VERB_SOURCE}\\b`);

/** Nouns that always name a manuscript witness, whatever the sentence around them. */
const STRONG_WITNESS_NOUN = "(?:manuscripts?|MSS?|mss?|copies|scrolls?)\\b\\.?";

/**
 * Nouns that mean a manuscript witness only when a reading verb sits next to
 * them, however quantified. Both are apparatus jargon and ordinary vocabulary
 * at once, and the ordinary sense is far commoner: of 534 real bodies using
 * `witnesses`, only 163 sit near a reading verb — quoted scripture about two
 * witnesses prophesying is a quantifier and a witness noun with nothing to do
 * with manuscripts. `authorities` splits the same way against a scholarly
 * consensus, an assumed measurement, or a governing body; it used to sit in
 * {@link STRONG_WITNESS_NOUN} on the assumption it always meant manuscripts.
 *
 * Used only by {@link WITNESS_CLAIM}, {@link WITNESS_CLAIM_REVERSE}, and
 * {@link SOME_WITNESS_OPENER}, never by {@link WITNESS_PHRASE}.
 */
const VERB_BOUND_WITNESS_NOUN = "(?:witnesses|authorities)\\b";
/** Witness nouns valid in a claim shape (near a reading verb) — the union of {@link STRONG_WITNESS_NOUN} and {@link VERB_BOUND_WITNESS_NOUN}, used by {@link WITNESS_CLAIM} and {@link WITNESS_CLAIM_REVERSE}. */
const CLAIM_WITNESS_NOUN = `(?:${STRONG_WITNESS_NOUN}|${VERB_BOUND_WITNESS_NOUN})`;

/**
 * Nouns that name a witness only when quantified (see {@link QUANTIFIER}) or
 * paired with a reading verb (see {@link WITNESS_CLAIM}). ASV1901's real `"The
 * Hebrew text has taken, taken."` forced this split: unquantified, "text" is
 * just as often background description as a claim about a manuscript tradition,
 * and that note is `stu`.
 */
const WEAK_WITNESS_NOUN = "(?:texts?|versions?|traditions?|readings?|editions?)\\b";
/** Witness nouns valid once quantified — the union of {@link STRONG_WITNESS_NOUN} and {@link WEAK_WITNESS_NOUN}, used by {@link WITNESS_PHRASE}. */
const WITNESS_NOUN = `(?:${STRONG_WITNESS_NOUN}|${WEAK_WITNESS_NOUN})`;

/** Determiners that turn a witness noun into a claim about a body of manuscripts, rather than a bare mention of "the text" or "a manuscript." */
const QUANTIFIER =
  "(?:some|other|others|many|most|a few|few|one|two|three|several|certain|early|earliest|earlier|oldest|older|ancient|later|latter|various|numerous|best|another|alternate|alt)";

/** A quantifier followed, within two words, by a witness noun — `"some ancient authorities"`, `"other mss"`, `"two early manuscripts"`. This is what lets a weak noun like `"text"`/`"version"` count once it is quantified, without letting a bare, unquantified one count on its own. */
const WITNESS_PHRASE = new RegExp(`\\b${QUANTIFIER}(?:\\s+\\S+){0,2}\\s+${WITNESS_NOUN}`, "i");

/** A witness noun near a reading verb — `"authorities insert"` (ASV1901's "Many ancient authorities insert...", John 5:4). A {@link WEAK_WITNESS_NOUN} near a verb is deliberately not enough on its own. */
const WITNESS_CLAIM = new RegExp(`\\b${CLAIM_WITNESS_NOUN}[^.]{0,40}?\\b${WITNESS_VERB_SOURCE}\\b`, "i");
/**
 * The reverse word order of {@link WITNESS_CLAIM} — verb before noun,
 * `"omitted by the best ancient authorities"` (ASV1901's Mark 9:44/9:46). Given
 * a wider gap than the forward direction's 40 because ASV1901's real "are
 * omitted by some of the most ancient and other important authorities" (Matthew
 * 16:2) puts 49 characters between verb and noun — an unusually long quantifier
 * phrase, but still one clause.
 */
const WITNESS_CLAIM_REVERSE = new RegExp(`\\b${WITNESS_VERB_SOURCE}\\b[^.]{0,60}?\\b${CLAIM_WITNESS_NOUN}`, "i");

/** ASV1901's own real `"Another reading is, Ai."` phrasing — a witness claim with no named witness, no siglon, and no witness noun at all, just this fixed idiom. */
const ANOTHER_READING = /\banother reading\b/i;

/**
 * `"Some read, our"` — a witness claim with the witness noun left out, since
 * "some read" can only mean "some *manuscripts* read." KJV1769 writes 24 of its
 * variants this way, CSB2017 and NLT2015 several hundred more. `"Some emend to
 * X"` is the same elliptical shape with a different verb — CSB2017's real "Some
 * emend to king" (2 Kings 6:33) and eight more like it.
 *
 * Anchored to the body's own start on purpose. As a whole note the construct is
 * the claim itself; as a trailing clause under a translation opener it only
 * qualifies an alternative already offered, and the two editions closest to this
 * decision genuinely disagree about which way to read that. Anchoring follows
 * the calibration corpus, leaving 4 bodies in the other edition as an accepted
 * disagreement rather than flipping the calibration corpus's own 2.
 */
const ELLIPTICAL_WITNESS_READING = /^\s*(?:some|many|others?|a few|several)\s+(?:reads?|emends?)\b/i;

/**
 * `"So some authorities."` — the terse `"So <witness>"` idiom this corpus
 * already uses for named witnesses, but with a {@link VERB_BOUND_WITNESS_NOUN}
 * instead of a proper name. Those nouns normally need a nearby reading verb, and
 * this opener has none; anchored to the body's own start, as
 * {@link ELLIPTICAL_WITNESS_READING} is, `"So"` can only stand in for
 * `"[This/that] reads"`.
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
 * Measured across every footnote in the corpus: `⇒` and `~` together cover all
 * 7,522 bodies of the edition that uses them, with no gaps; `¦` covers 10,225
 * of another's 10,227 apparatus entries; and outside a Greek edition exactly one
 * body anywhere uses any of the three.
 *
 * A leading Greek or Hebrew character is deliberately not a fourth signal,
 * though one edition's own convention would suggest it. The worry it would
 * answer is that edition's 647 longer publisher notes, which argue a variant in
 * prose rather than printing it in notation — but 646 carry `¦` anyway, and the
 * two that do not open in English and on an italicized `om.` respectively.
 * Those two are covered instead by a quantified `editions`
 * ({@link WEAK_WITNESS_NOUN}) and by {@link SIGLA_SYMBOLS}, both of which read
 * the note rather than guessing at the edition it came from. A leading-character
 * rule would meanwhile misread any translation gloss opening with the
 * original-language word it glosses.
 */
const APPARATUS_NOTATION = /[⇒¦]|(?:^|\s)~(?:\s|$)/;

/** Whether `body` is an apparatus entry in symbolic notation rather than prose — the other `var` signal, and the only one a Greek or Hebrew critical edition ever gives. */
function usesApparatusNotation(body: string): boolean {
  return APPARATUS_NOTATION.test(body);
}

/**
 * The abbreviated half of the vocabulary assembled just below, split from the
 * spelled-out half ({@link SPELLED_OUT_LANGUAGE}) because at least one of these
 * forms is also an ordinary book abbreviation and
 * {@link LANGUAGE_AFTER_SEMICOLON} has to treat the two halves differently.
 */
const LANGUAGE_ABBREVIATION = "(?:Heb|Gr|Aram|Lat|Syr)";

/**
 * A language name, spelled out or abbreviated, for use only in the two
 * comparison-shaped constructs below — never matched bare, since a bare
 * mention of a language is at least as often background etymology as it is
 * a claim about a manuscript tradition.
 *
 * The two-letter forms `Hb`/`Gk` deliberately stay out of this list, unlike
 * {@link LANGUAGE_OPENER}, which carries both. Real bodies bury a
 * translation-difficulty caveat mid-body behind a semicolon — `‹reading›;
 * ‹language› obscure` — and adding `Hb` here let
 * {@link LANGUAGE_AFTER_SEMICOLON} misread that semicolon as the comparison
 * boundary, flipping four real `stu` bodies to `var`. `LANGUAGE_OPENER` anchors
 * only to a body's *start*, where those forms unambiguously introduce a
 * translation marker; this list's two uses read anywhere in the body.
 */
const LANGUAGE = `(?:${SPELLED_OUT_LANGUAGE}|${LANGUAGE_ABBREVIATION})\\.?`;

/**
 * A language name carrying its own witness noun — `"Greek version"`, `"Heb
 * mss"`. Strong enough to count as naming a witness outright (folded into
 * {@link namesAWitness}, not the weaker {@link comparesLanguageWitnesses}): a
 * language paired with "version"/"manuscripts"/"mss"/"copies" is not naming the
 * original-language reading behind a translation, it is naming one side of a
 * textual comparison. `"As in Greek manuscripts; the Hebrew omits this word."`
 * is `var` on this clause alone, independent of the semicolon test below.
 */
const LANGUAGE_WITNESS = new RegExp(`\\b${LANGUAGE}\\s+(?:versions?|manuscripts?|mss?|copies)\\b`, "i");

/**
 * A language name following a semicolon — weaker evidence than
 * {@link LANGUAGE_WITNESS}, since nothing here confirms the language is paired
 * with a witness noun, only that it sits on the far side of a clause break. The
 * boundary it draws: a language name is a translation marker when it opens the
 * note, and a witness when it is one side of a comparison. A body opening
 * `"Hebrew lacks this word"` is `trn`, naming the original-language reading
 * behind the English. `"As in Greek manuscripts; the Hebrew omits this word."`
 * puts the same language after a semicolon, weighing it against a witness
 * already named on the other side, and is `var`. Being the weaker signal, it is
 * consulted only after {@link offersATranslationAlternative} has had its chance
 * at the opener.
 *
 * An abbreviated language name followed by a number is a cited book, not a
 * language. A discursive study note closing on a semicolon-separated citation
 * list has exactly the shape this construct looks for — a clause break, then
 * something spelled like a language — purely because one cited book abbreviates
 * the way one language does. What separates them is what follows: a language
 * governs a reading, and a reading is not a numeral. Matching the two halves of
 * the vocabulary on those different terms reaches 16 bodies across 4 versions,
 * every one a study note with no textual claim, and loses no genuine variant.
 *
 * An abbreviated language name hyphenated into a longer word is part of that
 * word, since several of the abbreviations are the first syllable of a
 * transliterated place name. MSB2025 prints `That is, Mesopotamia;
 * Aram-naharaim means Aram of the two rivers…` at five verses, where `; Aram`
 * matched inside the place name and read as the Aramaic language weighed against
 * Mesopotamia. A language name governs the reading that follows it and is a
 * whole word, so refusing an abbreviation immediately followed by a hyphen and
 * more letters costs nothing; the reading's own internal hyphens (`; Heb
 * well-watered land`) are on the far side of the space. The spelled-out half
 * needs no such guard — it collides with no place name in the canon.
 *
 * Both restrictions are written inside the pattern rather than as separate
 * whole-body tests, so a note carrying a real language comparison *and*,
 * elsewhere, a cited book or hyphenated name of that spelling keeps its variant
 * reading.
 *
 * A competing-witness requirement was measured and rejected — do not re-add it.
 * The rationale above invites it: if a language is a witness only when it is one
 * side of a comparison, requiring something on the other side looks like the
 * missing check. Requiring it moves 74 bodies across 10 versions out of `var`,
 * the largest family being `‹citation›; ‹language› ‹reading›` — a note saying
 * the translation follows a parallel passage while the original-language text
 * reads otherwise. That is textual criticism, and the competitor *is* the cited
 * passage, named by citation rather than by witness noun, so the test cannot see
 * it.
 */
const LANGUAGE_AFTER_SEMICOLON = new RegExp(
  `;\\s*(?:the\\s+)?(?:${SPELLED_OUT_LANGUAGE}|${LANGUAGE_ABBREVIATION}(?!-[A-Za-z])(?!\\.?\\s+\\d))\\.?\\b`,
  "i",
);

/** The weaker of the two language-comparison signals — see {@link LANGUAGE_AFTER_SEMICOLON}'s own doc comment for why it runs last, after {@link offersATranslationAlternative}. */
function comparesLanguageWitnesses(body: string): boolean {
  return LANGUAGE_AFTER_SEMICOLON.test(body);
}

/** Whether `body` names a manuscript witness or text-tradition — the `var` signal. Runs before {@link offersATranslationAlternative} so a witness note that also says "reads" (`"LXX reads 'angels' instead of 'gods'"`) is not caught by the translation-alternative rule instead. */
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
 * overwhelmingly CLV1880's versification apparatus (2,938 of the corpus's 2,944
 * real bodies), but the identical wording turns up verbatim in 5 GNB1992
 * footnotes and 1 NLT1996 — all long-recognized spots where editions' verse
 * numbering genuinely diverges, not a coincidental phrase collision. It
 * therefore fires wherever the phrasing appears rather than being scoped to one
 * edition.
 *
 * A `var` signal on the same footing as a named witness: two editions
 * disagreeing about which verse a clause belongs to disagree about the text's
 * own division, the way two manuscripts disagree about its wording. Kept as its
 * own check rather than folded into {@link namesAWitness}, despite running
 * alongside it, because this construct names no manuscript or text-tradition and
 * folding it in would misdescribe what that function tests.
 */
const VERSIFICATION_VARIANT = /^\s*originally verse\s+\d+:\d+\.?\s*$/i;

/**
 * The same versification claim from the other direction: a whole body that is
 * nothing but a language name and a verse number — `‹language› verse ‹n›` —
 * asserts the original-language text divides the verses differently from the
 * translation. Grouped with {@link VERSIFICATION_VARIANT} rather than left to
 * the translation rules, which would claim it on the opening language name
 * alone.
 *
 * The whole-body anchor is the entire safety of this rule. Every other
 * wording-shaped construct here is backed by hundreds or thousands of real
 * bodies; only 2 corpus-wide take this shape. What justifies it on that little
 * is that the shape is a construct rather than a memorized phrase, and that the
 * anchor leaves it nowhere else to reach: the same words with one word of prose
 * around them are a remark about a verse, which this must not touch. Widen the
 * anchor and the rule stops being safe.
 */
const LANGUAGE_VERSIFICATION = new RegExp(
  `^\\s*(?:the\\s+)?${LANGUAGE}\\s+(?:verse|chapter)\\s+\\d+(?::\\d+)?\\.?\\s*$`,
  "i",
);

/** Whether `body` is one of the two whole-body versification idioms, {@link VERSIFICATION_VARIANT} or {@link LANGUAGE_VERSIFICATION}. */
function isVersificationVariant(body: string): boolean {
  return VERSIFICATION_VARIANT.test(body) || LANGUAGE_VERSIFICATION.test(body);
}

/**
 * Every spelling of an original-language name a real edition opens with, written
 * as a stem with optional tails rather than a list, because the abbreviations
 * vary by edition and by printing. One edition alone spells one of these
 * languages seven ways across 136 real bodies — including a spelling with a
 * letter dropped — and abbreviates another three ways; each stem covers its
 * whole family, malformed spellings included. The two-letter forms sit alongside
 * their longer stems because an edition may use only the short one.
 */
const LANGUAGE_OPENER = "or|lit(?:erally)?|heb(?:r(?:ew)?)?|hb|gr(?:eek)?|gk|aram(?:aic)?|ch?al(?:d(?:ee?)?)?";

/**
 * `He.`, KJV1769's shortest abbreviation for Hebrew (2 Samuel 21:16's `"He. the
 * staff, or the head"`). Held apart from {@link LANGUAGE_OPENER} because two
 * letters is short enough to be an ordinary word, so this one must carry its own
 * period or comma — a note opening `"He said..."` is prose, not a Hebrew gloss.
 */
const SHORT_LANGUAGE_OPENER = "he";

/**
 * An *anchored* opener naming a live English alternative or the
 * original-language reading behind the current one, in any of the real
 * punctuation variants an edition prints (vocabulary in
 * {@link LANGUAGE_OPENER}). Anchoring to the body's own start, rather than
 * matching these words anywhere, is what keeps a bare in-sentence mention of a
 * language from claiming `trn` — a note observing what a Greek word denotes is
 * `stu`. (What keeps a translation opener followed by a place name off `xrf` is
 * {@link REFERENCE}'s one-book-word cap, not this anchoring; `xrf` is settled
 * before this rule runs.) This one construct covers one edition's 2,146
 * language-marker notes, another's 216 literal-rendering notes, and a third's
 * 4,500 `Or,` notes.
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
  // `Forms of the <language> <term> ... are translated as <rendering>`, the
  // MSB's template for a recurring lexical decision. 34 bodies carry it; no
  // body in any other version on disk changes type.
  //
  // The rendering verb is the rule, not the opener. The same `Forms of the
  // Hebrew <term>` opening with no such verb says what the term covers and
  // offers nothing to put in its place — `Forms of the Hebrew cherem refer to
  // the giving over of things or persons to the LORD` — so those 36 stay `stu`.
  //
  // The one anchored member of this list, and for the opposite reason to the
  // others': `forms of` is ordinary English ("various forms of the Hebrew
  // script"), so only the body's own opening establishes that this is the
  // template. `[^.]` then holds the verb to the same sentence as the term,
  // since the MSB regularly puts the traditional rendering in a clause between
  // the two.
  /^\s*forms?\s+of\s+the\s+(?:Hebrew|Greek|Aramaic)\b[^.]*?\b(?:are|is|were|was)\s+(?:translated|rendered)\b/i,
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
 * This is the table's second deliberate piece of memorized wording, alongside
 * {@link VERSIFICATION_VARIANT}: `meaning of the` and `is uncertain` are fixed
 * literals and only the language and the optional noun vary — a fixed predicate
 * over an open subject, not a grammatical shape.
 *
 * It is consulted last, and that ordering is the whole of the rule's safety. 39
 * of the 287 name a manuscript witness as well, and a note claiming the meaning
 * is uncertain *while* naming a witness is textual criticism, not a translation
 * remark; ahead of the witness checks this rule would take all 39. Last means
 * after {@link comparesLanguageWitnesses} too, not merely after the witness
 * checks: 7 of the 287 already satisfy {@link LANGUAGE_AFTER_SEMICOLON}, held at
 * `var` by a witness noun standing beside the language name and by nothing else,
 * so folding this into {@link offersATranslationAlternative} as a tidy-up would
 * put it one step ahead of the check those bodies depend on.
 *
 * Not anchored to the whole body, unlike {@link LANGUAGE_VERSIFICATION}: the
 * difference is in what the words mean, not in how much an anchor would reach.
 * `‹language› verse ‹n›` inside a longer body is a remark about a verse and
 * means something else entirely, where this caveat means the same thing wherever
 * it sits. An anchor would also miss the 19 of the 155 bodies this rule decides
 * that carry anything besides the caveat — among them every body that prompted
 * the rule.
 *
 * The language slot is these three names only, declared inline rather than
 * reusing {@link SPELLED_OUT_LANGUAGE}, which carries five and would silently
 * widen the rule past what it was measured at. The noun slot is any one word and
 * optional: the nouns that occur run well past the three commonest, and a bare
 * `meaning of the ‹language› is uncertain` is a real shape a noun-bearing
 * pattern would miss. Widening the *language* slot to any single word is the
 * like-for-like loosening, measured and rejected: 20 more bodies, 8 of them
 * moving, one a name-etymology note.
 */
const UNCERTAIN_MEANING_CAVEAT = /meaning of the (?:Hebrew|Greek|Aramaic)(?:\s+\w+)?\s+is uncertain/i;

/** The weakest of the `trn` signals — see {@link UNCERTAIN_MEANING_CAVEAT} for why it is consulted last, after {@link comparesLanguageWitnesses} included. */
function reportsAnUncertainMeaning(body: string): boolean {
  return UNCERTAIN_MEANING_CAVEAT.test(body);
}

/**
 * Flattens any already-built `Content` value down to its plain visible text,
 * ignoring every formatting property — the input {@link classifyFootnote} needs,
 * and also `usfm/verify.ts`'s character-reconciliation question ("what
 * characters does this footnote body actually show"), deliberately blind to how
 * those characters got distributed across nodes. Shared so both call sites that
 * re-derive a classifier body from already-built JSON use one implementation.
 * `usfm/footnotes.ts` needs no version of it, building its classify-input text
 * directly from the raw `\ft`/`\fq`/`\fqa` tokens.
 *
 * A bare `{bibleLink}` node with no display override flattens to the reference
 * itself, as `types/Content.ts`'s doc comment on `ContentBibleLink.content`
 * states. Without this, every real `xrf`-type footnote without a display
 * override — most of this corpus's cross-reference footnotes — flattens to an
 * empty string and silently misclassifies as `stu`. It stayed latent until this
 * function had a second caller, since the character-reconciliation check that
 * was its only caller before excludes `xrf`-type footnotes from the comparison.
 *
 * An `{ abbr }` node flattens to its own registry id, matching what
 * `exportContent.ts` renders when no registry name resolves. This function
 * predates that node type, so without the case a registry-referencing corpus
 * reads as though every siglum its notes print were never printed — and
 * {@link WITNESS_SIGLA} is how a body naming a printed edition becomes `var`.
 * MSB2025's `overhaul-footnotes --hard-reset` proposes 2,419 reclassifications
 * without the case and 1 with it, and 170 of WEBUS2020's 423 are the same defect
 * already on disk. The id is close enough to the printed token for every witness
 * rule that matters, including the qualified `TR-SCRIVENER`, where `\bTR\b`
 * still matches because a hyphen is a word boundary.
 */
export function flattenContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(flattenContentText).join("");
  if (content !== null && typeof content === "object") {
    const node = content as {
      text?: unknown;
      content?: unknown;
      bibleLink?: unknown;
      abbr?: unknown;
    };
    if (typeof node.text === "string") return node.text;
    if ("content" in node) return flattenContentText(node.content);
    if (typeof node.bibleLink === "string") return node.bibleLink;
    if (typeof node.abbr === "string") return node.abbr;
  }
  return "";
}

/**
 * Classifies one already-extracted footnote body into the ordered
 * `xrf` → `var` → `trn` → `stu` types.
 *
 * `map` is never returned. No source label reaching this function carries an
 * unambiguous map-reference signal comparable to the other three types'
 * constructs, so producing `map` would stretch a guess into existence rather
 * than read one off the body. The return type excluding `map` makes that a
 * compile-time guarantee rather than a runtime habit.
 *
 * @param body - The footnote's concatenated `\ft`/`\fq`/`\fqa` text, with
 *   `\fr`'s reference label already dropped (see `usfm/footnotes.ts`).
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
