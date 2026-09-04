/**
 * Moves whatever is not part of a reference out of the `bibleLink` node that
 * was linking it — the lead-in word ahead of it, the locator or edition note
 * after it, the bare open paren a citation was written inside — leaving the
 * reference itself as the only clickable text and the rest as ordinary prose
 * beside it.
 *
 * A reader clicks a reference to go to a verse. "See" goes nowhere, and
 * neither does "above" or "(Gk.)"; a footnote that underlines them is
 * promising navigation it cannot deliver, and an opening paren inside the
 * link with its closing partner outside just looks broken. Worse, an edition
 * siglon that reached the *target* ("Deuteronomy 32:43 LXX") names no verse
 * in anything, so the link cannot resolve at all.
 *
 * A hoisted siglon lands as an `{ abbr }` node rather than bare text when
 * the version's own registry defines it — see {@link hoistedAffixNodes} —
 * so the siglum a link was hiding ends up written the same way every other
 * mention of it in that version already is.
 *
 * **The affix tables below are closed, and deliberately so.** The general
 * question — "which part of this display text is the reference?" — has no
 * safe mechanical answer over this corpus, because a version's own citation
 * style is not prose about the reference but the reference as that version
 * writes it: YLT's "v. 1–17" targets Matthew 1:1–17, ESV's "Ps. 46, title"
 * targets Psalm 46:1, and NET's "49:1–9a" targets Isaiah 49:1–9. Every one
 * of those looks like a reference with something extra stuck to it and is in
 * fact the whole reference, so a grammar confident enough to trim them would
 * be wrong far more often than this table can be. A corpus-wide sweep of
 * every word appearing in any display override found 220 distinct ones, of
 * which exactly these are prose; the rest are book names and citation
 * vocabulary. What the tables cannot recognize, {@link
 * findBibleLinkDisplayProse} reports rather than guesses at.
 *
 * The importer already declines to build these shapes — see
 * `usfm/references.ts`'s own `REFERENCE_LEAD_IN` and `TRAILING_SIGLON` — so
 * this exists for the same reason the dash and cross-chapter steps do: to
 * reach content built before that was true, and content some version's own
 * one-off importer built its own way. `utils/validate.ts` calls
 * {@link hoistBibleLinkDisplayProseInContent} on every run, with no flag to
 * opt in or out.
 */

import Content, { ContentAbbreviation, ContentBibleLink } from "../types/Content";

/**
 * Prose written ahead of a reference, to print before the link instead of
 * inside it.
 *
 * - `"See "`/`"Compare "` — WEB's house style for a cross-reference written
 *   as a directive ("See Job 9:8", Matthew 14:25).
 * - `"end of "` — ASV Romans 16:25's "Compare the end of chapter 14", where
 *   "chapter 14" is the reference and "end of" is the sentence around it.
 * - a bare `"("` — a parenthesized citation whose open paren was swallowed
 *   into the link while its closing partner stayed in the prose (AMP1987
 *   2 Samuel 12:11's "(13:28, 29").
 */
const LEADING_PROSE: readonly RegExp[] = [/^(?:See|Compare) /, /^end of /, /^\(/];

/**
 * Prose written after a reference, to print after the link instead of inside
 * it.
 *
 * - `" above"` — ESV's locator for a verse earlier in the same chapter
 *   ("22 above", Genesis 5:24). "22" is the reference; "above" says where to
 *   look for it on the page.
 * - `" (Gk.)"`/`" (Heb.)"` — ESV's note that the reference follows the Greek
 *   or Hebrew verse numbering rather than the English. No digits follow, so
 *   this can never be a second reference being clipped; `Heb.` here is the
 *   language, not the book.
 * - a tradition siglon — `LXX`/`MT`/`TR`/`NU`, the same four
 *   `usfm/references.ts` recognizes, naming which text the verse is read in.
 *
 * Deliberately absent: `"title"` (`"Ps. 46, title"`, `"Ps 59: title"`) and a
 * verse-part letter (`"49:1–9a"`, `"14:2ff"`). Those say *which* verse, so
 * they are the reference's own tail — trimming them would leave a display
 * that no longer names what it links to. See this module's own doc comment.
 */
const TRAILING_PROSE: readonly RegExp[] = [/ above$/, / \((?:Gk|Heb)\.\)$/, / (?:LXX|MT|TR|NU)$/];

/** A tradition siglon at the end of a `bibleLink` target, where it makes the target name no verse at all. */
const TARGET_SIGLON = / (?:LXX|MT|TR|NU)$/;

/** A hoisted trailing affix that is nothing but a leading space and a tradition siglon, whose id a registry might define. */
const HOISTED_SIGLON = /^(\s)(LXX|MT|TR|NU)$/;

/** One `bibleLink` node's split: the content to print around the link, and the link itself with only the reference left in it. */
interface SplitLink {
  /** Prose that belongs before the link, or `""` when there is none. */
  readonly before: string;
  /** The rewritten link, target and display both carrying the reference alone. */
  readonly link: ContentBibleLink;
  /** What belongs after the link, in order, or empty when nothing does. A siglon the version's registry defines becomes an `{ abbr }` node preceded by its own space; anything else is plain text. */
  readonly after: readonly (string | ContentAbbreviation)[];
}

/** Strips the first matching affix, returning the remaining text and what came off (`""` when nothing matched). */
function stripAffix(text: string, patterns: readonly RegExp[]): { text: string; affix: string } {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match !== null) {
      return {
        text: text.slice(0, match.index) + text.slice(match.index + match[0].length),
        affix: match[0],
      };
    }
  }
  return { text, affix: "" };
}

/**
 * Splits one `bibleLink` node, or reports that it has nothing to split.
 *
 * A node with no display override of its own displays its target, so the
 * target is what the affix tables are held against — and a siglon found
 * there has to come off the target itself, not merely off the display, since
 * that is the half a click follows.
 *
 * The display override is dropped whenever what is left of it matches the
 * target exactly, the same condition under which `usfm/references.ts`'s own
 * `withDisplay` declines to add one: "See Job 9:8" against target "Job 9:8"
 * needed an override only for the lead-in this removes.
 *
 * @returns `undefined` when every affix table misses — the overwhelmingly
 *   common case, and the signal for the caller to leave the node alone
 *   rather than rebuild an identical one.
 */
function splitLink(node: ContentBibleLink, registeredAbbreviations: ReadonlySet<string>): SplitLink | undefined {
  const { text: bibleLink, affix: targetSiglon } = stripAffix(node.bibleLink, [TARGET_SIGLON]);
  const shown = typeof node.content === "string" ? node.content : node.bibleLink;

  const withoutLead = stripAffix(shown, LEADING_PROSE);
  const withoutTrail = stripAffix(withoutLead.text, TRAILING_PROSE);
  const reference = withoutTrail.text;

  // `targetSiglon` alone is enough to rewrite: a target carrying a siglon the
  // display never showed still resolves to nothing, and taking it off the
  // target changes only where the link goes, never what the reader reads —
  // so `after` stays empty and no new text appears on the page.
  if (withoutLead.affix === "" && withoutTrail.affix === "" && targetSiglon === "") return undefined;

  return {
    before: withoutLead.affix,
    link: reference === bibleLink ? { bibleLink } : { bibleLink, content: reference },
    after: hoistedAffixNodes(withoutTrail.affix, registeredAbbreviations),
  };
}

/**
 * Turns one hoisted trailing affix into the nodes that print it.
 *
 * A tradition siglon becomes an `{ abbr }` node whenever the version's own
 * registry defines that id, matching how every other siglum mention in that
 * version is already written: WEBUS2020 cites LXX 211 times as `{ abbr }`,
 * and a bare `"LXX"` string in the one place this rewrite touches would be
 * the only mention in the version with no name or description behind it. The
 * space keeps its place ahead of the node as ordinary text.
 *
 * Everything else, and a siglon in a version with no registry entry for it,
 * stays the plain text it already was. There is nowhere for an `{ abbr }`
 * lookup to fall through to, so inventing an id here would only trade a
 * missing tooltip for a failing audit.
 */
function hoistedAffixNodes(affix: string, registeredAbbreviations: ReadonlySet<string>): readonly (string | ContentAbbreviation)[] {
  if (affix === "") return [];

  const siglon = HOISTED_SIGLON.exec(affix);
  if (siglon !== null && registeredAbbreviations.has(siglon[2])) {
    return [siglon[1], { abbr: siglon[2] }];
  }
  return [affix];
}

/** Whether `node` is a `bibleLink` node — a reference target with an optional display override, and no subtree of its own. */
function isBibleLink(node: unknown): node is ContentBibleLink {
  return node !== null && typeof node === "object" && !Array.isArray(node) && typeof (node as ContentBibleLink).bibleLink === "string";
}

/**
 * Expands one array level's own `bibleLink` nodes into the prose-then-link-
 * then-prose runs {@link splitLink} describes, concatenating each piece of
 * prose onto a neighboring string item rather than pushing a second one
 * beside it — the same reason `usfm/references.ts`'s own `pushText` does, and
 * exactly what the AMP1987 shape needs: the open paren rejoins the sentence
 * it was taken from ("…by his brother Absalom " + "(") instead of sitting
 * beside it as its own node.
 */
function expandArrayLevel(
  nodes: readonly unknown[],
  registeredAbbreviations: ReadonlySet<string>,
): { nodes: unknown[]; changed: boolean } {
  const result: unknown[] = [];
  let changed = false;

  const pushText = (text: string): void => {
    const last = result[result.length - 1];
    if (typeof last === "string") result[result.length - 1] = last + text;
    else result.push(text);
  };

  // Set the moment the last thing emitted after a link was plain text, so the
  // next node — if it is itself plain text — joins it rather than sitting
  // beside it. Only ever merges a string onto text this pass just produced;
  // two strings that were already adjacent are left alone, since merging
  // those would change content without this pass reporting a change. An
  // `{ abbr }` node ends the run, having nothing a string could merge into.
  let textJustEmittedAfterLink = false;

  for (const node of nodes) {
    const split = isBibleLink(node) ? splitLink(node, registeredAbbreviations) : undefined;
    if (split === undefined) {
      if (textJustEmittedAfterLink && typeof node === "string") pushText(node);
      else result.push(node);
      textJustEmittedAfterLink = false;
      continue;
    }
    changed = true;
    if (split.before !== "") pushText(split.before);
    result.push(split.link);
    for (const item of split.after) {
      if (typeof item === "string") pushText(item);
      else result.push(item);
    }
    textJustEmittedAfterLink = typeof split.after[split.after.length - 1] === "string";
  }

  return { nodes: result, changed };
}

/**
 * Rewrites one node's own nested levels — `heading`, `subtitle`, a
 * `ContentNested` wrapper's own `content`, and a footnote body's own
 * `foot.content` — mirroring `fixDuplicateFootnoteAnchors.ts`'s own
 * recursion, including its `bibleLink` exclusion so a link's own display
 * override is never walked into as if it were nested content.
 */
function rewriteNode(node: unknown, registeredAbbreviations: ReadonlySet<string>): { node: unknown; changed: boolean } {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return { node, changed: false };
  const record = { ...(node as Record<string, unknown>) };
  let changed = false;

  for (const key of ["heading", "subtitle"] as const) {
    if (record[key] === undefined) continue;
    const result = rewriteLevel(record[key], registeredAbbreviations);
    if (result.changed) {
      record[key] = result.value;
      changed = true;
    }
  }

  if (
    record.heading === undefined &&
    record.subtitle === undefined &&
    record.bibleLink === undefined &&
    record.content !== undefined
  ) {
    const result = rewriteLevel(record.content, registeredAbbreviations);
    if (result.changed) {
      record.content = result.value;
      changed = true;
    }
  }

  const foot = record.foot as { content?: unknown } | undefined;
  if (foot?.content !== undefined) {
    const result = rewriteLevel(foot.content, registeredAbbreviations);
    if (result.changed) {
      record.foot = { ...foot, content: result.value };
      changed = true;
    }
  }

  return changed ? { node: record, changed: true } : { node, changed: false };
}

/**
 * Rewrites one `Content` value, single node or array alike. A lone
 * `bibleLink` that splits becomes an array at its own level — the shape a
 * footnote whose whole body is one cross-reference needs, since "See " has
 * to live somewhere beside the link once it is out of it.
 */
function rewriteLevel(content: unknown, registeredAbbreviations: ReadonlySet<string>): { value: unknown; changed: boolean } {
  if (Array.isArray(content)) {
    let childrenChanged = false;
    const children = content.map((node) => {
      const result = rewriteNode(node, registeredAbbreviations);
      if (result.changed) childrenChanged = true;
      return result.node;
    });
    const expanded = expandArrayLevel(children, registeredAbbreviations);
    return { value: expanded.nodes, changed: childrenChanged || expanded.changed };
  }

  const rewritten = rewriteNode(content, registeredAbbreviations);
  const expanded = expandArrayLevel([rewritten.node], registeredAbbreviations);
  if (!expanded.changed) return { value: rewritten.node, changed: rewritten.changed };
  return { value: expanded.nodes.length === 1 ? expanded.nodes[0] : expanded.nodes, changed: true };
}

/**
 * Moves every recognized piece of non-reference prose out of every
 * `bibleLink` node in one verse's `content` tree, recursively.
 *
 * @param content - A verse's own `content` value, or any subtree of it
 * @param registeredAbbreviations - The abbreviation ids this verse's own
 *   version defines, from `abbreviations.ts`'s
 *   {@link registeredAbbreviationIds}. A hoisted tradition siglon becomes an
 *   `{ abbr }` node when its id is in here and plain text otherwise, so the
 *   default empty set is the right answer for a caller with no version in
 *   hand: plain text always renders, where an unregistered `{ abbr }` id
 *   would fail `validate.ts`'s own abbreviation audit.
 * @returns The rewritten tree (the original reference when nothing moved) and whether anything changed
 */
export function hoistBibleLinkDisplayProseInContent(
  content: Content,
  registeredAbbreviations: ReadonlySet<string> = new Set(),
): { content: Content; changed: boolean } {
  const result = rewriteLevel(content, registeredAbbreviations);
  return result.changed ? { content: result.value as Content, changed: true } : { content, changed: false };
}

/** One `bibleLink` node still linking text that is not part of its reference, with enough identity to report it. */
export interface BibleLinkDisplayProseFinding {
  /** The book id the node sits in, e.g. `"MAT"`. */
  book: string;
  /** The chapter number the node sits in. */
  chapter: number;
  /** The verse number the node sits in. */
  verse: number;
  /** The node's own target. */
  target: string;
  /** The node's own display override, flattened to its visible text. */
  display: string;
}

/** Flattens a display override to the text it renders, so a marked or nested override can be reported by what a reader would see. */
function flattenDisplay(content: Content | undefined): string {
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(flattenDisplay).join("");
  if ("text" in content && typeof content.text === "string") return content.text;
  if ("content" in content) return flattenDisplay(content.content as Content);
  return "";
}

/**
 * Reports every `bibleLink` node still linking non-reference prose, holding
 * the same affix tables the rewrite uses against the node's own rendered
 * display text and its target.
 *
 * Read-only, and the "report what it can't fix" half of this module's
 * contract. On a settled corpus this is silent, since the fix pass ran first
 * and cleared everything it recognizes. What survives it is the one shape the
 * rewrite declines: a display override that is not a plain string, where
 * splitting the text would have to invent how the prose half is marked. No
 * such node exists in this corpus today, and if a later import writes one,
 * this fails the run naming it instead of quietly leaving it linked.
 */
export function findBibleLinkDisplayProse(
  verses: readonly { book: string; chapter: number; verse: number; content: Content }[],
): { findings: BibleLinkDisplayProseFinding[]; scanned: number } {
  const findings: BibleLinkDisplayProseFinding[] = [];
  let scanned = 0;

  const scan = (node: unknown, at: { book: string; chapter: number; verse: number }): void => {
    if (Array.isArray(node)) {
      node.forEach((child) => scan(child, at));
      return;
    }
    if (node === null || typeof node !== "object") return;

    if (isBibleLink(node)) {
      scanned++;
      const display = node.content === undefined ? node.bibleLink : flattenDisplay(node.content);
      const hasProse =
        TARGET_SIGLON.test(node.bibleLink) ||
        LEADING_PROSE.some((pattern) => pattern.test(display)) ||
        TRAILING_PROSE.some((pattern) => pattern.test(display));
      if (hasProse) findings.push({ ...at, target: node.bibleLink, display });
      // A link's own `content` is display text, never a subtree to descend into.
      return;
    }

    for (const value of Object.values(node as Record<string, unknown>)) scan(value, at);
  };

  for (const verse of verses) {
    scan(verse.content, { book: verse.book, chapter: verse.chapter, verse: verse.verse });
  }
  return { findings, scanned };
}

/** Formats one finding as a single report line, matching `crossChapterLinks.ts`'s own finding-line shape. */
export function formatBibleLinkDisplayProseFinding(finding: BibleLinkDisplayProseFinding): string {
  return `   ${finding.book} ${finding.chapter}:${finding.verse} — ${JSON.stringify(finding.display)} links to "${finding.target}"`;
}
