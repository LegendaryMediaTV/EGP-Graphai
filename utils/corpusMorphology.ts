/**
 * Corpus-against-map audit: every `morph` code, every `lemma` and every
 * Strong's number a version prints must be one the lexical map can account for.
 *
 * This is the check that makes the map's claim testable. The map stores what is
 * known about each inflected form, and a morphology code is one rendering of
 * that, named per version in its own `morphology` field. So a code the map
 * cannot explain means one of three things, all worth a person's attention: a
 * spelling missing from the map, a parse missing from a spelling, or a code
 * written in a scheme the version does not declare.
 *
 * It has already caught a real fault. BYZ tags `οὐαὶ` both `INJ` and `N-OI`,
 * and a cleanup pass had deleted the second cell as though a script had put it
 * there, taking four tokens of corpus data with it. Nothing else would have
 * noticed.
 *
 * **Narrowing is allowed, and is not a failure.** A word that does not inflect
 * has no case marking, and the map records that as `indecl-proper` rather than
 * by listing every case it could stand in, because "this can be anything" is a
 * different claim from "this is one of these two". A corpus may then narrow it
 * from context. So `Ἀβραάμ` reads `N-PRI` in BYZ2026, which did not narrow it,
 * and `N-GSM` in LXX1935, which did, and both are right about the same word.
 * See {@link accountsFor}.
 *
 * A **lemma** is checked separately and by a different test: it must name a root
 * the codex holds, exactly. The two fail apart, so checking one is not checking
 * the other. `1MC 8:8`'s `Εὐμένει` went on resolving its `N-DSM` through the
 * spelling for a whole session while its lemma named a root that had been
 * rekeyed out from under it, which left the word unable to take a Strong's
 * number and nothing reporting why.
 *
 * A **Strong's number** is checked against that lemma, and is the one test here
 * that reads two of the node's own claims against each other rather than
 * against the map. A node saying both which word it is and which number it
 * carries can name two different words, and when it does, every other check
 * passes: the spelling is real, the parse is real, the lemma is a root. Only the
 * pair shows it. LXX1935 printed the city Gaza with `γάζα` the treasury's number
 * in every genitive it had, and nothing saw it until the two were compared.
 * A number the corpus carries must be sourced from the codex, so a lemma whose
 * root carries no number at all fails the check the same way one carrying the
 * wrong number does. See {@link numbersFor} for what a root may carry, empty
 * answer included.
 *
 * What the map holds for a spelling is asked of `lexicon.ts` rather than
 * indexed here. A second index would be a second answer to the very question
 * this check exists to settle.
 */

import fs from "fs";
import path from "path";
import { accountsFor, decodeMorph, readScheme } from "./morphology";
import {
  entriesFor,
  inflectionCategories,
  isRoot,
  lexicalMapLanguages,
  numbersFor,
} from "./lexicon";
import { spellingsOf } from "./punctuation";

/** Directory holding one subdirectory per Bible version. */
const bibleVersionsDir = "./bible-versions";
/** Directory holding one subdirectory per language codex. */
const lexicalMapsDir = "./lexical-maps";

/** One `morph` code the map cannot account for. */
export interface CorpusMorphFinding {
  /** Book file, e.g. `"01-MAT.json"`. */
  file: string;
  /** Repo book id, e.g. `"MAT"`. */
  book: string;
  /** Chapter the word sits in. */
  chapter: number;
  /** Verse the word sits in. */
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
  /** Directory under `bible-versions` that was audited. */
  version: string;
  /** The scheme the version declares, or null when it declares none. */
  scheme: string | null;
  /** Every code the map could not account for, in document order. */
  findings: CorpusMorphFinding[];
  /** Tokens carrying a `morph` code, so a walk that stops descending shows. */
  scanned: number;
}

/**
 * Audit one version's morphology codes against the map.
 *
 * @param version Directory under `bible-versions`, e.g. `"BYZ2026"`.
 */
export function auditCorpusMorphology(version: string): CorpusMorphAudit {
  const versionPath = path.join(bibleVersionsDir, version, "_version.json");
  if (!fs.existsSync(versionPath))
    return { version, scheme: null, findings: [], scanned: 0 };
  const declared =
    JSON.parse(fs.readFileSync(versionPath, "utf-8")).morphology ?? null;
  if (!declared) return { version, scheme: null, findings: [], scanned: 0 };

  // The scheme file, from whichever language carries one by that id.
  const scheme = lexicalMapLanguages().reduce<ReturnType<typeof readScheme>>(
    (found, language) => found ?? readScheme(language, declared),
    null,
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

  const categoryOf = inflectionCategories();
  const findings: CorpusMorphFinding[] = [];
  let scanned = 0;

  const dir = path.join(bibleVersionsDir, version);
  for (const name of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "_version.json")) {
    const records = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));
    if (!Array.isArray(records)) continue;

    for (const record of records) {
      const at = {
        file: name,
        book: record.book,
        chapter: record.chapter,
        verse: record.verse,
      };
      walk(record.content, (candidateSpellings, morph, lemma, strong) => {
        const word = candidateSpellings[0];
        // A lemma is checked whether or not the node also carries a code,
        // because the two say different things and fail apart. `Εὐμενής` kept
        // pointing at a root that had been rekeyed `Εὐμένης`, and its `N-DSM`
        // went on resolving through the spelling the whole time.
        if (lemma !== undefined && !isRoot(lemma)) {
          findings.push({
            ...at,
            word,
            morph: morph ?? "",
            reason: `lemma "${lemma}" names no root in the map`,
          });
        }
        // A node naming both a lemma and a number makes two claims about which
        // word it is, and they can name different words. LXX1935 tagged the
        // city Gaza with γάζα the treasury's number in every genitive it
        // printed, lemma saying one word and number the other, which nothing
        // else here could see: the spelling is real, the parse is real, and only
        // the two claims against each other show the fault.
        //
        // A root that carries no number at all is not silent about the
        // question — it answers it. The codex is where a Strong's number
        // comes from, so a root the index gives none is a root with nothing
        // to lend, and a node tagged with a number anyway is contradicting
        // its own lemma exactly as much as one tagged with the wrong number
        // out of several. Both are reported the same way.
        if (lemma !== undefined && strong !== undefined) {
          const allowed = numbersFor(lemma);
          if (allowed !== null && !allowed.includes(strong)) {
            const carries = allowed.length
              ? `can carry (${allowed.join(", ")})`
              : `can carry — the root carries no Strong's number at all`;
            findings.push({
              ...at,
              word,
              morph: morph ?? "",
              reason: `Strong's number ${strong} is not one "${lemma}" ${carries}`,
            });
          }
        }
        if (morph === undefined) return;

        scanned++;
        const parse = decodeMorph(morph, scheme);
        if (!parse) {
          findings.push({
            ...at,
            word,
            morph,
            reason: `${declared} cannot read this code`,
          });
          return;
        }
        const candidates = candidateSpellings.flatMap((spelling) =>
          entriesFor(spelling).map((entry) => entry.cell),
        );
        if (!candidates.length) {
          findings.push({
            ...at,
            word,
            morph,
            reason: "the map holds no such spelling",
          });
          return;
        }
        if (candidates.some((cell) => accountsFor(cell, parse, categoryOf)))
          return;
        findings.push({
          ...at,
          word,
          morph,
          reason: `no cell for this spelling accounts for ${parse.join(" ")}`,
        });
      });
    }
  }

  return { version, scheme: declared, findings, scanned };
}

/**
 * Visit every word node carrying a morph code or a lemma, with the spellings to
 * try. Any of the three may be absent, and the visitor decides what each one is
 * worth.
 */
function walk(
  nodes: unknown,
  visit: (
    spellings: string[],
    morph?: string,
    lemma?: string,
    strong?: string,
  ) => void,
): void {
  if (!Array.isArray(nodes)) return;
  /** The spellings of the last word seen, for a text-less code to attach to. */
  let preceding: string[] = [];

  for (const node of nodes as any[]) {
    if (typeof node === "string" || node === null) continue;
    if (node.subtitle) walk(node.subtitle, visit);
    if (node.heading) walk(node.heading, visit);
    if (node.foot?.content) walk(node.foot.content, visit);
    if (Array.isArray(node.content)) walk(node.content, visit);
    if (!node.morph && !node.lemma) continue;

    if (node.text === undefined) {
      // A tagged node with no text is a second reading of the word before it,
      // which is this corpus's own convention. Skipping such a node would leave
      // its code outside every check here, and a code the map cannot explain is
      // worth reporting wherever it is printed.
      if (preceding.length)
        visit(preceding, node.morph, node.lemma, node.strong);
      continue;
    }

    const candidates = spellingsOf(String(node.text)).filter(Boolean);
    if (!candidates.length) continue;
    preceding = candidates;
    visit(candidates, node.morph, node.lemma, node.strong);
  }
}

/** One finding as a single line, for the audit's own output. */
export function formatCorpusMorphFinding(finding: CorpusMorphFinding): string {
  return `${finding.book} ${finding.chapter}:${finding.verse} ${finding.word} [${finding.morph}] — ${finding.reason}`;
}
