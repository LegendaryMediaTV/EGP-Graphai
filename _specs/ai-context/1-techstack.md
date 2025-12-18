# Tech Stack Analysis

## Core Technology Analysis

### Programming Languages

- **TypeScript** – Primary language for all backend utilities, validation scripts, and export tools. Provides strict typing for Bible data structures.
- **JavaScript (JSX via Babel)** – Used for the React-based web reader frontend, transpiled in-browser using Babel standalone.
- **JSON** – Core data format for all Bible content, schemas, and configuration.

### Primary Framework

- **Node.js** – Runtime environment for all TypeScript utilities and the web server.
- **React 18** – Frontend library loaded via CDN for the Graphai Reader web application. Uses hooks (`useState`, `useEffect`, `useMemo`, `useRef`) extensively.

### Secondary/Tertiary Frameworks

- **http (Node.js built-in)** – Used for the simple Express-less web server (`web/server.ts`).
- **AJV (Another JSON Validator)** – JSON Schema validation library for validating Bible data against schemas.
- **Tailwind CSS (CDN)** – Utility-first CSS framework loaded via CDN for styling the web reader.
- **Font Awesome (CDN)** – Icon library for UI icons in the web reader.
- **Lodash** – Utility library used in validation scripts for data manipulation (grouping, sorting, difference operations).
- **ts-node** – TypeScript execution engine for running `.ts` files directly without compilation.
- **Vitest** – Modern test runner (configured but no tests currently exist).

### State Management Approach

- **React Local State** – All frontend state managed via `useState` hooks in the main `App.js` component.
- **Prop Drilling** – Settings, selection state, and handlers passed down through component hierarchy.
- **Derived State with useMemo** – Computed values like `currentVersion`, `availableBooks`, and `chapterContent` derived from state.
- **No Global State Library** – No Redux, Zustand, or Context API used; state is centralized in App component.

### Other Relevant Technologies

- **JSON Schema (Draft-07)** – Schema definitions for validating Bible data structure and content.
- **Google Fonts** – Custom fonts loaded for proper rendering of Greek (`EB Garamond`), Hebrew (`David Libre`), and Latin (`Atkinson Hyperlegible`) scripts.
- **File System (fs)** – Node.js file system module used extensively for reading/writing Bible data files.

## Domain Specificity Analysis

### Problem Domain

EGP Graphai is a **Bible resource data management and display system**. It provides a comprehensive JSON standard for storing and rendering Bible texts with rich scholarly annotations including Strong's numbers (Hebrew/Greek lexicon references), morphological codes (grammatical parsing), and lexical lemmas (dictionary forms). The system supports multiple Bible versions across different languages and scripts.

### Core Business Concepts

- **Bible Versions** – Registry of Bible translations/editions with metadata (ASV1901, KJV1769, WEBUS2020, BYZ2018, etc.)
- **Books** – Canonical Bible books with identifiers, names, titles, testament classification (OT/NT), and alternate abbreviations
- **Verses** – Individual verse records with chapter, verse number, and structured content
- **Content** – Flexible nested structure supporting plain text, formatted text, headings, paragraphs, subtitles
- **Strong's Numbers** – Lexicon references in format `G####` (Greek) or `H####` (Hebrew)
- **Morphological Codes** – Grammatical parsing information (Robinson or Packard format)
- **Footnotes** – Study notes, translation notes, textual variants, cross-references, and maps
- **Scripts** – Support for Greek (G), Hebrew (H), and Latin script rendering

### User Interactions

- **Browse Bible versions** – Select from available Bible translations
- **Navigate books and chapters** – Book sidebar, chapter navigation controls
- **Read scripture** – Paragraph mode or verse-by-verse display
- **Toggle study tools** – Show/hide Strong's numbers, morphology, lemmas, footnotes
- **View "Words of Christ"** – Highlight Jesus' words in configurable colors (red, blue, purple)
- **Adjust display settings** – Dark mode, font size, heading visibility
- **Export content** – Convert JSON to text (with Strong's annotations) or markdown formats
- **Validate data** – Run schema validation on all Bible data files
