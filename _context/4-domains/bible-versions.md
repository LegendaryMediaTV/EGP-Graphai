# Bible Versions Domain

## Overview

Bible Versions represent distinct translations, editions, or manuscripts of the Bible. Each version has metadata, licensing information, and a customized book ordering. The system supports multiple versions ranging from ancient Greek manuscripts (BYZ2018) to modern English translations (WEBUS2020).

## Core Entities

### Version Registry (`bible-versions.json`)

```typescript
interface Version {
  _id: string; // Short identifier (e.g., "ASV1901", "KJV1769")
  name: string; // Human-readable name
  license: string; // License identifier (e.g., "CC0-1.0", "public-domain")
  copyright?: Content; // Copyright statement
  script?: "G" | "H"; // Default script (Greek/Hebrew), Latin if unset
  testaments?: {
    // Per-testament overrides
    OT?: { script?: "G" | "H" };
    NT?: { script?: "G" | "H" };
  };
  books: VersionBook[]; // Books included in this version
}

interface VersionBook {
  _id: string; // Book identifier from bible-books.json
  name: Content; // Book name in this version
  title: Content; // Full title in this version
  order: number; // Position in this version's canon (1-indexed)
  chapters: number; // Number of chapters
}
```

### Available Versions

| Version ID | Name                          | Script | Books        |
| ---------- | ----------------------------- | ------ | ------------ |
| ASV1901    | American Standard Version     | Latin  | 66 (OT+NT)   |
| BYZ2018    | Byzantine Greek New Testament | Greek  | 27 (NT only) |
| CLV1880    | Chinese Union Version         | Latin  | 66 (OT+NT)   |
| KJV1769    | King James Version            | Latin  | 66 (OT+NT)   |
| WEBUS2020  | World English Bible (US)      | Latin  | 66 (OT+NT)   |
| YLT1898    | Young's Literal Translation   | Latin  | 66 (OT+NT)   |

## User Workflows

- **Version Selection** – User selects a Bible version from dropdown; triggers book list reload
- **Version Comparison** – System supports multiple versions for same book/chapter (not yet exposed in UI)
- **Book Availability Check** – When switching versions, verify current book exists in new version

## Key Business Rules

- **Unique Identifiers** – Version `_id` must be unique across all versions
- **Sequential Ordering** – Book `order` values must start at 1 and be sequential with no gaps
- **No Duplicate Orders** – Each book in a version must have a unique order number
- **Book Reference Integrity** – Book `_id` values must exist in `bible-books.json`
- **File-Order Alignment** – Verse files named `{order}-{bookId}.json` must match book ordering

## Representative Code Examples

### Version Schema Definition

_From [bible-versions/bible-versions-schema.json](../bible-versions/bible-versions-schema.json)_

```json
{
  "type": "object",
  "required": ["_id", "name", "license"],
  "properties": {
    "_id": {
      "type": "string",
      "pattern": "^[A-Z0-9-]+$"
    },
    "books": {
      "type": "array",
      "items": {
        "required": ["_id", "name", "title", "order", "chapters"]
      }
    }
  }
}
```

### Version Loading in Frontend

_From [web/public/js/App.js](../web/public/js/App.js)_

```javascript
useEffect(() => {
  fetch("/api/versions")
    .then((res) => res.json())
    .then((data) => {
      setVersions(data);
      if (data.length > 0) {
        const defaultVer = data.find((v) => v._id === "WEBUS2020") || data[0];
        setSelectedVersionId(defaultVer._id);
        if (defaultVer.books && defaultVer.books.length > 0) {
          setSelectedBookId(defaultVer.books[0]._id);
        }
      }
    });
}, []);
```

### Order Validation

_From [utils/validate.ts](../utils/validate.ts)_

```typescript
// Check for duplicates
const duplicates = _.filter(
  _.groupBy(books, "order"),
  (group) => group.length > 1
);

// Check if starts at 1
if (sortedOrders[0] !== 1) {
  console.error(`❌ ${version._id} does not start at 1`);
  booksValidationPassed = false;
}

// Check for gaps in sequence
const allExpected = _.range(1, expectedCount + 1);
const missing = _.difference(allExpected, sortedOrders);
```
