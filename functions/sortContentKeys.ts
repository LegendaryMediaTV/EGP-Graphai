/**
 * Sorts keys in content objects according to the canonical order.
 *
 * Content key order:
 * 1. subtitle
 * 2. heading
 * 3. bibleLink
 * 4. paragraph (object or boolean)
 * 5. type (for footnotes)
 * 6. text
 * 7. content
 * 8. script
 * 9. marks (alphabetized)
 * 10. break
 * 11. foot
 * 12. strong
 * 13. morph
 * 14. lemma
 *
 * Unknown keys are appended alphabetically at the end (never dropped).
 */

// Canonical key order for content objects
const CONTENT_KEY_ORDER: string[] = [
  "subtitle",
  "heading",
  "bibleLink",
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

type ContentElement =
  | string
  | ContentObject
  | ContentElement[]
  | null
  | undefined;

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

  // Get all keys from the object
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

  // Combine: known keys first, then unknown keys
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
 * @param verse - The verse object to sort
 * @returns The verse with sorted keys
 */
export function sortVerseKeys<T extends ContentObject>(verse: T): T {
  const sortedVerse: ContentObject = {};

  // Get all keys from the verse
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

  // Build the sorted verse
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
