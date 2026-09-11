/**
 * Lexical-map audit: every codex file against its schema, and every claim in
 * it against the language registry that defines the vocabulary.
 *
 * The codex schema defers a list of checks to "outside this schema". The reason
 * is narrower than this comment used to claim, and worth stating correctly:
 * **a schema cannot open a second file.** Most of what is checked here — that a
 * parse code exists, that a parse states one value per category, that a root's
 * class resolves, that a cell's part of speech is a reading its root allows —
 * is a plain `enum` or an `if`/`then` once the vocabulary is in hand, and the
 * vocabulary lives in `_language.json`. No draft lets a schema read instance
 * data from another document, so the choice is between generating those
 * fragments from the registry at validate time and writing the checks here.
 *
 * Two things are genuinely out of reach. Recomputing a transliteration needs a
 * string transformation with context, which no draft has. Comparing two
 * property names to each other has no keyword either, though the key rule can
 * be stated as two patterns that make a collision impossible rather than
 * checked pairwise.
 *
 * A codex is a controlled vocabulary applied to tens of thousands of cells, and
 * a typo in one code is invisible until something downstream silently fails to
 * match it. That is the reason to check at all, whichever mechanism does it.
 *
 * Everything here is report-only, like its peers in `validate.ts`. A bad code
 * is either a typo in the codex or a missing registry entry, and only a person
 * can say which.
 */

import fs from "fs";
import path from "path";
import validateJsonAgainstSchema from "../functions/validateJsonAgainstSchema";

/** Directory holding one subdirectory per language codex. */
const lexicalMapsDir = "./lexical-maps";
/** The schema every codex file is validated against. */
const codexSchemaPath = "./lexical-maps/codex-schema.json";

/** One thing wrong with a codex, with enough identity to find it again. */
export interface LexicalMapFinding {
  /** Codex file, e.g. `"greek/lambda.json"`. */
  file: string;
  /** Root the finding sits under, or null for a file-level one. */
  root: string | null;
  /** Inflected spelling the finding sits under, where it has one. */
  spelling?: string;
  /** What is wrong, in one line. */
  message: string;
}

/** What {@link auditLexicalMaps} found in one language's codex. */
export interface LexicalMapAudit {
  /** Language directory, e.g. `"greek"`. */
  language: string;
  findings: LexicalMapFinding[];
  /** Roots walked, so a scan that silently stops descending is visible. */
  rootsScanned: number;
  /** Parse cells walked, for the same reason. */
  cellsScanned: number;
}

/** The registry's vocabulary, indexed the two ways the checks need it. */
interface Registry {
  /** Inflection code to the category it belongs to, e.g. `nom` -> `case`. */
  categoryOf: Map<string, string>;
  /** Part-of-speech codes, which are the `pos` category's own members. */
  partsOfSpeech: Set<string>;
  /** Tense codes, for checking a root's `stems` keys. */
  tenses: Set<string>;
  /** Gender codes, for checking a root's `gender`. */
  genders: Set<string>;
  /** Class id to the class categories and parts of speech it is legal for. */
  classes: Map<string, { category: string; appliesTo: string[] }>;
  /** Part of speech to the others a lexeme's forms may be tagged with. */
  readableAs: Map<string, string[]>;
  /** The transliteration table, or null when the registry has none. */
  transliteration: TransliterationTable | null;
}

interface TransliterationTable {
  letters: Record<string, string>;
  diphthongs: string[];
  velars: string[];
  gammaNasal: string;
  upsilonInDiphthong: string;
  aspirate: string;
}


/** The combining grave and the combining acute, the pair the fold rewrites. */
const GRAVE = "̀";
const ACUTE = "́";

/**
 * A spelling with the two things about it that are not the word's own removed:
 * the grave accent, and the initial capital.
 *
 * The codex keys each spelling with a grave read as its acute, because the grave
 * stands only where another word follows, and with its initial case taken from
 * the root, because a capital at the head of a sentence belongs to the sentence
 * while a proper noun's belongs to the word. So this is what two spellings of
 * one word have in common, which is both what a reader holding a printed token
 * can compute without knowing the root, and what tells two keys that are really
 * one key apart. The rule the passes write by is `codexKey` in
 * `imports/lxx/lib/greek.mjs`, and the schema states it in full.
 *
 * @param spelling One spelling, outer punctuation already off.
 */
export function codexLookup(spelling: string): string {
  return spelling.toLowerCase().normalize("NFD").split(GRAVE).join(ACUTE).normalize("NFC");
}

/** One index value as a list, however the codex spells it. */
function indexNumbers(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as string[]) : [String(value)];
}

/** Combining marks, and what each becomes. The iota subscript is dropped. */
const MARKS: Record<string, string> = {
  "́": "́", // acute
  "̀": "̀", // grave
  "͂": "̂", // perispomeni becomes a plain circumflex
  "̈": "̈", // diaeresis
  "ͅ": "", // iota subscript
};
const ROUGH = "̔";
const SMOOTH = "̓";

/**
 * Capitalise a transliterated letter, which may be more than one character.
 *
 * Only the first: the Greek theta is *Th* and psi is *Ps*, never *TH* or *PS*.
 */
const titleCase = (latin: string) => latin.charAt(0).toUpperCase() + latin.slice(1);

/**
 * The academic transliteration of one word, from the registry's own table.
 *
 * A reimplementation of the rule the codex was written with, on purpose: the
 * point of the check is that the stored value is reproducible from the
 * registry alone, so a consumer that implements the table gets the same
 * answer. See the `transliteration` block in a language registry for the
 * table's own account of itself, including the iota subscript being the one
 * thing it cannot round-trip.
 */
export function transliterate(word: string, table: TransliterationTable): string {
  const diphthongs = new Set(table.diphthongs);
  const velars = new Set(table.velars);

  // `base` is lower-cased because the registry's table is keyed that way, and
  // `capital` remembers what the text printed so the Latin can match it. A
  // transliteration that lower-cases everything reads `Ζαβδος` as *zabdos*, a
  // proper name in lower case, and stops round-tripping its own key.
  const chars: { base: string; marks: string[]; capital: boolean }[] = [];
  for (const ch of word.normalize("NFD")) {
    if (ch in MARKS || ch === ROUGH || ch === SMOOTH) {
      if (chars.length) chars[chars.length - 1].marks.push(ch);
      continue;
    }
    const base = ch.toLowerCase();
    chars.push({ base, marks: [], capital: base !== ch });
  }

  let out = "";
  let aspirated = false;
  chars.forEach((char, i) => {
    const previous = chars[i - 1];
    const next = chars[i + 1];
    let latin: string;

    if (char.base === "γ" && next && velars.has(next.base)) {
      latin = table.gammaNasal;
    } else if (char.base === "υ" && previous && diphthongs.has(previous.base + char.base)) {
      latin = table.upsilonInDiphthong;
    } else {
      latin = table.letters[char.base] ?? char.base;
    }

    // A rough breathing aspirates the syllable, so its `h` goes ahead of the
    // vowel or diphthong it sits on, and after a rho.
    if (char.marks.includes(ROUGH)) {
      // A rho takes its aspirate after itself, so the rho keeps the capital
      // (`Ῥώμη` is *Rhṓmē*); a vowel's aspirate stands first and takes it
      // instead (`Ἅγιος` is *Hágios*, not *hÁgios*).
      if (char.base === "ρ") latin = (char.capital ? titleCase(latin) : latin) + table.aspirate;
      else if (previous && diphthongs.has(previous.base + char.base)) aspirated = true;
      else latin = (char.capital ? titleCase(table.aspirate) : table.aspirate) + latin;
    } else if (char.capital) {
      latin = titleCase(latin);
    }

    out += latin + char.marks.map((m) => MARKS[m] ?? "").join("");
  });

  // A rough breathing on the second half of a diphthong prefixes the whole
  // diphthong, so the capital moves out to it: `Οὗτος` is *Hoûtos*.
  if (aspirated) {
    const capital = chars[0]?.capital;
    out =
      (capital ? titleCase(table.aspirate) : table.aspirate) +
      (capital ? out.charAt(0).toLowerCase() + out.slice(1) : out);
  }
  return out.normalize("NFC");
}

/** Read one language's registry into the shape the checks want. */
function readRegistry(languageDir: string): Registry | null {
  const registryPath = path.join(lexicalMapsDir, languageDir, "_language.json");
  if (!fs.existsSync(registryPath)) return null;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));

  const categoryOf = new Map<string, string>();
  const partsOfSpeech = new Set<string>();
  const tenses = new Set<string>();
  const genders = new Set<string>();
  for (const entry of registry.inflections ?? []) {
    categoryOf.set(entry._id, entry.category);
    if (entry.category === "pos") partsOfSpeech.add(entry._id);
    if (entry.category === "tense") tenses.add(entry._id);
    if (entry.category === "gender") genders.add(entry._id);
  }

  const readableAs = new Map<string, string[]>(Object.entries(registry.posReadings?.readings ?? {}));

  const table = registry.transliteration;
  const transliteration =
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

  const classes = new Map<string, { category: string; appliesTo: string[] }>();
  for (const entry of registry.classes ?? []) {
    classes.set(entry._id, { category: entry.category, appliesTo: entry.appliesTo ?? [] });
  }

  return { categoryOf, partsOfSpeech, tenses, genders, classes, readableAs, transliteration };
}

/** The language subdirectories under `lexical-maps`. */
export function lexicalMapLanguages(): string[] {
  if (!fs.existsSync(lexicalMapsDir)) return [];
  return fs
    .readdirSync(lexicalMapsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Audit one language's codex.
 *
 * @param language Subdirectory of `lexical-maps`, e.g. `"greek"`.
 */
export function auditLexicalMaps(language: string): LexicalMapAudit {
  const findings: LexicalMapFinding[] = [];
  let rootsScanned = 0;
  let cellsScanned = 0;

  const registry = readRegistry(language);
  if (!registry) {
    return {
      language,
      findings: [{ file: `${language}/_language.json`, root: null, message: "no language registry, so nothing can be checked against it" }],
      rootsScanned,
      cellsScanned,
    };
  }

  const dir = path.join(lexicalMapsDir, language);
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "_language.json")
    .sort();

  for (const name of files) {
    const file = `${language}/${name}`;
    const filePath = path.join(dir, name);

    // Structural check first: a file that does not match the codex schema can
    // fail every check below for one reason, and reporting that reason once is
    // more use than reporting its consequences a thousand times.
    const schemaResult = validateJsonAgainstSchema(codexSchemaPath, filePath);
    if (!schemaResult.valid) {
      for (const error of (schemaResult.errors ?? []).slice(0, 10)) {
        findings.push({
          file,
          root: null,
          message: `schema: ${error.instancePath || "(root)"} ${error.message}`,
        });
      }
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    for (const [root, entry] of Object.entries<any>(data)) {
      rootsScanned++;
      findings.push(...auditRoot(file, root, entry, registry, () => cellsScanned++));
    }
  }

  return { language, findings, rootsScanned, cellsScanned };
}

/** Every check that applies to one root. */
function auditRoot(
  file: string,
  root: string,
  entry: any,
  registry: Registry,
  countCell: () => void
): LexicalMapFinding[] {
  const findings: LexicalMapFinding[] = [];
  const at = (message: string, spelling?: string) => findings.push({ file, root, spelling, message });

  if (!registry.partsOfSpeech.has(entry.pos)) {
    at(`pos "${entry.pos}" is not a part of speech the registry defines`);
  }

  // A lexical fact has to belong to the part of speech that can have it, and
  // agree with the root's own cells. A root stating one gender while its cells
  // state another is the kind of error that makes a generated paradigm wrong
  // everywhere at once.
  if (entry.gender !== undefined) {
    if (entry.pos !== "noun") at(`gender "${entry.gender}" on a ${entry.pos}, which has none`);
    else if (!registry.genders.has(entry.gender)) at(`gender "${entry.gender}" is not a gender the registry defines`);
  }
  if (entry.deponent !== undefined && entry.pos !== "verb") {
    at(`deponent on a ${entry.pos}, which cannot be one`);
  }

  // An inflection class has to exist, belong to the category the field names,
  // and be legal for this part of speech. The class's own `appliesTo` is what
  // says so, which keeps the rule in the registry rather than here.
  for (const [field, category] of [
    ["declension", "declension"],
    ["conjugation", "conjugation"],
  ] as const) {
    const claimed = entry[field];
    if (claimed === undefined) continue;
    const klass = registry.classes.get(claimed);
    if (!klass) {
      at(`${field} "${claimed}" is not a class the registry defines`);
      continue;
    }
    if (klass.category !== category) {
      at(`${field} "${claimed}" is a ${klass.category} class, not a ${category} one`);
    }
    if (klass.appliesTo.length && !klass.appliesTo.includes(entry.pos)) {
      at(`${field} "${claimed}" applies to ${klass.appliesTo.join(", ")}, not to a ${entry.pos}`);
    }
  }
  if (entry.stems !== undefined) {
    if (entry.pos !== "verb") at(`stems on a ${entry.pos}, which has no principal parts`);
    else {
      for (const tense of Object.keys(entry.stems)) {
        if (!registry.tenses.has(tense)) at(`stems key "${tense}" is not a tense the registry defines`);
      }
    }
  }

  const genders = new Set<string>();
  const rootNumbers = indexNumbers(entry.indices?.strongs);

  // Two keys that are one key. The passes that write the codex disagreed about
  // case, so `Ζαβαδ` was stored twice, and each copy carried only the parses
  // the pass that wrote it knew about: a paradigm split in half by nothing more
  // than where a sentence happened to start. See {@link codexLookup}.
  const byLookup = new Map<string, string>();
  for (const spelling of Object.keys(entry.inflections ?? {})) {
    const lookup = codexLookup(spelling);
    const first = byLookup.get(lookup);
    if (first === undefined) byLookup.set(lookup, spelling);
    else at(`spelling "${spelling}" and "${first}" are one key: they differ only in case or in a grave for an acute`, spelling);
  }

  for (const [spelling, inflection] of Object.entries<any>(entry.inflections ?? {})) {
    if (inflection.transliteration !== undefined && registry.transliteration) {
      const expected = transliterate(spelling, registry.transliteration);
      if (inflection.transliteration !== expected) {
        at(`transliteration "${inflection.transliteration}" but the registry's table gives "${expected}"`, spelling);
      }
    }

    for (const cell of inflection.cells ?? []) {
      countCell();

      // A cell's own Strong's number is there to say which of the root's
      // numbers this spelling and parse takes, so it has to be some of them and
      // not all of them. The corpus tags at the lexical level, which is how
      // 18,702 cells came to repeat their root's own number and say nothing.
      const cellNumbers = indexNumbers(cell.indices?.strongs);
      if (cellNumbers.length) {
        const absent = cellNumbers.filter((number) => !rootNumbers.includes(number));
        if (absent.length) {
          at(`cell Strong's ${absent.join(", ")} is not a number the root carries (${rootNumbers.join(", ") || "none"})`, spelling);
        } else if (new Set(cellNumbers).size === new Set(rootNumbers).size) {
          at(`cell Strong's ${cellNumbers.join(", ")} is the root's own set, which every cell under it already has`, spelling);
        }
      }

      const seen = new Map<string, string>();
      for (const code of cell.parse ?? []) {
        const category = registry.categoryOf.get(code);
        if (!category) {
          at(`parse code "${code}" is not in the registry`, spelling);
          continue;
        }
        const already = seen.get(category);
        if (already && already !== code) {
          at(`parse states both "${already}" and "${code}" for ${category}`, spelling);
        }
        seen.set(category, code);
        if (category === "gender") genders.add(code);
      }
      const parsePos = seen.get("pos");
      if (!parsePos) at("parse states no part of speech", spelling);
      else if (parsePos !== entry.pos && !(registry.readableAs.get(entry.pos) ?? []).includes(parsePos)) {
        at(`parse says "${parsePos}", which is not a reading of a ${entry.pos}`, spelling);
      }
    }
  }

  if (entry.gender !== undefined && genders.size > 0 && !genders.has(entry.gender)) {
    at(`gender "${entry.gender}" but its own cells only ever say ${[...genders].sort().join(", ")}`);
  }

  return findings;
}

/** One finding as a single line, for the audit's own output. */
export function formatLexicalMapFinding(finding: LexicalMapFinding): string {
  const where = [finding.root, finding.spelling].filter(Boolean).join(" / ");
  return where ? `${finding.file} ${where}: ${finding.message}` : `${finding.file}: ${finding.message}`;
}
