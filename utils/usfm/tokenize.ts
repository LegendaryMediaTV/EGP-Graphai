/**
 * The linear USFM tokenizer.
 *
 * USFM mixes unpaired markers with no closing tag at all (`\v`, `\c`, `\p`,
 * `\q1`, ...) and paired character-style markers with an explicit `\name*`
 * close (`\w`...`\w*`, `\f`...`\f*`, ...) in the same character stream. A
 * tree-builder has nowhere consistent to put the unpaired ones — they are
 * pure position markers, not containers — so this tokenizer never builds a
 * tree at all: it emits one flat, source-ordered sequence of tokens and
 * leaves each later construct's own segmenter to decide what "boundary"
 * means for its own case.
 *
 * A character marker cannot nest inside itself without a `+` prefix, so a
 * Strong's-tagged word inside a Words-of-Christ span is written `\+w`/`\+w*`
 * rather than `\w`/`\w*`. `tokenize()` folds this in rather than leaving it
 * to every caller: `\name` and `\+name` both produce `name` with no leading
 * `+`, carrying a `nested` flag for a caller that cares, so nothing that
 * only checks `name` has to.
 *
 * USFM also requires exactly one literal space between a marker and the
 * content that follows it (`\v 1 text`, `\w word|attrs\w*`) — a syntax
 * delimiter, not part of the rendered text. This tokenizer strips that one
 * space after every marker/open tag (and after a numbered marker's own
 * argument), but never after a *close* tag: the space between `\w*` and the
 * next `\w` is the real inter-word gap, and must survive into the text
 * stream for a later construct's own spacing convention to work with.
 */

export interface TextToken {
  /** Discriminates this token as a plain text run. */
  readonly type: "text";
  /** The literal text between two markers. */
  readonly text: string;
}

/** An unpaired marker with no closing tag — a pure position/boundary token. */
export interface MarkerToken {
  /** Discriminates this token as an unpaired, no-close marker. */
  readonly type: "marker";
  /** The marker's own name, without its leading backslash (e.g. `"v"`). */
  readonly name: string;
  /** The marker's own numeric argument; populated only for `\v`/`\c`, whose argument is fixed by USFM's own grammar. */
  readonly value?: string;
}

/** The opening half of a paired character-style marker. */
export interface OpenToken {
  /** Discriminates this token as the opening half of a paired marker. */
  readonly type: "open";
  /** The marker's own name, without its leading backslash or `+` prefix (e.g. `"w"`). */
  readonly name: string;
  /** Whether the source wrote this marker in its `+`-nested form (`\+w` rather than `\w`). */
  readonly nested: boolean;
}

/** The closing half of a paired character-style marker. */
export interface CloseToken {
  /** Discriminates this token as the closing half of a paired marker. */
  readonly type: "close";
  /** The marker's own name, matching the {@link OpenToken} it closes. */
  readonly name: string;
  /** Whether the source wrote this marker in its `+`-nested form (`\+w*` rather than `\w*`). */
  readonly nested: boolean;
  /** Any `|attr="value"` pair(s) USFM's own attribute syntax attaches immediately before this close (e.g. `\w`'s `strong="H1234"`). */
  readonly attributes?: Readonly<Record<string, string>>;
}

export type Token = TextToken | MarkerToken | OpenToken | CloseToken;

/**
 * Marker names that close with an explicit `\name*` — every other
 * backslash marker this tokenizer's supported corpus uses is unpaired.
 *
 * `add` — USFM's own standard "translator-supplied words" character
 * marker (the KJV-tradition italics convention for words with no
 * equivalent in the source language) — joined ASV1901's own real Genesis
 * 1:11 ("`...seed, \add and\add* fruit-trees...`", 4,316 real pairs
 * corpus-wide) once this importer's own generality test ran a second real
 * source through it; WEB's own corpus carries zero, so this was never
 * exercised until then. `imports/kjv/kjvContent.ts:195`'s own
 * already-shipped `add: "i"` mapping for KJV1769's HTML-sourced equivalent
 * construct is the cross-version confirmation this is USFM/repo
 * convention, not a guess.
 */
const PAIRED_MARKER_NAMES = new Set(["w", "wh", "wj", "f", "x", "bk", "qs", "add"]);

/** Unpaired markers whose own USFM definition carries a numeric argument immediately after the marker, before any prose. */
const NUMBERED_MARKERS = new Set(["v", "c"]);

/** Matches one backslash marker — capture 1 is the `+`-nesting prefix, capture 2 is the marker name, capture 3 is the `*` close suffix. */
const MARKER_PATTERN = /\\(\+)?([A-Za-z][A-Za-z0-9]*)(\*)?/g;

/** Matches one `|key="value"` attribute pair, per USFM 3.0's own attribute syntax. */
const ATTRIBUTE_PATTERN = /\|([a-zA-Z]+)="([^"]*)"/g;

/**
 * Splits `text` into a plain leading portion and any `|attr="value"` pairs
 * trailing it, per USFM 3.0's own attribute syntax. Returns `attributes:
 * undefined` when `text` carries no pipe at all, so a close token with
 * nothing to attach stays free of an empty object.
 */
function splitAttributes(text: string): { text: string; attributes?: Record<string, string> } {
  const pipeIndex = text.indexOf("|");
  if (pipeIndex === -1) return { text };

  const attributes: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(text.slice(pipeIndex))) !== null) {
    attributes[match[1]] = match[2];
  }
  return { text: text.slice(0, pipeIndex), attributes };
}

/**
 * Tokenizes one raw USFM string into a flat, source-ordered token sequence.
 *
 * @throws When a marker not in {@link PAIRED_MARKER_NAMES} appears in its
 *   own closing form (`\name*`) — every marker this tokenizer's supported
 *   corpus produces is either a registered pair or genuinely unpaired, so
 *   an unregistered close means a real grammar gap, not something to guess
 *   past.
 * @throws When `\v`/`\c` carries no numeric argument — both are fixed parts
 *   of the USFM grammar itself, not something this importer can proceed
 *   without.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  /** Appends `text` as a token, skipping the empty runs that fall between two adjacent markers. */
  const pushText = (text: string): void => {
    if (text.length > 0) tokens.push({ type: "text", text });
  };

  /** Consumes the single mandatory separator space USFM's own grammar requires between a marker (or a numbered marker's own argument) and the content that follows — never meaningful content of its own. */
  const skipSeparator = (): void => {
    if (source[cursor] === " ") cursor++;
  };

  for (const match of source.matchAll(MARKER_PATTERN)) {
    pushText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const nested = match[1] !== undefined;
    const name = match[2];
    const closing = match[3] !== undefined;

    if (PAIRED_MARKER_NAMES.has(name)) {
      if (!closing) {
        tokens.push({ type: "open", name, nested });
        skipSeparator();
        continue;
      }

      const previous = tokens[tokens.length - 1];
      if (previous?.type !== "text") {
        tokens.push({ type: "close", name, nested });
        continue;
      }
      const { text, attributes } = splitAttributes(previous.text);
      if (text.length > 0) tokens[tokens.length - 1] = { type: "text", text };
      else tokens.pop();
      tokens.push(
        attributes !== undefined
          ? { type: "close", name, nested, attributes }
          : { type: "close", name, nested },
      );
      continue;
    }

    if (closing) {
      throw new Error(
        `Unexpected closing marker \\${name}* — \\${name} is not a registered paired marker.`,
      );
    }

    if (NUMBERED_MARKERS.has(name)) {
      const numberMatch = /^\s*(\d+)/.exec(source.slice(cursor));
      if (numberMatch === null) {
        throw new Error(`\\${name} with no numeric argument at position ${match.index}`);
      }
      cursor += numberMatch[0].length;
      tokens.push({ type: "marker", name, value: numberMatch[1] });
      skipSeparator();
      continue;
    }

    tokens.push({ type: "marker", name });
    skipSeparator();
  }

  pushText(source.slice(cursor));
  return tokens;
}
