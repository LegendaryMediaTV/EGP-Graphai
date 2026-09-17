/**
 * A verse as the ordered words it prints, which is the one thing the corpus
 * walk next door cannot say.
 *
 * `corpusMorphology.ts` hands its visitor a spelling list and one code, and
 * that is the right shape for the question it asks — every code the map must
 * account for, one at a time. But a Greek article agrees with its noun in case,
 * number and gender, and agreement is a fact about two words standing next to
 * each other. The sequence is discarded before that walk's visitor ever sees
 * it, so a pair disagreeing with each other, each individually resolvable,
 * passes silently. Nothing here replaces that walk; this is the same corpus read
 * a second way, for the questions that need a neighbour.
 *
 * **A word is one token, however many parses the corpus asserts about it.** The
 * corpus records a second reading of a word as a text-less node carrying only
 * `morph`, immediately after the word — BYZ2026 does it 27 times, LXX1935 never.
 * Read as a word of its own, JAS 4:5's `τὸ` becomes two tokens with nothing
 * printed between them and the noun after it is nobody's neighbour. So a
 * text-less code joins the token before it as a second reading, and a caller
 * asking whether two tokens agree asks whether **any** parse of one matches
 * **any** parse of the other.
 *
 * **A word carrying no code is still a word.** LXX1935 nodes in quantity print
 * a word and tag it with nothing, and dropping them would make the words either
 * side of one look adjacent. They arrive with no readings, which is exactly what
 * separates two neighbours without claiming anything about the word between.
 *
 * **A footnote is apparatus, not text.** Its own words are not the verse's, and
 * a marker standing between two words does not separate them — JAS 4:5 prints
 * one between `ὃ` and `κατῴκησεν`. So a footnote is neither walked into nor
 * counted as something in between.
 */

import fs from "fs";
import path from "path";
import Content from "../types/Content";
import { Scheme, decodeMorph, readScheme } from "./morphology";
import { CodexEntry, entriesFor, lexicalMapLanguages } from "./lexicon";
import { spellingsOf } from "./punctuation";

/** Directory holding one subdirectory per Bible version. */
const bibleVersionsDir = "./bible-versions";

/** One parse the corpus asserts about a printed word. */
export interface TokenReading {
  /** The code exactly as the corpus writes it, e.g. `"T-NSN"`. */
  morph: string;
  /** The registry codes it states, or null when the scheme cannot read it. */
  parse: string[] | null;
  /** The Strong's number on the node carrying this code, when it carries one. */
  strong?: string;
}

/** One printed word, with every parse the corpus states about it. */
export interface CorpusToken {
  /** The node's printed text, spaces and punctuation and all. */
  text: string;
  /** The keys the word could be looked up under, most literal first. */
  spellings: string[];
  /** Every parse asserted, the word's own first and its text-less seconds after. */
  readings: TokenReading[];
}

/** One verse, walked. */
export interface CorpusVerse {
  /** Directory under `bible-versions` the verse was read from. */
  version: string;
  /** Book file, e.g. `"01-MAT.json"`. */
  file: string;
  /** Repo book id, e.g. `"MAT"`. */
  book: string;
  /** Chapter the verse sits in. */
  chapter: number;
  /** The verse number. */
  verse: number;
  /**
   * The verse's printed word sequences, each in document order. One per block
   * the verse prints separately, because a heading's last word is not the
   * neighbour of the body's first. Almost every verse has exactly one; LXX1935
   * carries 55 headings and subtitles that do not.
   */
  sequences: CorpusToken[][];
}

/** Schemes by version directory, so a walk parses each scheme file once. */
const declared = new Map<string, { id: string; scheme: Scheme } | null>();

/**
 * The morphology scheme a version declares, or null when it declares none and
 * when it declares one no file on disk defines.
 *
 * Both answers are the same answer here — nothing to decode, so nothing to
 * check — and the second is already a loud finding of its own in
 * `auditCorpusMorphology`, which is where a caller is told the id names no
 * scheme. Repeating it would be two reports of one fault.
 *
 * @param version Directory under `bible-versions`, e.g. `"BYZ2026"`.
 */
export function declaredScheme(
  version: string,
): { id: string; scheme: Scheme } | null {
  const cached = declared.get(version);
  if (cached !== undefined) return cached;

  const versionFile = path.join(bibleVersionsDir, version, "_version.json");
  const id = fs.existsSync(versionFile)
    ? (JSON.parse(fs.readFileSync(versionFile, "utf-8")).morphology ?? null)
    : null;
  const scheme = id
    ? lexicalMapLanguages().reduce<Scheme | null>(
        (found, language) => found ?? readScheme(language, id),
        null,
      )
    : null;

  const answer = id && scheme ? { id, scheme } : null;
  declared.set(version, answer);
  return answer;
}

/**
 * One verse's content as its printed word sequences.
 *
 * Pure, and the whole of this module's judgment: what counts as a word, what
 * joins the word before it, and what is printed somewhere else. See the module
 * comment for each of the three.
 *
 * @param content A verse's content tree.
 * @param scheme The scheme the version writes its codes in.
 */
export function verseSequences(
  content: Content,
  scheme: Scheme,
): CorpusToken[][] {
  const sequences: CorpusToken[][] = [];
  appendSequence(content, scheme, sequences);
  return sequences.filter((tokens) => tokens.length > 0);
}

/** Walk one separately-printed block into a sequence of its own. */
function appendSequence(
  nodes: unknown,
  scheme: Scheme,
  sequences: CorpusToken[][],
): void {
  if (!Array.isArray(nodes)) return;
  const tokens: CorpusToken[] = [];
  sequences.push(tokens);
  walk(nodes, scheme, tokens, sequences);
}

/** Fill one sequence, sending separately-printed blocks off into their own. */
function walk(
  nodes: unknown[],
  scheme: Scheme,
  tokens: CorpusToken[],
  sequences: CorpusToken[][],
): void {
  for (const node of nodes as any[]) {
    if (node === null || typeof node !== "object") continue;

    if (node.heading) appendSequence(node.heading, scheme, sequences);
    if (node.subtitle) appendSequence(node.subtitle, scheme, sequences);
    if (node.paragraph !== undefined && typeof node.paragraph !== "boolean") {
      appendSequence(node.paragraph, scheme, sequences);
    }

    // A wrapper sharing one property over several texts prints its words in
    // the flow, so they belong to the sequence being filled rather than to one
    // of their own.
    if (Array.isArray(node.content)) {
      walk(node.content, scheme, tokens, sequences);
      continue;
    }

    const morph = typeof node.morph === "string" ? node.morph : undefined;
    if (morph === undefined && typeof node.text !== "string") continue;

    const reading: TokenReading | undefined =
      morph === undefined
        ? undefined
        : {
            morph,
            parse: decodeMorph(morph, scheme),
            ...(typeof node.strong === "string" ? { strong: node.strong } : {}),
          };

    // A tagged node with no text is a second reading of the word before it, so
    // it joins that word rather than standing between it and the next.
    if (typeof node.text !== "string") {
      const last = tokens[tokens.length - 1];
      if (reading && last) last.readings.push(reading);
      continue;
    }

    const spellings = spellingsOf(node.text).filter(Boolean);
    if (!spellings.length) continue;
    tokens.push({
      text: node.text,
      spellings,
      readings: reading ? [reading] : [],
    });
  }
}

/**
 * What the codex holds for one printed token, under the most literal of its
 * spellings that answers.
 *
 * The first that answers wins, never the union: merging what two spellings of
 * one word answer with would manufacture an ambiguity the text does not have.
 * `μεθ’` is a spelling the map keys with its elision mark, and the bare `μεθ`
 * offered beside it is there for a corpus that dropped the mark — reading both
 * would hand a caller cells of a word the page did not print. `resolveLemma`
 * narrows the same way and for the same reason.
 *
 * @param token One token from {@link verseSequences}.
 */
export function cellsFor(token: CorpusToken): CodexEntry[] {
  for (const spelling of token.spellings) {
    const entries = entriesFor(spelling);
    if (entries.length) return entries;
  }
  return [];
}

/**
 * Every verse of one version, walked, or nothing at all for a version whose
 * codes nothing can read.
 *
 * A generator rather than an array: LXX1935 alone prints hundreds of thousands
 * of words, and a
 * caller that only ever looks at one verse at a time should not hold the corpus
 * in memory to do it.
 *
 * @param version Directory under `bible-versions`, e.g. `"LXX1935"`.
 */
export function* corpusVerses(version: string): Generator<CorpusVerse> {
  const scheme = declaredScheme(version)?.scheme;
  if (!scheme) return;

  const dir = path.join(bibleVersionsDir, version);
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "_version.json")) {
    const records = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    if (!Array.isArray(records)) continue;

    for (const record of records) {
      yield {
        version,
        file,
        book: record.book,
        chapter: record.chapter,
        verse: record.verse,
        sequences: verseSequences(record.content, scheme),
      };
    }
  }
}
