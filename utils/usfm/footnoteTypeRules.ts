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
 * **This table classifies by construct, not by memorized wording.** An
 * earlier version of this file worked from literal phrase lists lifted out
 * of one edition's own footnotes (down to a source-side typo,
 * `"authorites insert"`), which meant every new edition run through it
 * needed its own pass of new literals. The rules below instead ask what
 * shape a footnote body has — is it nothing but citations, is it an
 * apparatus entry in symbolic notation, does it name a manuscript witness,
 * does it open with a translation marker, does it weigh one language's
 * reading against another — so the same rules hold across editions without
 * being re-derived from each one's house style.
 *
 * **Order is load-bearing**, and each rule's own doc comment below explains
 * why it sits where it does. In short: `xrf` runs first because it is a
 * whole-body test that a mixed note can never satisfy, so it is safe to try
 * before anything else, and it must resolve a body like `"Heb. 6:10"` (the
 * epistle) before any translation-opener rule gets a chance to misread
 * `Heb.` as Hebrew. Symbolic apparatus notation is checked next, since a
 * Greek or Hebrew critical edition prints operators rather than prose and
 * no vocabulary rule can see it. `var` then runs before `trn` so a witness
 * note that happens to use the word "reads" is not caught by the
 * translation-alternative rule instead. The weaker language-comparison
 * signal for `var` runs last, after `trn` has already had its chance to
 * claim an opening language name as a translation marker instead.
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
 * prefix (`1`, `2`, `II`), `:verse`, `:title`, or `, title`, an `f.`/`ff.`
 * continuation marker, a `-`/`–`/`—` range, a comma-separated list of
 * further verses, and a trailing tradition siglon (`Deuteronomy 32:43 LXX`,
 * Hebrews 1:6's real `\x`-sourced target).
 */
const REFERENCE = new RegExp(
  [
    "(?:(?:[1-4]|I{1,3}|IV)\\s?)?", // 1 / 2 / II numeral prefix
    "(?:[A-Z][A-Za-z]{1,11}\\.?\\s?)?", // one book name or abbreviation, never two
    "\\d+", // chapter (or a bare verse continuing a previous citation)
    "(?::\\d+|:title|,\\s?title)?", // :verse, :title, ", title"
    "(?:\\s?f{1,2}\\.?)?", // 7f. / 7ff.
    "(?:[-–—]\\s?\\d+(?::\\d+)?(?:\\s?f{1,2}\\.?)?)?", // a-b range
    "(?:\\s?,\\s?\\d+(?::\\d+)?(?:\\s?f{1,2}\\.?)?)*", // , 11, 18
    "(?:\\s(?:LXX|MT|TR|NU))?", // trailing tradition siglon
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
 */
const CONNECTIVES =
  /\b(?:see|compare|cf|also|and|or|marginal|notes?|on|margin|verses?|ver|vv|chapters?|chs?|cp|ff|f|parallel|following|above|below|version|greek|hebrew|aramaic|latin|gk|heb|for)\b/gi;

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
 */
function isNothingButReferences(body: string): boolean {
  if (!body.trim()) return false;
  const references = body.match(REFERENCE);
  if (!references) return false; // connectives alone are not a citation
  const residue = body
    .replace(REFERENCE, " ")
    .replace(CONNECTIVES, " ")
    .replace(/[;,.:\s()[\]–—-]/g, "");
  return residue.length === 0;
}

/** Witness/text-tradition names spelled out in full, matched case-insensitively anywhere in the body. */
const NAMED_WITNESSES =
  /\b(?:Septuagint|Vulgate|Syriac|Peshitta|Targum|Mas?soretic|Samaritan|Dead Sea Scrolls?|Aquila|Symmachus|Theodotion|Alexandrinus|Vaticanus|Sinaiticus|Vatican|Aethiopic|Coptic|Armenian|Old Latin|the Latin|Byzantine|Majority Text)\b/;

/**
 * The same witnesses in their abbreviated, period-terminated spellings
 * (e.g. `Tg.`, `Vss.`, `Sam.`). Kept as its own pattern rather than folded
 * into {@link NAMED_WITNESSES}'s alternation because a trailing `\b` can
 * never match after a period: `\.` and the space following it are both
 * non-word characters, so there is no boundary between them, and every
 * period-terminated alternative inside a `\b(?:...)\b` wrapper is silently
 * unreachable. Anchoring on the period itself is what makes these match at
 * all.
 */
const WITNESS_ABBREVIATIONS = /\b(?:Vg|Syr|Tg|Sam|Vss)(?![a-z])(?![.\sa-z]*\d)|\b(?:Kt|Qr|M\.T)\./;

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

/** Reading-verb vocabulary shared by {@link LOWERCASE_SIGLON_READING}, {@link WITNESS_CLAIM}, and {@link WITNESS_CLAIM_REVERSE} — the verbs a witness or manuscript can take when a note describes what it says. */
const WITNESS_VERB_SOURCE =
  "(?:reads?|adds?|omits?|omitted|inserts?|inserted|lacks?|lacking|transposes?|transposed|emended|vary|varies|writes?|says?|has|have|do(?:es)? not have|reverses?)";

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
const STRONG_WITNESS_NOUN = "(?:manuscripts?|MSS?|mss?|authorities|copies|scrolls?)\\b\\.?";

/**
 * A noun that means a manuscript witness only when a reading verb sits next
 * to it, however it is quantified. `witnesses` is apparatus jargon and
 * ordinary scripture vocabulary at once, and the scripture sense is far
 * commoner: of 534 real bodies across the in-scope corpora that use the
 * word, only 163 sit near a reading verb. KJV1769's `"Or, I will give unto
 * my two witnesses that they may prophesy"` is the shape this keeps out of
 * `var` — a quantifier and a witness noun, and nothing to do with
 * manuscripts. Used only by {@link WITNESS_CLAIM}, never by
 * {@link WITNESS_PHRASE}.
 */
const VERB_BOUND_WITNESS_NOUN = "(?:witnesses)\\b";
const CLAIM_WITNESS_NOUN = `(?:${STRONG_WITNESS_NOUN}|${VERB_BOUND_WITNESS_NOUN})`;

/**
 * Nouns that name a witness only when quantified (see {@link QUANTIFIER}) or
 * paired with a reading verb (see {@link WITNESS_CLAIM}). ASV1901's real
 * `"The Hebrew text has taken, taken."` is the body that forced this split:
 * unquantified, "text" is just as often background description as it is a
 * claim about a manuscript tradition, and that note is `stu`, not `var`.
 */
const WEAK_WITNESS_NOUN = "(?:texts?|versions?|traditions?|readings?|editions?)\\b";
const WITNESS_NOUN = `(?:${STRONG_WITNESS_NOUN}|${WEAK_WITNESS_NOUN})`;

/** Determiners that turn a witness noun into a claim about a body of manuscripts, rather than a bare mention of "the text" or "a manuscript." */
const QUANTIFIER =
  "(?:some|other|others|many|most|a few|few|one|two|three|several|certain|early|earliest|earlier|oldest|older|ancient|later|latter|various|numerous|best|another|alternate|alt)";

/** A quantifier followed, within two words, by a witness noun — `"some ancient authorities"`, `"other mss"`, `"two early manuscripts"`. This is what lets a weak noun like `"text"`/`"version"` count once it is quantified, without letting a bare, unquantified one count on its own. */
const WITNESS_PHRASE = new RegExp(`\\b${QUANTIFIER}(?:\\s+\\S+){0,2}\\s+${WITNESS_NOUN}`, "i");

/** A strong witness noun near a reading verb, either order — `"authorities insert"` (ASV1901's own "Many ancient authorities insert...", John 5:4) and its reverse, `"omitted by the best ancient authorities"` (ASV1901's Mark 9:44/9:46). Deliberately restricted to {@link STRONG_WITNESS_NOUN}: a weak noun near a verb is still not enough on its own (see {@link WEAK_WITNESS_NOUN}'s own doc comment). */
const WITNESS_CLAIM = new RegExp(`\\b${CLAIM_WITNESS_NOUN}[^.]{0,40}?\\b${WITNESS_VERB_SOURCE}\\b`, "i");
const WITNESS_CLAIM_REVERSE = new RegExp(`\\b${WITNESS_VERB_SOURCE}\\b[^.]{0,40}?\\b${CLAIM_WITNESS_NOUN}`, "i");

/** ASV1901's own real `"Another reading is, Ai."` phrasing — a witness claim with no named witness, no siglon, and no witness noun at all, just this fixed idiom. */
const ANOTHER_READING = /\banother reading\b/i;

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
    WITNESS_ABBREVIATIONS.test(body) ||
    SIGLA_SYMBOLS.test(body) ||
    WITNESS_SIGLA.test(body) ||
    LOWERCASE_SIGLON_READING.test(body) ||
    WITNESS_PHRASE.test(body) ||
    WITNESS_CLAIM.test(body) ||
    WITNESS_CLAIM_REVERSE.test(body) ||
    LANGUAGE_WITNESS.test(body) ||
    ANOTHER_READING.test(body)
  );
}

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
const TRANSLATION_OPENER = /^\s*["'“(]?\s*(?:or|lit|literally|heb|hebrew|hb|gr|greek|aram|aramaic)\b[.,:;]*[\s“"']/i;

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
  if (offersATranslationAlternative(body)) return "trn";
  if (comparesLanguageWitnesses(body)) return "var";
  return "stu";
}
