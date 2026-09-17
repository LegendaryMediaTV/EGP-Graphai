/**
 * Writes the `lemma` and the `strong` the lexical map resolves for a word the
 * corpus left without one. `utils/validate.ts` calls
 * {@link resolveLexicalAnnotationsInContent} on every run, with no flag to opt
 * in or out.
 *
 * **Written only where absent, and never over an existing value.** This is the
 * line between a step that belongs inside `npm run validate` and a tool that
 * rewrites a corpus. An annotation already on a node can carry a judgment a
 * person made — a disambiguation from context that no function can re-derive —
 * so a value that disagrees with the map is reported by the audit and left
 * exactly as it stands. That rule is also why this step never narrows BYZ2026's
 * existing Strong's numbers to the finer cell-level ones the codex holds: every
 * lemma-carrying word there already carries a number, so there is nothing
 * absent to write.
 *
 * **Nothing is ever guessed.** {@link resolveLemma} and {@link resolveStrongs}
 * answer with a reason rather than a best effort, and a reason means the field
 * stays off. Across LXX1935 that is 53,249 words out of 623,684, nearly all of
 * them roots the index simply has no number for.
 *
 * **Only a script-tagged node is a candidate.** A lexical map belongs to a
 * language, and a node's `script` is this repo's own statement of which
 * language's map is about it. Without that gate the step would ask a Greek
 * codex about KJV1769's 99,993 morphology-tagged English words, find nothing,
 * and report 93,952 misses that were never candidates.
 *
 * **One walk, one node at a time, both fields together.** Both answers come from
 * resolving the same node against the same codex, and the lemma written here is
 * the lemma the Strong's lookup then reads — a node arriving with a morph and
 * neither annotation leaves with both, without a second pass over the tree.
 */

import Content from "../types/Content";
import { mapContentNodes } from "../functions/mapContentText";
import { resolveLemma, resolveStrongs } from "./lexicon";

/**
 * Names every script-tagged word node in one verse's `content` tree that the
 * map can name and the corpus has not, footnote bodies included.
 *
 * A node is a word this can answer for when it has `text`, a `script`, and
 * either a morphology code or a lemma: the code is what says the corpus
 * considers the node one taggable word and is what a lemma resolves from, and a
 * lemma is what a Strong's number resolves from. BYZ2026's footnote variants
 * have text and a script and neither, and are correctly passed over — readings
 * from a manuscript apparatus rather than words in the sentence.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @param morphology - The scheme id the version declares in its own
 *   `_version.json` (`"robinson"`), without which a morphology code cannot be
 *   read and only a spelling held by exactly one root resolves
 * @returns The rewritten tree (the original reference when nothing changed) and
 *   whether anything did
 */
export function resolveLexicalAnnotationsInContent(
  content: Content,
  morphology?: string,
): { content: Content; changed: boolean } {
  return mapContentNodes(content, (node) => {
    if (typeof node.text !== "string" || node.script === undefined)
      return undefined;

    const resolved: Record<string, unknown> = {};

    let lemma = node.lemma;
    if (lemma === undefined && node.morph !== undefined) {
      const resolution = resolveLemma({
        text: node.text,
        morph: node.morph,
        morphology,
        strong: node.strong,
      });
      if ("lemma" in resolution) lemma = resolved.lemma = resolution.lemma;
    }

    if (node.strong === undefined && typeof lemma === "string") {
      const resolution = resolveStrongs({
        lemma,
        text: node.text,
        morph: node.morph,
        morphology,
      });
      if ("strong" in resolution) resolved.strong = resolution.strong;
    }

    return Object.keys(resolved).length ? { ...node, ...resolved } : undefined;
  });
}
