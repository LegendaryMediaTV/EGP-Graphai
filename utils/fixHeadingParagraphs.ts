/**
 * Applies `auditNodes.ts`'s own heading-paragraph check: puts
 * `paragraph: true` on the node right after every heading/subtitle run that
 * doesn't already carry it.
 *
 * The convention is flat and corpus-wide — a heading or subtitle followed by
 * anything that is not itself a heading or subtitle opens a paragraph, in
 * every version and every book — so unlike the unmerged-connector check's fixer
 * (`fixUnmergedNodes.ts`), there is no judgment call about *whether* to act,
 * only about *which* node to act on. That decision stays in `auditNodes.ts`:
 * this module imports {@link findHeadingParagraphMismatches} and writes to
 * the node its `nextIndex` names, keeping the run-collapsing and
 * skip-past-invisible-nodes rules in one place. `utils/validate.ts` calls
 * {@link addMissingHeadingParagraphsInVerse} directly, on every run, with no
 * flag to opt in or out.
 *
 * Most sources never write the paragraph themselves: a USFM `\d`
 * superscription, `\sp` speaker label, or `\qc` acrostic letter is normally
 * followed by a bare `\q1`, never a `\p`. `usfm/segmentVerses.ts`'s own
 * heading dispatch now supplies it on the way in, which covers every future
 * import; this module is for versions already on disk with no USFM source in
 * this repo to reimport from.
 *
 * A node that has no `text` of its own to host the flag is never the target:
 * `skipsPastHeadingRun` already walks past those before naming `next`, the
 * same way the audit does when reporting.
 */

import { findHeadingParagraphMismatches, VerseRecord } from "./auditNodes";

/**
 * Returns `node` with `paragraph: true` added. A bare string node has no
 * room for a flag, so it becomes the `{paragraph, text}` object the schema
 * already uses everywhere else for a flagged line; every other node keeps
 * all of its own properties. Key order is left to `sortVerseKeys`, which
 * recurses into `content` on the way back out.
 */
function withParagraph(node: unknown): unknown {
  if (typeof node === "string") return { paragraph: true, text: node };
  if (node === null || typeof node !== "object" || Array.isArray(node))
    throw new Error(`cannot flag a ${node === null ? "null" : typeof node} node as opening a paragraph`);
  return { paragraph: true, ...(node as Record<string, unknown>) };
}

/**
 * Adds `paragraph: true` to every node one verse's own heading/subtitle runs
 * are each missing it after.
 *
 * Verse-scoped rather than content-scoped, unlike `mergeUnmergedNodesInContent`
 * (`fixUnmergedNodes.ts`), `reorderFootnotePunctuationInContent`
 * (`fixFootnotePunctuationOrder.ts`), and `relocateMarkBoundarySpacesInContent`
 * (`fixMarkBoundaryEmbeddedSpaces.ts`) — which all take and return a bare
 * `content` subtree: {@link findHeadingParagraphMismatches} needs a whole
 * verse (`nextIndex` indexes into the verse's own outermost content array),
 * so this function takes and returns a whole {@link VerseRecord} instead.
 * The one-verse array passed to `findHeadingParagraphMismatches` is
 * deliberate, not a workaround: that function's own per-book pass is a plain
 * `flatMap` over verses with no cross-verse state, so a one-verse array
 * reports exactly this verse's own findings.
 *
 * @param verse - One verse record, read from disk
 * @returns The verse with every finding's own `nextIndex` flagged (the
 *   original reference when nothing was missing) and whether anything changed
 * @throws If a finding exists but the verse's own `content` is not an array —
 *   `nextIndex` has nowhere to index into otherwise
 */
export function addMissingHeadingParagraphsInVerse(
  verse: VerseRecord,
): { verse: VerseRecord; changed: boolean } {
  const findings = findHeadingParagraphMismatches([verse]);
  if (findings.length === 0) return { verse, changed: false };

  const nodes = verse.content;
  if (!Array.isArray(nodes))
    throw new Error(
      `${verse.book} ${verse.chapter}:${verse.verse} has a finding but its content is not an array`,
    );

  const rewritten: unknown[] = [...nodes];
  for (const finding of findings) rewritten[finding.nextIndex] = withParagraph(rewritten[finding.nextIndex]);

  return { verse: { ...verse, content: rewritten as never }, changed: true };
}
