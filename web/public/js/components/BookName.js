/**
 * Prints one book's name, in Greek or Hebrew or romanized, wherever the reader
 * names a book — the desktop sidebar, the mobile book drawer and the chapter
 * nav all go through here, which is why the transliteration setting only has
 * to be handed to this one component to reach all three.
 *
 * @param {object} props
 * @param {object} props.book - A version's book entry; its `name` may be a
 *   `Content` node or a plain string
 * @param {boolean} [props.transliterate] - The reader's
 *   `settings.showTransliteration`
 */
function BookName({ book, transliterate }) {
  if (!book) return null;

  // A version file may write a book's name as a bare string, which is the same
  // thing as a node carrying nothing but text.
  const name =
    typeof book.name === "string"
      ? { text: book.name }
      : book.name && typeof book.name === "object"
        ? book.name
        : null;

  if (!name) return <span>Unknown Book</span>;

  const { text, script } = printedTextOf(name, transliterate);

  // Unlike verse text, a book name is interface: with no script of its own it
  // takes the UI font rather than inheriting the reading font around it.
  const className =
    script === "H"
      ? "script-hebrew"
      : script === "G"
        ? "script-greek"
        : "font-sans";

  return <span className={className}>{text}</span>;
}

window.BookName = BookName;
