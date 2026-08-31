/**
 * Applies `auditNodes.ts`'s own footnote-marker-spacing check: resolves
 * every case where a footnote marker renders immediately after whitespace,
 * so a footnote marker hugs the word it annotates instead of floating a
 * space away from it — the same leading-space convention `strong` already
 * gets from the trailing-whitespace check, extended here to `foot`.
 * `utils/validate.ts` calls {@link
 * relocateFootnoteMarkerSpacesInContent} on every run, with no flag to opt
 * in or out.
 *
 * Copies `fixMarkBoundaryEmbeddedSpaces.ts`'s own shape: a gated
 * `xInContent(content) => {content, changed, skipped}` transform with a
 * `SkipReason` union, importing its eligibility from `auditNodes.ts` rather
 * than re-deriving it. Reuses {@link findWhitespaceSourceIndex} to find
 * *which* node's trailing run a given marker actually renders after, since
 * that run need not live on the footed node's own text.
 *
 * **Two resolutions, decided by one question: does the real next node's own
 * text already start with whitespace?**
 *
 * - **Redundant, deletion.** Yes — the receiver already supplies the join, so
 *   two sources of separation exist where one would do. The source's trailing
 *   run is dropped and the receiver's text is never touched. This also covers
 *   the case where nothing real follows *anywhere*, not just within this
 *   array level: with no receiver to be redundant against, the source's copy
 *   goes all the same.
 * - **Sole, standalone-node extraction.** No — the source's trailing run is
 *   the only thing separating the two real words. It cannot be dropped, which
 *   fuses the words together, and two alternatives were tried and rejected:
 *   reassigning it onto the receiver's leading edge still leaves the marker a
 *   rendered space from the word it annotates whenever the two sides' marks
 *   disagree, and splicing in a whitespace-only node invents a node with no
 *   lexical content to justify existing. The fix moves `foot` instead. Both
 *   real nodes' text stays untouched, trailing whitespace included, and a new
 *   bare `{foot: {...}}` node is spliced in immediately after its source,
 *   walking forward only through siblings that render nothing at all ({@link
 *   findFirstRenderedIndex}) — never landed beside the real next node, since
 *   a bare foot node in between renders its own marker and landing past one
 *   swaps the two markers and reassigns the letters they export under, while
 *   a Strong's anchor renders no characters and may be walked past freely.
 *   Applied structurally: nothing here reads what a footnote says.
 *
 * **A bare `{foot: {...}}` node already sitting in the sole shape is never
 * re-extracted.** When node `i` carries no `text` of its own, its `foot`
 * already sits where it structurally belongs, whether this same pass spliced
 * it in a few nodes back or the corpus already carried it that way, so the
 * sole branch is a no-op rather than an extraction into a husk. That is the
 * identical structural question the audit's matching exemption asks, so the
 * two never drift on what counts as settled. Such a node's real predecessor
 * can still land in the *redundant* branch, where its trailing run is genuine
 * surplus; and when nothing real follows the bare node at all, the "no real
 * next node" resolution below trims that predecessor's orphaned whitespace.
 *
 * **A run of further textless siblings between that node and the real next
 * node changes none of the above.** Neither side of the exemption asks
 * whether the real next node is *immediately* adjacent, and neither should:
 * every bare foot node in such a run renders its own marker, and whitespace
 * carried to the far side of a rendered marker re-points it at the word after
 * it. The run cannot be dropped either, being the only thing separating the
 * two real words, so it stays where it is, which is already how it renders
 * correctly. Nothing is fixed and nothing is declined — a shape that is
 * already right is a settled state, not a finding.
 *
 * **What still declines.** `"block-boundary"` stays a hard stop: this repo
 * treats a `break` or a paragraph opening as a real piece boundary
 * everywhere, and neither resolution above changes that. `"no-next-node"`
 * declines only inside a `ContentNested` wrapper, where a real successor
 * could exist just outside what this module can see — see {@link
 * EndOfLevelPolicy}.
 */

import Content from "../types/Content";
import {
  describeNode,
  findFirstRenderedIndex,
  findWhitespaceSourceIndex,
  isRealAttachmentPoint,
} from "./auditNodes";

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string *is*
 * its own text, so it's replaced outright; an object node keeps every other
 * property via a shallow spread. Needed because a real node can be either
 * shape.
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/** Why this module declined to act on an otherwise-real footnote-marker-spacing finding; see the top doc comment's "what still declines" section. */
export type SkipReason = "no-next-node" | "block-boundary";

/** Running fixed/skipped counts, threaded through recursion and mutated in place — the same sink pattern `fixMarkBoundaryEmbeddedSpaces.ts`'s own `FixCounts` uses. */
interface FixCounts {
  /** How many findings this run has fixed. */
  fixed: number;
  /** One entry per finding this run declined to act on, naming why. */
  skipped: SkipReason[];
}

/**
 * Whether "no real node follows within this array level" also means "no
 * real node follows anywhere" — `true` for every context this module
 * recurses into *except* a `ContentNested` wrapper's own inner `content`.
 *
 * A `ContentNested` wrapper's content is woven directly into the surrounding
 * array's text flow (`exportContent.ts`'s `emphasisRunContinuation`), so
 * reaching the wrapper's end does not mean reaching the end of anything real
 * — a genuine successor can sit just outside it. `heading`, `subtitle`, and a
 * footnote's own `foot.content` are self-contained the opposite way: each
 * renders as an isolated block, never weaving its trailing edge into a
 * successor's leading edge, so for all three "the end of this level" really
 * is the end of anything the run could join with.
 *
 * Resolving the `ContentNested` case would mean looking past the wrapper into
 * whatever array contains it — context a single array-level scan doesn't
 * carry, and isn't worth carrying for the one real shape it would resolve.
 * Rather than guess, the fixer declines and leaves that shape for a hand fix.
 */
type EndOfLevelPolicy = boolean;

/**
 * Scan one array level left to right for a `foot`-carrying,
 * non-`hasNestedContent` node whose marker renders after whitespace (per
 * {@link findWhitespaceSourceIndex}, identical to the audit's own detection,
 * so the two never drift on what counts as a finding) and either resolve it,
 * decline it, or recognize it as already settled — the last being neither
 * fixed nor declined, since there was never anything wrong with it.
 *
 * Re-describes every node fresh from the current working copy on each
 * iteration, the chain-safety discipline the sibling fixers use: a textless
 * anchor's source node may sit several slots behind it, and an earlier fix in
 * the same pass must be visible before a later node's eligibility is judged.
 * A standalone-node insertion only ever splices in *after* the node being
 * judged, so `i` itself never needs realigning.
 */
function rewriteArrayLevel(
  nodes: readonly unknown[],
  counts: FixCounts,
  endOfLevelIsSafeToDelete: EndOfLevelPolicy,
): unknown[] {
  const working: unknown[] = [...nodes];

  for (let i = 0; i < working.length; i++) {
    const shapes = working.map(describeNode);
    const shape = shapes[i];
    if (!shape.hasFoot || shape.hasNestedContent) continue;

    const sourceIndex = findWhitespaceSourceIndex(shapes, i);
    if (sourceIndex === undefined) continue;

    const source = shapes[sourceIndex];
    const sourceText = source.text as string;
    const run = sourceText.match(/\s+$/)![0];
    const stripped = sourceText.slice(0, -run.length);

    let j = i + 1;
    while (j < working.length && (shapes[j].isTextlessStrongSibling || shapes[j].isTextlessFootSibling)) j++;

    if (j >= working.length || !isRealAttachmentPoint(shapes[j])) {
      if (endOfLevelIsSafeToDelete) {
        working[sourceIndex] = withText(working[sourceIndex], stripped);
        counts.fixed++;
      } else {
        counts.skipped.push("no-next-node");
      }
      continue;
    }

    const next = shapes[j];

    if (next.opensParagraph || source.endsBreak) {
      counts.skipped.push("block-boundary");
      continue;
    }

    const nextText = next.text as string;

    if (/^\s/.test(nextText)) {
      // Redundant: the receiver already supplies the join, so the source's
      // own copy is dropped rather than doubled.
      working[sourceIndex] = withText(working[sourceIndex], stripped);
      counts.fixed++;
      continue;
    }

    // Sole: the source's trailing run is the only thing separating the two
    // real words, so it stays put and the fix moves `foot` instead (top doc
    // comment's "sole, standalone-node extraction" section).
    if (shape.text === undefined || shape.text === "") {
      // Node `i` renders no text of its own, so its `foot` already sits
      // where it structurally belongs and there is nothing to extract — the
      // same condition, with the same absence of any adjacency requirement,
      // as the audit's matching exemption, so the two never drift.
      continue;
    }

    // The extracted node lands at the first slot after `i` that renders
    // anything, which is not the formatting-agreement target `j`: landing
    // beyond a bare foot node would swap the two markers and reassign the
    // letters they export under. The walk can't run off the end, since `j`
    // renders and at worst stops it there, and `shapes` still describes
    // every slot from `i + 1` on, since stripping `foot` off node `i` shifts
    // nothing after it.
    const landing = findFirstRenderedIndex(shapes, i + 1) ?? j;

    const { foot, ...rest } = working[i] as Record<string, unknown>;
    working[i] = rest;
    working.splice(landing, 0, { foot });
    counts.fixed++;
  }

  return working;
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion,
 * then returns a shallow copy with those fields replaced. A string, or
 * anything that isn't a plain object, has no nested levels to rewrite and
 * passes through unchanged.
 *
 * Only the `ContentNested` branch (a node's own `content`, when it isn't a
 * `heading`/`subtitle`/`bibleLink` wrapper) recurses with {@link
 * EndOfLevelPolicy} set to `false` — see that type's own doc comment for
 * why `heading`, `subtitle`, and `foot.content` all stay `true`.
 */
function rewriteNode(node: unknown, counts: FixCounts): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const record = { ...(node as Record<string, unknown>) };

  if (record.heading !== undefined) record.heading = rewriteLevel(record.heading, counts, true);
  if (record.subtitle !== undefined) record.subtitle = rewriteLevel(record.subtitle, counts, true);
  if (record.heading === undefined && record.subtitle === undefined && record.bibleLink === undefined && record.content !== undefined) {
    record.content = rewriteLevel(record.content, counts, false);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content, counts, true) };
  }

  return record;
}

/**
 * Rewrites one `Content` value, single node or array alike. A single node has
 * no siblings to relocate whitespace across, so only its own nested levels
 * change (via {@link rewriteNode}); an array first rewrites every child's own
 * nested levels, then resolves whitespace at this level via {@link
 * rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: FixCounts, endOfLevelIsSafeToDelete: EndOfLevelPolicy): unknown {
  if (Array.isArray(content)) {
    const children = content.map((node) => rewriteNode(node, counts));
    return rewriteArrayLevel(children, counts, endOfLevelIsSafeToDelete);
  }
  return rewriteNode(content, counts);
}

/**
 * Resolves every footnote-marker-after-whitespace finding
 * in one verse's `content` tree, recursively (`heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content`, mirroring `auditNodes.ts`'s own `walkLevel`) — by deletion
 * or standalone-node extraction (see the top doc comment's own breakdown),
 * declining only the two shapes named there.
 *
 * `changed` reflects `counts.fixed`, not a `JSON.stringify` comparison: a
 * skip never rewrites anything, so counting the fixes is exact. `skipped` is
 * always returned, changed or not. The verse's own outermost content is
 * always {@link EndOfLevelPolicy} `true` — nothing sits outside a verse's
 * content for a trailing run to join with.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing was
 *   fixed), whether anything changed, and every finding this run declined to
 *   act on, with its own {@link SkipReason}
 */
export function relocateFootnoteMarkerSpacesInContent(
  content: Content,
): { content: Content; changed: boolean; skipped: SkipReason[] } {
  const counts: FixCounts = { fixed: 0, skipped: [] };
  const rewritten = rewriteLevel(content, counts, true) as Content;
  return counts.fixed > 0
    ? { content: rewritten, changed: true, skipped: counts.skipped }
    : { content, changed: false, skipped: counts.skipped };
}
