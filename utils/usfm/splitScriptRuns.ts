/**
 * Split contiguous runs of one non-Latin script's Unicode range out of an
 * otherwise-Latin string, wrapping each run in its own `{text, script}`
 * content node — the shared implementation `footnotes.ts`, `headings.ts`,
 * and `verify.ts` all reuse the moment a source string mixes a Hebrew or
 * Greek letter into Latin text. First need: acrostic-stanza headings
 * (Psalm 119's "Aleph, Beth, Gimel…" markers and the equivalent construct in
 * Lamentations) — but not limited to headings. The identical rule applies to
 * a footnote, a subtitle, or a run of ordinary verse text the moment it
 * embeds a non-Latin letter.
 *
 * {@link splitNonLatinScriptRuns}, further down, composes this across every
 * script this repo tags rather than the one a caller happens to name — the
 * fix for a real asymmetry: `footnotes.ts` scanned bare, undelimited text for
 * Greek only, and `headings.ts` scanned it for Hebrew only, so a source that
 * marked one script with a delimiter (`\+wh`) while leaving the other bare
 * shipped an untagged word (real WEBUS2020 Numbers 15:38, an untagged Hebrew
 * word inside a footnote nothing scanned for Hebrew at all). Every caller
 * that used to reach for this function with one hardcoded script now calls
 * that one instead.
 *
 * **Location.** This lives in a tracked, committed module rather than a
 * one-off script under the gitignored `imports/` tree: a shared helper the
 * core pipeline depends on to run at all has to ship with the repo, and
 * `imports/` is deliberately excluded from git for scratch, per-run import
 * tooling — a tracked module quietly depending on something that won't exist
 * on a fresh clone is exactly the failure this placement avoids.
 *
 * **The algorithm**: scan the string for contiguous runs of the target
 * script's Unicode range, then return an alternating sequence of plain-text
 * segments and `{text, script}` nodes — never an empty segment, and never
 * touching a character outside the run it found. A run captures a base
 * letter *and* any immediately following combining points/diacritics as one
 * piece, so a base letter plus a combining dot (Hebrew שׂ/שׁ — a base letter
 * and a sin-dot or shin-dot, two codepoints) is not split across the run
 * boundary and the diacritic never strands in the following plain-text
 * segment.
 *
 * Both scripts' ranges are confirmed directly against this repo's own
 * already-tagged data, each built on the same organizing principle — base
 * letters, the diacritics that ride on them, and the precomposed forms that
 * fuse the two (see {@link SCRIPT_RANGES} for the exact codepoint blocks).
 */

import type { ContentObject } from "../../types/Content";

// ---------------------------------------------------------------------------
// Unicode ranges
// ---------------------------------------------------------------------------

/** A hex codepoint string, 4-6 digits (covers the BMP and beyond, though nothing used here needs more than 4). */
const HEX_CODE_POINT = /^[0-9A-Fa-f]{4,6}$/;

/**
 * Build one script's own character-class fragment from explicit codepoint
 * hex strings — never a literal Hebrew/Greek glyph typed into source, which
 * would risk a silent transcription error. Each pair is one inclusive
 * `first-last` sub-range.
 *
 * @throws If a hex string is not 4-6 hex digits — a guard against a typo
 *   silently producing an empty or wrong character class.
 */
function rangeClass(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs
    .map(([first, last]) => {
      if (!HEX_CODE_POINT.test(first) || !HEX_CODE_POINT.test(last)) {
        throw new Error(`splitScriptRuns: malformed codepoint pair ${first}-${last}`);
      }
      return `\\u{${first}}-\\u{${last}}`;
    })
    .join("");
}

/**
 * One character-class fragment (the inside of `[...]`) per script.
 *
 * Hebrew: accents/points/diacritics (U+0591-U+05C7), the base-letter block
 * (U+05D0-U+05EA), and Alphabetic Presentation Forms (U+FB1D-U+FB4F) —
 * precomposed letter+point glyphs, indistinguishable on screen from their
 * two-codepoint base-block spellings, which CSB2017's own shipped acrostic
 * headings really use (shin U+FB2A, sin U+FB2B).
 *
 * Greek: Combining Diacritical Marks (U+0300-U+036F, a bare accent arriving
 * decomposed), Greek and Coptic (U+0370-U+03FF, base letters and
 * precomposed monotonic forms), Greek Extended (U+1F00-U+1FFF, precomposed
 * polytonic letter+breathing/accent combinations).
 */
const SCRIPT_RANGES: Readonly<Record<"H" | "G", string>> = {
  H: rangeClass([
    ["0591", "05C7"],
    ["05D0", "05EA"],
    ["FB1D", "FB4F"],
  ]),
  G: rangeClass([
    ["0300", "036F"],
    ["0370", "03FF"],
    ["1F00", "1FFF"],
  ]),
};

/** A fresh global-matching, Unicode-mode pattern for one script's range, built per call so no shared `lastIndex` state leaks between invocations. */
function scriptPattern(script: "H" | "G"): RegExp {
  return new RegExp(`[${SCRIPT_RANGES[script]}]+`, "gu");
}

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

/** One segment of a split string: plain Latin text, or one contiguous run of `script`'s own characters, tagged. */
export type ScriptRun = string | ContentObject;

/**
 * Split every contiguous run of `script`'s own Unicode range out of `text`.
 *
 * @param text - The raw string, however much or little of it is `script`.
 * @param script - Which script's range to look for (`"H"` Hebrew, `"G"` Greek).
 * @returns `text` itself, unchanged, when it contains no character in
 *   `script`'s range — every caller in this repo relies on comparing the
 *   result to the input with `===` to detect "nothing to do." Otherwise an
 *   alternating array of plain-text segments and `{text, script}` nodes, in
 *   the order they appeared, with no empty segment on either side.
 */
export function splitScriptRuns(text: string, script: "H" | "G"): string | ScriptRun[] {
  const pattern = scriptPattern(script);
  if (!pattern.test(text)) return text;
  pattern.lastIndex = 0;

  const segments: ScriptRun[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) segments.push(text.slice(cursor, match.index));
    segments.push({ text: match[0], script });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push(text.slice(cursor));

  return segments;
}

// ---------------------------------------------------------------------------
// Every script at once
// ---------------------------------------------------------------------------

/**
 * Every script {@link splitScriptRuns} knows how to isolate, applied by
 * {@link splitNonLatinScriptRuns} in this fixed order. The order is safe
 * rather than arbitrary: Hebrew's and Greek's own ranges never overlap, so a
 * run one pass finds can never straddle a boundary the other pass would also
 * find — which one this list names first has no observable effect on the
 * result.
 */
const ALL_SCRIPTS: readonly ("H" | "G")[] = ["H", "G"];

/**
 * Splits every contiguous run of *any* script this repo tags — Hebrew and
 * Greek both — out of `text`, not just whichever one a caller happens to
 * name. Composes {@link splitScriptRuns} once per script in
 * {@link ALL_SCRIPTS}: each later pass only ever re-scans the plain-text
 * segments the earlier pass left behind, so a run one pass already tagged is
 * never re-examined, let alone re-tagged, by the next.
 *
 * See this module's own top doc comment for the asymmetry this closes —
 * every caller used to call {@link splitScriptRuns} directly with one script
 * hardcoded.
 *
 * @param text - The raw string, however much or little of it is non-Latin.
 * @returns `text` itself, unchanged, when it contains no character in either
 *   script's range — the identical `===`-comparable "nothing to do" contract
 *   {@link splitScriptRuns} establishes. Otherwise an alternating array of
 *   plain-text segments and `{text, script}` nodes, in the order they
 *   appeared, with no empty segment on either side.
 */
export function splitNonLatinScriptRuns(text: string): string | ScriptRun[] {
  let segments: ScriptRun[] = [text];
  let matchedAnything = false;

  for (const script of ALL_SCRIPTS) {
    const next: ScriptRun[] = [];
    for (const segment of segments) {
      if (typeof segment !== "string") {
        next.push(segment);
        continue;
      }
      const split = splitScriptRuns(segment, script);
      if (typeof split === "string") {
        next.push(split);
      } else {
        next.push(...split);
        matchedAnything = true;
      }
    }
    segments = next;
  }

  return matchedAnything ? segments : text;
}
