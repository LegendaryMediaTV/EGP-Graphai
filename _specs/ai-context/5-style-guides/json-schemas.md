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
          "items": { "enum": ["i", "b", "woc", "sc"] },
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
        "heading": { "$ref": "#" }
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
