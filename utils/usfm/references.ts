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
 * itself never does either — see {@link EMBEDDED_REFERENCE_SUFFIX}'s own
 * doc comment for why.
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
 * The regex source both {@link REFERENCE_SUFFIX} (a full match, for an
 * already-isolated `\xt`/`\f`-list target) and {@link
 * EMBEDDED_REFERENCE_SUFFIX} (a greedy *prefix* match, for the
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
 * guarantee. 2 Maccabees 5:13's real "...see Judges 11:3, 2 Samuel 10:6,
 * and compare..." has a bare comma joining two *different* full
 * references, not one target's own verse list — a greedy, unguarded
 * comma-list extension would wrongly swallow "2 Samuel"'s own leading "2"
 * as if it were a second verse of Judges 11, producing the nonsense target
 * "Judges 11:3, 2". The lookahead stops the comma-list extension the
 * moment what follows a comma-led digit group is itself a capitalized word
 * — the shape a new book name, not a bare verse number, actually has.
 *
 * @param requireVerse - Narrows the embedded-reference scan alone: when
 *   `true`, a chapter with no verse never matches at all. See {@link
 *   EMBEDDED_REFERENCE_SUFFIX}'s own doc comment for why. {@link
 *   REFERENCE_SUFFIX} keeps calling this with the default `false`: an
 *   explicit `\xt`/`\+xt` marker is already unambiguous by construction
 *   regardless of whether it happens to name a verse, so nothing forces the
 *   distinction to matter there.
 */
function referenceSuffixPattern(requireVerse = false): string {
  const chapterAndVerse = requireVerse ? "\\d+:\\d+" : "\\d+(?::\\d+)?";
  return `${chapterAndVerse}(?:[${DASH_CLASS}]\\d+(?::\\d+)?)?(?:,\\s?\\d+(?:[${DASH_CLASS}]\\d+)?)*(?:\\s(?:LXX|MT|TR|NU))?(?!\\s?[A-Z])`;
}

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
const REFERENCE_SUFFIX = new RegExp(`^${referenceSuffixPattern()}$`);

/**
 * {@link referenceSuffixPattern}'s own grammar, anchored only at the start
 * and with an explicit verse required — the longest valid, verse-specific
 * reference-shaped prefix of whatever text follows a matched book name, not
 * a requirement that the *entire* remaining text be a reference and nothing
 * else. The embedded-reference scan ({@link findNextEmbeddedReference})
 * needs both halves of this:
 *
 * - **Prefix**, because real footnote prose almost always has real text
 *   right after the reference itself — a closing parenthesis, a
 *   semicolon-joined "etc.", the rest of the sentence — so this consumes as
 *   much of a valid reference as is really there and stops, leaving
 *   whatever follows as ordinary prose untouched.
 * - **Verse required**, because a bare chapter-only mention is a real
 *   false-positive risk that book-name-plus-canon validation alone does not
 *   catch: a chapter number resolves exactly as validly as a chapter:verse
 *   pair does, but WEB's own editorial convention never links one. Psalm
 *   34:1's own real, self-referential acrostic note ("Psalm 34 is an
 *   acrostic poem, with each verse starting with a letter of the
 *   alphabet...") names a real, registry-resolvable reference to the very
 *   passage it sits inside — structurally identical to Proverbs 31:10-31's
 *   own self-referential acrostic note, which upstream `HEAD` *does* link,
 *   except that Proverbs 31:10-31 names a specific verse and Psalm 34 names
 *   only a chapter. That is the line the corpus draws, so this is where the
 *   scan draws it too.
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
 * the book-name override and verse-list comma spacing — the one place
 * either rule is applied, shared by {@link resolveTarget}'s own
 * direct-book-name branch and {@link findNextEmbeddedReference}, so a
 * reference resolves to the identical target string regardless of which of
 * the two ever finds it.
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
  /** The exact raw text consumed — the book name plus its own resolved, verse-specific suffix, nothing more. */
  readonly raw: string;
  /** `raw`'s own start position in the text this was found in. */
  readonly start: number;
  /** The resolved `bibleLink` node. */
  readonly node: ContentBibleLink;
}

/**
 * Finds the next real, fully-qualified, registry-resolvable reference in
 * `text` starting at or after `from`: a book name (canon-restricted the
 * same way {@link resolveTarget} is) immediately followed by an explicit
 * chapter *and* verse ({@link EMBEDDED_REFERENCE_SUFFIX}), found *anywhere*
 * in the text rather than only right after a lead-in word — see this
 * module's own header doc comment for why no lead-in word is required.
 *
 * Uses the same {@link matchBookPrefix} and {@link buildLinkTarget} that
 * {@link resolveTarget}'s own direct branch does, so a reference resolves to
 * the identical target string no matter which of the two ever finds it.
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
 * Finds every real, fully-qualified reference sitting inside an
 * already-built footnote body and replaces each with a real `bibleLink`
 * node the same way an explicit `\x`/`\+xt` span already becomes one,
 * reusing {@link resolveTarget}'s own book-registry-and-grammar validation
 * ({@link findNextEmbeddedReference} calls the same {@link matchBookPrefix}
 * and {@link buildLinkTarget} that `resolveTarget`'s own direct branch
 * does) as the whole safety net against a false positive: a book name has
 * to be real, in canon, and followed by a real chapter *and* verse before
 * this ever links anything. No lead-in word is required or checked — see
 * this module's own header doc comment for why a self-naming reference
 * needs none. The one shape that still never links is a chapter with no
 * verse; see {@link EMBEDDED_REFERENCE_SUFFIX}'s own doc comment for why.
 *
 * Only ever meant to run on a non-`xrf` footnote body (`usfm/footnotes.ts`):
 * a body that is *nothing but* references already takes the {@link
 * buildReferenceOnlyContent} path instead. This function's job is the
 * opposite shape — a reference that merely *sits inside* a larger run of
 * ordinary prose, anywhere in it, not only right after a particular word.
 *
 * A bare `"C:V"`-shaped continuation with no book name of its own (1
 * Maccabees 3:38's real "See 1 Maccabees 3:38; 10:10, etc." links only "1
 * Maccabees 3:38," never the bare "10:10" that follows) is never found by
 * this scan: {@link matchBookPrefix} only ever matches a *named* book, so a
 * reference that does not name its own book is simply invisible to this
 * function. A bare continuation is genuinely ambiguous without an anchor to
 * whichever book was named earlier; resolving that ambiguity the way
 * {@link resolveTargetList} does for an already-isolated `\xt` target's own
 * bare continuation is a separate, larger question this function does not
 * attempt.
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
