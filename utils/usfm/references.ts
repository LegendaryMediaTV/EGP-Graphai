/**
 * Cross-reference (`\x`...`\x*`) assembly: given the token stream right
 * after an `\x` marker has opened, consumes tokens through the matching
 * `\x*` close and produces one `Footnote`, always typed `xrf` regardless of
 * whether every target inside it resolves to a link.
 *
 * `\xo` (the origin-reference sub-marker) is dropped, for the same reason
 * `\fr` is dropped from an ordinary footnote (`usfm/footnotes.ts`): it is a
 * pure position label, and structural attachment already encodes which
 * verse a note belongs to. `\xt` carries the target list — one or more
 * references joined by a literal `"; "` — each resolved independently by
 * {@link resolveTarget}.
 *
 * Book-name resolution goes through `bible-books/bible-books.json`
 * directly, never through `utils/crossChapterLinks.ts`'s `resolveBookName`:
 * that resolver's canon/alias index is built by reading whatever is already
 * on disk under `bible-versions/<version>/`, which can be empty or
 * partially written mid-import (a later book, or the current book's own
 * later chapters, may not be written yet). {@link resolveTarget} instead
 * takes `canonBookIds` as a caller-supplied parameter — the target
 * version's already-loaded book list — so resolution never depends on
 * partial disk state.
 *
 * A resolved target string is not always the raw text as-is: a book-name
 * override ({@link BIBLE_LINK_BOOK_NAME_OVERRIDES}) and a verse-list
 * comma-spacing rule ({@link addSpaceAfterVerseListComma}) both apply only
 * to the target string, never to what {@link withDisplay} shows, which
 * stays the source's own raw spelling exactly. An ASCII-hyphen-to-en-dash
 * normalization is a third, separate `bibleLink` convention this module
 * deliberately leaves alone: it runs post-write, in `utils/validate.ts`'s
 * `normalizeBibleLinkDashesInContent`, against whatever character the dash
 * class ended up being.
 *
 * A second, orthogonal capability lives here too: {@link
 * linkEmbeddedReferences} finds a reference sitting *inside* a larger run
 * of ordinary footnote prose, with no `\x`/`\+xt` marker anywhere near it,
 * and turns just that part into a real `bibleLink`. Every function above
 * this point resolves a target that is already isolated (a whole `\xt`
 * list, or a `\f` body that is nothing but references); {@link
 * linkEmbeddedReferences} is the one place this module goes looking for a
 * reference embedded in text that is mostly something else.
 *
 * Detection requires no "See "/"Compare " lead-in word: this module's own
 * registry-and-grammar validation — a candidate must name a real, in-canon
 * book with a real chapter and verse — is already the actual defense
 * against a false link. A fully self-naming reference (e.g. "Mark
 * 16:9-20") is exactly as unambiguous as any already-linked `\x`/`\+xt`
 * reference, whether or not a directive word happens to sit next to it, so
 * {@link linkEmbeddedReferences} scans an entire footnote body for any such
 * reference with no lead-in word required. The one exception: a bare
 * chapter-only mention (no verse) never links, because upstream `HEAD`
 * itself never does either — see {@link EMBEDDED_HEAD}'s own doc comment
 * for why.
 */

import * as fs from "fs";
import * as path from "path";
import Content, { ContentBibleLink } from "../../types/Content";
import Footnote from "../../types/Footnote";
import { Token } from "./tokenize";

/** One `bible-books/bible-books.json` entry this module actually reads. */
interface BibleBookRegistryEntry {
  /** The book's own registry id, e.g. `"GEN"`. */
  readonly _id: string;
  /** The book's own canonical display name, e.g. `"Genesis"`. */
  readonly name: string;
  /** Alternate names/aliases a target might spell the book with instead. */
  readonly alt?: readonly string[];
}

/**
 * One name/alias candidate paired with the book id it names. Built once
 * from the whole registry (every book known, canonical or not) — canon
 * restriction happens only after a match is found (see
 * {@link resolveTarget}), so an out-of-canon book still resolves far enough
 * to be correctly reported and left as plain text, rather than falling
 * through as an unrecognized shape.
 */
interface BookNameCandidate {
  /** Literal book name or alias a target's text might start with. */
  readonly name: string;
  /** Book id this name/alias refers to. */
  readonly id: string;
}

/** Indexed view of `bible-books.json`, built once by {@link registry}. */
interface BookRegistry {
  /** Every registry name/alias, longest first, so `"1 Kings"` is tried before a shorter candidate could false-match a prefix of it. */
  readonly candidates: readonly BookNameCandidate[];
  /** Book id -> canonical display name. Used to build the resolved target string instead of the raw alias a target used to spell it — a normalization fallback, since most real targets already match the canonical spelling exactly. */
  readonly canonicalNameById: ReadonlyMap<string, string>;
}

/** Absolute path to the bible-books registry, read once by {@link registry}. */
const BIBLE_BOOKS_FILE = path.resolve(__dirname, "../../bible-books/bible-books.json");

/**
 * A book name/alias's own leading ordinal digit, mapped to the Roman
 * numeral prose commonly substitutes for it ("1 Kings"/"1Kgs" written as "I
 * Kings"/"I Kgs"). Both spellings name the same book; a candidate list built
 * from `bible-books.json` alone only ever has the Arabic-digit form, so
 * {@link romanNumeralVariant} derives the other one instead of the registry
 * needing to carry both spellings of every numbered book by hand.
 */
const ORDINAL_TO_ROMAN_NUMERAL: ReadonlyMap<string, string> = new Map([
  ["1", "I"],
  ["2", "II"],
  ["3", "III"],
]);

/**
 * Derives a Roman-numeral-ordinal counterpart of a numbered book's own
 * name/alias, or `undefined` for a name that doesn't start with a digit this
 * corpus's own ordinals ever use (every other book name, and any book whose
 * ordinal isn't 1-3). A space always separates the numeral from what follows
 * in the derived form even when `name` itself has none (`"1Kgs"` becomes
 * `"I Kgs"`, not `"IKgs"`): a compact digit-glued alias is already this
 * corpus's own registry convention for the Arabic form, but real prose never
 * glues a Roman numeral to the word after it the same way.
 */
function romanNumeralVariant(name: string): string | undefined {
  const match = /^([123])\s?(.+)$/.exec(name);
  if (!match) return undefined;
  const [, digit, rest] = match;
  return `${ORDINAL_TO_ROMAN_NUMERAL.get(digit)} ${rest}`;
}

/**
 * Book ids whose registry `name` (the whole book's own title) is the wrong
 * word for a `bibleLink` target naming one specific chapter of it —
 * resolved through this table instead of {@link BookRegistry.canonicalNameById}
 * whenever it has an entry for the matched book id.
 *
 * `PSA`'s registry `name` is "Psalms" (correct for the book as a whole —
 * `"Psalms 42–72"`, a `\ms1` book-division heading, is right to stay
 * plural), but a cross-reference always cites one individually-numbered
 * poem, "Psalm C:V" — the same singular/plural distinction English already
 * makes between "the Psalms" (the book) and "Psalm 23" (one poem in it).
 */
const BIBLE_LINK_BOOK_NAME_OVERRIDES: ReadonlyMap<string, string> = new Map([["PSA", "Psalm"]]);

/**
 * Book ids that carry exactly one chapter in every edition this repo has
 * ever recorded one in — fixed by the book's own canonical structure, not by
 * any one translation's choices, the same kind of fact {@link
 * ORDINAL_TO_ROMAN_NUMERAL} already hardcodes. A `\xt`-derived target always
 * spells one of these out with its chapter anyway ("Jude 1:14, 15"), since
 * the raw USFM cross-reference already encodes it — but ordinary prose
 * naturally drops a chapter nobody needs to name ("Obad. 11–14"), leaving a
 * bare digit run {@link buildLinkTarget} would otherwise read as a chapter
 * number instead of the verse it actually is.
 */
const SINGLE_CHAPTER_BOOK_IDS: ReadonlySet<string> = new Set(["OBD", "PHM", "2JN", "3JN", "JUD", "PMA", "PS2"]);

/** Memoized {@link registry} result, computed once per process. */
let registryCache: BookRegistry | undefined;

/** Reads and indexes `bible-books.json` once, reused for every call in the process — the same read-once-and-cache shape `utils/crossChapterLinks.ts`'s `bibleBooks()` uses for the identical file. */
function registry(): BookRegistry {
  if (registryCache) return registryCache;

  const entries: BibleBookRegistryEntry[] = JSON.parse(fs.readFileSync(BIBLE_BOOKS_FILE, "utf8"));
  const candidates: BookNameCandidate[] = [];
  const canonicalNameById = new Map<string, string>();
  for (const entry of entries) {
    canonicalNameById.set(entry._id, entry.name);
    for (const name of [entry.name, ...(entry.alt ?? [])]) {
      candidates.push({ name, id: entry._id });
      const roman = romanNumeralVariant(name);
      if (roman !== undefined) candidates.push({ name: roman, id: entry._id });
    }
  }
  candidates.sort((a, b) => b.name.length - a.name.length);

  registryCache = { candidates, canonicalNameById };
  return registryCache;
}

/**
 * A "See "/"Compare " lead-in — WEB's house style for a reference written
 * as a directive rather than a bare citation. Stripped before book-name
 * matching; the original text is kept as the display override (see
 * {@link withDisplay}), so "See Job 9:8" still reads that way while linking
 * to "Job 9:8".
 *
 * "Compare " has only been observed in `\f`-derived bodies (resolved
 * through {@link buildReferenceOnlyContent}), never in an `\xt` target, but
 * is folded into the same check since it would resolve identically.
 */
const REFERENCE_LEAD_IN = /^(?:See|Compare)\s+/;

/** Dash characters a verse range might use. Mirrors `utils/crossChapterLinks.ts`'s `DASH_CLASS` — duplicated deliberately, since that module's matching logic runs post-write against disk and isn't reachable from here. */
const DASH_CLASS = "\\u2010-\\u2015\\u2212-";

/**
 * One digit run, guarded on its own trailing edge against a subtler
 * backtracking failure: without `(?!\d)`, a later constraint failing further
 * down the pattern can make the engine retry this same digit run *shorter*
 * rather than reject the group it belongs to — e.g. real "(Num. 12:11, 12
 * KJV)" would otherwise resolve "12" down to "1" (leaving a dangling "2")
 * purely because a shorter digit run happens to satisfy whatever comes next
 * where the full one doesn't, producing the nonsense target "Numbers 12:11,
 * 1". `(?!\d)` forbids the engine from ever treating a digit run as complete
 * while another digit still follows it, so the *only* backtrack left when
 * something later fails is dropping the whole group that failure sits in —
 * a verse number is kept whole, or dropped entirely, never truncated.
 */
const DIGITS = "\\d+(?!\\d)";

/** A dash-joined range endpoint: a dash character, a digit run, and an optional colon-joined verse. */
const DASH_RANGE_SOURCE = `[${DASH_CLASS}]${DIGITS}(?::${DIGITS})?`;
/**
 * One comma-joined additional verse or range, continuing a reference's own
 * verse list — the optional `(?:and\s+)?` is this corpus's own real
 * Oxford-comma convention for the last item of a written-out list (real
 * "Gen. 14:2, 3, 7, 8, 15, and 17" names six verses, not five with "and 17"
 * left dangling as unrelated prose). Harmless for a machine-generated
 * `\xt` target, which never has any reason to spell a verse list this way,
 * so nothing here narrows this source to the embedded scan alone.
 */
const COMMA_SEGMENT_SOURCE = `,\\s?(?:and\\s+)?${DIGITS}(?:[${DASH_CLASS}]${DIGITS})?`;
/** A trailing tradition siglon — see {@link REFERENCE_SUFFIX}'s own doc comment for why only these four. */
const SIGLON_SOURCE = "\\s(?:LXX|MT|TR|NU)";

/**
 * The full shape a reference's text (everything after the book name) must
 * match, start to end, for an already-isolated `\xt`/`\f`-list target: a
 * chapter, an optional verse, an optional dash-joined range endpoint, any
 * number of comma-joined additional verses/ranges, and an optional trailing
 * tradition siglon (`LXX`/`MT`/`TR`/`NU`).
 *
 * Trailing text that doesn't fit this shape fails the match and is left as
 * plain text — a wrong link is worse than a missing one. The siglon
 * exception exists because those four are WEB's own standing abbreviations
 * for a textual tradition (see `usfm/footnoteTypeRules.ts`), not a guess;
 * matching is case-sensitive here, deliberately narrower than that module's
 * `WITNESS_SIGLA`, which also tolerates a lower-case `nu` for a different
 * purpose (naming a witness inside ordinary prose, not a trailing
 * citation).
 *
 * Never needs a guard against swallowing a different book's own leading
 * digit the way {@link findNextEmbeddedReference} does (see {@link
 * wouldStealBookOrdinal}): an already-isolated target's own "; " already
 * separates distinct book references, so a bare comma inside one target is
 * always more of *that same* target's own verse list, and this pattern's
 * own trailing `$` already demands nothing else follow at all.
 */
const REFERENCE_SUFFIX = new RegExp(`^${DIGITS}(?::${DIGITS})?(?:${DASH_RANGE_SOURCE})?(?:${COMMA_SEGMENT_SOURCE})*(?:${SIGLON_SOURCE})?$`);

/**
 * The mandatory core of a named embedded reference: a chapter, with an
 * optional colon-joined verse — the same shape {@link REFERENCE_SUFFIX}'s
 * own head allows, chapter-only included. A chapter-only mention like
 * Numbers 8:6's real "(I Cor. 12)" still names a real, specific passage
 * (the whole chapter, not one verse of it) and links the same as any other
 * reference this module resolves — explicitly requested, reversing this
 * corpus's own earlier, narrower convention of declining one.
 *
 * Not used by {@link AMBIENT_HEAD}, which stays verse-mandatory: an already
 * bare `"(C:V...)"` citation with no book name of its own carries much
 * weaker evidence than a chapter-only mention that already *names its own
 * book*, or chains directly onto one that just resolved — a bare `"(12)"`
 * floating in prose with nothing anchoring it is far more likely to be an
 * unrelated number (a footnote index, a list item) than a citation, so that
 * one mechanism alone keeps the stricter, verse-required rule.
 *
 * Anchored only at the start: {@link findSafeReferenceLength} extends past
 * this core through an optional dash-range and any number of comma-list
 * segments itself, checking each extension against {@link
 * wouldStealBookOrdinal} before accepting it, rather than one static regex
 * accepting or rejecting the whole shape at once the way {@link
 * REFERENCE_SUFFIX} does for an already-isolated target.
 */
const EMBEDDED_HEAD = new RegExp(`^${DIGITS}(?::${DIGITS})?`);

/**
 * {@link EMBEDDED_HEAD}'s own stricter sibling, verse-mandatory — the one
 * head {@link findNextEmbeddedReference}'s own ambient-parenthetical branch
 * uses instead of the shared default, since a bare `"(C:V...)"` citation
 * with no book name of its own needs the extra evidence a named verse gives
 * it; see {@link EMBEDDED_HEAD}'s own doc comment for why a chapter alone
 * isn't enough there specifically.
 */
const AMBIENT_HEAD = new RegExp(`^${DIGITS}:${DIGITS}`);

const LEADING_DASH_RANGE = new RegExp(`^${DASH_RANGE_SOURCE}`);
const LEADING_COMMA_SEGMENT = new RegExp(`^${COMMA_SEGMENT_SOURCE}`);
const LEADING_SIGLON = new RegExp(`^${SIGLON_SOURCE}`);
/** Just the comma, its own optional following space, and an optional Oxford-comma "and" — with no digit — used to peek at what a comma-list segment's own leading digit run might really be, before deciding whether to consume it as this reference's own next verse. */
const LEADING_COMMA_SPACE = /^,\s?(?:and\s+)?/;

/**
 * Whether `text` itself begins with a real, chapter-bearing reference — the
 * question {@link findSafeReferenceLength} asks at each dash-range and
 * comma-list boundary in place of the old blunt "is the next character
 * capitalized" rule. Reuses the exact same {@link matchBookPrefix} and
 * {@link EMBEDDED_HEAD} that resolve any other embedded reference in this
 * module, so "a real reference starts here" means the same thing everywhere
 * it's asked — a translation-edition abbreviation ("KJV") is capitalized the
 * same way a real book name is, but never resolves to one, so it no longer
 * reads as dangerous the way it used to under the old capital-letter check.
 *
 * Deliberately never canon-restricted, unlike every other book match in this
 * module: the question here is "does this look like a different book's own
 * citation," not "could this resolve to a link" — an out-of-canon book gets
 * named in ordinary prose all the time (an NT-only version's own footnote
 * saying "see Isaiah 7:14" is unremarkable even though Isaiah is nowhere in
 * that version's own book list), and a comma-list sitting next to one is
 * exactly as much a *different* reference as a comma-list sitting next to an
 * in-canon one is. Canon-restricting this check would let the old failure
 * mode back in for exactly the books a version doesn't carry.
 */
function wouldStealBookOrdinal(text: string): boolean {
  const direct = matchBookPrefix(text, registry().candidates);
  if (direct === undefined) return false;
  return EMBEDDED_HEAD.test(direct.rest);
}

/**
 * Finds the longest prefix of `rest` (the text immediately after a matched
 * book name, or after the open paren of a bare ambient citation) that is
 * both a valid embedded-reference shape and never mistakes a *different*
 * book's own leading digit for one of this reference's own verses or
 * verse-list continuations.
 *
 * Walks the shape left to right — the mandatory `head` (defaulting to
 * {@link EMBEDDED_HEAD}; {@link findNextEmbeddedReference}'s own
 * ambient-parenthetical branch passes {@link AMBIENT_HEAD} instead), an
 * optional dash-range, then each comma-list segment in turn — extending past
 * each optional piece only after {@link wouldStealBookOrdinal} says no real
 * reference starts right where that piece's own digit run begins. The first
 * piece that would steal a real reference's leading digit stops the walk
 * there: 2 Maccabees 5:13's real "...see Judges 11:3, 2 Samuel 10:6..."
 * stops right after "Judges 11:3", leaving ", 2 Samuel 10:6" for the rest of
 * the scan to find as its own, separate reference instead of the nonsense
 * target "Judges 11:3, 2".
 *
 * @returns `undefined` when `rest` doesn't even carry the mandatory head —
 *   the caller declines the candidate entirely, same as `head` failing to
 *   match ever did.
 */
function findSafeReferenceLength(rest: string, head: RegExp = EMBEDDED_HEAD): number | undefined {
  const headMatch = head.exec(rest);
  if (headMatch === null) return undefined;
  let length = headMatch[0].length;

  const dashMatch = LEADING_DASH_RANGE.exec(rest.slice(length));
  if (dashMatch !== null && !wouldStealBookOrdinal(rest.slice(length + 1))) {
    length += dashMatch[0].length;
  }

  while (true) {
    const remaining = rest.slice(length);
    const commaSpaceMatch = LEADING_COMMA_SPACE.exec(remaining);
    if (commaSpaceMatch === null) break;
    if (wouldStealBookOrdinal(remaining.slice(commaSpaceMatch[0].length))) break;

    const segmentMatch = LEADING_COMMA_SEGMENT.exec(remaining);
    if (segmentMatch === null) break;
    length += segmentMatch[0].length;
  }

  const siglonMatch = LEADING_SIGLON.exec(rest.slice(length));
  if (siglonMatch !== null) length += siglonMatch[0].length;

  return length;
}

/**
 * Inserts the space this corpus's own `bibleLink`-target convention requires
 * after a verse-list comma the raw source omitted — e.g. Matthew 5:4's
 * second target, raw `"66:10,13"`, targets `"Isaiah 66:10,
 * 13"`. {@link REFERENCE_SUFFIX} already accepts either shape (`,\s?\d`), so
 * this never rejects a real target; it only decides which spacing the
 * *target* string emits. The raw text itself is untouched — passed to
 * {@link withDisplay} unchanged, so a target this normalizes still displays
 * exactly as comma-unspaced as the source wrote it.
 */
function addSpaceAfterVerseListComma(text: string): string {
  return text.replace(/,(?=\d)/g, ", ");
}

/**
 * Drops a written-out list's own Oxford-comma "and" from a `bibleLink`
 * target string — real "Gen. 14:2, 3, 7, 8, 15, and 17" targets "Genesis
 * 14:2, 3, 7, 8, 15, 17", never "...15, and 17". {@link
 * COMMA_SEGMENT_SOURCE}'s own "and" tolerance exists so the *raw* source
 * text still matches through to a real verse number; the target itself is a
 * plain, parseable "Book C:V, V, V" citation with no English word mixed in,
 * the same shape every other target in this corpus already has, so this
 * runs only on the string {@link buildLinkTarget} builds a target from,
 * never on `raw`, which {@link withDisplay} still shows exactly as the
 * source wrote it, "and" included.
 */
function stripAndFromVerseList(text: string): string {
  return text.replace(/,\s*and\s+/g, ", ");
}

/**
 * Finds the longest registry name/alias `text` starts with, immediately
 * followed by an optional period, a mandatory space, an optional open
 * parenthesis, and a digit (so `"Isaiahs 61:2"` would not match `"Isaiah"`
 * on a bare prefix, but `"Isa. 61:2"` matches `"Isa"` with the period
 * consumed as part of the book name rather than left dangling on `rest`, and
 * real "Jeremiah (27:2-7; 47:4)" matches "Jeremiah" the same way, with the
 * open paren consumed the same way the period is). Returns `undefined` when
 * nothing matches.
 *
 * The period and the open paren are each optional rather than required so
 * the same candidate list matches a source that always writes one, one that
 * never does, and everything between, with no separate copy of every alias
 * needed in the registry for either. The open paren is never required back
 * on the closing side: `raw` simply ends wherever the reference's own
 * suffix grammar stops matching, same as any other trailing punctuation
 * this module already leaves for ordinary prose to carry — the reference
 * still reads correctly with only its own closing paren left outside the
 * link, the same way `withDisplay`'s own raw text already does for
 * unrelated trailing punctuation elsewhere.
 */
function matchBookPrefix(text: string, candidates: readonly BookNameCandidate[]): { id: string; rest: string } | undefined {
  for (const candidate of candidates) {
    const { name } = candidate;
    if (!text.startsWith(name)) continue;
    const afterName = text[name.length] === "." ? name.length + 1 : name.length;
    if (text[afterName] !== " ") continue;
    const afterSpace = afterName + 1;
    const afterParen = text[afterSpace] === "(" ? afterSpace + 1 : afterSpace;
    if (text.length > afterParen && /^\d/.test(text.slice(afterParen))) {
      return { id: candidate.id, rest: text.slice(afterParen) };
    }
  }
  return undefined;
}

/** Builds a `{bibleLink}` node, adding a `content` display override only when `raw` differs from the resolved `target` — most real targets already spell the book exactly as the registry does, so no override is needed in the common case. */
function withDisplay(target: string, raw: string): ContentBibleLink {
  return target === raw ? { bibleLink: target } : { bibleLink: target, content: raw };
}

/**
 * Builds the resolved target string and canonical book name for a matched
 * book id plus its own already-validated rest-of-reference text, applying
 * the book-name override, the verse-list comma spacing, and (for a book in
 * {@link SINGLE_CHAPTER_BOOK_IDS}, when `rest` does not already spell one
 * out) an inserted `1:` — the one place any of the three is applied, shared
 * by {@link resolveTarget}'s own direct-book-name branch and {@link
 * findNextEmbeddedReference}, so a reference resolves to the identical
 * target string regardless of which of the two ever finds it.
 */
function buildLinkTarget(bookId: string, rest: string): { target: string; bookName: string } {
  const { canonicalNameById } = registry();
  const bookName = BIBLE_LINK_BOOK_NAME_OVERRIDES.get(bookId) ?? (canonicalNameById.get(bookId) as string);
  const cleaned = stripAndFromVerseList(addSpaceAfterVerseListComma(rest));
  const withChapter = SINGLE_CHAPTER_BOOK_IDS.has(bookId) && !/^\d+:/.test(cleaned) ? `1:${cleaned}` : cleaned;
  return { target: `${bookName} ${withChapter}`, bookName };
}

/** One target's resolution — either a real `{bibleLink}` or, for a shape the grammar does not describe, a plain string — plus, when it resolved, the canonical book name a later same-list target might need to inherit. */
interface ResolvedTarget {
  /** The resolved `bibleLink` node, or the raw text unchanged when resolution failed. */
  readonly node: ContentBibleLink | string;
  /** The canonical book name this target resolved to, or `undefined` when it did not resolve — what a later same-list shorthand continuation would inherit. */
  readonly bookName: string | undefined;
}

/**
 * Resolves one raw, already semicolon-split target string.
 *
 * Three shapes, tried in order:
 *
 * 1. **A leading book name** (optionally behind a `"See "` lead-in) —
 *    resolved only when the book is inside `canonBookIds` *and* the
 *    remaining text matches {@link REFERENCE_SUFFIX} in full. Either
 *    failure — an out-of-canon book, or trailing text the grammar doesn't
 *    describe — produces the same outcome: the raw text, unresolved, never
 *    guessed into a link.
 * 2. **A bare `"C:V"`-shaped continuation with no book name** — WEB's
 *    shorthand for "same book as the previous target in this `\xt` list"
 *    (e.g. Matthew 5:4's `\xt Isaiah 61:2; 66:10,13`, where `"66:10,13"`
 *    inherits `"Isaiah"`). Only fires when `priorBookName` is set — the
 *    last *successfully resolved* target's book. An unresolved target
 *    never updates it, so a later shorthand reaches past it to whichever
 *    resolved book came before.
 * 3. **Anything else** — left as plain text, unresolved.
 *
 * @param canonBookIds - The target version's book ids, or `undefined` to
 *   accept every book the registry knows (no canon restriction — the
 *   default for a caller indifferent to canon scoping, such as a unit
 *   test).
 */
function resolveTarget(raw: string, canonBookIds: ReadonlySet<string> | undefined, priorBookName: string | undefined): ResolvedTarget {
  const { candidates } = registry();

  const leadInMatch = REFERENCE_LEAD_IN.exec(raw);
  const withoutLeadIn = leadInMatch ? raw.slice(leadInMatch[0].length) : raw;

  const direct = matchBookPrefix(withoutLeadIn, candidates);
  if (direct !== undefined) {
    const inCanon = canonBookIds === undefined || canonBookIds.has(direct.id);
    if (inCanon && REFERENCE_SUFFIX.test(direct.rest)) {
      const { target, bookName } = buildLinkTarget(direct.id, direct.rest);
      return { node: withDisplay(target, raw), bookName };
    }
    return { node: raw, bookName: undefined };
  }

  if (priorBookName !== undefined && /^\d/.test(withoutLeadIn) && REFERENCE_SUFFIX.test(withoutLeadIn)) {
    const rest = stripAndFromVerseList(addSpaceAfterVerseListComma(withoutLeadIn));
    return { node: withDisplay(`${priorBookName} ${rest}`, raw), bookName: priorBookName };
  }

  return { node: raw, bookName: undefined };
}

/**
 * Resolves a semicolon-split target list into cross-reference content: one
 * `bibleLink` (or, unresolved, a plain string) per target, joined by
 * literal `"; "` items when there's more than one. Shared by
 * {@link buildCrossReferenceContent} (`\x`-sourced targets) and
 * {@link buildReferenceOnlyContent} (a `\f`-sourced body classified
 * "nothing but a reference") — the same resolve-each-and-join walk
 * regardless of which marker produced the raw targets.
 */
function resolveTargetList(rawTargets: readonly string[], canonBookIds: ReadonlySet<string> | undefined): Content {
  const nodes: (ContentBibleLink | string)[] = [];
  let priorBookName: string | undefined;
  for (let targetIndex = 0; targetIndex < rawTargets.length; targetIndex++) {
    if (targetIndex > 0) nodes.push("; ");
    const resolved = resolveTarget(rawTargets[targetIndex], canonBookIds, priorBookName);
    nodes.push(resolved.node);
    if (resolved.bookName !== undefined) priorBookName = resolved.bookName;
  }
  return nodes.length === 1 ? nodes[0] : nodes;
}

/**
 * Resolves a `\f`-derived footnote body that {@link classifyFootnote}
 * classified `xrf` — its content is nothing but reference-shaped runs —
 * into the same cross-reference content an `\x`-sourced target gets. Only
 * relevant once deuterocanon books are in scope — the 66-book canonical
 * corpus never produces this shape.
 *
 * Unlike an `\xt` target, a `\f` body is written as a complete sentence, so
 * its trailing period is punctuation rather than part of a reference and is
 * stripped before resolution. Everything else — multi-target lists, the
 * lead-in strip, book-prefix matching, canon restriction, and the
 * unresolvable fallback to plain text — reuses {@link resolveTarget}'s
 * grammar exactly, through {@link resolveTargetList}, rather than
 * reimplementing it.
 *
 * @param body - The footnote's already-extracted, `\fr`-excluded plain text
 *   (`usfm/footnotes.ts`'s `classificationText`).
 * @param canonBookIds - See {@link resolveTarget}.
 */
export function buildReferenceOnlyContent(body: string, canonBookIds?: ReadonlySet<string>): Content {
  const withoutTrailingPeriod = body.trim().replace(/\.$/, "");
  const rawTargets = withoutTrailingPeriod.split("; ");
  return resolveTargetList(rawTargets, canonBookIds);
}

/** The result of walking one `\x`...`\x*` span. */
export interface CrossReferenceBuildResult {
  /** The cross-reference's content, always typed `xrf`. */
  readonly footnote: Footnote;
  /** The index of the first token after the matching `\x*` close — the caller resumes its walk from here. */
  readonly nextIndex: number;
}

/**
 * Walks the token stream from `startIndex` (the token immediately after an
 * `\x` marker's `open` token) through its matching `close` token, building
 * the cross-reference's content, always typed `xrf`.
 *
 * A single target becomes one `bibleLink` object directly; multiple targets
 * become an array, each pair joined by a literal `"; "` text item — the
 * same shape a real multi-target cross-reference footnote uses on disk.
 *
 * @param canonBookIds - See {@link resolveTarget}.
 */
export function buildCrossReferenceContent(
  tokens: readonly Token[],
  startIndex: number,
  canonBookIds?: ReadonlySet<string>,
): CrossReferenceBuildResult {
  let targetText = "";
  let currentSubMarker: string | undefined;
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.type === "close" && token.name === "x") {
      index++;
      break;
    }

    if (token.type === "marker" && (token.name === "xo" || token.name === "xt")) {
      currentSubMarker = token.name;
      index++;
      continue;
    }

    if (token.type === "text") {
      if (currentSubMarker === "xt") targetText += token.text;
      index++;
      continue;
    }

    // Anything else inside an `\x` span (an unrelated open/close pair, a
    // sub-marker not in the kept set) carries no target text — never
    // observed in this corpus, harmless either way.
    index++;
  }

  const rawTargets = targetText.trim().split("; ");
  const content = resolveTargetList(rawTargets, canonBookIds);
  return { footnote: { type: "xrf", content }, nextIndex: index };
}

// ---------------------------------------------------------------------------
// A fully-qualified reference embedded in ordinary footnote prose
// ---------------------------------------------------------------------------

/**
 * Whether `character` could be the tail end of a word — a letter or digit.
 * {@link findNextEmbeddedReference} refuses to start matching a book name at
 * a position where the character right before it is one of these, so a book
 * name can never be "found" as a literal substring sitting inside some
 * larger word. Never observed to matter anywhere in the real corpus (no
 * real book name ever sits that way immediately before a chapter:verse-
 * shaped run), but cheap, and it keeps that failure mode impossible by
 * construction rather than merely absent because the corpus happens not to
 * exercise it.
 */
function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9]/.test(character);
}

/** One real, fully-qualified reference {@link findNextEmbeddedReference} found, plus where it starts in the text it was searching. */
interface EmbeddedReferenceMatch {
  /** The exact raw text consumed — the book name, its own resolved suffix, and any semicolon-joined bare continuations chained onto it (see {@link findNextEmbeddedReference}'s own doc comment). */
  readonly raw: string;
  /** `raw`'s own start position in the text this was found in. */
  readonly start: number;
  /** The resolved `bibleLink` node or nodes, interleaved with a literal `"; "` between each pair — one node when there's no chained continuation, matching {@link resolveTargetList}'s own shape for a real, isolated multi-target list. */
  readonly nodes: readonly (string | ContentBibleLink)[];
}

/**
 * Mutable box carrying the book id the *last* reference actually resolved
 * to, threaded across an entire footnote body — every sibling item in a
 * `content` array, and every successive match within one string of it —
 * never across two different footnotes. What a later bare, parenthesized
 * `"(C:V...)"` citation with no book name of its own, and no direct {@link
 * LEADING_CONTINUATION_CONNECTOR} chaining it onto anything, still inherits
 * from (real 2 Samuel 12:11's own note names its book once and then cites
 * five more passages this way: "(13:28, 29)", "(18:6ff.)", each sitting in
 * its own parenthetical several sentences after the last thing actually
 * named). A single mutable box, not a return value threaded by hand,
 * because {@link linkEmbeddedReferences}'s own array walk needs to update it
 * from an already-tagged sibling node it otherwise never touches at all.
 */
interface AmbientBook {
  /** The last resolved book id, or `undefined` before anything in this footnote has resolved yet. */
  id: string | undefined;
}

/**
 * Extracts the book id a `bibleLink` node's own target already starts with,
 * by re-matching it against the same registry every target is ever built
 * from. Lets {@link linkEmbeddedReferences}'s own array walk update {@link
 * AmbientBook} from an already-tagged sibling node — an existing `\x`-sourced
 * cross-reference, or a reference an earlier pass already linked — without
 * otherwise touching that node at all.
 */
function extractBibleLinkBookId(item: unknown): string | undefined {
  if (item === null || typeof item !== "object" || !("bibleLink" in item)) return undefined;
  const target = (item as ContentBibleLink).bibleLink;
  return matchBookPrefix(target, registry().candidates)?.id;
}

/**
 * Either a semicolon (plus its own optional following space) or a bare
 * "and" — the two real ways this corpus's own footnote prose joins a bare,
 * book-less `"C:V"` continuation onto the reference right before it. A
 * semicolon needs no surrounding word ("Gen. 49:31; 50:13"); a bare "and"
 * needs no comma or semicolon of its own at all (real "II Kings 13:10 and
 * 14:17" and "Isa. 13:22 and 14:23" — a different chapter each time, joined
 * by "and" alone). Never confused with the *other* "and" this grammar
 * already recognizes, {@link COMMA_SEGMENT_SOURCE}'s own Oxford-comma
 * tolerance ("14:2, 3, ..., and 17"): that one requires a leading comma and
 * never itself carries a colon, so the two can never both match the same
 * position in the same text.
 */
const LEADING_CONTINUATION_CONNECTOR = /^(?:;\s?|\s+and\s+)/;

/**
 * Finds the next real, registry-resolvable reference in `text` starting at
 * or after `from`: a book name immediately followed by an explicit chapter
 * *and* verse ({@link findSafeReferenceLength}), found *anywhere* in the
 * text rather than only right after a lead-in word — see this module's own
 * header doc comment for why no lead-in word is required. Unlike {@link
 * resolveTarget}'s own direct branch, never canon-restricted: an embedded
 * mention names a real book regardless of whether the version being read
 * carries it (an NT-only version's own footnote can still say "see Isaiah
 * 7:14" without contradiction), so nothing here ever declines a match on
 * canon grounds.
 *
 * Uses the same {@link matchBookPrefix} and {@link buildLinkTarget} that
 * {@link resolveTarget}'s own direct branch does, so a reference resolves to
 * the identical target string no matter which of the two ever finds it.
 *
 * Once the primary reference itself resolves, also chains onto it every
 * {@link LEADING_CONTINUATION_CONNECTOR}-joined bare `"C:V"` continuation
 * that immediately follows — Genesis 23:19's real "(Gen. 49:31; 50:13)"
 * names two different chapters of the same book, "50:13" inheriting
 * "Genesis" the same way a bare continuation in an already-isolated `\xt`
 * list inherits its own prior target's book (`resolveTarget`'s own
 * `priorBookName`); real "II Kings 13:10 and 14:17" does the same thing with
 * a bare "and" instead of a semicolon. A continuation that isn't bare —
 * `EMBEDDED_HEAD` failing to match right after the connector, because a real
 * book name sits there instead (2 Maccabees 5:13's own "Judges 11:3, 2
 * Samuel 10:6" shape, had it used "; " instead of ", ") —
 * stops the chain immediately, leaving it for this function's own next call
 * to find as its own, separately-named reference.
 *
 * The primary reference itself is either a named book (the common case,
 * `matchBookPrefix`), or — only when {@link AmbientBook} already carries a
 * book from earlier in the same footnote body — a bare, parenthesized
 * `"(C:V...)"` citation with no book name of its own at all, immediately
 * after an open paren with nothing else between. Real 2 Samuel 12:11's own
 * note names "2 Samuel 13:14" once, in its own `bibleLink`, and then cites
 * four more passages this way several sentences later — "(13:28, 29)",
 * "(18:6ff.)" — each still meaning 2 Samuel. Deliberately narrower than the
 * semicolon/"and" chain above: it only fires immediately after an open
 * paren, not at any bare digit anywhere, so an ordinary sentence that merely
 * mentions a number is never mistaken for a citation.
 *
 * @returns `undefined` when no real, resolvable reference remains anywhere
 *   in `text` from `from` onward — a chapter with no verse ({@link
 *   findSafeReferenceLength}), or plain prose that never names a real book
 *   at all, is left as ordinary, unlinked text rather than guessed at.
 */
function findNextEmbeddedReference(text: string, from: number, ambient: AmbientBook): EmbeddedReferenceMatch | undefined {
  const { candidates } = registry();

  for (let position = from; position < text.length; position++) {
    if (isWordCharacter(text[position - 1])) continue;

    const direct = matchBookPrefix(text.slice(position), candidates);
    if (direct !== undefined) {
      const suffixLength = findSafeReferenceLength(direct.rest);
      if (suffixLength === undefined) continue;

      const prefixLength = text.length - position - direct.rest.length;
      return buildReferenceMatch(text, position, prefixLength, direct.rest.slice(0, suffixLength), direct.id, ambient);
    }

    if (ambient.id !== undefined && text[position] === "(") {
      const afterParen = text.slice(position + 1);
      const bareLength = findSafeReferenceLength(afterParen, AMBIENT_HEAD);
      if (bareLength === undefined) continue;
      return buildReferenceMatch(text, position, 1, afterParen.slice(0, bareLength), ambient.id, ambient);
    }
  }

  return undefined;
}

/**
 * Builds one {@link EmbeddedReferenceMatch} from a primary reference already
 * found at `position` — either a named book (`prefixLength` covers the book
 * name) or a bare parenthetical citation (`prefixLength` is `1`, just the
 * open paren) — then chases every {@link LEADING_CONTINUATION_CONNECTOR}
 * onto it exactly the same way regardless of which kind of primary match it
 * extends, since a chained continuation is always bare either way. Updates
 * `ambient.id` to `bookId` before returning: the next call to {@link
 * findNextEmbeddedReference} — whether for a later chain continuation or a
 * later bare parenthetical — inherits from *this* match, not a stale one.
 */
function buildReferenceMatch(
  text: string,
  position: number,
  prefixLength: number,
  suffixText: string,
  bookId: string,
  ambient: AmbientBook,
): EmbeddedReferenceMatch {
  const raw = text.slice(position, position + prefixLength + suffixText.length);
  const { target } = buildLinkTarget(bookId, suffixText);
  const nodes: (string | ContentBibleLink)[] = [withDisplay(target, raw)];
  let consumed = raw.length;

  while (true) {
    const remainder = text.slice(position + consumed);
    const connectorMatch = LEADING_CONTINUATION_CONNECTOR.exec(remainder);
    if (connectorMatch === null) break;

    const afterConnector = remainder.slice(connectorMatch[0].length);
    if (wouldStealBookOrdinal(afterConnector)) break;
    const continuationLength = findSafeReferenceLength(afterConnector);
    if (continuationLength === undefined) break;

    const continuationText = afterConnector.slice(0, continuationLength);
    const { target: continuationTarget } = buildLinkTarget(bookId, continuationText);
    nodes.push(connectorMatch[0], withDisplay(continuationTarget, continuationText));
    consumed += connectorMatch[0].length + continuationLength;
  }

  ambient.id = bookId;
  return { raw: text.slice(position, position + consumed), start: position, nodes };
}

/**
 * Splits every real, fully-qualified reference out of `text`, left to
 * right, replacing each with its own resolved `bibleLink` node — the same
 * alternating-array shape `imports/webus2020/divineNameCasing.ts`'s
 * `splitDivineNameCasing` already established for a closed phrase table,
 * applied here to a registry-validated reference instead of a literal
 * string. Two references found back to back (John 8:11's real "NU includes
 * John 7:53–John 8:11") both link independently; whatever text joins them
 * — an en dash, "and", nothing at all — is left exactly as it was, since
 * each reference is found and resolved on its own, with no chaining rule
 * needed to reach the second one.
 *
 * A reference sitting at `text`'s own very start (Proverbs 31:10-31's own
 * real self-referential acrostic note, "Proverbs 31:10-31 form an
 * acrostic...") or immediately after the one just linked leaves no plain
 * text at all in the gap between them — that gap is skipped rather than
 * pushed as an empty string, which `content-schema.json`'s own plain-string
 * branch (`minLength: 1`) would reject outright.
 *
 * @returns `text` itself, unchanged, when no reference resolves anywhere in
 *   it — every caller may compare the result to the input with `===` to
 *   detect "nothing to do."
 */
function splitEmbeddedReferences(text: string, ambient: AmbientBook): string | (string | ContentBibleLink)[] {
  const segments: (string | ContentBibleLink)[] = [];
  let cursor = 0;

  let match = findNextEmbeddedReference(text, 0, ambient);
  while (match !== undefined) {
    if (match.start > cursor) segments.push(text.slice(cursor, match.start));
    segments.push(...match.nodes);
    cursor = match.start + match.raw.length;
    match = findNextEmbeddedReference(text, cursor, ambient);
  }

  if (segments.length === 0) return text;
  if (cursor < text.length) segments.push(text.slice(cursor));
  return segments;
}

/**
 * Finds every real, fully-qualified reference sitting inside an
 * already-built footnote body and replaces each with a real `bibleLink`
 * node the same way an explicit `\x`/`\+xt` span already becomes one,
 * reusing {@link resolveTarget}'s own book-registry-and-grammar validation
 * ({@link findNextEmbeddedReference} calls the same {@link matchBookPrefix}
 * and {@link buildLinkTarget} that `resolveTarget`'s own direct branch
 * does) as the whole safety net against a false positive: a book name has
 * to be real and followed by a real chapter *and* verse before this ever
 * links anything — deliberately never canon-restricted the way {@link
 * resolveTarget}'s own direct branch is, since an embedded mention names a
 * real book regardless of whether the version being read happens to carry
 * it. No lead-in word is required or checked — see this module's own header
 * doc comment for why a self-naming reference needs none. The one shape
 * that still never links is a chapter with no verse; see {@link
 * EMBEDDED_HEAD}'s own doc comment for why.
 *
 * Only ever meant to run on a non-`xrf` footnote body (`usfm/footnotes.ts`):
 * a body that is *nothing but* references already takes the {@link
 * buildReferenceOnlyContent} path instead. This function's job is the
 * opposite shape — a reference that merely *sits inside* a larger run of
 * ordinary prose, anywhere in it, not only right after a particular word.
 *
 * A bare `"C:V"`-shaped continuation with no book name of its own (1
 * Maccabees 3:38's real "See 1 Maccabees 3:38; 10:10, etc." links both "1
 * Maccabees 3:38" and "10:10") *does* still resolve, the same way it does
 * for an already-isolated `\xt` target's own bare continuation
 * (`resolveTargetList`'s `priorBookName`) — either immediately after a
 * {@link LEADING_CONTINUATION_CONNECTOR} chained directly onto the reference
 * it inherits its book from (a semicolon, or a bare "and"), or, sitting
 * further off in the same footnote body with real prose in between, as its
 * own bare parenthetical citation (2 Samuel 12:11's real "(13:28, 29)",
 * several sentences after the reference it still means); see {@link
 * findNextEmbeddedReference}'s own doc comment for both mechanisms, tracked
 * across the whole body by one shared {@link AmbientBook}. Never a bare
 * comma with nothing else around it, which already means something else:
 * *this same reference's* own verse list.
 *
 * @param content - A footnote body's own already-built, non-`xrf` content —
 *   a bare string, or an array that may contain one. An already-tagged node
 *   (e.g. an `\fq` italic span) is left untouched apart from updating {@link
 *   AmbientBook} when it is itself a `bibleLink` — a real reference has
 *   never been observed sitting *embedded inside* an already-tagged node.
 */
export function linkEmbeddedReferences(content: Content): Content {
  const ambient: AmbientBook = { id: undefined };

  if (typeof content === "string") return splitEmbeddedReferences(content, ambient);

  if (Array.isArray(content)) {
    const rebuilt: Content[] = [];
    for (const item of content) {
      if (typeof item !== "string") {
        const inheritedId = extractBibleLinkBookId(item);
        if (inheritedId !== undefined) ambient.id = inheritedId;
        rebuilt.push(item);
        continue;
      }
      const split = splitEmbeddedReferences(item, ambient);
      if (Array.isArray(split)) rebuilt.push(...split);
      else rebuilt.push(split);
    }
    return rebuilt.length === 1 ? rebuilt[0] : rebuilt;
  }

  return content;
}
