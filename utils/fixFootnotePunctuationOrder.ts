/**
 * Applies `auditNodes.ts`'s own footnote-punctuation-order check: a
 * footnote marker always has to render after the punctuation that belongs
 * to its own clause, never before it, since `utils/exportContent.ts`'s
 * renderer always places a node's footnote marker in its `suffix`, after
 * that node's full `core` text (`RenderedParts` there). `utils/validate.ts`
 * calls {@link reorderFootnotePunctuationInContent} on every run, with no
 * flag to opt in or out.
 *
 * **Two independent resolutions**, chosen by whether absorbing the
 * punctuation into the footed node's own text would be guessing:
 *
 * - **Merge** (the ordinary case): move the leading run of tight punctuation
 *   off the footed node's next sibling and onto the end of the footed
 *   node's own `text` instead. Requires the two nodes to agree in
 *   `marks`/`script` first (Galatians 3:18: `marks: ["i"]` vs. a bare,
 *   unmarked `"."` — they may have stayed split on purpose, the same bar
 *   `canJoinForward` already applies for the unmerged-connector check's own
 *   merges; re-derived locally as `agreesInFormatting` below rather than
 *   imported, since `auditNodes.ts` exports `isRealAttachmentPoint` and
 *   `leadingTightPunctuationSplit` but not this unexported function). When
 *   the sibling's entire text is the punctuation run, the now-empty sibling
 *   is removed too — but only when it carries nothing beyond
 *   `text`/`marks`/`script`; a sibling carrying a real property beyond
 *   those three (Matthew 13:35's `break: true`) would have that property
 *   silently discarded by an unconditional delete, so this module refuses
 *   and reports the finding as skipped instead, via its own {@link
 *   SkipReason}.
 * - **Extract** (formatting disagrees, sibling is pure punctuation): moving
 *   the punctuation is off the table (real CSB2017 John 7:36, 8:22, 16:17:
 *   a `marks: ["woc"]` quotation's own footnote, followed by the
 *   narrator's unmarked closing `"?”"` — absorbing that into the quotation
 *   would misattribute the narrator's own punctuation as part of what was
 *   quoted). But the marker's *position* is a separate, purely mechanical
 *   question with the same one answer regardless of marks: `foot` moves
 *   instead, onto a new bare `{foot: {...}}` node spliced in right after
 *   the untouched punctuation sibling — the identical "sole" extraction
 *   `fixFootnoteMarkerSpacing.ts` already applies for the same shaped
 *   problem. Neither real node's own `text`/`marks` changes at all. Still
 *   left as an `"eligibility"` skip when the punctuation is only a
 *   *leading* run of a sibling that has real text of its own after it —
 *   splitting that sibling in two to extract into is a different, more
 *   invasive shape no real corpus case has needed yet.
 */

import Content from "../types/Content";
import {
  describeNode,
  isRealAttachmentPoint,
  leadingTightPunctuationSplit,
  NodeShape,
} from "./auditNodes";

/**
 * True when two nodes agree closely enough on `marks`/`script` that a
 * mismatch could not be the reason they stayed split — the identical test
 * `auditNodes.ts`'s own private `agreesInFormatting` applies, re-derived here
 * rather than imported (see the top doc comment's reasoning).
 */
function agreesInFormatting(a: NodeShape, b: NodeShape): boolean {
  return (
    a.script === b.script &&
    a.marks.length === b.marks.length &&
    a.marks.every((mark, at) => mark === b.marks[at])
  );
}

/** A node's own real property keys beyond `text`/`marks`/`script` — `[]` for a bare string (which has none) or a node carrying nothing else. Used to decide whether removing an emptied sibling would silently lose something real (a real corpus case: `break: true`). */
function extraKeysBeyondTextMarksScript(node: unknown): string[] {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return [];
  return Object.keys(node).filter((key) => key !== "text" && key !== "marks" && key !== "script");
}

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string
 * *is* its own text, so it's replaced outright; an object node keeps every
 * other property via a shallow spread. Needed because a real sibling can be
 * either shape (`"); half a shekel..."` and `{text: "...", marks: [...]}`
 * both occur in this corpus), and spreading a *string* with `{...node}`
 * does not copy its characters — it reads the string's own indexed
 * properties (`"0"`, `"1"`, …), producing a garbage object instead of
 * preserving the text.
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/** Why this module declined to act on an otherwise-real footnote-punctuation-order finding. */
export type SkipReason = "eligibility" | "extra-keys";

/** Running fixed/skipped counts, threaded through recursion and mutated in place — the same sink pattern `auditNodes.ts`'s own `walkLevel` uses for findings. */
interface FixCounts {
  /** How many findings this run has fixed. */
  fixed: number;
  /** One entry per finding this run declined to act on, naming why. */
  skipped: SkipReason[];
}

/**
 * Scan one array level left to right for a `foot`-carrying, text-bearing node
 * immediately followed by a real sibling (skipping any textless Strong's
 * sibling in between) whose own text starts with tight punctuation —
 * identical to `scanArrayForFootnotePunctuationOrder`'s own detection, so the
 * two never drift apart in what they consider a finding — and either fixes
 * it in place or records why it was skipped.
 *
 * **Chained findings are real** — a real YLT1898 Hebrews 1:3 shape has three
 * consecutive footed/text nodes where the *middle* one is simultaneously the
 * punctuation-leading sibling of the node before it and its own footed node
 * with a punctuation-leading sibling after it. Both hops are genuine,
 * independently-reported findings, and fixing them out of order matters:
 * this scan walks one mutable working copy left to right, so a node already
 * trimmed of its own leading punctuation earlier in the same pass is
 * examined in that trimmed state — never the other way around, where a
 * later overwrite could discard an earlier trim and leave a duplicated
 * punctuation mark on both sides of a boundary.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: FixCounts): unknown[] {
  const working: unknown[] = [...nodes];
  const removed = new Set<number>();

  for (let i = 0; i < working.length; i++) {
    if (removed.has(i)) continue;
    const shape = describeNode(working[i]);
    if (!shape.hasFoot || shape.text === undefined || shape.text.length === 0) continue;

    let j = i + 1;
    while (j < working.length && (removed.has(j) || describeNode(working[j]).isTextlessStrongSibling)) j++;
    if (j >= working.length) continue;

    const next = describeNode(working[j]);
    if (!isRealAttachmentPoint(next) || next.opensParagraph || next.text === undefined) continue;

    const split = leadingTightPunctuationSplit(next.text);
    if (split === undefined) continue;

    if (!agreesInFormatting(shape, next)) {
      if (split.after === "") {
        // The sibling is nothing but punctuation that disagrees in
        // `marks`/`script` with the footed node — real CSB2017 John 7:36,
        // 8:22, 16:17: a `marks: ["woc"]` quotation followed by the
        // narrator's own unmarked closing `"?”"`. Absorbing that
        // punctuation into the footed node (this function's only other
        // move) would misattribute it as part of the quoted words, which is
        // exactly the guess the top doc comment's own "formatting
        // eligibility" reasoning refuses to make. But the marker's own
        // position is a separate, purely mechanical question with one
        // answer regardless: it has to render after the punctuation, not
        // wedged before it — so `foot` moves instead, onto a new bare
        // `{foot: {...}}` node spliced in right after the untouched
        // punctuation sibling, the identical "sole" extraction
        // `fixFootnoteMarkerSpacing.ts` already applies for the same
        // shaped problem. Neither node's own `text`/`marks` changes at all.
        const { foot, ...rest } = working[i] as Record<string, unknown>;
        working[i] = rest;
        working.splice(j + 1, 0, { foot });
        counts.fixed++;
        continue;
      }
      counts.skipped.push("eligibility");
      continue;
    }

    const mergedText = shape.text + split.before;

    if (split.after !== "") {
      working[i] = withText(working[i], mergedText);
      working[j] = withText(working[j], split.after);
      counts.fixed++;
      continue;
    }

    if (extraKeysBeyondTextMarksScript(working[j]).length > 0) {
      counts.skipped.push("extra-keys");
      continue;
    }

    working[i] = withText(working[i], mergedText);
    removed.add(j);
    counts.fixed++;
  }

  return working.filter((_, index) => !removed.has(index));
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion
 * exactly (including its `content` exclusion whenever `heading`/`subtitle`/
 * `bibleLink` is present), then returns a shallow copy with those fields
 * replaced. A string, or anything that isn't a plain object, has no nested
 * levels to rewrite and passes through unchanged.
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
 * siblings to fix, so only its own nested levels change (via {@link
 * rewriteNode}); an array first rewrites every child's own nested levels,
 * then fixes findings at this level via {@link rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: FixCounts): unknown {
  if (Array.isArray(content)) {
    const children = content.map((node) => rewriteNode(node, counts));
    return rewriteArrayLevel(children, counts);
  }
  return rewriteNode(content, counts);
}

/**
 * Reorders every footnote/punctuation pair in one verse's
 * `content` tree, recursively (`heading`, `subtitle`, a `ContentNested`
 * wrapper's own `content`, and a footnote body's own `foot.content`,
 * mirroring `auditNodes.ts`'s own `walkLevel`).
 *
 * `changed` reflects `counts.fixed`, not a `JSON.stringify` comparison — a
 * skip never rewrites anything, so counting the fixes themselves is exact
 * and cheaper than serializing the tree twice. `skipped` is always returned,
 * changed or not, so a caller can report what this run declined to act on
 * even when it fixed nothing else in the same verse.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing was
 *   fixed), whether anything changed, and every finding this run declined to
 *   act on, with its own {@link SkipReason}
 */
export function reorderFootnotePunctuationInContent(
  content: Content,
): { content: Content; changed: boolean; skipped: SkipReason[] } {
  const counts: FixCounts = { fixed: 0, skipped: [] };
  const rewritten = rewriteLevel(content, counts) as Content;
  return counts.fixed > 0
    ? { content: rewritten, changed: true, skipped: counts.skipped }
    : { content, changed: false, skipped: counts.skipped };
}
