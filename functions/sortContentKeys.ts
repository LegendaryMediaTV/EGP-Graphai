/**
 * Canonical key order for a content node. A key this list does not name is
 * appended alphabetically rather than dropped, so a newly introduced key
 * survives a sort from the day it appears — it just lands last until it is
 * registered here.
 */
const CONTENT_KEY_ORDER: string[] = [
  "subtitle",
  "heading",
  "bibleLink",
  "abbr",
  "paragraph", // Nested content, or the boolean start-of-paragraph flag
  "type", // Footnote kind or heading kind
  "text",
  "content",
  "script",
  "transliteration",
  "marks", // Alphabetized within the array
  "break",
  "foot",
  "strong",
  "morph",
  "lemma",
];

/** Canonical key order for a verse record, on the same terms. */
const VERSE_KEY_ORDER: string[] = ["book", "chapter", "verse", "content"];

/**
 * Generic shape for a node in the content tree, loosened to `unknown`
 * property values so keys can be sorted without depending on `Content`'s
 * exact field types.
 */
type ContentElement =
  string | ContentObject | ContentElement[] | null | undefined;

/** Object with unsorted keys, used internally for generic key sorting. */
interface ContentObject {
  [key: string]: unknown;
}

/**
 * Recursively sorts a content tree's object keys into {@link
 * CONTENT_KEY_ORDER}. Builds new objects rather than reordering in place, so
 * the caller's tree is left as it was.
 */
export function sortContentKeys<T extends ContentElement>(content: T): T {
  if (content === null || content === undefined) {
    return content;
  }

  if (typeof content !== "object") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => sortContentKeys(item)) as T;
  }

  const obj = content as ContentObject;
  const sortedObj: ContentObject = {};

  const allKeys = Object.keys(obj);

  const knownKeys: string[] = [];
  const unknownKeys: string[] = [];

  for (const key of allKeys) {
    if (CONTENT_KEY_ORDER.includes(key)) {
      knownKeys.push(key);
    } else {
      unknownKeys.push(key);
    }
  }

  knownKeys.sort(
    (a, b) => CONTENT_KEY_ORDER.indexOf(a) - CONTENT_KEY_ORDER.indexOf(b),
  );

  unknownKeys.sort();

  const orderedKeys = [...knownKeys, ...unknownKeys];

  for (const key of orderedKeys) {
    let value = obj[key];

    if (key === "marks" && Array.isArray(value)) {
      value = [...value].sort();
    } else if (key === "content" || key === "heading" || key === "subtitle") {
      value = sortContentKeys(value as ContentElement);
    } else if (key === "foot" && typeof value === "object" && value !== null) {
      value = sortContentKeys(value as ContentElement);
    } else if (
      key === "paragraph" &&
      typeof value === "object" &&
      value !== null
    ) {
      value = sortContentKeys(value as ContentElement);
    }

    sortedObj[key] = value;
  }

  return sortedObj as T;
}

/**
 * Sorts one verse record's own keys into {@link VERSE_KEY_ORDER} and
 * recursively sorts the content tree under it.
 */
export function sortVerseKeys<T extends ContentObject>(verse: T): T {
  const sortedVerse: ContentObject = {};

  const allKeys = Object.keys(verse);

  const verseKeys: string[] = [];
  const otherKeys: string[] = [];

  for (const key of allKeys) {
    if (VERSE_KEY_ORDER.includes(key)) {
      verseKeys.push(key);
    } else {
      otherKeys.push(key);
    }
  }

  verseKeys.sort(
    (a, b) => VERSE_KEY_ORDER.indexOf(a) - VERSE_KEY_ORDER.indexOf(b),
  );

  otherKeys.sort();

  const orderedKeys = [...verseKeys, ...otherKeys];

  for (const key of orderedKeys) {
    let value = verse[key];

    if (key === "content") {
      value = sortContentKeys(value as ContentElement);
    }

    sortedVerse[key] = value;
  }

  return sortedVerse as T;
}

export default sortContentKeys;
