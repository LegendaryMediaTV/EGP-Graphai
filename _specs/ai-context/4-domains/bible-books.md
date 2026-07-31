# Bible Books Domain

## Overview

Bible Books represent the canonical collection of individual books in the Bible, including Old Testament, New Testament, and potentially Apocryphal works. The books registry provides metadata, naming conventions, and alternate abbreviations used across different referencing systems.

## Core Entities

### Book Registry (`bible-books.json`)

```typescript
interface Book {
  _id: string; // Unique 3-character identifier (e.g., "GEN", "MAT")
  name: Content; // Primary book name
  title: Content; // Full formal title
  testament: "OT" | "NT"; // Testament classification
  alt: string[]; // Alternate names/abbreviations
}
```

### Book Identifiers (Complete List)

**Old Testament (39 books):**
GEN, EXO, LEV, NUM, DEU, JSH, JDG, RTH, 1SM, 2SM, 1KG, 2KG, 1CH, 2CH, EZR, NEH, EST, JOB, PSA, PRV, ECC, SOS, ISA, JER, LAM, EZK, DAN, HOS, JOL, AMS, OBD, JNA, MIC, NAH, HAB, ZPH, HAG, ZEC, MAL

**New Testament (27 books):**
MAT, MRK, LUK, JHN, ACT, ROM, 1CO, 2CO, GAL, EPH, PHP, COL, 1TH, 2TH, 1TM, 2TM, TIT, PHM, HEB, JAS, 1PT, 2PT, 1JN, 2JN, 3JN, JUD, REV

## User Workflows

- **Book Navigation** – User clicks book in sidebar to load its content
- **Book Search** – Alternate abbreviations support various reference formats (e.g., "Gen", "Ge", "Gn" all map to Genesis)
- **Testament Filtering** – Books can be filtered/grouped by OT or NT (not currently exposed in UI)

## Key Business Rules

- **Unique Identifiers** – Book `_id` must be unique across all books
- **3-Character IDs** – All book identifiers are exactly 3 uppercase characters
- **Testament Classification** – Every book must be classified as OT or NT (Apocrypha grouped under OT)
- **Alternate Names** – Alt array provides flexibility for reference parsing
- **Content Type Support** – name and title can be plain strings or structured Content objects

## Representative Code Examples

### Book Schema Definition

_From [bible-books/bible-books-schema.json](../bible-books/bible-books-schema.json)_

```json
{
  "definitions": {
    "book": {
      "type": "object",
      "required": ["_id", "name", "title", "testament", "alt"],
      "properties": {
        "_id": {
          "type": "string",
          "description": "Unique 3-character identifier (e.g., 'GEN')."
        },
        "testament": {
          "type": "string",
          "enum": ["OT", "NT"],
          "description": "Apocrypha grouped under OT."
        },
        "alt": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "uniqueItems": true
        }
      }
    }
  }
}
```

### Book Data Example

_From [bible-books/bible-books.json](../bible-books/bible-books.json)_

```json
{
  "_id": "GEN",
  "name": "Genesis",
  "title": "The First Book of Moses, Commonly Called Genesis",
  "testament": "OT",
  "alt": ["Ge", "Gn", "Gen"]
}
```

### Book Validation

_From [utils/validate.ts](../utils/validate.ts)_

```typescript
// Load books for validation
const books = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
const validBookIds = new Set(books.map((book: any) => book._id));

// Check if filename matches a valid book ID
if (!validBookIds.has(bookIdFromFilename)) {
  console.error(
    `❌ Invalid filename: ${file} (book ID "${bookIdFromFilename}" not found)`
  );
  verseValidationPassed = false;
}
```

### Book Display in Sidebar

_From [web/public/js/components/Sidebar.js](../web/public/js/components/Sidebar.js)_

```javascript
{
  availableBooks.map((book) => (
    <button
      key={book._id}
      title={
        book.title && typeof book.title === "string"
          ? book.title
          : book.title && book.title.text
          ? book.title.text
          : ""
      }
      onClick={() => {
        setSelectedBookId(book._id);
        setSelectedChapter(1);
      }}
    >
      <BookName book={book} />
    </button>
  ));
}
```
