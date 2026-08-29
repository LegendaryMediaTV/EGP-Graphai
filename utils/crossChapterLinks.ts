/**
 * Whether a `bibleLink` target spans two different chapters of the same
 * book — a reference resolves inside neither chapter if so, so the
 * convention is to split it into two chapter-scoped links joined by a
 * literal en dash. Checked here across **any** version this repo carries.
 *
 * `utils/` already holds `validate.ts` and `exportContent.ts`, the other
 * tools that walk every version's data — this module joins them as the
 * version-agnostic owner of this one rule: dash-agnostic detection (a
 * target may use an en dash, em dash, or ASCII hyphen), a chapter-length
 * index built from each version's own verse records (versification can
 * differ between translations, so no shared or borrowed table), and
 * book-name resolution restricted to the version being checked.
 *
 * Two measured facts shaped the design:
 *
 * - **Detection must accept the whole dash class, not only the en dash the
 *   convention emits.** A real target in this repo uses an em dash instead
 *   (see {@link DASH_CLASS}) — an en-dash-only detector would report a false
 *   all-clear on it.
 * - **Chapter length must come from each version's own verse records, never
 *   a shared or borrowed table.** Chapters disagree on last verse between
 *   versions (e.g. `ROM 14` ends at 23 in ASV1901 but 26 in WEBUS2020) — a
 *   table built from one version and applied to another would silently
 *   mis-split a range in some of them.
 *
 * A `bibleLink` naming a book outside a version's own canon (e.g. any name
 * absent from BYZ2018's NT-only canon) is reported as unresolvable, never
 * thrown — see {@link classifyBibleLink} for why.
 *
 * This module also owns a second, related check: whether a bibleLink's own
 * target stops short of the range its display override names (see
 * {@link completeTruncatedRange}). It belongs here for the same three
 * reasons as the cross-chapter check above — the target grammar, the
 * per-version chapter-length index, and book resolution
 * are already this module's business — and telling a genuine truncation
 * apart from a legitimate whole-chapter target needs this module's own
 * per-version chapter-length answer, not a second copy of it. A truncation
 * whose display crosses a chapter boundary is declined here rather than
 * reconstructed, since completing it would produce exactly the
 * crossChapterRange shape the split machinery above exists to take apart.
 *
 * A third, related check owned here: whether a bibleLink's own target
 * resolves to a verse the version actually carries at all (see
 * {@link findUnresolvableTarget}) — a wrong link is worse than a missing
 * one, but a target that reads correctly until it is clicked is worse
 * still. Unlike the two checks above, this one has a real, general fixer:
 * an unresolvable target loses its `bibleLink` wrapper and keeps whatever it
 * displayed (see {@link unlinkUnresolvableTargetsInContent}), which is
 * rendering-neutral by construction because that is already what
 * `exportContent.ts` renders for that shape.
 *
 * Public surface: {@link findCrossChapterLinks} (the whole-version sweep),
 * {@link classifyBibleLink} (the single-link entry point it is built on, also
 * directly callable — "callers pass a version id and a link, and get back
 * findings"), {@link splitCrossChapterLink}/{@link
 * splitCrossChapterLinksInContent}/{@link fixCrossChapterLinks} (the fix),
 * the {@link CrossChapterFinding} type, and their truncated-range
 * counterparts — {@link findTruncatedRanges}, {@link completeTruncatedRange}
 * (the single-link entry point, directly callable the same way
 * `classifyBibleLink` is), {@link reconstructTruncatedRangesInContent} (the
 * fix), and the {@link TruncatedRangeFinding}/{@link TruncatedRangeResult}
 * types — plus their unresolvable-target counterparts, {@link
 * findUnresolvableTargets}, {@link findUnresolvableTarget} (the single-link
 * entry point), {@link unlinkUnresolvableTargetsInContent} (the fix), and
 * the {@link UnresolvableTargetFinding}/{@link UnresolvableTargetResult}
 * types. Everything else — the dash-class regex, the endpoint grammar, the
 * display-range grammar, the per-version chapter-length index, the
 * per-version verse-existence index, the per-version book-alias index — is
 * this module's own business, never a caller's.
 */

import * as fs from "fs";
import * as path from "path";
import Content, { ContentBibleLink } from "../types/Content";
import VerseSchema from "../types/VerseSchema";

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

const BIBLE_VERSIONS_DIR = path.resolve(__dirname, "../bible-versions");
const BIBLE_BOOKS_FILE = path.resolve(__dirname, "../bible-books/bible-books.json");

// ---------------------------------------------------------------------------
// Dash-agnostic endpoint grammar
// ---------------------------------------------------------------------------

/**
 * Every dash character this repo's `bibleLink` targets are known to use —
 * U+2010–U+2015 (hyphen through horizontal bar), U+2212 (minus sign), and
 * the ASCII hyphen. The convention emits only U+2013 (en dash), but
 * detection stays broad rather than assuming a source always agrees with the
 * convention: the real WEBUS2020 Hebrews 11:34 target once used an em dash
 * instead, and a future import could just as easily reintroduce one.
 */
const DASH_CLASS = "\\u2010-\\u2015\\u2212-";
const DASH = new RegExp(`[${DASH_CLASS}]`);

/**
 * One endpoint's grammar: a book name (anything, including digits and
 * spaces — `"1 Kings"`, `"Song of Solomon"`), then a chapter, then optionally
 * a verse. Anchored to the whole remaining text so trailing content the
 * grammar does not describe (a siglum like `" LXX"`) fails to match rather
 * than being silently accepted.
 */
const ENDPOINT = /^(.+?)\s+(\d+)(?::(\d+))?$/;

/** One endpoint, parsed from {@link ENDPOINT}'s three capture groups. */
interface ParsedEndpoint {
  /** The book name exactly as written, not yet resolved to a repo book id. */
  bookName: string;
  /** The chapter number named. */
  chapter: number;
  /** The verse number named, or `null` when the endpoint named only a chapter. */
  verse: number | null;
}

/** Parse one endpoint's text, or `null` when it does not match `Book C[:V]` at all. */
function parseEndpoint(text: string): ParsedEndpoint | null {
  const match = ENDPOINT.exec(text.trim());
  if (!match) return null;
  const [, bookName, chapter, verse] = match;
  return { bookName, chapter: Number(chapter), verse: verse === undefined ? null : Number(verse) };
}

/**
 * Which of this repo's `bibleLink` target shapes a string matches.
 *
 * `crossChapterRange` and `wholeChapterRange` are both findings this audit
 * splits — the two ends name a verse in `crossChapterRange` (e.g.
 * `"2 Kings 6:31–7:20"`), and name only a chapter in `wholeChapterRange`
 * (e.g. `"Romans 1–11"`); either way, a target spanning two chapters resolves
 * inside neither, so both get cut into two chapter-scoped halves.
 * `mergedTarget` is a same-book-and-chapter comma-joined
 * target (e.g. `"Isaiah 66:10, 13"`); a comma is that merge's unambiguous
 * signature (a plain target never contains one), and a merge is by
 * construction confined to one chapter, so it is excluded before the dash
 * grammar is even attempted rather than risking the comma being misread as a
 * second endpoint. `unparsed` is anything the grammar above does not
 * describe at all (`"Deuteronomy 32:43 LXX"`) — reported, never thrown.
 */
type TargetShape = "singleChapter" | "crossChapterRange" | "wholeChapterRange" | "mergedTarget" | "unparsed";

/**
 * One `bibleLink` target's classification for one version — shape, resolved
 * location, and (when derivable) the first chapter's actual last verse from
 * that version's own data. Not exported: a caller reaches this only through
 * {@link classifyBibleLink} or {@link findCrossChapterLinks}, never by
 * constructing or naming the shape itself.
 */
interface BibleLinkClassification {
  /** Which target shape this result was classified as. */
  shape: TargetShape;
  /** The book name exactly as written, or `null` when the target's grammar did not resolve far enough to identify one (`unparsed`, `mergedTarget`). */
  bookName: string | null;
  /** The repo book id `bookName` resolves to within this version's own canon, or `null` when unresolvable or not attempted. */
  book: string | null;
  /** The first endpoint's chapter, or `null` when the target's grammar did not parse at all. */
  fromChapter: number | null;
  /** The first endpoint's verse, or `null` when the first endpoint named only a chapter, or the target did not parse at all. */
  fromVerse: number | null;
  /** The second endpoint's chapter, when the target names one — `null` when there is no second endpoint, or the target did not parse at all. */
  toChapter: number | null;
  /** The second endpoint's verse, when the second endpoint names one — `null` when it names only a chapter, there is no second endpoint, or the target did not parse at all. */
  toVerse: number | null;
  /** The dash character actually found, or `null` when the target names no range at all. */
  dash: string | null;
  /** `fromChapter`'s last verse, read from this version's own verse records — `null` when `book` did not resolve or this version does not carry that chapter. */
  firstChapterLastVerse: number | null;
}

const UNRESOLVED: BibleLinkClassification = {
  shape: "unparsed",
  bookName: null,
  book: null,
  fromChapter: null,
  fromVerse: null,
  toChapter: null,
  toVerse: null,
  dash: null,
  firstChapterLastVerse: null,
};

/**
 * Classify one `bibleLink` target for one version — the single-link entry
 * point every finding is built from, and directly callable on its own (this
 * is how the per-version chapter-length divergence and book-resolution
 * behavior below are exercised: the same target, a different `versionId`).
 *
 * Never throws. A target this repo's grammar does not describe, or that
 * names a book outside `versionId`'s own canon, comes back reported in the
 * result rather than raising — a wrong link is worse than a missing one, but
 * an unverifiable shape is not a crash.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"WEBUS2020"`.
 * @param target - A `bibleLink` target string, exactly as written.
 */
export function classifyBibleLink(versionId: string, target: string): BibleLinkClassification {
  // A comma-merged target is excluded before the dash grammar is even
  // attempted — see the `mergedTarget` case in TargetShape's doc comment.
  if (target.includes(",")) return { ...UNRESOLVED, shape: "mergedTarget" };

  const dashMatch = DASH.exec(target);
  const firstText = dashMatch ? target.slice(0, dashMatch.index) : target;
  const secondText = dashMatch ? target.slice(dashMatch.index + 1) : undefined;

  const from = parseEndpoint(firstText);
  if (!from) return UNRESOLVED; // does not match `Book C[:V]` at all

  const book = resolveBookName(versionId, from.bookName);
  const firstChapterLastVerse = book === null ? null : (lastVerseOf(versionId, book, from.chapter) ?? null);
  const base = { bookName: from.bookName, book, fromChapter: from.chapter, fromVerse: from.verse, firstChapterLastVerse };

  if (secondText === undefined) {
    return { ...UNRESOLVED, ...base, shape: "singleChapter", dash: null };
  }
  const dash = dashMatch![0];

  // Three second-endpoint grammars, tried in order, never throwing: `C2:V2`
  // (this repo's cross-chapter-range shorthand), a bare number (a verse in
  // `fromChapter` when `from` already named one, otherwise a whole chapter),
  // or a full `Book C[:V]` endpoint (unmeasured in this corpus, but not
  // assumed absent).
  const shorthand = /^(\d+):(\d+)$/.exec(secondText);
  if (shorthand) {
    if (from.verse === null) return { ...UNRESOLVED, ...base, shape: "unparsed", dash };
    const toChapter = Number(shorthand[1]);
    const toVerse = Number(shorthand[2]);
    return { ...UNRESOLVED, ...base, shape: toChapter === from.chapter ? "singleChapter" : "crossChapterRange", toChapter, toVerse, dash };
  }

  if (/^\d+$/.test(secondText)) {
    const bare = Number(secondText);
    if (from.verse === null) return { ...UNRESOLVED, ...base, shape: "wholeChapterRange", toChapter: bare, dash };
    return { ...UNRESOLVED, ...base, shape: "singleChapter", toChapter: from.chapter, toVerse: bare, dash };
  }

  const to = parseEndpoint(secondText);
  if (!to) return { ...UNRESOLVED, ...base, shape: "unparsed", dash };
  return { ...UNRESOLVED, ...base, shape: to.verse === null ? "wholeChapterRange" : "crossChapterRange", toChapter: to.chapter, toVerse: to.verse, dash };
}

// ---------------------------------------------------------------------------
// Per-version chapter lengths and book resolution
// ---------------------------------------------------------------------------

/** One entry of `bible-books/bible-books.json` — the repo-wide book registry, apocrypha included. */
interface BibleBookEntry {
  /** Repo book id, e.g. `"GEN"`. */
  _id: string;
  /** The book's full name, e.g. `"Genesis"`. */
  name: string;
  /** Alternate names or abbreviations this book is also known by, if any. */
  alt?: string[];
}

let bibleBooksCache: readonly BibleBookEntry[] | undefined;

/** The repo-wide book registry, read once and reused for every version's own alias index. */
function bibleBooks(): readonly BibleBookEntry[] {
  if (!bibleBooksCache) bibleBooksCache = JSON.parse(fs.readFileSync(BIBLE_BOOKS_FILE, "utf-8"));
  return bibleBooksCache!;
}

/** Fold a name to its lookup form, so `"2 Kings"`, `"2Kg"` and `"2KG"` all meet. */
function foldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** One book file's own verse records, read fresh from disk — the granularity {@link fixCrossChapterLinks} writes back at. */
interface VersionBookFile {
  /** Filename under `bible-versions/<versionId>/`, e.g. `"58-HEB.json"`. */
  file: string;
  /** The book's verse records, as read from `file`. */
  records: VerseSchema[];
}

/**
 * Every book file of one version, read fresh from its own `bible-versions/`
 * directory — the one place either an index build, a content walk, or a
 * write-back needs to know how that data is laid out on disk (one file per
 * book, `_version.json` excluded).
 *
 * `versionId` is normally a short `bible-versions/` directory name, resolved
 * under {@link BIBLE_VERSIONS_DIR} — but every other function in this module
 * treats it as opaque and passes it straight through, which makes this the
 * one seam tests use: an **absolute path** (`path.isAbsolute` is never true
 * for a real id) points this at a synthetic fixture directory instead of the
 * real corpus, with no other function needing to change.
 *
 * @throws if `versionId` names no directory under `bible-versions/` (or, for
 *   an absolute path, no such directory at all) — a caller asking about a
 *   version that does not exist is a bug in the caller, not a shape to
 *   report gracefully.
 */
function readVersionBookFiles(versionId: string): readonly VersionBookFile[] {
  const dir = path.isAbsolute(versionId) ? versionId : path.join(BIBLE_VERSIONS_DIR, versionId);
  if (!fs.existsSync(dir)) {
    throw new Error(`No bible-versions/ directory for "${versionId}"`);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_version.json");
  return files.map((file) => ({ file, records: JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) }));
}

/** Every verse record of one version, flattened across its book files — the granularity an index build or a read-only content walk needs. */
function readVersionRecords(versionId: string): readonly VerseSchema[] {
  return readVersionBookFiles(versionId).flatMap((book) => book.records);
}

/** One version's own chapter-length index and book-alias index, built once from its own verse records and cached. */
interface VersionIndex {
  /** `"BOOK C"` -> last verse number, the max recorded for that book+chapter in this version's own files. */
  lastVerseByChapter: ReadonlyMap<string, number>;
  /** `"BOOK C"` -> every verse number actually recorded for that book+chapter — distinguishes a genuine gap (an omitted textual-variant verse inside an otherwise-ordinary chapter) from a number past the chapter's own last verse, which {@link lastVerseByChapter} alone cannot: a chapter's own last verse being 50 does not mean every verse 1–50 was recorded. */
  versesInChapter: ReadonlyMap<string, ReadonlySet<number>>;
  /** Repo book id -> the highest chapter number recorded anywhere in this version's own data for that book — used only to report a real chapter count in an unresolvable-target finding's own message, never for resolvability itself ({@link lastVerseByChapter} already answers whether a given chapter exists at all). */
  lastChapterByBook: ReadonlyMap<string, number>;
  /** Folded name -> repo book id, restricted to books this version actually carries. */
  bookIdByFoldedName: ReadonlyMap<string, string>;
}

const versionIndexCache = new Map<string, VersionIndex>();

/**
 * Build (or return the cached) index for one version — read once, corpus-wide
 * for that version, and reused for every subsequent lookup: the max verse
 * recorded for a book+chapter, every verse actually recorded for a
 * book+chapter, the highest chapter recorded for a book, combined with a
 * book-alias index restricted to that version's own canon (the restriction
 * matters: `bible-books.json` also carries apocryphal books absent from every
 * version's canon here, and indexing the whole registry unrestricted would
 * let one of those resolve where it should not).
 */
function indexFor(versionId: string): VersionIndex {
  const cached = versionIndexCache.get(versionId);
  if (cached) return cached;

  const lastVerseByChapter = new Map<string, number>();
  const versesInChapter = new Map<string, Set<number>>();
  const lastChapterByBook = new Map<string, number>();
  const canon = new Set<string>();
  for (const record of readVersionRecords(versionId)) {
    canon.add(record.book);
    const key = `${record.book} ${record.chapter}`;
    if (record.verse > (lastVerseByChapter.get(key) ?? 0)) lastVerseByChapter.set(key, record.verse);
    if (!versesInChapter.has(key)) versesInChapter.set(key, new Set());
    versesInChapter.get(key)!.add(record.verse);
    if (record.chapter > (lastChapterByBook.get(record.book) ?? 0)) lastChapterByBook.set(record.book, record.chapter);
  }

  const bookIdByFoldedName = new Map<string, string>();
  for (const book of bibleBooks()) {
    if (!canon.has(book._id)) continue;
    for (const name of [book._id, book.name, ...(book.alt ?? [])]) {
      bookIdByFoldedName.set(foldName(name), book._id);
    }
  }

  const index: VersionIndex = { lastVerseByChapter, versesInChapter, lastChapterByBook, bookIdByFoldedName };
  versionIndexCache.set(versionId, index);
  return index;
}

/**
 * Resolve a book name to a repo book id, restricted to `versionId`'s own
 * canon — never the whole `bible-books.json` registry, and never another
 * version's canon.
 *
 * @returns The repo book id, or `null` when this version carries no such
 *   book (e.g. `"1 Esdras"`, absent from every version's canon here, or any
 *   name valid elsewhere but outside BYZ2018's NT-only canon). Never throws.
 */
function resolveBookName(versionId: string, name: string): string | null {
  return indexFor(versionId).bookIdByFoldedName.get(foldName(name)) ?? null;
}

/**
 * The last verse number of one chapter, read from `versionId`'s own verse
 * records — never a shared or borrowed table (chapters disagree on last
 * verse between versions).
 *
 * @returns The last verse number, or `undefined` when this version's own
 *   data carries no such chapter at all (e.g. any Old Testament book+chapter
 *   asked of BYZ2018, which is NT-only) — never defaulted to 0.
 */
function lastVerseOf(versionId: string, book: string, chapter: number): number | undefined {
  return indexFor(versionId).lastVerseByChapter.get(`${book} ${chapter}`);
}

/**
 * Whether `versionId`'s own data carries a specific verse — never a shared or
 * borrowed table, same reasoning as {@link lastVerseOf}. Unlike
 * {@link lastVerseOf}, this distinguishes a genuine gap (an omitted
 * textual-variant verse inside an otherwise-ordinary chapter) from an
 * out-of-range number — the real ASV1901 case {@link findUnresolvableTarget}
 * exists for: Mark 9's own last recorded verse is 50, but verse 46 itself was
 * never recorded (the "omitted by the best ancient authorities" variant), so
 * a check that only compared against the chapter's own last verse would miss
 * it.
 */
function verseExistsIn(versionId: string, book: string, chapter: number, verse: number): boolean {
  return indexFor(versionId).versesInChapter.get(`${book} ${chapter}`)?.has(verse) ?? false;
}

/**
 * The highest chapter number recorded anywhere in `versionId`'s own data for
 * `book` — read from this version's own records, never a shared table, for
 * the same reason {@link lastVerseOf} is. Used only to report a real chapter
 * count in an unresolvable-target finding's own message (see
 * {@link formatUnresolvableTargetFinding}), not for resolvability itself —
 * {@link lastVerseOf} already answers whether the version carries a given
 * chapter number at all.
 */
function lastChapterOf(versionId: string, book: string): number | undefined {
  return indexFor(versionId).lastChapterByBook.get(book);
}

// ---------------------------------------------------------------------------
// The whole-version sweep
// ---------------------------------------------------------------------------

/** Which part of a verse's content tree a `bibleLink` was found in. */
type Zone = "verse" | "heading" | "subtitle";

/**
 * One genuine cross-chapter-range finding — a `bibleLink` whose target names
 * a verse in one chapter and a verse in a different chapter of the same
 * book, the one shape this repo's cross-chapter convention requires to be
 * split rather than left as-is.
 */
export interface CrossChapterFinding {
  /** Repo book id the target's range names, resolved within this version's own canon — `null` on the (unmeasured, never yet observed) chance a genuine cross-chapter shape names a book this version does not carry. */
  book: string | null;
  /** Repo book id of the verse this `bibleLink` is attached to — not always the same as `book` (WEBUS2020's Hebrews 11:34 links to 2 Kings). */
  atBook: string;
  /** Chapter of the verse this `bibleLink` is attached to. */
  atChapter: number;
  /** Verse number this `bibleLink` is attached to. */
  atVerse: number;
  /** The enclosing footnote's type (`"stu"`, `"xrf"`, …), or `null` when the `bibleLink` sits directly in content with no footnote wrapper. */
  footnoteType: string | null;
  /** Which part of the verse's content tree this finding was found in. */
  zone: Zone;
  /** The target exactly as written. */
  target: string;
  /** The display override, when it carries one and it is a plain string. */
  display?: string;
  /** The dash character actually joining the range — never assumed to be the convention's en dash. */
  dash: string;
  /** The range's first (starting) chapter. */
  fromChapter: number;
  /** The range's second (ending) chapter. */
  toChapter: number;
  /** `fromChapter`'s last verse, read from this version's own records — `null` only when this version's own data does not carry that chapter (never expected for a real finding, but not assumed). */
  firstChapterLastVerse: number | null;
}

/**
 * Render one finding as this report's one-line format.
 *
 * Exported so `validate.ts` can render the same line inline in its own
 * report instead of maintaining a second copy of this formatting.
 */
export function formatCrossChapterFinding(finding: CrossChapterFinding): string {
  return (
    `${finding.atBook} ${finding.atChapter}:${finding.atVerse} [${finding.footnoteType ?? "(none)"}/${finding.zone}]: ` +
    `"${finding.target}" spans ${finding.book ?? finding.target} ${finding.fromChapter}–${finding.toChapter} — unsplit`
  );
}

/**
 * Walk one verse's content tree, visiting every `bibleLink` node regardless
 * of zone or enclosing footnote type — the audit must count *every*
 * `bibleLink`, not only those inside an `xrf` footnote.
 *
 * Keeps walking after a `bibleLink` is found rather than stopping the
 * branch — except into the `bibleLink`'s own `content` override, which is
 * display text, not a footnote host.
 *
 * @param content - A verse's `content`, or any subtree of it.
 * @param zone - Which part of the tree this call is inside.
 * @param footnoteType - The nearest enclosing footnote's type, or `null`.
 * @param visit - Called once per `bibleLink` node found, in document order.
 */
function walkContent(
  content: Content,
  zone: Zone,
  footnoteType: string | null,
  visit: (link: ContentBibleLink, zone: Zone, footnoteType: string | null) => void,
): void {
  if (content === null || content === undefined || typeof content !== "object") return;
  if (Array.isArray(content)) {
    for (const item of content) walkContent(item, zone, footnoteType, visit);
    return;
  }
  if ("bibleLink" in content) {
    visit(content, zone, footnoteType);
    return;
  }
  if ("heading" in content) {
    walkContent(content.heading, "heading", footnoteType, visit);
    return;
  }
  if ("subtitle" in content) {
    walkContent(content.subtitle, "subtitle", footnoteType, visit);
    return;
  }
  if ("paragraph" in content && content.paragraph !== undefined && typeof content.paragraph !== "boolean") {
    walkContent(content.paragraph, zone, footnoteType, visit);
    return;
  }
  if ("content" in content) walkContent(content.content, zone, footnoteType, visit);
  if (content.foot) walkContent(content.foot.content, zone, content.foot.type ?? null, visit);
}

/**
 * Audit one version for `bibleLink`s spanning two chapters — every
 * `bibleLink` this version carries, classified through
 * {@link classifyBibleLink}, with both the `crossChapterRange` and
 * `wholeChapterRange` shapes collected as findings (see {@link TargetShape}
 * for why the same finding covers both).
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"WEBUS2020"`.
 * @returns `findings` (empty for a version with none) and `scanned` (every
 *   `bibleLink` node visited, so a walk that silently stops descending is
 *   caught rather than under-reporting a clean bill of health).
 */
export function findCrossChapterLinks(versionId: string): {
  findings: readonly CrossChapterFinding[];
  scanned: number;
} {
  const findings: CrossChapterFinding[] = [];
  let scanned = 0;

  for (const record of readVersionRecords(versionId)) {
    walkContent(record.content, "verse", null, (link, zone, footnoteType) => {
      scanned += 1;
      const classification = classifyBibleLink(versionId, link.bibleLink);

      if (classification.shape !== "crossChapterRange" && classification.shape !== "wholeChapterRange") return;

      findings.push({
        book: classification.book,
        atBook: record.book,
        atChapter: record.chapter,
        atVerse: record.verse,
        footnoteType,
        zone,
        target: link.bibleLink,
        ...(typeof link.content === "string" ? { display: link.content } : {}),
        dash: classification.dash as string,
        fromChapter: classification.fromChapter as number,
        toChapter: classification.toChapter as number,
        firstChapterLastVerse: classification.firstChapterLastVerse,
      });
    });
  }

  return { findings, scanned };
}

// ---------------------------------------------------------------------------
// Splitting a cross-chapter range into two chapter-scoped links
// ---------------------------------------------------------------------------

/**
 * The convention's own emitted separator — always the en dash, regardless of
 * which dash character a source target used. Detection accepts the whole
 * {@link DASH} class; emission never does — WEBUS2020's real `HEB 11:34`
 * target used an em dash, and splitting it still writes an en dash (an
 * accepted one-character normalization).
 */
const EN_DASH = "–";

/**
 * A `{bibleLink}` object, carrying a `content` override only when the display
 * text actually differs from the target.
 */
function withDisplay(target: string, display: string): ContentBibleLink {
  return display === target ? { bibleLink: target } : { bibleLink: target, content: display };
}

/**
 * Split one two-chapter-spanning `bibleLink` into its two chapter-scoped
 * halves, joined by a literal en dash, with one simplification: **Part B's
 * book name is read from the original target's own left endpoint**
 * ({@link classifyBibleLink}'s `bookName`, exactly as written) instead of
 * round-tripping through a naming table — a range never renames the book
 * partway through, so the left endpoint's own spelling is always correct for
 * both halves.
 *
 * The two halves' **display** text is never recomputed. It is read directly
 * off `link`'s own existing display (its `content` override, or the target
 * itself when there is none) and split at the very same dash the target is
 * split at, so concatenating Part A's display, the separator, and Part B's
 * display always reconstructs the original display byte-for-byte.
 *
 * The two shapes this handles carry different endpoints: `crossChapterRange`
 * (e.g. `"2 Kings 6:31–7:20"`) anchors each half on a verse — Part A gets
 * `fromChapter`'s own last verse tacked on unless it's already there, Part B
 * gets `toChapter:1` (or `toChapter:1–toVerse` when `toVerse` isn't 1).
 * `wholeChapterRange` (e.g. `"Romans 1–11"`) names no verse on either end, so
 * neither half gets one — Part A is `fromChapter` verbatim, Part B is
 * `${bookName} ${toChapter}`.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"WEBUS2020"` —
 *   Part A's chapter length and Part B's book spelling are both read from
 *   this version's own records via {@link classifyBibleLink}, never a shared
 *   table or naming table.
 * @param link - One `bibleLink` node exactly as it appears in `versionId`'s
 *   own data.
 * @returns `null` when `link.bibleLink` needs no split — anything other than
 *   {@link classifyBibleLink}'s `crossChapterRange` or `wholeChapterRange`
 *   shape, including an already-split half (`"2 Kings 6:31–33"` classifies
 *   as `singleChapter`, which is what makes re-running this idempotent).
 *   Otherwise the replacement — Part A, the literal en-dash separator, Part
 *   B — that {@link splitCrossChapterLinksInContent} splices into `link`'s
 *   place.
 * @throws if `link.content` is present but is not a plain string; if
 *   `versionId`'s own data cannot resolve the book for a target already
 *   classified as one of the two shapes above; or if either endpoint's
 *   chapter — `fromChapter` or `toChapter` — is absent from `versionId`'s own
 *   chapter-length index, for either shape. A split whose result would point
 *   at a chapter that version does not carry is refused rather than silently
 *   written.
 */
export function splitCrossChapterLink(
  versionId: string,
  link: ContentBibleLink,
): readonly [ContentBibleLink, string, ContentBibleLink] | null {
  const classification = classifyBibleLink(versionId, link.bibleLink);
  if (classification.shape !== "crossChapterRange" && classification.shape !== "wholeChapterRange") return null;

  if (link.content !== undefined && typeof link.content !== "string") {
    throw new Error(`splitCrossChapterLink: a bibleLink's content override must be a plain string: ${JSON.stringify(link)}`);
  }
  if (classification.book === null) {
    throw new Error(`splitCrossChapterLink: cannot derive ${versionId}'s book for: ${JSON.stringify(link)}`);
  }
  const display = link.content ?? link.bibleLink;

  const targetDashMatch = DASH.exec(link.bibleLink);
  const displayDashMatch = DASH.exec(display);
  if (!targetDashMatch || !displayDashMatch) {
    throw new Error(`splitCrossChapterLink: a target and its display must each carry a dash: ${JSON.stringify(link)}`);
  }
  const targetPrefix = link.bibleLink.slice(0, targetDashMatch.index); // e.g. "2 Kings 6:31" or "Romans 1"
  const displayPrefix = display.slice(0, displayDashMatch.index);
  const displayTail = display.slice(displayDashMatch.index + 1);

  const bookName = classification.bookName as string; // the left endpoint's own spelling, exactly as written — never a naming table
  const toChapter = classification.toChapter as number;

  // Both endpoints must exist in `versionId`'s own data before either shape
  // writes anything — checked once, here, rather than per-shape below, so
  // neither shape can skip an endpoint the other one checks.
  if (classification.firstChapterLastVerse === null) {
    throw new Error(`splitCrossChapterLink: cannot derive ${versionId}'s chapter length for: ${JSON.stringify(link)}`);
  }
  if (lastVerseOf(versionId, classification.book, toChapter) === undefined) {
    throw new Error(`splitCrossChapterLink: ${versionId} carries no ${bookName} ${toChapter} for: ${JSON.stringify(link)}`);
  }

  if (classification.shape === "wholeChapterRange") {
    const partA = withDisplay(targetPrefix, displayPrefix);
    const partB = withDisplay(`${bookName} ${toChapter}`, displayTail);
    return [partA, EN_DASH, partB];
  }

  const lastVerse = classification.firstChapterLastVerse;
  const fromVerse = classification.fromVerse as number;
  const partATarget = fromVerse === lastVerse ? targetPrefix : `${targetPrefix}${EN_DASH}${lastVerse}`;
  const partA = withDisplay(partATarget, displayPrefix);

  const toVerse = classification.toVerse as number;
  const partBTarget = toVerse === 1 ? `${bookName} ${toChapter}:1` : `${bookName} ${toChapter}:1${EN_DASH}${toVerse}`;
  const partB = withDisplay(partBTarget, displayTail);

  return [partA, EN_DASH, partB];
}

/**
 * Apply {@link splitCrossChapterLink} to every `bibleLink` inside one content
 * subtree, in a single walk covering verse content, headings, subtitles, and
 * every footnote type. Uses the same branch order as
 * {@link findCrossChapterLinks}'s own `walkContent` (array, `bibleLink`,
 * `heading`, `subtitle`, `paragraph`-as-content, then `content`/`foot`), so
 * the fix path finds exactly the same nodes the audit path counts — never a
 * superset or subset of them.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"WEBUS2020"`.
 * @param content - Any subtree of a verse's `content` — a bare `{bibleLink}`
 *   object, a mixed array of strings/objects, or a wrapper (`heading`,
 *   `subtitle`, a nested `content` property, a `foot`) around either.
 * @returns The subtree's replacement, with every cross-chapter `bibleLink`
 *   spliced into its two-part-plus-separator form in place, and how many
 *   splits were made (0 for a subtree with none — including one that already
 *   carries an already-split pair, since both halves classify as
 *   `singleChapter` on a second pass, which is what makes this idempotent).
 */
export function splitCrossChapterLinksInContent(versionId: string, content: Content): { content: Content; splits: number } {
  if (content === null || content === undefined || typeof content !== "object") {
    return { content, splits: 0 };
  }

  if (Array.isArray(content)) {
    const items: Content[] = [];
    let splits = 0;
    for (const item of content) {
      if (typeof item === "object" && item !== null && !Array.isArray(item) && "bibleLink" in item) {
        const split = splitCrossChapterLink(versionId, item);
        if (split) {
          items.push(...split);
          splits += 1;
          continue;
        }
      }
      const rewritten = splitCrossChapterLinksInContent(versionId, item);
      items.push(rewritten.content);
      splits += rewritten.splits;
    }
    return { content: items, splits };
  }

  if ("bibleLink" in content) {
    const split = splitCrossChapterLink(versionId, content);
    return split ? { content: [...split], splits: 1 } : { content, splits: 0 };
  }

  if ("heading" in content) {
    const rewritten = splitCrossChapterLinksInContent(versionId, content.heading);
    return { content: { ...content, heading: rewritten.content }, splits: rewritten.splits };
  }

  if ("subtitle" in content) {
    const rewritten = splitCrossChapterLinksInContent(versionId, content.subtitle);
    return { content: { ...content, subtitle: rewritten.content }, splits: rewritten.splits };
  }

  if ("paragraph" in content && content.paragraph !== undefined && typeof content.paragraph !== "boolean") {
    const rewritten = splitCrossChapterLinksInContent(versionId, content.paragraph);
    return { content: { ...content, paragraph: rewritten.content }, splits: rewritten.splits };
  }

  let result: Content = content;
  let splits = 0;
  if ("content" in content) {
    const rewritten = splitCrossChapterLinksInContent(versionId, content.content);
    result = { ...content, content: rewritten.content };
    splits += rewritten.splits;
  }
  if (content.foot) {
    const rewritten = splitCrossChapterLinksInContent(versionId, content.foot.content);
    result = { ...(result as typeof content), foot: { ...content.foot, content: rewritten.content } };
    splits += rewritten.splits;
  }
  return { content: result, splits };
}

/** One book file's verse records after every cross-chapter link inside it has been split — write these back verbatim in place of the file's current contents. */
export interface FixedBook {
  /** Filename under `bible-versions/<version>/`, e.g. `"58-HEB.json"`. */
  file: string;
  /** The book's verse records, unchanged except for the `content` of the verses that carried a split. */
  records: readonly VerseSchema[];
  /** How many cross-chapter links were split in this book. */
  splits: number;
}

/**
 * Split every cross-chapter-range `bibleLink` one version carries, book file
 * by book file.
 *
 * **Read-only itself** — it returns replacement records rather than writing
 * anything, matching {@link findCrossChapterLinks}'s own contract; its one
 * caller, `validate.ts`'s own auto-fix pass, decides whether and where to
 * write them.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"WEBUS2020"`.
 * @returns One entry per book file that actually contained a cross-chapter
 *   link — a file with none is omitted entirely, not returned with
 *   `splits: 0`, since a caller only ever wants to know what changed.
 */
export function fixCrossChapterLinks(versionId: string): readonly FixedBook[] {
  const fixed: FixedBook[] = [];
  for (const { file, records } of readVersionBookFiles(versionId)) {
    let splits = 0;
    const rewrittenRecords = records.map((record) => {
      const rewritten = splitCrossChapterLinksInContent(versionId, record.content);
      splits += rewritten.splits;
      return rewritten.splits > 0 ? { ...record, content: rewritten.content } : record;
    });
    if (splits > 0) fixed.push({ file, records: rewrittenRecords, splits });
  }
  return fixed;
}

// ---------------------------------------------------------------------------
// Truncated-range detection and reconstruction
// ---------------------------------------------------------------------------
//
// A bibleLink whose target is a single verse (or a bare chapter) while its
// own display override spells out a fuller range — e.g. target
// "Exodus 12:3", display "Ex. 12.3–20" — is truncated short of what its own
// display already says. It lives here for the same reasons the cross-chapter
// check above does (see this file's own top doc comment), and telling a
// genuine truncation apart from a legitimate whole-chapter target (the real
// ASV1901 PSA 18:1 bibleLink, "2 Samuel 22" with display "2 Sam. 22:1–51" —
// not truncated, since ASV1901's own 2 Samuel 22 really is 51 verses) needs
// this module's own per-version chapter-length answer.
//
// A cross-chapter truncation is declined rather than reconstructed here (see
// the module doc comment for why) — there's no automatic path for it, only a
// human judgment call.

/**
 * Reason {@link completeTruncatedRange} declined to complete an otherwise
 * real truncated-range finding — currently the one case this module names: a
 * display range that crosses a chapter boundary, which belongs to the
 * cross-chapter split above, not this reconstruction.
 */
export type SkipReason = "cross-chapter";

/**
 * One bibleLink's truncated-range verdict, from {@link completeTruncatedRange}
 * — carries no verse-location fields, matching {@link splitCrossChapterLink}'s
 * own shape; {@link findTruncatedRanges} is what adds location.
 */
export interface TruncatedRangeResult {
  /** Repo book id the target names, resolved within this version's own canon — `null` when unresolvable. */
  book: string | null;
  /** The display override's own text, flattened from whichever of its three real shapes it carries (a plain string, a single marked object, or a single-element array). */
  display: string;
  /** The completed target, separator U+2013 — `null` when the display range crosses a chapter boundary and this step declines to reconstruct it. */
  reconstructedTarget: string | null;
  /** Why {@link reconstructedTarget} is `null` — set exactly when it is, `null` otherwise. */
  declineReason: SkipReason | null;
}

/**
 * Flatten a bibleLink's own display override to plain text, tolerating every
 * shape this corpus's display override can take: a plain string, a single
 * object carrying `marks`, or a single-element array (typically a nested
 * `bibleLink` node of its own). Formatting is discarded; only the rendered
 * text matters for range detection.
 *
 * @returns The flattened text, or `null` when there is no override at all
 *   (`content` is `undefined`), or its shape carries no plain text to read
 *   (e.g. an array whose sole element is itself a bare `bibleLink` object
 *   with no `text` of its own).
 */
function flattenDisplayText(content: Content | undefined): string | null {
  if (content === undefined || content === null) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const joined = content.map((item) => flattenDisplayText(item) ?? "").join("");
    return joined === "" ? null : joined;
  }
  if ("text" in content && typeof content.text === "string") return content.text;
  return null;
}

/** One display range endpoint pair, read off the tail of a flattened display string. */
interface DisplayRange {
  /** The chapter named immediately before the dash. */
  chapter: number;
  /** The verse named immediately before the dash. */
  verse: number;
  /** The chapter named after the dash, when the display repeats one (a cross-chapter display, e.g. `"12.3–13.5"`) — `null` for a bare ending verse (a same-chapter display, e.g. `"12.3–20"`). */
  toChapter: number | null;
  /** The verse named after the dash. */
  toVerse: number;
}

/**
 * A display range's own grammar: `<chapter>[:.]<verse>`, a dash from the same
 * {@link DASH_CLASS} the target grammar accepts, then either a bare ending
 * verse (same chapter) or another `<chapter>[:.]<verse>` (a cross-chapter
 * display). Anchored to the end of the string, since a display carries
 * leading book-abbreviation text (`"Ex. "`, `"2 Sam. "`) this grammar makes
 * no attempt to parse — only the numbers are the signal.
 */
const DISPLAY_RANGE = new RegExp(`(\\d+)[.:](\\d+)\\s*[${DASH_CLASS}]\\s*(?:(\\d+)[.:])?(\\d+)\\s*$`);

/** Parse a flattened display string's own trailing range, or `null` when it names no range this grammar recognizes at all. */
function parseDisplayRange(display: string): DisplayRange | null {
  const match = DISPLAY_RANGE.exec(display);
  if (!match) return null;
  const [, chapter, verse, toChapter, toVerse] = match;
  return {
    chapter: Number(chapter),
    verse: Number(verse),
    toChapter: toChapter === undefined ? null : Number(toChapter),
    toVerse: Number(toVerse),
  };
}

/**
 * Decide whether one bibleLink's target is truncated short of the range its
 * own display override names — the single place both {@link
 * findTruncatedRanges} (reporting) and {@link
 * reconstructTruncatedRangesInContent} (fixing) get their answer from, so
 * neither can drift from what the other considers a finding.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"ASV1901"`.
 * @param link - One bibleLink node exactly as it appears in `versionId`'s own
 *   data.
 * @returns `null` when this node is not a finding at all: the target already
 *   carries its own range (nothing to complete), there's no display
 *   override, the display names no range, the display's own start disagrees
 *   with what the target already says, or the whole-chapter-equivalence gate
 *   holds (the target names a bare chapter and the display spells out that
 *   exact chapter's own verses 1..last, from this version's own data — the
 *   real ASV1901 PSA 18:1 shape). Otherwise the verdict: either a completed
 *   target, or a decline with its own reason.
 */
export function completeTruncatedRange(versionId: string, link: ContentBibleLink): TruncatedRangeResult | null {
  const classification = classifyBibleLink(versionId, link.bibleLink);

  // Only a target carrying no range of its own at all is a candidate.
  // classifyBibleLink's singleChapter shape also covers a target that
  // already spells out a same-chapter range (dash !== null); that one needs
  // no completion.
  if (classification.shape !== "singleChapter" || classification.dash !== null) return null;

  const display = flattenDisplayText(link.content);
  if (display === null) return null;

  const range = parseDisplayRange(display);
  if (!range) return null;

  // The display's own leading endpoint must describe the same starting point
  // the target already does, or this isn't the target's own range being
  // spelled out — some other mismatch this check has no business guessing
  // at.
  if (range.chapter !== classification.fromChapter) return null;
  if (classification.fromVerse !== null && range.verse !== classification.fromVerse) return null;

  const fromChapter = classification.fromChapter as number;
  const isCrossChapter = range.toChapter !== null && range.toChapter !== fromChapter;

  // Whole-chapter-equivalence gate: a target naming only a chapter, whose
  // display spells out that exact chapter's own verses 1..last (from this
  // version's own data), names the same thing the target already does — not
  // a truncation.
  if (classification.fromVerse === null && !isCrossChapter && range.verse === 1) {
    const lastVerse = classification.book === null ? undefined : lastVerseOf(versionId, classification.book, fromChapter);
    if (lastVerse !== undefined && lastVerse === range.toVerse) return null;
  }

  if (isCrossChapter) {
    return { book: classification.book, display, reconstructedTarget: null, declineReason: "cross-chapter" };
  }

  const bookName = classification.bookName as string;
  const startVerse = classification.fromVerse ?? range.verse;
  return {
    book: classification.book,
    display,
    reconstructedTarget: `${bookName} ${fromChapter}:${startVerse}${EN_DASH}${range.toVerse}`,
    declineReason: null,
  };
}

/** One genuine truncated-range finding — a bibleLink whose target is truncated short of the range its own display override names. */
export interface TruncatedRangeFinding extends TruncatedRangeResult {
  /** Repo book id of the verse this `bibleLink` is attached to. */
  atBook: string;
  /** Chapter of the verse this `bibleLink` is attached to. */
  atChapter: number;
  /** Verse number this `bibleLink` is attached to. */
  atVerse: number;
  /** The enclosing footnote's type (`"stu"`, `"xrf"`, …), or `null` when the `bibleLink` sits directly in content with no footnote wrapper. */
  footnoteType: string | null;
  /** Which part of the verse's content tree this finding was found in. */
  zone: Zone;
  /** The target exactly as written. */
  target: string;
}

/**
 * Render one truncated-range finding as this report's one-line format,
 * matching {@link formatCrossChapterFinding}'s own shape.
 */
export function formatTruncatedRangeFinding(finding: TruncatedRangeFinding): string {
  const outcome =
    finding.reconstructedTarget !== null
      ? `completes to "${finding.reconstructedTarget}"`
      : `declined — ${finding.declineReason}`;
  return (
    `${finding.atBook} ${finding.atChapter}:${finding.atVerse} [${finding.footnoteType ?? "(none)"}/${finding.zone}]: ` +
    `"${finding.target}" truncated short of display "${finding.display}" — ${outcome}`
  );
}

/**
 * Audit one version for bibleLink targets truncated short of the range their
 * own display override names.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"ASV1901"`.
 * @returns `findings` (empty for a version with none) and `scanned` (every
 *   `bibleLink` node visited, matching {@link findCrossChapterLinks}'s own
 *   contract).
 */
export function findTruncatedRanges(versionId: string): {
  findings: readonly TruncatedRangeFinding[];
  scanned: number;
} {
  const findings: TruncatedRangeFinding[] = [];
  let scanned = 0;

  for (const record of readVersionRecords(versionId)) {
    walkContent(record.content, "verse", null, (link, zone, footnoteType) => {
      scanned += 1;
      const result = completeTruncatedRange(versionId, link);
      if (!result) return;
      findings.push({
        ...result,
        atBook: record.book,
        atChapter: record.chapter,
        atVerse: record.verse,
        footnoteType,
        zone,
        target: link.bibleLink,
      });
    });
  }

  return { findings, scanned };
}

/**
 * Apply {@link completeTruncatedRange} to every bibleLink inside one content
 * subtree, in a single walk covering verse content, headings, subtitles, and
 * every footnote type — the same traversal shape {@link
 * splitCrossChapterLinksInContent} uses, except this one replaces a node in
 * place rather than splicing an array, since completing a range never
 * changes how many nodes are here. `content` is never touched: the display
 * override was already correct, which is how the truncation was detected in
 * the first place.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"ASV1901"`.
 * @param content - Any subtree of a verse's `content`.
 * @returns The subtree's replacement, whether anything changed, and one
 *   {@link SkipReason} per finding this pass declined to complete (a
 *   cross-chapter display) — so a caller can report what's still on disk
 *   after this step runs, the same contract {@link
 *   reorderFootnotePunctuationInContent} and {@link
 *   relocateMarkBoundarySpacesInContent} already use.
 */
export function reconstructTruncatedRangesInContent(
  versionId: string,
  content: Content,
): { content: Content; changed: boolean; skipped: SkipReason[] } {
  if (content === null || content === undefined || typeof content !== "object") {
    return { content, changed: false, skipped: [] };
  }

  if (Array.isArray(content)) {
    let changed = false;
    const skipped: SkipReason[] = [];
    const items = content.map((item) => {
      const rewritten = reconstructTruncatedRangesInContent(versionId, item);
      changed = changed || rewritten.changed;
      skipped.push(...rewritten.skipped);
      return rewritten.content;
    });
    return { content: items, changed, skipped };
  }

  if ("bibleLink" in content) {
    const result = completeTruncatedRange(versionId, content);
    if (!result) return { content, changed: false, skipped: [] };
    if (result.reconstructedTarget === null) {
      return { content, changed: false, skipped: [result.declineReason as SkipReason] };
    }
    return { content: { ...content, bibleLink: result.reconstructedTarget }, changed: true, skipped: [] };
  }

  if ("heading" in content) {
    const rewritten = reconstructTruncatedRangesInContent(versionId, content.heading);
    return { content: { ...content, heading: rewritten.content }, changed: rewritten.changed, skipped: rewritten.skipped };
  }

  if ("subtitle" in content) {
    const rewritten = reconstructTruncatedRangesInContent(versionId, content.subtitle);
    return { content: { ...content, subtitle: rewritten.content }, changed: rewritten.changed, skipped: rewritten.skipped };
  }

  if ("paragraph" in content && content.paragraph !== undefined && typeof content.paragraph !== "boolean") {
    const rewritten = reconstructTruncatedRangesInContent(versionId, content.paragraph);
    return { content: { ...content, paragraph: rewritten.content }, changed: rewritten.changed, skipped: rewritten.skipped };
  }

  let result: Content = content;
  let changed = false;
  let skipped: SkipReason[] = [];
  if ("content" in content) {
    const rewritten = reconstructTruncatedRangesInContent(versionId, content.content);
    result = { ...content, content: rewritten.content };
    changed = rewritten.changed;
    skipped = rewritten.skipped;
  }
  if (content.foot) {
    const rewritten = reconstructTruncatedRangesInContent(versionId, content.foot.content);
    result = { ...(result as typeof content), foot: { ...content.foot, content: rewritten.content } };
    changed = changed || rewritten.changed;
    skipped = skipped.concat(rewritten.skipped);
  }
  return { content: result, changed, skipped };
}

// ---------------------------------------------------------------------------
// Unresolvable-target detection and unlinking
// ---------------------------------------------------------------------------
//
// A bibleLink target can parse (see classifyBibleLink) and still name a
// book outside this version's own canon, a chapter it lacks, or a verse the
// chapter lacks. The real ASV1901 MRK 9:44 case is exactly this shape: its
// own footnote is the note explaining that verse 46 is a textual-variant
// omission, and its link to "Mark 9:46" lands nowhere, because ASV1901
// never recorded that verse.
//
// An unparsed target (classifyBibleLink's "unparsed" shape) is a different
// question and never a finding here — WEBUS2020's real
// "Deuteronomy 32:43 LXX" is a deliberate versification siglum verify.ts
// already asserts by name. A comma-merged target ("mergedTarget") is
// excluded the same way: neither shape ever resolves to a single
// book/chapter/verse to judge in the first place.

/**
 * Why {@link findUnresolvableTarget} judged one endpoint of a bibleLink
 * target unresolvable against `versionId`'s own data.
 *
 * Deliberately never "the book isn't in this version's own canon": an
 * embedded reference can name a real book regardless of whether the version
 * being read happens to carry it (an NT-only version's own footnote can
 * still say "see Isaiah 7:14" without contradiction — `utils/usfm/references.ts`'s
 * own embedded scanner resolves this kind of mention un-restricted by canon
 * for exactly that reason), so canon membership alone is never treated as a
 * reason to unlink a target here either.
 */
export type UnresolvableTargetReason = "chapter-not-carried" | "verse-not-carried";

/**
 * One bibleLink target's unresolvable verdict against one version's own
 * data — the single place both {@link findUnresolvableTargets} (reporting)
 * and {@link unlinkUnresolvableTargetsInContent} (fixing) get their answer
 * from, matching {@link TruncatedRangeResult}'s own role for the
 * truncated-range check.
 */
export interface UnresolvableTargetResult {
  /** Why this endpoint is unresolvable. */
  reason: UnresolvableTargetReason;
  /** The book name exactly as written at the unresolvable endpoint. */
  bookName: string;
  /** The repo book id this endpoint's own book name resolved to. */
  book: string;
  /** The chapter number the unresolvable endpoint named. */
  chapter: number;
  /** The verse number the unresolvable endpoint named, or `null` for a bare-chapter endpoint. */
  verse: number | null;
  /** This version's own real highest chapter number for `book`, read from its own data. Reported so a `"chapter-not-carried"` finding's own message names the version's real chapter count rather than leaving a reader to look it up. */
  lastChapterInVersion: number | null;
}

/**
 * Judge one endpoint (`from` or `to`) of a target against `versionId`'s own
 * data — the shared per-endpoint judgment {@link findUnresolvableTarget}
 * applies to both ends of a range, so a range unresolvable at either end is
 * still one finding rather than two separate code paths.
 *
 * @param book - `null` when the endpoint's own book name didn't resolve
 *   against this version's canon — never itself a finding (see {@link
 *   UnresolvableTargetReason}'s own doc comment for why); there is simply
 *   nothing left to judge without a resolved book to look chapter/verse data
 *   up against, so this returns `null` (not unresolvable) the same as a
 *   genuinely resolvable target does.
 */
function unresolvableEndpoint(
  versionId: string,
  bookName: string,
  book: string | null,
  chapter: number,
  verse: number | null,
): UnresolvableTargetResult | null {
  if (book === null) return null;
  if (lastVerseOf(versionId, book, chapter) === undefined) {
    return { reason: "chapter-not-carried", bookName, book, chapter, verse, lastChapterInVersion: lastChapterOf(versionId, book) ?? null };
  }
  if (verse !== null && !verseExistsIn(versionId, book, chapter, verse)) {
    return { reason: "verse-not-carried", bookName, book, chapter, verse, lastChapterInVersion: lastChapterOf(versionId, book) ?? null };
  }
  return null;
}

/**
 * Decide whether one bibleLink target is unresolvable against `versionId`'s
 * own real chapter/verse data — the single-target entry point both
 * {@link findUnresolvableTargets} and
 * {@link unlinkUnresolvableTargetsInContent} are built on, directly callable
 * the same way {@link classifyBibleLink} is.
 *
 * **A target the endpoint grammar cannot parse at all, or a comma-merged
 * target, is never a finding here** — {@link classifyBibleLink}'s
 * `"unparsed"` and `"mergedTarget"` shapes both mean no book/chapter/verse
 * was ever resolved to judge, not that a resolved location turned out to be
 * missing.
 *
 * Checks the first (`from`) endpoint before the second (`to`) endpoint of a
 * range, returning on the first unresolvable one found — a range
 * unresolvable at both ends is still one finding, not two.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"ASV1901"`.
 * @param target - A `bibleLink` target string, exactly as written.
 * @returns `null` when the target resolves, or wasn't attempted (unparsed,
 *   merged). Otherwise the verdict, with enough detail for both a report line
 *   and a fixer decision.
 */
export function findUnresolvableTarget(versionId: string, target: string): UnresolvableTargetResult | null {
  const classification = classifyBibleLink(versionId, target);
  if (classification.shape === "unparsed" || classification.shape === "mergedTarget") return null;

  const bookName = classification.bookName as string;
  const fromResult = unresolvableEndpoint(versionId, bookName, classification.book, classification.fromChapter as number, classification.fromVerse);
  if (fromResult) return fromResult;

  if (classification.toChapter !== null) {
    const toResult = unresolvableEndpoint(versionId, bookName, classification.book, classification.toChapter, classification.toVerse);
    if (toResult) return toResult;
  }

  return null;
}

/** One genuine unresolvable-target finding — a bibleLink whose target does not resolve against its own version's real chapter/verse data. */
export interface UnresolvableTargetFinding extends UnresolvableTargetResult {
  /** Repo book id of the verse this `bibleLink` is attached to. */
  atBook: string;
  /** Chapter of the verse this `bibleLink` is attached to. */
  atChapter: number;
  /** Verse number this `bibleLink` is attached to. */
  atVerse: number;
  /** The enclosing footnote's type (`"stu"`, `"xrf"`, …), or `null` when the `bibleLink` sits directly in content with no footnote wrapper. */
  footnoteType: string | null;
  /** Which part of the verse's content tree this finding was found in. */
  zone: Zone;
  /** The target exactly as written. */
  target: string;
}

/**
 * Render one unresolvable-target finding as this report's one-line format,
 * matching {@link formatCrossChapterFinding}'s own shape. Names this
 * version's own real chapter count for a `"chapter-not-carried"` finding, so
 * a reader can tell this expected, permanent state apart from a genuine
 * regression without looking anything up.
 */
export function formatUnresolvableTargetFinding(finding: UnresolvableTargetFinding): string {
  const detail =
    finding.reason === "chapter-not-carried"
      ? `${finding.bookName} ${finding.chapter} — this version carries only ${finding.lastChapterInVersion ?? 0} chapter(s) in ${finding.bookName}`
      : `${finding.bookName} ${finding.chapter}:${finding.verse} — this version carries no such verse`;
  return (
    `${finding.atBook} ${finding.atChapter}:${finding.atVerse} [${finding.footnoteType ?? "(none)"}/${finding.zone}]: ` +
    `"${finding.target}" does not resolve — ${detail}`
  );
}

/**
 * Audit one version for `bibleLink` targets that do not resolve against its
 * own real chapter/verse data.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"ASV1901"`.
 * @returns `findings` (empty for a version with none) and `scanned` (every
 *   `bibleLink` node visited, matching {@link findCrossChapterLinks}'s own
 *   contract).
 */
export function findUnresolvableTargets(versionId: string): {
  findings: readonly UnresolvableTargetFinding[];
  scanned: number;
} {
  const findings: UnresolvableTargetFinding[] = [];
  let scanned = 0;

  for (const record of readVersionRecords(versionId)) {
    walkContent(record.content, "verse", null, (link, zone, footnoteType) => {
      scanned += 1;
      const result = findUnresolvableTarget(versionId, link.bibleLink);
      if (!result) return;
      findings.push({
        ...result,
        atBook: record.book,
        atChapter: record.chapter,
        atVerse: record.verse,
        footnoteType,
        zone,
        target: link.bibleLink,
      });
    });
  }

  return { findings, scanned };
}

/** Why {@link unlinkUnresolvableTargetsInContent} declined to unlink an otherwise-unresolvable target. */
export type UnlinkSkipReason = "empty-override";

/**
 * Unlink every unresolvable `bibleLink` inside one content subtree, in a
 * single walk covering verse content, headings, subtitles, and every
 * footnote type — the same traversal shape
 * {@link reconstructTruncatedRangesInContent} uses, since replacing one node
 * with its own display content (or its bare target) never changes how many
 * nodes are here.
 *
 * **The substitution is exactly what a reader was already seeing.**
 * `exportContent.ts`'s own render of a `bibleLink` node returns `content`'s
 * own override when present, and the bare target string otherwise — so this
 * transform's replacement value is always `link.content ?? link.bibleLink`,
 * spliced into the node's own place, which is rendering-neutral by
 * construction. A string override collapses to that override as plain
 * content (the real ASV1901 MRK 9:44 shape); a node with no override at all
 * collapses to its own target string; an object or array override keeps that
 * value as its own content, exactly as it stood.
 *
 * **Declines rather than deletes** when an override is present but renders no
 * visible text at all (`"empty-override"`) — a node whose display was already
 * meaningless is a different, pre-existing problem this step has no business
 * guessing at by discarding text.
 *
 * @param versionId - A `bible-versions/` directory name, e.g. `"ASV1901"`.
 * @param content - Any subtree of a verse's `content`.
 * @returns The subtree's replacement, whether anything changed, and one
 *   {@link UnlinkSkipReason} per finding this pass declined to act on — the
 *   same `{content, changed, skipped}` contract every other gated fixer in
 *   this file already uses.
 */
export function unlinkUnresolvableTargetsInContent(
  versionId: string,
  content: Content,
): { content: Content; changed: boolean; skipped: UnlinkSkipReason[] } {
  if (content === null || content === undefined || typeof content !== "object") {
    return { content, changed: false, skipped: [] };
  }

  if (Array.isArray(content)) {
    let changed = false;
    const skipped: UnlinkSkipReason[] = [];
    const items = content.map((item) => {
      const rewritten = unlinkUnresolvableTargetsInContent(versionId, item);
      changed = changed || rewritten.changed;
      skipped.push(...rewritten.skipped);
      return rewritten.content;
    });
    return { content: items, changed, skipped };
  }

  if ("bibleLink" in content) {
    const result = findUnresolvableTarget(versionId, content.bibleLink);
    if (!result) return { content, changed: false, skipped: [] };

    const override = content.content;
    if (override === undefined) {
      return { content: content.bibleLink, changed: true, skipped: [] };
    }
    const flattened = flattenDisplayText(override);
    if (flattened === null || flattened === "") {
      return { content, changed: false, skipped: ["empty-override"] };
    }
    return { content: override, changed: true, skipped: [] };
  }

  if ("heading" in content) {
    const rewritten = unlinkUnresolvableTargetsInContent(versionId, content.heading);
    return { content: { ...content, heading: rewritten.content }, changed: rewritten.changed, skipped: rewritten.skipped };
  }

  if ("subtitle" in content) {
    const rewritten = unlinkUnresolvableTargetsInContent(versionId, content.subtitle);
    return { content: { ...content, subtitle: rewritten.content }, changed: rewritten.changed, skipped: rewritten.skipped };
  }

  if ("paragraph" in content && content.paragraph !== undefined && typeof content.paragraph !== "boolean") {
    const rewritten = unlinkUnresolvableTargetsInContent(versionId, content.paragraph);
    return { content: { ...content, paragraph: rewritten.content }, changed: rewritten.changed, skipped: rewritten.skipped };
  }

  let result: Content = content;
  let changed = false;
  let skipped: UnlinkSkipReason[] = [];
  if ("content" in content) {
    const rewritten = unlinkUnresolvableTargetsInContent(versionId, content.content);
    result = { ...content, content: rewritten.content };
    changed = rewritten.changed;
    skipped = rewritten.skipped;
  }
  if (content.foot) {
    const rewritten = unlinkUnresolvableTargetsInContent(versionId, content.foot.content);
    result = { ...(result as typeof content), foot: { ...content.foot, content: rewritten.content } };
    changed = changed || rewritten.changed;
    skipped = skipped.concat(rewritten.skipped);
  }
  return { content: result, changed, skipped };
}
