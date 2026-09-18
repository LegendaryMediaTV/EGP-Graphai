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
 * disagrees is stale rather than considered. The invariant: **a node carries a
 * `transliteration` exactly when it has `text` and a `script` some registry
 * declares, and the value is what that registry's table produces — or the
 * node's own `text` verbatim, which marks a form that does not romanize at
 * all.**
 *
 * **What that second half is for.** A Greek alphabetic numeral is letters
 * standing for a number: REV 13:18 prints `χξς` and means 666. The table has an
 * answer for those letters, `chxs`, and it is the wrong kind of thing — not the
 * number, and not a word anyone reads. So the node stores its own text instead,
 * and a transliterated edition prints the numeral as the Greek prints it.
 * Equality is both the marking and the way the pass detects it, which is what
 * keeps this out of the schema: no new field, and no list of exempt references
 * to maintain beside the text. The cost is that a value set equal to its text
 * *by mistake* is preserved just as deliberately, so the enrichment audit
 * counts these per version (`utils/corpusEnrichment.ts`) — a wrong one shows up
 * there as a number that moved rather than as silence.
 *
 * The marking says "this does not romanize," which only a registry that could
 * have romanized it is in a position to say. So a node whose `script` no
 * registry declares is untouched by it and still loses a stored value: nothing
 * there knows the scheme yet, and holding the value would quietly exempt that
 * node from the registry that eventually declares its script.
 *
 * **Last in the auto-fix pass, and that is not a preference.** Nearly every
 * earlier step can move characters between nodes or empty a node outright.
 * Computing a transliteration before them would store a value the same pass
 * then invalidates, and the pass's own fixed-point guard would fail the run
 * naming this step for a defect belonging to another. Running last also leaves
 * the orphan branch below something real to clean up.
 *
 * One consequence, invisible until someone goes looking: the mergeable-sibling
 * check tolerates only `marks` and `script` beside a node's `text`
 * (`MERGEABLE_EXTRA_KEYS` in `utils/auditNodes.ts`), so two adjacent Greek
 * nodes stop being mergeable once they carry a transliteration. Nothing is lost
 * — a freshly imported node has none, so its first pass merges it before this
 * step ever sees it.
 */

import BibleVersion from "../types/Version";
import Content from "../types/Content";
import { mapContentNodes } from "../functions/mapContentText";
import { sortContentKeys } from "../functions/sortContentKeys";
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

  return {
    content: rewritten.content,
    changed: rewritten.changed,
    undeclaredScripts,
  };
}

/**
 * Applies the same invariant to a version's own `_version.json`, where the
 * content that needs romanizing sits in named fields rather than in verses.
 *
 * This is not a second invariant, and no romanization happens here: {@link
 * transliterateScriptRunsInContent} takes one `Content` at a time, so every
 * field below is handed to it and the version reassembled around the answers.
 *
 * **The field list is written out rather than walked for.** `_version.json` has
 * a closed schema, so the fields holding `Content` are known and named. A
 * generic deep walk would also descend into `_id`, `license` and `morphology`,
 * which are strings that are not content and must never grow a
 * `transliteration` key — and it would keep doing so as fields are added.
 *
 * Sorts a field's keys only where the value changed, because a node can carry
 * `marks` beside its text and the new key belongs before them. The verse path
 * gets this from `sortVerseKeys` for the same reason; a version file has no
 * verse records, so the content sorter is called directly.
 *
 * @param version - One version's whole parsed `_version.json`
 * @returns The rewritten version (the original reference when nothing changed),
 *   whether anything did, and one script code per node left as printed
 */
export function transliterateScriptRunsInVersion(version: BibleVersion): {
  version: BibleVersion;
  changed: boolean;
  undeclaredScripts: string[];
} {
  const undeclaredScripts: string[] = [];
  let changed = false;

  const romanize = (content: Content): Content => {
    const result = transliterateScriptRunsInContent(content);
    undeclaredScripts.push(...result.undeclaredScripts);
    if (!result.changed) return content;
    changed = true;
    // `sortContentKeys` is typed over an index-signature record, which
    // `Content`'s interfaces are not assignable to however identical the
    // objects are; the cast is that gap and nothing else.
    return sortContentKeys(result.content as never) as Content;
  };

  const rewritten: BibleVersion = { ...version, name: romanize(version.name) };

  if (version.copyright !== undefined) {
    rewritten.copyright = romanize(version.copyright);
  }
  if (version.abbr !== undefined) {
    rewritten.abbr = version.abbr.map((entry) => {
      const next = { ...entry, name: romanize(entry.name) };
      if (entry.description !== undefined)
        next.description = romanize(entry.description);
      return next;
    });
  }
  if (version.books !== undefined) {
    rewritten.books = version.books.map((book) => ({
      ...book,
      name: romanize(book.name),
      title: romanize(book.title),
    }));
  }

  return { version: changed ? rewritten : version, changed, undeclaredScripts };
}
