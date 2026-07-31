function ChapterNav({
  settings,
  currentBook,
  selectedChapter,
  handleChapterChange,
  maxChapters,
  availableBooks,
  selectedBookId,
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2 border-b shadow-sm z-10 ${
        settings.darkMode
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-200"
      }`}
    >
      <button
        disabled={
          selectedChapter <= 1 &&
          availableBooks.findIndex((b) => b._id === selectedBookId) === 0
        }
        onClick={() => handleChapterChange(selectedChapter - 1)}
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
      >
        <Icons.ChevronLeft />
      </button>

      <div className="flex items-center gap-2">
        <span className="font-semibold hidden sm:inline">
          <BookName book={currentBook} />
        </span>
        <select
          value={selectedChapter}
          onChange={(e) => handleChapterChange(Number(e.target.value))}
          className={`border rounded px-2 py-1 font-mono ${
            settings.darkMode
              ? "bg-gray-700 border-gray-600"
              : "bg-gray-100 border-gray-300"
          }`}
        >
          {Array.from({ length: maxChapters }, (_, i) => i + 1).map((c) => (
            <option key={c} value={c}>
              Ch {c}
            </option>
          ))}
        </select>
      </div>

      <button
        disabled={
          selectedChapter >= maxChapters &&
          availableBooks.findIndex((b) => b._id === selectedBookId) ===
            availableBooks.length - 1
        }
        onClick={() => handleChapterChange(selectedChapter + 1)}
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
      >
        <Icons.ChevronRight />
      </button>
    </div>
  );
}

window.ChapterNav = ChapterNav;
