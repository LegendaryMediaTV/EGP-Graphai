# EGP BB Format Documentation

## Overview

The **EGP BB Format** is a legacy BBCode-based markup system used for encoding Bible verses with lexical metadata, formatting, and structural information. This document serves as the authoritative reference for implementing bidirectional conversion between BB and Graphai formats.

## BB Format Structure

### Core Components

BB format consists of three primary parts:

```typescript
interface BBVerse {
  subtitle?: { text: string; footnotes?: { text: string; type?: string }[] }; // Subtitle sub-object with optional footnotes G (referenced by ° marker in `text`)
  text: string; // Main content with BB markup tags
  paragraphs?: number[]; // Character positions where paragraphs begin (0-indexed)
  footnotes?: { type?: string; text: string }[]; // Footnote content (referenced by ° marker in `text`)
}
```

### Tag Inventory

BB uses bracket-based tags similar to BBCode:

#### 1. Script Tags (Language/Writing System)

- `[greek]text[/greek]` - Greek text (maps to `script: "G"`)
- `[hebrew]text[/hebrew]` - Hebrew text (maps to `script: "H"`)

**Critical Patterns:**

```
[greek]Ἐν[/greek] [strongs id="g1722" m="PREP" /]
[greek]ἀρχῇ[/greek] [strongs id="g746" m="N-DSF" /]
[greek]λόγος,[/greek] [strongs id="g3056" m="N-NSM" /]
```

**Key Observations:**

- Punctuation (commas, periods) are INSIDE the closing tag
- Space appears AFTER `[/greek]` and BEFORE `[strongs`
- In original language versions, text and Strong's tag are always separate elements

#### 2. Formatting Tags (Text Styling)

- `[i]text[/i]` - Italic text (maps to `marks: ["i"]`)
- `[b]text[/b]` - Bold text (maps to `marks: ["b"]`)
- `[sc]text[/sc]` - Small caps (maps to `marks: ["sc"]`)
- `[red]text[/red]` - Words of Christ (maps to `marks: ["woc"]`)
- `[heading]text[/heading]` - Section heading (maps to `{ heading: [...] }`)

#### 3. Lexical Tags (Strong's & Morphology)

Self-closing tags with attributes:

```
[strongs id="gNNNN" /]                           // Greek, no morphology
[strongs id="gNNNN" tvm="code" /]                // Greek with TVM morphology
[strongs id="gNNNN" tvm="code1" tvm2="code2" /]  // Greek with DUAL TVM (rare!)
[strongs id="gNNNN" m="code" /]                  // Greek with Robinson morphology
[strongs id="hNNNN" /]                           // Hebrew, no morphology
[strongs id="hNNNN" tvm="NNNN" /]                // Hebrew with numeric TVM
```

**TVM2 Attribute (Rare):**

Indicates morphological ambiguity where a word form could be parsed multiple ways:

```
[strongs id="g0373" tvm="PresMidInd" tvm2="PresMidImpr" /]
[strongs id="g4100" tvm="PresActInd" tvm2="PresActImpr" /]
```

**Attribute Reference:**

| Attribute | Usage        | Format                      | Example                     |
| --------- | ------------ | --------------------------- | --------------------------- |
| `id`      | Required     | `g` or `h` + up to 4 digits | `g1722`, `h3068`, `g1`      |
| `m`       | Greek        | Robinson morphology code    | `N-DSF`, `V-IAI-3S`, `PREP` |
| `tvm`     | Greek/Hebrew | Morphology code             | `ImpfInd`, `8804`           |
| `tvm2`    | Rare Greek   | Secondary morphology        | `PresMidImpr`               |

> **Note:** Hebrew TVM values are numeric codes corresponding to specific Hebrew verb forms.

**Strong's Tag Placement:**

Strong's tags appear after the word they reference:

```
// English with Strong's
In [strongs id="g1722" /] the beginning [strongs id="g746" /]

// Greek with Strong's
[greek]λόγος,[/greek] [strongs id="g3056" m="N-NSM" /]
```

#### 4. Subtitle Markers (deprecated)

**Format:** `«text»` (guillemets U+00AB and U+00BB, followed by a space)

**Usage:** Embedded at the start of verse text, typically for Psalm titles/inscriptions

**Example:**

```
«Shiggaion [strongs id="h7692" /] of David [strongs id="h1732" /]...» O LORD [strongs id="h3068" /] my God...
```

**Key Points:**

- Starts with `«`, ends with `»` followed by space
- Can contain Strong's tags inline
- Not a BB tag type—just special characters in the text
- In Graphai: Preserved as plain text within the content array

#### 5. Subtitles Sub-object (preferred over markers)

**Format:** `subtitle` sub-object with text and optional footnotes array

**Usage:** Subtitle content for verses with support for multiple footnotes

**Example:**

```json
{
  "subtitle": {
    "text": "A Psalm by David, when he fled from Absalom his son.",
    "footnotes": [
      { "type": "stu", "text": "First explanatory note" },
      { "type": "var", "text": "Second note" }
    ]
  }
}
```

**Key Points:**

- Optional sub-object at verse level
- Contains plain text and array of footnotes
- Supports multiple footnotes unlike legacy format
- In Graphai: Maps directly to `subtitle` content

#### 6. Italicized/Supplied Words

**Format:** `[word]` - literal square brackets in text (NOT BB markup)

**Purpose:** Words added by translators for readability (e.g., KJV tradition)

**Examples:** `[was]`, `[it]`, `[your]`

**Critical:** These look like BB tags but are literal characters. Preserve as-is in conversions.

#### 6. Structural Markers

**Paragraphs:**

- Encoded as `paragraphs: [0, 51, 156]` array (character indices)
- Position `0` = verse starts with paragraph
- Non-zero values = character index of space where paragraph break occurs
- In Graphai: Converted to `paragraph: true` on elements

**Line Breaks:**

- BB: Newline character `\n` in text
- Graphai: `break: true` on element

**Footnotes:**

- Marker: `°` (degree symbol U+00B0) in text
- Content in separate `footnotes` array
- Multiple `°` markers reference footnotes sequentially

```json
{
  "text": "word° more text° end",
  "footnotes": [
    { "text": "first note", "type": "trn" },
    { "text": "second note" }
  ]
}
```

**Footnote Types:**

- `"trn"` - Translation note
- `"var"` - Textual variant
- `"xrf"` - Cross-reference
- `"map"` - Map reference
- `"stu"` - Study note (or omit type for default)

## Graphai Schema Comparison

| Feature                 | BB Format                                      | Graphai Format                     | Notes                               |
| ----------------------- | ---------------------------------------------- | ---------------------------------- | ----------------------------------- |
| **Plain Text**          | String in `.text`                              | String or `{ text: "..." }`        | Graphai more flexible               |
| **Greek Text**          | `[greek]Λόγος[/greek]`                         | `{ text: "Λόγος", script: "G" }`   |                                     |
| **Hebrew Text**         | `[hebrew]...[/hebrew]`                         | `{ text: "...", script: "H" }`     |                                     |
| **Italic**              | `[i]text[/i]`                                  | `{ text: "text", marks: ["i"] }`   |                                     |
| **Bold**                | `[b]text[/b]`                                  | `{ text: "text", marks: ["b"] }`   |                                     |
| **Small Caps**          | `[sc]text[/sc]`                                | `{ text: "text", marks: ["sc"] }`  |                                     |
| **Words of Christ**     | `[red]text[/red]`                              | `{ text: "text", marks: ["woc"] }` |                                     |
| **Strong's Number**     | `id="g1234"` (lowercase)                       | `strong: "G1234"` (uppercase)      | Case conversion, no zero-padding    |
| **Morphology (Greek)**  | `m="D-NSM"` or `tvm="PresActInd"`              | `morph: "D-NSM"`                   | Single morph field                  |
| **Morphology (Hebrew)** | `tvm="8804"`                                   | `morph: "8804"`                    | Numeric codes preserved             |
| **Morphology Dual**     | `tvm="..." tvm2="..."`                         | `morph: ".../..."`                 | Slash separator for ambiguous forms |
| **Paragraphs**          | `paragraphs: [0, 156]` (char offsets)          | `paragraph: true` on element       | Position-based → marker-based       |
| **Line Breaks**         | `\n` in text                                   | `break: true` on element           | Structural conversion               |
| **Footnotes**           | `°` + separate array                           | `foot: { content: [...] }` inline  | Externalized → inline               |
| **Subtitles**           | `subtitle` and `subtitleFootnotes` sub-objects | `subtitle` content                 |                                     |
| **Headings**            | `[heading]text[/heading]` in text              | `{ heading: [...] }`               |                                     |
| **Supplied Words**      | `[was]` literal brackets                       | `"[was]"` in text                  | Preserved as-is                     |

**Key Concept: Whitespace Handling**

Spaces are part of the text content, not special parsing tokens. Tags wrap their content precisely:

```javascript
// BB
"word [greek]Λόγος[/greek] word"[
  // Graphai
  ("word ", // Ends with space
  { text: "Λόγος", script: "G" }, // No spaces
  " word") // Starts with space
];
```

## BB → Graphai Conversion Logic

### Critical Parsing Rules

1. **Tag Detection:** Use regex `/\[([^\]]+)\]/g` to find all `[...]` patterns
2. **Tag Classification:**
   - Ends with `/` → Self-closing (strongs)
   - Starts with `/` → Closing tag
   - Otherwise → Opening tag
3. **Supplied Words:** If tag doesn't match known types, treat as literal text
4. **Footnote Markers:** Process `°` symbols and correlate with footnotes array
5. **Heading Tags:** `[heading]...[/heading]` maps to Graphai heading content
6. **Subtitle Sub-object:** `subtitle` field maps to Graphai subtitle content

### Paragraph Position Calculation

Paragraphs array contains character indices in the final BB text:

- **Position 0:** Verse starts with paragraph (first element gets `paragraph: true`)
- **Non-zero positions:** Character index of the space where paragraph break occurs
- **the space is DROPPED**

**Example:** `"First sentence. Second sentence."` with `paragraphs: [0, 15]`

- Position 0: First element gets `paragraph: true`
- Position 15: The space at index 15 ("First sentence." is 15 chars, so position 15 is the space after it) is the paragraph marker, so it's **DROPPED** from the text
- Result: `[{ text: "First sentence.", paragraph: true }, { text: "Second sentence.", paragraph: true }]` - NO space in either element

### TVM2 Handling

Dual morphology codes indicate ambiguous word forms. Concatenate with "/" separator:

```javascript
// BB
[strongs id="g2476" tvm="ImpfActInd" tvm2="PerfActInd" /]

// Graphai
{ text: "there standeth one", strong: "G2476", morph: "ImpfActInd/PerfActInd" }
```

## Graphai → BB Conversion Logic

### Supported Features

- `subtitle` content → `subtitle` sub-object with footnotes
- `heading` content → `[heading]...[/heading]` in text (footnotes stored along with text footnotes)

### Unsupported Features

When converting Graphai → BB:

- Wrapper objects like `{ paragraph: [...] }` - Unwrapped, content processed

### Strong's Number Normalization

Convert uppercase to lowercase, no zero-padding:

```javascript
// Graphai → BB
"G1" → "g1"
"G746" → "g746"
"G1234" → "g1234"
```

### Morphology Attribute Selection

Choose attribute based on morphology format:

- Contains `-` (hyphen) → use `m` attribute: `N-DSF`, `V-IAI-3S`
- All caps, no hyphens → use `m` attribute: `PREP`, `CONJ`, `ADV`
- Otherwise → use `tvm` attribute: `PresActInd`, `8804`

### Text Reconstruction

Concatenate text and wrap tagged content:

```javascript
// English with Strong's
[{ text: "In", strong: "G1722" }, { text: " the beginning", strong: "G746" }]
→ 'In [strongs id="g1722" /] the beginning [strongs id="g746" /]'

// Greek with Strong's
{ text: "Οὗτος", script: "G", strong: "G3778", morph: "D-NSM" }
→ "[greek]Οὗτος[/greek] [strongs id=\"g3778\" m=\"D-NSM\" /]"
```

### Footnote Externalization

Convert inline footnotes to external array:

1. Scan content for elements with `foot` property
2. Replace foot with `°` marker in text
3. Recursively convert `foot.content` to BB format
4. Add to footnotes array in order

### Paragraph Position Calculation

Calculate character indices for `paragraphs` array:

1. Build BB text string incrementally
2. Track cumulative character count
3. When encountering `paragraph: true`, record current position
4. If first element: record position `0`

## Known Quirks & Edge Cases

### Script Tags Are Wrappers

Script tags wrap precisely the original language text:

```javascript
// BB
"word [greek]Λόγος[/greek] word"[
  // Graphai - spaces belong to surrounding elements
  ("word ", { text: "Λόγος", script: "G" }, " word")
];
```

### Strong's Tags Without Text

Consecutive or leading Strong's tags are valid:

```
[strongs id="g1722" /] the beginning
the Benjamite [strongs id="h1121" /] [strongs id="h1145" /]
```

### Nested Formatting Tags

```
[i][red]italic red text[/red][/i]
→ { text: "italic red text", marks: ["i", "woc"] }
```

Order in `marks` array doesn't matter.

### Unrecognized Tags

Non-standard tags treated as literal text:

```
Some [custom] text → "Some [custom] text"
```

### Punctuation in Script Tags

Punctuation stays INSIDE the closing tag:

```
[greek]λόγος,[/greek]  // Comma inside
[greek]θεόν.[/greek]   // Period inside
```

### Footnote Content Recursion

Footnote content can contain BB markup—parse recursively.

### Curly Quotes

Bible text uses curly quotes (U+201C " and U+201D "), not straight quotes (U+0022 ").

## Round-Trip Conversion Notes

The conversion is designed for **lossless conversion of supported features**, with these expected differences:

### Normalization

1. **Strong's Zero-Padding:** BB export strips leading zeros (`g0746` → `g746`)
2. **Case Conversion:** Strong's IDs uppercase in Graphai, lowercase in BB

### Unsupported Features

- **TVM2 Morphology:** Secondary morphology code may not round-trip perfectly
- **Paragraph Positions:** Character positions may shift slightly due to spacing

### Recommended Usage

- **BB → Graphai:** Full fidelity for supported features
- **Graphai → BB:** Full fidelity for supported features
- **Round-trip:** Expect minor formatting differences, not data loss
