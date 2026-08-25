import Content from "../types/Content";
import { mapContentText } from "./mapContentText";

/**
 * Write every elision in raw source text the one way this repo writes one:
 * U+2026 HORIZONTAL ELLIPSIS, whatever ASCII shape the source spelled it in.
 * YLT1898 already writes this convention 244 times in exactly the idiom this
 * module targets — an italic footnote or gloss quoting the source with words
 * elided (`"be asking…be seeking (or desiring), be knocking…opened up;"`) —
 * so this is settled corpus-wide; three other versions simply never got
 * normalized to it (WEBUS2020's `...`, ASV1901's `. . .`).
 *
 * This module exports two functions that answer different questions on
 * purpose, and they must not be collapsed into one:
 *
 * - {@link normalizeEllipsisText} is the narrow rewriter. It only ever
 *   converts a run of three or more ASCII periods, or a run of periods
 *   separated by single spaces. **It never converts a two-period run.** As a
 *   standing rule applied to every future import — from any source, not just
 *   this corpus's own history — a bare `..` is genuinely ambiguous: it could
 *   be this same elision idiom, or it could be a doubled-period typo. Three
 *   periods carries no such ambiguity; a real sentence boundary never reads
 *   `"..."`.
 * - {@link hasEllipsisIndicator} is the broad detector. It flags everything
 *   the rewriter converts, *plus* a two-period run. It exists so
 *   `auditNodes.ts`'s check 10 can report a two-period run for a person to
 *   decide, instead of the pipeline either silently rewriting something
 *   ambiguous or silently ignoring it.
 *
 * This corpus's own 31 two-period nodes (YLT1898, every one inside
 * `foot.content`, concentrated in Acts) were judged, once, to be Young's own
 * space-constrained inconsistency in his Concise Commentary notes — not a
 * defect this rewriter should treat as a standing rule. They were corrected
 * by a scoped, one-time, throwaway script (kept only as a Phase Results
 * record, not as a git-tracked path), the same shape as this repo's other
 * hand-judged exceptions. That is a decision about *those 31 nodes*, not
 * about the two-period shape in general — which is exactly why
 * {@link normalizeEllipsisText} still refuses it. A future reader must not
 * "finish the job" by widening the rewriter's own pattern to match; doing so
 * would make every future two-period typo silently unrecoverable.
 *
 * {@link normalizeEllipsesInContent}, further down, applies the rewriter
 * across a whole content tree via {@link mapContentText}
 * (`functions/mapContentText.ts`) — never over the detector, since the
 * detector's whole purpose is to see more than the rewriter acts on.
 */

/**
 * The narrow pattern {@link normalizeEllipsisText} rewrites: a run of three
 * or more consecutive ASCII periods, or a run of periods each separated by
 * exactly one space (also three or more). A run of exactly two periods
 * matches neither alternative — `\.{3,}` requires at least three, and
 * `\.(?: \.){2,}` requires the leading period plus at least two more
 * `" ."` repetitions, three periods minimum — so the two-period exclusion
 * holds by construction, not by a separate guard that could drift out of
 * sync with this pattern.
 */
const DOT_RUN_SOURCE = String.raw`\.{3,}|\.(?: \.){2,}`;

/** {@link DOT_RUN_SOURCE}, compiled once without the global flag, for a stateless `.test()` in {@link hasEllipsisIndicator}. */
const DOT_RUN = new RegExp(DOT_RUN_SOURCE);

/** {@link DOT_RUN_SOURCE}, compiled once with the global flag, for `.replace()` in {@link normalizeEllipsisText}. Safe to share across calls: `String.prototype.replace` resets a global regex's own `lastIndex` to 0 at the start of every call. */
const DOT_RUN_GLOBAL = new RegExp(DOT_RUN_SOURCE, "g");

/**
 * Exactly two ASCII periods, not part of a longer run either side — the one
 * shape {@link normalizeEllipsisText} deliberately refuses and
 * {@link hasEllipsisIndicator} deliberately flags. The lookaround guards are
 * what keep this from double-counting inside a run `DOT_RUN` already claims
 * (three or more periods contains multiple adjacent-pair substrings, none of
 * which should independently register as "a two-period run").
 */
const TWO_DOT = /(?<!\.)\.\.(?!\.)/;

/** What one call to {@link normalizeEllipsisText} changed. */
export interface EllipsisNormalization {
  /** The text with every unambiguous dot run normalized. */
  value: string;
  /** Maximal dot runs converted. Two runs in one string contributes two. */
  changes: number;
}

/**
 * Normalizes every unambiguous ellipsis shape in one string: a run of three
 * or more ASCII periods (`...`), or periods separated by single spaces
 * (`. . .`), collapse to U+2026. **Never** converts a two-period run — see
 * this module's own top doc comment for why that refusal is permanent, not
 * an oversight.
 *
 * A run's own dot count decides the shape of the replacement, not just
 * whether one happens: the first three periods of any run always become one
 * `…`; any periods beyond the third stay as literal periods, glued directly
 * onto the ellipsis with no space. This is what turns this corpus's one real
 * four-spaced-period run — `". . . ."`, ASV1901 `43-JHN.json`, classic
 * ellipsis-plus-terminal-period — into `"….",` preserving the sentence's own
 * closing period instead of swallowing it, while an ordinary three-period
 * run (the other 118 spaced instances) collapses to a bare `…` with nothing
 * left over. All surrounding whitespace — before the run starts, after it
 * ends — is untouched either way; only the periods and the single spaces
 * between them are ever consumed.
 *
 * @param text - Raw source text, however it spells an elision, or none at all.
 */
export function normalizeEllipsisText(text: string): EllipsisNormalization {
  let changes = 0;

  const value = text.replace(DOT_RUN_GLOBAL, (match) => {
    changes += 1;
    const dotCount = (match.match(/\./g) ?? []).length;
    return "…" + ".".repeat(Math.max(0, dotCount - 3));
  });

  return { value, changes };
}

/**
 * True when `text` carries any dot-run shape this repo's ellipsis convention
 * cares about — everything {@link normalizeEllipsisText} converts, *plus* a
 * bare two-period run it deliberately refuses. See this module's own top
 * doc comment for why the rewriter and the detector disagree on that one
 * shape on purpose. Do not build this from
 * `normalizeEllipsisText(text).changes > 0` — that can never see a
 * two-period run, by the same construction that keeps the rewriter from
 * touching one.
 *
 * @param text - Raw source text to check against the convention.
 */
export function hasEllipsisIndicator(text: string): boolean {
  return DOT_RUN.test(text) || TWO_DOT.test(text);
}

/**
 * Walks a content tree and normalizes every unambiguous ellipsis it finds,
 * via {@link normalizeEllipsisText} — never {@link hasEllipsisIndicator},
 * whose whole purpose is to see more than this rewriter acts on. The
 * traversal itself is {@link mapContentText} (`functions/mapContentText.ts`),
 * shared with `functions/normalizeFractions.ts`.
 *
 * @param content - A verse's content tree, or any subtree of it
 * @returns The rewritten tree (structurally new only where something
 *   changed, otherwise the original reference) and whether anything changed
 *   at all
 */
export function normalizeEllipsesInContent(
  content: Content,
): { content: Content; changed: boolean } {
  return mapContentText(content, (text) => {
    const rewritten = normalizeEllipsisText(text);
    return rewritten.changes > 0 ? rewritten.value : undefined;
  });
}

export default normalizeEllipsesInContent;
