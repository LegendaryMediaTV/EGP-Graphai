# Panta - Bible Data Transformation Suite

The `panta` folder extends the original EGP Graphai functionality with comprehensive Bible data transformation and export capabilities. It provides tools to convert structured Bible data back to legacy BB format while maintaining data integrity and performance.

## Overview

This suite transforms the rich, structured JSON Bible data from the main project back into the simpler BibleDB.bibleVerses format used by legacy systems. It includes advanced features like parallel processing, progress tracking, memory optimization, and comprehensive validation.

## Integration with Main Project

The `panta` suite is designed to work alongside the main EGP Graphai project by putting all custom content into the `panta/` folder. This ensures that the main project remains untouched, allowing for easy updates and maintenance.

To pull in the latest changes from the main project, use the following PowerShell command:

```
. "./panta/utils/git-merge-upstream.ps1"
```

## Folder Structure

```
panta/
├── functions/           # Core transformation functions
│   ├── convertBBToGraphai.ts    # Converts BB format to Graphai format
│   ├── convertGraphaiToBB.ts    # Converts Graphai format to BB format
├── utils/               # Utility scripts
│   ├── exportToBB.ts            # Export Graphai format to BB format
│   ├── importFromBB.ts          # Import BB format exports into Graphai format
│   └── git-merge-upstream.ps1   # Merge updates from upstream repository
```

## Usage

### Importing from BB Format

The `importFromBB` utility converts legacy BibleDB.bibleVerses exports back into the Graphai JSON format. It supports migrating entire Bible versions or individual books.

**Migrate an entire version:**

```bash
ts-node panta/utils/importFromBB.ts kjv
```

**Migrate a single book:**

```bash
ts-node panta/utils/importFromBB.ts kjv 204    # John only
```

The utility:

- Reads BB format exports from `./exports/BibleDB.bibleVerses-{version}.json`
- Converts verse metadata and content to Graphai format
- Handles paragraph markers, footnotes, and headings
- Writes output to `./bible-versions/{version}/`
- Automatically runs validation after migration

### Exporting to BB Format

The `exportToBB` utility converts Graphai JSON format back to the legacy BibleDB.bibleVerses BB format. It supports exporting entire versions or individual books.

**Export full version:**

```bash
ts-node panta/utils/exportToBB.ts kjv
```

**Export single book:**

```bash
ts-node panta/utils/exportToBB.ts kjv 101    # Genesis
```

**Export all versions:**

```bash
ts-node panta/utils/exportToBB.ts
```

The utility:

- Reads Graphai format data from `./bible-versions/{version}/`
- Converts verse content using advanced transformation logic
- Handles Greek/Hebrew text, Strong's numbers, morphology, paragraphs, footnotes
- Validates output against BB schema
- Writes pretty-printed JSON to `./exports/BibleDB.bibleVerses-{version}.json`
- Always overwrites existing export files
