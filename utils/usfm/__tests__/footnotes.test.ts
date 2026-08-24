import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { buildFootnoteContent, buildIntroParagraphFootnote, capitalizeFootnoteOpening } from "../footnotes";
import { uniformFraction } from "../fractions";
import { Token, tokenize } from "../tokenize";
import { extractFootnoteBodiesIn, FOOTNOTES_IN_CORPUS } from "../verify";

/**
 * Every raw USFM snippet below is copied verbatim from the in-scope
 * WEBUS2020 corpus (guide §6's own discipline against hand-invented
 * fixtures) — cited by book/verse in each test's own title rather than
 * saved as a separate `.usfm` fixture file, since `buildFootnoteContent`
 * only ever needs the `\f`...`\f*` span itself, not the surrounding verse
 * context `segmentVerses.test.ts`'s own fixtures already exist to prove.
 *
 * @param raw - A real, verbatim USFM snippet containing exactly one
 *   `\f`...`\f*` span, with nothing but the span itself (or the span
 *   preceded by other tokens this helper skips past to find it).
 */
function footnoteFrom(raw: string, canonBookIds?: ReadonlySet<string>): ReturnType<typeof buildFootnoteContent> {
  const tokens: Token[] = tokenize(raw);
  const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "f");
  if (openIndex === -1) throw new Error(`footnoteFrom: no \\f open token found in: ${raw}`);
  return buildFootnoteContent(tokens, openIndex + 1, canonBookIds);
}

/** The 66-book in-scope canon. Duplicated, not imported, from `references.test.ts`'s identical constant — intentionally, per `imports/guide.md` §5: a verifying test shouldn't share code with the thing it verifies, and that caution extends to fixtures, not just production code. */
const IN_SCOPE_CANON = new Set([
  "GEN", "EXO", "LEV", "NUM", "DEU", "JSH", "JDG", "RTH", "1SM", "2SM", "1KG", "2KG",
  "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRV", "ECC", "SOS", "ISA", "JER",
  "LAM", "EZK", "DAN", "HOS", "JOL", "AMS", "OBD", "JNA", "MIC", "NAH", "HAB", "ZPH",
  "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TM", "2TM", "TIT", "PHM", "HEB", "JAS", "1PT",
  "2PT", "1JN", "2JN", "3JN", "JUD", "REV",
]);

describe("buildFootnoteContent — \\fr dropped, \\ft kept plain", () => {
  it("should drop \\fr's own reference label entirely, keeping only \\ft's own text (2 Kings 17:27's real shape, already this repo's established \\fr-drop precedent)", () => {
    const { footnote, plainText } = footnoteFrom('\\f + \\fr 17:27 \\ft Hebrew: \\fq them\\f*');
    expect(plainText).not.toContain("17:27");
    expect(footnote.content).toEqual(["Hebrew: ", { text: "them", marks: ["i"] }]);
    expect(footnote.type).toBe("trn");
  });

  it("should advance the caller past the matching \\f* close, to the very next token", () => {
    const tokens = tokenize('\\f + \\fr 2:12 \\ft or, aromatic resin\\f*\\w and|strong="H2091"\\w*');
    const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "f");
    const { nextIndex } = buildFootnoteContent(tokens, openIndex + 1);
    expect(tokens[nextIndex]).toMatchObject({ type: "open", name: "w" });
  });
});

describe("buildFootnoteContent — \\fq/\\fqa get marks: [\"i\"], \\ft does not", () => {
  it("should italicize \\fqa's own alternating quoted-name segments while leaving \\ft's own connecting prose plain (2 Chronicles 36:2's real \\fqa/\\ft-alternating shape) — tokenize()'s own mandatory one-space marker separator means only the *first* segment keeps a trailing space (real content, sitting between \\fqa and the next marker) and every later segment's own leading space is consumed as syntax, never content", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 36:2 \\fqa Joahaz \\ft is a variant of \\fqa Jehoahaz\\ft .\\f*');
    expect(footnote.content).toEqual([
      { text: "Joahaz ", marks: ["i"] },
      "is a variant of ",
      { text: "Jehoahaz", marks: ["i"] },
      ".",
    ]);
    expect(footnote.type).toBe("stu");
  });

  it("should italicize an entire \\fqa-quoted alternate-reading passage (Mark 16:8's own \"short ending of Mark\" quotation)", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 16:8 \\ft One isolated manuscript omits verses 9-20 but adds this “short ending of Mark” to the end of verse 8: \\fqa They told all that had been commanded them briefly to those around Peter.\\f*',
    );
    expect(footnote.type).toBe("var");
    const lastNode = (footnote.content as unknown[])[(footnote.content as unknown[]).length - 1];
    expect(lastNode).toEqual({
      text: "They told all that had been commanded them briefly to those around Peter.",
      marks: ["i"],
    });
  });
});

describe("buildFootnoteContent — original-script tagging", () => {
  it("should tag a \\+wh-delimited Hebrew word as {text, script: \"H\"} directly, no scan needed (Genesis 1:1's real Elohim gloss)", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 1:1 \\ft The Hebrew word rendered “God” is “\\+wh אֱלֹהִ֑ים\\+wh*” (Elohim).\\f*',
    );
    expect(footnote.content).toEqual([
      "The Hebrew word rendered “God” is “",
      { text: "אֱלֹהִ֑ים", script: "H" },
      "” (Elohim).",
    ]);
    // trn, not stu — saying a word was "rendered" is itself describing a
    // real translation choice, which footnoteTypeRules.ts classifies
    // accordingly.
    expect(footnote.type).toBe("trn");
  });

  it("should isolate a bare, undelimited Greek word with splitScriptRuns, with no delimiter to lean on (John 14:16's real \"παρακλητον\" gloss)", () => {
    const { footnote } = footnoteFrom(
      "\\f + \\fr 14:16 \\ft Greek παρακλητον: Counselor, Helper, Intercessor, Advocate, and Comforter.\\f*",
    );
    expect(footnote.content).toEqual([
      "Greek ",
      { text: "παρακλητον", script: "G" },
      ": Counselor, Helper, Intercessor, Advocate, and Comforter.",
    ]);
    expect(footnote.type).toBe("trn");
  });

  it("should tag both a delimited Hebrew word and a bare Greek word inside the same footnote body (1 Peter 2:6's real dual-language gloss — the one real corpus instance quoting both languages side by side)", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 2:6 \\ft “Behold”, from “\\+wh הִנֵּה\\+wh*” or “ἰδοὺ”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.\\f*',
    );
    expect(footnote.content).toEqual([
      "“Behold”, from “",
      { text: "הִנֵּה", script: "H" },
      "” or “",
      { text: "ἰδοὺ", script: "G" },
      "”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.",
    ]);
  });

  it('should leave splitScriptRuns\'s own "returns input unchanged when nothing matches" contract exercised for the overwhelming majority of footnote bodies, which carry no non-Latin text at all (a plain measurement note)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 6:15 \\ft A cubit is about 18 inches or 46 centimeters.\\f*');
    expect(footnote.content).toBe("A cubit is about 18 inches or 46 centimeters.");
  });
});

describe("buildFootnoteContent — classification reaches the built footnote's own type", () => {
  it('should classify a witness-naming note as var (Mark 16:8\'s "TR adds" note)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 16:8 \\ft TR adds “quickly”\\f*');
    expect(footnote.type).toBe("var");
  });

  it("should classify a plain background note as stu, the default, when nothing else applies (Genesis 25:26's name-etymology note)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 25:26 \\ft Isaac means “he laughs”.\\f*');
    expect(footnote.type).toBe("stu");
  });
});

/**
 * `normalizeFractionText` (`utils/usfm/fractions.ts`) is wired into the
 * `token.type === "text"` branch above so a raw fraction, however the
 * source spells it, comes out the far side already in this repo's own
 * convention — both in the footnote's own displayed `content` and in
 * `plainText` (`classificationText`), since `segmentVerses.ts`'s own
 * empty-verse fallback (a footnote-only verse, e.g. Luke 17:36) reads
 * `plainText` directly, not `content`.
 */
describe("buildFootnoteContent — fraction normalization", () => {
  it("should normalize a genuine ASCII fraction in a footnote's own displayed content (Exodus 16:36's real footnote)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 16:36 \\ft 1 ephah is about 22 liters or about 2/3 of a bushel\\f*');
    expect(footnote.content).toBe(`1 ephah is about 22 liters or about ${uniformFraction("2", "3")} of a bushel`);
  });

  it("should normalize every precomposed vulgar-fraction glyph in one footnote body, all three in one string (Exodus 27:1's real footnote)", () => {
    const { footnote } = footnoteFrom(
      "\\f + \\fr 27:1 \\ft The altar was to be about 2.3×2.3×1.4 meters or about 7½×7½×4½ feet.\\f*",
    );
    const half = uniformFraction("1", "2");
    expect(footnote.content).toBe(
      `The altar was to be about 2.3×2.3×1.4 meters or about 7${half}×7${half}×4${half} feet.`,
    );
  });

  it("should also normalize plainText/classificationText, not just the displayed content, so classifyFootnote and segmentVerses.ts's own empty-verse fallback see the identical normalized text the display already carries (Exodus 16:36's real footnote again, checked from the plainText side this time)", () => {
    const { plainText } = footnoteFrom('\\f + \\fr 16:36 \\ft 1 ephah is about 22 liters or about 2/3 of a bushel\\f*');
    expect(plainText).toBe(`1 ephah is about 22 liters or about ${uniformFraction("2", "3")} of a bushel`);
  });
});

/**
 * `capitalizeFootnoteOpening` (this module) runs on `pieces[0]` right
 * after the token walk builds it, so a footnote's own displayed text
 * starts with a capital letter — matching upstream `HEAD`'s real,
 * measured convention (27 real regressions plus a 42-case unnormalized
 * backlog, both capitalized alike), except WEB's own `or, <alternate>`
 * house style, which stays lowercase by design. Every fixture below is
 * real, verbatim raw USFM, read directly off
 * `imports/webus2020/ebible-usfm/*.usfm`, matching this file's own
 * established discipline against hand-invented fixtures.
 */
describe("buildFootnoteContent — footnote-initial capitalization", () => {
  it('should capitalize Leviticus 11:5\'s own real regression, the user\'s own named fixture ("or rock badger, or cony" — no comma after the first "or", so it does not qualify for the or, exception below)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 11:5 \\ft or rock badger, or cony\\f*');
    expect(footnote.content).toBe("Or rock badger, or cony");
  });

  it('should capitalize Leviticus 19:16\'s own real regression, the user\'s own second named fixture ("literally, “blood”")', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 19:16 \\ft literally, “blood”\\f*');
    expect(footnote.content).toBe("Literally, “blood”");
  });

  it('should capitalize a second real "literally," regression in a different book (Matthew 6:27\'s "literally, cubit" — 23 of the 27 real regressions share this exact opener)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 6:27 \\ft literally, cubit\\f*');
    expect(footnote.content).toBe("Literally, cubit");
  });

  it('should capitalize Deuteronomy 33:2\'s own real regression, "another manuscript reads..." (the one real "another"-opening regression)', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 33:2 \\ft another manuscript reads “He came with myriads of holy ones from the south, from his mountain slopes.”\\f*',
    );
    expect(footnote.content).toBe("Another manuscript reads “He came with myriads of holy ones from the south, from his mountain slopes.”");
    expect(footnote.type).toBe("var");
  });

  it('should capitalize 1 Corinthians 12:2\'s own real regression, "or Gentiles" — "or" with no trailing comma still capitalizes, unlike the or, exception below', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 12:2 \\ft or Gentiles\\f*');
    expect(footnote.content).toBe("Or Gentiles");
  });

  it('should recapitalize the *whole* witness siglon, not just its own leading letter, for Acts 4:27\'s own real regression — a real source-side casing slip ("nu adds...") against 200+ already-upper-case "NU" occurrences elsewhere in the corpus; upstream HEAD carries "NU adds...", not "Nu adds..."', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 4:27 \\ft nu adds “in this city,”\\f*');
    expect(footnote.content).toBe("NU adds “in this city,”");
    expect(footnote.type).toBe("var");
  });

  it('should leave a real "or," (comma immediately after) footnote exactly as it is, lowercase — the one, 100%-consistent exception (Genesis 1:29\'s real "or, aromatic resin")', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 1:29 \\ft or, aromatic resin\\f*');
    expect(footnote.content).toBe("or, aromatic resin");
  });

  it('should leave a second real "or," footnote unchanged in a different book (Matthew 23:5\'s own second footnote, "or, tassels")', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 23:5 \\ft or, tassels\\f*');
    expect(footnote.content).toBe("or, tassels");
    expect(footnote.type).toBe("trn");
  });

  it('should capitalize a representative sample of the lowercase-backlog set — real bodies already lowercase in both HEAD and the current output, with no textual signal of their own tying them together, capitalized the same way regressions are (1 Samuel 15:23\'s "teraphim were household idols...")', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 15:23 \\ft teraphim were household idols that may have been associated with inheritance rights to the household property.\\f*',
    );
    expect(footnote.content).toBe(
      "Teraphim were household idols that may have been associated with inheritance rights to the household property.",
    );
  });

  it('should capitalize a second lowercase-backlog fixture, a plain-English unit-of-measure gloss (Exodus 30:13\'s "a gerah is about 0.5 grams...")', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 30:13 \\ft a gerah is about 0.5 grams or about 7.7 grains\\f*');
    expect(footnote.content).toBe("A gerah is about 0.5 grams or about 7.7 grains");
  });

  it('should capitalize a third lowercase-backlog fixture (1 Chronicles 29:7\'s "a daric was a gold coin...")', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 29:7 \\ft a daric was a gold coin issued by a Persian king, weighing about 8.4 grams or about 0.27 troy ounces each.\\f*',
    );
    expect(footnote.content).toBe(
      "A daric was a gold coin issued by a Persian king, weighing about 8.4 grams or about 0.27 troy ounces each.",
    );
  });

  it('should capitalize a fourth lowercase-backlog fixture, a time-of-day gloss (Matthew 20:5\'s "noon and 3:00 p.m.")', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 20:5 \\ft noon and 3:00 p.m.\\f*');
    expect(footnote.content).toBe("Noon and 3:00 p.m.");
  });

  it('should capitalize a fifth lowercase-backlog fixture, an "i.e.," opener (Deuteronomy 27:20\'s "i.e., has sexual relations with")', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 27:20 \\ft i.e., has sexual relations with\\f*');
    expect(footnote.content).toBe("I.e., has sexual relations with");
  });

  it("should leave a footnote whose first piece is already uppercase untouched (Mark 4:4's real \"TR adds…\" witness note — already matches upstream HEAD, nothing to fix)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 4:4 \\ft TR adds “of the air”\\f*');
    expect(footnote.content).toBe("TR adds “of the air”");
  });

  it('should leave a footnote whose first character is a digit untouched — not an ASCII letter at all (Exodus 16:36\'s real fraction fixture, already covered from the fraction-normalization angle above — this is the same body proving the /[a-z]/ guard from the casing angle)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 16:36 \\ft 1 ephah is about 22 liters or about 2/3 of a bushel\\f*');
    expect(footnote.content).toBe(`1 ephah is about 22 liters or about ${uniformFraction("2", "3")} of a bushel`);
  });

  it("should leave a footnote whose first piece is a script-tagged Hebrew word untouched — no real in-scope footnote body ever opens this way (buildFootnoteContent's own doc comment), so this is a synthetic fixture proving the /[a-z]/ guard covers a script piece too, not only a plain-Latin one", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 1:1 \\ft \\+wh בְּרֵאשִׁית\\+wh* is the first word\\f*');
    expect(footnote.content).toEqual([{ text: "בְּרֵאשִׁית", script: "H" }, " is the first word"]);
  });

  /**
   * Two real footnotes (Deuteronomy 33:16, Matthew 23:5) never matched a
   * `HEAD` counterpart by a per-footnote, book/chapter/verse/text sweep, both
   * for the identical real reason: upstream `HEAD` embeds a real `bibleLink`
   * node for a trailing in-body scripture reference ("Exodus 3:3–4",
   * "Deuteronomy 6:8") that the raw USFM carries as plain, unmarked prose
   * with no `\+xt`/`\x` structural marker of its own. Finding 9's own
   * `linkEmbeddedReferences` (`usfm/references.ts`) now closes this gap
   * generically — Matthew 23:5's own "...See Deuteronomy 6:8." matches
   * upstream `HEAD` exactly (modulo the intentional, already-accepted
   * capitalization divergence below). Deuteronomy 33:16 used to be treated
   * as a separate, harder exception (Phase 14: its own cue is "of," a
   * single, unevidenced instance too common to safely generalize into a
   * third cue word) with its own verse-specific override applied later in
   * `imports/webus2020/import.ts`. Phase 15 found the cue-word requirement
   * itself was the wrong safeguard and redesigned `linkEmbeddedReferences`
   * to link any real, fully-qualified, registry-resolvable reference found
   * anywhere in the body, no cue word required — "Exodus 3:3-4" names its
   * own book explicitly, so it now links right here, through the same
   * generic mechanism as everything else, with no separate override needed
   * at all.
   */
  it('should link Deuteronomy 33:16\'s real "the burning bush of Exodus 3:3-4" through the generic mechanism, no cue word or separate override needed — "Exodus 3:3-4" names its own book explicitly, matching upstream HEAD\'s own exact shape (modulo the dash character, a separate, later, post-write convention this module never applies)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 33:16 \\ft i.e., the burning bush of Exodus 3:3-4.\\f*');
    expect(footnote.content).toEqual(["I.e., the burning bush of ", { bibleLink: "Exodus 3:3-4" }, "."]);
    expect(footnote.type).toBe("stu");
  });

  it('should link Matthew 23:5\'s real embedded "See Deuteronomy 6:8." to a real bibleLink, now matching upstream HEAD\'s own exact content shape — the capitalized "Phylacteries..." opening is a real, already-accepted, intentional divergence from upstream\'s own lowercase wording (a transliterated term, backlog-shaped, capitalized anyway under this importer\'s general "capitalize all of them" rule), unrelated to and unaffected by Finding 9\'s own separate fix', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 23:5 \\ft phylacteries (tefillin in Hebrew) are small leather pouches that some Jewish men wear on their forehead and arm in prayer. They are used to carry a small scroll with some Scripture in it. See Deuteronomy 6:8.\\f*',
    );
    expect(footnote.content).toEqual([
      "Phylacteries (tefillin in Hebrew) are small leather pouches that some Jewish men wear on their forehead and arm in prayer. They are used to carry a small scroll with some Scripture in it. See ",
      { bibleLink: "Deuteronomy 6:8" },
      ".",
    ]);
    expect(footnote.type).toBe("stu");
  });
});

describe("buildFootnoteContent — zero \\w/\\+w tags ever occur inside a footnote body in this corpus (confirmed directly, not assumed)", () => {
  it("should have nothing special to do when a footnote body carries no Strong's-tagged word — buildRunNodes's own generic machinery handles the plain-prose case unchanged", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 1:29 \\ft or, aromatic resin\\f*');
    expect(footnote.content).toBe("or, aromatic resin");
  });
});

/**
 * `\fl` — a footnote sub-marker Esther-Greek carries 33 times, in no
 * 66-book canonical file at all. An unrecognized `\fl` falls through to
 * the generic "skip and keep walking" branch without updating
 * `currentSubMarker`, so its own text — and the text of whatever sub-marker
 * follows it — would silently drop or misattach if it were not a member of
 * `KEPT_SUB_MARKERS`. Every fixture below is real, verbatim
 * `43-ESGeng-web.usfm` text.
 */
describe("buildFootnoteContent — \\fl (Esther-Greek's own footnote label sub-marker)", () => {
  it("should keep an \\fl label's own text in the footnote body, feeding footnoteTypeRules the label it needs to classify correctly (Esther-Greek 1:11's real \"Greek\"-labeled note)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 1:11 \\fl Greek \\ft to make her queen.\\f*');
    expect(footnote.content).toBe("Greek to make her queen.");
    expect(footnote.type).toBe("trn");
  });

  it("should keep both labels, in source order, when a body carries two \\fl markers (Esther-Greek 1:1's own real double-\\fl note)", () => {
    const { footnote, plainText } = footnoteFrom(
      "\\f + \\fr 1:1 \\fl Note: \\ft In the \\fl Hebrew \\ft and some copies of LXX, Esther begins here.\\f*",
    );
    expect(plainText).toBe("Note: In the Hebrew and some copies of LXX, Esther begins here.");
    expect(footnote.type).toBe("var");
  });

  it('should keep a standalone \\fl "Or," label\'s own text, classifying trn the same way the spelled-out \\ft "or," opener already does (Esther-Greek 4:43)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 4:43 \\fl Or, \\ft opinion.\\f*');
    expect(footnote.content).toBe("Or, opinion.");
    expect(footnote.type).toBe("trn");
  });

  it("should keep an \\fl \"Hebrew\"-labeled note's own text, classifying stu — a bare witness name with no live English alternative offered (Esther-Greek 3:13)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 3:13 \\fl Note: \\ft The part in brackets is not in \\fl Hebrew\\f*');
    expect(footnote.content).toBe("Note: The part in brackets is not in Hebrew");
    expect(footnote.type).toBe("stu");
  });
});

/**
 * Confirms already-established footnote-handling mechanisms fire
 * correctly against the deuterocanon corpus's own real fixtures too, with
 * zero code change (guide's own "a real fixture-backed regression test,
 * not resting on an untested doc-comment claim" discipline).
 */
describe("buildFootnoteContent — deuterocanon regressions for already-established mechanisms", () => {
  it("should tag each of \\+bk/\\+bk*'s 3 real book-title citations marks: [\"i\"], even inside a footnote that itself sits inside an \\s1 span (Daniel 3:24's real footnote, Finding 6) — its own trailing \"between Daniel 3:23 and Daniel 3:24\" also links both, a real, independent side effect of Finding 9's redesigned scan (Phase 15) finding two fully-qualified references with nothing but a bare book-name repeat sitting between them", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 3:24 \\ft \\+bk The Song of the Three Holy Children\\+bk* is an addition to \\+bk Daniel\\+bk* found in the Greek Septuagint but not found in the traditional Hebrew text of \\+bk Daniel\\+bk*. This portion is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. It is found inserted between Daniel 3:23 and Daniel 3:24 of the traditional Hebrew Bible. Here, the verses after 23 from the Hebrew Bible are numbered starting at 91 to make room for these verses.\\f*',
    );
    expect(footnote.content).toEqual([
      { text: "The Song of the Three Holy Children", marks: ["i"] },
      " is an addition to ",
      { text: "Daniel", marks: ["i"] },
      " found in the Greek Septuagint but not found in the traditional Hebrew text of ",
      { text: "Daniel", marks: ["i"] },
      ". This portion is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. It is found inserted between ",
      { bibleLink: "Daniel 3:23" },
      " and ",
      { bibleLink: "Daniel 3:24" },
      " of the traditional Hebrew Bible. Here, the verses after 23 from the Hebrew Bible are numbered starting at 91 to make room for these verses.",
    ]);
  });

  it("should tag all 4 of \\+bk/\\+bk*'s real citations marks: [\"i\"] in Daniel 13:1's own real footnote — a different repeat shape than 3:24's (the book title repeats, not \"Daniel\")", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 13:1 \\ft \\+bk The History of Susanna\\+bk* is translated from chapter 13 of \\+bk Daniel\\+bk* in the Greek Septuagint. It is not found in the traditional Hebrew text of \\+bk Daniel\\+bk*. \\+bk The History of Susanna\\+bk* is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.\\f*',
    );
    expect(footnote.content).toEqual([
      { text: "The History of Susanna", marks: ["i"] },
      " is translated from chapter 13 of ",
      { text: "Daniel", marks: ["i"] },
      " in the Greek Septuagint. It is not found in the traditional Hebrew text of ",
      { text: "Daniel", marks: ["i"] },
      ". ",
      { text: "The History of Susanna", marks: ["i"] },
      " is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.",
    ]);
  });

  it("should tag all 4 of \\+bk/\\+bk*'s real citations marks: [\"i\"] in Daniel 14:1's own real footnote (Bel and the Dragon)", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 14:1 \\ft \\+bk Bel and the Dragon\\+bk* is translated from chapter 14 of \\+bk Daniel\\+bk* in the Greek Septuagint. It is not found in the traditional Hebrew text of \\+bk Daniel\\+bk*. \\+bk Bel and the Dragon\\+bk* is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.\\f*',
    );
    expect(footnote.content).toEqual([
      { text: "Bel and the Dragon", marks: ["i"] },
      " is translated from chapter 14 of ",
      { text: "Daniel", marks: ["i"] },
      " in the Greek Septuagint. It is not found in the traditional Hebrew text of ",
      { text: "Daniel", marks: ["i"] },
      ". ",
      { text: "Bel and the Dragon", marks: ["i"] },
      " is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.",
    ]);
  });

  it("should tag a \\+wh-delimited Hebrew word inside the deuterocanon corpus the same way it already does in the 66-book canonical corpus (Daniel 1:2's real Elohim gloss)", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 1:2 \\ft The Hebrew word rendered “God” is “\\+wh אֱלֹהִ֑ים\\+wh*” (Elohim).\\f*',
    );
    expect(footnote.content).toEqual(["The Hebrew word rendered “God” is “", { text: "אֱלֹהִ֑ים", script: "H" }, "” (Elohim)."]);
  });

  it('should tag a \\+wh-delimited Hebrew word for the "Behold"/Hinneh gloss the deuterocanon corpus also carries (Daniel 2:31)', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 2:31 \\ft “Behold”, from “\\+wh הִנֵּה\\+wh*”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.\\f*',
    );
    expect(footnote.content).toEqual([
      "“Behold”, from “",
      { text: "הִנֵּה", script: "H" },
      "”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.",
    ]);
  });

  it("should isolate a bare, undelimited Greek word with splitScriptRuns in the deuterocanon corpus too, needing no \\fl fix at all (2 Maccabees 5:24's real \"Μυσάρχην\" gloss — this note carries \\ft/\\fqa only, no \\fl)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 5:24 \\ft Gr. \\fqa Μυσάρχην, \\ft which also may mean \\fqa ruler of the Mysians. \\f*');
    expect(footnote.content).toEqual([
      "Gr. ",
      { text: "Μυσάρχην", script: "G", marks: ["i"] },
      { text: ", ", marks: ["i"] },
      "which also may mean ",
      { text: "ruler of the Mysians.", marks: ["i"] },
    ]);
    expect(footnote.type).toBe("trn");
  });
});

/**
 * 9 real deuterocanon footnote bodies across 5 books are "nothing but a
 * reference" (guide §6's own `xrf` test) — a shape the 66-book canonical
 * corpus never produces. Reuses `usfm/references.ts`'s own
 * `buildReferenceOnlyContent` (already directly tested in
 * `references.test.ts`) rather than leaving the body as unresolved plain
 * text under a `type: "xrf"` tag.
 */
describe("buildFootnoteContent — an \\f body that is nothing but a reference resolves like a real cross-reference", () => {
  it('should resolve a "See "-led reference-only \\f body to a real bibleLink, not leave it as unresolved plain text (Baruch 1:11\'s real note)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 1:11 \\ft See Deuteronomy 11:21. \\f*', IN_SCOPE_CANON);
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual({ bibleLink: "Deuteronomy 11:21", content: "See Deuteronomy 11:21" });
  });

  it('should resolve a "Compare "-led reference-only \\f body the same way (1 Maccabees 4:40\'s real note — "Compare " never occurs in a real \\xt target, only here)', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 4:40 \\ft Compare Numbers 31:6.\\f*', IN_SCOPE_CANON);
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual({ bibleLink: "Numbers 31:6", content: "Compare Numbers 31:6" });
  });

  it("should resolve a bare reference-only \\f body with no lead-in word at all, to the canonical singular \"Psalm\" target (1 Maccabees 7:17's real note, Finding 8b)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 7:17 \\ft Psalms 79:2, 3.\\f*', IN_SCOPE_CANON);
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual({ bibleLink: "Psalm 79:2, 3", content: "Psalms 79:2, 3" });
  });

  it("should resolve a semicolon-joined multi-target reference-only \\f body the same \"; \"-joining way \\x already does, the Psalms target resolving to canonical singular \"Psalm\" (Wisdom 11:4's real note, Finding 8b)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 11:4 \\ft See Deuteronomy 8:15; Psalms 114:8.\\f*', IN_SCOPE_CANON);
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual([
      { bibleLink: "Deuteronomy 8:15", content: "See Deuteronomy 8:15" },
      "; ",
      { bibleLink: "Psalm 114:8", content: "Psalms 114:8" },
    ]);
  });

  it("should still classify and resolve correctly when canonBookIds is omitted entirely (no canon restriction), matching buildReferenceOnlyContent's own default", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 10:26 \\ft See Exodus 23:22.\\f*');
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual({ bibleLink: "Exodus 23:22", content: "See Exodus 23:22" });
  });

  it("should leave an ordinary, non-reference-only \\f body exactly as before — this fix only ever changes an xrf-classified body's own content (2 Kings 17:27's real \\fq-shaped note, already covered above, re-asserted here to prove no cross-talk between the two code paths)", () => {
    const { footnote } = footnoteFrom('\\f + \\fr 17:27 \\ft Hebrew: \\fq them\\f*', IN_SCOPE_CANON);
    expect(footnote.type).toBe("trn");
    expect(footnote.content).toEqual(["Hebrew: ", { text: "them", marks: ["i"] }]);
  });
});

/**
 * Every one of the 16 real `\ip` blocks (14 files, Esther-Greek and
 * Sirach carrying two apiece) becomes a footnote on that book's own verse
 * 1:1. `\ip` is unpaired (no `\ip*`) and, like `\d`/`\sp`/`\s1`, its own
 * span ends at the next marker of any kind — but unlike those constructs,
 * `\ip` bodies carry no `\fr`/`\ft`/`\fq` sub-marker grammar of their own
 * at all (every one of the 16 is bare prose, occasionally wrapping a `\bk`
 * book-title citation), so `buildFootnoteContent`'s own sub-marker-aware
 * walk has nothing to key `currentSubMarker` off unless this wraps the
 * span in a synthetic `\ft` marker first — literal reuse of that
 * function's own body-building and classification logic, rather than a
 * second, parallel body-builder.
 */
describe("buildIntroParagraphFootnote — \\ip", () => {
  /** Finds the first `\ip` marker in `raw` and builds its footnote, mirroring `footnoteFrom`'s own shape for `\f`. */
  function introFootnoteFrom(raw: string): ReturnType<typeof buildIntroParagraphFootnote> {
    const tokens: Token[] = tokenize(raw);
    const ipIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "ip");
    if (ipIndex === -1) throw new Error(`introFootnoteFrom: no \\ip marker found in: ${raw}`);
    return buildIntroParagraphFootnote(tokens, ipIndex + 1);
  }

  it("should build a plain-prose \\ip block's own text into a footnote, tagging its single embedded \\bk citation marks: [\"i\"] rather than dropping it as plain text (Tobit's real editorial blurb, Finding 6)", () => {
    const { footnote } = introFootnoteFrom(
      "\\ip \\bk Tobit\\bk* is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.  \n\\c 1",
    );
    expect(footnote.content).toEqual([
      { text: "Tobit", marks: ["i"] },
      " is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.",
    ]);
  });

  it("should keep all three of an \\ip block's own embedded \\bk citations, in source order, each tagged marks: [\"i\"] — the highest-multiplicity real instance in the whole corpus (2 Esdras' real editorial blurb)", () => {
    const { footnote } = introFootnoteFrom(
      "\\ip \\bk The Second Book of Esdras\\bk* is included in the Slavonic Bible as \\bk 3 Esdras\\bk*, but is not found in the Greek Septuagint. It is included in the Appendix to the Latin Vulgate Bible as \\bk 4 Esdras\\bk*. It is considered to be Apocrypha by most church traditions. It is preserved here for its supplementary historical value.  \n\\c 1",
    );
    expect(footnote.content).toEqual([
      { text: "The Second Book of Esdras", marks: ["i"] },
      " is included in the Slavonic Bible as ",
      { text: "3 Esdras", marks: ["i"] },
      ", but is not found in the Greek Septuagint. It is included in the Appendix to the Latin Vulgate Bible as ",
      { text: "4 Esdras", marks: ["i"] },
      ". It is considered to be Apocrypha by most church traditions. It is preserved here for its supplementary historical value.",
    ]);
  });

  it("should keep both of an \\ip block's own two embedded \\bk citations, in source order, each tagged marks: [\"i\"] (Baruch's real editorial blurb, also naming the Septuagint — a real var-classified \\ip, not every one is stu)", () => {
    const { footnote } = introFootnoteFrom(
      "\\ip The book of \\bk Baruch\\bk* is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. In some Bibles, Baruch chapter 6 is listed as a separate book called \\bk The Letter of Jeremiah\\bk*, reflecting its separation from Baruch in some copies of the Greek Septuagint.  \n\\c 1",
    );
    expect(footnote.content).toEqual([
      "The book of ",
      { text: "Baruch", marks: ["i"] },
      " is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. In some Bibles, Baruch chapter 6 is listed as a separate book called ",
      { text: "The Letter of Jeremiah", marks: ["i"] },
      ", reflecting its separation from Baruch in some copies of the Greek Septuagint.",
    ]);
    expect(footnote.type).toBe("var");
  });

  it("should stop the span at the very next marker, whatever it is, and hand the caller back that unconsumed token — both of its own embedded \\bk citations still tagged marks: [\"i\"] (Sirach's own real \\ip stopping at \\is1, not at any \\ip-specific close tag)", () => {
    const tokens = tokenize(
      "\\ip \\bk The Wisdom of Jesus the Son of Sirach\\bk*, also called \\bk Ecclesiasticus\\bk*, is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.  \n\\is1 The Prologue of the Wisdom of Jesus the Son of Sirach.  \n\\ip WHEREAS many and great things have been delivered to us.",
    );
    const ipIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "ip");
    const { footnote, nextIndex } = buildIntroParagraphFootnote(tokens, ipIndex + 1);
    expect(footnote.content).toEqual([
      { text: "The Wisdom of Jesus the Son of Sirach", marks: ["i"] },
      ", also called ",
      { text: "Ecclesiasticus", marks: ["i"] },
      ", is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.",
    ]);
    expect(tokens[nextIndex]).toEqual({ type: "marker", name: "is1" });
  });

  it("should build Sirach's own second \\ip — the real, ancient Prologue to Sirach, not modern editorial commentary — the identical way as any other \\ip block (no special-casing by content)", () => {
    const { footnote } = introFootnoteFrom(
      "\\ip WHEREAS many and great things have been delivered to us by the law and the prophets, for which we must give Israel the praise for instruction and wisdom.  \n\\c 1",
    );
    expect(footnote.content).toBe(
      "WHEREAS many and great things have been delivered to us by the law and the prophets, for which we must give Israel the praise for instruction and wisdom.",
    );
  });

  it("should build two \\ip blocks at the same attachment point as two independent footnotes, in source order, not one merged body (Esther-Greek's own real two-block introduction)", () => {
    const tokens = tokenize(
      "\\ip First block text.  \n\\ip Second block text.  \n\\c 1",
    );
    const firstIpIndex = tokens.findIndex((token) => token.type === "marker" && token.name === "ip");
    const first = buildIntroParagraphFootnote(tokens, firstIpIndex + 1);
    expect(first.footnote.content).toBe("First block text.");
    expect(tokens[first.nextIndex]).toEqual({ type: "marker", name: "ip" });

    const second = buildIntroParagraphFootnote(tokens, first.nextIndex + 1);
    expect(second.footnote.content).toBe("Second block text.");
  });
});

/**
 * A real, corpus-wide collision check — not an inference from the
 * fixture-level tests above alone. Every real `\f`-derived footnote body
 * across WEBUS2020's own real 81-book raw source
 * (`extractFootnoteBodiesIn`, `usfm/verify.ts`'s own independent
 * extraction, sharing no code with this module) is run through
 * `capitalizeFootnoteOpening` directly, proving the fix changes exactly
 * what it should and nothing else: every body it *does* change has a real
 * reason to (a lowercase ASCII leading letter, not the `or,` exception),
 * and every body it leaves alone has a real reason to be left alone
 * (already capitalized, non-letter-led, or the `or,` exception) — a
 * formal round-trip check across the whole real corpus, not a match
 * against one pre-computed count, since this 81-book, direct-extraction
 * sweep uses a different, broader methodology than a 66-canonical-book,
 * per-footnote match against `HEAD`.
 */
describe("capitalizeFootnoteOpening — corpus-wide collision check against WEBUS2020's own real 81-book raw source", () => {
  const webDir = path.join(__dirname, "../../../imports/webus2020/ebible-usfm");
  const webFiles = fs.readdirSync(webDir).filter((name) => name.endsWith(".usfm") && name !== "00-FRTeng-web.usfm");

  it("should change a footnote's own leading character if and only if it is a real ASCII lowercase letter not immediately followed by the or, exception, and never anything else", () => {
    let bodyCount = 0;
    let changedCount = 0;
    let orExceptionCount = 0;
    let witnessSiglonRecapitalized = 0;

    for (const file of webFiles) {
      const source = fs.readFileSync(path.join(webDir, file), "utf8");
      for (const { plainText } of extractFootnoteBodiesIn(source)) {
        bodyCount++;
        const before = plainText;
        const after = capitalizeFootnoteOpening(before);
        const changed = before !== after;
        const leadingChar = before[0];
        const startsLowercaseAscii = leadingChar !== undefined && /[a-z]/.test(leadingChar);
        const isOrException = /^or,/i.test(before);

        if (isOrException) orExceptionCount++;

        if (changed) {
          changedCount++;
          // Every real change has a real reason: a lowercase ASCII leading
          // letter, and never the or, exception.
          expect(startsLowercaseAscii).toBe(true);
          expect(isOrException).toBe(false);
          // A changed body's own leading character is no longer lowercase
          // (a recapitalized witness siglon uppercases the whole word, not
          // merely its own leading letter, but that still leaves the
          // leading character itself uppercase either way).
          expect(/[a-z]/.test(after[0])).toBe(false);
          if (/^(?:tr|nu|mt)\b/i.test(before)) witnessSiglonRecapitalized++;
        } else {
          // Nothing changed for a real reason: either the body never had a
          // lowercase ASCII opener to begin with, or it is the real,
          // 100%-consistent or, exception.
          expect(startsLowercaseAscii === false || isOrException).toBe(true);
        }
      }
    }

    expect(bodyCount).toBe(FOOTNOTES_IN_CORPUS);
    // Real, positive counts — not just "zero disagreements" — so a
    // regression that silently stopped the fix from ever firing would
    // still fail this test, not just pass it vacuously.
    expect(changedCount).toBeGreaterThan(0);
    expect(orExceptionCount).toBeGreaterThan(0);
    // Acts 4:27's own real "nu adds..." casing slip is the corpus's only
    // real witness-siglon recapitalization (confirmed directly: zero other
    // real footnote body opens with "tr"/"mt"/"nu" at all, siglon or
    // otherwise).
    expect(witnessSiglonRecapitalized).toBe(1);
  });
});
