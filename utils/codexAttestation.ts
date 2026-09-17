/**
 * Codex cells the corpus's own index contradicts: a cell whose root carries a
 * Strong's number, where every corpus word the cell explains that carries a
 * number carries a different one.
 *
 * Read plainly, such a cell says *this root inflects to this spelling* while
 * every occurrence of that spelling in the corpus is indexed to some other
 * word. That is a disagreement between two files, not a linguistic judgment,
 * which is the whole reason it is safe to report: the check never decides which
 * side is wrong, and in every finding only a person can.
 *
 * It caught `εἴκω / εἰκών [noun nom sg fem]` — a verb root holding fourteen
 * nodes of the noun `εἰκών`, all indexed G1504 against the root's G1502 — which
 * is the cell that shadowed the real noun's paradigm. The same shape recurs
 * within one part of speech: the place `Γάζα` holding the cells of `γάζα` the
 * treasury, `σκευή` holding `σκεῦος`'s plural, `Ἰωνᾶς` holding `Ἰωνάν`'s.
 *
 * 64 cells at the last measurement, out of 52,450 the corpus attests at all,
 * and **every one of them at `sole` zero**: not one node would be left without
 * an account of its parse if the cell went. That makes the whole list safe to
 * delete and says nothing about whether it is right to. The large ones are
 * redundant rather than wrong — `ἄρχω / ἄρχων [noun nom sg masc]` explains 123
 * nodes and every one of them correctly names ἄρχων — and whether a derived
 * noun should also stand under its verb is lexicographic policy, not a defect.
 *
 * **It is deliberately not a cross-part-of-speech rule.** A language registry's
 * `posReadings` permits a verb root to carry noun cells, and it is right to: of
 * 364 cells whose parse states a different part of speech than their root, most
 * are correct, `οὐαί (inj) / οὐαί [noun indecl-other]` among them — the
 * four-token cell whose accidental deletion is written up in
 * `corpusMorphology.ts`'s own header. Reading the numbers instead of the parts
 * of speech is what tells the disease from the paradigm.
 *
 * **Its blind spot, stated plainly: a corpus wrong about the lemma and the
 * Strong's number in the same direction is invisible here.** The cell's root
 * and the node's number then agree, and there is nothing left to disagree
 * about. Five of the six cells found by hand this session, each attested by a
 * single node, were invisible for exactly that reason, and every one of them
 * needed a person to read the clause. Nothing mechanical reaches the rest.
 *
 * What the codex holds for a spelling is asked of `lexicon.ts`, and what a
 * verse prints of `corpusTokens.ts`. Both cache; neither is re-indexed here.
 */

import fs from "fs";
import { CodexEntry, inflectionCategories } from "./lexicon";
import { CorpusVerse, cellsFor, corpusVerses } from "./corpusTokens";
import { accountsFor } from "./morphology";

/** Directory holding one subdirectory per Bible version. */
const bibleVersionsDir = "./bible-versions";

/** One codex cell the corpus's Strong's numbers place somewhere else. */
export interface CellContradiction {
  /** Codex file the cell is written in, e.g. `"greek/pi.json"`. */
  file: string;
  /** The dictionary root the cell sits under. */
  root: string;
  /** That root's own part of speech. */
  pos: string;
  /** That root's own Strong's numbers, which none of the nodes carry. */
  rootStrongs: string[];
  /** The inflected spelling, as the codex writes it. */
  spelling: string;
  /** The cell's parse codes. */
  parse: string[];
  /** Corpus words this cell explains. */
  nodes: number;
  /**
   * Of those, how many no other cell explains — so how many would be left with
   * no account of their parse at all if the cell were deleted. A cell at zero
   * can go without a single new `auditCorpusMorphology` finding, which is worth
   * knowing and is not the same as its being right to delete.
   */
  sole: number;
  /** The numbers those words actually carry, commonest first. */
  carried: { number: string; nodes: number }[];
}

/** What {@link auditCodexAttestation} found across the corpus. */
export interface CodexAttestationAudit {
  /** Versions the evidence came from, in the order they were walked. */
  versions: string[];
  /** Tagged words whose code a scheme could read, so a stalled walk shows. */
  nodesScanned: number;
  /** Codex cells at least one of those words attests. */
  cellsAttested: number;
  /** Every contradicted cell, most attested first. */
  contradictions: CellContradiction[];
}

/** What the corpus says about one cell, while the walk is still running. */
interface Attestation {
  /** Words this cell explains. */
  nodes: number;
  /** Of those, the ones no other cell explains. */
  sole: number;
  /** Strong's number to how many of those words carry it. */
  carried: Map<string, number>;
}

/**
 * Audit the codex against the index the corpus applies to its own words.
 *
 * Corpus-wide rather than per-version, because a cell belongs to a language
 * rather than to an edition: a cell one version never uses may still be
 * contradicted by another, and asking each version separately would report the
 * same cell twice and count its evidence once.
 *
 * @param verses The verses to take evidence from. Defaults to every version
 *   declaring a morphology scheme, which is the only useful answer in a run;
 *   a caller passes its own to put the rule to a verse it wrote itself.
 */
export function auditCodexAttestation(
  verses: Iterable<CorpusVerse> = everyTaggedVerse(),
): CodexAttestationAudit {
  const categoryOf = inflectionCategories();
  const attested = new Map<CodexEntry, Attestation>();
  const versions: string[] = [];
  let nodesScanned = 0;

  for (const verse of verses) {
    if (!versions.includes(verse.version)) versions.push(verse.version);

    for (const sequence of verse.sequences) {
      for (const token of sequence) {
        const readings = token.readings.filter((reading) => reading.parse);
        if (!readings.length) continue;
        nodesScanned += readings.length;

        const cells = cellsFor(token);
        if (!cells.length) continue;

        for (const reading of readings) {
          const explaining = cells.filter((cell) =>
            accountsFor(cell.cell, reading.parse!, categoryOf),
          );
          for (const cell of explaining) {
            let tally = attested.get(cell);
            if (!tally) {
              tally = { nodes: 0, sole: 0, carried: new Map() };
              attested.set(cell, tally);
            }
            tally.nodes++;
            if (explaining.length === 1) tally.sole++;
            if (reading.strong)
              tally.carried.set(
                reading.strong,
                (tally.carried.get(reading.strong) ?? 0) + 1,
              );
          }
        }
      }
    }
  }

  const contradictions: CellContradiction[] = [];
  for (const [cell, tally] of attested) {
    if (!cell.rootStrongs.length) continue;
    if (!tally.carried.size) continue;
    if (
      [...tally.carried.keys()].some((number) =>
        cell.rootStrongs.includes(number),
      )
    )
      continue;

    contradictions.push({
      file: cell.file,
      root: cell.root,
      pos: cell.pos,
      rootStrongs: cell.rootStrongs,
      spelling: cell.spelling,
      parse: cell.cell,
      nodes: tally.nodes,
      sole: tally.sole,
      carried: [...tally.carried]
        .map(([number, nodes]) => ({ number, nodes }))
        .sort((a, b) => b.nodes - a.nodes || a.number.localeCompare(b.number)),
    });
  }

  // Most attested first, since that is the order a reviewer wants to read them
  // in and the order a truncated report should keep. Everything after the count
  // is a tiebreak, so the order is the same on every run.
  contradictions.sort(
    (a, b) =>
      b.nodes - a.nodes ||
      a.file.localeCompare(b.file) ||
      a.root.localeCompare(b.root) ||
      a.spelling.localeCompare(b.spelling) ||
      a.parse.join(" ").localeCompare(b.parse.join(" ")),
  );

  return {
    versions,
    nodesScanned,
    cellsAttested: attested.size,
    contradictions,
  };
}

/** Every verse of every version whose codes a scheme on disk can read. */
function* everyTaggedVerse(): Generator<CorpusVerse> {
  const versions = fs
    .readdirSync(bibleVersionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  // A version declaring no scheme yields nothing, so no filter is needed here.
  for (const version of versions) yield* corpusVerses(version);
}

/** One contradiction as a single line, for the audit's own output. */
export function formatCellContradiction(
  contradiction: CellContradiction,
): string {
  const carried = contradiction.carried
    .map(({ number, nodes }) => `${number} ×${nodes}`)
    .join(", ");
  return (
    `${contradiction.file} ${contradiction.root} [${contradiction.pos} ${contradiction.rootStrongs.join(", ")}]` +
    ` / ${contradiction.spelling} [${contradiction.parse.join(" ")}] —` +
    ` explains ${contradiction.nodes} node(s), ${contradiction.sole} solely, carrying ${carried}`
  );
}
