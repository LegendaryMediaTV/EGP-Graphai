/**
 * Footnote-body assembly: given the token stream right after an `\f` marker
 * has opened, consumes tokens through the matching `\f*` close and produces
 * one real, typed `Footnote` — reusing `usfm/inlineMarks.ts`'s run-building
 * machinery for the same reason a footnote body is treated as its own small
 * document (italics, small caps, fractions, references) rather than a
 * second, weaker builder — and classifying the result through
 * `usfm/footnoteTypeRules.ts`'s shared table.
 *
 * Sub-marker handling, per USFM's own footnote grammar:
 *
 * - `\fr` (the reference-label sub-marker, e.g. "17:27") is dropped
 *   entirely — structural attachment position already encodes which run a
 *   note belongs to.
 * - `\ft`/`\fq`/`\fqa` combine into one body. `\fq`/`\fqa` (the word or
 *   alternate reading a note is discussing, always rendered in italics in
 *   print) get `marks: ["i"]`; `\ft` (the connecting prose) does not —
 *   confirmed against the real corpus, not assumed from the USFM spec alone
 *   (2 Chronicles 36:2's `\fqa Joahaz \ft is a variant of \fqa Jehoahaz\ft
 *   .` alternates `\fqa`-wrapped proper names against `\ft`-wrapped
 *   connecting prose inside one sentence).
 * - `\+wh`...`\+wh*` (a nested Hebrew-word-quotation marker, always found
 *   inside `\ft`/`\fq` prose) becomes `{text, script: "H"}` directly — the
 *   delimiter already marks the boundary, so no character-range scan is
 *   needed. A bare, undelimited Hebrew or Greek word has no such delimiter to
 *   lean on and is found by `usfm/splitScriptRuns.ts`'s own
 *   {@link splitNonLatinScriptRuns} instead, which scans for both scripts
 *   rather than one (see that module's own doc comment for why, and
 *   {@link piecesForPlainText} below).
 * - `\bk`...`\bk*` (and its `+`-nested form, `\+bk`...`\+bk*`, required
 *   wherever a citation sits inside an already-open paired marker) — USFM's
 *   own "quoted book title" character style — gets `marks: ["i"]`, the same
 *   mark `\fq`/`\fqa` already use: ebible.org's HTML renders this bold
 *   *and* italic, but that is the renderer's own presentational choice, not
 *   something `\bk`'s own semantics require, so this reuses the pipeline's
 *   existing italic mark rather than adding a new one.
 * - No `\w`/`\+w` (Strong's-tagged word) token ever occurs inside a
 *   footnote body in the in-scope corpus, so this builder never has to
 *   decide how a `strong` attribute interacts with `script`/quotation
 *   marks; if a future source ever did carry one, `buildRunNodes`'s own
 *   Strong's-attachment machinery would simply see a `strong`-bearing piece
 *   like any other, unmodified by anything here.
 */

import Content from "../../types/Content";
import Footnote from "../../types/Footnote";
import { classifyFootnote, WITNESS_SIGLA_NAMES } from "./footnoteTypeRules";
import { normalizeFractionText } from "../../functions/normalizeFractions";
import { buildRunNodes, collapseContentNodes, InlineTextPiece } from "./inlineMarks";
import { buildReferenceOnlyContent, linkEmbeddedReferences } from "./references";
import { splitNonLatinScriptRuns } from "./splitScriptRuns";
import { Token } from "./tokenize";

/**
 * WEB's own recurring `or, <alternate>` house style stays lowercase — the
 * one exception to "a footnote's displayed text starts with a capital
 * letter," confirmed against the real corpus rather than assumed.
 * `footnoteTypeRules.ts`'s own `/^Or,?\s/i` pattern documents the identical
 * convention for classification. `or` followed by anything but a comma
 * still capitalizes (Leviticus 11:5's real "Or rock badger, or cony").
 */
const LOWERCASE_OR_EXCEPTION = /^or,/i;

/**
 * WEB's own three self-documented witness sigla ({@link WITNESS_SIGLA_NAMES}),
 * anchored to a footnote body's leading word — recapitalizes the *whole*
 * abbreviation, not merely its first letter, so a source-side casing slip
 * (Acts 4:27's "nu adds...") comes out matching the corpus's real "NU
 * adds...", not the "Nu adds..." a bare first-letter rule would produce.
 */
const LEADING_WITNESS_SIGLON = new RegExp(`^(?:${WITNESS_SIGLA_NAMES})\\b`, "i");

/**
 * Capitalizes a footnote body's own leading character, matching the
 * corpus's real, measured convention: both outright regressions and an
 * already-lowercase backlog get capitalized the same way, since neither
 * shows the kind of clean, repeatable signal that would justify treating
 * them differently (unlike the `or,` exception, which does). Leaves `text`
 * untouched when its first character isn't an ASCII lowercase letter at
 * all — already capitalized, a digit, punctuation, or a script-tagged
 * Hebrew/Greek word, none of which this rule has anything to say about.
 */
export function capitalizeFootnoteOpening(text: string): string {
  const leadingChar = text[0];
  if (leadingChar === undefined || !/[a-z]/.test(leadingChar)) return text;
  if (LOWERCASE_OR_EXCEPTION.test(text)) return text;

  const siglon = LEADING_WITNESS_SIGLON.exec(text);
  if (siglon !== null) return siglon[0].toUpperCase() + text.slice(siglon[0].length);

  return leadingChar.toUpperCase() + text.slice(1);
}

/** Sub-markers whose own text renders in italics (`marks: ["i"]`) — `\fq`/`\fqa`, USFM's own footnote-quotation convention. `\fl` is deliberately absent: no evidence anywhere in this corpus that a footnote label prints in italics, unlike `\fq`/`\fqa`. */
const QUOTED_SUB_MARKERS = new Set(["fq", "fqa"]);

/**
 * Sub-markers whose own text becomes part of the footnote's real body. `\fr`
 * is deliberately absent — its text is dropped, never accumulated.
 *
 * `\fl` — a footnote label (`Greek`, `Hebrew`, `Or,`, `Note:`, `i.e.`),
 * absent from the 66-book canonical corpus but present in Esther-Greek —
 * must stay in this set: an unrecognized `\fl` falls through
 * without updating {@link buildFootnoteContent}'s own `currentSubMarker`,
 * so its text silently attaches to whichever sub-marker was active before
 * it instead — usually `"fr"`, discarding it as if it were part of the
 * already-dropped reference label. Esther-Greek 1:11's `\f + \fr 1:11 \fl
 * Greek \ft to make her queen.\f*` would lose the word "Greek" entirely,
 * starving `footnoteTypeRules.ts`'s own `TRANSLATION_OPENER` check of the
 * anchor it needs and wrongly falling to the default `stu` instead of the
 * correct `trn`.
 */
const KEPT_SUB_MARKERS = new Set(["ft", "fq", "fqa", "fl"]);

/**
 * Splits `text` for the footnote-body walk's own bare-script detection,
 * tagging `marks: ["i"]` too when `italic` is set — italic and script
 * tagging are independent, so both apply together without either one
 * overriding the other.
 *
 * Scans for both Hebrew and Greek ({@link splitNonLatinScriptRuns}), not
 * Greek alone: this call site used to scan for Greek only, which is exactly
 * why real WEBUS2020 `NUM 15:38` shipped an untagged Hebrew word — its
 * source marks the Hebrew with no `\+wh` delimiter, so nothing here ever
 * looked for it.
 */
function piecesForPlainText(text: string, italic: boolean): InlineTextPiece[] {
  const split = splitNonLatinScriptRuns(text);
  if (typeof split === "string") {
    return [{ text: split, ...(italic ? { marks: ["i"] } : {}) }];
  }
  return split.map((segment) =>
    typeof segment === "string"
      ? { text: segment, ...(italic ? { marks: ["i"] } : {}) }
      : { text: segment.text, script: segment.script, ...(italic ? { marks: ["i"] } : {}) },
  );
}

/** The result of walking one `\f`...`\f*` span. */
export interface FootnoteBuildResult {
  /** The footnote's own real, typed content and classification. */
  readonly footnote: Footnote;
  /**
   * The same `\fr`-excluded, sub-marker-stripped plain text
   * {@link classifyFootnote} classified — exposed so `segmentVerses.ts` can
   * feed the identical string into its own empty-verse fallback (the
   * handful of verses whose entire USFM content is one footnote, e.g. Luke
   * 17:36) without a second, separately-maintained extraction that could
   * drift from this one.
   */
  readonly plainText: string;
  /** The index of the first token after the matching `\f*` close — the caller resumes its own walk from here. */
  readonly nextIndex: number;
}

/**
 * Walks the token stream from `startIndex` (the token immediately after an
 * `\f` marker's own `open` token) through its matching `close` token,
 * building the footnote's real, typed content.
 *
 * @param canonBookIds - Passed straight through to
 *   `usfm/references.ts`'s `buildReferenceOnlyContent` for the rare,
 *   deuterocanon-only case where {@link classifyFootnote} finds this body
 *   is "nothing but a reference"; never observed to matter for any other
 *   classification, and harmless to pass for one that never reaches that
 *   branch.
 */
export function buildFootnoteContent(
  tokens: readonly Token[],
  startIndex: number,
  canonBookIds?: ReadonlySet<string>,
): FootnoteBuildResult {
  const pieces: InlineTextPiece[] = [];
  let classificationText = "";
  let currentSubMarker: string | undefined;
  let insideWh = false;
  let insideBk = false;
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.type === "close" && token.name === "f") {
      index++;
      break;
    }

    if (token.type === "marker" && (token.name === "fr" || KEPT_SUB_MARKERS.has(token.name))) {
      currentSubMarker = token.name;
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "wh") {
      insideWh = true;
      index++;
      continue;
    }
    if (token.type === "close" && token.name === "wh") {
      insideWh = false;
      index++;
      continue;
    }

    if (token.type === "open" && token.name === "bk") {
      insideBk = true;
      index++;
      continue;
    }
    if (token.type === "close" && token.name === "bk") {
      insideBk = false;
      index++;
      continue;
    }

    if (token.type === "text") {
      const keeping = currentSubMarker !== undefined && currentSubMarker !== "fr";
      if (keeping) {
        // Normalized once, right here, where this raw token's text first
        // becomes part of the footnote's own text representation — the
        // same normalized string then feeds both `classificationText`
        // (`plainText`, below) and `pieces` (the displayed `content`), so
        // neither can drift from the other. See `functions/normalizeFractions.ts`.
        const text = normalizeFractionText(token.text).value;
        classificationText += text;
        // `\bk`'s own italic mark applies independently of which
        // sub-marker is active — a real `\bk` citation always sits inside
        // plain `\ft` prose in this corpus, never inside `\fq`/`\fqa`, but
        // nothing here assumes that stays true.
        const italic = QUOTED_SUB_MARKERS.has(currentSubMarker as string) || insideBk;
        if (insideWh) {
          pieces.push({ text, script: "H", ...(italic ? { marks: ["i"] } : {}) });
        } else {
          pieces.push(...piecesForPlainText(text, italic));
        }
      }
      index++;
      continue;
    }

    // Any other token (an unrelated open/close pair, an unpaired marker not
    // in the kept set) carries no text of its own to accumulate — skip it
    // and keep walking. Not observed inside a footnote body anywhere in the
    // in-scope corpus, but harmless either way: nothing here assumes one
    // exists, and nothing breaks if one does.
    index++;
  }

  // Capitalized once, right here, on the built `pieces` — deliberately not
  // on `classificationText` above: `classifyFootnote`'s own patterns are
  // already case-insensitive (a documented safety margin, not a live fix to
  // an active bug — see `footnoteTypeRules.ts`), so it must keep seeing the
  // raw, un-recapitalized body.
  const firstPiece = pieces[0];
  if (firstPiece !== undefined && firstPiece.text !== undefined) {
    pieces[0] = { ...firstPiece, text: capitalizeFootnoteOpening(firstPiece.text) };
  }

  const type = classifyFootnote(classificationText);
  // A body classified xrf (nothing but a reference — classifyFootnote's own
  // doc comment defines the test) has no other real content to run-build,
  // so it resolves the same way an `\x`-sourced target already does, rather
  // than falling through to the plain, run-built path below. That path
  // still makes its own pass at finding a reference sitting inside
  // otherwise-ordinary prose (`linkEmbeddedReferences`; e.g. 1 Maccabees
  // 1:14's "See 2 Maccabees 4:9, 12.").
  const content: Content =
    type === "xrf"
      ? buildReferenceOnlyContent(classificationText, canonBookIds)
      : linkEmbeddedReferences(collapseContentNodes(buildRunNodes(pieces)));

  return { footnote: { type, content }, plainText: classificationText, nextIndex: index };
}

/** The result of walking one `\ip` block's own text. */
export interface IntroParagraphFootnoteResult {
  /** The block's own real, typed content and classification — the same shape a real `\f`...`\f*` footnote produces. */
  readonly footnote: Footnote;
  /** The index of the marker that ended this block — never consumed; the caller resumes its own dispatch from here, the same "next marker of any kind" stopping rule `usfm/headings.ts`'s `buildHeadingSpanContent` uses for its own unpaired-marker spans. */
  readonly nextIndex: number;
}

/**
 * Builds one `\ip` ("introductory paragraph," a deuterocanon book's own
 * front-matter editorial blurb or, for Sirach's second block, the real
 * ancient Prologue) block into a footnote: every `\ip` this corpus carries
 * becomes a footnote on that book's own verse 1:1, attached to a textless
 * leading node (`usfm/segmentVerses.ts`'s own `\ip` branch and end-of-book
 * post-pass do the attaching; this function only builds the footnote
 * itself).
 *
 * `\ip` is unpaired (no `\ip*`) and, like `\d`/`\sp`/`\s1`, its own span
 * ends at the next marker of any kind. Unlike those constructs, a real `\ip`
 * block carries none of `\f`'s own `\fr`/`\ft`/`\fq`/`\fqa` sub-marker
 * grammar — it is bare prose, often wrapping a `\bk` book-title citation —
 * so `buildFootnoteContent`'s own sub-marker-aware walk has nothing to set
 * `currentSubMarker` from and would keep none of a real `\ip` block's own
 * text. Rather than fork a second, parallel body-builder, this function
 * finds the block's own real boundary itself, then wraps that exact token
 * range in a synthetic `\ft` marker and a synthetic `\f*` close and hands
 * the whole thing to `buildFootnoteContent` unmodified — literal reuse of
 * its body-building and classification logic, including its own
 * `\bk`-inside-a-kept-sub-marker handling, rather than a second copy of it
 * here.
 */
export function buildIntroParagraphFootnote(
  tokens: readonly Token[],
  startIndex: number,
  canonBookIds?: ReadonlySet<string>,
): IntroParagraphFootnoteResult {
  let index = startIndex;
  while (index < tokens.length && tokens[index].type !== "marker") index++;

  const wrapped: Token[] = [
    { type: "marker", name: "ft" },
    ...tokens.slice(startIndex, index),
    { type: "close", name: "f", nested: false },
  ];
  const { footnote } = buildFootnoteContent(wrapped, 0, canonBookIds);

  return { footnote, nextIndex: index };
}
