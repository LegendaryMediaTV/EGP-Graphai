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
 *   versions (e.g. `ROM 14` is 23 in ASV1901/CLV1880/KJV1769/YLT1898 but 26
 *   in BYZ2018/WEBUS2020) — a table built from one version and applied to
 *   another would silently mis-split a range in some of them.
 *
 * A `bibleLink` naming a book outside a version's own canon (e.g. any name
 * absent from BYZ2018's NT-only canon) is reported as unresolvable, never
 * thrown — see {@link classifyBibleLink} for why.
 *
 * Public surface: {@link findCrossChapterLinks} (the whole-version sweep),
 * {@link classifyBibleLink} (the single-link entry point it is built on, also
 * directly callable — "callers pass a version id and a link, and get back
 * findings"), and the {@link CrossChapterFinding} type. Everything else —
 * the dash-class regex, the endpoint grammar, the per-version chapter-length
 * index, the per-version book-alias index — is this module's own business,
 * never a caller's.
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
 * Every dash character this repo's `bibleLink` targets are ever found to use
 * — U+2010–U+2015 (hyphen through horizontal bar), U+2212 (minus sign), and
 * the ASCII hyphen. The convention emits only U+2013 (en dash), but detection
 * must not assume the data agrees with the convention: WEBUS2020's
 * `"2 Kings 6:31—7:20"` uses U+2014, measured against that same version's own
 * 77 en-dash ranges.
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
 * @throws if `versionId` names no directory under `bible-versions/` — a
 *   caller asking about a version this repo does not have is a bug in the
 *   caller, not a shape to report gracefully.
 */
function readVersionBookFiles(versionId: string): readonly VersionBookFile[] {
  const dir = path.join(BIBLE_VERSIONS_DIR, versionId);
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
  /** Folded name -> repo book id, restricted to books this version actually carries. */
  bookIdByFoldedName: ReadonlyMap<string, string>;
}

const versionIndexCache = new Map<string, VersionIndex>();

/**
 * Build (or return the cached) index for one version — read once, corpus-wide
 * for that version, and reused for every subsequent lookup: the max verse
 * recorded for a book+chapter, combined with a book-alias index restricted to
 * that version's own canon (the restriction matters: `bible-books.json` also
 * carries apocryphal books absent from every version's canon here, and
 * indexing the whole registry unrestricted would let one of those resolve
 * where it should not).
 */
function indexFor(versionId: string): VersionIndex {
  const cached = versionIndexCache.get(versionId);
  if (cached) return cached;

  const lastVerseByChapter = new Map<string, number>();
  const canon = new Set<string>();
  for (const record of readVersionRecords(versionId)) {
    canon.add(record.book);
    const key = `${record.book} ${record.chapter}`;
    if (record.verse > (lastVerseByChapter.get(key) ?? 0)) lastVerseByChapter.set(key, record.verse);
  }

  const bookIdByFoldedName = new Map<string, string>();
  for (const book of bibleBooks()) {
    if (!canon.has(book._id)) continue;
    for (const name of [book._id, book.name, ...(book.alt ?? [])]) {
      bookIdByFoldedName.set(foldName(name), book._id);
    }
  }

  const index: VersionIndex = { lastVerseByChapter, bookIdByFoldedName };
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
 * anything, matching {@link findCrossChapterLinks}'s own contract; a caller
 * (the CLI's `--fix` path) decides whether and where to write them.
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
