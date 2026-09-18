/**
 * Desktop book list, hidden below the `md` breakpoint where {@link MobileNav}
 * takes over. Each button's tooltip is the book's full title, romanized or not
 * to match the list itself, so hovering never contradicts what is on screen.
 *
 * @param {object} props
 * @param {object} props.settings - Reader settings; `darkMode` and
 *   `showTransliteration` are the two read here
 */
function Sidebar({
  settings,
  availableBooks,
  selectedBookId,
  setSelectedBookId,
  setSelectedChapter,
}) {
  return (
    <aside
      className={`hidden md:flex flex-col w-64 border-r ${
        settings.darkMode
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="p-4 border-b dark:border-gray-700 font-semibold text-sm uppercase tracking-wider text-gray-500">
        Books
      </div>
      <div className="flex-1 overflow-y-auto">
        {availableBooks.map((book) => (
          <button
            key={book._id}
            title={getFootnoteText(
              book.title,
              null,
              settings.showTransliteration,
            )}
            onClick={() => {
              setSelectedBookId(book._id);
              setSelectedChapter(1);
            }}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors ${
              selectedBookId === book._id
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium border-r-4 border-blue-500"
                : ""
            }`}
          >
            <BookName
              book={book}
              transliterate={settings.showTransliteration}
            />
          </button>
        ))}
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
