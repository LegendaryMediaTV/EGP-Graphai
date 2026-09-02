import Content from "../types/Content";
import { ScriptRun, splitNonLatinScriptRuns } from "../utils/usfm/splitScriptRuns";

/**
 * Tags an untagged Hebrew or Greek run embedded in otherwise-Latin text as
 * its own `{text, script}` node — the corpus-wide convention this repo
 * already follows for the overwhelming majority of its own non-Latin
 * content, broken only where a source left the run undelimited and nothing
 * scanned for it (real WEBUS2020 `NUM 15:38`'s untagged Hebrew "צִיצִ֛ת"
 * gloss, real YLT1898 `REV 13:18`'s untagged Greek "χξς").
 *
 * **Restructures the tree; does not map text.** One node can become several
 * — a plain-text segment on either side of the tagged run, in source order —
 * so this cannot ride on `functions/mapContentText.ts`, whose own doc
 * comment excludes exactly this shape ("split one on a match" is one of the
 * three transforms it names as out of scope). This module owns its own
 * walker instead, mirroring `mapContentText.ts`'s own recursion into
 * `heading`/`subtitle`/a `ContentNested` wrapper's own `content`/a
 * footnote's own `foot.content` — never a `bibleLink` node's own `content`,
 * which is display text tied to a reference target, not a text leaf either
 * walker reaches.
 *
 * **The eligibility gate declines rather than guesses.** A node carrying
 * `strong`, `foot`, or `marks` alongside mixed-script text cannot be split
 * into several sibling nodes without deciding which fragment keeps the
 * property — a Strong's number identifies one lexical item, a footnote
 * anchors to one position, a mark describes one run's own formatting, and
 * splitting the text those properties describe would be guessing which
 * piece is the "real" bearer. Only a bare string or an object carrying
 * `text` and nothing else is eligible; anything else declines and is
 * reported, the same shape the script-run check's own report-only audit
 * (`utils/auditNodes.ts`) re-finds afterward. `bibleLink` is not a reachable
 * decline reason here: `content-schema.json`'s own `oneOf` enforces schema
 * exclusivity (a `bibleLink` node carries nothing but `bibleLink`/`content`),
 * so a text-bearing node can never carry one, and a `bibleLink` node's own
 * `content` is never walked into as a split candidate in the first place
 * (see the previous paragraph). `lemma`/`morph` are likewise not their own
 * decline reason: every node in this corpus that carries either one also
 * carries `strong`, so the `strong` decline already covers them. A
 * `paragraph`/`break` flag alongside text has no comparable ambiguity in
 * principle — a run's own convention already treats the first piece of a
 * sequence as the paragraph-opener and the last as the line-ender
 * (`utils/auditNodes.ts`'s own `canJoinForward` states this explicitly) —
 * but nothing in this corpus needs that handled yet, so this transform
 * declines there too rather than implementing an unverified rule; see
 * `functions/__tests__/tagScriptRunsInContent.test.ts` for the case this
 * decision covers.
 *
 * Lives in `functions/` because it is a content-tree transform with no
 * USFM-specific knowledge, matching `functions/normalizeFractions.ts` and
 * `functions/normalizeEllipses.ts` — it reuses `utils/usfm/splitScriptRuns.ts`'s
 * own {@link splitNonLatinScriptRuns} (unchanged detection/split logic; that
 * module gained only the multi-script composition wrapper, not a new rule)
 * rather than re-deriving any part of the Unicode-range matching.
 */

/** Why this transform declined to split an otherwise-eligible mixed-script node. See this module's own top doc comment for why `bibleLink` is not a reachable reason and why `lemma`/`morph` need none of their own. */
export type SkipReason = "strong" | "foot" | "marks" | "other-properties";

/**
 * True when `text` mixes at least one ASCII Latin letter with at least one
 * Hebrew or Greek letter — the corpus-wide convention this repo enforces
 * (real WEBUS2020 `PSA 3:2`'s correctly tagged `{text: "אֱלֹהִ֑ים", script:
 * "H"}` against real `NUM 15:38`'s untagged violation of the identical
 * rule). **Requiring both is load-bearing**, not an arbitrary tightening of
 * {@link splitNonLatinScriptRuns}'s own broader "any non-Latin run at all"
 * behavior: an all-Greek string with no Latin letter mixed in is BYZ2018's
 * own ordinary, correct verse text, not a defect, and dropping this guard
 * would mean tagging every one of them.
 *
 * @param text - Raw content text, mixed or not.
 */
export function hasMixedScriptText(text: string): boolean {
  if (!/[A-Za-z]/.test(text)) return false;
  return splitNonLatinScriptRuns(text) !== text;
}

/** Running fixed/skipped counts, threaded through recursion and mutated in place — the same sink pattern every other fixer in this pipeline uses. */
interface Counts {
  fixed: number;
  skipped: SkipReason[];
}

/** Narrows `node` to a plain, non-array object — the only shape this transform ever reads properties off of. */
function isPlainObject(node: unknown): node is Record<string, unknown> {
  return node !== null && typeof node === "object" && !Array.isArray(node);
}

/** A `{heading}`/`{subtitle}`/`{bibleLink}`/`{abbr}` wrapper — a hard boundary this transform never treats as a split candidate, matching `utils/auditNodes.ts`'s own `describeNode` classification of the identical shapes. */
function isBoundary(record: Record<string, unknown>): boolean {
  return (
    "heading" in record ||
    "subtitle" in record ||
    "bibleLink" in record ||
    "abbr" in record
  );
}

/**
 * Attempts to split one node's own text into its script-tagged pieces.
 *
 * @returns `undefined` when there is nothing to do — no text on this node at
 *   all, a `script` already present, or no mixed-script run in the text —
 *   a {@link SkipReason} when the node is eligible in principle but carries
 *   a property a split couldn't safely assign to one fragment, or the
 *   replacement segments (a bare string and `{text, script}` nodes, in
 *   source order) when the split can proceed.
 */
function trySplit(node: unknown): ScriptRun[] | SkipReason | undefined {
  let text: string;
  let record: Record<string, unknown> | undefined;

  if (typeof node === "string") {
    text = node;
  } else if (isPlainObject(node) && !isBoundary(node) && typeof node.text === "string") {
    if (node.script !== undefined) return undefined;
    record = node;
    text = node.text;
  } else {
    return undefined;
  }

  if (!hasMixedScriptText(text)) return undefined;

  if (record !== undefined) {
    const keys = Object.keys(record);
    if (keys.length !== 1 || keys[0] !== "text") {
      if (record.strong !== undefined) return "strong";
      if (record.foot !== undefined && record.foot !== null) return "foot";
      if (Array.isArray(record.marks) && record.marks.length > 0) return "marks";
      return "other-properties";
    }
  }

  return splitNonLatinScriptRuns(text) as ScriptRun[];
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `mapContentText.ts`'s own recursion exactly,
 * then returns a shallow copy with those fields replaced. A string, or
 * anything that isn't a plain object, has no nested levels to rewrite and
 * passes through unchanged.
 */
function rewriteNested(node: unknown, counts: Counts): unknown {
  if (!isPlainObject(node)) return node;
  const record = { ...node };

  if (record.heading !== undefined) record.heading = rewriteLevel(record.heading, counts);
  if (record.subtitle !== undefined) record.subtitle = rewriteLevel(record.subtitle, counts);
  if (
    record.heading === undefined &&
    record.subtitle === undefined &&
    record.bibleLink === undefined &&
    record.content !== undefined
  ) {
    record.content = rewriteLevel(record.content, counts);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content, counts) };
  }

  return record;
}

/**
 * Rewrites one array level: every element's own nested levels first, then —
 * unlike every other fixer in this pipeline — splices in the split segments
 * for any element that itself needed splitting, so one node genuinely
 * becomes several siblings in place rather than being rewritten in place.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: Counts): unknown[] {
  const result: unknown[] = [];
  for (const node of nodes) {
    const nested = rewriteNested(node, counts);
    const split = trySplit(nested);
    if (split === undefined) {
      result.push(nested);
    } else if (typeof split === "string") {
      counts.skipped.push(split);
      result.push(nested);
    } else {
      result.push(...split);
      counts.fixed++;
    }
  }
  return result;
}

/**
 * Rewrites one `Content` value, single node or array alike. An array
 * delegates to {@link rewriteArrayLevel}, which can splice a node's own
 * split segments into place. A single (non-array) node has no siblings to
 * splice among, so a split there replaces the whole scalar `Content` value
 * with the resulting array outright — the real WEBUS2020 `NUM 15:38` shape,
 * where `foot.content` itself is a bare mixed-script string, not an array.
 */
function rewriteLevel(content: unknown, counts: Counts): unknown {
  if (Array.isArray(content)) {
    return rewriteArrayLevel(content, counts);
  }

  const nested = rewriteNested(content, counts);
  const split = trySplit(nested);
  if (split === undefined) return nested;
  if (typeof split === "string") {
    counts.skipped.push(split);
    return nested;
  }
  counts.fixed++;
  return split;
}

/**
 * Tags every eligible untagged Hebrew or Greek run in one verse's `content`
 * tree, recursively (`heading`, `subtitle`, a `ContentNested` wrapper's own
 * `content`, and a footnote body's own `foot.content`).
 *
 * `changed` reflects `counts.fixed`, not a structural comparison — a decline
 * never rewrites anything, so counting the fixes themselves is exact,
 * matching every other gated transform in this pipeline. `skipped` is always
 * returned, changed or not.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing was
 *   fixed), whether anything changed, and every finding this run declined to
 *   act on, with its own {@link SkipReason}
 */
export function tagScriptRunsInContent(
  content: Content,
): { content: Content; changed: boolean; skipped: SkipReason[] } {
  const counts: Counts = { fixed: 0, skipped: [] };
  const rewritten = rewriteLevel(content, counts) as Content;
  return counts.fixed > 0
    ? { content: rewritten, changed: true, skipped: counts.skipped }
    : { content, changed: false, skipped: counts.skipped };
}

export default tagScriptRunsInContent;
