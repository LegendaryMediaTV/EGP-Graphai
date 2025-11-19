function MobileNav({
  isOpen,
  onClose,
  settings,
  versions,
  selectedVersionId,
  setSelectedVersionId,
  availableBooks,
  selectedBookId,
  setSelectedBookId,
  setSelectedChapter,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-30 md:hidden">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div
        className={`absolute left-0 top-0 bottom-0 w-3/4 max-w-xs shadow-xl flex flex-col ${
          settings.darkMode ? "bg-gray-800" : "bg-white"
        }`}
      >
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h2 className="font-bold">Select Book</h2>
          <button onClick={onClose}>
            <Icons.Times />
          </button>
        </div>

        {/* Mobile Version Selector */}
        <div className="p-4 border-b dark:border-gray-700">
          <label className="block text-xs text-gray-500 mb-1">Version</label>
          <select
            className={`w-full border rounded px-2 py-2 ${
              settings.darkMode
                ? "bg-gray-700 border-gray-600"
                : "bg-gray-100 border-gray-300"
            }`}
            value={selectedVersionId}
            onChange={(e) => {
              setSelectedVersionId(e.target.value);
              const newVer = versions.find((v) => v._id === e.target.value);
              if (
                newVer &&
                !newVer.books.find((b) => b._id === selectedBookId)
              ) {
                setSelectedBookId(newVer.books[0]._id);
              }
            }}
          >
            {versions.map((v) => (
              <option key={v._id} value={v._id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {availableBooks.map((book) => (
            <button
              key={book._id}
              onClick={() => {
                setSelectedBookId(book._id);
                setSelectedChapter(1);
                onClose();
              }}
              className={`w-full text-left px-4 py-3 border-b dark:border-gray-700 ${
                selectedBookId === book._id
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  : ""
              }`}
            >
              <BookName book={book} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

window.MobileNav = MobileNav;
