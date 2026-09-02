import Content from "./Content";

/**
 * Represents a book entry within a Bible version.
 * Each version may include different books with version-specific metadata.
 */
export interface VersionBook {
  /** Book identifier from bible-books.json (e.g., 'GEN', 'MAT') */
  _id: string;
  /** Name of the book in this version */
  name: Content;
  /** Title of the book in this version */
  title: Content;
  /** Order of the book in this version (1-indexed, sequential) */
  order: number;
  /** Number of chapters in this book for this version */
  chapters: number;
}

/**
 * One entry in a version's abbreviation registry: what a short code prints
 * as, and what it stands for. Registries are per-version because the same
 * code means different things in different editions (one version's `MT` is
 * the Masoretic Text, another's the Majority Text).
 */
export interface Abbreviation {
  /** Identifier an `{ abbr }` content node points at (e.g. 'NA27', 'OM', 'MS-ALEPH') */
  _id: string;
  /** How the abbreviation prints, as content so it can carry markup */
  name: Content;
  /** What the abbreviation stands for; shown on hover or in a modal, dropped by the text and markdown exports */
  description?: Content;
}

/**
 * Testament-specific overrides for script and morphology.
 */
export interface Testament {
  /** Script override for this testament ('G' for Greek, 'H' for Hebrew) */
  script?: "G" | "H";
}

/**
 * Represents a Bible version/translation with its metadata and book list.
 * Each version has a _version.json file in its folder within bible-versions/.
 */
export default interface BibleVersion {
  /** Short identifier for the version (e.g., 'ASV1901', 'KJV1769') */
  _id: string;
  /** Human-readable version name */
  name: Content;
  /** License identifier (e.g., 'CC0-1.0', 'MIT') */
  license: string;
  /** Copyright statement or license information */
  copyright?: Content;
  /** Default script for this version ('G' for Greek, 'H' for Hebrew). If unset, assume Latin. */
  script?: "G" | "H";
  /** Abbreviations this version's content refers to by id */
  abbr?: Abbreviation[];
  /** Optional per-testament overrides for script and morphology */
  testaments?: {
    OT?: Testament;
    NT?: Testament;
  };
  /** List of books included in this version with their order */
  books?: VersionBook[];
}
