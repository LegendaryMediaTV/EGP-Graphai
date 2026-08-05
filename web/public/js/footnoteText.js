/**
 * Extracts the flattened display text from a footnote's `content`, which
 * may be a plain string, an array of strings/objects (e.g. joined
 * cross-reference segments), a `{ bibleLink, content? }` object (the
 * display override wins over the raw link), or a `{ text }` node. Recurses
 * until a string is produced.
 *
 * @param {string|Array|object|null|undefined} content - Footnote content in
 *   any shape emitted by the source Bible JSON
 * @returns {string} The joined display text, or `""` if none can be derived
 */
function getFootnoteText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((n) => getFootnoteText(n)).join("");
  }
  if (content && typeof content === "object") {
    if (content.bibleLink)
      return getFootnoteText(content.content) || content.bibleLink;
    if (content.text) return content.text;
  }
  return "";
}

if (typeof window !== "undefined") {
  window.getFootnoteText = getFootnoteText;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getFootnoteText };
}
