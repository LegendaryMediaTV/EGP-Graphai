# Content Model

The content model is the heart of Graphai. A single recursive schema describes everything you can say about a piece of Scripture: a word, a verse, a paragraph, a heading, a cross-reference. Every consumer (validator, exporter, reader) walks that same shape.

This document explains how the shape is organized and why each variant exists. For type signatures and the full schema, see [types/Content.ts](../../../types/Content.ts) and [content-schema.json](../../../content-schema.json).

## Why recursive?

Scripture is uneven. One verse is a single sentence; the next is a poem with line breaks and a psalm-style superscription; another is a narrative with a footnote attached to a single Hebrew word. Trying to bolt these onto a flat row would mean a table of nullable columns. Instead, the same `Content` type is allowed to appear anywhere a piece of content is: inside a paragraph, inside a footnote, inside a heading, even inside another nested content wrapper that exists only to hoist a Strong's number across several words.

The trade-off: every consumer must dispatch on the shape of each node and recurse. The payoff: any new presentation primitive (subtitles, Bible links, future additions) is just one more discriminated case, with no schema migrations for existing data.

## The seven shapes

A `Content` value is always one of these:

| Shape          | Looks like                                  | Used for                                                  |
| -------------- | ------------------------------------------- | --------------------------------------------------------- |
| String         | `"In the beginning"`                        | Connector text with no annotations                        |
| Text object    | `{ text, strong, morph, marks, ... }`       | An annotated word or run of words                         |
| Nested wrapper | `{ content: ..., strong, morph, ... }`      | Shared annotation that spans multiple children            |
| Heading        | `{ heading: ... }`                          | Section title between verses                              |
| Subtitle       | `{ subtitle: ... }`                         | Psalm superscriptions, ascription lines                   |
| Paragraph wrap | `{ paragraph: <Content> }`                  | Explicit paragraph grouping (rare, usually a flag)       |
| Bible link     | `{ bibleLink: "Hebrews 11:3", content? }`   | Cross-reference target, with optional display override    |
| Array          | `[ ...Content ]`                            | Sequence of any of the above                              |

Most verses are an array of text objects with interspersed strings. The other shapes appear where they're needed.

### Discrimination order

Several shapes share property names (notably `content`). Consumers must check the shapes in the right order, or a `bibleLink` with an optional `content` override would be misread as a nested wrapper. The current dispatch order checks `heading`, `subtitle`, and `bibleLink` *before* falling through to the generic `content`-bearing wrapper. That order is used in [utils/exportContent.ts](../../../utils/exportContent.ts) and mirrored in [web/public/js/ContentNode.js](../../../web/public/js/ContentNode.js). If you add a new shape, place its check ahead of the generic wrapper if its objects also carry a `content` property.

## Why these particular shapes

Each shape exists because flat alternatives were tried and found wanting.

**Text object vs. nested wrapper.** A text object pins annotations to one piece of text. A nested wrapper pins them to a *group* of children. Greek lemmas often correspond to multi-word English renderings ("The book" in Matthew 1:1 is one Greek `βίβλος`). Without the wrapper, you'd duplicate `strong` across each word and lose the grouping.

**Heading vs. subtitle.** Headings are editorial section breaks ("The Sermon on the Mount"). Subtitles are inscriptions baked into the text itself ("A Psalm of David"). They render differently and toggle independently in the reader. A user might want one but not the other.

**Standard vs. acrostic headings.** A heading can carry an optional `type` of `standard` (the default) or `acrostic`, marking a Hebrew acrostic stanza marker: the letter name that opens each stanza of Psalm 119 in some translations. The distinction exists because a chapter can stack a subtitle, a standard heading, and an acrostic marker back to back, and a reader needs to tell at a glance which is which. All three renderers (text export, markdown export, web reader) render an acrostic heading one step smaller than a standard one; visibility is still governed by the reader's single "Headings" toggle for both.

**Paragraph as flag vs. wrapper.** Most paragraph breaks happen mid-verse and attach to a specific word; those use `paragraph: true` on a text object. A standalone paragraph wrapper exists for the rarer case where you need to group already-grouped content into a paragraph without picking an anchor word.

**Bible link with display override.** A footnote that says "see also Exodus 3:3–4" should show "Exodus 3:3–4" by default. But in formatted text where the book is already named ("the burning bush of Exodus 3:3–4"), you might want the displayed text to be just "3:3–4" while the link still targets the full reference. The optional `content` carries that override.

## Annotations: Strong's, morphology, lemmas

Three lexical pointers can attach to any text object or nested wrapper:

- **Strong's number**: concordance ID matching `^[GH][0-9]{1,4}$`. `G` for New Testament Greek, `H` for Hebrew/Aramaic Old Testament. The web reader turns these into outbound links to the EGP lexicon site.
- **Morphology**: parsing code (Robinson/Packard format for Greek, OSHB-style for Hebrew). Format is intentionally not validated; different translations use different code systems.
- **Lemma**: dictionary form in the original script. Useful when the lemma differs from the surface form (which it almost always does in Greek/Hebrew).

These three are independent. A node can have any subset. Toggles in the reader let students show or hide each independently.

## Formatting marks

A `marks` array carries presentation choices:

| Mark  | Meaning                                                       |
| ----- | ------------------------------------------------------------- |
| `i`   | Italic: supplied words, emphasis                             |
| `b`   | Bold: strong emphasis                                        |
| `woc` | Words of Christ: rendered in the user's chosen accent color  |
| `sc`  | Small caps: divine names (LORD, GOD) in OT translations      |

Marks are validated against a fixed enum; arrays are sorted alphabetically during canonical key ordering so diffs stay stable across edits.

## Footnotes

A footnote attaches to a text object or nested wrapper via the `foot` property. It carries a `type` (study, translation, variant, map, cross-reference) and its own `content`, which is, recursively, the same shape as the verse content itself. That means footnotes can contain Bible links, emphasized text, even mini paragraphs.

| Type  | Purpose                                                         |
| ----- | --------------------------------------------------------------- |
| `stu` | Study note (default): editorial commentary                     |
| `trn` | Translation note: alternate renderings                         |
| `var` | Textual variant: manuscript differences                        |
| `map` | Map reference: geographical pointer                            |
| `xrf` | Cross-reference: other Scripture                               |

In markdown exports, footnotes are collected per chapter and listed as a footnote block (lettered a–z, cycling). In the web reader, they open in a modal. The text exporter inlines them with a `°{...}` marker so they can be search-and-replaced cleanly.

## Canonical key order

When verses are validated, every content object's keys are reordered to a fixed sequence (see the top of [functions/sortContentKeys.ts](../../../functions/sortContentKeys.ts)). This isn't aesthetic. It's diff hygiene. Two contributors editing the same verse from different tools would otherwise produce reorderings that look like real changes in `git diff`. The canonical order fixes this so every commit reflects real content changes, not cosmetic ones.

Unknown keys are kept (never dropped) and appended alphabetically. That keeps round-trips safe if you store custom annotations in a fork.

## Adding a new shape: a checklist

If you're extending the content model with a new variant, all of the following must move together:

1. Add the case to [content-schema.json](../../../content-schema.json) under `oneOf`
2. Add a TypeScript interface to [types/Content.ts](../../../types/Content.ts) and include it in the `Content` union
3. Add the key (if it's a discriminator like `bibleLink`) to the canonical order in [functions/sortContentKeys.ts](../../../functions/sortContentKeys.ts), placed where it makes semantic sense
4. Add a dispatch case in [utils/exportContent.ts](../../../utils/exportContent.ts), before the generic nested-content branch if your shape also carries a `content` property
5. Add a dispatch case in [web/public/js/ContentNode.js](../../../web/public/js/ContentNode.js) with the same ordering rule
6. Add tests in [functions/__tests__/sortContentKeys.test.ts](../../../functions/__tests__/sortContentKeys.test.ts) and [utils/__tests__/exportContent.test.ts](../../../utils/__tests__/exportContent.test.ts)

Forgetting any one of these produces silently-broken output: validation passes but the variant doesn't render, or renders in the wrong slot. The recurring lesson is that all five surfaces must agree: schema, types, sorter, exporter, reader.
