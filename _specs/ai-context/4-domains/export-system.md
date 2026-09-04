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
| `\_`, `\*`     | Escaped literal underscore/asterisk from content text | Markdown |

Bold/italic wrapping is a no-op in the text export. The `b`/`i` marks carry no visible rendering there, only in markdown.

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
- **Abbreviation References Render Their Registry Name, and Fall Back to the Bare Id** – An `{ abbr }` node carries only an id, so both exporters resolve it against the version's own `abbr` array, read once per version rather than per verse (a 10,000-footnote book would otherwise re-parse `_version.json` for every siglum it prints). The entry's `name` renders; its `description` is dropped, since neither format has anywhere to put a tooltip. An id the registry does not define prints as the bare id rather than as nothing, which keeps the export readable while `npm run validate`'s own abbreviation audit is what reports it
- **A Marked Registry Name Joins the Emphasis Run Instead of Opening Its Own Span** – An abbreviation node is otherwise a hard boundary, which split a siglum away from the editorial remark beside it. A `name` that is a single mark-bearing object now takes part in the run, exactly as a qualifying `bibleLink` display override does, so `om.` plus its remark prints as the one italic run the source edition sets. Both resolvers stay deliberately narrow: a bare-string name has no emphasis to share, and an array name can change marks between its elements, leaving the run no single state to carry forward
- **Superscript Wraps Where the Core Is Built, Never in `wrapEmphasisMarks`** – The array branch takes `renderTextObjectParts`/`renderNestedContentParts`'s own `core` and never calls `wrapEmphasisMarks`, so a `sup` mark applied there would work on a lone node and vanish inside an array. Whitespace stays outside the `<sup>` tag, since the array branch reads a core's leading and trailing space to decide spacing between siblings; burying a space inside the tag would hide it from that logic and fuse two words
- **Heading Type** – A heading's optional `type` (`standard` default, `acrostic`) renders one level smaller for acrostic markers (e.g., Psalm 119 Hebrew stanza letters) in both text (`[[[...]]]`) and markdown (`####`) exports
- **Bold/Italic Marks Share One Delimiter Span Across Siblings** – Adjacent array items carrying the same open `b`/`i` state render under one shared open/close delimiter pair instead of each item emitting its own. Without this, a bold+italic quotation built word-by-word produced broken markdown like `**word****word**` instead of `**word word**`. `b` and `i` are tracked independently, so a single un-bolded "supplied word" in the middle of an otherwise bold+italic run can drop bold alone while italic stays open across it (bold nests inside italic: `_word **word** word_`)
- **Second-Footnote Marker Ordering** – The content schema allows only one `foot` per node, so a word's second footnote rides as a textless sibling node immediately after it. That sibling's marker now renders *before* the word's Strong's number, matching where the first footnote's marker sits, rather than trailing after by array order
- **Synthetic Space Before an Unseparated Tag** – When a Strong's/morph/lemma tag has no line break and nothing else separating it from the word that follows, a space is inserted so text like `H2822was` renders as `H2822 was`
- **A Leading Subtitle Renders Above the Verse Line, Never Inside It** – `convertBibleVersionToMarkdown` hoists a chapter's whole leading run of headings/subtitles in content order (at most one of each kind), and `convertVerseToMarkdown`'s own `leadingPrefix` mechanism mirrors that for a subtitle opening any other verse, the same way it already lifted a leading heading above the `<sup>N</sup>` line. Together the two cover every leading run the corpus carries — `[heading]`, `[subtitle]`, `[heading, subtitle]`, `[heading, heading]`, and `[subtitle, heading]` — so no subtitle strands inside a verse line behind a stray mid-line `> ` marker
- **A Literal `_`/`*` From Content Text Is Escaped in Markdown, Never Read as This Renderer's Own Emphasis Delimiter** – The standing convention for the next time source text and this exporter's own markdown grammar collide: a backslash escape (`\_`, `\*`), CommonMark's own standard answer for both characters. Applied only to text taken verbatim from content — a bare string, or a node's own `text` — never to a delimiter this renderer emits itself (`boldWrapper`'s `**`, `italicWrapper`'s `_`), so real emphasis markup is never re-escaped. The real case: the retired BYZ2018's apparatus footnotes cited manuscript sigla in Beta-code, where `_`/`*` are ordinary notation rather than markup (e.g. Revelation 11:2's `= _*M*B`); left unescaped, `*M*` is a matched single-asterisk pair CommonMark reads as italic even though this exporter's own italic wrapper never emits a single `*`. The plain-text export has no delimiter grammar to collide with, so it escapes nothing
- **A Footnote Marker Always Hugs the Word It Annotates — Enforced in the Data, Not the Renderer** – A footnote attaches to the text run its own marker follows, so the joining space between two words belongs on the *leading* edge of the word after the footnote, never on the trailing edge of the word the footnote itself sits on; a `foot`-carrying node whose own `text` ends in a space puts the exported marker one character away from the word it annotates instead of against it (real ASV1901 shape, before the fix: `<sup>a</sup>` renders as `…the Spirit of God <sup>a</sup>moved…` instead of `…God<sup>a</sup> moved…`). This exporter renders the marker exactly where the source data puts the boundary — `renderTextObjectParts` appends the marker in the node's own suffix, after whatever text and trailing whitespace that node carries — so the fix lives upstream in `npm run validate`'s own auto-fix pass, not in this renderer. Because the pipeline enforces the leading-space convention for every `foot`-carrying node on every run, this exporter carries no compensating logic of its own for the shape and needs none; see [validation.md](./validation.md) and [strongs-node-audit.md](./strongs-node-audit.md), the footnote-marker-spacing check, for where the rule is enforced

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
  escapeSourceText: (text: string) => string; // Escapes this format's own delimiter characters when they appear in text taken verbatim from content
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
  // The text export has no delimiter grammar of its own to collide with —
  // "_"/"*" are ordinary printable characters here, so nothing is escaped.
  escapeSourceText: (text) => text,
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
  escapeSourceText: escapeMarkdownDelimiters,
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

Called once per transition between array siblings (not once per node), so a run of same-marked words shares one open delimiter and one close delimiter rather than each word wrapping itself. This is the fix for markdown output that used to look like `**word****word**`.

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
