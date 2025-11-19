# EGP Graphai

Initially created by [Equip God’s People](https://www.equipgodspeople.com), “Graphai” (γραφαὶ) — the Koine Greek word for “writings” or “scriptures” — provides access to sacred texts and related resources through modern data formats.

Its purpose is to provide a comprehensive, verbose JSON standard for Bible resources. This project provides structured Bible data with rich metadata, including various Bible versions, lexical information, and conversion tools for working with other common formats.

## Overview

EGP Graphai establishes a free, open JSON schema for Bible resources that prioritizes:

- **Rich metadata** - Strong’s numbers, morphological codes, lexical lemmas
- **Structured content** - Paragraphs, footnotes, headings, and line breaks
- **Extensibility** - Support for multiple versions, testaments, and languages
- **Interoperability** - Conversion scripts for text and markdown formats

## Key Features

### JSON Schema

- **Bible Versions Schema** - Registry of Bible versions with metadata, licensing, and per-version book ordering
- **Bible Verses Schema** - Structured verse content with lexical annotations
- **Book Metadata Schema** - Canonical book information and alternate names

### Rich Content Structure

- **Text nodes** with Strong’s numbers, morphological codes, and lemmas
- **Paragraph breaks** and **line breaks** for proper formatting
- **Footnotes** with study notes, translations, variants, and cross-references
- **Headings** for section divisions

### Output Formats

- **Markdown** - Clean, readable format with superscript verse numbers and footnotes
- **Strong’s Text** - Annotated format with linguistic codes and lexical data

### Graphai Reader

The project includes a built-in web reader to visualize and test Graphai content. This serves as a reference implementation for using Graphai JSON data in a React-based web application.

**Features:**

- Dynamic rendering of Bible text with support for paragraph and verse-by-verse modes
- Toggleable study tools: Strong's numbers, morphology, lemmas, and footnotes
- "Words of Christ" highlighting with customizable colors
- Proper handling of non-Latin scripts (Hebrew/Greek) with specific fonts
- Responsive design with dark mode support

To start the reader:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Quick Start

```bash
# Install dependencies
npm install

# Validate JSON schemas and data integrity
npm run validate

# Convert Bible JSON to text/markdown formats (all versions)
npm run export

# Convert specific version and book (e.g., WEBUS2020 Genesis)
npx ts-node utils/exportContent.ts WEBUS2020 GEN

# Run tests
npm run test

# Start the Graphai Reader (web interface)
npm run dev
```

## Project Structure

```
├── bible-books/           # Book metadata and schemas
│ ├── bible-book-schema.json
│ └── bible-books.json
├── bible-versions/        # Version data and schemas
│ ├── bible-verses-schema.json
│ ├── bible-versions-schema.json
│ ├── bible-versions.json
│ └── {version}/           # Version-specific data
├── exports/               # Generated output files
│ ├── markdown-par/        # Markdown format
│ └── text-vbv-strongs/    # Strong’s text format
├── functions/             # Utility functions
│ └── validateJsonAgainstSchema.ts
├── imports/               # Import scripts and raw data
├── types/                 # TypeScript type definitions
│ ├── Book.ts
│ ├── Footnote.ts
│ ├── Verse.ts
│ └── VerseSchema.ts
├── utils/                 # Utility scripts
│ └── exportContent.ts     # Main content export script
├── web/                   # Graphai Reader web application
│ ├── public/              # Frontend React components
│ └── server.js            # Express server
├── AGENTS.md              # AI agent instructions
├── README.md              # This file 😁
├── validate.ts            # Validation script
```

## JSON Format Examples

### Verse Content Structure

```json
{
  "book": "JHN",
  "chapter": 1,
  "verse": 1,
  "content": [
    { "type": "p" },
    {
      "text": "Ἐν",
      "script": "G",
      "strong": "G1722",
      "morph": "PREP"
    },
    { "type": "n" },
    {
      "text": "καὶ",
      "script": "G",
      "strong": "G2532",
      "morph": "CONJ"
    }
  ]
}
```

### Output Formats

**Markdown:**

```markdown
<sup>1</sup> Ἐν ἀρχῇ ἦν ὁ λόγος,<br>καὶ ὁ λόγος ἦν πρὸς τὸν θεόν,<br>καὶ θεὸς ἦν ὁ λόγος.<br>

> - <sup>a</sup> 16. N [greek]Καὶ ἐκ[/greek] ⇒ [greek]Ὅτι ἐκ[/greek]
```

**Strong’s Text:**

```
001:001 ¶  Ἐν G1722 (PREP) ἀρχῇ G746 (N-DSF) ἦν G1510 (V-IAI-3S) ὁ G3588 (T-NSM) λόγος, G3056 (N-NSM) ␤
```

## Development

### Adding New Bible Versions

1. Add version metadata to `bible-versions/bible-versions.json`
2. Add verses by book to `bible-versions/{version}/{order}-{book}.json` (e.g., `01-GEN.json`, `66-REV.json`)
3. Validate: `npm run validate`
4. Export: `npm run export`

### Schema Validation

The project uses JSON Schema for data validation:

- Validates against predefined schemas
- Ensures data integrity and consistency
- Supports custom validation rules

## Contributing

This project welcomes contributions for:

- Additional Bible versions and resources
- Additional conversion scripts for importing/exporting formats
- Enhanced schemas
- Documentation improvements
- Bug fixes and feature requests

## License

This project is licensed under the MIT License. Its code, schemas, and tools are free to use and distribute. All included content remains subject to the licensing terms of their original sources.

_Created by Equip God’s People to provide free, structured access to Bible resources for developers, researchers, and ministry applications._
