# JSON Schema Style Guide

## Overview

JSON Schemas in this project use JSON Schema Draft-07 to define the structure of Bible data. Schemas are interconnected via `$ref` and provide validation for all data files.

## Structure Pattern

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/LegendaryMediaTV/EGP-Graphai/path/to/schema.json",
  "title": "EGP Graphai • Schema Name",
  "description": "Brief description of what this schema validates.",

  "type": "array|object",

  "definitions": {
    "reusableType": {
      "type": "object",
      "properties": { ... }
    }
  },

  "items": { "$ref": "#/definitions/reusableType" },

  "properties": {
    "fieldName": {
      "type": "string",
      "description": "Field description."
    }
  },

  "required": ["field1", "field2"],
  "additionalProperties": false
}
```

## Naming and Organization

- **File names** – `kebab-case-schema.json` (e.g., `bible-books-schema.json`)
- **Schema IDs** – Full GitHub URL path matching file location
- **Titles** – `EGP Graphai • Descriptive Name` format
- **Definitions** – `camelCase` for definition keys

## Common Patterns

### Enum Constraints

```json
{
  "type": "string",
  "enum": ["OT", "NT"],
  "description": "Testament classification."
}
```

### Pattern Constraints

```json
{
  "type": "string",
  "pattern": "^[GH][0-9]{1,4}$",
  "description": "Strong's number in G/H + digits format."
}
```

### Cross-Schema References

```json
{
  "$ref": "https://github.com/LegendaryMediaTV/EGP-Graphai/bible-books/bible-books-schema.json#/definitions/book/properties/_id"
}
```

### Local References

```json
{
  "$ref": "#/definitions/localDefinition"
}
```

### Recursive Self-Reference

```json
{
  "items": { "$ref": "#" }
}
```

### Content Schema Reference

```json
{
  "$ref": "../content-schema.json"
}
```

### Required Fields

```json
{
  "required": ["_id", "name", "title"],
  "additionalProperties": false
}
```

### oneOf for Union Types

```json
{
  "oneOf": [
    { "type": "string" },
    { "type": "object", "properties": { ... } },
    { "type": "array", "items": { "$ref": "#" } }
  ]
}
```

## Example: Content Schema (Recursive)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/LegendaryMediaTV/EGP-Graphai/content-schema.json",
  "title": "EGP Graphai • Content Schema",
  "description": "Flexible schema for multilingual or structured text content.",
  "oneOf": [
    {
      "type": "string",
      "minLength": 1,
      "description": "Plain text."
    },
    {
      "type": "object",
      "description": "Structured content object.",
      "properties": {
        "text": { "type": "string" },
        "script": { "enum": ["G", "H"] },
        "marks": {
          "type": "array",
          "items": { "enum": ["i", "b", "woc", "sc", "sup"] },
          "uniqueItems": true
        },
        "strong": { "pattern": "^[GH][0-9]{1,4}$" },
        "paragraph": { "type": "boolean" },
        "break": { "type": "boolean" }
      },
      "minProperties": 1,
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "heading": { "$ref": "#" },
        "type": { "enum": ["standard", "acrostic"], "default": "standard" }
      },
      "required": ["heading"],
      "additionalProperties": false
    },
    {
      "type": "array",
      "items": { "$ref": "#" },
      "minItems": 1
    }
  ]
}
```

## Example: Bible Books Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/LegendaryMediaTV/EGP-Graphai/bible-books/bible-books-schema.json",
  "title": "EGP Graphai • Bible Books Registry",
  "description": "Canonical list of Bible books.",
  "type": "array",
  "items": { "$ref": "#/definitions/book" },
  "uniqueItems": true,
  "definitions": {
    "book": {
      "type": "object",
      "additionalProperties": false,
      "required": ["_id", "name", "title", "testament", "alt"],
      "properties": {
        "_id": {
          "type": "string",
          "description": "Unique 3-character identifier."
        },
        "name": {
          "$ref": "../content-schema.json",
          "description": "Primary book name."
        },
        "title": {
          "$ref": "../content-schema.json",
          "description": "Full title of the book."
        },
        "testament": {
          "enum": ["OT", "NT"],
          "description": "Testament classification."
        },
        "alt": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "uniqueItems": true,
          "description": "Alternate names/abbreviations."
        }
      }
    }
  }
}
```

## Example: Bible Verses Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/LegendaryMediaTV/EGP-Graphai/bible-versions/bible-verses-schema.json",
  "title": "EGP Graphai • Bible Verses",
  "description": "Schema for verse records with content and metadata.",
  "type": "object",
  "additionalProperties": false,
  "required": ["book", "chapter", "verse", "content"],
  "properties": {
    "book": {
      "$ref": "https://github.com/LegendaryMediaTV/EGP-Graphai/bible-books/bible-books-schema.json#/definitions/book/properties/_id"
    },
    "chapter": {
      "type": "integer",
      "minimum": 1
    },
    "verse": {
      "type": "integer",
      "minimum": 1
    },
    "content": {
      "$ref": "https://github.com/LegendaryMediaTV/EGP-Graphai/content-schema.json"
    }
  }
}
```

## Open-Keyed Schemas

Most schemas in this repo describe a fixed set of named properties. The lexical-map codex does not: its keys are the words of a language, so the schema constrains the *value* shape and leaves the key space open.

```json
{
  "$id": "https://github.com/LegendaryMediaTV/EGP-Graphai/lexical-maps/codex-schema.json",
  "type": "object",
  "additionalProperties": { "$ref": "#/$defs/root" },
  "$defs": {
    "root": {
      "type": "object",
      "additionalProperties": false,
      "required": ["language", "pos", "inflections"],
      "properties": {
        "inflections": {
          "type": "object",
          "minProperties": 1,
          "additionalProperties": {
            "type": "array",
            "items": { "$ref": "#/$defs/cell" },
            "minItems": 1
          }
        }
      }
    }
  }
}
```

Two conventions come with that shape:

- **`$defs` rather than `definitions`** in the lexical-map schemas, matching Draft-07's later naming. The older Bible schemas use `definitions`. Follow whichever the file already uses; do not mix them within one schema.
- **`additionalProperties: false` on every closed object, even inside an open-keyed parent.** The key space is open one level down; the value shape is not.

### Scalar-or-array unions

An index number is usually one value and occasionally several. Rather than forcing every consumer through an array, these schemas accept both and require `minItems: 2` on the array branch, so there is exactly one way to write any given value.

```json
{
  "strongs": {
    "oneOf": [
      { "type": "string", "pattern": "^[GH][0-9]{1,4}$" },
      {
        "type": "array",
        "items": { "type": "string", "pattern": "^[GH][0-9]{1,4}$" },
        "minItems": 2
      }
    ]
  }
}
```

### Say in `description` what the schema cannot check

Cross-file rules have nowhere to live in JSON Schema, so the lexical-map schemas carry them in prose and mark them as external. A reader of the schema alone still learns the whole rule.

> Every code must resolve in the language registry, at most one code per category, and required categories present for the part of speech; a variant's parse must be a subset of its canonical's parse (all checked outside this schema).

Phrase these as statements of the rule with the enforcement gap named, not as vague hedging. See [validation.md](../4-domains/validation.md) for which of them a walker actually runs today.
