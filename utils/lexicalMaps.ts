/**
 * Lexical-map audit: every codex file against its schema, and every claim in
 * it against the language registry that defines the vocabulary.
 *
 * The codex schema defers a list of checks to "outside this schema", and the
 * reason is narrow: **a schema cannot open a second file.** Most of what is
 * checked here — that a parse code exists, that a parse states one value per
 * category, that a root's class resolves, that a cell's part of speech is a
 * reading its root allows — is a plain `enum` or an `if`/`then` once the
 * vocabulary is in hand, and the vocabulary lives in `_language.json`. No draft
 * lets a schema read instance data from another document, so the choice is
 * between generating those fragments from the registry at validate time and
 * writing the checks here.
 *
 * Two things are genuinely out of reach. Recomputing a transliteration needs a
 * string transformation with context, which no draft has — so that check runs
 * here, through `lexicon.ts`, and therefore asks whether the codex's stored
 * value is the one a consumer will actually compute rather than whether two
 * copies of one table agree. Comparing two property names to each other has no
 * keyword either, though the key rule can be stated as two patterns that make a
 * collision impossible rather than checked pairwise.
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
import {
  TransliterationTable,
  codexLookup,
  indexNumbers,
  transliterate,
  transliterationTable,
} from "./lexicon";

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
  /** Everything wrong with the codex, in the order the walk found it. */
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

  const transliteration = transliterationTable(languageDir);

  const classes = new Map<string, { category: string; appliesTo: string[] }>();
  for (const entry of registry.classes ?? []) {
    classes.set(entry._id, { category: entry.category, appliesTo: entry.appliesTo ?? [] });
  }

  return { categoryOf, partsOfSpeech, tenses, genders, classes, readableAs, transliteration };
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

  // A root key is an identifier: a corpus names it, a script matches it, and a
  // reader types it. Two spellings of one identifier is one identifier too
  // many. 258 keys were stored with the oxia code points rather than the tonos
  // ones NFC produces, which nothing caught because {@link codexLookup}
  // decomposes and recomposes on the way in and normalizes the difference away
  // for free. It stops being free the moment anything compares a key to a
  // literal: a script written to move `Δαβίδ` reported the root as absent.
  if (root !== root.normalize("NFC")) {
    at(`root key is not NFC, so a literal written elsewhere will not match it`);
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

  // The initial capital on a root key is the map saying the word is a proper
  // name, and that is the only thing it can mean. A capital that belongs to
  // the sentence rather than the word is never stored, because `codexLookup`
  // folds it away on the way in, so a capital that is stored is a claim. A
  // verb is not a name, and a word the map holds as `indecl-proper` is not a
  // common noun, so the two have to agree with each other.
  const capitalised = /^\p{Lu}/u.test(root.normalize("NFD"));
  if (capitalised && !["noun", "adj", "adv"].includes(entry.pos)) {
    at(`root key is capitalised, which says proper name, on a ${entry.pos}`);
  }
  if (!capitalised) {
    const proper = Object.values<any>(entry.inflections ?? {}).some((inflection) =>
      (inflection.cells ?? []).some((cell: any) => (cell.parse ?? []).includes("indecl-proper"))
    );
    if (proper) at(`root key is lowercase, which says common word, but a cell says indecl-proper`);
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

    // Case is a fact about the word, so it belongs to the root and every
    // spelling under it carries the root's. A spelling written in the other
    // case is storing the page's typography, which the fold above already
    // handles, and it makes the root contradict itself about whether the word
    // is a name. `Ἰσραηλίτης` held `ισραηλίτην` because Rahlfs prints it
    // lowercase.
    if (/^\p{Lu}/u.test(spelling.normalize("NFD")) !== capitalised) {
      at(
        capitalised
          ? `spelling "${spelling}" is lowercase under a capitalised root`
          : `spelling "${spelling}" is capitalised under a lowercase root`,
        spelling
      );
    }
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
