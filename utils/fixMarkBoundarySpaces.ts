/**
 * Applies `auditNodes.ts`'s own mark-boundary-space check: removes a bare,
 * untagged whitespace-only node sandwiched between two real, non-blank
 * nodes that agree in `marks`/`script`, or where one side's marks are a
 * non-empty subset of the other's ({@link isFormattingSubsetOf}), rolling
 * the blank's own text onto whichever real side is the *smaller* mark set
 * instead. `utils/validate.ts` calls {@link mergeMarkBoundarySpacesInContent}
 * on every run, with no flag to opt in or out.
 *
 * Until this module existed, `scanArrayForMarkBoundarySpaces` was a
 * report-only check with no fixer at all — real CSB2017 Matthew 15:4:
 * `{text: "and,", marks: ["woc"]}, " ", {text: "Whoever speaks evil...",
 * marks: ["b","woc"]}` sat unabsorbed corpus-wide (622 occurrences in
 * KJV1769 alone once the subset relationship is counted, not just exact
 * agreement) with nothing ever resolving the space.
 *
 * **Direction is not always forward.** When the two real sides merely agree
 * exactly, direction is immaterial (both marks sets are identical, so
 * nothing hinges on which side absorbs the blank) and this module keeps the
 * simpler forward convention. But when it's a *subset* match, the two sides
 * play different roles: the smaller side is the continuous wrapper the
 * space is genuinely part of, and the larger side carries a local addition
 * (an extra mark layered onto one specific word) the space was never inside
 * — so the blank has to move toward the smaller side, whichever direction
 * that happens to be. Real KJV1769 Exodus 33:9 (`{text: "the", marks:
 * ["i"]}, " ", {text: "Lord", marks: ["i","sc"]}`) and 1 Samuel 16:7 pick
 * *backward* — `"i"` is the wrapper, `"sc"` (the divine name's own
 * small-caps) is what's added, and the smaller `["i"]` side sits first.
 * The mirror-image YLT1898 Matthew 11:30 (`{text: "is", marks:
 * ["i","woc"]}, " ", {text: "easy,", marks: ["woc"]}`) picks *forward*
 * instead, on the identical relationship, because there the smaller
 * `["woc"]`-only side happens to sit second. Getting this backwards
 * doesn't just misplace a data node — for CSB2017 Matthew 15:4 specifically,
 * both of "and,"'s own neighbors turn out to be the *larger* side of a
 * subset pair with it, so both of its own stranded spaces belong absorbed
 * onto "and," itself, one on each edge (`{text: " and, ", marks:
 * ["woc"]}`), not scattered onto whichever neighbor happens to sit on the
 * far side of each one.
 *
 * **A blocked backward direction is left alone, never forced forward
 * instead.** When the smaller side is `left` but `left` carries `strong`
 * or `foot`, appending the blank there would violate the
 * trailing-whitespace check's own rule (`strong`) or manufacture a new
 * footnote-marker-spacing finding `fixFootnoteMarkerSpacing.ts` would
 * re-extract on the next pass (`foot`) — real YLT1898 Revelation 2:13:
 * `{text: "...Antipas", marks: ["woc"], foot: {...}}, {text: " ", marks:
 * ["woc"]}, {text: "was", marks: ["i","woc"]}`. Rolling the blank *forward*
 * onto `target` instead isn't a safe fallback either, even though it
 * renders identically today: `target` is the *larger* side of the pair,
 * so bundling the blank into its own text would misrepresent an ordinary
 * joining space as part of the local addition (the `"i"` here) it was
 * never inside — a data-modeling error, not just a cosmetic one. Since the
 * real corpus shape already carries the blank tagged with the wrapper's
 * own marks (`["woc"]`, not bare, untagged whitespace), leaving it exactly
 * where it is *is* the correct, final shape — not a residual problem for a
 * person to look at, so this isn't tracked as a decline at all, the
 * identical "already settled, nothing to report" treatment
 * `fixFootnoteMarkerSpacing.ts` gives its own already-extracted bare
 * `{foot: {...}}` shape. `scanArrayForMarkBoundarySpaces` carries the
 * matching exemption so the audit never flags it as a finding to begin
 * with either — the two have to agree on this or the fixer would spend
 * every run "fixing" a struct that was never broken.
 *
 * **Local `isFormattingSubsetOf` and `isBlankConnector`.** Re-derived here
 * rather than imported: `auditNodes.ts` only exports `agreesInFormatting`,
 * not either of these, so this module keeps its own copies rather than
 * widening that module's exports — the same reuse-by-copy
 * `fixMarkBoundaryEmbeddedSpaces.ts` and `fixFootnoteMarkerSpacing.ts`
 * already apply for their own local copies of `isFormattingSubsetOf`.
 *
 * **A redundant blank is deleted, not merged.** If the real side it would
 * land on already carries its own independent whitespace on that same edge
 * (unusual, no real corpus case yet, but a merge would silently double it
 * into `"  "`), the blank is simply removed instead of having its own text
 * prepended or appended — mirroring `fixMarkBoundaryEmbeddedSpaces.ts`'s
 * own "third shape" doubling guard for the identical failure mode, checked
 * on whichever edge this particular blank is about to land on.
 */

import Content from "../types/Content";
import { agreesInFormatting, describeNode, isRealAttachmentPoint, NodeShape } from "./auditNodes";

/**
 * True when two nodes agree closely enough on `marks`/`script` that a
 * mismatch could not be the reason they stayed split — the identical test
 * `auditNodes.ts`'s own private `isFormattingSubsetOf` applies (real
 * KJV1769 1 Samuel 16:7 nesting case), re-derived here per this file's own
 * top doc comment.
 */
function isFormattingSubsetOf(a: NodeShape, b: NodeShape): boolean {
  if (a.script !== b.script) return false;
  const [smaller, larger] = a.marks.length <= b.marks.length ? [a.marks, b.marks] : [b.marks, a.marks];
  return smaller.length > 0 && smaller.every((mark) => larger.includes(mark));
}

/**
 * True for a node whose own `text` is nonempty but entirely whitespace — a
 * bare joining space with no `strong`/`foot` of its own, the identical test
 * `auditNodes.ts`'s own private `isBlankConnector` applies.
 */
function isBlankConnector(shape: NodeShape): boolean {
  return (
    shape.text !== undefined &&
    shape.text.length > 0 &&
    shape.text.trim() === "" &&
    shape.strong === undefined &&
    !shape.hasFoot
  );
}

/**
 * Rebuilds `node` with its own `text` replaced by `text` — a bare string
 * *is* its own text, so it's replaced outright; an object node keeps every
 * other property via a shallow spread. Matches `fixMarkBoundaryEmbeddedSpaces.ts`'s
 * own identical `withText` helper and doc comment.
 */
function withText(node: unknown, text: string): unknown {
  if (typeof node === "string") return text;
  return { ...(node as Record<string, unknown>), text };
}

/** Running fixed count, threaded through recursion and mutated in place — this module never reports a decline (see the top doc comment's own "blocked backward direction" section for why the one case that declines isn't tracked as one), so there's no `SkipReason` to carry alongside it. */
interface FixCounts {
  /** How many findings this run has fixed. */
  fixed: number;
}

/**
 * Scan one array level left to right for a blank node eligible per {@link
 * scanArrayForMarkBoundarySpaces}'s own detection (mirrored here so the two
 * never drift apart in what they consider a finding) and remove it, rolling
 * its own text onto whichever real side is the smaller mark set — forward
 * onto the real next node's leading edge when the two sides agree exactly
 * or the next node is the smaller side of a subset pair, backward onto the
 * real previous node's trailing edge when that side is the smaller one
 * instead (see the top doc comment's own direction rule) — or, when the
 * receiver it would land on already carries its own independent whitespace
 * on that same edge, simply deleting the now-redundant blank instead. When
 * the smaller side is `left` but `left` carries `strong`/`foot`, neither
 * direction is safe (top doc comment's own "blocked backward direction"
 * section) and the blank is left exactly as it is — already the correct,
 * settled shape, matching `scanArrayForMarkBoundarySpaces`'s own identical
 * exemption from ever calling it a finding.
 *
 * Re-describes every node fresh from the current (possibly already-rewritten)
 * working copy on each iteration and tracks removals in a `Set` rather than
 * splicing immediately, the same chain-safety discipline every other fixer
 * in this repo uses: an earlier deletion in this same pass must be visible
 * before a later node's own `left`/`target` lookup is judged, without the
 * index arithmetic of an in-place splice.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: FixCounts): unknown[] {
  const working: unknown[] = [...nodes];
  const removed = new Set<number>();

  for (let i = 0; i < working.length; i++) {
    if (removed.has(i)) continue;
    const shape = describeNode(working[i]);
    if (!isBlankConnector(shape) || shape.endsBreak) continue;

    let leftIndex = i - 1;
    while (leftIndex >= 0 && removed.has(leftIndex)) leftIndex--;
    if (leftIndex < 0) continue;
    const left = describeNode(working[leftIndex]);
    if (!isRealAttachmentPoint(left)) continue;

    let j = i + 1;
    while (
      j < working.length &&
      (removed.has(j) || describeNode(working[j]).isTextlessStrongSibling || describeNode(working[j]).isTextlessFootSibling)
    ) {
      j++;
    }
    if (j >= working.length) continue;

    const target = describeNode(working[j]);
    if (!isRealAttachmentPoint(target) || target.opensParagraph) continue;

    const exact = agreesInFormatting(left, target);
    const subset = !exact && isFormattingSubsetOf(left, target);
    if (!exact && !subset) continue;

    const blankText = shape.text as string;
    const leftText = left.text as string;
    const targetText = target.text as string;

    // Which real side absorbs the blank: real KJV1769 Exodus 33:9 ({text:
    // "the", marks: ["i"]}, " ", {text: "Lord", marks: ["i","sc"]}) and
    // 1 Samuel 16:7 pick opposite directions on the very same subset
    // relationship shape, because the *smaller* marks array is the side
    // that's the continuous wrapper the space genuinely belongs to — the
    // larger side carries a local addition ("sc" for the divine name here,
    // "i" for a translator-supplied word in the mirror-image YLT1898
    // Matthew 11:30 case) the blank was never part of. `subset` already
    // guarantees the two lengths differ (a non-empty subset of equal
    // length would already have matched `exact` instead), so comparing
    // lengths is enough to know which side is smaller — no need to also
    // inspect which specific marks differ. Exact agreement has no
    // wrapper/addition distinction at all, so it keeps the simpler forward
    // direction this check has always used.
    const wantsBackward = subset && left.marks.length < target.marks.length;

    if (wantsBackward) {
      if (left.strong !== undefined || left.hasFoot) {
        // Left alone, not forced forward instead (top doc comment's own
        // "blocked backward direction" section): real YLT1898 Revelation
        // 2:13's `["woc"]`-tagged blank already carries the wrapper's own
        // marks, exactly right, and neither direction has a safe home for
        // it — backward would corrupt a strong/foot invariant, forward
        // would bundle it into target's own larger, unrelated mark set.
        // Already the correct, settled shape, so this isn't counted as a
        // fix and isn't tracked as a decline either.
        continue;
      }
      if (/\s$/.test(leftText)) {
        // Redundant: the source already carries its own independent
        // trailing space, so the blank's own copy is dropped rather than
        // doubled (mirrors the forward direction's own doubling guard
        // below).
        removed.add(i);
        counts.fixed++;
        continue;
      }
      working[leftIndex] = withText(working[leftIndex], leftText + blankText);
      removed.add(i);
      counts.fixed++;
      continue;
    }

    if (/^\s/.test(targetText)) {
      // Redundant: the receiver already carries its own independent
      // leading space, so the blank's own copy is dropped rather than
      // doubled (top doc comment's own doubling guard).
      removed.add(i);
      counts.fixed++;
      continue;
    }

    working[j] = withText(working[j], blankText + targetText);
    removed.add(i);
    counts.fixed++;
  }

  return working.filter((_, index) => !removed.has(index));
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion,
 * then returns a shallow copy with those fields replaced. A string, or
 * anything that isn't a plain object, has no nested levels to rewrite and
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
 * Rewrites one `Content` value, single node or array alike. A single node
 * has no siblings to merge with, so only its own nested levels change (via
 * {@link rewriteNode}); an array first rewrites every child's own nested
 * levels, then resolves blanks at this level via {@link rewriteArrayLevel}.
 */
function rewriteLevel(content: unknown, counts: FixCounts): unknown {
  if (Array.isArray(content)) {
    const children = content.map((node) => rewriteNode(node, counts));
    return rewriteArrayLevel(children, counts);
  }
  return rewriteNode(content, counts);
}

/**
 * Resolves every mark-boundary-space finding in one verse's `content` tree,
 * recursively (`heading`, `subtitle`, a `ContentNested` wrapper's own
 * `content`, and a footnote body's own `foot.content`, mirroring
 * `auditNodes.ts`'s own `walkLevel`). The one shape this module leaves
 * alone (top doc comment's own "blocked backward direction" section) is
 * already correct, not a decline, so there's nothing to report for it.
 *
 * `changed` reflects `counts.fixed`, not a `JSON.stringify` comparison —
 * nothing here is ever left half-changed, so counting the fixes themselves
 * is exact.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing was
 *   fixed) and whether anything changed
 */
export function mergeMarkBoundarySpacesInContent(
  content: Content,
): { content: Content; changed: boolean } {
  const counts: FixCounts = { fixed: 0 };
  const rewritten = rewriteLevel(content, counts) as Content;
  return counts.fixed > 0 ? { content: rewritten, changed: true } : { content, changed: false };
}
