/**
 * Folds a verse list that was linked one verse at a time back into the single
 * `bibleLink` it names — `{"Numbers 26:23"}`, `", "`, `{"Numbers 26:24"}`
 * becomes `{"Numbers 26:23, 24"}`.
 *
 * A comma inside a citation continues that citation's own verse list; a
 * semicolon is what separates one citation from the next. `usfm/references.ts`
 * already encodes both halves of that rule — `REFERENCE_SUFFIX` accepts a
 * comma-joined list as part of one `\xt` target, and `findSafeReferenceLength`
 * walks the same list inside ordinary footnote prose — so anything the importer
 * builds today already merges. This module exists for the same reason the dash
 * and cross-chapter steps do: to reach content built before that was true, and
 * content some version's own one-off importer built its own way. Both shapes
 * still sit side by side in the corpus, sometimes inside one verse, where a
 * cross-reference note carries the merged form and a study note beside it
 * carries the same reference split across three nodes.
 *
 * The split form is not merely untidy. Three adjacent links read to anything
 * downstream as three separate citations, so a count of what a note cites comes
 * out wrong, and the text a person actually sees has to be reassembled from the
 * nodes around each comma before it reads as the one citation it is.
 *
 * **The comma has to be the whole separator.** Two links joined by anything
 * larger — a clause, a semicolon, a parenthesis — are two citations and stay
 * two. So are two links whose targets name different books, or different
 * chapters of one book: no merged target in this corpus has ever named a second
 * chapter after its comma, and inventing one would hand every reader of a
 * target string a shape none of them parses today.
 *
 * **A merge rewrites the second half's display, and that is the point.** Where
 * the second link carried no display override of its own it was rendering its
 * whole target, so a note read "Romans 4:3, Romans 4:22" — the book name
 * repeated mid-list, which is what a list split into separate links looks like
 * rather than anything a publisher wrote. The merged node shows the verse
 * alone. What a merge never does is rewrite a display that spells out a *word*:
 * a real "verse 12", `", "`, "verse 14" is a sentence naming two places to
 * insert something, and {@link VERSE_LIST_DISPLAY} declines it for exactly that
 * reason.
 *
 * `utils/validate.ts` calls {@link mergeSplitVerseListsInContent} on every run,
 * with no flag to opt in or out.
 */

import Content from "../types/Content";

/**
 * A `bibleLink` node narrowed to the one shape a merge can rebuild: a display
 * override that is a plain string, or none at all. `ContentBibleLink` types
 * `content` as the whole of `Content`, which a merge would have to concatenate
 * with the text around the comma — see {@link asBibleLink} for why it declines
 * rather than guessing at that.
 */
interface VerseListLink {
  /** Scriptural reference target, e.g. `"Numbers 26:23"`. */
  readonly bibleLink: string;
  /** Display override, when the node carries one. */
  readonly content?: string;
}

/**
 * One `bibleLink` target split into the three parts a merge compares and
 * rebuilds from.
 */
interface ParsedTarget {
  /** The book name exactly as the target spells it, e.g. `"1 Samuel"`. */
  readonly book: string;
  /** The chapter number as written, compared as a string since a target never pads or spaces one. */
  readonly chapter: string;
  /** Everything after the colon — one verse, a range, or an already-merged list. */
  readonly verses: string;
}

/**
 * A target's own `Book C:V` shape. The book name is matched lazily so a target
 * whose verse part itself carries a colon (a cross-chapter range, `"2 Kings
 * 6:31–7:20"`) is read as chapter 6, rather than letting a greedy book name
 * swallow the first endpoint and call the second one the chapter.
 */
const TARGET = /^(.+?) (\d+):(.+)$/;

/**
 * The verse part of a target this module is willing to merge: verse numbers,
 * dash ranges, and the commas of an already-merged list, and nothing else.
 *
 * Narrow on purpose. It rejects a cross-chapter range's second endpoint (the
 * colon), an edition siglon, and anything else a target has ever picked up —
 * every shape where appending another verse would produce a target no reader of
 * one could make sense of. A missed merge costs nothing; a merged nonsense
 * target costs a working link.
 */
const VERSE_LIST_TARGET = /^\d+(?:[–—-]\d+)?(?:, ?\d+(?:[–—-]\d+)?)*$/;

/**
 * One item of a *display* verse list. Looser than {@link VERSE_LIST_TARGET} in
 * exactly one way — the sub-verse letters a display is where this corpus keeps
 * ("13b", "20c–d", "13abcd"), since a target names the whole verse and the
 * letter says which part of it a note is about.
 */
const DISPLAY_SEGMENT = "\\d+[a-z]*(?:[–—-](?:\\d+)?[a-z]*)?";

/**
 * What the second link's display must look like for a merge to absorb it: a
 * bare verse list continuing the list before it. A display that names its book
 * again, or writes out a word like "verse", is the prose of a separate citation
 * and stops the merge — the one thing separating a list some version split up
 * from a sentence that happens to mention two places.
 */
const VERSE_LIST_DISPLAY = new RegExp(
  `^${DISPLAY_SEGMENT}(?:,\\s?${DISPLAY_SEGMENT})*$`,
);

/** The entire separator a merge accepts: a comma, and at most the one space after it. */
const SEPARATOR = /^, ?$/;

/**
 * True when `node` is a `bibleLink` node and nothing else — a plain object
 * carrying a string target, an optional string display override, and no other
 * key. A display override that isn't a plain string has never been observed on
 * a link in a verse list, and a merge would have to decide how to concatenate
 * it with the text around the comma, so this declines rather than guesses.
 */
function asBibleLink(node: unknown): VerseListLink | undefined {
  if (node === null || typeof node !== "object" || Array.isArray(node))
    return undefined;
  const record = node as Record<string, unknown>;
  if (typeof record.bibleLink !== "string") return undefined;
  if (record.content !== undefined && typeof record.content !== "string")
    return undefined;
  for (const key of Object.keys(record)) {
    if (key !== "bibleLink" && key !== "content") return undefined;
  }
  return record as unknown as VerseListLink;
}

/**
 * The text `node` contributes, for a node that contributes only text — a bare
 * string, or the `{text}`-only object the schema already treats as equivalent
 * to one. A node carrying anything else (`marks`, `foot`, `break`) is not a
 * separator however its text reads: a comma that also anchors a footnote is
 * load-bearing, and folding it into a link would lose the anchor.
 */
function separatorText(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (node === null || typeof node !== "object" || Array.isArray(node))
    return undefined;
  const record = node as Record<string, unknown>;
  if (typeof record.text !== "string" || Object.keys(record).length !== 1)
    return undefined;
  return record.text;
}

/** Splits a target into book, chapter and verse list, or `undefined` for one that names no chapter and verse at all. */
function parseTarget(target: string): ParsedTarget | undefined {
  const match = TARGET.exec(target);
  if (match === null) return undefined;
  const [, book, chapter, verses] = match;
  return { book, chapter, verses };
}

/**
 * Builds the one link `first`, `separator` and `second` were spelling between
 * them, or `undefined` when they are not one citation's verse list.
 *
 * The merged target always writes `", "`, this corpus's own target spacing
 * (`usfm/references.ts`'s `addSpaceAfterVerseListComma`), while the merged
 * display keeps whatever the source wrote — a version that prints its lists
 * without that space keeps printing them that way. The display override is
 * dropped entirely when it would only restate the target, which is what happens
 * whenever neither half carried one: the target was already what both halves
 * were rendering.
 */
function mergePair(
  first: unknown,
  separator: unknown,
  second: unknown,
): VerseListLink | undefined {
  const left = asBibleLink(first);
  const right = asBibleLink(second);
  if (left === undefined || right === undefined) return undefined;

  const comma = separatorText(separator);
  if (comma === undefined || !SEPARATOR.test(comma)) return undefined;

  const leftTarget = parseTarget(left.bibleLink);
  const rightTarget = parseTarget(right.bibleLink);
  if (leftTarget === undefined || rightTarget === undefined) return undefined;
  if (
    leftTarget.book !== rightTarget.book ||
    leftTarget.chapter !== rightTarget.chapter
  )
    return undefined;
  if (
    !VERSE_LIST_TARGET.test(leftTarget.verses) ||
    !VERSE_LIST_TARGET.test(rightTarget.verses)
  )
    return undefined;

  const rightDisplay = right.content ?? rightTarget.verses;
  if (!VERSE_LIST_DISPLAY.test(rightDisplay)) return undefined;

  const target = `${left.bibleLink}, ${rightTarget.verses}`;
  const display = `${left.content ?? left.bibleLink}${comma}${rightDisplay}`;
  return display === target
    ? { bibleLink: target }
    : { bibleLink: target, content: display };
}

/**
 * Rewrites one array level, folding every run of comma-joined links into one
 * link as it goes. A merged link stays at the tail of the result, so the next
 * comma and link in the run fold into it too and a list of any length collapses
 * in a single left-to-right pass.
 */
function mergeSiblings(nodes: readonly unknown[]): unknown[] {
  const result: unknown[] = [];
  for (const node of nodes) {
    const merged =
      result.length >= 2
        ? mergePair(result[result.length - 2], result[result.length - 1], node)
        : undefined;
    if (merged === undefined) {
      result.push(node);
      continue;
    }
    result.splice(result.length - 2, 2, merged);
  }
  return result;
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `auditNodes.ts`'s own `walkLevel` recursion,
 * including its `content` exclusion whenever `heading`/`subtitle`/`bibleLink`
 * is present, so a `bibleLink`'s own display override is never walked as if it
 * were nested content.
 */
function rewriteNode(node: unknown): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node))
    return node;
  const record = { ...(node as Record<string, unknown>) };

  if (record.heading !== undefined)
    record.heading = rewriteLevel(record.heading);
  if (record.subtitle !== undefined)
    record.subtitle = rewriteLevel(record.subtitle);
  if (
    record.heading === undefined &&
    record.subtitle === undefined &&
    record.bibleLink === undefined &&
    record.content !== undefined
  ) {
    record.content = rewriteLevel(record.content);
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    record.foot = { ...foot, content: rewriteLevel(foot.content) };
  }

  return record;
}

/**
 * Rewrites one `Content` value, single node or array alike. A footnote body
 * that was nothing but a split verse list comes back as the bare link it now
 * holds, the shape every other single-node body in this corpus already takes —
 * but only when this module's own merge is what brought the array down to one
 * element, never when it arrived holding one already, which is a cosmetic
 * change nothing here has license to make.
 */
function rewriteLevel(content: unknown): unknown {
  if (Array.isArray(content)) {
    const merged = mergeSiblings(content.map(rewriteNode));
    return merged.length === 1 && content.length > 1 ? merged[0] : merged;
  }
  return rewriteNode(content);
}

/**
 * Merges every comma-split verse list in one verse's `content` tree,
 * recursively.
 *
 * `rewriteNode`'s own shallow copy at every level means the returned tree is
 * always structurally new even when nothing merged, so this compares the
 * serialized bytes and hands back the *original* reference when they match —
 * the contract every other content-tree transform in this repo keeps.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @returns The rewritten tree (the original reference when nothing merged) and
 *   whether anything did
 */
export function mergeSplitVerseListsInContent(content: Content): {
  content: Content;
  changed: boolean;
} {
  const rewritten = rewriteLevel(content) as Content;
  if (JSON.stringify(rewritten) === JSON.stringify(content)) {
    return { content, changed: false };
  }
  return { content: rewritten, changed: true };
}
