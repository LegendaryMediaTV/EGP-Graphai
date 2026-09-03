/**
 * The version's abbreviation registry, keyed by id, as `{ name, description }`
 * entries — or `null` where no version is in scope. Provided once by `App`
 * and read by `ContentNode`, rather than threaded through `BibleContent` and
 * `VerseRenderer`, neither of which has any use for it.
 */
const AbbreviationContext =
  typeof React !== "undefined" ? React.createContext(null) : null;

/**
 * Extracts the flattened display text from a footnote's `content`, which
 * may be a plain string, an array of strings/objects (e.g. joined
 * cross-reference segments), a `{ bibleLink, content? }` object (the
 * display override wins over the raw link), an `{ abbr }` reference, or a
 * `{ text }` node. Recurses until a string is produced.
 *
 * @param {string|Array|object|null|undefined} content - Footnote content in
 *   any shape emitted by the source Bible JSON
 * @param {Map<string, object>|null} [abbreviations] - The version's
 *   abbreviation registry, so an `{ abbr }` node reads as its display name
 *   rather than disappearing from the tooltip. Falls back to the bare id.
 * @returns {string} The joined display text, or `""` if none can be derived
 */
function getFootnoteText(content, abbreviations) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((n) => getFootnoteText(n, abbreviations)).join("");
  }
  if (content && typeof content === "object") {
    if (content.bibleLink)
      return (
        getFootnoteText(content.content, abbreviations) || content.bibleLink
      );
    if (content.abbr) {
      const entry = abbreviations && abbreviations.get(content.abbr);
      return entry ? getFootnoteText(entry.name, abbreviations) : content.abbr;
    }
    if (content.text) return content.text;
  }
  return "";
}

if (typeof window !== "undefined") {
  window.getFootnoteText = getFootnoteText;
  window.AbbreviationContext = AbbreviationContext;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getFootnoteText };
}
