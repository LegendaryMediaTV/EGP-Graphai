import { describe, expect, it } from "vitest";
import { classifyFootnote, flattenContentText } from "../footnoteTypeRules";

/**
 * Every body string below is real, extracted verbatim from the in-scope
 * WEBUS2020 corpus (`imports/webus2020/ebible-usfm/*.usfm`) — guide §6's own
 * discipline against hand-invented fixtures applies to a classification
 * predicate's own test data exactly as much as to a tokenizer's. The one
 * exception is the `xrf` case: this corpus carries zero real `\f`-type
 * footnotes shaped as "nothing but references" (every reference inside a
 * real `\f` note sits in explanatory prose), so that predicate is proven
 * against a real reference string pulled from an in-scope `\x` cross-
 * reference's own `\xt` target instead (2 Kings 12:4 → Exodus 30:12) — a
 * genuinely reference-shaped string, just not one this corpus's own `\f`
 * notes happen to produce.
 */

describe("classifyFootnote — xrf (nothing but references)", () => {
  it("should classify a body that is only a reference as xrf (2 Kings 12:4's \\xt target, Exodus 30:12 — no real \\f in this corpus is xrf-shaped, so this proves the rule on a genuine reference-only string)", () => {
    expect(classifyFootnote("Exodus 30:12")).toBe("xrf");
  });

  it("should not classify a body that merely contains a reference amid real prose as xrf (Genesis 6:2's cherubim note)", () => {
    expect(classifyFootnote("cherubim are powerful angelic creatures, messengers of God with wings. See Ezekiel 10.")).toBe(
      "stu",
    );
  });
});

describe("classifyFootnote — a trailing tradition siglon (LXX/MT/TR/NU) directly after a reference is still xrf, not var", () => {
  it('should classify Hebrews 1:6\'s real "Deuteronomy 32:43 LXX" body as xrf — a citation naming its own textual tradition, not a note contesting the verse\'s own wording — rather than the var a bare "LXX" witness-phrase match would otherwise produce', () => {
    expect(classifyFootnote("Deuteronomy 32:43 LXX")).toBe("xrf");
  });
});

describe("classifyFootnote — var (names a witness, ordered before trn)", () => {
  it("should classify WEB's own Byzantine-Majority-Text/Textus-Receptus/Nestle-Aland-UBS sigla as var (Mark 16:8)", () => {
    expect(classifyFootnote('TR adds "quickly"')).toBe("var");
  });

  it("should classify the lower-case \"nu\" sigil as var too (Acts 4:27 — the corpus's one real casing slip against 200+ upper-case NU instances elsewhere)", () => {
    expect(classifyFootnote('nu adds "in this city,"')).toBe("var");
  });

  it("should classify a spelled-out witness name as var (Deuteronomy 33:2)", () => {
    expect(
      classifyFootnote(
        'another manuscript reads "He came with myriads of holy ones from the south, from his mountain slopes."',
      ),
    ).toBe("var");
  });

  it("should classify WEB's own LXX/DSS abbreviations as var (Isaiah 29:18)", () => {
    expect(classifyFootnote("LXX and DSS add: recovery of sight to the blind")).toBe("var");
  });

  it("should run before trn, so a witness note that also happens to say \"reads\" is not caught by a translation-alternative rule instead (Genesis 36:2, the identical word/sigil order guide §6 itself warns about)", () => {
    expect(classifyFootnote('LXX reads "angels" instead of "gods"')).toBe("var");
  });
});

describe("classifyFootnote — trn (offers a real English translation alternative)", () => {
  it("should classify WEB's own lower-case \"or, <alternative>\" house style as trn (Genesis 2:12)", () => {
    expect(classifyFootnote("or, aromatic resin")).toBe("trn");
  });

  it("should classify a \"Hebrew: <alternative>\" opener as trn (2 Kings 17:27)", () => {
    expect(classifyFootnote("Hebrew: them")).toBe("trn");
  });

  it("should classify a \"Hebrew <alternative>\" opener with no colon as trn too (2 Chronicles 23:3)", () => {
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
    expect(
      classifyFootnote('"Yahweh" is God’s proper Name, sometimes rendered "LORD" (all caps) in other translations.'),
    ).toBe("trn");
  });

  it('should classify "can also be translated" as trn regardless of where in the sentence it falls (Genesis 4:1)', () => {
    expect(
      classifyFootnote(
        '"Adam" and "Man" are spelled with the exact same consonants in Hebrew, so this can be correctly translated either way.',
      ),
    ).toBe("trn");
  });
});

describe("classifyFootnote — stu (default; naming an original-language term is not the same as offering an alternate English rendering)", () => {
  it("should classify a bare name-etymology note as stu, not trn (Genesis 25:26)", () => {
    expect(classifyFootnote('Isaac means "he laughs".')).toBe("stu");
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
});

/**
 * Deuterocanon: every body string below is real, re-extracted verbatim
 * from the 15 deuterocanon files
 * (`imports/webus2020/ebible-usfm/{41-TOB,53-2MA,43-ESG}eng-web.usfm`), not
 * carried over unexamined from the 66-book canonical corpus's own vocabulary
 * — this book family carries its own real, different witness/translation
 * phrasing (guide §6's own "re-derive, don't assume" discipline).
 */
describe("classifyFootnote — deuterocanon's own re-derived vocabulary", () => {
  it('should classify WEB\'s own abbreviated "Gr." opener as trn, the identical semantic role as the already-spelled-out "Greek:" opener (Tobit 1:13)', () => {
    expect(classifyFootnote("Gr. beauty.")).toBe("trn");
  });

  it('should classify "<word> authorities read" as var — the deuterocanon corpus\'s own manuscript-variant phrasing, playing the identical role guide §6\'s generic witness vocabulary already covers under a different wording (Tobit 1:17)', () => {
    expect(classifyFootnote("Some ancient authorities read behind.")).toBe("var");
    expect(classifyFootnote("Many authorities read toward the Jews, he sent.")).toBe("var");
  });

  it('should still classify a bare "Hebrew"/"in the Hebrew" witness-naming note as stu, not var — a bare "Hebrew" substring is deliberately not added as a witness phrase (see this module\'s own doc comment): it would misclassify the 66-book canonical corpus\'s own already-shipped "Hebrew word rendered X is Y" background notes (Genesis 1:1 and 17 others), corrupting already-shipped data for a marginal, low-confidence reclassification of a handful of real Esther-Greek notes (Esther-Greek 3:13, 4:17)', () => {
    expect(classifyFootnote("Note: The part in brackets is not in Hebrew")).toBe("stu");
    expect(classifyFootnote("Note: The part between brackets, i.e. to the end of chapter 5 is not in the Hebrew")).toBe(
      "stu",
    );
  });
});

/**
 * Every body string below is real, extracted verbatim from ASV1901's own 16
 * real `\f`...`\f*` spans (`imports/asv1901/ebible-usfm/{70-MAT,71-MRK,
 * 72-LUK,73-JHN,74-ACT,75-ROM}eng-asv.usfm`) — textual-variant notes citing
 * manuscript witnesses with "insert"/"add"/"omit" wording, distinct from
 * WEB's own "authorities read" phrasing.
 */
describe("classifyFootnote — ASV1901's real \"authorities insert/add/omit\" witness vocabulary", () => {
  it("should classify every one of the 16 real ASV1901 textual-variant notes as var, not the stu they currently fall through to", () => {
    const realAsv1901Bodies = [
      // John 5:4
      'Many ancient authorities insert, wholly or in part, waiting for the moving of the water: for an angel of the Lord went down at certain seasons into the pool, and troubled the water: whosoever then first after the troubling of the water stepped in was made whole, with whatsoever disease he was holden.',
      // Matthew 17:21
      'Many authorities, some ancient, insert v. 21. But this kind goeth not out save by prayer and fasting. See Mrk 9:29.',
      // Matthew 18:11
      'Many authorities, some ancient, insert v. 11. For the son of man came to save that which was lost. See Luk 19:10.',
      // Matthew 23:14
      'Some authorities insert here, or after v. 12, v. 14 Woe unto you scribes and Pharisees, hypocrites! for you devour widows’ houses, even while for a pretence ye make long prayes: therefore ye shall receive greater condemnation. See Mrk 12:40; Luk 20:47.',
      // Mark 7:16
      'Many ancient authorities insert v. 16. If any man hath ears to hear, let him hear. See Mrk 4:9,23.',
      // Mark 9:44 (identical body to Mark 9:46)
      'Vs. 44 and 46 (which are identical with v. 48) are omitted by the best ancient authorities.',
      // Mark 11:26
      'Many ancient authorities add v. 26 But if ye do not forgive, neither will your Father who is in heaven forgive your trespasses. Com. Mat 6:15; 18:35',
      // Mark 15:28
      'Many ancient authorities insert v. 28, And the scripture was fulfilled, which saith, And he was reckoned with transgressors. See luk 22:37.',
      // Luke 17:36
      'Some ancient authorities add v. 36. There shall be two men in the field; the one shall be taken and the other shall be left. Mat 24:40',
      // Luke 23:17
      'Many ancient authorities insert v. 17. Now he must needs release unto them at the feast one prisoner. Comp. Mat 27:15; Mrk 15:6; Jhn 18:39. Others add the same words after v. 19.',
      // Romans 16:24
      'Some ancient authorities insert here v. 24 The grace of our Lord Jesus Christ be with you all. Amen, and omit the like words in v. 20.',
      // Acts 8:37
      'Some ancient authorities insert, wholly or in part, v. 37. And Philip said, If thou believest with all thy heart, thou mayest. And he answered and said, I believe that Jesus Christ is the Son of God.',
      // Acts 15:34 — the corpus's own real source typo, "authorites" (missing "i")
      'Some ancient authorites insert, with variations, v. 34. But it seemed good unto Silas to abide there.',
      // Acts 24:7
      'Some ancient authorities insert and we would have judged him according to our law. But the chief captain Lysias came, and with great violence took him away out of our hands, commanding his accusers to come before thee.',
      // Acts 28:29
      'Some ancient authorities insert v. 29: And when he had said these words, the Jews departed, having much disputing among themselves.',
    ];
    for (const body of realAsv1901Bodies) expect(classifyFootnote(body)).toBe("var");
  });
});

/**
 * A locking test against a real collision risk: WEB's own deuterocanon
 * corpus already carries 3 real "authorities omit" footnotes (Sirach 7:26,
 * 1 Esdras 9:48, Manasses 1:10), correctly `stu` — none say "ancient
 * authorities" the way ASV1901's own real wording does. A naive bare
 * "authorities omit" phrase in `WITNESS_PHRASES` would silently reclassify
 * these three from `stu` to `var`. ASV1901's own real "omit" wording (Mark
 * 9:44/9:46) uses the reverse, verb-first order instead — "omitted by the
 * best ancient authorities" — which doesn't collide with WEB's noun-first
 * "authorities omit" wording at all, so both can be handled correctly at
 * once.
 */
describe("classifyFootnote — WEB's own real \"authorities omit\" collision risk", () => {
  it("should classify WEB's own 3 real deuterocanon \"authorities omit\" footnote bodies as stu — a real, already-shipped classification a bare \"authorities omit\" phrase addition would silently flip to var (the real corpus-wide search proving these are the only 3, and that bare \"authorities insert\"/\"authorities add\" collide with nothing at all, lives in verify.test.ts, which can scan every real WEB file directly)", () => {
    expect(classifyFootnote("Many authorities omit this line ")).toBe("stu"); // Sirach 7:26
    expect(classifyFootnote("Some authorities omit and read...Lord.")).toBe("stu"); // 1 Esdras 9:48
    expect(classifyFootnote("Some authorities omit by reason of my sins.")).toBe("stu"); // Manasses 1:10
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
 * Every real body below is quoted verbatim from the real WEBUS2020 source
 * (`imports/webus2020/ebible-usfm/*.usfm`), not re-derived or guessed.
 */
describe("classifyFootnote — four trn-recovery openers/constructs", () => {
  describe("a Literally,/Lit. opener (27 real WEB instances; NET2019/LSB2021/CSB2017/NKJV1982 corroborate at far higher volume)", () => {
    it('should classify a lower-case "literally, <quoted alternate>" opener as trn (Leviticus 19:16)', () => {
      expect(classifyFootnote('literally, “blood”')).toBe("trn");
    });

    it('should classify a capitalized "Literally, <alternate>" opener as trn, including the real \\fqa-continuation shape (Psalm 118:22 — "Literally, " from \\ft, "head of the corner" from \\fqa, concatenated by the same rule every other \\fqa note already uses)', () => {
      expect(classifyFootnote("Literally, head of the corner")).toBe("trn");
    });

    it('should classify a bare, unquoted "literally, <word>" opener as trn too, not just the quoted form (Matthew 6:27)', () => {
      expect(classifyFootnote("literally, cubit")).toBe("trn");
    });

    it('should classify a real "literally, <quoted phrase>" opener from the New Testament corpus as trn (Revelation 9:16)', () => {
      expect(classifyFootnote("literally, “ten thousands of ten thousands”")).toBe("trn");
    });

    it('should also classify the abbreviated "Lit" opener as trn, even though no real WEB body uses it — corroborated by LSB2021\'s own real, already-shipped "Lit face" (Genesis 1:2), one of hundreds of real instances that corpus uses this exact abbreviation for', () => {
      expect(classifyFootnote("Lit face")).toBe("trn");
    });
  });

  describe('the "Behold... means <gloss list>" interjection note (51 real WEB instances, both the Hebrew-הִנֵּה and Greek-ἰδοὺ variants)', () => {
    it('should classify the real Hebrew variant as trn (Esther 6:5, "Behold", from "הִנֵּה")', () => {
      expect(
        classifyFootnote(
          "“Behold”, from “הִנֵּה”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.",
        ),
      ).toBe("trn");
    });

    it('should classify the real Greek variant as trn too (Mark 1:2, "Behold", from "ἰδοὺ" — the identical interjection-gloss construct, just the other Testament\'s own original-language word)', () => {
      expect(
        classifyFootnote(
          "“Behold”, from “ἰδοὺ”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection.",
        ),
      ).toBe("trn");
    });
  });

  it('should classify the bare-infinitive "can also mean" form as trn, not just the singular "also means" the pattern already covered (Psalm 138:1 — grammatical-number agreement with the plural-subject gloss list that follows)', () => {
    expect(classifyFootnote('The word elohim, used here, usually means “God” but can also mean “gods”, “princes”, or “angels”.')).toBe(
      "trn",
    );
  });

  it('should classify "may be also correctly translated" as trn — "also" placed after "be" rather than immediately after the modal, a real word-order permutation the existing can/could/may pattern did not accept (Acts 3:17)', () => {
    expect(
      classifyFootnote('The word for “brothers” here may be also correctly translated “brothers and sisters” or “siblings.”'),
    ).toBe("trn");
  });
});

/**
 * The Behold-gloss pattern above must stay narrowly anchored to its own
 * real, recurring vocabulary ("Behold" + the six-way gaze-list gloss)
 * rather than becoming a general "sentence says means followed by an
 * or-list" rule — these two real WEBUS2020 fixtures (Revelation 9:11) share
 * the closest surface shape (a quoted term, "means", a comma-and-"or"
 * separated gloss list) but name a transliterated proper name's own
 * etymology, not a live English alternative for a word the translators did
 * translate. A pattern broad enough to catch the 51 real Behold instances
 * but not anchored to "Behold" specifically would misclassify these.
 */
describe("classifyFootnote — the Behold-gloss pattern must not misclassify Abaddon/Apollyon's own name-etymology notes", () => {
  it('should still classify "Abaddon" is a Hebrew word that means <gloss list> as stu, not trn (Revelation 9:11)', () => {
    expect(classifyFootnote("“Abaddon” is a Hebrew word that means “ruin”, “destruction”, or “the place of destruction”")).toBe(
      "stu",
    );
  });

  it('should still classify "Apollyon" means "Destroyer" as stu, not trn (Revelation 9:11, the same verse\'s second name-etymology note)', () => {
    expect(classifyFootnote("“Apollyon” means “Destroyer”.")).toBe("stu");
  });
});

/**
 * Every body below is real, extracted verbatim from
 * `imports/webus2020/ebible-usfm/*.usfm` (the transliterated Hebrew word
 * itself is omitted from the Elohim fixture, matching this file's own
 * convention, since the classifier never inspects script content). Both
 * real Adonai punctuation variants are included (Genesis/Exodus's own
 * "Adonai". versus every other book's own "Adonai." — the closing quote
 * sits on one side of the period or the other depending on the book) to
 * prove the pattern doesn't care which.
 */
describe("classifyFootnote — the divine-title-naming template (word rendered/translated X)", () => {
  it('should classify WEB\'s own recurring "Hebrew word rendered X is Y" boilerplate as trn, not stu — saying a word was "rendered" is itself describing a real translation choice (Genesis 1:1 and 40 other real instances)', () => {
    expect(classifyFootnote('The Hebrew word rendered "God" is "Elohim" (Elohim).')).toBe("trn");
  });

  it('should classify "the word translated X is Y" as trn (every book\'s own recurring Adonai note, period-inside-quotes variant — Numbers 14:17 and most other real instances)', () => {
    expect(classifyFootnote('The word translated "Lord" is "Adonai."')).toBe("trn");
  });

  it('should classify the identical Adonai note\'s other real punctuation variant as trn too (Genesis 15:2/Exodus 4:10\'s own "Adonai". with the period outside the closing quote)', () => {
    expect(classifyFootnote('The word translated "Lord" is "Adonai".')).toBe("trn");
  });
});

/**
 * The general `\bword\s+(?:rendered|translated)\b/i` pattern must not reach
 * past the divine-title template into a real name-etymology note that
 * shares no part of its own real wording — Isaac/Abaddon/Apollyon never say
 * a name was *rendered* or *translated*, only what it *means*.
 */
describe("classifyFootnote — the rendered/translated pattern must not misclassify Isaac/Abaddon/Apollyon's own name-etymology notes", () => {
  it("should still classify a bare name-etymology note as stu, not trn (Genesis 25:26, Isaac)", () => {
    expect(classifyFootnote('Isaac means "he laughs".')).toBe("stu");
  });

  it('should still classify "Abaddon" is a Hebrew word that means <gloss list> as stu, not trn (Revelation 9:11)', () => {
    expect(classifyFootnote("“Abaddon” is a Hebrew word that means “ruin”, “destruction”, or “the place of destruction”")).toBe(
      "stu",
    );
  });

  it('should still classify "Apollyon" means "Destroyer" as stu, not trn (Revelation 9:11, the same verse\'s second name-etymology note)', () => {
    expect(classifyFootnote("“Apollyon” means “Destroyer”.")).toBe("stu");
  });
});

/**
 * Two more real trn-recovery additions (objective
 * 2026-08-22-001's own Finding 5, reopening a call objective 002 originally
 * left as an accepted `stu` residual). Every body below is real, quoted
 * verbatim from the in-scope WEBUS2020 corpus.
 */
describe("classifyFootnote — a comma-punctuated Hebrew:/Greek:/Aramaic: opener (the same translation-choice family, just comma-led instead of colon-led)", () => {
  it('should classify the real "Hebrew, <alternate>" opener as trn (Exodus 17:15 — the corpus\'s one real Hebrew instance of this shape)', () => {
    expect(classifyFootnote("Hebrew, Yahweh Nissi")).toBe("trn");
  });

  it('should classify the real "Greek, <alternate>" opener as trn too (Matthew 16:18 — the corpus\'s one real Greek instance of this shape)', () => {
    expect(classifyFootnote("Greek, petra, a rock mass or bedrock.")).toBe("trn");
  });
});

/**
 * The real "Aleph Tav" grammatical-marker note. Objective
 * 2026-08-22-001's own Finding 5 first described this as a genuine
 * singleton (Exodus 20:1 alone, no corroborating instance) — checked
 * directly against the real corpus this phase, that description was wrong:
 * Zechariah 12:10 carries the identical template verbatim, differing only
 * in the quoted word that precedes it ("God" vs "me"), and upstream `HEAD`
 * tags both `trn`. This is a real, narrow, two-instance construct, not a
 * singleton — anchored to the note's own distinctive closing clause rather
 * than to "Hebrew" or "Aleph Tav" alone, since the note explains a
 * grammatical marker with no English rendering at all, not a name's
 * etymology (the shape `WITNESS_PHRASES`'s own doc comment already warns
 * a bare "Hebrew" substring would misclassify).
 */
describe('classifyFootnote — the real "not as a word, but as a grammatical marker" construct (Exodus 20:1, Zechariah 12:10 — the Aleph-Tav note)', () => {
  it("should classify Exodus 20:1's own real body as trn", () => {
    expect(
      classifyFootnote(
        "After “God”, the Hebrew has the two letters “Aleph Tav” (the first and last letters of the Hebrew alphabet), not as a word, but as a grammatical marker.",
      ),
    ).toBe("trn");
  });

  it("should classify Zechariah 12:10's own real body as trn too, confirming this is a real, repeated construct and not a one-off fixture (the quoted preceding word differs, \"me\" instead of \"God\")", () => {
    expect(
      classifyFootnote(
        "After “me”, the Hebrew has the two letters “Aleph Tav” (the first and last letters of the Hebrew alphabet), not as a word, but as a grammatical marker.",
      ),
    ).toBe("trn");
  });
});
