/**
 * Where a printed word ends: once for looking it up in the lexical map, and
 * once for taking a printed string apart without losing anything.
 *
 * The two exports answer different questions and both are wanted.
 * {@link spellingsOf} asks *what keys could this printed token be looked up
 * under*, so it discards what it stripped and offers the elision-marked and
 * bare pair a caller tries in turn. {@link tokensOf} asks *what is this string
 * made of*, so it keeps every character and says only which run is a word. They
 * are also defined opposite ways round — `spellingsOf` names the marks it
 * strips, `tokensOf` the letters it keeps — so a mark neither list anticipated
 * lands correctly in one and would need the other extended. Rewriting either in
 * terms of the other would move an answer its own callers depend on.
 *
 * The map is keyed by the spelling as the text prints it, so a lookup has to
 * take the punctuation off and nothing else. The hard case is the elision
 * apostrophe, which is **part of the word**: Greek writes `μετά` as `μεθ’`
 * before a rough breathing, and the map keys that spelling with the mark.
 * Stripping it turns a spelling the map holds into one it does not, and nothing
 * local tells an elision apart from a closing quote, so both forms are offered
 * and the caller tries each.
 */

/** Opening punctuation, quotes and dashes. */
const LEADING = /^[\s"'“”‘(\[{«¿¡–—-]+/u;

/**
 * Closing punctuation. The ano teleia and the Greek question mark are escapes,
 * and the middle dot and the ASCII semicolon they are indistinguishable from
 * sit beside them as literals — all four, deliberately, because a spelling can
 * reach this class carrying either the real mark or the look-alike some earlier
 * rewrite left in its place, and a lookup key is wrong either way.
 */
const TRAILING = /[\s.,:!?"'“”)\]}»·\u0387\u037E;–—-]+$/u;

/** A trailing elision mark, which may or may not belong to the word. */
const ELISION = /[’'‘]+$/u;

/**
 * The spellings one printed word could be keyed under, most literal first.
 *
 * @param text A node's printed text, spaces and all.
 * @returns One spelling, or two when the word ends in an elision mark.
 */
export function spellingsOf(text: string): string[] {
  const trimmed = text.replace(LEADING, "").replace(TRAILING, "");
  const withMark = trimmed.replace(TRAILING, "");
  const bare = withMark.replace(ELISION, "").replace(TRAILING, "");
  return withMark === bare ? [withMark] : [withMark, bare];
}

/**
 * A word: letters, the combining marks that sit on them, and an elision
 * apostrophe, which the map keys as part of the spelling.
 *
 * Stated as the letters to keep rather than the marks to drop, so a mark nobody
 * anticipated is handled by being neither.
 */
const WORD = /[\p{L}\p{M}’']+/gu;

/** One stretch of a printed string, as {@link tokensOf} takes it apart. */
export interface TextRun {
  /** The run's characters, exactly as the text printed them. */
  text: string;
  /** True for a run of letters, false for everything between and around them. */
  word: boolean;
}

/**
 * A printed string as alternating word and mark runs, losing nothing.
 *
 * The runs concatenate back to the input character for character, which is what
 * lets a caller rewrite the words and leave the rest — a transliteration keeps
 * the text's own spacing and word boundaries by not touching them.
 *
 * Runs alternate, and the string may begin or end with either kind, so a caller
 * reads `word` rather than counting positions. Empty runs are never emitted.
 *
 * @param text A node's printed text, spaces and all.
 */
export function tokensOf(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let at = 0;
  for (const match of text.matchAll(WORD)) {
    if (match.index > at) runs.push({ text: text.slice(at, match.index), word: false });
    runs.push({ text: match[0], word: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), word: false });
  return runs;
}
