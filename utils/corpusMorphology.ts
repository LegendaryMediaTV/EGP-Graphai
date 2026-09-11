/**
 * Corpus-against-map audit: every `morph` code a version prints must be one
 * the lexical map can account for.
 *
 * This is the check that makes the map's claim testable. The map stores what is
 * known about each inflected form, and a morphology code is one rendering of
 * that, named per version in its own `morphology` field. So a code the map
 * cannot explain means one of three things, all worth a person's attention: a
 * spelling missing from the map, a parse missing from a spelling, or a code
 * written in a scheme the version does not declare.
 *
 * It found a real fault the first time it ran outside validation. BYZ tags
 * `οὐαὶ` both `INJ` and `N-OI`, and a cleanup pass had deleted the second cell
 * as though a script had put it there, taking four tokens of corpus data with
 * it. Nothing else would have noticed.
 *
 * **Narrowing is allowed, and is not a failure.** A word that does not inflect
 * has no case marking, and the map records that as `indecl-proper` rather than
 * by listing every case it could stand in, because "this can be anything" is a
 * different claim from "this is one of these two". A corpus may then narrow it
 * from context. So `Ἀβραάμ` reads `N-PRI` in BYZ2026, which did not narrow it,
 * and `N-GSM` in LXX1935, which did, and both are right about the same word.
 * See {@link accountsFor}.
 */

import fs from "fs";
import path from "path";
import { accountsFor, decodeMorph, readScheme } from "./morphology";
import { codexLookup } from "./lexicalMaps";
import { spellingsOf } from "./punctuation";

const bibleVersionsDir = "./bible-versions";
const lexicalMapsDir = "./lexical-maps";

/** One `morph` code the map cannot account for. */
export interface CorpusMorphFinding {
  /** Book file, e.g. `"01-MAT.json"`. */
  file: string;
  book: string;
  chapter: number;
  verse: number;
  /** The printed word, punctuation stripped. */
  word: string;
  /** The code as written. */
  morph: string;
  /** Why the map could not account for it. */
  reason: string;
}

/** What {@link auditCorpusMorphology} found in one version. */
export interface CorpusMorphAudit {
  version: string;
  /** The scheme the version declares, or null when it declares none. */
  scheme: string | null;
  findings: CorpusMorphFinding[];
  /** Tokens carrying a `morph` code, so a walk that stops descending shows. */
  scanned: number;
}


/** Accents and the iota subscript away, for the fallback lookup. */
const fold = (word: string) =>
  word.normalize("NFD").replace(/[̀-ͯͅ]/g, "").toLowerCase().normalize("NFC");

/** Every language directory holding a codex. */
function languages(): string[] {
  if (!fs.existsSync(lexicalMapsDir)) return [];
  return fs
    .readdirSync(lexicalMapsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Spelling to the cells the map holds for it, across every language, plus the
 * category each inflection code belongs to.
 *
 * Indexed by the codex's own key rule as {@link codexLookup} computes it, and
 * looked up the same way, so a corpus printing a capital where a sentence
 * starts finds the key its root gave it. This audit reported 13 such words as
 * parses the map could not account for while the two sides disagreed about
 * case. The fully folded key stays as a fallback, for a spelling the map
 * carries only under some other accentuation.
 */
function readMap(): { cells: Map<string, string[][]>; categoryOf: Map<string, string> } {
  const cells = new Map<string, string[][]>();
  const categoryOf = new Map<string, string>();

  for (const language of languages()) {
    const dir = path.join(lexicalMapsDir, language);
    const registryPath = path.join(dir, "_language.json");
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
      for (const entry of registry.inflections ?? []) categoryOf.set(entry._id, entry.category);
    }

    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_language.json")) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));
      for (const entry of Object.values<any>(data)) {
        for (const [spelling, inflection] of Object.entries<any>(entry.inflections ?? {})) {
          for (const cell of inflection.cells ?? []) {
            const parse = cell.parse ?? [];
            for (const key of [codexLookup(spelling), fold(spelling)]) {
              const bucket = cells.get(key) ?? [];
              bucket.push(parse);
              cells.set(key, bucket);
            }
          }
        }
      }
    }
  }
  return { cells, categoryOf };
}

let cached: ReturnType<typeof readMap> | null = null;

/**
 * Audit one version's morphology codes against the map.
 *
 * @param version Directory under `bible-versions`, e.g. `"BYZ2026"`.
 */
export function auditCorpusMorphology(version: string): CorpusMorphAudit {
  const versionPath = path.join(bibleVersionsDir, version, "_version.json");
  if (!fs.existsSync(versionPath)) return { version, scheme: null, findings: [], scanned: 0 };
  const declared = JSON.parse(fs.readFileSync(versionPath, "utf-8")).morphology ?? null;
  if (!declared) return { version, scheme: null, findings: [], scanned: 0 };

  // The scheme file, from whichever language carries one by that id.
  const scheme = languages().reduce<ReturnType<typeof readScheme>>(
    (found, language) => found ?? readScheme(language, declared),
    null
  );
  if (!scheme) {
    return {
      version,
      scheme: declared,
      scanned: 0,
      findings: [
        {
          file: "_version.json",
          book: "",
          chapter: 0,
          verse: 0,
          word: "",
          morph: declared,
          reason: `no morphology scheme with that id under ${lexicalMapsDir}/<language>/morphology`,
        },
      ],
    };
  }

  cached ??= readMap();
  const { cells, categoryOf } = cached;
  const findings: CorpusMorphFinding[] = [];
  let scanned = 0;

  const dir = path.join(bibleVersionsDir, version);
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_version.json")) {
    const records = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));
    if (!Array.isArray(records)) continue;

    for (const record of records) {
      const at = { file: name, book: record.book, chapter: record.chapter, verse: record.verse };
      walk(record.content, (candidateSpellings, morph) => {
        scanned++;
        const word = candidateSpellings[0];
        const parse = decodeMorph(morph, scheme);
        if (!parse) {
          findings.push({ ...at, word, morph, reason: `${declared} cannot read this code` });
          return;
        }
        const candidates = candidateSpellings.flatMap(
          (spelling) => cells.get(codexLookup(spelling)) ?? cells.get(fold(spelling)) ?? []
        );
        if (!candidates.length) {
          findings.push({ ...at, word, morph, reason: "the map holds no such spelling" });
          return;
        }
        if (candidates.some((cell) => accountsFor(cell, parse, categoryOf))) return;
        findings.push({ ...at, word, morph, reason: `no cell for this spelling accounts for ${parse.join(" ")}` });
      });
    }
  }

  return { version, scheme: declared, findings, scanned };
}

/** Visit every word node carrying a morph code, with the spellings to try. */
function walk(nodes: unknown, visit: (spellings: string[], morph: string) => void): void {
  if (!Array.isArray(nodes)) return;
  /** The spellings of the last word seen, for a text-less code to attach to. */
  let preceding: string[] = [];

  for (const node of nodes as any[]) {
    if (typeof node === "string" || node === null) continue;
    if (node.subtitle) walk(node.subtitle, visit);
    if (node.heading) walk(node.heading, visit);
    if (node.foot?.content) walk(node.foot.content, visit);
    if (Array.isArray(node.content)) walk(node.content, visit);
    if (!node.morph) continue;

    if (node.text === undefined) {
      // A tagged node with no text is a second reading of the word before it,
      // which is this corpus's own convention. Skipping it left BYZ2026's 27
      // such codes outside every check here, and one of them was a cell a
      // cleanup pass had deleted. A code the map cannot explain is worth
      // reporting wherever it is printed.
      if (preceding.length) visit(preceding, node.morph);
      continue;
    }

    const candidates = spellingsOf(String(node.text)).filter(Boolean);
    if (!candidates.length) continue;
    preceding = candidates;
    visit(candidates, node.morph);
  }
}

/** One finding as a single line, for the audit's own output. */
export function formatCorpusMorphFinding(finding: CorpusMorphFinding): string {
  return `${finding.book} ${finding.chapter}:${finding.verse} ${finding.word} [${finding.morph}] — ${finding.reason}`;
}
