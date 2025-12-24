# Content & Verses Domain

## Overview

The Content domain is the heart of the Graphai system, defining the flexible structure for Bible text with rich scholarly annotations. Content can be simple text, structured objects with metadata, or nested arrays. Verses are the atomic unit containing chapter/verse references and content.

## Core Entities

### Verse Structure

```typescript
interface VerseSchema {
  book: string; // Book identifier (e.g., "JHN")
  chapter: number; // Chapter number (1-indexed)
  verse: number; // Verse number (1-indexed)
  content: Content; // Flexible content structure
}
```

### Content Type (Recursive)

```typescript
type Content =
  | string // Plain text
  | ContentObject // Text with metadata
  | ContentNested // Nested content with shared properties
  | ContentHeading // Section heading
  | ContentParagraph // Paragraph wrapper
  | ContentSubtitle // Subtitle/superscription
  | Content[]; // Array of content items

interface ContentObject {
  text?: string; // The actual text (optional - can have Strong's-only elements)
  script?: "G" | "H"; // Greek or Hebrew (Latin if omitted)
  marks?: ("i" | "b" | "woc" | "sc")[]; // Formatting marks
  foot?: Footnote; // Attached footnote
  strong?: string; // Strong's number (G/H + digits)
  lemma?: string; // Lexical lemma
  morph?: string; // Morphological code
  paragraph?: boolean; // Starts new paragraph
  break?: boolean; // Ends with line break
}

interface ContentNested {
  content: Content; // Nested content with shared properties
  strong?: string; // Strong's number applying to entire nested content
  lemma?: string; // Lexical lemma
  morph?: string; // Morphological code
  foot?: Footnote; // Attached footnote
  paragraph?: boolean; // Starts new paragraph
  break?: boolean; // Ends with line break
}
```

### Formatting Marks

| Mark  | Meaning         | Example                    |
| ----- | --------------- | -------------------------- |
| `i`   | Italic          | Emphasis or supplied words |
| `b`   | Bold            | Strong emphasis            |
| `woc` | Words of Christ | Red letter text            |
| `sc`  | Small Caps      | Divine names (LORD)        |

### Footnote Types

| Type  | Purpose                   |
| ----- | ------------------------- |
| `stu` | Study note (default)      |
| `trn` | Translation note          |
| `var` | Textual criticism variant |
| `map` | Map reference             |
| `xrf` | Cross-reference           |

## User Workflows

- **Read Text** – Verses rendered sequentially in paragraph or verse-by-verse mode
- **View Annotations** – Toggle Strong's numbers, morphology, lemmas per word
- **Read Footnotes** – Click footnote markers to see study notes, variants, etc.
- **Words of Christ** – Toggle red (or blue/purple) highlighting for Jesus' words

## Key Business Rules

- **Required Verse Fields** – Every verse must have book, chapter, verse, and content
- **Content Flexibility** – Processing code must handle all Content variants recursively
- **Strong's Format** – Pattern `^[GH][0-9]{1,4}$` (G for Greek NT, H for Hebrew OT)
- **Script Inheritance** – If text.script not set, inherit from version or assume Latin
- **Footnote Lettering** – Footnotes labeled a-z per chapter, cycling after z

## Representative Code Examples

### Content Schema (Recursive)

_From [content-schema.json](../content-schema.json)_

```json
{
  "oneOf": [
    { "type": "string", "minLength": 1 },
    {
      "type": "object",
      "properties": {
        "text": { "type": "string" },
        "strong": { "pattern": "^[GH][0-9]{1,4}$" },
        "marks": {
          "type": "array",
          "items": { "enum": ["i", "b", "woc", "sc"] }
        },
        "foot": { "$ref": "#" }
      }
    },
    {
      "type": "array",
      "items": { "$ref": "#" }
    }
  ]
}
```

### Verse Data Example

_From a typical verse file_

```json
{
  "book": "JHN",
  "chapter": 1,
  "verse": 1,
  "content": [
    { "paragraph": true, "text": "In", "strong": "G1722", "morph": "PREP" },
    { "text": " " },
    { "text": "the", "strong": "G3588", "morph": "T-DSF" },
    { "text": " " },
    { "text": "beginning", "strong": "G746", "morph": "N-DSF" }
  ]
}
```

### Small Caps Example (Divine Names)

_From KJV verse files_

```json
{
  "book": "GEN",
  "chapter": 2,
  "verse": 4,
  "content": [
    "the ",
    { "text": "Lord", "marks": ["sc"] },
    " God made the earth and the heavens"
  ]
}
```

### Nested Content Example (Shared Properties)

_When Strong's number applies to multiple words_

```json
{
  "book": "MAT",
  "chapter": 1,
  "verse": 1,
  "content": [
    {
      "content": [{ "text": "The" }, { "text": " " }, { "text": "book" }],
      "strong": "G976",
      "morph": "N-NSF"
    }
  ]
}
```

### Recursive Content Processing

_From [utils/exportContent.ts](../utils/exportContent.ts)_

```typescript
function renderContent(content: Content, ctx: RenderContext): string {
  // Handle string content
  if (typeof content === "string") {
    return content;
  }

  // Handle array content
  if (Array.isArray(content)) {
    return content.map((item) => renderContent(item, ctx)).join("");
  }

  // Handle object content
  if ("heading" in content) {
    return renderHeading(content);
  }

  if ("paragraph" in content && !("text" in content)) {
    return renderContent(content.paragraph, ctx);
  }

  // Handle nested content (content property with optional strong, morph, foot, etc.)
  if (
    "content" in content &&
    !("heading" in content) &&
    !("subtitle" in content)
  ) {
    return renderNestedContent(content as ContentNested, ctx);
  }

  // Handle text object
  return renderTextObject(content as ContentObject, ctx);
}
```

### Content Rendering in React

_From [web/public/js/ContentNode.js](../web/public/js/ContentNode.js)_

```javascript
function ContentNode({ node, settings, onFootnoteClick }) {
  if (!node) return null;

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <ContentNode key={i} node={child} settings={settings} />
    ));
  }

  if (typeof node === "string") {
    return <span>{node}</span>;
  }

  // Handle heading wrapper
  if (node.heading) {
    if (!settings.showHeadings) return null;
    return (
      <h3 className="text-xl font-bold">
        <ContentNode node={node.heading} settings={settings} />
      </h3>
    );
  }

  // Handle text with Strong's
  if (settings.showStrongs && node.strong) {
    const strongsLink = node.strong.startsWith("H")
      ? `https://...hebrew/strongs-${node.strong.toLowerCase()}`
      : `https://...greek/strongs-${node.strong.toLowerCase()}`;
    // Render clickable Strong's number
  }
}
```

### TypeScript Type Definitions

_From [types/Content.ts](../types/Content.ts)_

```typescript
type Content =
  | string
  | ContentObject
  | ContentHeading
  | ContentParagraph
  | ContentSubtitle
  | Content[];

interface ContentObject {
  text: string;
  script?: "G" | "H";
  marks?: ("i" | "b" | "woc" | "sc")[];
  foot?: Footnote;
  strong?: string;
  lemma?: string;
  morph?: string;
  paragraph?: boolean;
  break?: boolean;
}
```
