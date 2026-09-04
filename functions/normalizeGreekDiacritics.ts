import Content from "../types/Content";
import { mapContentText } from "./mapContentText";

/**
 * Compose a Greek vowel's dialytika into the letter it belongs to, putting
 * it ahead of any accent that was written before it.
 *
 * Unicode's canonical order for a Greek vowel carrying both marks is base,
 * dialytika, accent: Ἠσαΐου is ι + U+0308 + U+0301, which composes to the
 * single character U+0390. Written the other way round — the accent first,
 * whether precomposed into the letter (U+03AF) or as its own mark — the
 * sequence never composes, because both marks share combining class 230 and
 * canonical reordering leaves them where they are. The result looks right on
 * screen and is wrong everywhere it matters: Ἠσαί̈ου and Ἠσαΐου are
 * different strings, so a search, a diff, or a word alignment against another
 * edition sees two unrelated words.
 *
 * BYZ2026 carries 372 dialytika-bearing nodes across 121 word forms
 * (Ἠσαΐου, πρωΐ, Λευΐ, Νινευΐ and the rest), every one of them composed —
 * which is what this keeps true. The since-retired BYZ2018 arrived with 88
 * of them misordered, plus 6 places where a plain υ + dialytika sat
 * uncomposed. Both shapes are the same defect and this fixes both.
 *
 * The repair is deliberately confined to the affected letter. Normalizing a
 * whole string to NFC would be simpler and wrong: NFC folds the Greek ano
 * teleia (U+0387) to a middle dot and the Greek question mark (U+037E) to a
 * semicolon, and BYZ2026 alone uses the Greek ano teleia in 3,417 places
 * and the Greek question mark in 1,034. Rebuilding one base-plus-marks cluster at a time
 * leaves every other character in the string untouched.
 */

/** U+0308 COMBINING DIAERESIS — the dialytika, as a standalone mark. */
const DIALYTIKA = "̈";

/** Any non-spacing mark, used to gather a letter and its diacritics into one cluster. */
const COMBINING_MARK = /\p{Mn}/u;

/** What one call to {@link normalizeDiacriticsText} changed. */
export interface DiacriticNormalization {
  /** The text with every misordered or uncomposed dialytika repaired. */
  value: string;
  /** Letters rebuilt. Two in one string contributes two. */
  changes: number;
}

/**
 * Repairs every misordered or uncomposed dialytika in one string. Text
 * carrying no combining dialytika passes through unchanged, with
 * `changes: 0`.
 *
 * @param text - Raw source text, however it spells its diacritics
 */
export function normalizeDiacriticsText(text: string): DiacriticNormalization {
  if (!text.includes(DIALYTIKA)) return { value: text, changes: 0 };

  // Gather each letter with the marks that follow it. A cluster, not a single
  // code point, is the unit of repair: the accent this dialytika has to move
  // ahead of may be precomposed into the letter (U+03AF) or standing on its
  // own (U+03B9 U+0301), and both spellings occur.
  const clusters: string[] = [];
  for (const character of text) {
    if (clusters.length > 0 && COMBINING_MARK.test(character)) {
      clusters[clusters.length - 1] += character;
    } else {
      clusters.push(character);
    }
  }

  let changes = 0;
  const repaired = clusters.map((cluster) => {
    // Every other cluster in the string passes through untouched, which is
    // what keeps the Greek ano teleia and question mark out of an NFC round
    // trip that would fold them to their Latin lookalikes.
    if (!cluster.includes(DIALYTIKA)) return cluster;

    const decomposed = cluster.normalize("NFD");
    const base = decomposed[0];
    const marks = [...decomposed.slice(1)];
    const ordered =
      base +
      marks.filter((mark) => mark === DIALYTIKA).join("") +
      marks.filter((mark) => mark !== DIALYTIKA).join("");
    const composed = ordered.normalize("NFC");

    if (composed !== cluster) changes += 1;
    return composed;
  });

  return changes > 0 ? { value: repaired.join(""), changes } : { value: text, changes: 0 };
}

/** Whether one string carries a dialytika this module would rebuild. */
export function hasMisplacedDialytika(text: string): boolean {
  return normalizeDiacriticsText(text).changes > 0;
}

/**
 * Walks a content tree and repairs every misordered or uncomposed dialytika
 * it finds, via {@link normalizeDiacriticsText} above, using the same
 * {@link mapContentText} traversal `functions/normalizeStraightQuotes.ts`
 * and `functions/normalizeEllipses.ts` share.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @returns The rewritten tree (structurally new only where something
 *   changed, otherwise the original reference) and whether anything changed
 *   at all
 */
export function normalizeDiacriticsInContent(
  content: Content
): { content: Content; changed: boolean } {
  return mapContentText(content, (text) => {
    const rewritten = normalizeDiacriticsText(text);
    return rewritten.changes > 0 ? rewritten.value : undefined;
  });
}

export default normalizeDiacriticsInContent;
