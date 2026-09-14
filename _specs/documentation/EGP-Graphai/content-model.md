# Content Model

The content model is the heart of Graphai. A single recursive schema describes everything you can say about a piece of Scripture: a word, a verse, a paragraph, a heading, a cross-reference. Every consumer (validator, exporter, reader) walks that same shape.

This document explains how the shape is organized and why each variant exists. For type signatures and the full schema, see [types/Content.ts](../../../types/Content.ts) and [content-schema.json](../../../content-schema.json).

## Why recursive?

Scripture is uneven. One verse is a single sentence; the next is a poem with line breaks and a psalm-style superscription; another is a narrative with a footnote attached to a single Hebrew word. Trying to bolt these onto a flat row would mean a table of nullable columns. Instead, the same `Content` type is allowed to appear anywhere a piece of content is: inside a paragraph, inside a footnote, inside a heading, even inside another nested content wrapper that exists only to hoist a Strong's number across several words.

The trade-off: every consumer must dispatch on the shape of each node and recurse. The payoff: any new presentation primitive (subtitles, Bible links, future additions) is just one more discriminated case, with no schema migrations for existing data.

## The eight shapes

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
| Abbreviation   | `{ abbr: "NA27" }`                          | Reference to the version's abbreviation registry         |
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

**Abbreviation as a reference, not text.** A critical apparatus repeats the same few sigla thousands of times over. `CT` and `WH` alone account for most of BYZ2026's footnotes. Spelling each one out inline would mean thousands of copies of the same bibliographic entry, and correcting one entry would mean editing every copy. So content carries only the id. `_version.json` carries an `abbr` array of `{ _id, name, description }`, where `name` is how the code prints and `description` is what it stands for. `name` is itself content, so `NA27` prints as `NA` plus a `27` carrying the `sup` mark. The text and markdown exports render the name and drop the description. The web reader shows the name, with the description on hover and in a modal.

Every version has its own registry and there is no shared fallback. The same short code means different things in different editions. MSB2025's `MT` is the Hebrew Masoretic Text; WEBUS2020's is the Byzantine Greek Majority Text. `CT` splits the same way, generalizing over a different set of critical editions in BYZ2026 than in MSB2025. An id resolved outside its own version would pick up the wrong meaning, so `validate` reports an unresolved id as an error instead of looking elsewhere for it.

A registry entry decides its own typography, and the markdown exporter honors it. When a `name` is a single object carrying `i` or `b`, the siglum joins the emphasis run around it rather than opening a span of its own, so a siglum followed by an editorial remark prints as one italic run the way the source edition sets it. A name that is a bare string or an array renders opaquely, since the first has no emphasis to share and the second can vary its marks element by element.

## Annotations: Strong's, morphology, lemmas

Three lexical pointers can attach to any text object or nested wrapper:

- **Strong's number**: concordance ID matching `^[GH][0-9]{1,4}$`. `G` for New Testament Greek, `H` for Hebrew/Aramaic Old Testament. The web reader turns these into outbound links to the EGP lexicon site.
- **Morphology**: parsing code (Robinson/Packard format for Greek, OSHB-style for Hebrew). Format is intentionally not validated; different translations use different code systems.
- **Lemma**: dictionary form in the original script. Useful when the lemma differs from the surface form (which it almost always does in Greek/Hebrew).

These three are independent. A node can have any subset. Toggles in the reader let students show or hide each independently.

**Where a missing one comes from.** `npm run validate` fills in whichever of the two a script-tagged word node is missing, in one pass over the tree.

A `lemma` is resolved for a node that carries a morphology code and none of its own — 140,107 of BYZ2026's 140,146, which arrived with Strong's numbers and no lemmas — by narrowing the roots the codex holds for the printed spelling, first by the parse the morph code states, then by the Strong's number the node already carries. A spelling two dictionary entries still share after both is reported and left blank rather than guessed at: 39 nodes, 38 of them `ἄρα` against `ἆρα`.

A `strong` is resolved from that lemma for a node carrying no number of its own — 570,435 of LXX1935's 623,684, which arrived with lemmas and morphology and no Strong's numbers — through the index's placement rules, the number the codex puts on the cell itself, and the root's own single number, in that order. The remaining 53,249 are almost entirely roots the index has no number for at all, which is what makes this "where available" rather than a gap to close. See [lexical-map.md](lexical-map.md).

**An existing value is never rewritten.** This is the difference between an annotation and a transliteration. A `lemma` or a `strong` a version already carries can hold a disambiguation a person made from the surrounding sentence, which no function can re-derive from the word alone, so validate writes only where the field is absent and reports a disagreement instead of repairing it. A `transliteration` has exactly one right answer given the text, so it is recomputed and overwritten on every run. The single hand-edit that survives a run is a node storing its own `text` verbatim, which marks a form that does not romanize at all — see below.

## Transliteration

A text object carrying `script` also carries `transliteration`: its own `text` romanized by the table the lexical map's language registry declares for that script. `npm run validate` writes it on every run, and the nested wrapper has none — it has no `text` of its own, so there would be nothing to check the value against.

The point of storing it is that a consumer can print a transliterated edition without implementing the scheme, and the field is shaped so that printing one is a substitution and nothing else:

- **Word boundaries, capitalization and whitespace are the text's own.** Each word is romanized by itself and everything between and around the words carries through, so `{ text: " χριστοῦ," }` stores `" christoû,"`, leading space and trailing comma intact.
- **Script-specific punctuation converts.** The Greek ano teleia (U+0387) reads as a semicolon and the Greek question mark (U+037E) as a question mark. Every other mark — commas, dashes, ellipses, editorial brackets, the elision apostrophe, digits — stands as printed.
- **Stitching the transliterations yields what stitching the texts does**: the same word boundaries, the same spacing, the same punctuation in the same places.

**Or the node's own text, where there is nothing to romanize.** A Greek alphabetic numeral is letters standing for a number: REV 13:18 prints `χξς` and means 666. The table has an answer for those letters, `chxs`, and it is the wrong kind of thing — not the number, and not a word anyone reads. So the node stores its own `text` as its transliteration, and a transliterated edition prints the numeral the way the Greek prints it.

That equality is both the marking and the way validate recognizes it: a stored value that already equals the node's `text` is held rather than recomputed. Nothing new goes in the schema, and there is no list of exempt references to keep in step with the text. The cost is that a value set equal to its text by mistake is preserved just as faithfully, so the lexical-enrichment audit counts these per version — three in BYZ2026, one in LXX1935 — and a wrong one shows up there as a number that moved. The count is of nodes where holding and recomputing give different answers; a text the table reproduces unchanged, such as a lone stigma, is equal either way and is not counted.

A consumer still needs `node.transliteration ?? node.text`. A bare string in a content array carries no keys, and neither a Latin node nor an `abbr` name has a transliteration to offer.

`npm run export` is that consumer, and the worked example of what the field buys: it writes `exports/markdown-par/<VERSION>-Transliterated/` for every version declaring a `script`, using the same renderer with one option changed. See [The transliterated markdown](data-pipeline.md#the-transliterated-markdown).

Two things the field is deliberately not. It is **not** looked up in the codex, whose key folds initial case away and reads a grave as its acute — see [lexical-map.md](lexical-map.md). And it is **not** written where no language registry declares the node's script, which today means every Hebrew node: `npm run validate` leaves those as printed and reports the count rather than guessing at a scheme.

## Formatting marks

A `marks` array carries presentation choices:

| Mark  | Meaning                                                       |
| ----- | ------------------------------------------------------------- |
| `i`   | Italic: supplied words, emphasis                             |
| `b`   | Bold: strong emphasis                                        |
| `woc` | Words of Christ: rendered in the user's chosen accent color  |
| `sc`  | Small caps: divine names (LORD, GOD) in OT translations      |
| `sup` | Superscript: edition numbers (NA27), manuscript corrector and legibility modifiers (D2, 1143vid) |

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

Two more surfaces matter if your shape is a *leaf* that renders text of its own, the way `abbr` and `bibleLink` do. `describeNode` in [utils/auditNodes.ts](../../../utils/auditNodes.ts) and `isBoundary` in [functions/tagScriptRunsInContent.ts](../../../functions/tagScriptRunsInContent.ts) both classify siblings in an array to decide what may merge or split. A leaf that neither one recognizes looks like a text node with no text, so the merge and script-tagging passes draw conclusions about its neighbors that its rendered output contradicts. Add it to both boundary checks.

The exporter needs one more thing from a new *mark*. Its array branch shares emphasis delimiters across adjacent siblings carrying the same marks, and it builds each node's `core` in `renderTextObjectParts` and `renderNestedContentParts`, never through `wrapEmphasisMarks`. A mark applied anywhere but where the core is built works on a lone node and vanishes inside an array. That is where `sup` is applied.

A leaf can still take part in that emphasis run when the marks it renders with come from somewhere else. Both `abbr` and `bibleLink` do, one from its registry entry's `name` and the other from its display override, and each has a resolver naming the one shape allowed in: a single object carrying marks, never an array. Keep any future case that narrow. An array can change marks between its elements, leaving the run no single state to carry forward.
