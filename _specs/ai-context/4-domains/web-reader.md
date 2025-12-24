# Web Reader Domain

## Overview

The Graphai Reader is a single-page web application for reading and studying Bible texts with rich annotations. It provides a responsive interface with toggleable study tools, multiple display modes, and theming support.

## Core Entities

### Application State

```typescript
interface AppState {
  // Data State
  versions: Version[];
  selectedVersionId: string;
  selectedBookId: string;
  selectedChapter: number;
  bookContent: Verse[];
  loading: boolean;
  activeFootnote: Content | null;

  // UI State
  isSettingsOpen: boolean;
  isNavOpen: boolean;

  // Settings State
  settings: Settings;
}

interface Settings {
  paragraphMode: boolean; // Paragraph vs verse-by-verse display
  showVerseNumbers: boolean; // Superscript verse numbers
  showStrongs: boolean; // Strong's number annotations
  showMorph: boolean; // Morphology codes
  showLemma: boolean; // Lexical lemmas
  showFootnotes: boolean; // Footnote markers and content
  showHeadings: boolean; // Section headings
  showSubtitles: boolean; // Psalm subtitles, etc.
  showWoC: "none" | "red" | "blue" | "purple"; // Words of Christ color
  darkMode: boolean; // Dark theme
  fontSize: number; // Font size in pixels
}
```

### Component Hierarchy

```
App
├── Header
│   └── Version Selector
├── Sidebar (Desktop)
│   └── Book List
├── MobileNav (Mobile)
│   ├── Version Selector
│   └── Book List
├── ChapterNav
├── BibleContent
│   └── VerseRenderer (per verse)
│       └── ContentNode (recursive)
├── SettingsDrawer
├── FootnoteModal
└── Icons
```

## User Workflows

- **Select Version** – Choose Bible translation from dropdown
- **Select Book** – Click book in sidebar or mobile navigation
- **Navigate Chapters** – Use previous/next buttons or dropdown
- **Read Content** – View verses in paragraph or verse-by-verse mode
- **Study Annotations** – Toggle Strong's numbers, morphology, lemmas
- **View Footnotes** – Click footnote markers to open modal/tooltip
- **Adjust Display** – Change font size, dark mode, Words of Christ color
- **Cross Book Navigation** – Previous/next at chapter boundaries navigates to adjacent books

## Key Business Rules

- **Default Version** – Defaults to WEBUS2020 if available
- **Book Availability** – Switching versions may require changing book if not available
- **Chapter Bounds** – Chapter selection clamped to 1..maxChapters
- **Script-Specific Fonts** – Hebrew renders RTL with David Libre; Greek uses EB Garamond
- **Dark Mode Inheritance** – Respects system preference via `prefers-color-scheme`
- **Component Registration** – Each component assigned to `window` for cross-file access
- **Responsive Text Width** – Content max-width scales with font size: `768px * (fontSize / 16)`
- **Formatting Marks** – Supports italic (`i`), bold (`b`), Words of Christ (`woc`), and small caps (`sc`)
- **Small Caps Rendering** – CSS `font-variant: small-caps` applied to divine names (LORD)

## Representative Code Examples

### App State Initialization

_From [web/public/js/App.js](../web/public/js/App.js)_

```javascript
const [versions, setVersions] = useState([]);
const [selectedVersionId, setSelectedVersionId] = useState("");
const [selectedBookId, setSelectedBookId] = useState("");
const [selectedChapter, setSelectedChapter] = useState(1);
const [bookContent, setBookContent] = useState([]);
const [loading, setLoading] = useState(false);

const [settings, setSettings] = useState({
  paragraphMode: true,
  showVerseNumbers: true,
  showStrongs: true,
  showMorph: true,
  showLemma: false,
  showFootnotes: true,
  showHeadings: true,
  showSubtitles: true,
  showWoC: "red",
  darkMode: window.matchMedia("(prefers-color-scheme: dark)").matches,
  fontSize: 16,
});
```

### Content Loading

_From [web/public/js/App.js](../web/public/js/App.js)_

```javascript
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
```

### Recursive Content Rendering

_From [web/public/js/ContentNode.js](../web/public/js/ContentNode.js)_

```javascript
function ContentNode({ node, settings, onFootnoteClick }) {
  if (!node) return null;

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <ContentNode key={i} node={child} settings={settings} />
    ));
  }

  if (typeof node === "string") {
    return <span>{node}</span>;
  }

  if (node.heading) {
    if (!settings.showHeadings) return null;
    return (
      <h3 className="text-xl font-bold">
        <ContentNode node={node.heading} />
      </h3>
    );
  }

  // Apply formatting marks (italic, bold, Words of Christ, small caps)
  let content = node.text || "";
  if (node.marks?.includes("i")) {
    content = <span className="italic">{content}</span>;
  }
  if (node.marks?.includes("b")) {
    content = <span className="font-bold">{content}</span>;
  }
  if (node.marks?.includes("sc")) {
    content = <span className="sc">{content}</span>;
  }
  if (settings.showWoC !== "none" && node.marks?.includes("woc")) {
    content = <span className={`woc woc-${settings.showWoC}`}>{content}</span>;
  }

  // Script-specific styling
  const scriptClass =
    node.script === "H"
      ? "script-hebrew"
      : node.script === "G"
        ? "script-greek"
        : "";

  return (
    <span
      className={`inline ${scriptClass}`}
      {...(node.script === "H" ? { dir: "rtl" } : {})}
    >
      {content}
      {parsingSpan}
      {node.break && <br />}
    </span>
  );
}
```

### Chapter Navigation

_From [web/public/js/App.js](../web/public/js/App.js)_

```javascript
const handleChapterChange = (newChapter) => {
  if (newChapter >= 1 && newChapter <= maxChapters) {
    setSelectedChapter(newChapter);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (newChapter < 1) {
    // Go to previous book's last chapter
    const currentBookIndex = availableBooks.findIndex(
      (b) => b._id === selectedBookId
    );
    if (currentBookIndex > 0) {
      const prevBook = availableBooks[currentBookIndex - 1];
      setSelectedBookId(prevBook._id);
      setSelectedChapter(prevBook.chapters);
    }
  } else if (newChapter > maxChapters) {
    // Go to next book's first chapter
    const currentBookIndex = availableBooks.findIndex(
      (b) => b._id === selectedBookId
    );
    if (currentBookIndex < availableBooks.length - 1) {
      const nextBook = availableBooks[currentBookIndex + 1];
      setSelectedBookId(nextBook._id);
      setSelectedChapter(1);
    }
  }
};
```

### Settings Toggle Pattern

_From [web/public/js/App.js](../web/public/js/App.js)_

```javascript
const toggleSetting = (key) => {
  setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
};
```

### Strong's Number Linking

_From [web/public/js/ContentNode.js](../web/public/js/ContentNode.js)_

```javascript
if (settings.showStrongs && node.strong) {
  const strongsLink = node.strong.startsWith("H")
    ? `https://www.equipgodspeople.com/lexicons-word-study/old-testament-hebrew/strongs-${node.strong.toLowerCase()}`
    : `https://www.equipgodspeople.com/lexicons-word-study/new-testament-greek/strongs-${node.strong.toLowerCase()}`;

  parsingInfo.push(
    <a
      key="s"
      href={strongsLink}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono font-bold text-gray-500 hover:underline"
    >
      {node.strong}
    </a>
  );
}
```
