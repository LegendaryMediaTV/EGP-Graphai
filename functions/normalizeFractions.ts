import Content from "../types/Content";
import { mapContentText } from "./mapContentText";

/**
 * Write every fraction in raw source text the one way this repo writes
 * fractions: superscript numerator, U+2044 FRACTION SLASH, subscript
 * denominator — whatever shape the source spelled it in.
 * {@link normalizeFractionText} converts three real shapes in one pass: a
 * precomposed Unicode glyph (`½`), a genuine ASCII `N/M` slash fraction, and
 * plain digits already separated by U+2044 but not yet raised/lowered.
 *
 * This module is the one git-tracked home for the convention. The USFM
 * importer, a corpus-wide validation check, and the gitignored one-time
 * correction scripts under `imports/corrections/` all import from here
 * rather than redefining any part of it. {@link normalizeFractionsInContent},
 * further down, applies this convention across a whole content tree via
 * {@link mapContentText} (`functions/mapContentText.ts`) — the traversal
 * itself lives there now, shared with `functions/normalizeEllipses.ts`,
 * since the only thing that differs between the two is which string
 * function runs at the leaves.
 */

// ---------------------------------------------------------------------------
// The convention itself
// ---------------------------------------------------------------------------

/** U+2070…U+2079, indexed by the digit they raise. */
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** U+2080…U+2089, indexed by the digit they lower. */
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** U+2044 FRACTION SLASH, which is not the ASCII solidus. */
const FRACTION_SLASH = "⁄";

/**
 * A fraction as a source sometimes writes it: plain digits either side of the
 * real U+2044 slash, not yet raised/lowered. Exactly one imported corpus is
 * known to carry this shape; every other caller of
 * {@link normalizeFractionText} converts it too, at no extra cost, matching
 * this module's own "however the source spells it" scope.
 */
export const PLAIN_FRACTION = new RegExp(`([0-9]+)${FRACTION_SLASH}([0-9]+)`, "g");

/** Raise or lower every digit of a number. */
function shift(value: string, table: string): string {
  return [...value].map((digit) => (/[0-9]/.test(digit) ? table[Number(digit)] : digit)).join("");
}

/**
 * Write a fraction the one way this repo writes fractions: superscript
 * numerator, U+2044 FRACTION SLASH, subscript denominator.
 *
 * This is the convention itself, not a list of the fractions that happen to
 * occur, which is why every caller in this module — and every gitignored
 * correction script under `imports/corrections/` — calls it rather than
 * typing `¹⁄₂` out again.
 *
 * @param numerator - The numerator in plain digits, e.g. `1`.
 * @param denominator - The denominator in plain digits, e.g. `16`.
 * @returns The fraction, e.g. `¹⁄₁₆`.
 */
export function uniformFraction(numerator: string, denominator: string): string {
  return shift(numerator, SUPERSCRIPT) + FRACTION_SLASH + shift(denominator, SUBSCRIPT);
}

// ---------------------------------------------------------------------------
// Shape 1: a precomposed vulgar-fraction glyph
// ---------------------------------------------------------------------------

/**
 * Every precomposed Unicode vulgar fraction, mapped to the uniform form.
 *
 * WEBUS2020's own raw USFM carries exactly one of these (`½`, three times, in
 * Exodus 27:1's own footnote); the rest are here so that a fraction glyph this
 * module has never actually met cannot slip past it unconverted. Each value is
 * {@link uniformFraction} of the glyph's own numerator and denominator, so the
 * table is a spelling of the convention rather than a second opinion about it.
 *
 * U+215F (`⅟`, fraction numerator one) is deliberately absent: it is half of
 * a fraction, not a fraction, and there is no denominator to lower.
 */
export const PRECOMPOSED: Readonly<Record<string, string>> = {
  "¼": uniformFraction("1", "4"),
  "½": uniformFraction("1", "2"),
  "¾": uniformFraction("3", "4"),
  "↉": uniformFraction("0", "3"),
  "⅐": uniformFraction("1", "7"),
  "⅑": uniformFraction("1", "9"),
  "⅒": uniformFraction("1", "10"),
  "⅓": uniformFraction("1", "3"),
  "⅔": uniformFraction("2", "3"),
  "⅕": uniformFraction("1", "5"),
  "⅖": uniformFraction("2", "5"),
  "⅗": uniformFraction("3", "5"),
  "⅘": uniformFraction("4", "5"),
  "⅙": uniformFraction("1", "6"),
  "⅚": uniformFraction("5", "6"),
  "⅛": uniformFraction("1", "8"),
  "⅜": uniformFraction("3", "8"),
  "⅝": uniformFraction("5", "8"),
  "⅞": uniformFraction("7", "8"),
};

/** Any glyph {@link PRECOMPOSED} converts. */
const PRECOMPOSED_GLYPH = new RegExp(`[${Object.keys(PRECOMPOSED).join("")}]`, "g");

// ---------------------------------------------------------------------------
// Shape 2: a genuine ASCII N/M slash fraction
// ---------------------------------------------------------------------------

/**
 * Plain digits either side of an ASCII solidus — the shape a Unicode census
 * cannot see. Exported so `imports/corrections/fix-ascii-fractions.ts` can
 * scan for the same candidates this module's own combined pass converts,
 * rather than keeping its own separate copy of the pattern.
 */
export const ASCII_FRACTION = /(\d+)\/(\d+)/g;

/**
 * An ordinal suffix immediately after a match. A genuine fraction that
 * carries one (`1/60th`) reads worse once the denominator drops to subscript
 * and the suffix snaps back to full size — left verbatim rather than
 * converted, a call already made by eye in `fix-ascii-fractions.ts`'s own
 * doc comment. Exported for the same reason as {@link ASCII_FRACTION}.
 */
export const ORDINAL_SUFFIX = /^(th|st|nd|rd)/;

/**
 * A parenthesized four-digit year immediately after a match, allowing one
 * space — the shape of a journal citation's volume/issue number
 * (`24/25 (1980):`), never of a fraction in any corpus this module has met.
 * Exported for the same reason as {@link ASCII_FRACTION}.
 */
export const CITATION_YEAR = /^ ?\(\d{4}[):]/;

/**
 * Whether a match is a citation, not a fraction: a numerator of more than
 * one digit (every real fraction this module converts has a single-digit
 * numerator, so `numerator.length > 1` costs nothing) or a trailing
 * parenthesized year. Ported from `fix-ascii-fractions.ts`'s own guard,
 * verified against a real corpus's 13 citation instances.
 *
 * @param numerator - The digits before the slash.
 * @param after - Up to six characters immediately after the match.
 */
export function looksLikeCitation(numerator: string, after: string): boolean {
  return numerator.length > 1 || CITATION_YEAR.test(after);
}

// ---------------------------------------------------------------------------
// The combined pass
// ---------------------------------------------------------------------------

/** What one call to {@link normalizeFractionText} changed. */
export interface FractionNormalization {
  /** The text with every real fraction shape normalized. */
  value: string;
  /** Individual glyphs/fractions converted. `7½×7½×4½` contributes three. */
  changes: number;
}

/**
 * Normalizes every real fraction shape in one string, in one pass:
 * precomposed glyph, then ASCII `N/M` slash (guarded against a citation and
 * an ordinal suffix), then plain digits separated by U+2044. The three
 * shapes can't overlap — a superscript digit isn't `[0-9]`, a precomposed
 * glyph isn't an ASCII digit — so order doesn't matter, and running this on
 * its own output changes nothing. Text with no fraction shape passes
 * through unchanged, with `changes: 0`.
 *
 * @param text - Raw source text, however it spells a fraction, or none at all.
 */
export function normalizeFractionText(text: string): FractionNormalization {
  let changes = 0;

  const withGlyphsConverted = text.replace(PRECOMPOSED_GLYPH, (glyph) => {
    changes += 1;
    return PRECOMPOSED[glyph];
  });

  const withAsciiConverted = withGlyphsConverted.replace(
    ASCII_FRACTION,
    (whole: string, numerator: string, denominator: string, offset: number, full: string) => {
      const after = full.slice(offset + whole.length, offset + whole.length + 6);
      if (looksLikeCitation(numerator, after) || ORDINAL_SUFFIX.test(after)) return whole;
      changes += 1;
      return uniformFraction(numerator, denominator);
    },
  );

  const value = withAsciiConverted.replace(
    PLAIN_FRACTION,
    (_whole, numerator: string, denominator: string) => {
      changes += 1;
      return uniformFraction(numerator, denominator);
    },
  );

  return { changes, value };
}

// ---------------------------------------------------------------------------
// The content-tree walker
// ---------------------------------------------------------------------------

/**
 * Walks a content tree and normalizes every fraction it finds, via
 * {@link normalizeFractionText} above — the same conversion the USFM
 * importer applies on the way in and `auditNodes.ts`'s check 7 checks
 * against.
 *
 * The traversal itself — which branches of a node hold rewritable text —
 * lives in {@link mapContentText} (`functions/mapContentText.ts`), the one
 * shared walker this module and `functions/normalizeEllipses.ts` both build
 * on; this function supplies only the leaf-level rewrite. See that module's
 * own doc comment for exactly which branches it follows and why a
 * `bibleLink`'s own display-content override is excluded from the walk.
 *
 * Only ever rewrites an existing `text` string's value in place; never
 * restructures a node the way a merge or a split would, so a verse's own
 * shape survives byte-identical apart from the fraction glyphs themselves.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @returns The rewritten tree (structurally new only where something
 *   changed, otherwise the original reference) and whether anything changed
 *   at all
 */
export function normalizeFractionsInContent(
  content: Content
): { content: Content; changed: boolean } {
  return mapContentText(content, (text) => {
    const rewritten = normalizeFractionText(text);
    return rewritten.changes > 0 ? rewritten.value : undefined;
  });
}

export default normalizeFractionsInContent;
