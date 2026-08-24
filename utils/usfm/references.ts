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
 * partially written mid-import (a book later in canon order, or the book's
 * own still-unwritten later chapters, may not be on disk yet).
 * {@link resolveTarget} instead takes `canonBookIds` as a caller-supplied
 * parameter — the target version's already-loaded book list — so
 * resolution never depends on partial disk state.
 *
 * A resolved target string is not always the raw text as-is: Findings 8b/8c
 * added a book-name-only exception
 * ({@link BIBLE_LINK_BOOK_NAME_OVERRIDES}) and a verse-list comma-spacing
 * rule ({@link addSpaceAfterVerseListComma}), neither one this module's own
 * doing before Finding 8 — both apply only to the target string, never to
 * what {@link withDisplay} shows, which stays the source's own raw spelling
 * exactly. An ASCII-hyphen-to-en-dash normalization is a third, separate
 * `bibleLink` convention this module deliberately leaves alone: it runs
 * post-write, in `utils/validate.ts`'s `normalizeBibleLinkDashesInContent`,
 * against whatever character the dash class ended up being (this module
 * never converts one dash into another).
 *
 * Finding 9 added a second real capability, orthogonal to everything above:
 * {@link linkEmbeddedReferences} finds a reference sitting *inside* a larger
 * run of ordinary footnote prose, with no `\x`/`\+xt` marker anywhere near
 * it, and turns just that part into a real `bibleLink`. Every function above
 * this point in the file resolves a target that is already isolated (a
 * whole `\xt` list, or a `\f` body that is nothing but references);
 * {@link linkEmbeddedReferences} is the one place this module goes looking
 * for a reference embedded in text that is mostly something else.
 *
 * Finding 9's first version (Phase 14) gated detection on a "See "/
 * "Compare " cue word immediately before the reference, treating that word
 * as the primary defense against a false link. A later review found that
 * gate was the wrong safeguard: the real one already existed independently
 * of any cue word — this module's own registry-and-grammar validation,
 * which refuses to build a link unless a candidate names a real, in-canon
 * book with a real chapter and verse. A fully self-naming reference (e.g.
 * "Mark 16:9-20") is exactly as unambiguous as any already-linked
 * `\x`/`\+xt` reference, whether or not a directive word happens to sit next
 * to it. {@link linkEmbeddedReferences} was redesigned (Phase 15) to scan an
 * entire footnote body for any such reference, with no cue word required —
 * see its own doc comment for the real evidence this came from, including
 * the one real, corpus-wide-evidenced exception that remains: a bare
 * chapter-only mention (no verse) still never links, because upstream
 * `HEAD` itself never does either.
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

const BIBLE_BOOKS_FILE = path.resolve(__dirname, "../../bible-books/bible-books.json");

/**
 * Book ids whose registry `name` (the whole book's own title) is the wrong
 * word for a `bibleLink` target naming one specific chapter of it —
 * resolved through this table instead of {@link BookRegistry.canonicalNameById}
 * whenever it has an entry for the matched book id (Finding 8b).
 *
 * `PSA`'s registry `name` is "Psalms" (correct for the book as a whole —
 * `"Psalms 42–72"`, a `\ms1` book-division heading, is right to stay
 * plural), but every real cross-reference in this corpus's own raw `\xt`
 * text cites one individually-numbered poem, "Psalm C:V" — the same
 * singular/plural distinction English already makes between "the Psalms"
 * (the book) and "Psalm 23" (one poem in it). Confirmed to be the only such
 * mismatch in this corpus: every other of the 33 real book ids this
 * corpus's own cross-references resolve to (measured directly against
 * upstream `HEAD`'s own `bibleLink` targets, canonical-66-book scope) uses
 * its registry `name` exactly, with no second exception.
 */
const BIBLE_LINK_BOOK_NAME_OVERRIDES: ReadonlyMap<string, string> = new Map([["PSA", "Psalm"]]);

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
    for (const name of [entry.name, ...(entry.alt ?? [])]) candidates.push({ name, id: entry._id });
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
 * The full shape a reference's text (everything after the book name) must
 * match, start to end: a chapter, an optional verse, an optional
 * dash-joined range endpoint, any number of comma-joined additional
 * verses/ranges, and an optional trailing tradition siglon
 * (`LXX`/`MT`/`TR`/`NU`).
 *
 * Trailing text that doesn't fit this shape fails the match and is left as
 * plain text — a wrong link is worse than a missing one. The siglon
 * exception exists because those four are WEB's own standing abbreviations
 * for a textual tradition (see `usfm/footnoteTypeRules.ts`), not a guess;
 * matching is case-sensitive here, deliberately narrower than that module's
 * `WITNESS_SIGLA`, which also tolerates a lower-case `nu` for a different
 * purpose (naming a witness inside ordinary prose, not a trailing
 * citation).
 */
/**
 * The regex source both {@link REFERENCE_SUFFIX} (a full match, for an
 * already-isolated `\xt`/`\f`-list target) and {@link
 * EMBEDDED_REFERENCE_SUFFIX} (a greedy *prefix* match, for Finding 9's
 * embedded-reference scan below) share, factored out once a second real
 * caller needed the identical grammar anchored differently.
 *
 * The trailing `(?!\s?[A-Z])` matters only for the prefix case, but is
 * harmless for the full-match case too (see below), so it lives in the
 * shared source rather than being bolted onto one caller alone. An
 * already-isolated `\xt`/`\f`-list target can never legitimately have a
 * capitalized word sitting right after its own verse-list comma — the
 * source's own "; " already separates distinct book references, so a bare
 * comma inside one target is always more of *that same* target's own verse
 * list — and {@link REFERENCE_SUFFIX}'s own trailing `$` already demands
 * nothing else follow at all, so this lookahead changes nothing there.
 *
 * For the prefix case it is load-bearing: real footnote prose has no such
 * guarantee. Finding 9's own corpus scan found a real case where a bare
 * comma joins two *different* full references, not one target's own verse
 * list — 2 Maccabees 5:13's "...see Judges 11:3, 2 Samuel 10:6, and
 * compare..." — where a greedy, unguarded comma-list extension would
 * wrongly swallow "2 Samuel"'s own leading "2" as if it were a second verse
 * of Judges 11, producing the nonsense target "Judges 11:3, 2". The
 * lookahead stops the comma-list extension the moment what follows a
 * comma-led digit group is itself a capitalized word — the shape a new
 * book name, not a bare verse number, actually has.
 *
 * @param requireVerse - Phase 15's own real, corpus-wide-evidenced
 *   narrowing for the embedded-reference scan alone: when `true`, a chapter
 *   with no verse never matches at all. See {@link
 *   EMBEDDED_REFERENCE_SUFFIX}'s own doc comment for why. {@link
 *   REFERENCE_SUFFIX} keeps calling this with the default `false` —
 *   nothing in the real corpus forces a change there (every one of the 330
 *   distinct `bibleLink` targets upstream `HEAD` actually commits already
 *   names a verse, so the two shapes never disagree in practice), and an
 *   explicit `\xt`/`\+xt` marker is unambiguous by construction regardless
 *   of whether it happens to include one.
 */
function referenceSuffixPattern(requireVerse = false): string {
  const chapterAndVerse = requireVerse ? "\\d+:\\d+" : "\\d+(?::\\d+)?";
  return `${chapterAndVerse}(?:[${DASH_CLASS}]\\d+(?::\\d+)?)?(?:,\\s?\\d+(?:[${DASH_CLASS}]\\d+)?)*(?:\\s(?:LXX|MT|TR|NU))?(?!\\s?[A-Z])`;
}

const REFERENCE_SUFFIX = new RegExp(`^${referenceSuffixPattern()}$`);

/**
 * {@link referenceSuffixPattern}'s own grammar, anchored only at the start
 * and with an explicit verse required — the longest valid, verse-specific
 * reference-shaped prefix of whatever text follows a matched book name, not
 * a requirement that the *entire* remaining text be a reference and nothing
 * else. Finding 9's own embedded-reference scan (Phase 15's redesign; see
 * {@link findNextEmbeddedReference}'s own doc comment) needs both halves of
 * this:
 *
 * - **Prefix**, because real footnote prose almost always has real text
 *   right after the reference itself — a closing parenthesis, a
 *   semicolon-joined "etc.", the rest of the sentence — so this consumes as
 *   much of a valid reference as is really there and stops, leaving
 *   whatever follows as ordinary prose untouched.
 * - **Verse required**, because a bare chapter-only mention is a real,
 *   corpus-attested false-positive risk that book-name-plus-canon
 *   validation alone does not catch: a chapter number resolves exactly as
 *   validly as a chapter:verse pair does, but WEB's own real editorial
 *   convention never links one. The evidence, measured directly rather than
 *   assumed: every one of the 330 distinct `bibleLink` targets upstream
 *   `HEAD` actually commits anywhere in this corpus names a specific verse
 *   — zero counterexamples. Psalm 34:1, 111:1, and 112:1's own real,
 *   self-referential acrostic notes ("Psalm 34 is an acrostic poem, with
 *   each verse starting with a letter of the alphabet...") each name a
 *   real, registry-resolvable reference to the very passage they sit
 *   inside — structurally identical to Proverbs 31:10-31's own
 *   self-referential acrostic note and Mark 16:9-20's own self-referential
 *   textual note, both of which upstream `HEAD` *does* link — except that
 *   Proverbs 31:10-31 and Mark 16:9-20 both name a specific verse and Psalm
 *   34/111/112 name only a chapter. That is the one real, clean,
 *   100%-consistent line the whole corpus draws, so this is where the
 *   redesigned scan draws it too, rather than the blanket cue-word gate the
 *   user's own correction identified as the wrong safeguard (see this
 *   module's own header doc comment).
 *
 * Never used for an already-isolated `\xt`/`\f`-list target, where {@link
 * REFERENCE_SUFFIX}'s own "reject the whole candidate if anything trails
 * it, verse optional" rule is the correct one: that target is unambiguous
 * by construction (an explicit marker already delimited it as a reference),
 * so nothing about it needs the verse-mandatory narrowing this scan needs
 * precisely because it goes looking for a reference in text that is mostly
 * something else.
 */
const EMBEDDED_REFERENCE_SUFFIX = new RegExp(`^${referenceSuffixPattern(true)}`);

/**
 * Inserts the space this corpus's own `bibleLink`-target convention requires
 * after a verse-list comma the raw source omitted (Finding 8c) — e.g.
 * Matthew 5:4's second target, raw `"66:10,13"`, targets `"Isaiah 66:10,
 * 13"`. {@link REFERENCE_SUFFIX} already accepts either shape (`,\s?\d`), so
 * this never rejects a real target; it only decides which spacing the
 * *target* string emits. The raw text itself is untouched — passed to
 * {@link withDisplay} unchanged, so a target this normalizes still displays
 * exactly as comma-unspaced as the source wrote it.
 */
function addSpaceAfterVerseListComma(text: string): string {
  return text.replace(/,(?=\d)/g, ", ");
}

/** Finds the longest registry name/alias `text` starts with, immediately followed by a space and a digit (so `"Isaiahs 61:2"` would not match `"Isaiah"` on a bare prefix). Returns `undefined` when nothing matches. */
function matchBookPrefix(text: string, candidates: readonly BookNameCandidate[]): { id: string; rest: string } | undefined {
  for (const candidate of candidates) {
    const { name } = candidate;
    if (text.length > name.length && text.startsWith(name) && text[name.length] === " " && /^\d/.test(text.slice(name.length + 1))) {
      return { id: candidate.id, rest: text.slice(name.length + 1) };
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
 * Finding 8b's book-name override and Finding 8c's verse-list comma
 * spacing — the one place either rule is applied, shared by {@link
 * resolveTarget}'s own direct-book-name branch and Finding 9's {@link
 * findNextEmbeddedReference}, so a reference resolves to the identical
 * target string regardless of which of the two ever finds it.
 */
function buildLinkTarget(bookId: string, rest: string): { target: string; bookName: string } {
  const { canonicalNameById } = registry();
  const bookName = BIBLE_LINK_BOOK_NAME_OVERRIDES.get(bookId) ?? (canonicalNameById.get(bookId) as string);
  return { target: `${bookName} ${addSpaceAfterVerseListComma(rest)}`, bookName };
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
 *    guessed into a link (guide §6/§8).
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
    const rest = addSpaceAfterVerseListComma(withoutLeadIn);
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
 * classified `xrf` (guide §6's "nothing but a reference" test) into the
 * same cross-reference content an `\x`-sourced target gets. Only relevant
 * once deuterocanon books are in scope — the 66-book canonical corpus never
 * produces this shape.
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
 * same shape already on disk in `NKJV1982/19-PSA.json` 1:1's second
 * footnote.
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
// Finding 9: a fully-qualified reference embedded in ordinary footnote prose
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
  /** The exact raw text consumed — the book name plus its own resolved, verse-specific suffix, nothing more. */
  readonly raw: string;
  /** `raw`'s own start position in the text this was found in. */
  readonly start: number;
  /** The resolved `bibleLink` node. */
  readonly node: ContentBibleLink;
}

/**
 * Finds the next real, fully-qualified, registry-resolvable reference in
 * `text` starting at or after `from` — Finding 9's own redesigned detection
 * pass (Phase 15): a book name (canon-restricted the same way {@link
 * resolveTarget} is) immediately followed by an explicit chapter *and*
 * verse ({@link EMBEDDED_REFERENCE_SUFFIX}), found *anywhere* in the text
 * rather than only right after a cue word.
 *
 * This is the phase's own real correction of Finding 9's first attempt: a
 * reference that names its own book explicitly is exactly as unambiguous as
 * any already-linked `\x`/`\+xt` reference, whether or not a directive word
 * happens to sit next to it. Mark 16:9's real footnote ("...the translators
 * of the World English Bible regard Mark 16:9-20 as reliable...") and Psalm
 * 8:5's real footnote ("...See also the quote from the Septuagint in
 * Hebrews 2:7.", where "See" sits nowhere near "Hebrews") are both exactly
 * this shape — the book name itself is the safety net, not whatever word
 * happens to stand next to it. Uses the same {@link matchBookPrefix} and
 * {@link buildLinkTarget} {@link resolveTarget}'s own direct branch does, so
 * a reference resolves to the identical target string no matter which of
 * the two ever finds it.
 *
 * @returns `undefined` when no real, resolvable reference remains anywhere
 *   in `text` from `from` onward — an out-of-canon book name, a chapter with
 *   no verse ({@link EMBEDDED_REFERENCE_SUFFIX}), or plain prose that never
 *   names a real book at all, are all left as ordinary, unlinked text
 *   rather than guessed at.
 */
function findNextEmbeddedReference(
  text: string,
  from: number,
  canonBookIds: ReadonlySet<string> | undefined,
): EmbeddedReferenceMatch | undefined {
  const { candidates } = registry();

  for (let position = from; position < text.length; position++) {
    if (isWordCharacter(text[position - 1])) continue;

    const direct = matchBookPrefix(text.slice(position), candidates);
    if (direct === undefined) continue;
    if (canonBookIds !== undefined && !canonBookIds.has(direct.id)) continue;

    const suffixMatch = EMBEDDED_REFERENCE_SUFFIX.exec(direct.rest);
    if (suffixMatch === null) continue;

    const prefixLength = text.length - position - direct.rest.length;
    const raw = text.slice(position, position + prefixLength + suffixMatch[0].length);
    const { target } = buildLinkTarget(direct.id, suffixMatch[0]);
    return { raw, start: position, node: withDisplay(target, raw) };
  }

  return undefined;
}

/**
 * Splits every real, fully-qualified reference out of `text`, left to
 * right, replacing each with its own resolved `bibleLink` node — the same
 * alternating-array shape `imports/webus2020/divineNameCasing.ts`'s
 * `splitDivineNameCasing` already established for a closed phrase table,
 * applied here to a registry-validated reference instead of a literal
 * string. Two references found back to back (Matthew 27:35's real "[see
 * Psalms 22:18 and John 19:24]", John 8:11's real "NU includes John
 * 7:53–John 8:11") both link independently; whatever text joins them —
 * "and", an en dash, nothing at all — is left exactly as it was, since each
 * reference is found and resolved on its own, with no chaining rule needed
 * to reach the second one.
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
function splitEmbeddedReferences(
  text: string,
  canonBookIds: ReadonlySet<string> | undefined,
): string | (string | ContentBibleLink)[] {
  const segments: (string | ContentBibleLink)[] = [];
  let cursor = 0;

  let match = findNextEmbeddedReference(text, 0, canonBookIds);
  while (match !== undefined) {
    if (match.start > cursor) segments.push(text.slice(cursor, match.start));
    segments.push(match.node);
    cursor = match.start + match.raw.length;
    match = findNextEmbeddedReference(text, cursor, canonBookIds);
  }

  if (segments.length === 0) return text;
  if (cursor < text.length) segments.push(text.slice(cursor));
  return segments;
}

/**
 * Finding 9's own detection pass — redesigned in Phase 15 after the user's
 * own correction (see this module's own header doc comment): finds every
 * real, fully-qualified reference sitting inside an already-built footnote
 * body and replaces each with a real `bibleLink` node the same way an
 * explicit `\x`/`\+xt` span already becomes one, reusing {@link
 * resolveTarget}'s own book-registry-and-grammar validation ({@link
 * findNextEmbeddedReference} calls the same {@link matchBookPrefix} and
 * {@link buildLinkTarget} `resolveTarget`'s own direct branch does) as the
 * whole safety net against a false positive: a book name has to be real, in
 * canon, and followed by a real chapter *and* verse before this ever links
 * anything — no directive cue word required, and none checked.
 *
 * Only ever meant to run on a non-`xrf` footnote body (`usfm/footnotes.ts`):
 * a body that is *nothing but* references already takes the {@link
 * buildReferenceOnlyContent} path instead. This function's job is the
 * opposite shape — a reference that merely *sits inside* a larger run of
 * ordinary prose, anywhere in it, not only right after a particular word.
 *
 * **Why no cue word is required any more.** Phase 14's first version of
 * this function required a "See "/"Compare " cue immediately before the
 * reference, treating the cue as the primary defense against a false link.
 * Reviewing the six real 66-canon verses that gate missed — Psalm 8:5 →
 * Hebrews 2:7 ("in"), Mark 16:9 → Mark 16:9-20 ("regard"), John 3:3 → John
 * 3:7 ("here and in"), John 8:11 → John 7:53 and John 8:11 ("includes"),
 * Romans 14:26 → Romans 16:24 ("after"), Romans 16:25 → Romans 14:24-26
 * ("places") — showed the cue word was never doing the real safety work: a
 * fully self-naming reference is unambiguous because it names its own book,
 * not because of what word happens to sit next to it. Removing the cue
 * requirement and scanning the whole body for any real, registry-resolvable
 * reference fixes all six, plus a handful more the cue-word gate had missed
 * for the identical reason (2 Maccabees 4:21's real "See also 2 Maccabees
 * 3:5," where "also" broke the old adjacency check; 1 Samuel 27:8's real
 * "Compare Girzites (or Gizrites), 1 Samuel 27:8," where a parenthetical
 * broke it) and links Proverbs 31:10-31's and three real 1 Esdras verses'
 * own bare, cue-less self-references, all of which upstream `HEAD` itself
 * either already links (Proverbs 31:10-31) or has no baseline to disagree
 * with (1 Esdras).
 *
 * **Why a chapter-only mention still never links.** Removing the cue-word
 * gate does not mean every fully-qualified reference-shaped run links — one
 * real, corpus-wide-evidenced exclusion remains, now carried by {@link
 * EMBEDDED_REFERENCE_SUFFIX} itself rather than by this function: an
 * explicit verse is required, because Psalm 34:1, 111:1, and 112:1's own
 * real, self-referential acrostic notes ("Psalm 34 is an acrostic poem...")
 * are genuine, registry-resolvable, otherwise-unremarkable references that
 * upstream `HEAD` itself never links. See {@link EMBEDDED_REFERENCE_SUFFIX}'s
 * own doc comment for the full evidence (zero exceptions across 330 real,
 * distinct, upstream-committed `bibleLink` targets).
 *
 * **What still never links, and why.** A bare `"C:V"`-shaped continuation
 * with no book name of its own (1 Maccabees 3:38's real "See 1 Maccabees
 * 3:38; 10:10, etc." links only "1 Maccabees 3:38," never the bare "10:10"
 * that follows) is never found by this scan at all, for the same reason it
 * never was: {@link matchBookPrefix} only ever matches a *named* book, so a
 * reference that does not name its own book is simply invisible to this
 * function — exactly the boundary the user's own correction drew: this
 * mechanism is trusted for a reference unambiguous by its own name, and no
 * further. A bare continuation is genuinely ambiguous without an anchor to
 * whichever book was named earlier, and extending this function to resolve
 * that ambiguity (the way {@link resolveTargetList} does for an
 * already-isolated `\xt` target's own bare continuation) is a separate,
 * larger design question this phase's own evidence does not force
 * answering.
 *
 * @param content - A footnote body's own already-built, non-`xrf` content —
 *   a bare string, or an array that may contain one. An already-tagged node
 *   (e.g. an `\fq` italic span) is left untouched, since a real reference
 *   has never been observed sitting inside one.
 * @param canonBookIds - See {@link resolveTarget}.
 */
export function linkEmbeddedReferences(content: Content, canonBookIds?: ReadonlySet<string>): Content {
  if (typeof content === "string") return splitEmbeddedReferences(content, canonBookIds);

  if (Array.isArray(content)) {
    const rebuilt: Content[] = [];
    for (const item of content) {
      if (typeof item !== "string") {
        rebuilt.push(item);
        continue;
      }
      const split = splitEmbeddedReferences(item, canonBookIds);
      if (Array.isArray(split)) rebuilt.push(...split);
      else rebuilt.push(split);
    }
    return rebuilt.length === 1 ? rebuilt[0] : rebuilt;
  }

  return content;
}
