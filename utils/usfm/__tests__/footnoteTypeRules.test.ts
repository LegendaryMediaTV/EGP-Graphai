import { describe, expect, it } from "vitest";
import { classifyFootnote, flattenContentText } from "../footnoteTypeRules";

/**
 * Most bodies below are real, extracted verbatim from an in-scope corpus —
 * WEBUS2020 (`imports/webus2020/ebible-usfm/*.usfm`), its 15 deuterocanon
 * files, or ASV1901's own 16 real textual-variant notes
 * (`imports/asv1901/ebible-usfm/{70-MAT,71-MRK,72-LUK,73-JHN,74-ACT,
 * 75-ROM}eng-asv.usfm`). A handful are drawn from other in-scope editions
 * specifically to prove a construct holds across house styles, not just
 * WEB's own — each says which edition it comes from. The one hand-built
 * exception is the `xrf` case proven against a bare reference string: no
 * real `\f`-type footnote in this corpus is shaped as "nothing but a
 * reference" (every reference inside a real `\f` note sits in explanatory
 * prose), so that predicate is proven against a real reference string
 * pulled from an in-scope `\x` cross-reference's own `\xt` target instead
 * (2 Kings 12:4 → Exodus 30:12).
 */

describe("classifyFootnote — xrf (the whole body is nothing but citations)", () => {
  it("should classify a body that is only a reference as xrf (2 Kings 12:4's \\xt target, Exodus 30:12 — no real \\f in this corpus is xrf-shaped, so this proves the rule on a genuine reference-only string)", () => {
    expect(classifyFootnote("Exodus 30:12")).toBe("xrf");
  });

  it("should not classify a body that merely contains a reference amid real prose as xrf (Genesis 6:2's cherubim note)", () => {
    expect(classifyFootnote("cherubim are powerful angelic creatures, messengers of God with wings. See Ezekiel 10.")).toBe(
      "stu",
    );
  });

  it('should classify a trailing tradition siglon directly after a reference as still xrf, not var (Hebrews 1:6\'s real "Deuteronomy 32:43 LXX" — a citation naming its own textual tradition, not a note contesting the verse\'s own wording, so a bare "LXX" witness match must not steal it)', () => {
    expect(classifyFootnote("Deuteronomy 32:43 LXX")).toBe("xrf");
  });

  it('should classify "Heb. 6:10" as xrf, the epistle, not trn — proving xrf runs before the translation-opener rule gets a chance to misread "Heb." as Hebrew', () => {
    expect(classifyFootnote("Heb. 6:10")).toBe("xrf");
  });

  describe("real citation shapes beyond a spelled-out book name (ASV1901/KJV1769/YLT1898's own real reference punctuation)", () => {
    const citations = [
      "Ps. 110:1.",
      "Isa. 28:16.",
      "Ex. 20:12–16; Dt. 5:16–20.",
      "1 Sam. 21:6.",
      "Ps. 95:7f.",
      "II Chron 36:23; Ezra 1:1–3",
      "1Sm 6:4–5,11,18",
      "Ezra 4:24; 5:1", // a bare chapter:verse continuing a semicolon-separated citation
      "22 above", // a bare chapter number plus a connective, no book name at all
      "Ps. 46, title",
    ];
    it.each(citations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });
  });

  describe('a citation lead-in ("See ... on"/"See ... margin") leaves no real residue behind', () => {
    const citationLeadIns = ["See marginal note on 3:9.", "See verse 12.", "See 2:13 margin."];
    it.each(citationLeadIns)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });
  });
});

describe("classifyFootnote — var (names a manuscript witness or text-tradition), ordered before trn", () => {
  it("should classify WEB's own Byzantine-Majority-Text/Textus-Receptus/Nestle-Aland-UBS sigla as var (Mark 16:8)", () => {
    expect(classifyFootnote('TR adds "quickly"')).toBe("var");
  });

  it("should classify a lower-case siglon immediately followed by a reading verb as var too (Acts 4:27's \"nu adds...\" — the corpus's one real casing slip against 200+ upper-case NU instances elsewhere)", () => {
    expect(classifyFootnote('nu adds "in this city,"')).toBe("var");
  });

  it("should classify a spelled-out witness name as var (Deuteronomy 33:2)", () => {
    expect(
      classifyFootnote('another manuscript reads "He came with myriads of holy ones from the south, from his mountain slopes."'),
    ).toBe("var");
  });

  it("should classify WEB's own LXX/DSS abbreviations as var (Isaiah 29:18)", () => {
    expect(classifyFootnote("LXX and DSS add: recovery of sight to the blind")).toBe("var");
  });

  it('should run before trn, so a witness note that also happens to say "reads" is not caught by the translation-alternative rule instead (Genesis 36:2)', () => {
    expect(classifyFootnote('LXX reads "angels" instead of "gods"')).toBe("var");
  });

  it('should classify "some ancient authorities omit ..." as var — the omission wording defect-4 originally missed entirely', () => {
    expect(classifyFootnote("Some ancient authorities omit the Lord.")).toBe("var");
  });

  it('should classify ASV1901\'s own "Another reading is, Ai." as var — a witness claim with no named witness, siglon, or witness noun at all, just this fixed idiom', () => {
    expect(classifyFootnote("Another reading is, Ai.")).toBe("var");
  });

  it('should classify a language paired with its own witness noun as var, not the trn its opening word might suggest ("As in Greek manuscripts; the Hebrew omits this word." — "Greek manuscripts" is one side of a comparison, contrasted below with "Hebrew lacks this word", which opens with the language instead and is trn)', () => {
    expect(classifyFootnote("As in Greek manuscripts; the Hebrew omits this word.")).toBe("var");
  });

  describe('ASV1901\'s own real "authorities insert/add/omit/read/transpose/write" witness vocabulary, across its full range of quantifiers and verbs', () => {
    const realAsv1901Bodies = [
      // Matthew 5:22
      "Many ancient authorities insert without cause.",
      // Matthew 3:16
      "Some ancient authorities omit unto him.",
      // Matthew 4:23
      "Some ancient authorities read he.",
      // Matthew 5:4
      "Some ancient authorities transpose verses 4 and 5.",
      // Matthew 6:13 — a quantifier phrase with its own parenthetical aside before the witness noun
      "Many authorities, some ancient, but with variations, add For thine is the kingdom, and the power, and the glory, for ever. Amen.",
      // Mark 9:44 — the reverse, verb-first order
      "Verses 44 and 46 (which are identical with verse 48) are omitted by the best ancient authorities.",
      // Acts 15:34
      "Some ancient authorities insert, with variations, verse 34 But it seemed good unto Silas to abide there.",
      // Romans 16:24
      "Some ancient authorities insert here verse 24 The grace of our Lord Jesus Christ be with you all. Amen, and omit the like words in verse 20.",
      // Luke 3:32 — a witness verb this table's own vocabulary doesn't share with any other real ASV1901 body
      "Some ancient authorities write Sala.",
      // John 7:53 — "Most of the", a quantifier shape distinct from "some"/"many"
      "Most of the ancient authorities omit 7:53–8:11. Those which contain it vary much from each other.",
      // Acts 16:13 — no "ancient" between the quantifier and the witness noun
      "Many authorities read where was wont to be etc.",
      // Acts 20:28 — a parenthetical clause between the witness noun and its verb
      "Some ancient authorities, including the two oldest manuscripts, read God.",
    ];
    it("should classify each of these real ASV1901 textual-variant notes as var", () => {
      for (const body of realAsv1901Bodies) expect(classifyFootnote(body)).toBe("var");
    });
  });

  describe("the deuterocanon corpus's own \"authorities read\" phrasing (Tobit 1:17) — the identical quantifier-plus-witness-noun construct as the 66-book corpus's own vocabulary, just worded differently", () => {
    it('should classify "Some ancient authorities read behind." and "Many authorities read toward the Jews, he sent." as var', () => {
      expect(classifyFootnote("Some ancient authorities read behind.")).toBe("var");
      expect(classifyFootnote("Many authorities read toward the Jews, he sent.")).toBe("var");
    });
  });

  /**
   * WEB's own deuterocanon corpus carries 3 real "authorities omit" notes
   * (Sirach 7:26, 1 Esdras 9:48, Manasses 1:10). An earlier version of this
   * table special-cased ASV1901's own reverse-ordered "omitted by ... the
   * best ancient authorities" wording specifically to avoid flipping these
   * three from stu to var, on the theory that WEB and ASV1901 draw the line
   * differently. The owner has since decided otherwise: a witness-omission
   * note is var wherever it appears, in whichever edition. These three are
   * var now, matching ASV1901's own identical construct (a quantifier, a
   * strong witness noun, a reading verb) rather than carved out from it.
   */
  it('should classify WEB\'s own 3 real deuterocanon "authorities omit" footnote bodies as var, matching the one house convention this table now applies everywhere', () => {
    expect(classifyFootnote("Many authorities omit this line ")).toBe("var"); // Sirach 7:26
    expect(classifyFootnote("Some authorities omit and read...Lord.")).toBe("var"); // 1 Esdras 9:48
    expect(classifyFootnote("Some authorities omit by reason of my sins.")).toBe("var"); // Manasses 1:10
  });
});

describe("classifyFootnote — trn (an anchored opener or construct offering a live English alternative)", () => {
  it('should classify WEB\'s own lower-case "or, <alternative>" house style as trn (Genesis 2:12)', () => {
    expect(classifyFootnote("or, aromatic resin")).toBe("trn");
  });

  it('should classify a "Hebrew: <alternative>" opener as trn (2 Kings 17:27)', () => {
    expect(classifyFootnote("Hebrew: them")).toBe("trn");
  });

  it('should classify a "Hebrew <alternative>" opener with no colon as trn too (2 Chronicles 23:3)', () => {
    expect(classifyFootnote("Hebrew He")).toBe("trn");
  });

  it("should classify a bare-Greek-word gloss offering an explicit alternate English rendering as trn (John 1:14)", () => {
    expect(
      classifyFootnote(
        'The phrase "only born" is from the Greek word "monogenous", which is sometimes translated "only begotten" or "one and only".',
      ),
    ).toBe("trn");
  });

  it('should classify "sometimes rendered" the same way as "sometimes translated" (WEB\'s own recurring Yahweh/LORD note)', () => {
    expect(classifyFootnote('"Yahweh" is God’s proper Name, sometimes rendered "LORD" (all caps) in other translations.')).toBe(
      "trn",
    );
  });

  it('should classify "can be correctly translated" as trn regardless of where in the sentence it falls (Genesis 4:1)', () => {
    expect(
      classifyFootnote(
        '"Adam" and "Man" are spelled with the exact same consonants in Hebrew, so this can be correctly translated either way.',
      ),
    ).toBe("trn");
  });

  it('should classify "may be also correctly translated" as trn too — "also" placed after "be" rather than immediately after the modal (Acts 3:17)', () => {
    expect(
      classifyFootnote("The word for “brothers” here may be also correctly translated “brothers and sisters” or “siblings.”"),
    ).toBe("trn");
  });

  it("should classify the bare-infinitive \"also mean\" as trn, the same construct as \"also means\" regardless of grammatical number (WEB's Psalm 138:1, \"usually means 'God' but can also mean 'gods', 'princes', or 'angels'\")", () => {
    expect(
      classifyFootnote("The word elohim, used here, usually means “God” but can also mean “gods”, “princes”, or “angels”."),
    ).toBe("trn");
  });

  it('should classify a comma-punctuated opener as trn, the same construct as the colon-led form (Exodus 17:15\'s "Hebrew, Yahweh Nissi" and Matthew 16:18\'s "Greek, petra, a rock mass or bedrock.")', () => {
    expect(classifyFootnote("Hebrew, Yahweh Nissi")).toBe("trn");
    expect(classifyFootnote("Greek, petra, a rock mass or bedrock.")).toBe("trn");
  });

  it('should resolve "Mt." as Matthew, not the MT siglon, once the opening word is a recognized translation-opener anyway (Greek\'s own real body: "Greek good tidings. See marginal note on Mt. 4:23.")', () => {
    expect(classifyFootnote("Greek good tidings. See marginal note on Mt. 4:23.")).toBe("trn");
  });

  it('should classify "Or, Jeshimon. See 23:19." as trn, not xrf — the one-book-word citation cap keeps "Jeshimon. See" from being swallowed into a reference, leaving "Or," as the body\'s own real opener', () => {
    expect(classifyFootnote("Or, Jeshimon. See 23:19.")).toBe("trn");
  });

  it('should classify "Or, and" as trn, not xrf — connectives with no citation to attach to are not a citation-only body, so the "Or," opener is what decides it', () => {
    expect(classifyFootnote("Or, and")).toBe("trn");
  });

  it('should classify "Hebrew lacks this word" as trn — opening with the language names the original-language reading behind the translation, contrasted above with the comparison-shaped "As in Greek manuscripts; the Hebrew omits this word.", which is var', () => {
    expect(classifyFootnote("Hebrew lacks this word")).toBe("trn");
  });

  describe("a Literally,/Lit. opener (several editions, including this repo's own KJV1769 and YLT1898, use some spelling of this)", () => {
    it('should classify a lower-case "literally, <quoted alternate>" opener as trn (WEB\'s Leviticus 19:16)', () => {
      expect(classifyFootnote("literally, “blood”")).toBe("trn");
    });

    it('should classify a capitalized "Literally, <alternate>" opener as trn, including the real \\fqa-continuation shape (WEB\'s Psalm 118:22 — "Literally, " from \\ft, "head of the corner" from \\fqa, concatenated the way every other \\fqa note already is)', () => {
      expect(classifyFootnote("Literally, head of the corner")).toBe("trn");
    });

    it('should classify a bare, unquoted "literally, <word>" opener as trn too (WEB\'s Matthew 6:27)', () => {
      expect(classifyFootnote("literally, cubit")).toBe("trn");
    });

    it('should classify the abbreviated "Lit" opener as trn on its own, with no trailing punctuation at all', () => {
      expect(classifyFootnote("Lit ground")).toBe("trn");
    });

    it('should classify YLT1898\'s own real "Lit.," opener as trn (Acts 19:9, "Lit., made a synagogue") and KJV1769\'s own real "Heb." opener as trn (Genesis 1:5, "Heb. between the light and between the darkness")', () => {
      expect(classifyFootnote("Lit., made a synagogue")).toBe("trn");
      expect(classifyFootnote("Heb. between the light and between the darkness")).toBe("trn");
    });
  });
});

describe("classifyFootnote — stu (default; naming an original-language term or a weak witness noun is not the same as a real trn/var signal)", () => {
  it("should classify a bare name-etymology note as stu, not trn (Genesis 25:26, Isaac)", () => {
    expect(classifyFootnote('Isaac means "he laughs".')).toBe("stu");
  });

  it('should still classify "Abaddon" is a Hebrew word that means <gloss list> as stu, not trn — the general rendered/translated construct must not reach past the divine-title template into this name-etymology note, which shares the surface shape (a quoted term, "means", a gloss list) but never says the name was rendered or translated (Revelation 9:11)', () => {
    expect(classifyFootnote("“Abaddon” is a Hebrew word that means “ruin”, “destruction”, or “the place of destruction”")).toBe(
      "stu",
    );
  });

  it('should still classify "Apollyon" means "Destroyer" as stu, not trn (Revelation 9:11, the same verse\'s second name-etymology note)', () => {
    expect(classifyFootnote("“Apollyon” means “Destroyer”.")).toBe("stu");
  });

  it("should classify a measurement gloss as stu (Genesis 6:15)", () => {
    expect(
      classifyFootnote(
        "A cubit is the length from the tip of the middle finger to the elbow on a man’s arm, or about 18 inches or 46 centimeters.",
      ),
    ).toBe("stu");
  });

  it('should classify a name-spelling-variant note as stu, not var — "variant" here names an alternate spelling of a name, not a manuscript-tradition witness (2 Chronicles 36:2)', () => {
    expect(classifyFootnote("Joahaz is a variant of Jehoahaz.")).toBe("stu");
  });

  it('should classify ASV1901\'s own real "The Hebrew text has taken, taken." as stu, not var — "text" is a weak witness noun that only counts once quantified ("some texts", "other versions"), and nothing here quantifies it', () => {
    expect(classifyFootnote("The Hebrew text has taken, taken.")).toBe("stu");
  });

  describe('the deuterocanon corpus\'s own bare "Hebrew" mentions stay stu, not var (Esther-Greek 3:13, 4:17)', () => {
    it('should classify a bare "in Hebrew"/"in the Hebrew" mention as stu — a bare language name names no witness on its own; only a language paired with a witness noun ("Greek version") or set against another reading after a semicolon does', () => {
      expect(classifyFootnote("Note: The part in brackets is not in Hebrew")).toBe("stu");
      expect(classifyFootnote("Note: The part between brackets, i.e. to the end of chapter 5 is not in the Hebrew")).toBe("stu");
    });
  });

  /**
   * These two real WEB constructs — the "Behold... means <gloss list>"
   * interjection note and the "Aleph Tav... not as a word, but as a
   * grammatical marker" note — used to be recognized as trn through
   * WEB-specific literal phrases anchored to their own exact closing
   * clauses. Neither one opens with a recognized translation marker, and
   * neither says a word was *rendered* or *translated* — the actual
   * constructs {@link classifyFootnote} now looks for — so both read as stu
   * under the shared, edition-agnostic rules instead. This is a real,
   * accepted disagreement with the old behavior, not an oversight: the
   * measured cost is part of WEBUS2020's own 54 real notes moving from trn
   * to stu, a known, worthwhile trade against no longer needing a new
   * literal phrase for every edition's own equivalent construct. (The
   * bare-infinitive "can also mean" gloss this file used to group alongside
   * these two is not part of that cost — see the trn section above, where
   * "also mean" still matches the shared "also/alternately/alternatively
   * translated/rendered/means" construct.)
   */
  describe("two real WEB constructs that no longer carry a trn signal, having moved from a WEB-specific literal to a shared, edition-agnostic construct", () => {
    it("should classify the \"Behold... means <gloss list>\" interjection note as stu (Esther 6:5's Hebrew variant, Mark 1:2's Greek variant)", () => {
      expect(
        classifyFootnote(
          "“Behold”, from “הִנֵּה”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.",
        ),
      ).toBe("stu");
      expect(
        classifyFootnote(
          "“Behold”, from “ἰδοὺ”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.",
        ),
      ).toBe("stu");
    });

    it('should classify the "Aleph Tav... not as a word, but as a grammatical marker" note as stu (Exodus 20:1, Zechariah 12:10)', () => {
      expect(
        classifyFootnote(
          "After “God”, the Hebrew has the two letters “Aleph Tav” (the first and last letters of the Hebrew alphabet), not as a word, but as a grammatical marker.",
        ),
      ).toBe("stu");
      expect(
        classifyFootnote(
          "After “me”, the Hebrew has the two letters “Aleph Tav” (the first and last letters of the Hebrew alphabet), not as a word, but as a grammatical marker.",
        ),
      ).toBe("stu");
    });
  });
});

describe("classifyFootnote — the divine-title-naming template (word rendered/translated X) generalizes to trn without any divine-title-specific literal", () => {
  it('should classify WEB\'s own recurring "Hebrew word rendered X is Y" boilerplate as trn, not stu — saying a word was "rendered" is itself describing a real translation choice (Genesis 1:1 and 40 other real instances)', () => {
    expect(classifyFootnote('The Hebrew word rendered "God" is "Elohim" (Elohim).')).toBe("trn");
  });

  it('should classify "the word translated X is Y" as trn (every book\'s own recurring Adonai note, period-inside-quotes variant — Numbers 14:17 and most other real instances)', () => {
    expect(classifyFootnote('The word translated "Lord" is "Adonai."')).toBe("trn");
  });

  it("should classify the identical Adonai note's other real punctuation variant as trn too (Genesis 15:2/Exodus 4:10's own \"Adonai\". with the period outside the closing quote)", () => {
    expect(classifyFootnote('The word translated "Lord" is "Adonai".')).toBe("trn");
  });
});

/**
 * Proves {@link flattenContentText}'s own bare-`bibleLink`-defaults-to-
 * reference behavior (see that function's doc comment for why it matters)
 * against real corpus shapes.
 */
describe("flattenContentText — a bare bibleLink node's own implied display text", () => {
  it("should flatten a bare {bibleLink} node with no override to the reference itself (2 Kings 12:4's real Exodus 30:12 cross-reference)", () => {
    expect(flattenContentText({ bibleLink: "Exodus 30:12" })).toBe("Exodus 30:12");
  });

  it("should still prefer an explicit display override over the reference when one is present (1 Esdras 6:1's real second bibleLink)", () => {
    expect(flattenContentText({ bibleLink: "Ezra 5:1", content: "5:1" })).toBe("5:1");
  });

  it("should flatten a real, mixed multi-reference xrf body exactly as it prints (1 Esdras 6:1, override-then-plain-reference in document order)", () => {
    expect(flattenContentText([{ bibleLink: "Ezra 4:24" }, "; ", { bibleLink: "Ezra 5:1", content: "5:1" }])).toBe(
      "Ezra 4:24; 5:1",
    );
  });
});

/**
 * A trailing `\b` can never match after a period, so every period-terminated
 * alternative inside a `\b(?:...)\b` wrapper is silently unreachable. These
 * are the real bodies that exposed it, one per pattern that had the flaw.
 */
describe("classifyFootnote — abbreviations that end in a period still name a witness", () => {
  it("should classify a bare MSS. claim as var (YLT1898's own textual notes, which carry no quantifier the phrase rule could use)", () => {
    expect(classifyFootnote("Textual note: MSS. omit.")).toBe("var");
    expect(classifyFootnote("Textual note: Oldest MSS. omit.")).toBe("var");
    expect(classifyFootnote("Textual note: the oldest MSS. add, “and we are so.”")).toBe("var");
  });

  it("should classify period-terminated witness abbreviations as var", () => {
    expect(classifyFootnote("Tg. differs here")).toBe("var");
    expect(classifyFootnote("Vss. add a longer reading here.")).toBe("var");
    expect(classifyFootnote("Kt. reads differently")).toBe("var");
    expect(classifyFootnote("Sam. omits a phrase here")).toBe("var");
    expect(classifyFootnote("M.T. differs slightly")).toBe("var");
    expect(classifyFootnote("The Alex. MS. omits a phrase here.")).toBe("var");
  });

  it("should classify period-less spellings of the same sigla as var", () => {
    expect(classifyFootnote("Syr, Vg read differently here")).toBe("var");
    expect(classifyFootnote("Sam, Syr read a different name here; 1Ch 7:1")).toBe("var");
  });

  it("should not read Sam. as the Samaritan Pentateuch when a chapter:verse follows it, since that is 1/2 Samuel (ASV1901 cites it constantly inside ordinary prose notes)", () => {
    expect(classifyFootnote("See verse 33 and 1 Sam. 8:2. The Hebrew text has Vashni, and Abiah.")).toBe("stu");
    expect(classifyFootnote("1 Sam. 21:6.")).toBe("xrf");
  });
});

/**
 * `witnesses` is apparatus jargon and ordinary scripture vocabulary at once,
 * and the scripture sense is far commoner across the real corpora, so a
 * quantifier alone must not make it a witness claim.
 */
describe("classifyFootnote — witnesses needs a reading verb, not just a quantifier", () => {
  it("should classify KJV1769's own quoted-scripture body as trn on its Or opener, not var on “two witnesses”", () => {
    expect(classifyFootnote("Or, I will give unto my two witnesses that they may prophesy")).toBe("trn");
  });

  it("should still classify a real apparatus claim about witnesses as var", () => {
    expect(classifyFootnote("Some witnesses read “the Lord” here.")).toBe("var");
  });
});
