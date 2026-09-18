/**
 * Decides which of a text node's own strings prints, and in which script,
 * while the reader's transliteration setting is on or off. Verse text and book
 * names both run through here, so a romanized chapter beside a sidebar still
 * reading Greek is not a state the reader can get into.
 *
 * The script comes back with the text because the two are one decision: a
 * romanization is Latin, so it takes neither the script font nor the RTL
 * direction the node's own text would. A node carrying no romanization keeps
 * its script, which is what leaves a version that has never been through the
 * enrichment pass readable rather than blank. A node whose stored romanization
 * equals its own text — the marking for a form that does not romanize, such as
 * the alphabetic numeral `Αʹ` — still counts as romanized, so those glyphs
 * print in the body font beside the Latin around them.
 *
 * The browser's counterpart to `textOf` in `utils/exportContent.ts`.
 *
 * @param {object} node - A `Content` text node: `{ text?, script?,
 *   transliteration?, … }`
 * @param {boolean} [transliterate] - The reader's
 *   `settings.showTransliteration`
 * @returns {{ text: string|undefined, script: string|undefined }} What to
 *   print, and the script to style it as — `undefined` for Latin
 */
function printedTextOf(node, transliterate) {
  const romanized = Boolean(transliterate) && node.transliteration != null;
  return {
    text: romanized ? node.transliteration : node.text,
    script: romanized ? undefined : node.script,
  };
}

if (typeof window !== "undefined") {
  window.printedTextOf = printedTextOf;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { printedTextOf };
}
