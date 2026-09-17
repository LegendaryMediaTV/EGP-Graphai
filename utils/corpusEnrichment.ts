/**
 * Corpus-against-map coverage: how much of a version's Greek the lexical map
 * can actually name, and whether what the version stores still agrees with it.
 *
 * The auto-fix pass writes a `transliteration` on every script-tagged node and
 * fills in a missing `lemma` or `strong` wherever the map resolves one. That
 * leaves two questions a person wants a number for rather than a promise.
 *
 * **How much did it cover, and what did it decline?** Neither resolver ever
 * guesses, so a node with no lemma is a node the map could not narrow, and a
 * node with no Strong's number is usually a root the index simply has no number
 * for. Those are not faults to fix, and gating on them would leave
 * `npm run validate` permanently red over the LXX1935 nodes whose root has no
 * number at all. So this counts and does not fail; a coverage regression
 * shows up the way it does in the audits next door, as a number that moved.
 *
 * **Does the stored transliteration still agree?** That one gates. It is
 * derived data with exactly one right answer, the fix pass recomputes it on
 * every run, and a value still disagreeing afterwards can only mean the fixer
 * declined to write it — which is a defect in the pass, not a gap in the map.
 *
 * With one exception, which is counted rather than reported: a node storing its
 * own text verbatim is saying it does not romanize at all — a Greek alphabetic
 * numeral, letters standing for a number — and the fix pass holds it on purpose
 * (`utils/transliterateScriptRuns.ts`). Those are the nodes that would read as
 * disagreements here and are not. Counting them is what makes the exception
 * visible: the freeze preserves a value set equal to its text by mistake just
 * as faithfully as a deliberate one, and this number moving is the only way
 * that shows.
 */

import fs from "fs";
import path from "path";
import Content from "../types/Content";
import { mapContentNodes } from "../functions/mapContentText";
import {
  LemmaResolution,
  StrongsResolution,
  resolveLemma,
  resolveStrongs,
  transliterateText,
} from "./lexicon";

/** Directory holding one subdirectory per Bible version. */
const bibleVersionsDir = "./bible-versions";

/** One script-tagged node whose stored transliteration is not what its own text implies. */
export interface EnrichmentDisagreement {
  /** Book file, e.g. `"01-MAT.json"`. */
  file: string;
  /** Repo book id, e.g. `"MAT"`. */
  book: string;
  /** Chapter the node sits in. */
  chapter: number;
  /** Verse the node sits in. */
  verse: number;
  /** The node's printed text. */
  text: string;
  /** What the node stores, or the empty string when it stores nothing. */
  stored: string;
  /** What the registry's own table produces for that text. */
  expected: string;
}

/** How far one annotation field reaches across a version. */
export interface AnnotationCoverage {
  /** Nodes the map could be asked about at all. */
  candidates: number;
  /** Of those, how many carry the field. */
  carried: number;
  /** Why the rest do not, counted once per distinct reason. */
  unresolved: Map<string, number>;
}

/** What {@link auditCorpusEnrichment} found in one version. */
export interface CorpusEnrichmentAudit {
  /** Directory under `bible-versions` that was audited. */
  version: string;
  /** Text nodes declaring a script, which is the whole population the map is about. */
  scanned: number;
  /** Lemma coverage over nodes carrying a morphology code. */
  lemma: AnnotationCoverage;
  /** Strong's coverage over nodes carrying a lemma. */
  strongs: AnnotationCoverage;
  /** Stored transliterations the registry's table does not produce. This gates. */
  disagreements: EnrichmentDisagreement[];
  /**
   * Nodes storing their own text where the table would have produced something
   * else — the forms marked as not romanizing. Report-only.
   */
  held: number;
}

/**
 * Audit one version's lexical enrichment against the map.
 *
 * @param version Directory under `bible-versions`, e.g. `"LXX1935"`.
 */
export function auditCorpusEnrichment(version: string): CorpusEnrichmentAudit {
  const dir = path.join(bibleVersionsDir, version);
  const lemma: AnnotationCoverage = {
    candidates: 0,
    carried: 0,
    unresolved: new Map(),
  };
  const strongs: AnnotationCoverage = {
    candidates: 0,
    carried: 0,
    unresolved: new Map(),
  };
  const disagreements: EnrichmentDisagreement[] = [];
  const audit: CorpusEnrichmentAudit = {
    version,
    scanned: 0,
    lemma,
    strongs,
    disagreements,
    held: 0,
  };

  const versionFile = path.join(dir, "_version.json");
  if (!fs.existsSync(versionFile)) return audit;
  const morphology =
    JSON.parse(fs.readFileSync(versionFile, "utf-8")).morphology ?? undefined;

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

      // Returning undefined for every node makes this walker a visitor. Reusing
      // it rather than writing a second one is what keeps these counts about
      // exactly the nodes the fixer acted on.
      mapContentNodes(record.content as Content, (node) => {
        if (typeof node.text !== "string" || node.script === undefined)
          return undefined;
        audit.scanned++;

        const expected = transliterateText(node.text, node.script);
        if (expected !== null && (node.transliteration ?? "") !== expected) {
          // The held nodes are exactly the ones this check would otherwise
          // report, so counting them here rather than in a walk of their own
          // keeps the two numbers about one population.
          if (node.transliteration === node.text) audit.held++;
          else
            disagreements.push({
              ...at,
              text: node.text,
              stored: node.transliteration ?? "",
              expected,
            });
        }

        if (node.morph !== undefined) {
          lemma.candidates++;
          if (node.lemma !== undefined) lemma.carried++;
          else
            count(
              lemma.unresolved,
              resolveLemma({
                text: node.text,
                morph: node.morph,
                morphology,
                strong: node.strong,
              }),
              "lemma",
            );
        }

        if (node.lemma !== undefined) {
          strongs.candidates++;
          if (node.strong !== undefined) strongs.carried++;
          else
            count(
              strongs.unresolved,
              resolveStrongs({
                lemma: node.lemma,
                text: node.text,
                morph: node.morph,
                morphology,
              }),
              "Strong's number",
            );
        }

        return undefined;
      });
    }
  }

  return audit;
}

/**
 * Tally why one node carries no annotation.
 *
 * A resolution that *succeeded* is counted too, under a reason saying so, and
 * that is the useful one: it is the number of nodes something could fill in. On
 * a settled corpus it is zero for both fields, since the pass writes every
 * annotation it resolves, so a number here is the pass having declined.
 * Counting it also keeps the arithmetic closed: carried plus unresolved is the
 * candidates.
 */
function count(
  tally: Map<string, number>,
  resolution: LemmaResolution | StrongsResolution,
  field: string,
): void {
  const reason =
    "unresolved" in resolution
      ? resolution.unresolved
      : `the map resolves a ${field} this node does not carry`;
  tally.set(reason, (tally.get(reason) ?? 0) + 1);
}

/** One disagreement as a single line, for the audit's own output. */
export function formatEnrichmentDisagreement(
  disagreement: EnrichmentDisagreement,
): string {
  const stored =
    disagreement.stored === ""
      ? "nothing"
      : JSON.stringify(disagreement.stored);
  return `${disagreement.book} ${disagreement.chapter}:${disagreement.verse} ${JSON.stringify(
    disagreement.text,
  )} — stores ${stored}, its own text romanizes to ${JSON.stringify(disagreement.expected)}`;
}
