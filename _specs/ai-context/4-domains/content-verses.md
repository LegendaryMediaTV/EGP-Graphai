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
  | ContentHeading // Section heading (optional type: standard or acrostic)
  | ContentParagraph // Paragraph wrapper
  | ContentSubtitle // Subtitle/superscription
  | ContentBibleLink // Bible reference link
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

interface ContentBibleLink {
  bibleLink: string; // Scriptural reference target (e.g., "Hebrews 11:3"); also the default display text
  content?: Content; // Optional display override (falls back to the reference)
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

### Heading Types

| Type       | Purpose                                                  |
| ---------- | --------------------------------------------------------- |
| `standard` | Editorial section heading (default)                        |
| `acrostic` | Hebrew acrostic stanza marker (e.g., Psalm 119 stanzas)    |

Acrostic headings render one step smaller than standard headings in every consumer (text export, markdown export, web reader), but are governed by the same "Headings" visibility toggle.

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
- **A property that cannot share a node with the text beside it becomes its own textless sibling, in source order.** `{strong: "H853"}` with no `text` and no nested `content` is the right shape for exactly that case, not a defect: the property has nowhere else to live, and downstream consumers treat it as transparent (renders nothing, contributes no characters) rather than as a boundary. See [strongs-node-audit.md](./strongs-node-audit.md) for how the node-placement audit reads through one of these rather than treating it as a stopping point.
- **A non-Latin letter embedded in Latin text is its own `script`-tagged node, anywhere in the tree, not only inside a heading.** A bare Hebrew or Greek run sitting untagged inside an otherwise-Latin string is corpus-wide, checked wherever text can appear — a footnote body, ordinary verse content, a heading — not scoped to acrostic headings alone. Requires an actual mix of scripts in one string; an all-Greek node in an all-Greek version is ordinary text, never a finding. See [strongs-node-audit.md](./strongs-node-audit.md), the script-run check.
- **A mark on a payload with no text is meaningless — drop the marks, keep the node.** `marks`/`script` applied to a node carrying no `text` renders nothing (a non-greedy bold/italic delimiter can't wrap zero characters, so the opening delimiter leaks into surrounding text), so this repo strips the marks rather than the node — `foot`, `strong`, `bibleLink`, and a bare `paragraph`/`break` flag are each meaningful on a textless node in their own right, and a footnote anchor in particular needs somewhere to attach even when it carries no visible text of its own. See [validation.md](./validation.md), the Meaningless Content Nodes check.
- **`paragraph` marks where a block starts, `break` marks where a line ends — a node can carry both at once, legitimately.** A one-line paragraph both opens a block and ends a line, so `{paragraph: true, text: "...", break: true}` is not double-marking; it's two independent boundaries that happen to coincide on this node. A verse ending `break: true` immediately before the next verse opens `paragraph: true` is the same story one level up — a poetic line ending and a new block opening are two different facts, not one restated.
- **Adjacent runs agreeing in every property but `text` are one run, not two.** Two siblings that carry nothing but `text` (optionally matching `marks`/`script`) and split for no reason a reader could name are structural residue, not evidence of a lost distinction — proven by measurement rather than assumed: before this repo folded these back together, one version carried 98 nodes whose own text opened with a divine name and **zero** of them carried a small-caps mark, meaning the split node held no information the merge could destroy. A node carrying `strong`, `foot`, `bibleLink`, nested `content`, `paragraph`, or `break` is never eligible for this merge on either side — each of those ties real information to one specific tag occurrence, and two different occurrences that happen to decode to the same value stay split. See [strongs-node-audit.md](./strongs-node-audit.md), the mergeable-sibling check.

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
  | ContentNested
  | ContentHeading
  | ContentParagraph
  | ContentSubtitle
  | ContentBibleLink
  | Content[];

interface ContentObject {
  text?: string;
  script?: "G" | "H";
  marks?: ("i" | "b" | "woc" | "sc")[];
  foot?: Footnote;
  strong?: string;
  lemma?: string;
  morph?: string;
  paragraph?: boolean;
  break?: boolean;
}

interface ContentBibleLink {
  bibleLink: string;
  content?: Content;
}
```

### Bible Reference Link Example

_When a footnote cross-references another verse_

```json
{
  "foot": {
    "type": "stu",
    "content": [
      "i.e., the burning bush of ",
      { "bibleLink": "Exodus 3:3–4" },
      "."
    ]
  }
}
```

When `content` is omitted, exporters and the reader use the `bibleLink` string as the display text. Provide `content` to override the rendered text while keeping the reference target intact. Verse-range separators use en-dashes (`–`), not hyphens.

A `bibleLink` target must never span two chapters of the same book (e.g. `"2 Kings 6:31–7:20"`). Split it into two chapter-scoped links joined by a literal en dash instead, since a cross-chapter target resolves inside neither chapter. See [4-domains/cross-chapter-links.md](./cross-chapter-links.md) for the audit tool that enforces this.
