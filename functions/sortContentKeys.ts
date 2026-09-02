/**
 * Sorts keys in content objects according to the canonical order.
 *
 * Content key order:
 * 1. subtitle
 * 2. heading
 * 3. bibleLink
 * 4. abbr
 * 5. paragraph (object or boolean)
 * 6. type (footnote kind or heading kind)
 * 7. text
 * 8. content
 * 9. script
 * 10. marks (alphabetized)
 * 11. break
 * 12. foot
 * 13. strong
 * 14. morph
 * 15. lemma
 *
 * Unknown keys are appended alphabetically at the end (never dropped).
 */
const CONTENT_KEY_ORDER: string[] = [
  "subtitle",
  "heading",
  "bibleLink",
  "abbr",
  "paragraph",
  "type",
  "text",
  "content",
  "script",
  "marks",
  "break",
  "foot",
  "strong",
  "morph",
  "lemma",
];

// Canonical key order for verse objects
const VERSE_KEY_ORDER: string[] = ["book", "chapter", "verse", "content"];

/**
 * Generic shape for a node in the content tree, loosened to `unknown`
 * property values so keys can be sorted without depending on `Content`'s
 * exact field types.
 */
type ContentElement =
  | string
  | ContentObject
  | ContentElement[]
  | null
  | undefined;

/** Object with unsorted keys, used internally for generic key sorting. */
interface ContentObject {
  [key: string]: unknown;
}

/**
 * Recursively sorts keys in content objects according to canonical order.
 *
 * @param content - The content to sort (can be string, object, array, null, or undefined)
 * @returns The content with sorted keys
 */
export function sortContentKeys<T extends ContentElement>(content: T): T {
  // Handle null/undefined
  if (content === null || content === undefined) {
    return content;
  }

  // Handle strings - return unchanged
  if (typeof content !== "object") {
    return content;
  }

  // Handle arrays - recursively sort each element
  if (Array.isArray(content)) {
    return content.map((item) => sortContentKeys(item)) as T;
  }

  // Handle objects
  const obj = content as ContentObject;
  const sortedObj: ContentObject = {};

  const allKeys = Object.keys(obj);

  // Separate known and unknown keys
  const knownKeys: string[] = [];
  const unknownKeys: string[] = [];

  for (const key of allKeys) {
    if (CONTENT_KEY_ORDER.includes(key)) {
      knownKeys.push(key);
    } else {
      unknownKeys.push(key);
    }
  }

  // Sort known keys by canonical order
  knownKeys.sort(
    (a, b) => CONTENT_KEY_ORDER.indexOf(a) - CONTENT_KEY_ORDER.indexOf(b),
  );

  // Sort unknown keys alphabetically
  unknownKeys.sort();

  const orderedKeys = [...knownKeys, ...unknownKeys];

  // Build the sorted object
  for (const key of orderedKeys) {
    let value = obj[key];

    // Special handling for marks array - alphabetize it
    if (key === "marks" && Array.isArray(value)) {
      value = [...value].sort();
    }
    // Recursively sort nested content
    else if (key === "content" || key === "heading" || key === "subtitle") {
      value = sortContentKeys(value as ContentElement);
    }
    // Recursively sort foot object
    else if (key === "foot" && typeof value === "object" && value !== null) {
      value = sortContentKeys(value as ContentElement);
    }
    // Recursively sort paragraph if it's an object (not boolean)
    else if (
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
 * Sorts verse-level keys (book, chapter, verse, content) and recursively sorts content.
 *
 * @returns The verse with sorted keys
 */
export function sortVerseKeys<T extends ContentObject>(verse: T): T {
  const sortedVerse: ContentObject = {};

  const allKeys = Object.keys(verse);

  // Separate verse keys and other keys
  const verseKeys: string[] = [];
  const otherKeys: string[] = [];

  for (const key of allKeys) {
    if (VERSE_KEY_ORDER.includes(key)) {
      verseKeys.push(key);
    } else {
      otherKeys.push(key);
    }
  }

  // Sort verse keys by canonical order
  verseKeys.sort(
    (a, b) => VERSE_KEY_ORDER.indexOf(a) - VERSE_KEY_ORDER.indexOf(b),
  );

  // Sort other keys alphabetically
  otherKeys.sort();

  const orderedKeys = [...verseKeys, ...otherKeys];

  for (const key of orderedKeys) {
    let value = verse[key];

    // Recursively sort content
    if (key === "content") {
      value = sortContentKeys(value as ContentElement);
    }

    sortedVerse[key] = value;
  }

  return sortedVerse as T;
}

export default sortContentKeys;
