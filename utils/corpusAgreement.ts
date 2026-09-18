/**
 * Agreement between words standing next to each other. A Greek article agrees
 * with its noun in case, number and gender, and nothing else in this repo
 * compares two nodes at all: `auditCorpusMorphology` hands its visitor a
 * spelling list and one code, so a pair that disagrees with each other, each
 * individually resolvable, passes every check there is.
 *
 * A lead generator, not a gate. Report-only, and it could not be anything else:
 * in every finding only a person can say which of the two words is wrong. It is
 * choked narrow for that reason, since a sweep whose findings are mostly Greek
 * is a sweep nobody reads. Three rules do the choking.
 *
 * **An article and the declinable noun after it**, reported only when the codex
 * already holds a pair of cells that agree, so nothing but the corpus's own
 * choice of reading is at fault. Most disagreements trace to the map instead,
 * and staying quiet about those is deliberate: correcting the corpus while the
 * map still says otherwise turns a silent defect into a failing morphology
 * audit. {@link CorpusAgreementAudit.reconcilable} is how many the restriction
 * let through, so the gap between it and `pairs` says how much is held back.
 *
 * **The adjective between an article and a noun that already agree.** Perhaps
 * half are real. A genitive between an article and its noun is ordinary Greek,
 * and `τὸν πάντων δεσπότην` trips this as readily as a mis-tagged ordinal does.
 *
 * **A second-attributive article against the article it repeats**, as in
 * `τὰ βοτρύδια τὰ …`. Both have to be printed the same way, so it fires only
 * where the corpus gives one spelling two codes inside one phrase, and it says
 * nothing about a phrase whose articles agree and whose adjective is the
 * mis-tagged word. No rule here compares an article to an adjective that no
 * noun completes.
 *
 * **What is deliberately not here: a bare adjective beside a noun.** Those
 * disagree far too often to be corpus rot, and the disagreements are Greek: an
 * adjective goes substantival, predicative, or comparative with a genitive of
 * comparison. `MAT 12:41 πλεῖον Ἰωνᾶ` and `MAT 26:66 Ἔνοχος θανάτου` are both
 * correct and both would trip it.
 *
 * **The blind spot: a pair wrong on both sides in the same direction agrees, so
 * no agreement check can ever see it.** 1ES 8:57 is the worked example. Silver
 * and gold were coordinated predicate nominatives, both tagged accusative, and
 * only gold surfaced because its article happened to disagree with its noun.
 * Reading the verses around a known defect is the only route to the rest.
 */

import {
  CorpusToken,
  cellsFor,
  corpusVerses,
  declaredScheme,
} from "./corpusTokens";
import { codexLookup, inflectionCategories } from "./lexicon";

/** The categories an article, an adjective and a noun agree in. */
const AGREEING = ["case", "number", "gender"] as const;

/** Which of the four rules a finding comes from. */
export type AgreementRule =
  | "article/noun"
  | "article/adjective/noun"
  | "article/adjective"
  | "article/article";

/** One disagreement, as the words alone can state it. */
export interface AgreementIssue {
  /** The rule that found it. */
  rule: AgreementRule;
  /** The printed words it compared, in document order, punctuation off. */
  words: string[];
  /** Each word's own codes, in the same order. */
  codes: string[][];
  /** The categories they disagree in, e.g. `["case"]`. */
  disagreeing: string[];
}

/** One disagreement, placed in the corpus. */
export interface AgreementFinding extends AgreementIssue {
  /** Book file, e.g. `"49-ISA.json"`. */
  file: string;
  /** Repo book id, e.g. `"ISA"`. */
  book: string;
  /** Chapter the words sit in. */
  chapter: number;
  /** Verse the words sit in. */
  verse: number;
}

/** What {@link agreementInSequence} found in one printed word sequence. */
export interface SequenceAgreement {
  /** Every disagreement, in document order. */
  issues: AgreementIssue[];
  /** Adjacent article and declinable-noun pairs seen at all. */
  pairs: number;
  /** Of those, the ones the codex holds an agreeing pair of cells for. */
  reconcilable: number;
}

/** What {@link auditCorpusAgreement} found in one version. */
export interface CorpusAgreementAudit {
  /** Directory under `bible-versions` that was audited. */
  version: string;
  /** The scheme the version declares, or null when its codes cannot be read. */
  scheme: string | null;
  /** Every disagreement, in document order. */
  findings: AgreementFinding[];
  /** Adjacent article and declinable-noun pairs seen, so a stalled walk shows. */
  pairs: number;
  /** Of those, the ones the codex holds an agreeing pair of cells for. */
  reconcilable: number;
}

/**
 * Audit one version's adjacent words against each other.
 *
 * @param version Directory under `bible-versions`, e.g. `"LXX1935"`.
 */
export function auditCorpusAgreement(version: string): CorpusAgreementAudit {
  const declared = declaredScheme(version);
  const audit: CorpusAgreementAudit = {
    version,
    scheme: declared?.id ?? null,
    findings: [],
    pairs: 0,
    reconcilable: 0,
  };
  if (!declared) return audit;

  for (const verse of corpusVerses(version)) {
    const at = {
      file: verse.file,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
    };
    for (const sequence of verse.sequences) {
      const found = agreementInSequence(sequence);
      audit.pairs += found.pairs;
      audit.reconcilable += found.reconcilable;
      for (const issue of found.issues)
        audit.findings.push({ ...at, ...issue });
    }
  }

  return audit;
}

/**
 * Put all three rules to one printed word sequence.
 *
 * Takes tokens rather than a verse so the rules can be put to a sequence
 * written by hand, with no corpus behind them.
 *
 * @param tokens One sequence from `verseSequences`, in document order.
 */
export function agreementInSequence(tokens: CorpusToken[]): SequenceAgreement {
  const categoryOf = inflectionCategories();
  const found: SequenceAgreement = { issues: [], pairs: 0, reconcilable: 0 };
  const asPos = (i: number, pos: string) =>
    inflectedAs(tokens[i], pos, categoryOf);

  for (let i = 0; i < tokens.length; i++) {
    const articles = asPos(i, "art");
    if (!articles.length) continue;

    const nouns = asPos(i + 1, "noun");
    // A pair that agrees raises no question, so the only pairs worth asking
    // about are the ones that do not, and those are also the only ones where
    // the article might be heading something else entirely.
    const disagree = nouns.length > 0 && !agrees(articles, nouns, categoryOf);
    if (
      nouns.length &&
      !(disagree && headsSomethingElse(tokens, i, articles, categoryOf))
    ) {
      found.pairs++;
      // The codex holding an agreeing pair of cells is what makes this the
      // corpus's own choice rather than a gap in the map.
      if (reconciles(tokens[i], tokens[i + 1], categoryOf)) {
        found.reconcilable++;
        if (disagree) {
          found.issues.push(
            issue(
              "article/noun",
              [tokens[i], tokens[i + 1]],
              differences(articles, nouns, categoryOf),
            ),
          );
        }
      }
    }

    const adjectives = asPos(i + 1, "adj");
    const after = asPos(i + 2, "noun");
    if (
      adjectives.length &&
      after.length &&
      agrees(articles, after, categoryOf)
    ) {
      // A genitive standing between an article and its noun is ordinary Greek
      // and not an attributive at all: `ὁ πάντων δεσπότης` is "the master of
      // all", with πάντων depending on δεσπότης rather than agreeing with it,
      // and `τὴν Ἐφεσίων πόλιν` is "the city of the Ephesians". It reads as an
      // attributive only when the phrase around it is itself genitive, which
      // `τῶν ἀφρόνων γυναικῶν` is. So a genitive inside a phrase that is not
      // genitive says nothing about agreement, and reporting it anyway buries
      // the real findings under fifteen pieces of correct Greek.
      //
      // A genitive phrase can hold one too, which is why the article's own case
      // is not the whole test: `τῆς ἑτέρων σπουδῆς` is "the earnestness of
      // others" and every word of it is genitive. What gives it away there is
      // number, since a dependent genitive owes the phrase no agreement at all
      // and `ἑτέρων` is plural inside a singular phrase. An attributive like
      // `τῶν ἀφρόνων γυναικῶν` matches in both and is still reported.
      const dependentGenitive =
        adjectives.every(
          (parse) => stated(parse, "case", categoryOf) === "gen",
        ) &&
        (!articles.some(
          (parse) => stated(parse, "case", categoryOf) === "gen",
        ) ||
          !articles.some((article) =>
            adjectives.some(
              (parse) =>
                stated(parse, "number", categoryOf) ===
                stated(article, "number", categoryOf),
            ),
          ));
      if (!dependentGenitive && !agrees(articles, adjectives, categoryOf)) {
        found.issues.push(
          issue(
            "article/adjective/noun",
            [tokens[i], tokens[i + 1], tokens[i + 2]],
            differences(articles, adjectives, categoryOf),
          ),
        );
      }
    }

    // An article and an adjective no noun completes, which is Greek's ordinary
    // way of naming a thing by a quality of it: `τῷ ἑβδόμῳ` is "in the seventh
    // [month]" and `τὸν δεύτερον` is "the second [stone]". The noun is not
    // printed, so the article is the only thing the adjective has to agree
    // with, and the two rules above never look at this shape: one wants a noun
    // beside the article and the other a noun after the adjective.
    //
    // Three guards keep it honest. An adjective in an oblique case the article
    // is not in is a dependent or an adverbial rather than a substantive, and
    // owes the article nothing: `2MC 9:6 τὸν πολλαῖς καὶ ξενιζούσαις
    // συμφοραῖς ... βασανίσαντα` is "him who tormented them with many strange
    // calamities", where the datives belong to `συμφοραῖς` and the article to
    // `βασανίσαντα`. The article must not be heading something further along,
    // which is what catches `DEU 13:8 τῶν μακρὰν`, where `μακράν` is adverbial
    // and the article belongs to a noun past it.
    //
    // And the adjective must really have no noun. `ACT 8:11` reads `διὰ τὸ
    // ἱκανῷ χρόνῳ ... ἐξεστακέναι`, where `τὸ` belongs to the infinitive and
    // `ἱκανῷ χρόνῳ` is a dative of time: the adjective has its noun, it simply
    // is not the article's. Asking about the noun after the *adjective* is what
    // separates that from `τῷ ἑβδόμῳ [μηνί]`, where nothing follows to complete
    // it.
    //
    // Case and number settle that, and gender deliberately does not. `DNT 6:16`
    // prints `τοῦ πᾶν ὁρισμὸν ... παραλλάξαι`, where `πᾶν` is neuter and
    // `ὁρισμὸν` masculine: the two disagree, but they disagree with each other,
    // and `τοῦ` heads the infinitive rather than either of them. Reporting that
    // against the article would name the wrong pair.
    const completing = asPos(i + 2, "noun");
    const attributive = completing.some((noun) =>
      adjectives.some(
        (parse) =>
          stated(parse, "case", categoryOf) ===
            stated(noun, "case", categoryOf) &&
          stated(parse, "number", categoryOf) ===
            stated(noun, "number", categoryOf),
      ),
    );
    const substantival = !attributive;
    if (
      adjectives.length &&
      substantival &&
      !agrees(articles, adjectives, categoryOf)
    ) {
      const dependent = adjectives.every((parse) => {
        const where = stated(parse, "case", categoryOf);
        return (
          (where === "gen" || where === "dat") &&
          !articles.some(
            (article) => stated(article, "case", categoryOf) === where,
          )
        );
      });
      if (!dependent && !headsSomethingElse(tokens, i, articles, categoryOf)) {
        found.issues.push(
          issue(
            "article/adjective",
            [tokens[i], tokens[i + 1]],
            differences(articles, adjectives, categoryOf),
          ),
        );
      }
    }
  }

  found.issues.push(...secondAttributives(tokens, categoryOf));
  return found;
}

/**
 * Two articles inside one noun phrase, in the only two shapes where they must
 * be one phrase rather than two.
 *
 * **`τὰ βοτρύδια τὰ μικρά`** — an article and its noun, then a second article
 * and an adjective no noun completes. The second article is not heading
 * anything of its own; it is a further reading of the noun just named, which is
 * ISA 18:5's own shape.
 *
 * **`τὰ μεγάλα καὶ τὰ μικρά`** — two articles each followed by an adjective and
 * no noun, joined by a conjunction. They are coordinated readings of one thing,
 * which is 2CH 36:18's and 1ES 1:51's shape.
 *
 * Both shapes insist the second article be followed by an adjective that no
 * noun completes, because an article followed by a noun of its own heads a
 * phrase of its own and owes the one before it nothing. Two further guards do
 * most of the work of keeping this precise, and both were put in against real
 * false positives:
 *
 * **The two articles must be printed the same way**, folded for case and for a
 * grave read as its acute. Greek repeats the *same* article to hang a second
 * modifier on one noun, because it agrees with the same noun; two different
 * forms in that slot are two phrases far more often than one. Without this,
 * `εἶδεν ὁ θεὸς τὰ πάντα` reads as article, noun, article, adjective and is a
 * subject beside an object.
 *
 * **Neither article may be genitive.** A genitive beside an article-headed
 * phrase is its dependent about as often as it is a second reading of it, and
 * nothing structural tells the two apart: `τοῦ αἵματος τοῦ δικαίου` and `τῶν
 * κτηνῶν τῶν καθαρῶν` print identically and only one of them is one phrase.
 * That costs the rule some genuine findings and is worth it.
 */
function secondAttributives(
  tokens: CorpusToken[],
  categoryOf: Map<string, string>,
): AgreementIssue[] {
  const issues: AgreementIssue[] = [];
  const asPos = (i: number, pos: string) =>
    inflectedAs(tokens[i], pos, categoryOf);
  /** An article with an adjective after it that no noun completes. */
  const attributive = (i: number) =>
    asPos(i, "art").length &&
    asPos(i + 1, "adj").length &&
    !asPos(i + 2, "noun").length;

  const compare = (first: number, second: number, between: number): void => {
    const left = asPos(first, "art");
    const right = asPos(second, "art");
    if (
      codexLookup(tokens[first].spellings[0]) !==
      codexLookup(tokens[second].spellings[0])
    )
      return;
    if (genitive(left, categoryOf) || genitive(right, categoryOf)) return;
    if (agrees(left, right, categoryOf)) return;
    issues.push(
      issue(
        "article/article",
        [tokens[first], tokens[between], tokens[second]],
        differences(left, right, categoryOf),
      ),
    );
  };

  for (let i = 0; i < tokens.length; i++) {
    const articles = asPos(i, "art");
    if (!articles.length) continue;

    // `τὰ βοτρύδια τὰ μικρά`, adjectives allowed before the noun. The article
    // and its own noun must agree first: without that, which of the three is
    // wrong is open, and the article/noun rule above already owns the question.
    let noun = i + 1;
    while (asPos(noun, "adj").length && !asPos(noun, "noun").length) noun++;
    if (
      asPos(noun, "noun").length &&
      agrees(articles, asPos(noun, "noun"), categoryOf)
    ) {
      if (attributive(noun + 1)) compare(i, noun + 1, noun);
      continue;
    }

    // `τὰ μεγάλα καὶ τὰ μικρά`.
    const conjunction = i + 2;
    if (!attributive(i)) continue;
    const joins = (tokens[conjunction]?.readings ?? []).some((reading) =>
      reading.parse?.includes("conj"),
    );
    if (joins && attributive(conjunction + 1))
      compare(i, conjunction + 1, conjunction);
  }

  return issues;
}

/** Whether every parse offered is genitive, which makes the word a dependent. */
function genitive(
  parses: string[][],
  categoryOf: Map<string, string>,
): boolean {
  return (
    parses.length > 0 &&
    parses.every((parse) => stated(parse, "case", categoryOf) === "gen")
  );
}

/**
 * The parses one token offers that inflect as this part of speech — which is
 * how every rule here asks what a word is, and is empty for the word beyond
 * either end of the sequence.
 */
function inflectedAs(
  token: CorpusToken | undefined,
  pos: string,
  categoryOf: Map<string, string>,
): string[][] {
  return (token?.readings ?? [])
    .filter(
      (reading) => reading.parse && inflects(reading.parse, pos, categoryOf),
    )
    .map((reading) => reading.parse!);
}

/**
 * Whether one parse inflects as this part of speech — so it says so, states a
 * case, a number and a gender, and is not marked as not inflecting at all.
 *
 * An indeclinable has no case marking, which the map records rather than
 * listing every case the word could stand in, and a corpus may narrow it from
 * context. Two words agree by what they are marked for, so a word marked for
 * nothing agrees with everything and is no evidence either way.
 */
function inflects(
  parse: string[],
  pos: string,
  categoryOf: Map<string, string>,
): boolean {
  if (!parse.includes(pos)) return false;
  if (parse.some((code) => code.startsWith("indecl"))) return false;
  return AGREEING.every(
    (category) => stated(parse, category, categoryOf) !== undefined,
  );
}

/** The code one parse states for one category, e.g. `case` -> `nom`. */
function stated(
  parse: string[],
  category: string,
  categoryOf: Map<string, string>,
): string | undefined {
  return parse.find((code) => categoryOf.get(code) === category);
}

/**
 * Whether some parse offered on the left agrees with some parse offered on the
 * right.
 *
 * A word printed once and parsed twice — 27 of them in BYZ2026, none in
 * LXX1935 — agrees if either parse does. **A side offering nothing agrees with
 * nothing**, which is the answer {@link reconciles} needs: a spelling the codex
 * holds no inflected cell for cannot be reconciled with anything.
 */
function agrees(
  left: string[][],
  right: string[][],
  categoryOf: Map<string, string>,
): boolean {
  return left.some((a) =>
    right.some((b) =>
      AGREEING.every(
        (c) => stated(a, c, categoryOf) === stated(b, c, categoryOf),
      ),
    ),
  );
}

/**
 * The categories two words differ in, for the line a reviewer reads.
 *
 * The first pair's, not an intersection across every pair: a twice-parsed word
 * that agrees on neither parse still differs one way at a time, and naming the
 * categories two parses have in common differs from naming the categories the
 * words differ in.
 */
function differences(
  left: string[][],
  right: string[][],
  categoryOf: Map<string, string>,
): string[] {
  for (const a of left) {
    for (const b of right) {
      const differing = AGREEING.filter(
        (category) =>
          stated(a, category, categoryOf) !== stated(b, category, categoryOf),
      );
      if (differing.length) return [...differing];
    }
  }
  return [];
}

/**
 * Whether the codex holds an article cell and a noun cell for these two
 * spellings that agree with each other — both fully inflected, so both state a
 * case, a number and a gender of their own.
 *
 * This is what separates a corpus that chose the wrong reading from a corpus
 * copying a map with only one to offer, and the whole reviewability of the
 * first rule rests on it. An indeclinable cell is no help and is not counted:
 * it says the word has no case marking at all, so a corpus narrowing it is
 * making a claim the codex cannot confirm or deny, which is a question about
 * the map rather than about this pair. `Σαλωμων` holding both an indeclinable
 * and a nominative cell is the map-side defect that shape belongs to.
 */
function reconciles(
  article: CorpusToken,
  noun: CorpusToken,
  categoryOf: Map<string, string>,
): boolean {
  const cells = (token: CorpusToken, pos: string) =>
    cellsFor(token)
      .map((entry) => entry.cell)
      .filter((cell) => inflects(cell, pos, categoryOf));
  return agrees(cells(article, "art"), cells(noun, "noun"), categoryOf);
}

/** How far past an article its own word can stand. */
const REACH = 4;

/**
 * Whether the article at `at` heads something other than the word beside it.
 *
 * The rule above pairs an article with the next word and takes that word for
 * the noun it heads. Greek puts other things in that slot often enough that the
 * assumption has to be tested rather than made, and both shapes below were
 * found by asking why the audit had pairs it could say nothing about:
 *
 * **Another word carries what the article carries.** `τῆς Καίσαρος οἰκίας` is
 * "the household of Caesar" and `τὰ κύκλῳ ἔθνη` is "the nations round about".
 * The article heads `οἰκίας` and `ἔθνη`; the genitive and the adverbial dative
 * between them are nobody's agreement partner. This is the same fact the
 * article/adjective/noun rule already uses when it asks whether the article
 * agrees with the word two along, stated once for any word within reach.
 *
 * **An infinitive follows.** `τοῦ ὄρη γενηθῆναι` is "for the mountains to be
 * made" and `τὸ θανάτῳ κωλύεσθαι` is "being prevented by death". The article
 * belongs to the infinitive, which carries no case of its own to agree with,
 * and the accusative between them is the infinitive's subject or object.
 *
 * **A second article is not evidence**, because an article is never the word
 * an article heads. `τὰ βοτρύδια τὰ μικρά` repeats the article to hang a
 * second modifier on one noun, so the `τὰ` further along agrees with the first
 * whatever `βοτρύδια` is tagged. Counting it would hide exactly the mis-tagged
 * noun this rule exists to find.
 *
 * The word beside the article stays its noun whenever none of these holds,
 * which is the ordinary case and the one the rule is about.
 */
function headsSomethingElse(
  tokens: CorpusToken[],
  at: number,
  articles: string[][],
  categoryOf: Map<string, string>,
): boolean {
  for (let j = at + 2; j <= at + REACH && j < tokens.length; j++) {
    const parses = (tokens[j].readings ?? [])
      .map((reading) => reading.parse)
      .filter((parse): parse is string[] => parse !== undefined);
    if (parses.some((parse) => parse.includes("inf"))) return true;
    const inflected = parses.filter(
      (parse) =>
        !parse.includes("art") &&
        AGREEING.every(
          (category) => stated(parse, category, categoryOf) !== undefined,
        ),
    );
    if (inflected.length && agrees(articles, inflected, categoryOf))
      return true;
  }
  return false;
}

/** One issue from the tokens it compared. */
function issue(
  rule: AgreementRule,
  tokens: CorpusToken[],
  disagreeing: string[],
): AgreementIssue {
  return {
    rule,
    words: tokens.map((token) => token.spellings[0]),
    codes: tokens.map((token) =>
      token.readings.map((reading) => reading.morph),
    ),
    disagreeing,
  };
}

/** One finding as a single line, for the audit's own output. */
export function formatAgreementFinding(finding: AgreementFinding): string {
  const phrase = finding.words
    .map((word, at) => `${word} [${finding.codes[at].join(" ")}]`)
    .join(" ");
  return `${finding.book} ${finding.chapter}:${finding.verse} ${phrase} — ${finding.rule} disagree in ${finding.disagreeing.join(", ")}`;
}
