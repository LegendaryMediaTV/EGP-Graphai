# UI Components Style Guide

## Overview

UI components in `web/public/js/components/` are reusable building blocks for the Graphai Reader interface. They receive props from parent components and focus on presentation and local interaction.

## Structure Pattern

```javascript
// 1. Function declaration with props destructuring
function ComponentName({ settings, data, selectedValue, onSelect, onClose }) {
  // 2. Early return for conditional rendering
  if (!isOpen) return null;

  // 3. Local state (minimal, UI-only)
  const [localUIState, setLocalUIState] = useState(false);

  // 4. Main render with Tailwind classes
  return (
    <div className="tailwind-utility-classes">{/* Component content */}</div>
  );
}

// 5. Register on window
window.ComponentName = ComponentName;
```

## Naming and Organization

- **File names** – `PascalCase.js` in `components/` folder
- **Components** – `PascalCase` (e.g., `Header`, `Sidebar`, `Toggle`)
- **Props** – `camelCase`, prefixed appropriately:
  - `is*` for boolean states (e.g., `isOpen`, `isSelected`)
  - `on*` for callbacks (e.g., `onClose`, `onClick`)
  - `set*` for state setters (e.g., `setSelectedId`)

## Common UI Patterns

### Conditional Rendering

```javascript
function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return <div className="fixed inset-0 z-50">{children}</div>;
}
```

### Dark Mode Styling

```javascript
<div className={`border rounded ${
  settings.darkMode
    ? "bg-gray-800 border-gray-700 text-gray-100"
    : "bg-white border-gray-200 text-gray-900"
}`}>
```

### Backdrop with Click-to-Close

```javascript
<div className="absolute inset-0 z-40">
  <div
    className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
    onClick={onClose}
  />
  <div className="relative z-50">{/* Modal content */}</div>
</div>
```

### List with Selection State

```javascript
{
  items.map((item) => (
    <button
      key={item._id}
      onClick={() => onSelect(item._id)}
      className={`w-full text-left px-4 py-2 ${
        selectedId === item._id
          ? "bg-blue-100 text-blue-600 border-r-4 border-blue-500"
          : "hover:bg-gray-50"
      }`}
    >
      {item.name}
    </button>
  ));
}
```

### Toggle Component

```javascript
function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`block w-4 h-4 bg-white rounded-full transform transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
```

## Example: Header Component

```javascript
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
        <div className="hidden md:block">
          <select
            className={`border rounded px-2 py-1 text-sm ${
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
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Settings"
        >
          <Icons.Cog />
        </button>
      </div>
    </header>
  );
}

window.Header = Header;
```

## Example: Sidebar Component

```javascript
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
            title={
              typeof book.title === "string"
                ? book.title
                : book.title?.text || ""
            }
            onClick={() => {
              setSelectedBookId(book._id);
              setSelectedChapter(1);
            }}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
              selectedBookId === book._id
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium border-r-4 border-blue-500"
                : "hover:bg-blue-50 dark:hover:bg-gray-700"
            }`}
          >
            <BookName book={book} />
          </button>
        ))}
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
```
