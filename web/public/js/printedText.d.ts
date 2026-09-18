import type { ContentObject } from "../../../types/Content";

/**
 * Type declaration for the plain, unbundled `printedText.js` (not compiled
 * through `allowJs`) — without it, `__tests__/printedText.test.ts`'s direct
 * import of that script has no type information at all (TS7016 under
 * `strict`).
 *
 * `node` is this repo's own `ContentObject`, matching both real call sites:
 * the text-node branch of `ContentNode.js`, which has already narrowed away
 * strings, arrays and wrapper shapes, and `BookName.js`, which normalizes a
 * book's `name` to this shape before asking. `transliterate` mirrors the
 * reader's transliteration setting.
 *
 * @returns The string to print and the script to style it as — the script is
 *   `undefined` for anything that prints in Latin, including a romanization
 */
export function printedTextOf(
  node: ContentObject,
  transliterate?: boolean,
): { text: string | undefined; script: ContentObject["script"] };
