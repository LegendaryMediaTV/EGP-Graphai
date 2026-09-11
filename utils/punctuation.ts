/**
 * Where a printed word ends, for looking it up in the lexical map.
 *
 * The map is keyed by the spelling as the text prints it, so a lookup has to
 * take the punctuation off and nothing else. Two marks make that harder than it
 * sounds:
 *
 * - **The Greek ano teleia** (U+0387) and **question mark** (U+037E) look
 *   exactly like a middle dot and a semicolon. Written literally they are
 *   unreadable in a character class and get lost silently the first time
 *   something rewrites the file, which is why they are escapes here.
 * - **An elision apostrophe is part of the word.** Greek writes `μετά` as
 *   `μεθ’` before a rough breathing, and the map keys that spelling with the
 *   mark. Stripping it turns a spelling the map holds into one it does not, and
 *   nothing local tells an elision apart from a closing quote, so both forms
 *   are offered and the caller tries each.
 */

/** Opening punctuation, quotes and dashes. */
const LEADING = /^[\s"'“”‘(\[{«¿¡–—-]+/u;

/** Closing punctuation, including the ano teleia and the Greek question mark. */
const TRAILING = /[\s.,:!?"'“”)\]}»··;;–—-]+$/u;

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
