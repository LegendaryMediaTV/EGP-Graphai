/**
 * What the lexical map knows about a printed token.
 *
 * A consumer holding a word off a page has two questions the map can answer:
 * how does this romanize, and what does the codex hold for it. One module
 * owning both is what keeps the corpus and the codex saying the same thing
 * about the same word, structurally rather than by hand.
 *
 * **The codex is never consulted for a transliteration.** It stores one against
 * each spelling, and reaching for it is the obvious shortcut and the wrong
 * answer: {@link codexLookup} folds initial case away and reads a grave as its
 * acute, so printed `Δαυὶδ` keys as `δαυίδ` and comes back *dauíd* where the
 * page wants *Dauìd*. The value is recomputed from the registry's table every
 * time, so a word the codex has never heard of transliterates exactly as well
 * as one it holds.
 *
 * **Two caches, not one.** A registry is a few kilobytes; the codex is megabytes
 * across a file per initial letter, and indexing it is measurable. Indexing it lazily and separately
 * means a pass that only transliterates never pays for it, and one that
 * resolves lemmas pays once per process rather than once per book.
 */

import fs from "fs";
import path from "path";
import { accountsFor, decodeMorph, readScheme } from "./morphology";
import { spellingsOf, tokensOf } from "./punctuation";

/** Directory holding one subdirectory per language codex. */
const lexicalMapsDir = "./lexical-maps";

/**
 * The combining grave and the combining acute, the pair the fold rewrites.
 *
 * Every combining mark in this file is an escape. Pasted as a literal it is
 * invisible in an editor and in a diff, and it lands on whichever character
 * precedes it, which in source is a quote.
 */
const GRAVE = "\u0300";
const ACUTE = "\u0301";

/** Every combining mark, plus the iota subscript, for the accent-blind fold. */
const COMBINING = /[\u0300-\u036F\u0345]/g;

/** Combining marks a transliteration keeps, and what each becomes. */
const MARKS: Record<string, string> = {
  "\u0301": "\u0301", // acute
  "\u0300": "\u0300", // grave
  "\u0342": "\u0302", // perispomeni becomes a plain circumflex
  "\u0308": "\u0308", // diaeresis
  "\u0345": "", // iota subscript
};
/** Rough breathing, which aspirates the syllable it sits on. */
const ROUGH = "\u0314";
/** Smooth breathing, which says only that there is no aspirate. */
const SMOOTH = "\u0313";

/**
 * Script-specific marks and the Latin ones they read as.
 *
 * Written as escapes on purpose: the ano teleia looks exactly like a middle dot
 * and the Greek question mark exactly like a semicolon, and
 * {@link transliterate} ends in an NFC normalization that turns U+0387 into
 * U+00B7, so a table written with pasted literals can be silently dead. Marks
 * not named here stand as printed, which is the right answer for everything
 * from a comma to LXX's editorial brackets.
 */
const SCRIPT_MARKS: Record<string, string> = {
  "\u0387": ";", // Greek ano teleia
  "\u037E": "?", // Greek question mark
};

/** The transliteration scheme a language registry declares, as its table. */
export interface TransliterationTable {
  /** Lower-case letter to its Latin form, which may be more than one letter. */
  letters: Record<string, string>;
  /** Vowel pairs read as one sound, which changes what an upsilon becomes. */
  diphthongs: string[];
  /** Letters a gamma reads as a nasal before. */
  velars: string[];
  /** What that nasal gamma becomes. */
  gammaNasal: string;
  /** What an upsilon becomes inside a diphthong. */
  upsilonInDiphthong: string;
  /** What a rough breathing becomes. */
  aspirate: string;
}

/** What the codex holds under one spelling, for one cell of one root. */
export interface CodexEntry {
  /**
   * Codex file the cell is written in, e.g. `"greek/chi.json"` — the same
   * naming `auditLexicalMaps` reports a finding under, so a caller holding an
   * entry can say where to go and correct it.
   */
  file: string;
  /**
   * The spelling as the codex writes it, which is **not** the key it was found
   * under ({@link codexLookup} folds the case and the accent). A caller
   * reporting a cell wants the written form, and nothing else can recover it
   * from the key.
   */
  spelling: string;
  /** Dictionary root the spelling inflects from, e.g. `"Χριστός"`. */
  root: string;
  /** The root's part of speech. */
  pos: string;
  /** The root's own Strong's numbers, as a list however the codex spells it. */
  rootStrongs: string[];
  /** The cell's parse codes, in the registry's own vocabulary. */
  cell: string[];
  /**
   * Strong's numbers the codex places on this cell in particular, always a
   * proper subset of {@link rootStrongs} — `auditLexicalMaps` rejects a cell
   * claiming its root's whole set. Empty for the great majority of cells.
   */
  cellStrongs: string[];
}

/** One placement rule from a `lexical-maps/<language>/indices/*.json` file. */
interface IndexRule {
  /** The index entry being placed, e.g. `"G2076"`. */
  n: string;
  /** The root whose cells the rule applies to. */
  root: string;
  /** Parse codes a cell must all carry to match, when the rule names any. */
  requires?: string[];
  /** A single spelling the cell must have, for rules narrower than a parse. */
  spelling?: string;
}

/**
 * What {@link resolveLemma} answers with: the lemma, or why it declined to name
 * one.
 *
 * Never `undefined`: a caller made to invent the reason is a caller whose
 * reasons go missing, and the reason is what the audit prints.
 */
export type LemmaResolution = { lemma: string } | { unresolved: string };

/** What {@link resolveStrongs} answers with, on the same terms. */
export type StrongsResolution = { strong: string } | { unresolved: string };

/** The registry facts this module needs, per language. */
interface LanguageFacts {
  /** The script code a version declares to mean this language, e.g. `"G"`. */
  script: string | null;
  /** The transliteration table, or null when the registry declares none. */
  transliteration: TransliterationTable | null;
  /** Inflection code to the category it belongs to, e.g. `nom` -> `case`. */
  categoryOf: Map<string, string>;
}

/** Registries, read once. Small, so every language is read together. */
let registries: Map<string, LanguageFacts> | null = null;
/** Inflection categories merged across languages, the shape `accountsFor` wants. */
let categories: Map<string, string> | null = null;
/** The codex index, built lazily because it is the expensive one. */
let codex: Map<string, CodexEntry[]> | null = null;
/** Every dictionary root to its own Strong's numbers; see {@link rootIndex}. */
let roots: Map<string, string[]> | null = null;
/** Strong's placement rules grouped by the root they apply to, read lazily. */
let placements: Map<string, IndexRule[]> | null = null;
/** Morphology schemes by declared id, so a scheme file is parsed once. */
const schemes = new Map<string, ReturnType<typeof readScheme>>();

/**
 * The language subdirectories under `lexical-maps`.
 *
 * Sorted, so a caller that reports per language reports in a stable order.
 */
export function lexicalMapLanguages(): string[] {
  if (!fs.existsSync(lexicalMapsDir)) return [];
  return fs
    .readdirSync(lexicalMapsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every language's registry facts, read on first use. */
function languageFacts(): Map<string, LanguageFacts> {
  if (registries) return registries;

  registries = new Map();
  for (const language of lexicalMapLanguages()) {
    const registryPath = path.join(lexicalMapsDir, language, "_language.json");
    if (!fs.existsSync(registryPath)) continue;
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));

    const categoryOf = new Map<string, string>();
    for (const entry of registry.inflections ?? [])
      categoryOf.set(entry._id, entry.category);

    // Missing any of the three the scheme is built from, a registry has no
    // usable table at all — better than a partial one every caller would then
    // have to guard against.
    const table = registry.transliteration;
    const transliteration: TransliterationTable | null =
      table?.letters && table?.diphthongs && table?.velars
        ? {
            letters: table.letters,
            diphthongs: table.diphthongs,
            velars: table.velars,
            gammaNasal: table.gammaNasal ?? "n",
            upsilonInDiphthong: table.upsilonInDiphthong ?? "u",
            aspirate: table.aspirate ?? "h",
          }
        : null;

    registries.set(language, {
      script: registry.script ?? null,
      transliteration,
      categoryOf,
    });
  }
  return registries;
}

/**
 * The language whose registry declares this script code, or null for one none
 * declares.
 *
 * The corpus tags a node `script: "G"` and the registry calls itself `greek`
 * and declares `"G"`, so the two sides are joined by the registry's own claim
 * rather than by a table written here. A Hebrew edition arriving with its own
 * registry needs no code change.
 *
 * @param script A content node's `script` value, e.g. `"G"`.
 */
export function languageForScript(script: string): string | null {
  for (const [language, facts] of languageFacts()) {
    if (facts.script === script) return language;
  }
  return null;
}

/**
 * One language's transliteration table, or null when its registry declares
 * none.
 *
 * @param language Subdirectory of `lexical-maps`, e.g. `"greek"`.
 */
export function transliterationTable(
  language: string,
): TransliterationTable | null {
  return languageFacts().get(language)?.transliteration ?? null;
}

/**
 * Inflection code to the category it belongs to, across every language.
 *
 * One map rather than one per language, because a caller holding a parse code
 * off a corpus does not know which codex it came from, and the codes do not
 * collide across languages.
 */
export function inflectionCategories(): Map<string, string> {
  if (categories) return categories;
  categories = new Map();
  for (const facts of languageFacts().values()) {
    for (const [code, category] of facts.categoryOf)
      categories.set(code, category);
  }
  return categories;
}

/**
 * A spelling with the two things about it that are not the word's own removed:
 * the grave accent, and the initial capital.
 *
 * A grave stands only where another word follows, and a capital at the head of
 * a sentence belongs to the sentence rather than to the word. Folding both away
 * is therefore what two printed spellings of one word have in common, and it is
 * computable from the printed token without knowing its root. `codex-schema.json`
 * states the rule in full.
 *
 * @param spelling One spelling, outer punctuation already off.
 */
export function codexLookup(spelling: string): string {
  return spelling
    .toLowerCase()
    .normalize("NFD")
    .split(GRAVE)
    .join(ACUTE)
    .normalize("NFC");
}

/**
 * Accents and the iota subscript away, for the fallback lookup.
 *
 * Blunter than {@link codexLookup} and used only when that finds nothing, for a
 * spelling the codex carries under some other accentuation.
 */
function fold(word: string): string {
  return word
    .normalize("NFD")
    .replace(COMBINING, "")
    .toLowerCase()
    .normalize("NFC");
}

/** The codex as spelling key to entries, built on first use. */
function codexIndex(): Map<string, CodexEntry[]> {
  if (codex) return codex;

  codex = new Map();
  roots = new Map();
  for (const language of lexicalMapLanguages()) {
    const dir = path.join(lexicalMapsDir, language);
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json") && name !== "_language.json");

    for (const name of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));
      for (const [root, entry] of Object.entries<any>(data)) {
        const rootStrongs = indexNumbers(entry.indices?.strongs);
        roots.set(root, rootStrongs);
        for (const [spelling, inflection] of Object.entries<any>(
          entry.inflections ?? {},
        )) {
          // Both keys, so a corpus printing a capital where a sentence starts
          // finds the key its root gave it, and a spelling the codex carries
          // under some other accentuation is still reachable.
          const keys = new Set([codexLookup(spelling), fold(spelling)]);
          for (const cell of inflection.cells ?? []) {
            const held: CodexEntry = {
              file: `${language}/${name}`,
              spelling,
              root,
              pos: entry.pos,
              rootStrongs,
              cell: cell.parse ?? [],
              cellStrongs: indexNumbers(cell.indices?.strongs),
            };
            for (const key of keys) {
              const bucket = codex.get(key);
              if (bucket) bucket.push(held);
              else codex.set(key, [held]);
            }
          }
        }
      }
    }
  }
  return codex;
}

/**
 * Every dictionary root to its own Strong's numbers, filled by the same walk
 * that indexes the spellings.
 *
 * Keyed by root rather than by spelling, which is what lets a caller holding a
 * lemma ask whether it is a root at all: an absent key means the codex has no
 * such root, a different answer from a root holding no number, and one a
 * spelling index cannot give.
 */
function rootIndex(): Map<string, string[]> {
  codexIndex();
  return roots!;
}

/**
 * Whether a lemma names a root the codex holds.
 *
 * Exact, with no accent-blind or case-blind fallback, because that is the test
 * {@link resolveStrongs} applies: a lemma that is not a root **exactly** can
 * never take a number, whatever else is true of it. So a corpus lemma failing
 * this is a word cut off from the map rather than a word the map disagrees
 * with, which is why it is worth a finding of its own.
 *
 * @param lemma A corpus node's own `lemma`.
 */
export function isRoot(lemma: string): boolean {
  return rootIndex().has(lemma);
}

/**
 * Strong's placement rules by root, from every `indices` file declaring itself
 * the `strongs` index.
 *
 * Selected by the file's own `_id` rather than by its name, which is what the
 * schema says the id is for. A rule exists because the corpus tags at the
 * lexical level while the index goes finer: every form of `εἰμί` arrives as
 * G1510, and the rules are what know that the third singular present is G2076.
 */
function strongsPlacements(): Map<string, IndexRule[]> {
  if (placements) return placements;

  placements = new Map();
  for (const language of lexicalMapLanguages()) {
    const dir = path.join(lexicalMapsDir, language, "indices");
    if (!fs.existsSync(dir)) continue;
    for (const name of fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json"))) {
      const index = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));
      if (index._id !== "strongs") continue;
      for (const rule of (index.rules ?? []) as IndexRule[]) {
        const bucket = placements.get(rule.root);
        if (bucket) bucket.push(rule);
        else placements.set(rule.root, [rule]);
      }
    }
  }
  return placements;
}

/**
 * One morphology scheme by the id a version declares, from whichever language
 * carries a scheme under that name, or null when none does.
 *
 * Cached by id rather than by language for the same reason
 * {@link inflectionCategories} merges: a caller holding a `morphology` value
 * off a version knows the id and not which codex defines it.
 */
function morphologyScheme(id: string): ReturnType<typeof readScheme> {
  const cached = schemes.get(id);
  if (cached !== undefined) return cached;

  const found = lexicalMapLanguages().reduce<ReturnType<typeof readScheme>>(
    (scheme, language) => scheme ?? readScheme(language, id),
    null,
  );
  schemes.set(id, found);
  return found;
}

/**
 * One `indices` value as a list, however the codex spells it.
 *
 * The codex writes a single number as a string and several as an array, on a
 * root and on a cell alike, so every reader of an index has to flatten the two
 * spellings into one.
 */
export function indexNumbers(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as string[]) : [String(value)];
}

/**
 * Everything the codex holds for one printed spelling, across every language.
 *
 * Tried under the codex's own key first and the accent-blind fold second, never
 * both: a spelling the codex holds as printed answers with what it holds, and
 * the fold is there for one it carries only under some other accentuation.
 *
 * One spelling can answer with entries from more than one root, which is the ambiguity a caller narrows with a parse or a Strong's number.
 *
 * @param spelling One printed spelling, outer punctuation already off.
 */
export function entriesFor(spelling: string): CodexEntry[] {
  const index = codexIndex();
  return index.get(codexLookup(spelling)) ?? index.get(fold(spelling)) ?? [];
}

/**
 * Capitalise a transliterated letter, which may be more than one character.
 *
 * Only the first: the Greek theta is *Th* and psi is *Ps*, never *TH* or *PS*.
 * That is the rule for a capital a single letter owns, whether a name's or the
 * one a sentence puts at its head, because the capital belongs to one Greek
 * letter and the digraph is how that one letter is spelled in Latin.
 *
 * That is half the rule; {@link transliterate} owns the word-level half.
 */
const titleCase = (latin: string) =>
  latin.charAt(0).toUpperCase() + latin.slice(1);

/**
 * The academic transliteration of one word, from the registry's own table.
 *
 * A reimplementation of the rule the codex was written with, on purpose: the
 * point of the audit's check is that the stored value is reproducible from the
 * registry alone, so a consumer that implements the table gets the same
 * answer. See the `transliteration` block in a language registry for the
 * table's own account of itself, including the iota subscript being the one
 * thing it cannot round-trip.
 *
 * **One word at a time.** A rough breathing on the second half of a diphthong
 * aspirates the whole diphthong, so the `h` moves to the front of the string
 * this was given — which is the front of the *word* only if the word is all it
 * was given. Hand it `" Οὗτος"` and it answers `"h Oûtos"`. Hand it a whole
 * clause and every word after the first is quietly wrong. Callers working from
 * printed text want {@link transliterateText}, which takes the string apart
 * first.
 *
 * **Case is read off the whole word.** A word of two or more letters, every one
 * of them a capital, is set in capitals and romanizes to capitals throughout:
 * `ΜΑΤΘΑΙΟΝ` is *MATTHAION*, not *MATThAION*. Anything else, a lone capital
 * included, capitalises letter by letter and keeps *Th*; see {@link titleCase}.
 */
export function transliterate(
  word: string,
  table: TransliterationTable,
): string {
  const diphthongs = new Set(table.diphthongs);
  const velars = new Set(table.velars);

  // `base` is lower-cased because the registry's table is keyed that way;
  // `capital` remembers what the text printed, so `Ζαβδος` does not come back
  // *zabdos*.
  const chars: { base: string; marks: string[]; capital: boolean }[] = [];
  for (const ch of word.normalize("NFD")) {
    if (ch in MARKS || ch === ROUGH || ch === SMOOTH) {
      if (chars.length) chars[chars.length - 1].marks.push(ch);
      continue;
    }
    const base = ch.toLowerCase();
    chars.push({ base, marks: [], capital: base !== ch });
  }

  // An uncased character — an elision mark, a numeral sign — says nothing
  // either way, so it neither makes a word all-capital nor stops one from
  // being.
  //
  // **Two letters, not one.** A one-letter word is capitals throughout the
  // moment it is capital at all, and the article and the relative stand alone
  // as words, so reading them that way answers *HO* and *HĒ* where the sentence
  // merely began in a capital, which the two corpora do in quantity.
  const cased = chars.filter((char) => char.base !== char.base.toUpperCase());
  const allCapitals = cased.length > 1 && cased.every((char) => char.capital);
  const capitalise = allCapitals
    ? (latin: string) => latin.toUpperCase()
    : titleCase;

  let out = "";
  let aspirated = false;
  chars.forEach((char, i) => {
    const previous = chars[i - 1];
    const next = chars[i + 1];
    let latin: string;

    if (char.base === "γ" && next && velars.has(next.base)) {
      latin = table.gammaNasal;
    } else if (
      char.base === "υ" &&
      previous &&
      diphthongs.has(previous.base + char.base)
    ) {
      latin = table.upsilonInDiphthong;
    } else {
      latin = table.letters[char.base] ?? char.base;
    }

    // A rough breathing aspirates the syllable it sits on. The aspirate and the
    // letter are then one Latin unit, so which part shows the capital falls out
    // of their order rather than out of a rule of its own.
    if (char.marks.includes(ROUGH)) {
      // A rho takes its aspirate after itself, so the rho keeps the capital
      // (`Ῥώμη` is *Rhṓmē*); a vowel's aspirate stands first and takes it
      // instead (`Ἅγιος` is *Hágios*, not *hÁgios*).
      if (char.base === "ρ")
        latin = char.capital
          ? capitalise(latin + table.aspirate)
          : latin + table.aspirate;
      else if (previous && diphthongs.has(previous.base + char.base))
        aspirated = true;
      else
        latin = char.capital
          ? capitalise(table.aspirate + latin)
          : table.aspirate + latin;
    } else if (char.capital) {
      latin = capitalise(latin);
    }

    out += latin + char.marks.map((m) => MARKS[m] ?? "").join("");
  });

  // A rough breathing on the second half of a diphthong prefixes the whole
  // diphthong, so the capital moves out to it: `Οὗτος` is *Hoûtos*.
  if (aspirated) {
    const capital = chars[0]?.capital;
    const prefixed =
      table.aspirate +
      (capital ? out.charAt(0).toLowerCase() + out.slice(1) : out);
    out = capital ? capitalise(prefixed) : prefixed;
  }
  return out.normalize("NFC");
}

/**
 * A printed string romanized: the whole contract a transliterated edition
 * needs, a printed string in and a printed string out.
 *
 * The string is taken apart into word and mark runs first, which is what keeps
 * both of this file's traps shut: {@link transliterate} sees one word at a
 * time, and the script marks never reach its NFC normalization. Mark runs go
 * through {@link SCRIPT_MARKS} character by character, so an ano teleia becomes
 * a semicolon and every other mark, digit and space stands as printed.
 *
 * Nothing is dropped and nothing is moved, so stitching these values together
 * yields what stitching the texts does.
 *
 * @param text A node's printed text, spaces and all.
 * @param script The node's `script` value, e.g. `"G"`.
 * @returns The romanized text, or null when no registry declares that script
 *   and so nothing can say how it romanizes.
 */
export function transliterateText(text: string, script: string): string | null {
  const language = languageForScript(script);
  const table = language === null ? null : transliterationTable(language);
  if (!table) return null;

  return tokensOf(text)
    .map((run) =>
      run.word
        ? transliterate(run.text, table)
        : [...run.text].map((mark) => SCRIPT_MARKS[mark] ?? mark).join(""),
    )
    .join("");
}

/**
 * The roots a set of entries names, each once, in a stable order.
 *
 * Sorted because the order is read aloud in an `ambiguous between …` reason,
 * and a reason that changes with the order the codex files happened to be read
 * in is a reason nobody can count.
 */
function distinctRoots(entries: CodexEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.root))].sort();
}

/**
 * Whether an entry could be the word the page printed, judging by case alone.
 *
 * Case is a fact about the word: a name keeps its capital in the middle of a
 * sentence, and the codex stores each root's spellings with the root's own
 * case. So a word printed in lower case is not the name that shares its
 * letters, and the capitalised entry is not a candidate for it.
 *
 * The other direction says nothing, which is why this asks one question rather
 * than comparing the two cases. A capital at the head of a sentence belongs to
 * the sentence: `Στέφανος` opening a verse is the man in some verses and a
 * crown in six others, and nothing about the capital tells them apart. So a
 * printed capital agrees with every entry, and only lower case rules one out.
 *
 * @param entry One entry the spelling reached.
 * @param printed The spelling as the page has it, outer punctuation already off.
 */
function spelledAsPrinted(entry: CodexEntry, printed: string): boolean {
  return capitalised(printed) || !capitalised(entry.spelling);
}

/**
 * Whether a spelling starts with a capital, read off the decomposed string.
 *
 * Decomposed, because a precomposed Greek capital carrying a breathing is a
 * single code point and testing it directly is a test of that one character;
 * NFD splits the letter from its marks, so the test is of the letter.
 */
function capitalised(spelling: string): boolean {
  return /^\p{Lu}/u.test(spelling.normalize("NFD"));
}

/**
 * Which dictionary root a printed word inflects from, or why the map cannot
 * say.
 *
 * The codex answers with every root that holds the spelling, and 1.3% of its
 * keys hold more than one, so the answer is a narrowing rather than a lookup.
 * The spelling narrows first, then the parse the node's own morphology code
 * states. Two clues are left after that and neither is worth more than the
 * other, so they are read together: the Strong's number the node carries, and
 * the case the page printed the word in. Where those two name different roots
 * the map reports the disagreement rather than answering, because a lemma the
 * caller cannot tell is wrong is worse than no lemma at all.
 *
 * What survives all of it and is still more than one root **is reported and
 * never guessed at** — across BYZ2026 that is a single node, a word two
 * dictionary entries genuinely share.
 *
 * A node holding two words is declined outright. There is no single lemma to
 * name, and the elision-and-bare pair {@link spellingsOf} hands back would
 * otherwise make a two-word node look like one long spelling the map does not
 * hold — a miss, reported for the wrong reason.
 *
 * @param word.text The node's printed text, spaces and punctuation and all
 * @param word.morph The node's own morphology code, e.g. `"N-GSM"`
 * @param word.morphology The scheme id the version declares, e.g. `"robinson"`
 * @param word.strong The node's own Strong's number, when it carries one
 */
export function resolveLemma(word: {
  text: string;
  morph: string;
  morphology?: string;
  strong?: string;
}): LemmaResolution {
  if (tokensOf(word.text).filter((run) => run.word).length !== 1) {
    return { unresolved: "more than one word, so no single lemma" };
  }

  // Most literal spelling first, and the first that answers wins. Merging what
  // two spellings of one word answer with would manufacture an ambiguity the
  // text does not have.
  let candidates: CodexEntry[] = [];
  let printed = "";
  for (const spelling of spellingsOf(word.text)) {
    if (!spelling) continue;
    candidates = entriesFor(spelling);
    if (candidates.length) {
      printed = spelling;
      break;
    }
  }
  if (!candidates.length)
    return { unresolved: "the map holds no such spelling" };

  if (distinctRoots(candidates).length === 1)
    return { lemma: candidates[0].root };

  const scheme = word.morphology ? morphologyScheme(word.morphology) : null;
  if (!scheme) {
    return {
      unresolved: word.morphology
        ? `${word.morphology} names no morphology scheme on disk`
        : "no morphology scheme is declared to read this code",
    };
  }
  const parse = decodeMorph(word.morph, scheme);
  if (!parse) return { unresolved: `${word.morphology} cannot read this code` };

  // A narrowing that empties the set has narrowed nothing, so the candidates
  // stand. The map records what a form could be apart from any sentence, and a
  // corpus may legitimately state a parse no cell anticipated.
  const categoryOf = inflectionCategories();
  const onParse = candidates.filter((entry) =>
    accountsFor(entry.cell, parse, categoryOf),
  );
  if (onParse.length) candidates = onParse;
  if (distinctRoots(candidates).length === 1)
    return { lemma: candidates[0].root };

  // Two clues are left, and neither outranks the other, so they are read
  // together rather than in an order.
  const byCase = distinctRoots(
    candidates.filter((entry) => spelledAsPrinted(entry, printed)),
  );
  const byNumber =
    word.strong === undefined
      ? []
      : distinctRoots(
          candidates.filter((entry) =>
            entry.rootStrongs.includes(word.strong!),
          ),
        );

  if (
    byNumber.length === 1 &&
    byCase.length === 1 &&
    byNumber[0] !== byCase[0]
  ) {
    return {
      unresolved: `the printed case says ${byCase[0]} and the Strong's number says ${byNumber[0]}`,
    };
  }
  if (byNumber.length === 1) return { lemma: byNumber[0] };
  if (byCase.length === 1) return { lemma: byCase[0] };

  return {
    unresolved: `ambiguous between ${distinctRoots(candidates).join(", ")}`,
  };
}

/**
 * Which Strong's number a word carries, or why the map has none for it.
 *
 * Starts from the lemma rather than from the spelling, because a version that
 * carries lemmas has already done the narrowing {@link resolveLemma} does and
 * the question left is the index's, not the dictionary's. The lemma must be a
 * root **exactly**: no accent-blind fallback, since a fold can tie two roots
 * and would answer a question the corpus did not ask.
 *
 * From there, three sources can name a number, and they are consulted from the
 * most specific to the least:
 *
 * 1. **The index's placement rules**, which are what know that a particular
 *    parse or spelling of a root takes a finer number than the root does.
 *    Their **distinct numbers** are collected rather than their matches: two
 *    rules differing only in a grave for an acute both match one node, and
 *    counting matches calls that a conflict 386 times across LXX1935.
 * 2. **The number the codex places on the cell itself**, for a root whose
 *    numbers no rule distributes. This is the same claim as a rule from the
 *    other side of the import, and where both speak they agree.
 * 3. **The root's own number**, when it carries exactly one.
 *
 * A root carrying no number simply has none to give — 63% of the codex's roots
 * are in that position — and nothing here invents one. A root carrying several
 * that nothing above narrowed is declined for the same reason: the number
 * exists, but which one is a question the corpus has not answered.
 *
 * @param word.lemma The node's lemma, which must be a dictionary root
 * @param word.text The node's printed text, for the rules that name a spelling
 * @param word.morph The node's own morphology code, when it carries one
 * @param word.morphology The scheme id the version declares, e.g. `"robinson"`
 */
export function resolveStrongs(word: {
  lemma: string;
  text: string;
  morph?: string;
  morphology?: string;
}): StrongsResolution {
  const rootNumbers = rootIndex().get(word.lemma);
  if (rootNumbers === undefined)
    return { unresolved: "lemma is not a root in the codex" };

  const spelling = spellingsOf(word.text).find(Boolean) ?? "";
  const scheme = word.morphology ? morphologyScheme(word.morphology) : null;
  const parse = word.morph && scheme ? decodeMorph(word.morph, scheme) : null;

  const matched = (strongsPlacements().get(word.lemma) ?? []).filter((rule) => {
    if (rule.requires && !rule.requires.every((code) => parse?.includes(code)))
      return false;
    if (rule.spelling && codexLookup(rule.spelling) !== codexLookup(spelling))
      return false;
    return true;
  });
  const placed = [...new Set(matched.map((rule) => rule.n))].sort();
  if (placed.length === 1) return { strong: placed[0] };
  if (placed.length > 1)
    return { unresolved: `conflicting index rules: ${placed.join(", ")}` };

  const cells = entriesFor(spelling).filter(
    (entry) => entry.root === word.lemma,
  );
  const onParse = parse
    ? cells.filter((entry) =>
        accountsFor(entry.cell, parse, inflectionCategories()),
      )
    : [];
  const onCell = [
    ...new Set(
      (onParse.length ? onParse : cells).flatMap((entry) => entry.cellStrongs),
    ),
  ];
  if (onCell.length === 1) return { strong: onCell[0] };

  if (rootNumbers.length === 1) return { strong: rootNumbers[0] };
  if (rootNumbers.length === 0)
    return { unresolved: "the root carries no Strong's number" };
  return { unresolved: "root-level index is an array no rule narrows" };
}
