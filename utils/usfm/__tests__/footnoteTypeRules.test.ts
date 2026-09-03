import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { classifyFootnote, flattenContentText } from "../footnoteTypeRules";

/**
 * Every spelling `bible-books/bible-books.json` carries for a book, canonical
 * name and alias alike. Read here rather than transcribed so the sweep below
 * asks the same registry the citation grammar itself resolves from — a book
 * added to the registry has to answer for itself, and a transcribed list would
 * quietly stop covering it.
 */
function registryBookNames(): string[] {
  const file = path.resolve(__dirname, "../../../bible-books/bible-books.json");
  const entries: { name: string; alt?: string[] }[] = JSON.parse(fs.readFileSync(file, "utf8"));
  const spellings = new Set<string>();
  for (const entry of entries) for (const spelling of [entry.name, ...(entry.alt ?? [])]) spellings.add(spelling);
  return [...spellings];
}

/**
 * Most bodies below are real, extracted verbatim from an in-scope corpus; a
 * handful come from other in-scope editions specifically to prove a
 * construct holds across house styles rather than one edition's own.
 *
 * Where a rule turns on a specific literal — a bare book name, a language
 * name or abbreviation, an apparatus operator — that literal is reproduced
 * as it occurs, since paraphrasing it would leave the test testing nothing.
 * Everything around it is a non-identifying placeholder token (`Alpha`,
 * `2 Bet.`, `Gam.`) exercising the same one-word book slot a real
 * abbreviation does.
 *
 * The one hand-built exception is the `xrf` case proven against a bare
 * reference string: no real `\f`-type footnote in this corpus is shaped as
 * "nothing but a reference" — every reference inside a real `\f` note sits
 * in explanatory prose — so that predicate is proven against a real `\x`
 * cross-reference's own `\xt` target instead.
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

  describe("a Psalm-heading descriptor written once at the end of a whole citation list, not attached to each number (real CSB2017/LSB2021/NASB1995 shapes)", () => {
    const titleCitations = [
      "Ps 60 title", // CSB2017: no punctuation at all before "title"
      "Pss 45; 60; 69 titles", // CSB2017: a semicolon-separated list, one plural "titles" covering all of them
      "Ps 89: title", // LSB2021/NASB1995: a colon-space before "title", not REFERENCE's own bare ":title"
      "Cf. 1 Chr 16:41; 25:1; Ps 39 and 77 titles", // LSB2021: "and" between two Psalm numbers sharing one "titles"
    ];
    it.each(titleCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });
  });

  describe("a sub-verse letter on either end of a range (real CSB2017/NET2019/NLT2015 shapes)", () => {
    const letteredCitations = [
      "2Kg 23:29–30a", // the range's own second number lettered
      "2Kg 23:30b–34", // the base verse lettered instead
      "Jer 31:33a.",
      "See 2 Kgs 8:28–29a.",
    ];
    it.each(letteredCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });
  });

  describe('a citation naming whole chapters, with "ch"/"chs" standing where a verse number would be', () => {
    const chapterCitations = [
      "Judg ch 6–8", // one book, a chapter range, nothing else in the body
      "Ex chs 7–12; Ps 106:22", // the plural form, beside an ordinary verse citation
      "Num chs 14, 16, 17", // a comma-separated run of chapters sharing one book
      "Gen ch 1; Ps 33:6, 9; Heb 6:5; 2 Pet 3:5", // a single chapter opening a mixed list
      "Ex 18:4; 1 Sam 18:11; 19:10; 1 Kin ch 19; 2 Kin ch 6; Ps 144:10", // two of them mid-list, each with its own book
    ];
    it.each(chapterCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });

    it("should not read the same two letters capitalized as a citation, since that opens a note about the host verse's own numbering rather than citing another passage", () => {
      expect(classifyFootnote("Ch 32:1 in Heb")).not.toBe("xrf");
      expect(classifyFootnote("Ch 63:19b in Heb")).not.toBe("xrf");
    });

    it("should not let the word rescue a body that is prose around a number rather than a citation", () => {
      expect(classifyFootnote("ch 6 of the treaty text")).not.toBe("xrf");
    });
  });

  describe("the two-letter siglum appending a marginal reading to a citation", () => {
    const marginalCitations = [
      "Gen 31:19 mg", // the whole body: one citation and the siglum
      "Lev 20:13; Deut 23:18 mg; Rom 1:27", // mid-list, with citations either side of it
      "Job 26:6; 28:22; 31:12; Ps 88:11 mg; Prov 15:11", // the same, reached through a bare verse continuation
      "1 Cor 11:20ff; 2 Pet 2:13 and mg", // joined to its citation by a connective rather than sitting flush
    ];
    it.each(marginalCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });

    it("should not let the siglum alone carry a body that has real prose left after the citations are stripped", () => {
      expect(classifyFootnote("The mg here is uncertain and the sense is disputed")).not.toBe("xrf");
      expect(classifyFootnote("Some mss read this in the mg")).toBe("var");
    });
  });

  describe('a citation lead-in ("See ... on"/"See ... margin") leaves no real residue behind', () => {
    const citationLeadIns = ["See marginal note on 3:9.", "See verse 12.", "See 2:13 margin."];
    it.each(citationLeadIns)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });
  });

  describe("a `with` flanked by a citation on both sides", () => {
    const joinedCitations = [
      "2 Bet. 14:25 with Gam. 19:13", // directly between two citations, numeral prefix and period-terminated abbreviations
      "Alpha 24:49; Beta 2:33, with 15:26; 16:7", // after the comma that closes a citation, mid-list
      "2:11 with 45, 46", // joining a bare verse continuation, with no book named on either side
      "21:18, 27, with 11", // the same, reached through a comma-separated verse list
    ];
    it.each(joinedCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });

    it("should leave a translation note whose own offered alternative is that word as trn, with or without a citation after it", () => {
      expect(classifyFootnote("Or, with. Compare 1:9; 3:6.")).toBe("trn");
      expect(classifyFootnote("Or with Gr 10,000")).toBe("trn");
      expect(classifyFootnote("Or, with.")).toBe("trn");
    });
  });

  describe('an anchored "Fulfilled in ..."/"Foretold in ..." lead-in (real AMP1987/NKJV1982 shapes)', () => {
    const fulfillmentCitations = [
      "Fulfilled in II Chron 29:8",
      "Fulfilled in Gen 25:12–18", // an en-dash range
      "Fulfilled in II Kings 17:4, 6; 24:12, 14; 25:7, 11; Dan 6:11, 12", // several semicolon-separated citations in one note
      "Fulfilled in 2 Kin. 23:4, 5", // NKJV1982's own "2 Kin." abbreviation
      "Foretold in Gen 17:20",
      "Foretold in Jer 34:3; Ezek 12:13", // semicolon-separated, same as the Fulfilled-in shape
      "Foretold in Isa 21:2, 5, 9",
    ];
    it.each(fulfillmentCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });

    it('should not strip "fulfilled"/"foretold" or "in" as filler anywhere else in a body, only as this anchored opener (real AMP1987 discursive commentary stays stu)', () => {
      expect(classifyFootnote("This prophecy was literally fulfilled. Moses, for example, led the Israelites back to Canaan.")).toBe(
        "stu",
      );
      expect(
        classifyFootnote("Christ fulfills through his victory over Satan the wonderful promise here spoken. See also Isa. 9:6."),
      ).toBe("stu");
      expect(
        classifyFootnote("Never in the history of the world had such a thing happened before—but God keeps His word."),
      ).toBe("stu");
    });
  });

  describe('AMP1987\'s own three-token "S of Sol"/"S. of Sol." abbreviation for Song of Solomon', () => {
    const songOfSolomonCitations = [
      "S of Sol 8:12",
      "S of Sol 6:3; Matt 21:33–40", // continues into a second, differently-abbreviated book
      "S. of Sol. 5:1", // both tokens period-terminated
    ];
    it.each(songOfSolomonCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });
  });

  describe("a one-chapter book cited by name alone, with no digit anywhere, in either of its spellings", () => {
    /**
     * Both spellings are tested in both positions the shape really takes —
     * closing a citation list and passing through the middle of one —
     * because the word boundary this rule corrects only ever failed at one
     * of the two.
     */
    const bareBookCitations = [
      "Alpha 34; Beta 35; Gam. 1:11, 12; Obad", // abbreviated, closing the list
      "Alpha 34; Beta 35; Gam. 1:11, 12; Obadiah", // spelled out, closing the list
      "Obad; Alpha 49:7–22; Beta 1:2–4", // abbreviated, mid-list
      "1:2–4; Alpha 49:7–22; Obadiah; Beta 1:2–4", // spelled out, mid-list
    ];
    it.each(bareBookCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });

    it("should not extend the allowance to the numbered one-chapter books, since a census of every version measured zero bodies corpus-wide that the wider rule would reach", () => {
      expect(classifyFootnote("See 2 John")).toBe("stu");
      expect(classifyFootnote("See 3 John")).toBe("stu");
      expect(classifyFootnote("See Jude")).toBe("stu");
    });

    it("should not let this allowance reopen the two-capitalized-words-in-a-row collision the one-word book-prefix cap exists to prevent, since it still only ever matches the one name", () => {
      expect(classifyFootnote("Or, Jeshimon. See 23:19.")).toBe("trn");
    });
  });

  describe("a language name is deletable filler only inside a parenthesized tag on a citation", () => {
    /**
     * The shapes below are every form the tag really takes, found by
     * scanning every footnote in every version. 161 bodies carry it, so
     * these guards are the load-bearing half of the rule.
     */
    const parenthesizedLanguageTags = [
      "Alpha 2:1 (Gk.)", // a bare abbreviation closing the body
      "Alpha 28:32; Beta 5:5 (Heb.); Gam. 3:27; Delta 2:1", // the same, tagging one citation in the middle of a list
      "Alpha 40:3 (Greek version).", // spelled out, with a version noun
      "Alpha 22:16 (Heb.; Gk.)", // two abbreviations sharing one parenthesis
      "Alpha 42:1–4 (Greek version for 42:4).", // a tag carrying a citation of its own
    ];
    it.each(parenthesizedLanguageTags)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });

    it("should not treat a bare language name governing what follows as filler, so a body that is a language name and a number is not read as a citation", () => {
      expect(classifyFootnote("Hebrew verse 5")).not.toBe("xrf");
      expect(classifyFootnote("Hebrew verse 6")).not.toBe("xrf");
    });

    it("should not treat a bare language name as filler when it is the alternative a translation opener offers, even with a citation after it", () => {
      expect(classifyFootnote("Or Hebrew; also verses 17, 20")).toBe("trn");
    });
  });

  describe("a spelled-out language name is not a book name", () => {
    it("should not read a spelled-out language name followed by a number as a whole citation", () => {
      expect(classifyFootnote("Compare 45:1; Hebrew 10,000")).not.toBe("xrf");
      expect(classifyFootnote("Hebrew 10,000")).not.toBe("xrf");
    });

    it("should still match an ordinary one-word book abbreviation standing in the same slot, followed by the same number", () => {
      expect(classifyFootnote("Compare 45:1; Beta 10,000")).toBe("xrf");
      expect(classifyFootnote("Alpha 34; Beta 35")).toBe("xrf");
    });

    it("should still match the three-token book prefix, which the exclusion sits alongside rather than inside", () => {
      expect(classifyFootnote("S of Sol 8:12")).toBe("xrf");
      expect(classifyFootnote("S. of Sol. 5:1")).toBe("xrf");
    });
  });

  describe("an edition's own siglum is not a book name either", () => {
    it("should classify MSB2025's Acts 27:37 as var, not xrf — a variant reading of the number 276, whose siglum was being read as the book and whose number as that book's chapter", () => {
      expect(classifyFootnote("WH 76")).toBe("var");
    });

    /**
     * `F35` is deliberately not in this list, and its absence is a finding
     * rather than an oversight. The bar below is on the book *slot*, and a
     * siglum carrying its own digit never reaches that slot: `F 76` alone
     * already classifies `xrf` today, because `76` matches as a bare
     * citation and a lone `f` is deletable filler (the `7f.`/`7ff.` shape
     * `CONNECTIVES` exists for). So does `35 76`. That is a different
     * mechanism from the one this bar fixes, it predates it, and no body on
     * disk takes the shape — measured over all 321,204 — so nothing here
     * pretends to have addressed it.
     */
    it("should reach the same answer for every edition-only siglum spelled with letters alone, the whole class rather than the one body that exposed it", () => {
      for (const siglum of ["LXX", "DSS", "TR", "RP", "FH", "CT", "GOC", "WH", "ALT", "ECM", "SBL", "Scrivener"]) {
        expect(classifyFootnote(`${siglum} 76`)).toBe("var");
      }
    });

    it("should still read a siglum that doubles as a book abbreviation as the book, since barring those would stop ordinary citations of them matching at all", () => {
      expect(classifyFootnote("MT 4:6")).toBe("xrf");
      expect(classifyFootnote("NE 4:6")).toBe("xrf");
      expect(classifyFootnote("NA 1:7")).toBe("xrf");
      expect(classifyFootnote("NU 5:6")).toBe("xrf");
      expect(classifyFootnote("TH 2:13")).toBe("xrf");
    });

    it("should still match an ordinary one-word book abbreviation standing in the same slot", () => {
      expect(classifyFootnote("Alpha 76")).toBe("xrf");
      expect(classifyFootnote("Beta 4:6–8")).toBe("xrf");
    });

    it("should leave a genuine citation carrying its own trailing tradition siglon as xrf, the slot the siglum legitimately occupies (Hebrews 1:6)", () => {
      expect(classifyFootnote("Deuteronomy 32:43 LXX")).toBe("xrf");
    });
  });

  describe("a book named in full, however long or however many words, resolved from the repo's own registry", () => {
    /**
     * Real MSB2025 heading cross-references, the edition that exposed this:
     * it spells its references out where every other version on disk
     * abbreviates them, so it is the first corpus to meet the one-word
     * slot's own twelve-character cap and its one-word count. Every one of
     * these classified `stu` before the registry drove the book slot, on
     * the strength of the unmatched book name surviving the residue strip
     * as prose.
     */
    const spelledOutCitations = [
      "Malachi 4:1–6; 1 Thessalonians 5:1–11; 2 Peter 3:8–13", // Zephaniah 1:7 — thirteen letters, against a twelve-character cap
      "2 Thessalonians 1:1–4", // 1 Thessalonians 1:1 — the same name standing alone
      "1 Thessalonians 1:1–10", // 2 Thessalonians 1:1
      "Colossians 4:15–18; 2 Thessalonians 3:16–18", // 1 Corinthians 16:19
      "Song of Solomon 1:1–17; 1 Peter 3:1–7", // Ephesians 5:21 — three words, against a one-word slot
      "Song of Solomon 1:1–17; Ephesians 5:22–33", // 1 Peter 3:1
    ];
    it.each(spelledOutCitations)("should classify %j as xrf", (body) => {
      expect(classifyFootnote(body)).toBe("xrf");
    });

    it("should accept the Roman-numeral ordinal prose substitutes for the digit, without the registry carrying that spelling", () => {
      expect(classifyFootnote("II Thessalonians 1:1")).toBe("xrf");
      expect(classifyFootnote("I Thessalonians 5:1–11")).toBe("xrf");
    });

    /**
     * The point of resolving from `bible-books/bible-books.json` rather than
     * naming the two spellings one edition happened to expose: a book this
     * repo already knows about is a book this grammar already knows about.
     * None of these appears in any footnote on disk today, and that is the
     * claim — the next edition to spell one out needs no change here.
     */
    it("should resolve every canonical book name the registry carries, not only the two an edition exposed", () => {
      const failed = registryBookNames()
        .map((name) => ({ name, type: classifyFootnote(`${name} 1:1`) }))
        .filter((probe) => probe.type !== "xrf");
      expect(failed.map((probe) => `${probe.name} -> ${probe.type}`)).toEqual([
        // A parenthesized name is destroyed before the citation pattern ever
        // sees it: the residue pass strips a parenthesized language tag first
        // (`PARENTHETICAL_LANGUAGE_TAG`), which is the rule that lets
        // `Alpha 2:1 (Gk.)` read as one citation, and `(Greek)` inside a book
        // name is indistinguishable from that tag. Three registry spellings
        // collide with it, no footnote body anywhere on disk carries one, and
        // reordering the two strips would cost the tag rule the citation-
        // carrying form it exists for. Recorded rather than worked around.
        "Esther (Greek) -> stu",
        "Daniel (Old Greek) -> stu",
        "Daniel (Greek) -> stu",
      ]);
    });

    it("should not admit two arbitrary capitalized words in a row, which is the collision the one-word cap exists to prevent", () => {
      expect(classifyFootnote("Alpha Beta 4:6")).toBe("stu");
      expect(classifyFootnote("Or, Jeshimon. See 23:19.")).toBe("trn");
    });

    /**
     * A range of whole books names no chapter, so there is nothing for it to
     * resolve to. Measured over all 322,529 footnote bodies on disk, exactly
     * one is a whole-book range and nothing else (MSB2025's Hebrews 11:30);
     * what the same scan turns up in quantity is the collision a rule for it
     * would walk into, two book names hyphenated into an ordinary compound
     * noun (`Luke-Acts`, `Ezra-Nehemiah`, `Bar-Jonah`). One body is not a
     * population, so the construct stays prose.
     */
    it("should leave a range of whole books as prose, since it names no chapter to resolve", () => {
      expect(classifyFootnote("Joshua–Malachi")).toBe("stu");
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

  it('should classify "some ancient authorities omit ..." as var', () => {
    expect(classifyFootnote("Some ancient authorities omit the Lord.")).toBe("var");
  });

  it('should classify ASV1901\'s own "Another reading is, Ai." as var — a witness claim with no named witness, siglon, or witness noun at all, just this fixed idiom', () => {
    expect(classifyFootnote("Another reading is, Ai.")).toBe("var");
  });

  it('should classify a language paired with its own witness noun as var, not the trn its opening word might suggest ("As in Greek manuscripts; the Hebrew omits this word." — "Greek manuscripts" is one side of a comparison, contrasted below with "Hebrew lacks this word", which opens with the language instead and is trn)', () => {
    expect(classifyFootnote("As in Greek manuscripts; the Hebrew omits this word.")).toBe("var");
  });

  describe('"Aquila" is not a bare witness name, since it collides with the New Testament person of the same name (real AMP1987 Acts 18:18 shape)', () => {
    it("should not classify a note discussing which person named Aquila is meant as var", () => {
      expect(
        classifyFootnote(
          "Some commentators (such as Marvin Vincent, Word Studies and Henry Alford, The Greek New Testament) believe Paul is the one who made the vow, while others think Aquila is meant.",
        ),
      ).toBe("stu");
    });

    it("should still classify the ancient translator Aquila as var whenever he is named alongside another real witness, the shape every genuine corpus mention of him actually takes", () => {
      expect(classifyFootnote("The Syriac and Aquila have red.")).toBe("var");
      expect(classifyFootnote("Aquila, Symmachus, Syriac, Vulgate; Hebrew could be read as and the snare pants")).toBe("var");
      expect(classifyFootnote("Tg., Vg., Aquila the chief prince of Meshech")).toBe("var");
    });
  });

  describe('"(the) Latin" is a witness only as the subject or object of an actual reading-claim, never bare, since it doubles as the ordinary adjective for the language itself', () => {
    it("should not classify a bare word-origin, title-origin, or office-equivalent mention of Latin as var", () => {
      expect(classifyFootnote("Bede, a translator of portions of the Bible from the Latin into Old English.")).toBe("stu");
      expect(classifyFootnote("According to the Latin, Calvary, which has the same meaning.")).toBe("stu");
      expect(
        classifyFootnote(
          'This is the so-called "levirate" custom (from the Latin term levir, "brother-in-law"), an ancient provision.',
        ),
      ).toBe("stu");
      expect(
        classifyFootnote(
          'The Latin word for the Greek term κρανίον (kranion) is calvaria, from which the English word "Calvary" is derived.',
        ),
      ).toBe("stu");
      expect(
        classifyFootnote(
          'In Greek the term χιλίαρχος (chiliarchos) literally described the "commander of a thousand," but it was used as the standard translation for the Latin tribunus militum, the military tribune who commanded a cohort of 600 men.',
        ),
      ).toBe("stu");
    });

    it('should not let a common auxiliary verb like "have" appearing anywhere earlier in an unrelated clause count as this construct\'s own predicate, real NET2019 Acts/John shapes where "may well have ..." opens the sentence long before "the Latin" appears', () => {
      expect(
        classifyFootnote(
          'Simeon may well have been from North Africa, since the Latin loanword Niger refers to someone as "dark-complexioned."',
        ),
      ).toBe("stu");
      expect(
        classifyFootnote(
          "This may well have been the understanding of the Latin translators who translated μονή (monē) by mansio, a stopping place.",
        ),
      ).toBe("stu");
    });

    it("should classify a real reading-claim naming the Latin as var, whether Latin is the claim's subject or its object (real WEBUS2020/NET2019 shapes)", () => {
      expect(classifyFootnote("So the Syriac. The Latin is corrupt.")).toBe("var");
      expect(classifyFootnote("The Latin omits I will speak.")).toBe("var");
      expect(
        classifyFootnote(
          "The Greek and the Latin versions read “and they sat down” for “and they returned,” involving just a change in vocalization.",
        ),
      ).toBe("var");
      expect(
        classifyFootnote(
          "However, this is the easier reading and is not supported by either the Latin or the Greek, which have second plural.",
        ),
      ).toBe("var");
    });
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

  describe('"authorities" is a witness only near a reading verb, since it collides with scholarly and governing authorities (real AMP1987/NET2019 shapes)', () => {
    it("should not classify a bare quantified mention of scholarly or governing authorities as var", () => {
      expect(
        classifyFootnote(
          "It is difficult to know positively to whom the Lord is speaking in these next verses—whether (1) to the Messiah, (2) to Israel, or (3) to Isaiah. The large majority of early authorities favored interpretation (1); later scholars incline toward interpretation (2).",
        ),
      ).toBe("stu");
      expect(
        classifyFootnote(
          "There is no certain identification of the location to which Jesus withdrew in response to the decision of the Jewish authorities.",
        ),
      ).toBe("stu");
      expect(classifyFootnote("Most authorities associate this with Ex 3:14, I Am Who I Am")).toBe("stu");
    });

    it('should still classify "authorities" as var whenever a reading verb sits near it, including ASV1901\'s own real reverse-order "omitted by" construct at its actual, unusually wide 49-character gap (Matthew 16:2)', () => {
      expect(
        classifyFootnote(
          "The following words, to the end of verse 3, are omitted by some of the most ancient and other important authorities.",
        ),
      ).toBe("var");
      expect(
        classifyFootnote(
          "The reading adopted by the translation is attested by many authorities (A D* K P 365 1739* al). But many others read “your” instead of “our.”",
        ),
      ).toBe("var");
      expect(classifyFootnote("This line is added by the best authorities.")).toBe("var");
    });

    it('should classify WEBUS2020\'s own real elliptical "So some authorities." opener as var, the same "So <witness>" idiom this table already applies to named witnesses (1 Esdras 8:20)', () => {
      expect(classifyFootnote("So some authorities. See Ezra 7:22. The common reading is, other things.")).toBe("var");
    });
  });

  describe("an abbreviated language name followed by a number is a cited book, not a language", () => {
    /**
     * 16 bodies across 4 versions take this shape, none carrying a textual
     * claim; `LANGUAGE_AFTER_SEMICOLON`'s doc comment has the collision behind
     * it. The numbers below are the real forms the citation takes, since the
     * rule turns on the numeral.
     *
     * What each case proves is that the body is not `var` — the abbreviation
     * reads as the book it names rather than the language it is spelled like.
     * Which of the other three types it lands on is decided by whatever else is
     * in it.
     */
    const citedBookAbbreviations = [
      "The note runs on for a while and then points elsewhere (Alpha 110; Beta 6:13; Heb. 7).", // period, bare chapter
      "Discussed at length, and compared with Alpha 4:3–4; Beta 6:4; Heb 12:5–11.", // no period, chapter:verse range
      "Something explanatory here (Alpha 1:1–4; Heb. 1:1–2).", // period, chapter:verse
    ];
    it.each(citedBookAbbreviations)("should classify %j as stu, the prose around the citation being what settles it", (body) => {
      expect(classifyFootnote(body)).toBe("stu");
    });

    it("should classify the same abbreviation in a body that is only citations as xrf, since nothing but citations is left once the marginal siglum is read as the filler it is", () => {
      expect(classifyFootnote("Alpha 16:22 mg; Heb 10:37; Gamma 5:8f")).toBe("xrf");
    });

    it("should still read a spelled-out language name after a semicolon as a language, even when a number follows it, since no book shares that spelling", () => {
      expect(classifyFootnote("Compare 45:1; Hebrew 10,000")).toBe("var");
      expect(classifyFootnote("See 15:9; Hebrew westward")).toBe("var");
    });

    it("should still read an abbreviated language name after a semicolon as a language when a word rather than a number follows it", () => {
      expect(classifyFootnote("As the versions have it; Heb. lacks this word")).toBe("var");
      expect(classifyFootnote("As the versions have it; Heb omits the clause")).toBe("var");
    });
  });

  describe("an abbreviated language name hyphenated into a longer word is part of that word, not a language", () => {
    /**
     * MSB2025 prints this body verbatim at Genesis 24:10, Deuteronomy 23:4,
     * Judges 3:8, 1 Chronicles 19:6, and Psalm 60:1 — a place
     * identification with no textual claim anywhere in it. The hyphen in
     * *Aram-naharaim* gives a word boundary, so the first half of the place
     * name was reading as the Aramaic language on the far side of a
     * semicolon.
     */
    const aramNaharaim =
      "That is, Mesopotamia; Aram-naharaim means Aram of the two rivers, likely the region between the Euphrates and Balih Rivers in northwestern Mesopotamia.";

    it("should classify MSB2025's Aram-naharaim note as stu, not var", () => {
      expect(classifyFootnote(aramNaharaim)).toBe("stu");
    });

    it("should refuse the abbreviation wherever a hyphen carries it into more letters, not only in this one place name", () => {
      expect(classifyFootnote("As in the parallel passage; Heb-something the rest of the note")).toBe("stu");
      expect(classifyFootnote("As in the parallel passage; Gr-something the rest of the note")).toBe("stu");
    });

    it("should still read the abbreviation as a language when the hyphen belongs to what follows it rather than to the abbreviation itself", () => {
      expect(classifyFootnote("As the versions have it; Heb well-watered land")).toBe("var");
      expect(classifyFootnote("As the versions have it; Aram. well-watered land")).toBe("var");
    });

    it("should not extend the refusal to a spelled-out language name, which collides with no place name in the canon", () => {
      expect(classifyFootnote("As in the parallel passage; Hebrew-something the rest of the note")).toBe("var");
    });
  });
});

describe('classifyFootnote — CLV1880\'s own "Originally verse N:N." idiom is var, not stu', () => {
  it("should classify CLV1880's own real versification note as var (Genesis 50:23)", () => {
    expect(classifyFootnote("Originally verse 50:22.")).toBe("var");
  });

  it("should classify the idiom regardless of chapter/verse magnitude, with or without a trailing period", () => {
    expect(classifyFootnote("Originally verse 100:1.")).toBe("var");
    expect(classifyFootnote("Originally verse 101:10.")).toBe("var");
    expect(classifyFootnote("Originally verse 40:13")).toBe("var");
  });

  it("should not classify a bare mention of 'verse' elsewhere in a note as this idiom — it must open the body", () => {
    expect(classifyFootnote("See the note on the originally-numbered verse above.")).not.toBe("var");
  });

  describe("a whole body that is nothing but a language name and a verse number is the same versification claim", () => {
    /**
     * Only the plainest form is attested; the article, the trailing period,
     * and the word for chapter are tested as ordinary variation on the same
     * construct. With only two bodies corpus-wide taking the shape, the
     * whole-body guard below is the load-bearing half of the rule.
     */
    it("should classify a body that is only a language name and a verse number as var", () => {
      expect(classifyFootnote("Hebrew verse 5")).toBe("var");
      expect(classifyFootnote("Hebrew verse 6")).toBe("var");
    });

    it("should admit the article, the trailing period, and the word for chapter as variation on the same construct", () => {
      expect(classifyFootnote("The Hebrew verse 5.")).toBe("var");
      expect(classifyFootnote("Greek chapter 12")).toBe("var");
    });

    it("should not match the same words with anything else in the body, since the whole-body anchor is what makes the rule safe", () => {
      expect(classifyFootnote("Hebrew verse 5 is numbered differently here")).not.toBe("var");
      expect(classifyFootnote("This clause opens Hebrew verse 5")).not.toBe("var");
    });
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

  describe("a caveat that the meaning of an original-language word is uncertain", () => {
    /**
     * 287 bodies corpus-wide carry the caveat: 93 already open with a
     * translation marker, 39 also name a witness, and the remaining 155 are
     * what this rule decides.
     */
    it("should classify the caveat as trn when it is the whole body", () => {
      expect(classifyFootnote("The meaning of the Hebrew word is uncertain.")).toBe("trn");
    });

    it("should classify the caveat as trn with the noun left out, the shape a noun-bearing pattern misses", () => {
      expect(classifyFootnote("The meaning of the Hebrew is uncertain")).toBe("trn");
    });

    it("should classify the caveat as trn behind a comparison citation, the shape that prompted the rule", () => {
      expect(classifyFootnote("Compare 18:10; the meaning of the Hebrew word is uncertain")).toBe("trn");
      expect(classifyFootnote("Compare Alpha 11:11; the meaning of the Hebrew expression is uncertain")).toBe("trn");
    });

    it("should classify the caveat as trn ahead of a trailing gloss", () => {
      expect(classifyFootnote("The meaning of the Hebrew word is uncertain; possibly a garment")).toBe("trn");
    });

    it("should classify the caveat as trn for the other two languages the rule admits, alongside the Hebrew cases above", () => {
      expect(classifyFootnote("The meaning of the Greek term is uncertain.")).toBe("trn");
      expect(classifyFootnote("The meaning of the Aramaic is uncertain.")).toBe("trn");
    });

    describe("a stronger signal already on the body keeps its own verdict, which is why this rule is consulted last", () => {
      /**
       * The caveat is not anchored to the whole body, so ordering rather than
       * position is what keeps it in its lane. Each case below pairs the
       * caveat with one stronger signal and asserts the verdict that signal
       * already produces.
       */
      it("should keep a body naming a witness outright as var", () => {
        expect(classifyFootnote("Compare Septuagint, Vulgate; the meaning of the Hebrew phrase is uncertain")).toBe("var");
      });

      it("should keep a body naming a language with its own witness noun as var", () => {
        expect(classifyFootnote("As in Greek version; the meaning of the Hebrew is uncertain.")).toBe("var");
      });

      it("should keep a body carrying a quantified witness phrase as var", () => {
        expect(classifyFootnote("Some ancient versions read otherwise. The meaning of the Hebrew word is uncertain.")).toBe(
          "var",
        );
      });

      it("should keep a body carrying a witness claim as var — a minimal body, since the 2 real ones of this shape trip two neighboring witness checks as well and would not isolate the claim", () => {
        expect(classifyFootnote("The manuscripts read otherwise; the meaning of the Hebrew word is uncertain.")).toBe("var");
      });

      it("should leave a body behind a translation opener trn by the opener, the more specific route, rather than by this rule", () => {
        expect(classifyFootnote("Or archers; the meaning of the Hebrew word is uncertain")).toBe("trn");
      });

      it("should keep a language comparison after a semicolon var — a constructed shape rather than a quoted one, since no real body takes it, and the single case that separates consulting this rule last from folding it into the translation rule", () => {
        expect(classifyFootnote("Compare 1:1; Hebrew reads otherwise. The meaning of the Hebrew is uncertain.")).toBe("var");
      });
    });

    describe("the rule's width is the agreed width", () => {
      /**
       * The language slot is the three original languages spelled out; the
       * noun slot is optional and at most one word.
       */
      const outsideTheRule = [
        "The meaning of the word is uncertain.", // no language named at all
        "The meaning of the Latin phrase is uncertain.", // a language outside the three
        "The meaning of the Hebrew word is disputed.", // a different predicate
        "The meaning of the Hebrew proper name is uncertain.", // two words in the noun slot
      ];
      it.each(outsideTheRule)("should leave %j at stu", (body) => {
        expect(classifyFootnote(body)).toBe("stu");
      });
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
   * Both constructs below used to be recognized as trn through
   * edition-specific literal phrases anchored to their own exact closing
   * clauses. Neither one opens with a recognized translation marker, and
   * neither says a word was *rendered* or *translated* — the actual
   * constructs {@link classifyFootnote} now looks for — so both read as stu
   * under the shared, edition-agnostic rules instead. This is a real,
   * accepted disagreement with the old behavior, not an oversight: the
   * measured cost is part of one edition's 54 real notes moving from trn to
   * stu, a known, worthwhile trade against needing a new literal phrase for
   * every edition's own equivalent construct.
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
 * Proves {@link flattenContentText}'s bare-`bibleLink`-defaults-to-reference
 * behavior against real corpus shapes; that function's doc comment has why it
 * matters.
 */
describe("flattenContentText — a bare bibleLink node's implied display text", () => {
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
 * Proves {@link flattenContentText} reads an `{ abbr }` node as its registry
 * id. Without it, a registry-referencing corpus hides every siglum from
 * {@link classifyFootnote}, which is how a body naming a printed edition
 * becomes `var`.
 */
describe("flattenContentText — an abbr node's registry id", () => {
  it("should flatten a bare {abbr} node to its id (MSB2025's Revelation 22:21, whose whole witness list is registry references)", () => {
    expect(flattenContentText({ abbr: "CT" })).toBe("CT");
  });

  it("should flatten a real MSB2025 note body's mixed abbr-and-text shape to what it prints (Revelation 22:21)", () => {
    expect(
      flattenContentText([
        { abbr: "CT" },
        ", ",
        { abbr: "SBL" },
        ", ",
        { abbr: "NE" },
        ", and ",
        { abbr: "WH" },
        " do not include Amen.",
      ]),
    ).toBe("CT, SBL, NE, and WH do not include Amen.");
  });

  it("should classify a witness-naming body whose sigla are abbr nodes as var, exactly as it would if they were plain text (MSB2025's Revelation 22:21)", () => {
    const body: unknown = [{ abbr: "CT" }, ", ", { abbr: "SBL" }, " do not include Amen."];
    expect(classifyFootnote(flattenContentText(body))).toBe("var");
    expect(classifyFootnote("CT, SBL do not include Amen.")).toBe("var");
  });

  it("should read TR out of the qualified TR-SCRIVENER id, since a hyphen is a word boundary (MSB2025's own qualified registry entry)", () => {
    expect(flattenContentText({ abbr: "TR-SCRIVENER" })).toBe("TR-SCRIVENER");
    expect(classifyFootnote(flattenContentText([{ abbr: "TR-SCRIVENER" }, " includes a longer reading here."]))).toBe(
      "var",
    );
  });
});

/**
 * One regression case per pattern that dropped a period-terminated
 * abbreviation. `WITNESS_ABBREVIATIONS`'s doc comment has the `\b` mechanics
 * behind why they dropped.
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

  it("should still read Syr as a witness when a number follows nearby, unlike Sam/Vg/Tg/Vss — Syr never collides with a book name or a discursive-note citation the way those do (real CSB2017 2 Chronicles 3:15's own measurement dispute)", () => {
    expect(classifyFootnote("Syr reads 18 cubits (27 feet); Hb reads 35 cubits (52 ¹⁄₂ feet)")).toBe("var");
    expect(classifyFootnote("Heb. mss., LXX, Syr. eighteen and 2 Kin. 24:8")).toBe("var");
  });
});

/**
 * `witnesses` reads as ordinary scripture vocabulary far more often than
 * apparatus jargon, so a bare quantifier must not be enough on its own.
 * `VERB_BOUND_WITNESS_NOUN`'s doc comment has the real corpus split.
 */
describe("classifyFootnote — witnesses needs a reading verb, not just a quantifier", () => {
  it("should classify KJV1769's own quoted-scripture body as trn on its Or opener, not var on “two witnesses”", () => {
    expect(classifyFootnote("Or, I will give unto my two witnesses that they may prophesy")).toBe("trn");
  });

  it("should still classify a real apparatus claim about witnesses as var", () => {
    expect(classifyFootnote("Some witnesses read “the Lord” here.")).toBe("var");
  });
});

/**
 * A Greek or Hebrew critical edition prints its apparatus as operators
 * between competing readings, never as the prose the vocabulary rules look
 * for, so without this construct every one of BYZ2018's 7,522 real bodies
 * falls through to `stu`.
 */
describe("classifyFootnote — symbolic apparatus notation is var", () => {
  it("should classify the ⇒ operator separating two readings as var (BYZ2018's own 2018 apparatus)", () => {
    expect(classifyFootnote("N Οἱ δὲ ⇒ -")).toBe("var");
    expect(classifyFootnote("B ὁ βασιλεὺς ⇒ βασιλεῦ")).toBe("var");
    expect(classifyFootnote("N αὐτῷ ὁ Ἰωάννης ⇒ ὁ Ἰωάννης αὐτῷ")).toBe("var");
  });

  it("should classify a standalone ~ as var — BYZ2018's own mark for a verse the compared edition omits, used for exactly the eleven verses from Matthew 17:21 to Romans 16:24", () => {
    expect(classifyFootnote("N ~")).toBe("var");
  });

  it("should classify the ¦ witness separator as var, the notation the forthcoming 2026 edition uses throughout", () => {
    expect(classifyFootnote("δαυιδ ¦ HF TR δαβιδ ¦ TH WH δαυειδ")).toBe("var");
    expect(classifyFootnote("ασα ασα ¦ CT ασαφ ασαφ")).toBe("var");
  });

  it("should not read an ordinary tilde inside prose as apparatus notation", () => {
    expect(classifyFootnote("A cubit is about 18 inches (~45 cm).")).toBe("stu");
  });
});

/**
 * The two real 2026-edition publisher notes that carry no `¦` separator at all.
 * `APPARATUS_NOTATION`'s doc comment has why each needs a signal of its own
 * rather than falling through to `stu`.
 */
describe("classifyFootnote — a critical edition's longer publisher notes", () => {
  it("should classify a prose note about how comparison editions differ as var, on its quantified “editions” (the 2026 edition's own Matthew 23:13-14 note, which carries no apparatus separator at all)", () => {
    expect(
      classifyFootnote(
        "Some comparison editions swap verse numbers for verse 13 and verse 14, some omit the content of verse 13 entirely, and some display variations in the appearance of the post-positive conjunction δε. Please see Appendix C for a full treatment of this lengthy variant unit.",
      ),
    ).toBe("var");
  });

  it("should classify a bare witness list as var on its ℵ siglon, where the uncial letters and Gregory-Aland numbers around it are far too ordinary to match on (the 2026 edition's own 1 John 5:7-8 note, markdown stripped)", () => {
    expect(classifyFootnote("om. ℵ A B K L P Ψ 048 049 056 0142 0296 33vid 1841 1862 2464")).toBe("var");
  });

  it("should not read an unquantified mention of editions as a witness claim, since that is ordinary background prose", () => {
    expect(classifyFootnote("This verse is numbered differently in the standard critical editions of the Greek NT.")).toBe("stu");
  });
});

/**
 * KJV1769's real spread of original-language abbreviations — a fixed list of
 * full names would not catch any of these. `LANGUAGE_OPENER`'s doc comment has
 * the full count.
 */
describe("classifyFootnote — every spelling of an original-language opener is trn", () => {
  describe("KJV1769's own Hebrew abbreviations", () => {
    const bodies = ["Hebr. to cause it to fly", "He. the staff, or the head", "Heb. between the light and between the darkness"];
    it.each(bodies)("should classify %j as trn", (body) => {
      expect(classifyFootnote(body)).toBe("trn");
    });
  });

  describe("KJV1769's own Chaldee abbreviations, including the h-less and comma-terminated printings", () => {
    const bodies = [
      "Chald. societies",
      "Chal. Cheeneth",
      "Cald. made",
      "Chalde, books",
      "Chaldee, go",
      "Chal, societies",
      "Chald, cores",
    ];
    it.each(bodies)("should classify %j as trn", (body) => {
      expect(classifyFootnote(body)).toBe("trn");
    });
  });

  it("should classify a truncated body that is nothing but the opener as trn (2 Chronicles 4:2's real body is the single word “Heb.”)", () => {
    expect(classifyFootnote("Heb.")).toBe("trn");
  });

  describe("CSB2017's own Gk abbreviation for Greek — a different two-letter form from Gr, which was already covered", () => {
    const bodies = [
      "Gk lepros; a term for various skin diseases; see Lv 13–14",
      "Gk assarion, a small copper coin",
      "Gk text lacks the manna",
      "Gk Didymus",
    ];
    it.each(bodies)("should classify %j as trn", (body) => {
      expect(classifyFootnote(body)).toBe("trn");
    });
  });

  it("should not read an ordinary sentence opening with the pronoun “He” as a Hebrew gloss, which is why that two-letter form alone must carry its own period or comma", () => {
    expect(classifyFootnote("He said unto them, Follow me.")).toBe("stu");
  });

  it("should not read a word merely beginning with an opener's letters as an opener (“called in the original Didrachma…” is not the Chaldee “Cal.”)", () => {
    expect(classifyFootnote("called in the original Didrachma, being in value fifteen pence")).toBe("stu");
  });
});

/**
 * "Some read X" is a witness claim with the witness noun left out, since it
 * can only mean "some manuscripts read X".
 */
describe("classifyFootnote — an elliptical “some read” is var when it is the note itself", () => {
  const bodies = ["Some read, our", "some read against themselves", "Some read, both your, and their master"];
  it.each(bodies)("should classify %j as var", (body) => {
    expect(classifyFootnote(body)).toBe("var");
  });

  it("should leave the same words as trn when they only qualify an alternative an Or opener already offered — ASV1901's own convention, which KJV1769 disagrees with", () => {
    expect(classifyFootnote("Or as some read shake. See Ps. 69:23.")).toBe("trn");
  });

  it("should classify the identical elliptical construct with 'emend' in place of 'read' as var (real CSB2017 shapes, e.g. 2 Kings 6:33's own 'Some emend to king')", () => {
    const bodies = [
      "Some emend to king",
      "Some emend to God has not appointed a time for man to",
      "Some emend to me",
      "Some emend to In the mouth of a fool is a rod for his back",
    ];
    for (const body of bodies) expect(classifyFootnote(body)).toBe("var");
  });

  it("should not read 'emend' as a general witness verb once it's not adjacent to the elliptical opener — WITNESS_VERB_SOURCE deliberately excludes the present tense so a stray witness noun near 'emend' deep in an unrelated note can't flip it (real NET2019 Psalm 119:22 word-study note, opening with an anchored Heb marker and mentioning 'a Dead Sea scroll... emend' 400 characters in)", () => {
    expect(
      classifyFootnote(
        "Heb “roll away from upon me.” Some derive the imperatival form from a different root, but here the form is different; see the note. Some, following the lead of a Dead Sea scroll, emend the form to a shorter one.",
      ),
    ).toBe("trn");
  });
});

/**
 * `Sam.` abbreviates the Samaritan Pentateuch in an apparatus and the book
 * of Samuel in a cross-reference. Position tells them apart.
 */
describe("classifyFootnote — Sam. is a witness only at the start of a note", () => {
  it("should classify a note-initial Sam. as the Samaritan Pentateuch", () => {
    expect(classifyFootnote("Sam. omits Chief Korah")).toBe("var");
  });

  it("should read a trailing “in Sam.” as the book of Samuel instead (KJV1769's own cross-reference wording)", () => {
    expect(classifyFootnote("Called Ahimelech in Sam.")).toBe("stu");
    expect(classifyFootnote("Or, Hadadezer in Sam")).toBe("trn");
  });
});

/**
 * The MSB's critical-edition apparatus. Every body below is verbatim from
 * BibleHub's MSB pages, which the publisher has dedicated to the public domain,
 * and each is cited by book, chapter, and verse.
 *
 * The MSB names eleven printed editions the older siglum list had never met,
 * and 1,764 of its 6,644 notes name one with no already-known siglum beside it.
 * Three of the eleven need a guard; `WITNESS_SIGLA`'s doc comment has what each
 * guard is and what it was measured against.
 */
describe("classifyFootnote — the MSB's printed-edition sigla", () => {
  describe("a siglum with no collision anywhere in the corpus", () => {
    const bodies: readonly [string, string][] = [
      ["CT (Matthew 1:6)", "CT David"],
      ["GOC (Matthew 11:21)", "GOC sitting in"],
      ["F35 (Matthew 7:19)", "F35 Every tree, then,"],
      ["WH (Matthew 6:8)", "WH God your Father"],
      ["ALT (Matthew 11:16)", "ALT, F35 marketplace"],
      ["ECM (Revelation 9:17)", "ECM does not include In a vision."],
      ["Scrivener (Luke 2:22)", "Literally their purification; Scrivener TR her purification"],
    ];
    it.each(bodies)("should classify a body naming %s as var", (_where, body) => {
      expect(classifyFootnote(body)).toBe("var");
    });
  });

  describe("a siglum a critical edition also prints with its own edition number", () => {
    it("should classify a bare NA as var (Matthew 26:63)", () => {
      expect(classifyFootnote("NA does not include and dish.")).toBe("var");
    });

    it("should classify a bare NE as var (Luke 12:27)", () => {
      expect(classifyFootnote("NE and Tischendorf Consider the lilies: They do not spin or weave.")).toBe("var");
    });

    it("should classify a bare TH as var (Mark 4:21)", () => {
      expect(classifyFootnote("TH does not include or under a basket.")).toBe("var");
    });

    it("should not read a numbered printing of one of those editions as a bare siglum (NET2019's own NA²⁸ shape, whose notes are about where that edition sets a verse division)", () => {
      expect(
        classifyFootnote(
          "The versification of vv. 12 and 13 in the NET (so also NRSV, NLT) is according to the versification in the NA²⁸ and UBS⁵ editions of the Greek text.",
        ),
      ).toBe("stu");
    });

    it("should not read a two-letter siglum standing before a chapter and verse as a siglum at all", () => {
      expect(classifyFootnote("Cited in NE 4:6")).toBe("xrf");
    });
  });

  describe("SBL abbreviates both a printed Greek edition and the society that publishes a journal", () => {
    it("should classify a bare SBL as var (Mark 1:41)", () => {
      expect(classifyFootnote("SBL Moved with indignation")).toBe("var");
    });

    it("should classify SBL beside a proper-noun reading as var (Luke 3:26)", () => {
      expect(classifyFootnote("NA and SBL Semein; TH and WH Semeein; ALT and HF Semeei; GOC Semeu")).toBe("var");
    });

    it("should leave a bibliographic citation of that society's own journal alone (NET2019's real Romans 3:22 note, a translation note whose only SBL is in a title)", () => {
      expect(
        classifyFootnote(
          'Or "faith in Christ." Though traditionally translated "faith in Jesus Christ," an increasing number of NT scholars are arguing that this is a subjective genitive; see J. D. G. Dunn, "Once More, ΠΙΣΤΙΣ ΧΡΙΣΤΟΥ," SBL Seminar Papers, 1991, 730-44.',
        ),
      ).toBe("trn");
    });
  });
});

/**
 * `Cited in ‹citation›` is the MSB's lead-in where the other editions in this
 * corpus write `Fulfilled in` or `Foretold in` — the same construct, naming
 * where the verse is quoted rather than claiming anything about its wording.
 * 184 MSB bodies open this way and no body in any other version on disk does.
 */
describe("classifyFootnote — a Cited in lead-in is a citation, not a study note", () => {
  it("should classify a single citation behind the lead-in as xrf (Genesis 1:3)", () => {
    expect(classifyFootnote("Cited in 2 Corinthians 4:6")).toBe("xrf");
  });

  it("should classify a two-citation list behind the lead-in as xrf (Genesis 1:27)", () => {
    expect(classifyFootnote("Cited in Matthew 19:4 and Mark 10:6")).toBe("xrf");
  });

  it("should keep a body that only mentions being cited, without opening on the lead-in, as stu", () => {
    expect(classifyFootnote("This verse is cited in the New Testament at Matthew 19:4, where the wording differs.")).toBe(
      "stu",
    );
  });
});

/**
 * `Forms of the ‹language› ‹term› … are translated as ‹rendering›` is the MSB's
 * template for a recurring lexical decision, and a rendering claim in the same
 * sense `words rendered`/`words translated` already is. The same opener with no
 * rendering verb behind it is not, since it describes what the term covers and
 * offers no alternative. 33 of the MSB's 70 `Forms of` bodies carry the verb.
 */
describe("classifyFootnote — Forms of the <language> <term> ... are translated", () => {
  it("should classify the rendering claim as trn (Genesis 14:13)", () => {
    expect(classifyFootnote("Forms of the Hebrew berit are translated in most passages as covenant.")).toBe("trn");
  });

  it("should classify the rendering claim with a clause between the term and the verb as trn (Leviticus 13:47)", () => {
    expect(
      classifyFootnote(
        "Forms of the Hebrew tzaraath, traditionally translated as leprosy regarding skin diseases, are translated as mildew regarding blemishes in fabric or leather.",
      ),
    ).toBe("trn");
  });

  it("should leave the same opener with no rendering verb as stu (Exodus 22:20)", () => {
    expect(
      classifyFootnote(
        "Forms of the Hebrew cherem refer to the giving over of things or persons to the LORD, either by destroying them or by giving them as an offering.",
      ),
    ).toBe("stu");
  });
});
