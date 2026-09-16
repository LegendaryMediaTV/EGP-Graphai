/**
 * What a word's own printed ending proves about its parse, decided without
 * asking the lexical map anything.
 *
 * Every other morphology check in this repo settles a question by consulting
 * `lexical-maps/greek`. That is the right way to ask most questions and the
 * wrong way to ask this one, because the map was built downstream of the
 * corpora: a corpus error becomes a map cell, and the cell then vouches for the
 * error. `ἐργᾷ` is the clearest case. EXO 20:9 prints `ἐργᾷ` and `ἔργα` four
 * words apart and tags both `N-APN` with lemma `ἔργον`; the first is the verb,
 * "six days you shall labour". The map holds `ἐργᾷ` under `ἔργον` as a neuter
 * plural, so `auditCorpusMorphology` accounts for the code and reports nothing.
 * Only the printed ending can tell the two words apart, so only a check that
 * reads the ending can find it.
 *
 * **The rule.** A iota subscript on a nominal's last vowel marks the dative
 * singular of the first and second declensions, and marks nothing else. So a
 * word ending in one is dative and singular, and a word ending in a bare alpha,
 * eta or omega is not dative singular. Third-declension datives end in iota or
 * a diphthong and dative plurals in `-αις`, `-οις` or `-σι`, so neither
 * direction of the rule touches them.
 *
 * **One paradigm breaks it, and the rule would report a correct tag.** The
 * Attic declension takes `-ῳ` in the nominative plural as well as the dative
 * singular, so `νεῴ` and `ἵλεῳ` are both and no ending separates them. Only
 * `νεώς`, `ἵλεως` and `Κῶς` decline that way, and neither corpus prints a
 * plural of any of them. Exempting them would mean asking the codex for a
 * declension class, which is the one coupling this module exists without.
 *
 * **Two exemptions, both real.** A word carrying no accent is skipped: Rahlfs
 * accents every inflected Greek word and leaves transliterated Semitic names
 * bare, so `Φαραω` tagged `N-DSM` is an indeclinable standing in the dative
 * rather than a defect. A reading stating no case or no number is skipped,
 * which keeps adverbs and finite verbs out, `κρυφῇ` and `εἰκῇ` being frozen
 * datives that serve as adverbs.
 *
 * **This gates**, unlike the agreement audit beside it. The ending is printed
 * evidence and cannot be read two ways, so a finding is always a defect and
 * there is nothing for a person to overrule.
 *
 * **There is no auto-fix, and there cannot be one.** The rule says what a parse
 * cannot be, never what it is: a word wrongly tagged dative may be nominative,
 * vocative or accusative, and a bare alpha on an adjective may be a feminine
 * singular or a neuter plural. Only the clause decides between what is left.
 */

import { CorpusToken, corpusVerses } from "./corpusTokens";
import { inflectionCategories } from "./lexicon";

/** Combining Greek ypogegrammeni, the iota subscript's decomposed form. */
const YPOGEGRAMMENI = "ͅ";

/**
 * Any combining mark that is not the iota subscript.
 *
 * Used to tell an inflected Greek word from a transliterated Semitic name,
 * which Rahlfs leaves unaccented. The subscript is excluded on purpose: it is
 * not an accent, and a word wearing nothing else is still a bare name.
 */
const ACCENT = /[̀-̈́͆-ͯ]/;

/** A word's last Greek letter and the marks sitting on it. */
const FINAL_LETTER = /([Α-ω])([̀-ͯ]*)$/;

/** The vowels whose bare form the rule can speak about. See the module note. */
const BARE_VOWELS = "αηω";

/** Which of the rule's two directions a finding comes from. */
export type OrthographyRule = "subscript-is-dative-singular" | "bare-vowel-is-not-dative-singular";

/** One parse a word's own ending refutes. */
export interface OrthographyIssue {
  /** The rule direction that refutes it. */
  rule: OrthographyRule;
  /** The printed word, punctuation stripped. */
  word: string;
  /** The code as the corpus writes it. */
  morph: string;
  /** The case and number the code states, e.g. `"nom sg"`. */
  states: string;
  /** What the ending allows instead, in the same terms. */
  allows: string;
}

/** One issue, placed in the version it was read from. */
export interface OrthographyFinding extends OrthographyIssue {
  /** Book file, e.g. `"01-GEN.json"`. */
  file: string;
  /** Repo book id, e.g. `"GEN"`. */
  book: string;
  /** Chapter the word sits in. */
  chapter: number;
  /** Verse the word sits in. */
  verse: number;
}

/** What {@link auditCorpusOrthography} found in one version. */
export interface CorpusOrthographyAudit {
  /** Directory under `bible-versions` that was audited. */
  version: string;
  /** Every refuted parse, in document order. */
  findings: OrthographyFinding[];
  /** Readings carrying both a case and a number, so a short walk shows. */
  scanned: number;
}

/**
 * Whether a word's last vowel carries an iota subscript.
 *
 * Decided on the decomposed form, so the precomposed `ῃ`, the accented `ῇ` and
 * a base letter with its marks spelled out all answer alike.
 */
function endsInSubscript(word: string): boolean {
  const final = word.normalize("NFD").match(FINAL_LETTER);
  return final ? final[2].includes(YPOGEGRAMMENI) : false;
}

/** A word's last Greek letter, stripped of its marks, or `""` for none. */
function finalVowel(word: string): string {
  const final = word.normalize("NFD").match(FINAL_LETTER);
  return final ? final[1] : "";
}

/** Whether a word wears any mark other than the iota subscript. */
function isAccented(word: string): boolean {
  return ACCENT.test(word.normalize("NFD"));
}

/**
 * Every parse of one token that the token's own ending refutes.
 *
 * Pure, and the whole of this module's judgment. A token with no accented
 * spelling, and a reading stating no case or no number, yield nothing: see the
 * two exemptions in the module note.
 *
 * @param token One token from `verseSequences`.
 */
export function issuesInToken(token: CorpusToken): OrthographyIssue[] {
  const word = token.spellings[0] ?? "";
  if (!word || !isAccented(word)) return [];

  const categories = inflectionCategories();
  const subscript = endsInSubscript(word);
  if (!subscript && !BARE_VOWELS.includes(finalVowel(word))) return [];

  const issues: OrthographyIssue[] = [];
  for (const reading of token.readings) {
    if (!reading.parse) continue;
    const grammaticalCase = reading.parse.find((code) => categories.get(code) === "case");
    const number = reading.parse.find((code) => categories.get(code) === "number");
    if (!grammaticalCase || !number) continue;

    const states = `${grammaticalCase} ${number}`;
    const isDativeSingular = grammaticalCase === "dat" && number === "sg";

    if (subscript && !isDativeSingular) {
      issues.push({
        rule: "subscript-is-dative-singular",
        word,
        morph: reading.morph,
        states,
        allows: "dat sg",
      });
    } else if (!subscript && isDativeSingular) {
      issues.push({
        rule: "bare-vowel-is-not-dative-singular",
        word,
        morph: reading.morph,
        states,
        allows: "anything but dat sg",
      });
    }
  }
  return issues;
}

/**
 * Audit one version's parses against the words it prints.
 *
 * @param version Directory under `bible-versions`, e.g. `"LXX1935"`.
 */
export function auditCorpusOrthography(version: string): CorpusOrthographyAudit {
  const findings: OrthographyFinding[] = [];
  let scanned = 0;

  const categories = inflectionCategories();
  for (const verse of corpusVerses(version)) {
    for (const sequence of verse.sequences) {
      for (const token of sequence) {
        for (const reading of token.readings) {
          const hasCase = reading.parse?.some((code) => categories.get(code) === "case");
          const hasNumber = reading.parse?.some((code) => categories.get(code) === "number");
          if (hasCase && hasNumber) scanned++;
        }
        for (const issue of issuesInToken(token)) {
          findings.push({
            ...issue,
            file: verse.file,
            book: verse.book,
            chapter: verse.chapter,
            verse: verse.verse,
          });
        }
      }
    }
  }

  return { version, findings, scanned };
}

/** One finding as a line for the console. */
export function formatOrthographyFinding(finding: OrthographyFinding): string {
  const where = `${finding.book} ${finding.chapter}:${finding.verse}`;
  return `${where} ${finding.word} ${finding.morph} states ${finding.states}, ending allows ${finding.allows}`;
}
