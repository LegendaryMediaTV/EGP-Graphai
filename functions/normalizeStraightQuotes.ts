import Content from "../types/Content";
import { mapContentText } from "./mapContentText";

/**
 * Write every straight `'`/`"` in raw source text as the correctly directed
 * curly counterpart this repo's own punctuation convention uses everywhere
 * else: U+2018/U+2019 for a single quote or apostrophe, U+201C/U+201D for a
 * double quote.
 *
 * Direction is decided the way real typography tools decide it, not by
 * treating `'` as a fixed apostrophe and `"` as a fixed pair: a quote
 * character opens when the character immediately before it is the start of
 * the string, whitespace, or an opening bracket; otherwise it closes. An
 * apostrophe inside a word ("don't") falls out of the closing rule for
 * free — U+2019 is the correct glyph for both a closing single quote and an
 * apostrophe, so no separate apostrophe case is needed.
 *
 * The one addition beyond that classic rule: when a quote character sits
 * immediately next to another quote character with nothing between them —
 * `"'"asdf" is' whatever"` opening three levels of nesting at once, then
 * closing them one at a time as real text intervenes — the second character
 * inherits the first's own direction instead of being judged alone. Two
 * quote characters back to back are one nesting boundary, not an isolated
 * character followed by a coincidental start-of-word; treating them
 * independently would get a bunched closing run wrong the moment real text
 * doesn't happen to line up the way an opening run does.
 *
 * A leading elision ('80s, 'tis, 'em) is the one shape this still gets
 * wrong: nothing before it looks like a closer, so it opens instead. Not
 * worth a curated word list for now — this corpus's own translations don't
 * carry that idiom (see this module's own test coverage) — revisit if a
 * future import ever does.
 */

/** U+2018 LEFT SINGLE QUOTATION MARK. */
const OPENING_SINGLE = "‘";
/** U+2019 RIGHT SINGLE QUOTATION MARK — also this repo's own apostrophe. */
const CLOSING_SINGLE = "’";
/** U+201C LEFT DOUBLE QUOTATION MARK. */
const OPENING_DOUBLE = "“";
/** U+201D RIGHT DOUBLE QUOTATION MARK. */
const CLOSING_DOUBLE = "”";

/** A character immediately before a quote that means the quote opens: whitespace or an opening bracket. Start-of-string is handled separately, since there is no character to test. */
const OPENING_CONTEXT = /[\s([{]/;

/** Whether the character right before a quote (`undefined` at the start of the string) puts that quote in opening position. */
function isOpeningContext(previous: string | undefined): boolean {
  return previous === undefined || OPENING_CONTEXT.test(previous);
}

/** What one call to {@link normalizeQuoteText} changed. */
export interface QuoteNormalization {
  /** The text with every straight `'`/`"` replaced by its correctly directed curly counterpart. */
  value: string;
  /** Straight characters converted. Two in one string contributes two. */
  changes: number;
}

/**
 * Normalizes every straight `'`/`"` in one string to the correctly directed
 * curly counterpart — see this module's own top doc comment for the
 * direction rule, including the adjacent-quote nesting case. Text with
 * neither character passes through unchanged, with `changes: 0`.
 *
 * Direction lookups always read `original`, the untouched input, never the
 * `output` this function is building — an already-rewritten neighbor is a
 * curly character, not `'`/`"`, so testing it instead of the original would
 * silently break the adjacent-quote propagation this function exists to get
 * right.
 *
 * @param text - Raw source text, however it spells a quote, or none at all.
 */
export function normalizeQuoteText(text: string): QuoteNormalization {
  let changes = 0;
  const original = [...text];
  const output = [...text];
  const openers: boolean[] = [];

  for (let i = 0; i < original.length; i++) {
    const character = original[i];
    if (character !== "'" && character !== '"') continue;

    const previous = i > 0 ? original[i - 1] : undefined;
    const previousIsQuote = previous === "'" || previous === '"';
    const opener = previousIsQuote ? openers[i - 1] : isOpeningContext(previous);
    openers[i] = opener;

    output[i] = character === "'"
      ? (opener ? OPENING_SINGLE : CLOSING_SINGLE)
      : (opener ? OPENING_DOUBLE : CLOSING_DOUBLE);
    changes += 1;
  }

  return { value: changes > 0 ? output.join("") : text, changes };
}

/**
 * Walks a content tree and normalizes every straight `'`/`"` it finds, via
 * {@link normalizeQuoteText} above, using the same {@link mapContentText}
 * traversal `functions/normalizeFractions.ts` and
 * `functions/normalizeEllipses.ts` share.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @returns The rewritten tree (structurally new only where something
 *   changed, otherwise the original reference) and whether anything changed
 *   at all
 */
export function normalizeQuotesInContent(
  content: Content
): { content: Content; changed: boolean } {
  return mapContentText(content, (text) => {
    const rewritten = normalizeQuoteText(text);
    return rewritten.changes > 0 ? rewritten.value : undefined;
  });
}

export default normalizeQuotesInContent;
