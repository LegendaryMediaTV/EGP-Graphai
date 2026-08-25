/**
 * Footnote-body assembly: given the token stream right after an `\f` marker
 * has opened, consumes tokens through the matching `\f*` close and produces
 * one real, typed `Footnote` — reusing `usfm/inlineMarks.ts`'s run-building
 * machinery rather than forking a second one (`imports/guide.md` §6:
 * "footnote bodies are their own little documents... reuse the same
 * run-building machinery"), and classifying the result through
 * `usfm/footnoteTypeRules.ts`'s shared table.
 *
 * Sub-marker handling, per USFM's own footnote grammar:
 *
 * - `\fr` (the reference-label sub-marker, e.g. "17:27") is dropped
 *   entirely — structural attachment position already encodes which run a
 *   note belongs to.
 * - `\ft`/`\fq`/`\fqa` combine into one body. `\fq`/`\fqa` (footnote
 *   quotation / footnote quotation alternate — USFM's own convention for
 *   the specific word or alternate reading a note is discussing, always
 *   rendered in italics in print) get `marks: ["i"]`; `\ft` (the connecting
 *   prose) does not. Confirmed against the real in-scope corpus, not
 *   assumed from the USFM spec alone: 2 Chronicles 36:2's `\fqa Joahaz
 *   \ft is a variant of \fqa Jehoahaz\ft .` alternates `\fqa`-wrapped
 *   proper names against `\ft`-wrapped connecting prose inside one
 *   sentence, and Mark 16:8's `\fqa` wraps an entire quoted
 *   alternate-ending passage.
 * - `\+wh`...`\+wh*` (a nested Hebrew-word-quotation marker, always found
 *   inside `\ft`/`\fq` prose) becomes `{text, script: "H"}` directly — the
 *   delimiter already marks the boundary, so no character-range scan is
 *   needed. A bare, undelimited Greek word has no such delimiter to lean
 *   on and is found by `usfm/splitScriptRuns.ts`'s own
 *   character-range scan instead — both call the same underlying
 *   Hebrew/Greek tagging convention, just via two different discovery
 *   mechanisms.
 * - `\bk`...`\bk*` (and its `+`-nested form, `\+bk`...`\+bk*`, required
 *   wherever a citation sits inside an already-open paired marker — Daniel-
 *   Greek's own 3 real footnotes) — USFM's own "quoted book title"
 *   character style — gets `marks: ["i"]`, the same mark `\fq`/`\fqa`
 *   already use, per the user's own call: the bold+italic rendering
 *   ebible.org's HTML shows for this construct is that renderer's own
 *   presentational choice, not something `\bk`'s own semantics require, so
 *   this reuses the pipeline's existing italic mark rather than adding a
 *   new one.
 * - Zero `\w`/`\+w` (Strong's-tagged word) tokens ever occur inside a
 *   footnote body anywhere in the in-scope corpus, so this builder never
 *   has to decide how a `strong` attribute interacts with `script`/
 *   quotation marks; if a future source ever did carry one,
 *   `buildRunNodes`'s own Strong's-attachment machinery would simply see
 *   a `strong`-bearing piece like any other, unmodified by anything here.
 */

import Content from "../../types/Content";
import Footnote from "../../types/Footnote";
import { classifyFootnote, WITNESS_SIGLA_NAMES } from "./footnoteTypeRules";
import { normalizeFractionText } from "./fractions";
import { buildRunNodes, collapseContentNodes, InlineTextPiece } from "./inlineMarks";
import { buildReferenceOnlyContent, linkEmbeddedReferences } from "./references";
import { splitScriptRuns } from "./splitScriptRuns";
import { Token } from "./tokenize";

/**
 * WEB's own recurring `or, <alternate>` house style
 * (`footnoteTypeRules.ts`'s own `/^Or,?\s/i` pattern documents the identical
 * convention for classification) stays lowercase — the one, 100%-consistent
 * exception to "a footnote's own displayed text starts with a capital
 * letter," confirmed directly against upstream `HEAD`'s real 181
 * `or,`-opening bodies with zero counterexamples. `or` followed by anything
 * but a comma still capitalizes (Leviticus 11:5's real "Or rock badger, or
 * cony", 1 Corinthians 12:2's real "Or Gentiles").
 */
const LOWERCASE_OR_EXCEPTION = /^or,/i;

/**
 * WEB's own three self-documented witness sigla
 * ({@link WITNESS_SIGLA_NAMES}), anchored to a footnote body's own leading
 * word — recapitalizes the *whole* abbreviation, not merely its own first
 * letter, so the corpus's one real source-side casing slip (Acts 4:27's "nu
 * adds...", against 200+ already-upper-case occurrences) comes out matching
 * upstream `HEAD`'s real "NU adds...", not the "Nu adds..." a bare
 * first-letter rule would produce.
 */
const LEADING_WITNESS_SIGLON = new RegExp(`^(?:${WITNESS_SIGLA_NAMES})\\b`, "i");

/**
 * Capitalizes a footnote body's own leading character, matching upstream
 * `HEAD`'s real, measured convention: 27 real regressions (`HEAD` already
 * had them capitalized) plus a 42-case backlog with no textual signal of
 * its own tying them together, capitalized the same way — neither shows the
 * kind of clean, repeatable signal that justifies the `or,` exception.
 * Leaves `text` untouched when its own first character isn't an ASCII
 * lowercase letter at all — already capitalized, a digit, punctuation, or a
 * script-tagged Hebrew/Greek word, none of which this rule has anything to
 * say about.
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
 * `\fl` — a footnote label (`Greek`, `Hebrew`, `Or,`, `Note:`,
 * `i.e.`), absent from the 66-book canonical corpus but present 33 times in
 * Esther-Greek — belongs in this set: without it, an unrecognized `\fl`
 * token falls through to the generic "skip and keep walking" branch below
 * *without* updating {@link buildFootnoteContent}'s own `currentSubMarker`,
 * so the label's own text (and whatever `\ft`/`\fq` follows it, if `\fl`
 * sits directly after `\fr`) gets evaluated against whichever sub-marker
 * was active *before* `\fl` — usually `"fr"`, so it's dropped as if part of
 * the already-discarded reference label. Concretely: `\f + \fr 1:11 \fl
 * Greek \ft to make her queen.\f*` would lose the word "Greek" entirely,
 * and `footnoteTypeRules.ts`'s own `TRANSLATION_ALTERNATIVE_PATTERNS` —
 * already anchored at the body's own start for the spelled-out
 * `Greek:`/`Greek ` opener — would have nothing to anchor to, wrongly
 * falling to the default `stu` instead of the correct `trn`.
 */
const KEPT_SUB_MARKERS = new Set(["ft", "fq", "fqa", "fl"]);

/**
 * Splits `text` for the footnote-body walk's own bare-Greek detection,
 * tagging `marks: ["i"]` too when `italic` is set (an `\fq`/`\fqa` run that
 * also happens to carry a bare Greek word — not observed anywhere in this
 * corpus, but the two concerns are independent, so both apply together
 * without either one silently overriding the other).
 */
function piecesForPlainText(text: string, italic: boolean): InlineTextPiece[] {
  const split = splitScriptRuns(text, "G");
  if (typeof split === "string") {
    return [{ text: split, ...(italic ? { marks: ["i"] } : {}) }];
  }
  return split.map((segment) =>
    typeof segment === "string"
      ? { text: segment, ...(italic ? { marks: ["i"] } : {}) }
      : { text: segment.text, script: "G" as const, ...(italic ? { marks: ["i"] } : {}) },
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
 *   `usfm/references.ts`'s `buildReferenceOnlyContent` for the rare (9 real,
 *   deuterocanon-only instances) case where
 *   {@link classifyFootnote} finds this body is "nothing but a reference";
 *   never observed to matter for any other classification, and harmless to
 *   pass for one that never reaches that branch.
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
        // neither can drift from the other. See `utils/usfm/fractions.ts`.
        const text = normalizeFractionText(token.text).value;
        classificationText += text;
        // `\bk`'s own italic mark applies independently of which
        // sub-marker is active — a real `\bk` citation sits inside plain
        // `\ft` prose in every real in-scope instance (both the
        // deuterocanon `\ip` wrapping's own synthetic `\ft` and Daniel-
        // Greek's real `\ft` bodies), never inside `\fq`/`\fqa`, but
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
  // guide §6's own `xrf` test ("nothing but a reference," `classifyFootnote`
  // — see its own doc comment) means there is no other real content in this
  // body to run-build: resolve it the identical way an `\x`-sourced target
  // already is (real only in the deuterocanon corpus, never the 66-book
  // canonical one), rather than falling through to the plain, run-built
  // path below. That other path still gets its own pass at finding a real
  // reference — not a whole body's worth this time, but one sitting inside
  // otherwise-ordinary prose (Finding 9's `linkEmbeddedReferences`, e.g. 1
  // Maccabees 1:14's real "See 2 Maccabees 4:9, 12.").
  const content: Content =
    type === "xrf"
      ? buildReferenceOnlyContent(classificationText, canonBookIds)
      : linkEmbeddedReferences(collapseContentNodes(buildRunNodes(pieces)), canonBookIds);

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
 * ends at the next marker of any kind. Unlike those constructs, though, a
 * real `\ip` block carries none of `\f`'s own `\fr`/`\ft`/`\fq`/`\fqa`
 * sub-marker grammar — every one of the 16 real in-scope instances is bare
 * prose, most wrapping a `\bk` book-title citation (Tobit's own "Tobit," 17
 * real spans across 13 deuterocanon books corpus-wide — not
 * `43-ESGeng-web.usfm`, this doc comment's own earlier claim: the real,
 * current raw source carries no `\bk` there at all, confirmed directly
 * rather than assumed when Finding 6 landed) — so `buildFootnoteContent`'s
 * own sub-marker-aware walk has nothing to set `currentSubMarker` from and
 * would keep none of a real `\ip` block's own text. Rather than fork a
 * second, parallel body-builder, this function finds the block's own real
 * boundary itself, then wraps that exact token range in a synthetic `\ft`
 * marker and a synthetic `\f*` close and hands the whole thing to
 * `buildFootnoteContent` unmodified — literal reuse of its own body-building
 * and classification logic, including its own `\bk`-inside-a-kept-sub-marker
 * handling (Finding 6), rather than a second copy of it here.
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
