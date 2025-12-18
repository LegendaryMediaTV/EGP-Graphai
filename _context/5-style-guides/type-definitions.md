# TypeScript Type Definitions Style Guide

## Overview

Type definition files in `types/` provide TypeScript interfaces that mirror the JSON Schema definitions. They enable type-safe processing of Bible data throughout the codebase.

## Structure Pattern

```typescript
// 1. Imports (related types only)
import RelatedType from "./RelatedType";

// 2. JSDoc comment (optional but encouraged for complex types)
/**
 * Description of what this type represents.
 * Include usage context and constraints.
 */

// 3. Main type/interface with default export
export default interface MainType {
  requiredField: string;
  optionalField?: number;
}

// 4. Related types as named exports (if tightly coupled)
export interface SubType { ... }
export type UnionType = "a" | "b" | "c";
```

## Naming and Organization

- **File names** – `PascalCase.ts` matching the primary exported type (e.g., `Book.ts`, `Content.ts`)
- **Interfaces** – `PascalCase` (e.g., `VerseSchema`, `ContentObject`)
- **Type aliases** – `PascalCase` for complex types, `camelCase` acceptable for simple unions
- **One primary type per file** – Related sub-types may be included
- **Folder** – All type definitions in `types/` directory

## Field Documentation

- Use inline comments for non-obvious fields
- Reference schema patterns for constrained fields
- Note defaults when relevant

```typescript
interface Example {
  _id: string; // Unique 3-character identifier
  script?: "G" | "H"; // Greek or Hebrew; Latin if omitted
  strong?: string; // Pattern: ^[GH][0-9]{1,4}$
  marks?: ("i" | "b" | "woc" | "sc")[]; // Formatting: italic, bold, words of Christ, small caps
}
```

## Pattern: Union Types for Flexible Content

```typescript
type Content =
  | string
  | ContentObject
  | ContentHeading
  | ContentParagraph
  | ContentSubtitle
  | Content[]; // Recursive for nested arrays
```

## Pattern: Discriminated Unions

```typescript
// Each variant has a unique key to discriminate
interface ContentHeading {
  heading: Content;
}

interface ContentParagraph {
  paragraph: Content;
}

interface ContentSubtitle {
  subtitle: Content;
}
```

## Example: Content.ts

```typescript
import Footnote from "./Footnote";

/**
 * Content type matching the flexible content-schema.json structure.
 * Can be a plain string, a structured object, or an array of content elements.
 */
type Content =
  | string
  | ContentObject
  | ContentHeading
  | ContentParagraph
  | ContentSubtitle
  | Content[];

/**
 * Plain text content object with optional formatting and metadata
 */
interface ContentObject {
  text: string;
  script?: "G" | "H"; // Greek or Hebrew script
  marks?: ("i" | "b" | "woc" | "sc")[]; // Formatting marks
  foot?: Footnote; // Attached footnote
  strong?: string; // Strong's number (G/H + digits)
  lemma?: string; // Lexical lemma
  morph?: string; // Morphological code
  paragraph?: boolean; // Starts new paragraph
  break?: boolean; // Ends with line break
}

interface ContentHeading {
  heading: Content;
}

interface ContentParagraph {
  paragraph: Content;
}

interface ContentSubtitle {
  subtitle: Content;
}

export default Content;
export type {
  ContentObject,
  ContentHeading,
  ContentParagraph,
  ContentSubtitle,
};
```

## Example: VerseSchema.ts

```typescript
import Content from "./Content";

export default interface VerseSchema {
  book: string; // Book identifier (e.g., "JHN")
  chapter: number; // Chapter number (1-indexed)
  verse: number; // Verse number (1-indexed)
  content: Content; // Flexible content structure
}
```

## Example: Footnote.ts

```typescript
import Content from "./Content";

export default interface Footnote {
  type?: "stu" | "trn" | "var" | "map" | "xrf"; // study, translation, variant, map, cross-ref
  content: Content;
}
```
