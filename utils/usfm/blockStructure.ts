/**
 * Turns one verse's own block-split pieces (`usfm/segmentVerses.ts`'s
 * {@link VerseBlock}) into the shape `content-schema.json` actually wants —
 * the pure, side-effect-free half of the pipeline: `segmentVerses.ts` owns
 * the token-stream walk that decides *where* a paragraph starts or a line
 * ends; this module owns nothing but "given the decision, what does the
 * JSON look like."
 *
 * Four shapes, matched directly against already-shipped precedent rather
 * than invented:
 *
 * - A block carrying {@link VerseBlock.headingContent} (a `\d`/`\ms1`/`\sp`-
 *   derived `subtitle`/`heading` object) is pushed as-is, never expanded
 *   from `text`/`nodes` and never a `paragraph`/`break` target — matching
 *   `NKJV1982/19-PSA.json`'s own shape, where a heading/subtitle always
 *   stands as its own sibling array item rather than sharing a node with
 *   the paragraph content beside it.
 * - Exactly one node, no flags at all → a bare string.
 * - Exactly one node, carrying a flag (or `strong`/`marks`) → a bare
 *   object, never wrapped in a one-element array — `paragraph`/`break`
 *   attach to that same node rather than a separate wrapper, matching
 *   `KJV1769/01-GEN.json` 1:1's own first node,
 *   `{ "paragraph": true, "text": "In the beginning", "strong": "H7225" }`.
 * - More than one node → an array mixing bare strings and objects in
 *   source order.
 */

import Content, { ContentHeading, ContentObject, ContentSubtitle } from "../../types/Content";
import { collapseContentNodes } from "./inlineMarks";
import { VerseBlock } from "./segmentVerses";

/**
 * Converts one verse's own ordered blocks into `content-schema.json`'s
 * `Content` shape (see this module's own doc comment for the four shapes).
 *
 * @throws When `blocks` is empty — `segmentVerses()` always emits at least
 *   one block per verse (falling back to real footnote text for the small
 *   handful of verses with no verse text of their own; see its own doc
 *   comment), so an empty array here means a caller bypassed that
 *   guarantee, not a real verse this function should silently paper over.
 */
export function buildBlockContent(blocks: readonly VerseBlock[]): Content {
  if (blocks.length === 0) {
    throw new Error("buildBlockContent: no blocks to render — segmentVerses() never emits an empty verse");
  }

  const allNodes: (ContentObject | ContentHeading | ContentSubtitle)[] = [];
  for (const block of blocks) {
    if (block.headingContent !== undefined) {
      allNodes.push(block.headingContent);
      continue;
    }

    // A block with no `nodes` of its own (no `\w`/`\wj`/`\qs` event
    // anywhere in it) falls back to its own plain `text` as a single node.
    const nodes = (block.nodes && block.nodes.length > 0 ? block.nodes : [{ text: block.text }]).map((node) => ({
      ...node,
    }));
    if (block.paragraph) nodes[0] = { ...nodes[0], paragraph: true };
    if (block.break) nodes[nodes.length - 1] = { ...nodes[nodes.length - 1], break: true };
    allNodes.push(...nodes);
  }

  return collapseContentNodes(allNodes);
}
