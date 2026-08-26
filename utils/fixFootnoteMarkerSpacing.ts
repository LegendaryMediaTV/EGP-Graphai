/**
 * Applies `auditNodes.ts`'s own check 12: resolves every case where a
 * footnote marker renders immediately after whitespace, so a footnote
 * marker hugs the word it annotates instead of floating a space away from
 * it — the same leading-space convention `strong` already gets from check
 * 2, extended here to `foot`. `utils/validate.ts` calls {@link
 * relocateFootnoteMarkerSpacesInContent} on every run, with no flag to opt
 * in or out.
 *
 * Copies `fixMarkBoundaryEmbeddedSpaces.ts`'s own shape: a gated
 * `xInContent(content) => {content, changed, skipped}` transform with a
 * `SkipReason` union, importing its eligibility from `auditNodes.ts` rather
 * than re-deriving it. Reuses that module's own {@link
 * findWhitespaceSourceIndex} to find *which* node's own trailing run a
 * given footnote marker actually renders after — the same render-order
 * question check 12 itself answers, so the fixer never re-derives it (see
 * that function's own doc comment for the real WEBUS2020 Mark 9:44 case
 * where the run doesn't live on the footed node's own text at all).
 *
 * **Local `isFormattingSubsetOf`.** Re-derived here rather than imported,
 * for the identical reason `fixMarkBoundaryEmbeddedSpaces.ts` gives in its
 * own doc comment: `auditNodes.ts` only exports `agreesInFormatting` and
 * `carriesFormatting`, not this one, so this module keeps its own copy
 * rather than widening that module's exports.
 *
 * **Three resolutions.** `fixMarkBoundaryEmbeddedSpaces.ts` (check 9)
 * already established the shape this module reuses: a plain relocation is
 * the default, but "leave the defect in place and report it" is only
 * correct when no rewrite is actually safe, so two narrower cases get a
 * structural fix instead of a decline:
 *
 * - **Ordinary relocation.** The run moves onto the real next node's own
 *   leading edge — the common case (real ASV1901 Genesis 1:2 shape).
 * - **Deletion**, when relocating the run would double a joining space
 *   rather than supply one. This covers two shapes: the receiving node's
 *   own text already starts with its own independent whitespace (real
 *   WEBUS2020 Matthew 5:22 shape — traced through `exportContent.ts`'s own
 *   `splitWhitespace`/`emphasisRunContinuation`, a node's own leading
 *   whitespace always re-attaches outside its own emphasis wrap regardless
 *   of marks on either side, so unlike check 9's own deletion path — which
 *   embeds a run *inside* the receiver's text and so must stay unmarked —
 *   this one is safe into a marked receiver too); or nothing real follows
 *   *anywhere*, not just within this array level (real WEBUS2020 Mark 9:44
 *   shape: a `woc`-marked node followed only by a textless `{foot}` anchor
 *   that is itself the verse's own final element). Either way the source's
 *   own copy of the run is redundant, so it's dropped rather than
 *   relocated.
 * - **Structural insertion**, when the receiver itself carries `marks`/
 *   `script` that disagree with the source's own — the exact condition
 *   check 9 exists to flag, so a plain relocation here would itself become
 *   a brand-new check-9 finding (real ASV1901 Exodus 3:14 shape). The run
 *   becomes its own standalone node, spliced in between the two disagreeing
 *   sides — the same convention check 4 already establishes for "a joining
 *   space with nothing to agree with on either side," and the same shape
 *   fix check 9's own structural-fix branch uses for the mirror problem (a
 *   `strong`-carrying predecessor that can't take a trailing space). The
 *   standalone node's own text carries no marks, so it can never itself
 *   become a check-4 or check-9 finding.
 *
 * **What still declines.** `"block-boundary"` — a `break`/`paragraph`
 * boundary sits at the join — stays a hard stop: this repo treats a break
 * or a paragraph opening as a real piece boundary everywhere else in this
 * file, and none of the three rewrite paths above changes that.
 * `"no-next-node"` declines only when nothing real follows within a
 * `ContentNested` wrapper's own inner content, where a real successor could
 * genuinely exist just outside what this module can see; see {@link
 * EndOfLevelPolicy}'s own doc comment for why, and for the one real case
 * this leaves for a hand fix.
 */

import Content from "../types/Content";
import {
  agreesInFormatting,
  carriesFormatting,
  describeNode,
  findWhitespaceSourceIndex,
  isRealAttachmentPoint,
  NodeShape,
} from "./auditNodes";

/**
 * True when two nodes' own marks share the same script and one's marks are a
 * non-empty subset of the other's — the identical test `auditNodes.ts`'s own
 * (unexported) `isFormattingSubsetOf` applies, re-derived here rather than
 * imported (see the top doc comment's reasoning).
 */
function isFormattingSubsetOf(a: NodeShape, b: NodeShape): boolean {
  if (a.script !== b.script) return false;
  const [smaller, larger] = a.marks.length <= b.marks.length ? [a.marks, b.marks] : [b.marks, a.marks];
  return smaller.length > 0 && smaller.every((mark) => larger.includes(mark));
}

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string *is*
 * its own text, so it's replaced outright; an object node keeps every other
 * property via a shallow spread. Needed because a real node can be either
 * shape (see `fixMarkBoundaryEmbeddedSpaces.ts`'s own identical helper and
 * doc comment for the real corpus case this guards against).
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/**
 * Why this module declined to act on an otherwise-real check-12 finding.
 * See the top doc comment's own "what still declines" section for the
 * reasoning behind each.
 */
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
 * A `ContentNested` wrapper's own content is rendered woven directly into
 * the surrounding array's own text flow (`exportContent.ts`'s
 * `emphasisRunContinuation`, the `nestedArrayCandidate` branch) — reaching
 * the wrapper's own end does not mean reaching the end of anything real; a
 * genuine successor can sit just outside the wrapper (real YLT1898 Luke
 * 20:1: `{paragraph: true, content: [...]}` ends with the footed node, and
 * `{text: "him", marks: ["i"]}` follows immediately outside the wrapper).
 *
 * `heading`, `subtitle`, and a footnote's own `foot.content` are each
 * self-contained the opposite way: a heading/subtitle renders through its
 * own wrapper (`headingWrapper`/`subtitleWrapper`) as an isolated block, and
 * a footnote body renders as its own separate annotation — neither ever
 * weaves its own trailing edge into a real successor's leading edge the way
 * `ContentNested` does, so "the end of this level" genuinely means "the end
 * of anything this run could join with" for all three, same as a verse's
 * own outermost content.
 *
 * Resolving the `ContentNested` case correctly would mean looking past the
 * wrapper into whatever array actually contains it — context a single
 * array-level scan doesn't carry, and isn't worth carrying for the one real
 * shape it would resolve. Rather than guess, the fixer declines; the
 * YLT1898 Luke 20:1 shape above is that one case, left for a hand fix.
 */
type EndOfLevelPolicy = boolean;

/**
 * Scan one array level left to right for a `foot`-carrying, non-`hasNestedContent`
 * node whose marker renders after whitespace (per {@link
 * findWhitespaceSourceIndex} — identical to check 12's own detection, so the
 * two never drift apart in what they consider a finding) and either resolve
 * it (relocate, delete, or insert a standalone node) or decline it (see the
 * top doc comment's own breakdown).
 *
 * Re-describes every node fresh from the current (possibly already-rewritten)
 * working copy on each iteration, the same chain-safety discipline
 * `fixMarkBoundaryEmbeddedSpaces.ts`'s own `rewriteArrayLevel` uses: a
 * textless anchor's own source node may sit several slots behind it, and an
 * earlier fix in this same pass must be visible before a later node's own
 * eligibility is judged. A standalone-node insertion only ever splices in
 * *after* the node currently being judged (`i`), so `i` itself never needs
 * realigning the way check 9's own leading-direction insertion does.
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
    while (j < working.length && shapes[j].isTextlessStrongSibling) j++;

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
      // Deletion: the receiver already carries its own independent joining
      // space, so the source's own copy is redundant (top doc comment's own
      // "deletion" section).
      working[sourceIndex] = withText(working[sourceIndex], stripped);
      counts.fixed++;
      continue;
    }

    if (carriesFormatting(next) && !agreesInFormatting(next, source) && !isFormattingSubsetOf(next, source)) {
      // Structural insertion: embedding the run inside the receiver's own
      // text would be a brand-new check-9 finding, so it becomes its own
      // standalone node between the two disagreeing real sides instead (top
      // doc comment's own "structural insertion" section).
      working[sourceIndex] = withText(working[sourceIndex], stripped);
      working.splice(j, 0, run);
      counts.fixed++;
      continue;
    }

    // Ordinary relocation.
    working[sourceIndex] = withText(working[sourceIndex], stripped);
    working[j] = withText(working[j], run + nextText);
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
 * Rewrites one `Content` value, single node or array alike — the same
 * `asArray`-then-scan shape `fixMarkBoundaryEmbeddedSpaces.ts`'s own {@link
 * rewriteLevel} uses. A single node has no siblings to relocate whitespace
 * across, so only its own nested levels change (via {@link rewriteNode}); an
 * array first rewrites every child's own nested levels, then resolves
 * whitespace at this level via {@link rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: FixCounts, endOfLevelIsSafeToDelete: EndOfLevelPolicy): unknown {
  if (Array.isArray(content)) {
    const children = content.map((node) => rewriteNode(node, counts));
    return rewriteArrayLevel(children, counts, endOfLevelIsSafeToDelete);
  }
  return rewriteNode(content, counts);
}

/**
 * Resolves every check-12-eligible footnote-marker-after-whitespace finding
 * in one verse's `content` tree, recursively (`heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content`, mirroring `auditNodes.ts`'s own `walkLevel`) — by
 * relocation, deletion, or structural insertion (see the top doc comment's
 * own breakdown), declining only the two shapes named there.
 *
 * `changed` reflects `counts.fixed`, not a `JSON.stringify` comparison,
 * matching {@link relocateMarkBoundarySpacesInContent}'s own reasoning in
 * `fixMarkBoundaryEmbeddedSpaces.ts`: a skip never rewrites anything, so
 * counting the fixes themselves is exact. `skipped` is always returned,
 * changed or not. The verse's own outermost content is always {@link
 * EndOfLevelPolicy} `true` — nothing sits outside a verse's own content for
 * a trailing run to join with, the same reasoning `heading`/`subtitle`/
 * `foot.content` get from {@link rewriteNode}.
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
