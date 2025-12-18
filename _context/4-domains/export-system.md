# Export System Domain

## Overview

The Export System converts Graphai JSON data into human-readable formats for offline use, publishing, or integration with other systems. Two export formats are supported: annotated text with Strong's numbers and formatted markdown.

## Core Entities

### Export Formats

| Format             | Directory                   | Extension | Purpose                                             |
| ------------------ | --------------------------- | --------- | --------------------------------------------------- |
| Text with Strong's | `exports/text-vbv-strongs/` | `.txt`    | Verse-by-verse with Strong's numbers and morphology |
| Markdown Paragraph | `exports/markdown-par/`     | `.md`     | Readable markdown with footnotes                    |

### Export Markers

| Marker         | Meaning          | Format   |
| -------------- | ---------------- | -------- |
| `¶`            | Paragraph start  | Text     |
| `␤`            | Line break       | Text     |
| `«»`           | Subtitle wrapper | Text     |
| `[[]]`         | Heading wrapper  | Text     |
| `°`            | Footnote marker  | Text     |
| `<sup>n</sup>` | Verse number     | Markdown |
| `<br>`         | Line break       | Markdown |
| `> _text_`     | Subtitle block   | Markdown |
| `### Heading`  | Section heading  | Markdown |

## User Workflows

- **Export All Versions** – Run `npm run export` to convert all Bible versions
- **Export Single Version** – Run `npx ts-node utils/exportContent.ts VERSION` (e.g., `WEBUS2020`)
- **Export Single Book** – Run `npx ts-node utils/exportContent.ts VERSION BOOK` (e.g., `WEBUS2020 GEN`)

## Key Business Rules

- **Directory Mirroring** – Export directories mirror source directory structure
- **Chapter Grouping** – Markdown groups verses under `## Chapter N` headers
- **Footnote Lettering** – Footnotes use letters (a-z) per chapter, cycling after z
- **Heading Extraction** – Headings at chapter start become `### ` headers
- **Subtitle Handling** – Subtitles rendered as italic blockquotes `> _text_`
- **Spacing Preservation** – Source data includes spaces; no automatic space insertion

## Representative Code Examples

### Main Export Entry Point

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
function main(): void {
  const translation = process.argv[2];
  const bookId = process.argv[3];

  const versionsDir = path.join(path.dirname(__dirname), "bible-versions");

  let versions: string[];
  if (translation) {
    versions = [translation];
  } else {
    versions = fs.readdirSync(versionsDir).filter((item: string) => {
      const itemPath = path.join(versionsDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
  }

  for (const version of versions) {
    console.log(`Processing version: ${version}`);
    convertBibleVersion(version, bookId);
    convertBibleVersionToMarkdown(version, bookId);
  }
}
```

### Text Export with Strong's

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
function convertVerseToText(verse: VerseSchema): string {
  const chapter = verse.chapter.toString().padStart(3, "0");
  const verseNum = verse.verse.toString().padStart(3, "0");

  function extractTextAndFootnotes(
    content: Content,
    textParts: string[],
    footnoteParts: string[]
  ): void {
    // ... recursive extraction
    const obj = content as ContentObject;
    let textPart = obj.text || "";

    if (obj.foot) {
      textPart += "°"; // Footnote marker
      if (obj.strong) textPart += " " + obj.strong;
      if (obj.morph) textPart += " (" + obj.morph + ")";
      textPart += convertFootnoteToText(obj.foot).replace("° ", " ");
    } else {
      if (obj.strong) textPart += " " + obj.strong;
      if (obj.morph) textPart += " (" + obj.morph + ")";
    }
  }

  return `${chapter}:${verseNum} ${fullText}`;
}
```

### Markdown Export with Chapters

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
function convertBibleVersionToMarkdown(version: string, bookId?: string): void {
  // Group verses by chapter
  const chapters = new Map<number, VerseSchema[]>();
  for (const verse of verses) {
    const chapterNum = verse.chapter;
    if (!chapters.has(chapterNum)) {
      chapters.set(chapterNum, []);
    }
    chapters.get(chapterNum)!.push(verse);
  }

  for (const [chapterNum, chapterVerses] of sortedChapters) {
    markdownLines.push(`## Chapter ${chapterNum}`);
    const chapterFootnotes: string[] = [];

    // Check for subtitle
    if (firstItem && "subtitle" in firstItem) {
      markdownLines.push(`> _${subtitleText}_`);
    }

    for (const verse of chapterVerses) {
      const verseText = convertVerseToMarkdown(verse, chapterFootnotes);
      markdownLines.push(verseText);
    }

    // Add footnotes at chapter end
    if (chapterFootnotes.length > 0) {
      markdownLines.push("");
      for (const footnote of chapterFootnotes) {
        markdownLines.push(`> ${footnote}`);
      }
    }
  }
}
```

### Footnote Processing

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
// Add footnote marker using letters cycling a-z
const footnoteLetter = String.fromCharCode(97 + (chapterFootnotes.length % 26)); // 97 = 'a'
textParts.push(`<sup>${footnoteLetter}</sup>`);

const footnoteContent = convertContentToMarkdownText(obj.foot.content);
chapterFootnotes.push(
  `- <sup>${footnoteLetter}</sup> ${verseNum}. ${footnoteContent}`
);
```

### Output File Naming

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
// Text export
const outputPath = path.join(outputDir, file.replace(".json", ".txt"));

// Markdown export
const outputPath = path.join(outputDir, file.replace(".json", ".md"));
```
