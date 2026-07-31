function Header({
  settings,
  versions,
  selectedVersionId,
  setSelectedVersionId,
  selectedBookId,
  setSelectedBookId,
  setIsNavOpen,
  setIsSettingsOpen,
}) {
  return (
    <header
      className={`flex items-center justify-between px-4 py-3 shadow-md z-20 ${
        settings.darkMode ? "bg-gray-800 border-b border-gray-700" : "bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsNavOpen(true)}
          className="md:hidden p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <Icons.Bars />
        </button>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400">
            <Icons.Book />
          </span>
          Graphai Reader
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Desktop Version Selector */}
        <div className="hidden md:block">
          <select
            className={`border rounded px-2 py-1 text-sm max-w-xs truncate ${
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

        <button
          onClick={() => setIsSettingsOpen(true)}
          className={`p-2 rounded-full transition-colors ${
            settings.darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
          }`}
          title="Settings"
        >
          <Icons.Cog />
        </button>
      </div>
    </header>
  );
}

window.Header = Header;
