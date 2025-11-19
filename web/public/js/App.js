const { useState, useEffect, useMemo, useRef } = React;

// --- Main App Component ---
function App() {
  // Data State
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [bookContent, setBookContent] = useState([]);
  const [loading, setLoading] = useState(false);

  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false); // For mobile book nav

  // Settings State
  const [settings, setSettings] = useState({
    paragraphMode: true,
    showVerseNumbers: true,
    showStrongs: false,
    showMorph: false,
    showLemma: false,
    showFootnotes: true,
    showHeadings: true,
    showSubtitles: true,
    showWoC: "red", // Words of Christ: "none", "red", "blue", "purple"
    darkMode:
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    fontSize: 16,
  }); // Derived Data
  const currentVersion = useMemo(
    () => versions.find((v) => v._id === selectedVersionId),
    [versions, selectedVersionId]
  );
  const availableBooks = useMemo(
    () => (currentVersion ? currentVersion.books : []),
    [currentVersion]
  );
  const currentBook = useMemo(
    () => availableBooks.find((b) => b._id === selectedBookId),
    [availableBooks, selectedBookId]
  );
  const maxChapters = useMemo(
    () => (currentBook ? currentBook.chapters : 1),
    [currentBook]
  );

  // --- Effects ---

  // Initial Load
  useEffect(() => {
    fetch("/api/versions")
      .then((res) => res.json())
      .then((data) => {
        setVersions(data);
        if (data.length > 0) {
          // Default to WEBUS2020 if available, otherwise first one
          const defaultVer = data.find((v) => v._id === "WEBUS2020") || data[0];
          setSelectedVersionId(defaultVer._id);

          // Default to first book of selected version
          if (defaultVer.books && defaultVer.books.length > 0) {
            setSelectedBookId(defaultVer.books[0]._id);
          }
        }
      });
  }, []);

  // Load Content
  useEffect(() => {
    if (!selectedVersionId || !selectedBookId) return;

    setLoading(true);
    fetch(`/api/content/${selectedVersionId}/${selectedBookId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load content");
        return res.json();
      })
      .then((data) => {
        setBookContent(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setBookContent([]);
        setLoading(false);
      });
  }, [selectedVersionId, selectedBookId]);

  // Chapter Validation
  useEffect(() => {
    if (selectedChapter > maxChapters) setSelectedChapter(1);
  }, [maxChapters, selectedChapter]);

  // Dark Mode Effect
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.darkMode]);

  // --- Handlers ---

  const toggleSetting = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChapterChange = (newChapter) => {
    if (newChapter >= 1 && newChapter <= maxChapters) {
      setSelectedChapter(newChapter);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (newChapter < 1) {
      // Go to previous book
      const currentBookIndex = availableBooks.findIndex(
        (b) => b._id === selectedBookId
      );
      if (currentBookIndex > 0) {
        const prevBook = availableBooks[currentBookIndex - 1];
        setSelectedBookId(prevBook._id);
        setSelectedChapter(prevBook.chapters); // Go to last chapter
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else if (newChapter > maxChapters) {
      // Go to next book
      const currentBookIndex = availableBooks.findIndex(
        (b) => b._id === selectedBookId
      );
      if (currentBookIndex < availableBooks.length - 1) {
        const nextBook = availableBooks[currentBookIndex + 1];
        setSelectedBookId(nextBook._id);
        setSelectedChapter(1); // Go to first chapter
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };
  const chapterContent = useMemo(() => {
    return bookContent.filter((v) => v.chapter === selectedChapter);
  }, [bookContent, selectedChapter]);

  return (
    <div
      className={`flex flex-col h-screen ${
        settings.darkMode
          ? "bg-gray-900 text-gray-100"
          : "bg-gray-50 text-gray-900"
      } transition-colors duration-300`}
    >
      <Header
        settings={settings}
        versions={versions}
        selectedVersionId={selectedVersionId}
        setSelectedVersionId={setSelectedVersionId}
        selectedBookId={selectedBookId}
        setSelectedBookId={setSelectedBookId}
        setIsNavOpen={setIsNavOpen}
        setIsSettingsOpen={setIsSettingsOpen}
      />

      {/* --- Main Layout --- */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          settings={settings}
          availableBooks={availableBooks}
          selectedBookId={selectedBookId}
          setSelectedBookId={setSelectedBookId}
          setSelectedChapter={setSelectedChapter}
        />

        <MobileNav
          isOpen={isNavOpen}
          onClose={() => setIsNavOpen(false)}
          settings={settings}
          versions={versions}
          selectedVersionId={selectedVersionId}
          setSelectedVersionId={setSelectedVersionId}
          availableBooks={availableBooks}
          selectedBookId={selectedBookId}
          setSelectedBookId={setSelectedBookId}
          setSelectedChapter={setSelectedChapter}
        />

        {/* --- Content Area --- */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <ChapterNav
            settings={settings}
            currentBook={currentBook}
            selectedChapter={selectedChapter}
            handleChapterChange={handleChapterChange}
            maxChapters={maxChapters}
            availableBooks={availableBooks}
            selectedBookId={selectedBookId}
          />

          {/* Scrollable Text Area */}
          <div
            className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth"
            id="content-scroll-container"
          >
            <div className="max-w-3xl mx-auto pb-20">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <BibleContent content={chapterContent} settings={settings} />
              )}
            </div>
          </div>
        </main>

        <SettingsDrawer
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          setSettings={setSettings}
          toggleSetting={toggleSetting}
        />
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
