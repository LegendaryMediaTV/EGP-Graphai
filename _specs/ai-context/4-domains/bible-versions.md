# Bible Versions Domain

## Overview

Bible Versions represent distinct translations, editions, or manuscripts of the Bible. Each version has metadata, licensing information, and a customized book ordering. The system supports multiple versions ranging from ancient Greek manuscripts (BYZ2018) to modern English translations (WEBUS2020).

**Architecture Change:** Version metadata is now stored in per-folder `_version.json` files (e.g., `bible-versions/KJV1769/_version.json`) rather than a single `bible-versions.json` registry. This enables self-contained version folders and simplifies adding new versions.

## Core Entities

### Version Metadata (`_version.json`)

_From [types/Version.ts](../types/Version.ts)_

```typescript
interface BibleVersion {
  _id: string; // Short identifier (e.g., "ASV1901", "KJV1769")
  name: Content; // Human-readable name
  license: string; // License identifier (e.g., "CC0-1.0", "public-domain")
  copyright?: Content; // Copyright statement
  script?: "G" | "H"; // Default script (Greek/Hebrew), Latin if unset
  abbr?: Abbreviation[]; // Sigla this version's content cites by id
  testaments?: {
    // Per-testament overrides
    OT?: Testament;
    NT?: Testament;
  };
  books?: VersionBook[]; // Books included in this version
}

interface Abbreviation {
  _id: string; // Identifier an { abbr } content node points at (e.g., "NA27", "OM")
  name: Content; // How the abbreviation prints; content, so parts can carry marks
  description?: Content; // What it stands for; exports drop it, the reader shows it
}

interface VersionBook {
  _id: string; // Book identifier from bible-books.json
  name: Content; // Book name in this version
  title: Content; // Full title in this version
  order: number; // Position in this version's canon (1-indexed)
  chapters: number; // Number of chapters
}

interface Testament {
  script?: "G" | "H"; // Script override for this testament
}
```

### Available Versions

| Version ID | Name                                 | Script | Books                     | Abbreviation registry |
| ---------- | ------------------------------------ | ------ | ------------------------- | --------------------- |
| ASV1901    | American Standard Version            | Latin  | 66 (OT+NT)                | none                  |
| BYZ2018    | Byzantine Greek New Testament        | Greek  | 27 (NT only)              | edition sigla         |
| BYZ2026    | Byzantine Greek New Testament (2026) | Greek  | 27 (NT only)              | editions, manuscripts |
| CLV1880    | Clementine Latin Vulgate             | Latin  | 66 (OT+NT)                | none                  |
| KJV1769    | King James Version                   | Latin  | 66 (OT+NT)                | none                  |
| WEBUS2020  | World English Bible Classic          | Latin  | 81 (OT+NT+deuterocanon)   | witness sigla         |
| YLT1898    | Young's Literal Translation          | Latin  | 66 (OT+NT)                | none                  |

A version carries a registry only when its own footnotes cite witnesses by siglum. The four with none name theirs in prose instead ("Some ancient authorities read…", "According to Septuagint and Vulgate…"), so there is no short code for a reader to resolve.

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
- **Self-Contained Folders** – Each version folder contains `_version.json` + verse JSON files
- **Duplicate Display Names Disambiguated** – `getBibleVersions()` groups versions by exact-match `name` and appends each colliding member's own trailing-year suffix parsed from its `_id` (e.g. two versions both named "King James Version" become "King James Version (1611)" and "King James Version (1769)"), so the version picker never shows two identical names. A colliding version whose `_id` has no parseable trailing year is logged and left unmodified rather than throwing
- **Singular Lookup Skips Disambiguation** – `getBibleVersion(versionId)` deliberately does not disambiguate; doing so would require scanning the whole directory for a single lookup, and no current caller displays its `name` standalone. This is documented in code as an invariant to revisit if that changes
- **An Abbreviation Registry Belongs to One Version and Never Falls Through** – Every `{ abbr }` id in a version's content must name an entry in that same version's own `abbr` array, and no array may define an id twice. Sharing a registry across versions, or falling back to another version's when a lookup misses, would silently attach the wrong meaning: the same short code means different things in different editions. `utils/abbreviations.ts` audits this as a report-only peer inside `npm run validate`, with no auto-fix, since an unresolved id is either a typo in the content or a missing registry entry and only a person can say which
- **Declared Chapter Count Must Match the File** – `npm run validate` compares each book's declared `chapters` against the highest chapter its own verse file actually carries (`utils/validate.ts`'s `findDeclaredChapterMismatches`, run from the book-ordering loop and reported as its own trailing audit). A version can be schema-valid and internally ordered correctly while still being *incomplete* — this check is what catches that. `npm run validate` is expected to report zero findings here at all times; there is no accepted or tolerated exception, for any version.

### Declared Counts Track What's Actually Imported

CLV1880's Esther and Daniel are missing that edition's own deuterocanonical additions — content the Clementine Vulgate is expected to carry, that this copy doesn't yet. `_version.json` declares each book's *actual* chapter count (10 for Esther, 12 for Daniel), matching the verse files as they stand today, not the full count the printed edition eventually has.

**When that content gets imported, the declared count goes up in the same change that adds the chapters** — never before, and never left pointing at a target the file hasn't reached yet. A declared count that outruns its own file is exactly the defect this audit exists to catch; using it to "flag" missing content by deliberately mismatching the two would just be that same defect on purpose.

## Representative Code Examples

### Version Discovery Function

_From [functions/getBibleVersions.ts](../functions/getBibleVersions.ts)_

```typescript
export function getBibleVersions(versionsDir?: string): BibleVersion[] {
  const dir = versionsDir ?? BIBLE_VERSIONS_DIR;
  if (!fs.existsSync(dir)) throw new Error(`Bible versions directory not found: ${dir}`);

  const versions: BibleVersion[] = [];
  for (const item of fs.readdirSync(dir)) {
    const itemPath = path.join(dir, item);
    if (!fs.statSync(itemPath).isDirectory()) continue;

    const versionFilePath = path.join(itemPath, VERSION_FILENAME);
    if (!fs.existsSync(versionFilePath)) continue;

    try {
      versions.push(JSON.parse(fs.readFileSync(versionFilePath, "utf-8")) as BibleVersion);
    } catch (error) {
      console.error(`Error reading version file ${versionFilePath}:`, error);
    }
  }

  versions.sort((a, b) => a._id.localeCompare(b._id));
  disambiguateDuplicateNames(versions); // mutates in place; see below
  return versions;
}
```

### Duplicate Name Disambiguation

_From [functions/getBibleVersions.ts](../../../functions/getBibleVersions.ts)_

```typescript
function disambiguateDuplicateNames(versions: BibleVersion[]): BibleVersion[] {
  const versionsByName = new Map<string, BibleVersion[]>();

  for (const version of versions) {
    if (typeof version.name !== "string") continue; // avoid a false-positive object-stringify collision
    const group = versionsByName.get(version.name);
    if (group) group.push(version);
    else versionsByName.set(version.name, [version]);
  }

  for (const group of versionsByName.values()) {
    if (group.length < 2) continue;
    for (const version of group) {
      const yearMatch = version._id.match(TRAILING_YEAR_PATTERN); // /(\d{4})$/
      // ...append " (year)" to version.name, or log and skip if unparseable
    }
  }

  return versions;
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
