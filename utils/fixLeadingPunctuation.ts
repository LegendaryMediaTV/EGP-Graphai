/**
 * Applies `auditNodes.ts`'s own leading-punctuation check: tight punctuation
 * that reads as glued to the word before it belongs on that word's own node,
 * not on the node after it. `utils/validate.ts` calls
 * {@link reattachLeadingPunctuationInContent} on every run, with no flag to
 * opt in or out.
 *
 * The check answers "does this node start with punctuation that isn't its
 * own, and where does that punctuation belong" once, in
 * {@link misplacedLeadingPunctuationAt}; this module imports that answer
 * rather than keeping a second copy of the judgment, the same division
 * `fixUnmergedNodes.ts` keeps with its own check. What it adds is purely
 * mechanical: moving the characters, and deciding what to do with a node
 * that turns out to have been nothing *but* the misplaced punctuation.
 *
 * **What happens to an emptied node.** One real corpus shape is
 * `{text: " replied", strong: "G3004"}` followed by `{text: ",", foot}` —
 * the comma sits outside the Strong's span it belongs to, and the footnote
 * anchors to the comma rather than to the word it annotates. Moving the
 * comma leaves the second node with no text at all, and its `marks`/`script`
 * render nothing without text, so they go with it. A `break` follows the
 * punctuation onto the target only when the two were already adjacent — where
 * the check reached back across a textless Strong's sibling to find the
 * target, the break stays behind on a bare `{break: true}` node instead, since
 * moving a line break across a sibling would put that sibling's Strong's tag
 * on the far side of it. There is never a second `break` to collide with
 * either way: the check refuses any pair whose target already carries one. A
 * `foot` follows only when the target has none of its own;
 * where the target is already footnoted, the emptied node stays behind as a
 * bare `{foot: {…}}` sibling, which renders its marker in the same place and
 * is the same "sole" extraction `fixFootnoteMarkerSpacing.ts` applies to the
 * same shaped problem. Anything else the emptied node still carries — a
 * `strong` number of its own, say — keeps it alive as a textless sibling
 * rather than being silently dropped.
 *
 * Rendered text never changes. The punctuation moves between nodes but not
 * within the string, so a verse reads byte-identically before and after; what
 * moves is a footnote marker, and only ever later, to the far side of
 * punctuation it should already have followed.
 */

import Content from "../types/Content";
import { describeNode, misplacedLeadingPunctuationAt } from "./auditNodes";

/**
 * A shallow, mutable copy of one content node, with a bare string promoted to
 * `{text}` first. Promoting up front is what makes the rest of this module
 * safe to write as plain property assignment: spreading a *string* copies its
 * indexed characters (`"0"`, `"1"`, …) into a garbage object instead of
 * preserving the text, a hazard `fixFootnotePunctuationOrder.ts` documents at
 * length on its own `withText`.
 */
function asObjectNode(node: unknown): Record<string, unknown> {
  if (typeof node === "string") return { text: node };
  return { ...(node as Record<string, unknown>) };
}

/**
 * One array level's own siblings, rewritten left to right: every node
 * {@link misplacedLeadingPunctuationAt} reports has its leading punctuation
 * run moved onto the earlier node that answer names.
 *
 * `shapes` is rebuilt after each repair rather than computed once, because a
 * repair changes both the node it moved punctuation off and the node it moved
 * it onto — and the second of those is a candidate attachment point for
 * everything still to come. No such chained shape exists in the corpus today
 * (a full sweep finds no finding adjacent to another, and none whose
 * attachment point is itself a finding), but reading a stale shape would
 * silently duplicate a punctuation mark on both sides of a boundary, which is
 * not a failure mode worth leaving open to save a walk over a verse-sized
 * array.
 */
function rewriteArrayLevel(nodes: readonly unknown[], counts: { fixed: number }): unknown[] {
  const working: unknown[] = [...nodes];
  let shapes = working.map(describeNode);

  for (let at = 0; at < working.length; at++) {
    const split = misplacedLeadingPunctuationAt(shapes, at);
    if (split === undefined) continue;

    const offender = asObjectNode(working[at]);
    const target = asObjectNode(working[split.attachAt]);
    target.text = (shapes[split.attachAt].text ?? "") + split.leading;
    working[split.attachAt] = target;

    if (split.remainder !== "") {
      offender.text = split.remainder;
      working[at] = offender;
    } else {
      delete offender.text;
      delete offender.marks;
      delete offender.script;

      // A line break is a position, not text. Where the check reached back
      // across a textless Strong's sibling to find the target, that sibling
      // renders no characters — so the punctuation and the footnote marker
      // move across it freely — but folding the break across it too would
      // strand its Strong's number on the wrong line. Invisible in prose
      // output, which renders the sibling as nothing at all, and wrong in any
      // export that prints the number inline. The break stays put instead, on
      // a bare `{break: true}` node in the emptied node's own slot; nothing
      // else survives there, since the text it marked the end of has just
      // moved.
      if (offender.break === true && split.attachAt === at - 1) {
        target.break = true;
        delete offender.break;
      }
      if (offender.foot !== undefined && target.foot === undefined) {
        target.foot = offender.foot;
        delete offender.foot;
      }

      if (Object.keys(offender).length === 0) {
        working.splice(at, 1);
        at--;
      } else {
        working[at] = offender;
      }
    }

    counts.fixed++;
    shapes = working.map(describeNode);
  }

  return working;
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
function rewriteNode(node: unknown, counts: { fixed: number }): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const record = { ...(node as Record<string, unknown>) };

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
 * Rewrites one `Content` value, single node or array alike. A single node has
 * no siblings for punctuation to move between, so only its own nested levels
 * change; an array first rewrites every child's own nested levels, then
 * repairs findings at this level.
 */
function rewriteLevel(content: unknown, counts: { fixed: number }): unknown {
  if (Array.isArray(content)) {
    return rewriteArrayLevel(
      content.map((node) => rewriteNode(node, counts)),
      counts,
    );
  }
  return rewriteNode(content, counts);
}

/**
 * Moves every misplaced leading punctuation run in one verse's `content`
 * tree onto the node it belongs to, recursively (`heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content`, mirroring `auditNodes.ts`'s own `walkLevel`).
 *
 * `changed` counts the repairs themselves rather than comparing serialized
 * trees: every level is shallow-copied on the way through, so a reference
 * comparison would report a change on every call, and counting is both exact
 * and cheaper than serializing twice.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing moved) and
 *   whether anything did
 */
export function reattachLeadingPunctuationInContent(
  content: Content,
): { content: Content; changed: boolean } {
  const counts = { fixed: 0 };
  const rewritten = rewriteLevel(content, counts) as Content;
  return counts.fixed > 0
    ? { content: rewritten, changed: true }
    : { content, changed: false };
}
