/**
 * Writes every script-tagged node's own text romanized, so a consumer printing
 * a transliterated edition reads a field instead of implementing the scheme.
 * `utils/validate.ts` calls {@link transliterateScriptRunsInContent} on every
 * run, with no flag to opt in or out.
 *
 * **Derived data, so it is written and overwritten, never preserved.** A
 * `lemma` or a `strong` can carry a judgment a person made that no function can
 * re-derive, which is why the passes that write those leave an existing value
 * alone. A transliteration is a pure function of the node's own `text` and the
 * registry's table, with exactly one right answer, so a stored value that
 * disagrees is stale rather than considered. The invariant, stated in one
 * direction: **a node carries a `transliteration` exactly when it has `text`
 * and a `script` some registry declares, and the value is what that registry's
 * table produces — or the node's own `text` verbatim, which marks a form that
 * does not romanize at all.**
 *
 * **What the second half is for.** A Greek alphabetic numeral is letters
 * standing for a number: REV 13:18 prints `χξς` and means 666. The table has an
 * answer for those letters, `chxs`, and it is the wrong kind of thing — not the
 * number, and not a word anyone reads. There is no romanization to store, so
 * the node stores its own text, and a transliterated edition prints the numeral
 * as the Greek prints it. Equality is both the marking and the way the pass
 * detects it, which is what keeps this out of the schema: no new field, and no
 * list of exempt references for someone to maintain beside the text.
 *
 * The cost is that a value set equal to its text *by mistake* is preserved just
 * as deliberately, and nothing about the node says which it was. So the
 * enrichment audit counts these per version (`utils/corpusEnrichment.ts`) — a
 * wrong one shows up there as a number that moved rather than as silence.
 *
 * The marking says "this does not romanize," which only a registry that could
 * have romanized it is in a position to say. So a node whose `script` no
 * registry declares is untouched by it and still loses a stored value, the same
 * as before: nothing there knows the scheme yet, equality is redundancy rather
 * than a claim, and holding it would quietly exempt that node from the registry
 * that eventually declares its script.
 *
 * **Last in the auto-fix pass, and that is not a preference.** Nearly every
 * earlier step can move characters between nodes or empty a node outright.
 * Computing a transliteration before them would store a value the same pass
 * then invalidates, and the pass's own fixed-point guard would fail the run
 * naming this step for a defect belonging to another. Running last also means
 * the node-emptying steps have already run, so the orphan branch below has
 * something real to clean up rather than a hypothetical.
 *
 * One consequence, invisible until someone goes looking: the mergeable-sibling
 * check tolerates only `marks` and `script` beside a node's `text`
 * (`MERGEABLE_EXTRA_KEYS` in `utils/auditNodes.ts`), so two adjacent Greek
 * nodes stop being mergeable once they carry a transliteration. Nothing is lost
 * — a freshly imported node has none, so its first pass merges it before this
 * step ever sees it — and the audit reads the same predicate the fixer does.
 */

import Content from "../types/Content";
import { mapContentNodes } from "../functions/mapContentText";
import { transliterateText } from "./lexicon";

/**
 * Romanizes every script-tagged text node in one verse's `content` tree,
 * footnote bodies included, and strips the key from any node that no longer
 * earns one.
 *
 * A bare string in a content array is left alone — it has no node to carry the
 * value, which is why a consumer reads `node.transliteration ?? node.text`
 * regardless. The walk's boundaries, `bibleLink` display content included, are
 * {@link mapContentNodes}'s and shared with every other walker in this pipeline.
 *
 * **Nothing is skipped silently.** A node whose `script` no language registry
 * declares cannot be romanized by anything, so it is left exactly as printed
 * and its script code is reported. The code rather than the verse, because
 * every node sharing a code shares the whole story, and what resolves it is a
 * registry for that script rather than an edit to a node.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing changed),
 *   whether anything did, and one script code per node left as printed
 */
export function transliterateScriptRunsInContent(content: Content): {
  content: Content;
  changed: boolean;
  undeclaredScripts: string[];
} {
  const undeclaredScripts: string[] = [];

  const rewritten = mapContentNodes(content, (node) => {
    let wanted: string | undefined;

    if (typeof node.text === "string" && node.script !== undefined) {
      const romanized = transliterateText(node.text, node.script);
      if (romanized === null) undeclaredScripts.push(node.script);
      // A stored value that is the node's own text marks a form that does not
      // romanize, and is the one thing here the pass will not recompute.
      else wanted = node.transliteration === node.text ? node.text : romanized;
    }

    // Covers both halves of the invariant at once: two absent values agree, and
    // so do two equal ones.
    if (node.transliteration === wanted) return undefined;

    if (wanted === undefined) {
      const stripped = { ...node };
      delete stripped.transliteration;
      return stripped;
    }
    return { ...node, transliteration: wanted };
  });

  return { content: rewritten.content, changed: rewritten.changed, undeclaredScripts };
}
