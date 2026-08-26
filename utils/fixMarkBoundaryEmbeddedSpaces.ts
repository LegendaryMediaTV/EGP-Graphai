/**
 * Applies `auditNodes.ts`'s own mark-boundary-embedded-space check: relocates
 * a whitespace run embedded inside a formatted node's own `text`, at a
 * boundary where the real neighbor across it disagrees in `marks`/`script`,
 * onto that neighbor's own opposite edge instead — the space's only correct
 * home once the two real sides don't share formatting. Unlike the
 * footnote-punctuation-order check's own fixer, this transform
 * never merges nodes and never removes one from the array — the scan that
 * finds a candidate already requires `text.trim() !== ""`, so stripping
 * only a node's own leading/trailing whitespace run can never empty it
 * out. The ordinary case moves a whitespace *run* (`/^\s+/` or
 * `/\s+$/`, not just the first character) from one node's own `text` onto
 * the end or front of another node's own `text`. Two narrower exceptions
 * apply instead, each documented in its own section below: "A second shape
 * needs a structural fix" (the run's only legal home is a brand-new
 * standalone node) and "A third shape needs deletion, not relocation" (the
 * run has no legal home anywhere else, because the neighbor it would
 * relocate onto already carries its own independent, matching run of its
 * own — the marked node's own copy is simply redundant, so it's deleted
 * outright rather than moved). `utils/validate.ts` calls
 * {@link relocateMarkBoundarySpacesInContent} on every run, with no flag to
 * opt in or out.
 *
 * Corpus-wide, the mark-boundary-embedded-space check's own detector already excludes one non-defective
 * YLT1898 pattern: a Words-of-Christ node (`marks: ["woc"]`) bordering a
 * translator-supplied word that's also part of Christ's own discourse
 * (`marks: ["i","woc"]`) is a strict formatting *subset*, not a genuine
 * disagreement (see `isFormattingSubsetOf` in `auditNodes.ts`).
 *
 * **Local `isFormattingSubsetOf`.** Re-derived here rather than imported:
 * `auditNodes.ts` only exports `agreesInFormatting` and `carriesFormatting`,
 * not this (unexported) function, so this module keeps its own copy rather
 * than widening that module's exports. Mirroring the detector's guards
 * exactly means a verse whose only mark-boundary-embedded-space-shaped boundary is the excluded
 * YLT1898 pattern produces no work here by construction, while a real
 * finding elsewhere in the same array level can't be misjudged by a
 * rewrite that only knows the narrower, pre-narrowing rule.
 *
 * **A second shape needs a structural fix, not a text move**: the "leading"
 * direction's plain relocation moves a whitespace run onto the predecessor's
 * trailing edge. When that predecessor carries a `strong` number — e.g.
 * `{text: " saying,", strong: "G3004", ...}` immediately before the
 * woc-marked node — that move would violate the trailing-whitespace check's
 * own rule that a `strong`-carrying node's text never ends in whitespace.
 * The space then has no legal home in either node's own text: it can't stay
 * embedded in the marked node (that's the finding itself), and it can't
 * relocate onto the predecessor's trailing edge (the trailing-whitespace
 * check forbids it). So it becomes its own standalone node instead — a bare
 * string `" "` inserted between the predecessor and the marked node,
 * matching this corpus's own existing convention for a joining space with
 * nothing to agree with on either side (`auditNodes.ts`'s own
 * mark-boundary-space check doc comment; real KJV1769 Matthew 6:32 shape).
 *
 * This is asymmetric by construction and only ever fires for `side:
 * "leading"` against a `strong`-carrying predecessor: leading whitespace on a
 * `strong`-carrying node is already this corpus's norm and never a
 * trailing-whitespace-check violation, so the mirror-image "trailing"
 * direction (a move onto a real successor's own leading edge) has no
 * equivalent conflict and keeps using the plain text-relocation path above.
 * The inserted node is never itself a mark-boundary-space-check finding
 * either: the mark-boundary-space check only proposes collapsing a
 * standalone blank connector when its two real neighbors *agree* in marks, and a
 * predecessor/marked-node pair that reached this branch disagreed by
 * definition.
 *
 * **A third shape needs deletion, not relocation**: the ordinary relocation
 * path assumes the run is landing on a genuinely blank spot at the
 * neighbor's own near edge. That assumption can be wrong — two adjacent
 * nodes' own text can, in principle, already carry an unrelated
 * leading/trailing space of their own right at the boundary this module is
 * relocating a *different* whitespace run across. If the plain relocation
 * would produce a new `/\s\s/` doubled-whitespace run that wasn't already
 * present in the receiving node's own original text, this module never
 * writes that corrupted join. What happens next depends on whether the
 * receiving node itself carries any formatting of its own:
 *
 * - **The receiving node is unmarked** (`carriesFormatting` is false — no
 *   `marks`, no `script`): delete the source node's own run instead of
 *   relocating it, leaving the unmarked neighbor's own text completely
 *   untouched, including whatever whitespace it already had. The unmarked
 *   neighbor already carries its own independent whitespace performing the
 *   same join, so the marked node's own copy is simply redundant, not
 *   relocatable (real case: WEBUS2020 Matthew 8:26, where a `["woc"]`-marked
 *   node's own trailing space would land on a bare-string successor that
 *   already opens with its own separate leading space).
 * - **The receiving node itself carries formatting** — a marks-to-marks
 *   doubling collision, a shape no real finding in this corpus has, but one
 *   this module does not assume away — decline the finding and report it as
 *   skipped (`"doubled-whitespace"`). Deleting a *formatted* node's own
 *   space on the strength of a doubling collision alone is not this rule's
 *   call to make; only a fully unmarked receiver's redundant space is safe
 *   to discard outright. Do not widen this into "always delete on a
 *   doubling collision" — the marked-to-unmarked condition is what makes
 *   deletion safe, not the doubling by itself.
 */

import Content from "../types/Content";
import {
  agreesInFormatting,
  carriesFormatting,
  describeNode,
  isRealAttachmentPoint,
  NodeShape,
} from "./auditNodes";

/**
 * True when two nodes' own marks share the same script and one's marks are a
 * non-empty subset of the other's — the identical test `auditNodes.ts`'s own
 * (unexported) `isFormattingSubsetOf` applies, re-derived here rather than
 * imported (see the top doc comment's reasoning). See that function's own doc
 * comment for the real YLT1898 case this exists for.
 */
function isFormattingSubsetOf(a: NodeShape, b: NodeShape): boolean {
  if (a.script !== b.script) return false;
  const [smaller, larger] = a.marks.length <= b.marks.length ? [a.marks, b.marks] : [b.marks, a.marks];
  return smaller.length > 0 && smaller.every((mark) => larger.includes(mark));
}

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string *is*
 * its own text, so it's replaced outright; an object node keeps every other
 * property via a shallow spread. Needed because a real neighbor can be either
 * shape, and spreading a *string* with `{...node}` does not copy its
 * characters (see `fixFootnotePunctuationOrder.ts`'s own identical helper and
 * doc comment for the real corpus case this guards against).
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/**
 * Why this module declined to act on an otherwise-real
 * mark-boundary-embedded-space finding.
 *
 * `"doubled-whitespace"` — see {@link wouldDoubleWhitespace}.
 */
export type SkipReason = "doubled-whitespace";

/** Running fixed/skipped counts, threaded through recursion and mutated in place — the same sink pattern `fixFootnotePunctuationOrder.ts`'s own `FixCounts` uses. */
interface FixCounts {
  /** How many findings this run has fixed. */
  fixed: number;
  /** One entry per finding this run declined to act on, naming why. */
  skipped: SkipReason[];
}

/** True when merging `run` onto `receiverText` would create a `/\s\s/` doubled-whitespace run that wasn't already present in `receiverText` on its own. */
function wouldDoubleWhitespace(receiverText: string, mergedText: string): boolean {
  return /\s\s/.test(mergedText) && !/\s\s/.test(receiverText);
}

/**
 * Scan one array level left to right for a node whose own `marks`/`script`
 * are non-empty and whose own `text` starts or ends with a whitespace run
 * that disagrees in formatting (and isn't a strict formatting subset) with
 * the real neighbor immediately across that boundary — identical to
 * `scanArrayForMarkBoundaryEmbeddedSpaces`'s own detection, so the two never
 * drift apart in what they consider a finding — and resolves it one of four
 * ways: relocate the run onto the neighbor's own opposite edge (the ordinary
 * case), extract it into a brand-new standalone node when the ordinary case
 * would collide with the trailing-whitespace check (see the top doc comment's own "structural fix"
 * section), delete the run outright when relocating it would double an
 * unmarked neighbor's own matching whitespace (see the top doc comment's own
 * "deletion, not relocation" section), or record why it declined to act at
 * all (a doubling collision against a neighbor that itself carries
 * formatting).
 *
 * Walks one mutable working copy left to right, describing each node fresh
 * from its current (possibly already-rewritten) state rather than a frozen
 * snapshot — the same chain-safety discipline `fixFootnotePunctuationOrder.ts`'s
 * own `rewriteArrayLevel` uses, for the identical reason: a node's own fix
 * must see any earlier fix already applied to its neighbor, or a later
 * overwrite could silently discard it. A node's own leading-space move is
 * applied before its trailing-space check runs, so a single node carrying
 * both a real leading and a real trailing finding (independent whitespace
 * runs on opposite edges of the same `text`) is handled correctly in one
 * pass. The node-insertion path advances `i` past the newly-inserted node
 * before that trailing-space check runs, so it still lands on the
 * (now-shifted) marked node rather than on the space it just inserted.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: FixCounts): unknown[] {
  const working: unknown[] = [...nodes];

  for (let i = 0; i < working.length; i++) {
    const shape = describeNode(working[i]);
    if (shape.text === undefined || shape.text.trim() === "" || !carriesFormatting(shape)) continue;

    if (/^\s/.test(shape.text) && !shape.opensParagraph) {
      let j = i - 1;
      while (j >= 0 && describeNode(working[j]).isTextlessStrongSibling) j--;
      if (j >= 0) {
        const predecessor = describeNode(working[j]);
        if (
          isRealAttachmentPoint(predecessor) &&
          !predecessor.endsBreak &&
          !agreesInFormatting(shape, predecessor) &&
          !isFormattingSubsetOf(shape, predecessor)
        ) {
          if (predecessor.strong !== undefined) {
            // Structural fix, not a text move (top doc comment's "second
            // shape" section): neither home for the space is legal here, so
            // it becomes its own standalone node; the predecessor's own text
            // stays untouched.
            const rest = shape.text.slice(shape.text.match(/^\s+/)![0].length);
            working[i] = withText(working[i], rest);
            working.splice(i, 0, " ");
            i++; // realign on the marked node, now shifted one slot right by the insert
            counts.fixed++;
          } else {
            const run = shape.text.match(/^\s+/)![0];
            const rest = shape.text.slice(run.length);
            const predecessorText = predecessor.text as string;
            const merged = predecessorText + run;

            if (wouldDoubleWhitespace(predecessorText, merged)) {
              if (!carriesFormatting(predecessor)) {
                // Deletion path (top doc comment's "third shape" section):
                // the unmarked predecessor already carries its own
                // independent space performing this join, so the marked
                // node's own copy is redundant.
                working[i] = withText(working[i], rest);
                counts.fixed++;
              } else {
                counts.skipped.push("doubled-whitespace");
              }
            } else {
              working[j] = withText(working[j], merged);
              working[i] = withText(working[i], rest);
              counts.fixed++;
            }
          }
        }
      }
    }

    // Re-describe: the leading-space move above may have changed working[i]'s own text.
    const current = describeNode(working[i]);
    if (current.text !== undefined && /\s$/.test(current.text) && !current.endsBreak) {
      let j = i + 1;
      while (j < working.length && describeNode(working[j]).isTextlessStrongSibling) j++;
      if (j < working.length) {
        const successor = describeNode(working[j]);
        if (
          isRealAttachmentPoint(successor) &&
          !successor.opensParagraph &&
          !agreesInFormatting(current, successor) &&
          !isFormattingSubsetOf(current, successor)
        ) {
          const run = current.text.match(/\s+$/)![0];
          const rest = current.text.slice(0, current.text.length - run.length);
          const successorText = successor.text as string;
          const merged = run + successorText;

          if (wouldDoubleWhitespace(successorText, merged)) {
            if (!carriesFormatting(successor)) {
              // Deletion path — mirrors the leading branch's comment above;
              // see the top doc comment's "third shape" section for the
              // real corpus case this covers.
              working[i] = withText(working[i], rest);
              counts.fixed++;
            } else {
              counts.skipped.push("doubled-whitespace");
            }
          } else {
            working[j] = withText(working[j], merged);
            working[i] = withText(working[i], rest);
            counts.fixed++;
          }
        }
      }
    }
  }

  return working;
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion
 * exactly, then returns a shallow copy with those fields replaced. A string,
 * or anything that isn't a plain object, has no nested levels to rewrite and
 * passes through unchanged.
 */
function rewriteNode(node: unknown, counts: FixCounts): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const record = { ...(node as Record<string, unknown>) };

  if (record.heading !== undefined) record.heading = rewriteLevel(record.heading, counts);
  if (record.subtitle !== undefined) record.subtitle = rewriteLevel(record.subtitle, counts);
  if (record.heading === undefined && record.subtitle === undefined && record.bibleLink === undefined && record.content !== undefined) {
    record.content = rewriteLevel(record.content, counts);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content, counts) };
  }

  return record;
}

/**
 * Rewrites one `Content` value, single node or array alike — the same
 * `asArray`-then-scan shape `findStrongsNodeIssues` uses for detection,
 * except this one rebuilds instead of only reporting. A single node has no
 * siblings to relocate whitespace across, so only its own nested levels
 * change (via {@link rewriteNode}); an array first rewrites every child's own
 * nested levels, then relocates whitespace at this level via {@link
 * rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: FixCounts): unknown {
  if (Array.isArray(content)) {
    const children = content.map((node) => rewriteNode(node, counts));
    return rewriteArrayLevel(children, counts);
  }
  return rewriteNode(content, counts);
}

/**
 * Relocates every embedded whitespace run in one verse's
 * `content` tree, recursively (`heading`, `subtitle`, a `ContentNested`
 * wrapper's own `content`, and a footnote body's own `foot.content`,
 * mirroring `auditNodes.ts`'s own `walkLevel`).
 *
 * `changed` reflects `counts.fixed`, not a `JSON.stringify` comparison,
 * matching {@link reorderFootnotePunctuationInContent}'s own reasoning in
 * `fixFootnotePunctuationOrder.ts`: a skip never rewrites anything, so
 * counting the fixes themselves is exact. `skipped` is always returned,
 * changed or not.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing was
 *   fixed), whether anything changed, and every finding this run declined to
 *   act on, with its own {@link SkipReason}
 */
export function relocateMarkBoundarySpacesInContent(
  content: Content,
): { content: Content; changed: boolean; skipped: SkipReason[] } {
  const counts: FixCounts = { fixed: 0, skipped: [] };
  const rewritten = rewriteLevel(content, counts) as Content;
  return counts.fixed > 0
    ? { content: rewritten, changed: true, skipped: counts.skipped }
    : { content, changed: false, skipped: counts.skipped };
}
