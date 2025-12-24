# Export System Domain

## Overview

The Export System converts Graphai JSON data into human-readable formats for offline use, publishing, or integration with other systems. Two export formats are supported: annotated text with Strong's numbers and formatted markdown. The system uses a unified rendering architecture with configurable options for each format.

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
| `°{content}`   | Inline footnote  | Text     |
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
- **Inline Footnotes** – Text format places footnote content immediately after marker: `word°{content} G1234`
- **Spacing Preservation** – Source data includes spaces; no automatic space insertion
- **Clean Footnote Removal** – Format `°{...}` allows search/replace removal without extra spaces
- **Small Caps Conversion** – Text marked with `sc` formatting renders as uppercase in text/markdown exports
- **Nested Content** – Content with shared properties (e.g., Strong's numbers applying to multiple words) handled recursively

## Architecture

### Unified Rendering System

The export system uses a single `renderContent()` function with configurable `RenderOptions`:

```typescript
interface RenderOptions {
  includeStrongs: boolean;
  includeMorph: boolean;
  includeFootnotes: boolean;
  footnoteStyle: "inline" | "reference";
  paragraphMarker: string;
  lineBreakMarker: string;
  headingWrapper: (text: string) => string;
  subtitleWrapper: (text: string) => string;
  footnoteMarker: (index: number) => string;
}
```

### Format-Specific Options

```typescript
const TEXT_OPTIONS: RenderOptions = {
  includeStrongs: true,
  includeMorph: true,
  includeFootnotes: true,
  footnoteStyle: "inline",
  paragraphMarker: "¶ ",
  lineBreakMarker: "␤",
  headingWrapper: (text) => `[[${text}]] `,
  subtitleWrapper: (text) => `«${text}» `,
  footnoteMarker: () => "°",
};

const MARKDOWN_OPTIONS: RenderOptions = {
  includeStrongs: false,
  includeMorph: false,
  includeFootnotes: true,
  footnoteStyle: "reference",
  paragraphMarker: "\n\n",
  lineBreakMarker: "<br>",
  headingWrapper: (text) => `\n### ${text}\n`,
  subtitleWrapper: (text) => `> _${text}_`,
  footnoteMarker: (index) =>
    `<sup>${String.fromCharCode(97 + (index % 26))}</sup>`,
};
```

## Representative Code Examples

### Core Rendering Function

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
function renderContent(content: Content, ctx: RenderContext): string {
  // String content
  if (typeof content === "string") {
    return content;
  }

  // Array content - join all rendered parts
  if (Array.isArray(content)) {
    return content.map((item) => renderContent(item, ctx)).join("");
  }

  // Object content - dispatch by type
  if ("heading" in content) {
    const inner = renderContent(content.heading, {
      ...ctx,
      footnotePrefix: "Heading.",
    });
    return ctx.options.headingWrapper(inner);
  }

  if ("subtitle" in content) {
    const inner = renderContent(content.subtitle, {
      ...ctx,
      footnotePrefix: "Subtitle.",
    });
    return ctx.options.subtitleWrapper(inner);
  }

  // Text object
  return renderTextObject(content as ContentObject, ctx);
}
```

### Text Object Rendering with Footnote Order

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
function renderTextObject(obj: ContentObject, ctx: RenderContext): string {
  const parts: string[] = [];

  // Text content
  const text = obj.text || "";
  parts.push(text);

  // Footnote marker and inline content (immediately after text, before Strong's/morph)
  if (obj.foot && ctx.options.includeFootnotes) {
    const footIndex = ctx.footnotes.length;
    parts.push(ctx.options.footnoteMarker(footIndex));

    if (ctx.options.footnoteStyle === "inline") {
      // Add inline footnote content immediately after marker, before Strong's/morph
      parts.push(`{${footnoteContent}}`);
    }
  }

  // Strong's number (after footnote content for text format)
  if (obj.strong && ctx.options.includeStrongs) {
    parts.push(" " + obj.strong);
  }

  // Morph code
  if (obj.morph && ctx.options.includeMorph) {
    parts.push(` (${obj.morph})`);
  }

  return parts.join("");
}
```

### Verse Conversion

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
function convertVerseToText(verse: VerseSchema): string {
  const chapter = verse.chapter.toString().padStart(3, "0");
  const verseNum = verse.verse.toString().padStart(3, "0");

  const ctx: RenderContext = {
    options: TEXT_OPTIONS,
    footnotes: [],
    verseNum: verse.verse,
  };

  let text = renderContent(verse.content, ctx);
  text = text.replace(/^ +/, "").replace(/ +$/, "").replace(/ +/g, " ");

  return `${chapter}:${verseNum} ${text}`;
}
```
