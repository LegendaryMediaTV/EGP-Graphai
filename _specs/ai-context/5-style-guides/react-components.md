# React Components Style Guide

## Overview

React components in this project are written in JSX, transpiled at runtime via Babel standalone. They follow a functional component pattern with hooks for all state and lifecycle management.

## Structure Pattern

```javascript
// 1. Destructure React hooks at top
const { useState, useEffect, useMemo, useRef } = React;

// 2. Component function with props destructuring
function ComponentName({ prop1, prop2, settings, onAction }) {
  // 3. State declarations
  const [localState, setLocalState] = useState(initialValue);

  // 4. Derived state with useMemo
  const derivedValue = useMemo(() => {
    return computeExpensiveValue(prop1);
  }, [prop1]);

  // 5. Effects
  useEffect(() => {
    // Side effect logic
    return () => { /* cleanup */ };
  }, [dependencies]);

  // 6. Event handlers
  const handleClick = () => { ... };

  // 7. Early returns for loading/empty states
  if (!data) return <div>Loading...</div>;

  // 8. Main render
  return (
    <div className="tailwind-classes">
      {/* JSX content */}
    </div>
  );
}

// 9. Register on window for cross-file access
window.ComponentName = ComponentName;
```

## Naming and Organization

- **File names** – `PascalCase.js` matching component name (e.g., `App.js`, `BibleContent.js`)
- **Components** – `PascalCase` functions (e.g., `ContentNode`, `VerseRenderer`)
- **Props** – `camelCase` (e.g., `selectedBookId`, `onFootnoteClick`)
- **Event handlers** – `handle` prefix (e.g., `handleChapterChange`, `handleClick`)
- **Folder structure**:
  - `web/public/js/` – Main components
  - `web/public/js/components/` – UI components

## State Management Patterns

### Centralized State in App

```javascript
// All major state lives in App component
const [versions, setVersions] = useState([]);
const [selectedVersionId, setSelectedVersionId] = useState("");
const [settings, setSettings] = useState({ ... });
```

### Prop Drilling for Data Flow

```javascript
// Parent passes state and handlers as props
<ChildComponent
  settings={settings}
  selectedId={selectedId}
  onSelect={setSelectedId}
/>
```

### Toggle Pattern for Boolean Settings

```javascript
const toggleSetting = (key) => {
  setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
};
```

### Derived State with useMemo

```javascript
const currentVersion = useMemo(
  () => versions.find((v) => v._id === selectedVersionId),
  [versions, selectedVersionId]
);
```

## Styling Patterns

### Tailwind Utility Classes

```javascript
<div className="flex items-center gap-3 px-4 py-2">
  <span className="text-sm font-bold text-gray-500">Label</span>
</div>
```

### Dark Mode with Conditional Classes

```javascript
<div className={`px-4 py-2 ${
  settings.darkMode
    ? "bg-gray-800 text-gray-100"
    : "bg-white text-gray-900"
}`}>
```

### Script-Specific Font Classes

```javascript
const scriptClass =
  node.script === "H"
    ? "script-hebrew"
    : node.script === "G"
    ? "script-greek"
    : "";
```

## Example: Feature Component

```javascript
const { useState, useEffect, useMemo } = React;

function BibleContent({ content, settings, onFootnoteClick }) {
  // Early return for empty state
  if (!content || content.length === 0) {
    return (
      <div className="text-center text-gray-400 mt-10">
        Select a book and chapter to begin reading.
      </div>
    );
  }

  // Computed style based on settings
  const style = {
    fontSize: `${settings.fontSize}px`,
    fontFamily: '"Atkinson Hyperlegible", sans-serif',
  };

  // Derived data
  const footnotes = useMemo(() => {
    if (!settings.showFootnotes) return [];
    const notes = [];
    // ... extraction logic
    return notes;
  }, [content, settings.showFootnotes]);

  return (
    <div className="flex flex-col gap-8">
      {settings.paragraphMode ? (
        <div style={style}>
          {content.map((verse) => (
            <VerseRenderer
              key={`${verse.book}-${verse.chapter}-${verse.verse}`}
              verse={verse}
              settings={settings}
              onFootnoteClick={onFootnoteClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col" style={style}>
          {content.map((verse) => (
            <div
              key={`${verse.book}-${verse.chapter}-${verse.verse}`}
              className="flex gap-3 group hover:bg-gray-50"
            >
              {/* verse content */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

window.BibleContent = BibleContent;
```

## Example: Recursive Component

```javascript
const { useState } = React;

function ContentNode({ node, settings, onFootnoteClick }) {
  // Handle null/undefined
  if (!node) return null;

  // Handle array (recursive)
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <ContentNode
        key={i}
        node={child}
        settings={settings}
        onFootnoteClick={onFootnoteClick}
      />
    ));
  }

  // Handle string
  if (typeof node === "string") {
    return <span>{node}</span>;
  }

  // Handle object variants
  if (node.heading) {
    if (!settings.showHeadings) return null;
    return (
      <h3 className="text-xl font-bold mt-6 mb-3">
        <ContentNode node={node.heading} settings={settings} />
      </h3>
    );
  }

  // Handle text node with annotations
  const scriptClass =
    node.script === "H"
      ? "script-hebrew"
      : node.script === "G"
      ? "script-greek"
      : "";

  return (
    <span className={`inline ${scriptClass}`}>
      {node.text}
      {node.break && <br />}
    </span>
  );
}

window.ContentNode = ContentNode;
```
