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
| `[[]]`         | Heading wrapper (standard)  | Text     |
| `[[[]]]`       | Heading wrapper (acrostic)  | Text     |
| `°{content}`   | Inline footnote  | Text     |
| `<sup>n</sup>` | Verse number     | Markdown |
| `<br>`         | Line break       | Markdown |
| `> _text_`     | Subtitle block   | Markdown |
| `### Heading`  | Section heading (standard) | Markdown |
| `#### Heading` | Section heading (acrostic, one level smaller) | Markdown |
| `**text**`     | Bold (`b` mark)   | Markdown |
| `_text_`       | Italic (`i` mark) | Markdown |

Bold/italic wrapping is a no-op in the text export — `b`/`i` marks carry no visible rendering there, only in markdown.

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
- **Bible Reference Links** – `bibleLink` nodes render their `content` override when provided, otherwise the `bibleLink` string itself
- **Heading Type** – A heading's optional `type` (`standard` default, `acrostic`) renders one level smaller for acrostic markers (e.g., Psalm 119 Hebrew stanza letters) in both text (`[[[...]]]`) and markdown (`####`) exports
- **Bold/Italic Marks Share One Delimiter Span Across Siblings** – Adjacent array items carrying the same open `b`/`i` state render under one shared open/close delimiter pair instead of each item emitting its own. Without this, a bold+italic quotation built word-by-word produced broken markdown like `**word****word**` instead of `**word word**`. `b` and `i` are tracked independently, so a single un-bolded "supplied word" in the middle of an otherwise bold+italic run can drop bold alone while italic stays open across it (bold nests inside italic: `_word **word** word_`)
- **Second-Footnote Marker Ordering** – The content schema allows only one `foot` per node, so a word's second footnote rides as a textless sibling node immediately after it. That sibling's marker now renders *before* the word's Strong's number, matching where the first footnote's marker sits, rather than trailing after by array order
- **Synthetic Space Before an Unseparated Tag** – When a Strong's/morph/lemma tag has no line break and nothing else separating it from the word that follows, a space is inserted so text like `H2822was` renders as `H2822 was`

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
  headingWrapper: (text: string, type?: "standard" | "acrostic") => string;
  subtitleWrapper: (text: string) => string;
  footnoteMarker: (index: number) => string;
  boldWrapper: (text: string) => string; // Wraps text carrying a "b" mark
  italicWrapper: (text: string) => string; // Wraps text carrying an "i" mark
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
  headingWrapper: (text, type) =>
    type === "acrostic" ? `[[[${text}]]] ` : `[[${text}]] `,
  subtitleWrapper: (text) => `«${text}» `,
  footnoteMarker: () => "°",
  boldWrapper: (text) => text,
  italicWrapper: (text) => text,
};

const MARKDOWN_OPTIONS: RenderOptions = {
  includeStrongs: false,
  includeMorph: false,
  includeFootnotes: true,
  footnoteStyle: "reference",
  paragraphMarker: "\n\n",
  lineBreakMarker: "<br>",
  headingWrapper: (text, type) =>
    `\n${type === "acrostic" ? "####" : "###"} ${text}\n`,
  subtitleWrapper: (text) => `> _${text}_`,
  footnoteMarker: (index) =>
    `<sup>${String.fromCharCode(97 + (index % 26))}</sup>`,
  boldWrapper: (text) => `**${text}**`,
  italicWrapper: (text) => `_${text}_`,
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
    return ctx.options.headingWrapper(inner, content.type);
  }

  if ("subtitle" in content) {
    const inner = renderContent(content.subtitle, {
      ...ctx,
      footnotePrefix: "Subtitle.",
    });
    return ctx.options.subtitleWrapper(inner);
  }

  // Bible reference link - render content override when provided,
  // else the reference text. Must come before the generic nested-content
  // branch because bibleLink objects may also carry a `content` property.
  if ("bibleLink" in content) {
    if (content.content !== undefined) {
      return renderContent(content.content, ctx);
    }
    return content.bibleLink;
  }

  // Text object
  return renderTextObject(content as ContentObject, ctx);
}
```

### Bold/Italic Delimiter Merging Across Siblings

_From [utils/exportContent.ts](../../../utils/exportContent.ts)_

```typescript
function emphasisTransition(
  from: EmphasisState,
  to: EmphasisState,
  bold: { open: string; close: string },
  italic: { open: string; close: string }
): { close: string; open: string } {
  let close = "";
  if (from.b && !to.b) close += bold.close;
  if (from.i && !to.i) close += italic.close;
  // ...opens only marks present in `to` but absent from `from`
  return { close, open /* built the same way, outermost-first */ };
}
```

Called once per transition between array siblings (not once per node), so a run of same-marked words shares one open delimiter and one close delimiter rather than each word wrapping itself — the fix for markdown output that used to look like `**word****word**`.

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
