import { describe, expect, it } from "vitest";
import { buildCrossReferenceContent, buildReferenceOnlyContent, linkEmbeddedReferences } from "../references";
import { Token, tokenize } from "../tokenize";

/**
 * Every raw USFM snippet below is copied verbatim from the WEBUS2020
 * source, cited by book/verse in each test's title — the same convention
 * `footnotes.test.ts` already established. Fixtures test the parser
 * against the grammar that actually exists, not a hand-invented one.
 */

/** The 66-book in-scope canon, resolved once here and used as {@link xrefFrom}'s default `canonBookIds`. */
const IN_SCOPE_CANON = new Set([
  "GEN", "EXO", "LEV", "NUM", "DEU", "JSH", "JDG", "RTH", "1SM", "2SM", "1KG", "2KG",
  "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRV", "ECC", "SOS", "ISA", "JER",
  "LAM", "EZK", "DAN", "HOS", "JOL", "AMS", "OBD", "JNA", "MIC", "NAH", "HAB", "ZPH",
  "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TM", "2TM", "TIT", "PHM", "HEB", "JAS", "1PT",
  "2PT", "1JN", "2JN", "3JN", "JUD", "REV",
]);

/**
 * @param raw - A real, verbatim USFM snippet containing exactly one
 *   `\x`...`\x*` span, with nothing but the span itself (or the span
 *   preceded by other tokens this helper skips past to find it).
 */
function xrefFrom(raw: string, canonBookIds: ReadonlySet<string> | undefined = IN_SCOPE_CANON): ReturnType<typeof buildCrossReferenceContent> {
  const tokens: Token[] = tokenize(raw);
  const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "x");
  if (openIndex === -1) throw new Error(`xrefFrom: no \\x open token found in: ${raw}`);
  return buildCrossReferenceContent(tokens, openIndex + 1, canonBookIds);
}

describe("buildCrossReferenceContent — a single target becomes one bibleLink, always type xrf", () => {
  it("should resolve a single-target cross-reference to one bibleLink with no display override, \\xo dropped (2 Kings 12:4's real shape)", () => {
    const { footnote } = xrefFrom("\\x + \\xo 12:4 \\xt Exodus 30:12\\x*");
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual({ bibleLink: "Exodus 30:12" });
  });

  it("should advance the caller past the matching \\x* close, to the very next token", () => {
    const tokens = tokenize('\\x + \\xo 12:4 \\xt Exodus 30:12\\x*\\w and|strong="H5971"\\w*');
    const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "x");
    const { nextIndex } = buildCrossReferenceContent(tokens, openIndex + 1, IN_SCOPE_CANON);
    expect(tokens[nextIndex]).toMatchObject({ type: "open", name: "w" });
  });
});

describe("buildCrossReferenceContent — multiple targets join with a literal \"; \" (matches a real multi-target cross-reference footnote's own shape)", () => {
  it("should build an array of bibleLinks joined by \"; \" for a two-target list (Hebrews 11:34's real shape — also the real WEBUS2020 cross-chapter em-dash finding, left unsplit here: the split is a post-write subprocess, never performed during construction)", () => {
    const { footnote } = xrefFrom("\\x + \\xo 11:34 \\xt 1 Kings 19:1-3; 2 Kings 6:31—7:20\\x*");
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual([
      { bibleLink: "1 Kings 19:1-3" },
      "; ",
      { bibleLink: "2 Kings 6:31—7:20" },
    ]);
  });

  it("should resolve a bare \"C:V\" continuation with no book name by inheriting the previous target's own book, and space the target's own unspaced verse-list comma (Matthew 5:4's real shape — \"66:10,13\" inherits \"Isaiah\" and targets \"66:10, 13\", while still displaying the source's own unspaced \"66:10,13\")", () => {
    const { footnote } = xrefFrom("\\x + \\xo 5:4 \\xt Isaiah 61:2; 66:10,13\\x*");
    expect(footnote.content).toEqual([
      { bibleLink: "Isaiah 61:2" },
      "; ",
      { bibleLink: "Isaiah 66:10, 13", content: "66:10,13" },
    ]);
  });
});

describe("buildCrossReferenceContent — a \"See \" lead-in still resolves, keeping the full source text as the display override", () => {
  it('should resolve "See Job 9:8" to a real bibleLink targeting "Job 9:8" while displaying the source\'s own full "See Job 9:8" text (Matthew 14:25\'s real shape)', () => {
    const { footnote } = xrefFrom("\\x + \\xo 14:25 \\xt See Job 9:8\\x*");
    expect(footnote.content).toEqual({ bibleLink: "Job 9:8", content: "See Job 9:8" });
  });
});

describe("buildCrossReferenceContent — a book outside the target version's own canon is left as plain text, never a bibleLink", () => {
  it('should leave a deuterocanon-book target as its own raw plain text rather than link it, and resolve the Psalms target to the canonical singular "Psalm" target while keeping the source\'s own plural display (Wisdom\'s own real, verbatim in-source multi-target list, "...Wisdom 14:21" as its own last target — real corpus text, even though Wisdom itself is out of scope for this import)', () => {
    const { footnote } = xrefFrom("\\x + \\xo 14:27 \\xt Exodus 23:13; Psalms 16:4; Hosea 2:17; Wisdom 14:21\\x*");
    expect(footnote.content).toEqual([
      { bibleLink: "Exodus 23:13" },
      "; ",
      { bibleLink: "Psalm 16:4", content: "Psalms 16:4" },
      "; ",
      { bibleLink: "Hosea 2:17" },
      "; ",
      "Wisdom 14:21",
    ]);
  });

  it('should accept every book the registry knows when canonBookIds is omitted entirely (no restriction at all), normalizing the alias "Wisdom" to the registry\'s own canonical "Wisdom of Solomon" and keeping the source\'s own shorter spelling as the display override', () => {
    const raw = "\\x + \\xo 14:27 \\xt Wisdom 14:21\\x*";
    const tokens = tokenize(raw);
    const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "x");
    // Calls buildCrossReferenceContent directly, not through xrefFrom — a
    // default parameter never applies to an explicitly-passed `undefined`,
    // so xrefFrom's default could never exercise the truly-omitted-argument
    // case.
    const { footnote } = buildCrossReferenceContent(tokens, openIndex + 1);
    expect(footnote.content).toEqual({ bibleLink: "Wisdom of Solomon 14:21", content: "Wisdom 14:21" });
  });
});

describe("buildCrossReferenceContent — a trailing tradition siglon (LXX/MT/TR/NU) after a reference still resolves to a real bibleLink", () => {
  it('should resolve "Deuteronomy 32:43 LXX" to a real bibleLink whose own target text carries the siglon too, matching upstream WEBUS2020\'s own real Hebrews 1:6 shape exactly, dropping only \\xo', () => {
    const { footnote } = xrefFrom("\\x + \\xo 1:6 \\xt Deuteronomy 32:43 LXX\\x*");
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toEqual({ bibleLink: "Deuteronomy 32:43 LXX" });
  });
});

describe("buildCrossReferenceContent — a Psalms cross-reference targets the canonical singular \"Psalm\", never the source's own plural \"Psalms\"", () => {
  it('should resolve "Psalms 91:11-12" to a "Psalm 91:11-12" target while keeping the source\'s own plural, unspaced-dash text as the display override (Matthew 4:6\'s real shape, matching upstream WEBUS2020\'s own real target exactly modulo the dash character, which is a separate, later, post-write convention this module never applies)', () => {
    const { footnote } = xrefFrom("\\x + \\xo 4:6 \\xt Psalms 91:11-12\\x*");
    expect(footnote.content).toEqual({ bibleLink: "Psalm 91:11-12", content: "Psalms 91:11-12" });
  });

  it('should inherit the singular "Psalm" — not the plural "Psalms" — into a later bare "C:V" continuation in the same target list (John 15:25\'s real shape, "Psalms 35:19; 69:4")', () => {
    const { footnote } = xrefFrom("\\x + \\xo 15:25 \\xt Psalms 35:19; 69:4\\x*");
    expect(footnote.content).toEqual([
      { bibleLink: "Psalm 35:19", content: "Psalms 35:19" },
      "; ",
      { bibleLink: "Psalm 69:4", content: "69:4" },
    ]);
  });
});

describe("buildCrossReferenceContent — a verse list inside a target gets the space its own comma is missing", () => {
  it('should resolve "Isaiah 53:7,8" to a "53:7, 8" target while keeping the source\'s own unspaced text as the display override (Acts 8:33\'s real shape, a directly-named target rather than a bare continuation — Matthew 5:4\'s own real continuation shape is covered above, "should resolve a bare \\"C:V\\" continuation…")', () => {
    const { footnote } = xrefFrom("\\x + \\xo 8:33 \\xt Isaiah 53:7,8\\x*");
    expect(footnote.content).toEqual({ bibleLink: "Isaiah 53:7, 8", content: "Isaiah 53:7,8" });
  });

  it('should apply both fixes together on the one real target that needs both — a Psalms book-name fix and a verse-list comma space in the same target (Romans 11:10\'s real shape, "Psalms 69:22,23")', () => {
    const { footnote } = xrefFrom("\\x + \\xo 11:10 \\xt Psalms 69:22,23\\x*");
    expect(footnote.content).toEqual({ bibleLink: "Psalm 69:22, 23", content: "Psalms 69:22,23" });
  });

  it('should leave an already-spaced verse-list comma untouched, adding a display override for the book-name fix alone (1 Maccabees 7:17\'s real note, "Psalms 79:2, 3.", already spaced in the source)', () => {
    const content = buildReferenceOnlyContent("Psalms 79:2, 3.", IN_SCOPE_CANON);
    expect(content).toEqual({ bibleLink: "Psalm 79:2, 3", content: "Psalms 79:2, 3" });
  });
});

describe("buildCrossReferenceContent — a parse the resolver is still not confident about is left as plain text, never guessed", () => {
  it('should leave a genuinely unrecognized trailing shape as plain text, unresolved (an invented suffix — no other real in-scope target carries one — proving the broadened grammar accepts exactly the four named sigla and nothing else)', () => {
    const { footnote } = xrefFrom("\\x + \\xo 1:6 \\xt Deuteronomy 32:43 XYZ\\x*");
    expect(footnote.type).toBe("xrf");
    expect(footnote.content).toBe("Deuteronomy 32:43 XYZ");
  });
});

/**
 * A `\f`-derived body classified `xrf` — its content is nothing but
 * reference-shaped runs — only occurs once deuterocanon books are in
 * scope; the 66-book canonical corpus never produces this shape.
 * `usfm/footnotes.ts` reuses this function so such a body resolves the same
 * way an `\x`-sourced target does, rather than staying unresolved plain
 * text under an `xrf` tag.
 */
describe("buildReferenceOnlyContent — a \\f body that is nothing but a reference", () => {
  it('should resolve a "See "-led single reference, stripping the body\'s own trailing sentence period before matching (Baruch 1:11\'s real note, "See Deuteronomy 11:21.")', () => {
    const content = buildReferenceOnlyContent("See Deuteronomy 11:21.", IN_SCOPE_CANON);
    expect(content).toEqual({ bibleLink: "Deuteronomy 11:21", content: "See Deuteronomy 11:21" });
  });

  it('should resolve a "Compare "-led reference the same way "See " already resolves (1 Maccabees 4:40\'s real note, "Compare Numbers 31:6." — never observed in any \\x target, only here)', () => {
    const content = buildReferenceOnlyContent("Compare Numbers 31:6.", IN_SCOPE_CANON);
    expect(content).toEqual({ bibleLink: "Numbers 31:6", content: "Compare Numbers 31:6" });
  });

  it('should resolve a bare reference with no lead-in word at all, to the canonical singular "Psalm" target (1 Maccabees 7:17\'s real note, "Psalms 79:2, 3." — the comma-joined verse list already matches the body\'s own real spelling exactly, so the only override needed is the book name itself)', () => {
    const content = buildReferenceOnlyContent("Psalms 79:2, 3.", IN_SCOPE_CANON);
    expect(content).toEqual({ bibleLink: "Psalm 79:2, 3", content: "Psalms 79:2, 3" });
  });

  it('should resolve a semicolon-joined multi-target body the same "; "-joining way \\x already does, the "See " lead-in applying only to the first target, and the Psalms target resolving to canonical singular "Psalm" (Wisdom 11:4\'s real note, "See Deuteronomy 8:15; Psalms 114:8.")', () => {
    const content = buildReferenceOnlyContent("See Deuteronomy 8:15; Psalms 114:8.", IN_SCOPE_CANON);
    expect(content).toEqual([
      { bibleLink: "Deuteronomy 8:15", content: "See Deuteronomy 8:15" },
      "; ",
      { bibleLink: "Psalm 114:8", content: "Psalms 114:8" },
    ]);
  });

  it("should leave a reference to a book outside canonBookIds as plain text, never a bibleLink, matching buildCrossReferenceContent's own identical rule", () => {
    const content = buildReferenceOnlyContent("See Wisdom 14:21.", IN_SCOPE_CANON);
    expect(content).toBe("See Wisdom 14:21");
  });
});

/**
 * A fully-qualified reference sitting *inside* a larger run of ordinary
 * footnote prose, with no `\x`/`\+xt` marker anywhere near it and no
 * whole-body "nothing but a reference" shape for `buildReferenceOnlyContent`
 * to resolve either. Every fixture below is real, verbatim WEBUS2020 corpus
 * text, cited by book/verse.
 *
 * `linkEmbeddedReferences` requires no "See "/"Compare " lead-in word: a
 * self-naming reference is unambiguous because it names its own book, not
 * because of what word sits next to it. Several fixtures below deliberately
 * have no cue word nearby.
 */
describe("linkEmbeddedReferences — a fully-qualified reference embedded in ordinary prose becomes a real bibleLink, no cue word required", () => {
  it('should link a single reference sitting inside otherwise-plain prose, leaving everything else untouched (1 Maccabees 1:14\'s real note, "So they built a gymnasium..." — fixture trimmed to its own footnote body, "See 2 Maccabees 4:9, 12.")', () => {
    const content = linkEmbeddedReferences("See 2 Maccabees 4:9, 12. ");
    expect(content).toEqual(["See ", { bibleLink: "2 Maccabees 4:9, 12" }, ". "]);
  });

  it('should link two independent references in the same body, each on its own, whether introduced by "See "/"Compare " or not (1 Maccabees 2:18\'s real note, "See 1 Maccabees 2:18. Compare 1 Maccabees 10:65.")', () => {
    const content = linkEmbeddedReferences("See 1 Maccabees 2:18. Compare 1 Maccabees 10:65. ");
    expect(content).toEqual([
      "See ",
      { bibleLink: "1 Maccabees 2:18" },
      ". Compare ",
      { bibleLink: "1 Maccabees 10:65" },
      ". ",
    ]);
  });

  it('should link every fully-qualified reference in a comma-and-"and"-joined run, each independently, never swallowing a second book\'s own leading digit into the first target\'s verse list (2 Maccabees 5:13\'s real note, "...men of Tob: see Judges 11:3, 2 Samuel 10:6, and compare 1 Maccabees 5:13." — proving the comma-list guard: "Judges 11:3, 2 Samuel 10:6" never becomes the nonsense target "Judges 11:3, 2")', () => {
    const content = linkEmbeddedReferences(
      "That is, men of Tob: see Judges 11:3, 2 Samuel 10:6, and compare 1 Maccabees 5:13.",
    );
    expect(content).toEqual([
      "That is, men of Tob: see ",
      { bibleLink: "Judges 11:3" },
      ", ",
      { bibleLink: "2 Samuel 10:6" },
      ", and compare ",
      { bibleLink: "1 Maccabees 5:13" },
      ".",
    ]);
  });

  it('should link every fully-qualified reference in a semicolon-joined run, including one with no cue word anywhere near it, and chain each bare, book-less "C:V" continuation onto the reference it follows, inheriting its book (1 Maccabees 13:53\'s real note, "See 1 Maccabees 13:53 (compare 1 Maccabees 13:48); 1 Maccabees 14:7, 34; 15:28; 16:1: also Josephus...")', () => {
    const content = linkEmbeddedReferences(
      "See 1 Maccabees 13:53 (compare 1 Maccabees 13:48); 1 Maccabees 14:7, 34; 15:28; 16:1: also Josephus. All the authorities read Gaza in this verse.",
    );
    expect(content).toEqual([
      "See ",
      { bibleLink: "1 Maccabees 13:53" },
      " (compare ",
      { bibleLink: "1 Maccabees 13:48" },
      "); ",
      { bibleLink: "1 Maccabees 14:7, 34" },
      "; ",
      { bibleLink: "1 Maccabees 15:28", content: "15:28" },
      "; ",
      { bibleLink: "1 Maccabees 16:1", content: "16:1" },
      ": also Josephus. All the authorities read Gaza in this verse.",
    ]);
  });

  it('should chain a bare "C:V"-only continuation onto the reference immediately before it, inheriting its book, while a fully-named reference right after the same semicolon is left for its own separate match instead (1 Maccabees 3:38\'s real note, "See 1 Maccabees 3:38; 10:10, etc.; Compare 1 Maccabees 10:65; 11:27; 2 Maccabees 8:9.")', () => {
    const content = linkEmbeddedReferences(
      "See 1 Maccabees 3:38; 10:10, etc.; Compare 1 Maccabees 10:65; 11:27; 2 Maccabees 8:9.",
    );
    expect(content).toEqual([
      "See ",
      { bibleLink: "1 Maccabees 3:38" },
      "; ",
      { bibleLink: "1 Maccabees 10:10", content: "10:10" },
      ", etc.; Compare ",
      { bibleLink: "1 Maccabees 10:65" },
      "; ",
      { bibleLink: "1 Maccabees 11:27", content: "11:27" },
      "; ",
      { bibleLink: "2 Maccabees 8:9" },
      ".",
    ]);
  });

  it('should link a reference with no cue word anywhere near it — not even a non-adjacent one — since naming its own book is what makes it unambiguous, not the word beside it (2 Maccabees 4:21\'s real note, "Compare 2 Maccabees 4:21. See also 2 Maccabees 3:5.")', () => {
    const content = linkEmbeddedReferences(
      "Compare 2 Maccabees 4:21. See also 2 Maccabees 3:5. The Greek as commonly read means Apollonius.",
    );
    expect(content).toEqual([
      "Compare ",
      { bibleLink: "2 Maccabees 4:21" },
      ". See also ",
      { bibleLink: "2 Maccabees 3:5" },
      ". The Greek as commonly read means Apollonius.",
    ]);
  });

  it('should link a reference introduced by "Compare " even with a parenthetical sitting between the cue and the book name — the cue plays no role at all any more (1 Samuel 27:8\'s real note, "Compare Girzites (or Gizrites), 1 Samuel 27:8.")', () => {
    const content = linkEmbeddedReferences("Compare Girzites (or Gizrites), 1 Samuel 27:8. ");
    expect(content).toEqual(["Compare Girzites (or Gizrites), ", { bibleLink: "1 Samuel 27:8" }, ". "]);
  });

  it("should link a reference to a book outside canonBookIds the same as any other — unlike resolveTarget's own direct branch, this resolver is never canon-restricted (1 Maccabees 10:65's real note, \"Compare 1 Maccabees 10:65.\" — 1 Maccabees is out of IN_SCOPE_CANON's own 66-book canon)", () => {
    const content = linkEmbeddedReferences("Compare 1 Maccabees 10:65. ");
    expect(content).toEqual(["Compare ", { bibleLink: "1 Maccabees 10:65" }, ". "]);
  });

  it('should now link a bare reference sitting at a footnote body\'s own start with no cue word at all — Proverbs 31:10-31\'s own real, self-referential acrostic note, matching upstream HEAD\'s own real, already-linked shape exactly, and three real 1 Esdras instances sharing the identical shape (Ezra 8:3\'s real note)', () => {
    const proverbs =
      "Proverbs 31:10-31 form an acrostic, with each verse starting with each letter of the Hebrew alphabet, in order.";
    expect(linkEmbeddedReferences(proverbs)).toEqual([
      { bibleLink: "Proverbs 31:10-31" },
      " form an acrostic, with each verse starting with each letter of the Hebrew alphabet, in order.",
    ]);

    const firstEsdras = "Ezra 8:3, of the sons of Shecaniah; of the sons of Parosh.";
    expect(linkEmbeddedReferences(firstEsdras)).toEqual([
      { bibleLink: "Ezra 8:3" },
      ", of the sons of Shecaniah; of the sons of Parosh.",
    ]);
  });

  it('should now link a bare chapter-only mention with no verse too — Psalm 34:1\'s own real, self-referential acrostic note ("Psalm 34 is an acrostic poem...") names a real, specific chapter even with no verse of its own, and a chapter-only mention now links the same as any other, reversing this module\'s own earlier verse-mandatory rule', () => {
    const content = linkEmbeddedReferences(
      "Psalm 34 is an acrostic poem, with each verse starting with a letter of the alphabet (ordered from Alef to Tav).",
    );
    expect(content).toEqual([
      { bibleLink: "Psalm 34" },
      " is an acrostic poem, with each verse starting with a letter of the alphabet (ordered from Alef to Tav).",
    ]);
  });

  it('should link a period-abbreviated, chapter-only reference the same way (Numbers 8:6\'s real "he sees here the importance of each member of God\'s family having his own particular task (I Cor. 12)")', () => {
    const content = linkEmbeddedReferences(
      "He sees here the importance of each member of God's family having his own particular task (I Cor. 12).",
    );
    expect(content).toEqual([
      "He sees here the importance of each member of God's family having his own particular task (",
      { bibleLink: "1 Corinthians 12", content: "I Cor. 12" },
      ").",
    ]);
  });

  it('should decline a chain continuation that really is a different book\'s own leading digit, even when that digit alone would now satisfy the relaxed, chapter-only head (1 Maccabees 3:38\'s real "...Compare 1 Maccabees 10:65; 11:27; 2 Maccabees 8:9." — proving the chain steal-guard, not just the comma-list one, catches "2 Maccabees" rather than reading its own leading "2" as a bare chapter continuation)', () => {
    const content = linkEmbeddedReferences("Compare 1 Maccabees 10:65; 11:27; 2 Maccabees 8:9.");
    expect(content).toEqual([
      "Compare ",
      { bibleLink: "1 Maccabees 10:65" },
      "; ",
      { bibleLink: "1 Maccabees 11:27", content: "11:27" },
      "; ",
      { bibleLink: "2 Maccabees 8:9" },
      ".",
    ]);
  });

  it('should insert the implied chapter 1 for a single-chapter book\'s bare verse range, never reading it as a chapter-to-chapter range (Ezekiel 26:14\'s real "...he refers his readers to Obad. 11-14 (or 11-16 in some numbering systems)")', () => {
    const content = linkEmbeddedReferences("...he refers his readers to Obad. 11-14.");
    expect(content).toEqual(["...he refers his readers to ", { bibleLink: "Obadiah 1:11-14", content: "Obad. 11-14" }, "."]);
  });

  it("should leave a single-chapter book's own already-explicit chapter 1 alone, never doubling it", () => {
    const content = linkEmbeddedReferences("See Jude 1:14, 15.");
    expect(content).toEqual(["See ", { bibleLink: "Jude 1:14, 15" }, "."]);
  });

  it('should now link Deuteronomy 33:16\'s own real "the burning bush of Exodus 3:3-4" through the generic mechanism directly — "of" is not a cue word, but this redesign never checks for one; "Exodus 3:3-4" names its own book explicitly, which is all that matters now, superseding the separate verse-specific override this used to need in imports/webus2020/import.ts', () => {
    const deuteronomy = "i.e., the burning bush of Exodus 3:3-4.";
    expect(linkEmbeddedReferences(deuteronomy)).toEqual([
      "i.e., the burning bush of ",
      { bibleLink: "Exodus 3:3-4" },
      ".",
    ]);
  });

  it("should leave an already-tagged node (e.g. an \\fq italic span) untouched inside an array, only ever splitting a plain string element", () => {
    const unchanged = ["a plain run", { text: "an italic run", marks: ["i" as const] }];
    expect(linkEmbeddedReferences(unchanged)).toEqual(unchanged);

    const mixed = linkEmbeddedReferences(["See 2 Maccabees 4:9, 12. ", { text: "Or, marisa", marks: ["i" as const] }]);
    expect(mixed).toEqual(["See ", { bibleLink: "2 Maccabees 4:9, 12" }, ". ", { text: "Or, marisa", marks: ["i"] }]);
  });
});

/**
 * Six real 66-canon verses where the reference sits behind an ordinary word —
 * "in", "regard", "here and in", "includes", "after", "places" — none of them a
 * "See "/"Compare " lead-in, so a link here depends on no specific cue word.
 * Every fixture is verbatim WEBUS2020 text, and every expected shape matches
 * upstream `HEAD`'s real content, dash characters aside: the en-dash convention
 * is a separate post-write pass this module never applies.
 */
describe("linkEmbeddedReferences — six real 66-canon references linked with no cue word anywhere nearby", () => {
  it('should link Psalm 8:5\'s real "See also the quote from the Septuagint in Hebrews 2:7." — the cue "See" sits nowhere near "Hebrews"; only the book name itself matters now', () => {
    const content = linkEmbeddedReferences(
      "Hebrew: Elohim. The word Elohim, used here, usually means “God”, but can also mean “gods”, “princes”, or “angels”. The Septuagint reads “angels” here. See also the quote from the Septuagint in Hebrews 2:7.",
    );
    expect(content).toEqual([
      "Hebrew: Elohim. The word Elohim, used here, usually means “God”, but can also mean “gods”, “princes”, or “angels”. The Septuagint reads “angels” here. See also the quote from the Septuagint in ",
      { bibleLink: "Hebrews 2:7" },
      ".",
    ]);
  });

  it('should link Mark 16:9\'s real self-referential "...the translators of the World English Bible regard Mark 16:9-20 as reliable..." — "regard" is a verb, never a cue word, but "Mark 16:9-20" names its own book and verse range explicitly', () => {
    const content = linkEmbeddedReferences(
      "NU includes the text of verses 9-20, but mentions in a footnote that a few manuscripts omitted it. The translators of the World English Bible regard Mark 16:9-20 as reliable based on an overwhelming majority of textual evidence, including not only the authoritative Greek Majority Text New Testament, but also the TR and many of the manuscripts cited in the NU text.",
    );
    expect(content).toEqual([
      "NU includes the text of verses 9-20, but mentions in a footnote that a few manuscripts omitted it. The translators of the World English Bible regard ",
      { bibleLink: "Mark 16:9-20" },
      " as reliable based on an overwhelming majority of textual evidence, including not only the authoritative Greek Majority Text New Testament, but also the TR and many of the manuscripts cited in the NU text.",
    ]);
  });

  it('should link John 3:3\'s real "The word translated “anew” here and in John 3:7 (ἄνωθεν) also means..." — "here and in" is no cue word at all', () => {
    const content = linkEmbeddedReferences('The word translated “anew” here and in John 3:7 also means “again” and “from above”.');
    expect(content).toEqual([
      'The word translated “anew” here and in ',
      { bibleLink: "John 3:7" },
      ' also means “again” and “from above”.',
    ]);
  });

  it('should link both halves of John 8:11\'s real "NU includes John 7:53–John 8:11, but puts brackets around it..." independently, with the em dash between them left as plain text — "includes" is a verb, never a cue word, and matches upstream HEAD\'s own real two-bibleLink shape exactly', () => {
    const content = linkEmbeddedReferences(
      "NU includes John 7:53–John 8:11, but puts brackets around it to indicate that the textual critics had less confidence that this was original.",
    );
    expect(content).toEqual([
      "NU includes ",
      { bibleLink: "John 7:53" },
      "–",
      { bibleLink: "John 8:11" },
      ", but puts brackets around it to indicate that the textual critics had less confidence that this was original.",
    ]);
  });

  it('should link Romans 14:26\'s real "TR places verses 24-26 after Romans 16:24 as verses 25-27." — "after" is a preposition, never a cue word', () => {
    const content = linkEmbeddedReferences("TR places verses 24-26 after Romans 16:24 as verses 25-27. ");
    expect(content).toEqual(["TR places verses 24-26 after ", { bibleLink: "Romans 16:24" }, " as verses 25-27. "]);
  });

  it('should link Romans 16:25\'s real "TR places Romans 14:24-26 at the end of Romans instead of..." — "places" is a verb, never a cue word', () => {
    const content = linkEmbeddedReferences(
      "TR places Romans 14:24-26 at the end of Romans instead of at the end of chapter 14, and numbers these verses 16:25-27.",
    );
    expect(content).toEqual([
      "TR places ",
      { bibleLink: "Romans 14:24-26" },
      " at the end of Romans instead of at the end of chapter 14, and numbers these verses 16:25-27.",
    ]);
  });
});

/**
 * A source that abbreviates a book name with a trailing period ("Isa. 9:6"
 * rather than the registry's period-free alias "Isa 9:6") still names a real,
 * resolvable reference. The period is punctuation on the abbreviation, not part
 * of the book name, and {@link matchBookPrefix} consumes it rather than leaving
 * it on `rest`, where it would break the digit-immediately-after-the-space
 * check every other fixture here relies on.
 */
describe("linkEmbeddedReferences — a period-abbreviated book name links the same as its period-free alias", () => {
  it("should link a period-abbreviated short alias immediately followed by chapter and verse", () => {
    expect(linkEmbeddedReferences("This is quoted as a messianic prophecy in Isa. 9:6.")).toEqual([
      "This is quoted as a messianic prophecy in ",
      { bibleLink: "Isaiah 9:6", content: "Isa. 9:6" },
      ".",
    ]);
  });

  it("should link a period-abbreviated alias followed by a verse range, still resolving to the canonical name", () => {
    expect(linkEmbeddedReferences("The genealogy in Matt. 1:1-17 omits several generations.")).toEqual([
      "The genealogy in ",
      { bibleLink: "Matthew 1:1-17", content: "Matt. 1:1-17" },
      " omits several generations.",
    ]);
  });

  it("should not treat a period ending an ordinary sentence as an abbreviation's own period when no digit immediately follows it", () => {
    const unchanged = "The prophecy appears in Isaiah. Chapter 9 continues the theme.";
    expect(linkEmbeddedReferences(unchanged)).toBe(unchanged);
  });
});

/**
 * A source that spells a numbered book's ordinal as a Roman numeral ("I Kings",
 * "II Chronicles") rather than the registry's Arabic-digit form ("1 Kings",
 * "1Kg") still names the same book: {@link romanNumeralVariant} derives the
 * Roman spelling of every numbered book's names and aliases once, at registry
 * build time, so the registry need not carry both by hand.
 */
describe("linkEmbeddedReferences — a Roman-numeral ordinal prefix links the same as its Arabic-digit counterpart", () => {
  it("should link a Roman-numeral-prefixed full name", () => {
    expect(linkEmbeddedReferences("The dedication prayer is recorded in I Kings 8:33.")).toEqual([
      "The dedication prayer is recorded in ",
      { bibleLink: "1 Kings 8:33", content: "I Kings 8:33" },
      ".",
    ]);
  });

  it("should link a Roman-numeral-prefixed short alias, period-abbreviated, composing both extensions on one reference", () => {
    expect(linkEmbeddedReferences("See especially I Kgs. 8:33 for the fuller context.")).toEqual([
      "See especially ",
      { bibleLink: "1 Kings 8:33", content: "I Kgs. 8:33" },
      " for the fuller context.",
    ]);
  });

  it("should link two independent Roman-numeral-prefixed references chained by a cue word between them, each resolving to its own book", () => {
    expect(
      linkEmbeddedReferences("He was also a father figure, cf. I Kings 14:21 and II Chr. 9:30."),
    ).toEqual([
      "He was also a father figure, cf. ",
      { bibleLink: "1 Kings 14:21", content: "I Kings 14:21" },
      " and ",
      { bibleLink: "2 Chronicles 9:30", content: "II Chr. 9:30" },
      ".",
    ]);
  });

  it("should link a Roman-numeral-prefixed reference the same as any other, regardless of canon", () => {
    const content = linkEmbeddedReferences("Compare I Kings 8:33 for the parallel account.");
    expect(content).toEqual(["Compare ", { bibleLink: "1 Kings 8:33", content: "I Kings 8:33" }, " for the parallel account."]);
  });
});

/**
 * A multi-digit verse number immediately followed by an unrecognized trailing
 * word — a translation-edition abbreviation like "KJV", or any other
 * capitalized word — must neither make the engine backtrack *inside* that digit
 * run the way an unguarded `\d+` once did ({@link DIGITS}), nor decline a real
 * reference just because a capitalized word follows it
 * ({@link wouldStealBookOrdinal}).
 */
describe("linkEmbeddedReferences — a multi-digit verse number is never truncated, and a trailing non-reference word never blocks linking", () => {
  it('should link a comma-listed multi-digit verse\'s own continuation in full, even with a trailing translation-edition abbreviation right after it ("(Num. 12:11, 12 KJV)"\'s own real shape)', () => {
    const content = linkEmbeddedReferences("Let her not be as one dead (Num. 12:11, 12 KJV).");
    expect(content).toEqual([
      "Let her not be as one dead (",
      { bibleLink: "Numbers 12:11, 12", content: "Num. 12:11, 12" },
      " KJV).",
    ]);
  });

  it("should link a bare reference in full, with no comma-list at all, even with a trailing translation-edition abbreviation right after it (Psalm 119's real 176 verses make a three-digit verse number ordinary, not a synthetic edge case)", () => {
    const content = linkEmbeddedReferences("the longest acrostic closes at Psalm 119:176 KJV.");
    expect(content).toEqual(["the longest acrostic closes at ", { bibleLink: "Psalm 119:176" }, " KJV."]);
  });

  it('should still decline a comma-list continuation that really is a different book\'s own leading digit, leaving the reference at its own unambiguous first verse (2 Maccabees 5:13\'s real "...see Judges 11:3, 2 Samuel 10:6..." — proving the fix trades a false decline for correctness, not for a wrong link)', () => {
    const content = linkEmbeddedReferences("...see Judges 11:3, 2 Samuel 10:6, and compare...");
    expect(content).toEqual([
      "...see ",
      { bibleLink: "Judges 11:3" },
      ", ",
      { bibleLink: "2 Samuel 10:6" },
      ", and compare...",
    ]);
  });

});

/**
 * A written-out list's Oxford comma ("2, 3, 7, 8, 15, and 17") is a real
 * prose convention this corpus's footnotes use: Genesis 14:2's note names six
 * verses this way, and only the comma-joined grammar without "and" tolerance
 * was tested before.
 */
describe("linkEmbeddedReferences — a written-out list's own trailing \"and N\" still continues the same reference's verse list", () => {
  it('should link every verse in a written-out list through its own trailing "and N" item (Genesis 14:2\'s real note, "Chapter 14 alone contains six such explanatory notes (Gen. 14:2, 3, 7, 8, 15, and 17)")', () => {
    const content = linkEmbeddedReferences(
      "Chapter 14 alone contains six such explanatory notes (Gen. 14:2, 3, 7, 8, 15, and 17).",
    );
    expect(content).toEqual([
      "Chapter 14 alone contains six such explanatory notes (",
      { bibleLink: "Genesis 14:2, 3, 7, 8, 15, 17", content: "Gen. 14:2, 3, 7, 8, 15, and 17" },
      ").",
    ]);
  });
});

/**
 * A bare "C:V" reference naming a different chapter of the same book, joined by
 * a semicolon to the reference before it, inherits that reference's book the way
 * an already-isolated `\xt` target's bare continuation does. Genesis 23:19's
 * real note is this shape exactly.
 */
describe('linkEmbeddedReferences — a semicolon-joined bare "C:V" continuation inherits the book of the reference right before it', () => {
  it('should link "50:13" to Genesis after "Gen. 49:31" (Genesis 23:19\'s real note, "Here were buried Abraham and Sarah, Isaac and Rebekah, and Jacob and Leah (Gen. 49:31; 50:13)")', () => {
    const content = linkEmbeddedReferences(
      "Here were buried Abraham and Sarah, Isaac and Rebekah, and Jacob and Leah (Gen. 49:31; 50:13).",
    );
    expect(content).toEqual([
      "Here were buried Abraham and Sarah, Isaac and Rebekah, and Jacob and Leah (",
      { bibleLink: "Genesis 49:31", content: "Gen. 49:31" },
      "; ",
      { bibleLink: "Genesis 50:13", content: "50:13" },
      ").",
    ]);
  });

  it("should chain three or more semicolon-joined bare continuations onto the same inherited book, not just one", () => {
    const content = linkEmbeddedReferences("See Genesis 1:1; 2:2; 3:3; 4:4.");
    expect(content).toEqual([
      "See ",
      { bibleLink: "Genesis 1:1" },
      "; ",
      { bibleLink: "Genesis 2:2", content: "2:2" },
      "; ",
      { bibleLink: "Genesis 3:3", content: "3:3" },
      "; ",
      { bibleLink: "Genesis 4:4", content: "4:4" },
      ".",
    ]);
  });

  it("should stop the chain the moment a semicolon is followed by a real, named book instead of a bare continuation, leaving that name for its own separate match", () => {
    const content = linkEmbeddedReferences("See Genesis 1:1; Exodus 2:2.");
    expect(content).toEqual(["See ", { bibleLink: "Genesis 1:1" }, "; ", { bibleLink: "Exodus 2:2" }, "."]);
  });

  it("should chain a bare continuation regardless of canon — nothing in this mechanism is canon-restricted", () => {
    const content = linkEmbeddedReferences("See Genesis 1:1; 2:2.");
    expect(content).toEqual(["See ", { bibleLink: "Genesis 1:1" }, "; ", { bibleLink: "Genesis 2:2", content: "2:2" }, "."]);
  });
});

/**
 * A bare "C:V" continuation can also be joined by a bare "and" instead of a
 * semicolon, with no comma near it — a second real connector this corpus's
 * footnote prose uses for the identical "different chapter, same book" shape.
 */
describe('linkEmbeddedReferences — a bare "and" also chains a "C:V" continuation onto the reference right before it, inheriting its book', () => {
  it('should link "14:17" to 2 Kings after "II Kings 13:10" (2 Kings 12:1\'s real note, "...as the Hebrew does in II Kings 13:10 and 14:17)...")', () => {
    const content = linkEmbeddedReferences(
      "...as the Hebrew does in II Kings 13:10 and 14:17), referring to the king of Israel...",
    );
    expect(content).toEqual([
      "...as the Hebrew does in ",
      { bibleLink: "2 Kings 13:10", content: "II Kings 13:10" },
      " and ",
      { bibleLink: "2 Kings 14:17", content: "14:17" },
      "), referring to the king of Israel...",
    ]);
  });

  it('should link "1:20" to Proverbs after "Prov. 1:2" — same chapter, different verse (Proverbs 1:23\'s real note, "See footnotes on Prov. 1:2 and 1:20.")', () => {
    const content = linkEmbeddedReferences("See footnotes on Prov. 1:2 and 1:20.");
    expect(content).toEqual([
      "See footnotes on ",
      { bibleLink: "Proverbs 1:2", content: "Prov. 1:2" },
      " and ",
      { bibleLink: "Proverbs 1:20", content: "1:20" },
      ".",
    ]);
  });

  it('should not treat an ordinary "and" followed by prose (not a reference) as a continuation, leaving it untouched', () => {
    const content = linkEmbeddedReferences("This happened in Genesis 3:15 and the woman said nothing.");
    expect(content).toEqual([
      "This happened in ",
      { bibleLink: "Genesis 3:15" },
      " and the woman said nothing.",
    ]);
  });
});

/**
 * A book name immediately followed by a parenthetical citation, with an open
 * paren between the book name's space and its chapter, is a real corpus
 * convention (Ezekiel 26:14's "Jeremiah (27:2-7; 47:4) and Ezekiel (26:3-21;
 * 28:6-10)"). The open paren is consumed the way an abbreviation's trailing
 * period is, leaving the closing paren for ordinary trailing prose to carry.
 */
describe("linkEmbeddedReferences — a book name followed by an open-paren-led citation still links, chaining through it the same as any other", () => {
  it('should link "Daniel (5:1-30)" as "Daniel 5:1-30", leaving only the closing paren as trailing text', () => {
    const content = linkEmbeddedReferences("as recorded by Daniel (5:1-30), and becomes more urgent.");
    expect(content).toEqual([
      "as recorded by ",
      { bibleLink: "Daniel 5:1-30", content: "Daniel (5:1-30" },
      "), and becomes more urgent.",
    ]);
  });

  it('should chain semicolon-joined bare continuations through an open-paren-led primary reference the same as any other (Ezekiel 26:14\'s real "Jeremiah (27:2-7; 47:4) and Ezekiel (26:3-21; 28:6-10)")', () => {
    const content = linkEmbeddedReferences(
      "Yet Jeremiah (27:2-7; 47:4) and Ezekiel (26:3-21; 28:6-10) foretold utter destruction for Tyre.",
    );
    expect(content).toEqual([
      "Yet ",
      { bibleLink: "Jeremiah 27:2-7", content: "Jeremiah (27:2-7" },
      "; ",
      { bibleLink: "Jeremiah 47:4", content: "47:4" },
      ") and ",
      { bibleLink: "Ezekiel 26:3-21", content: "Ezekiel (26:3-21" },
      "; ",
      { bibleLink: "Ezekiel 28:6-10", content: "28:6-10" },
      ") foretold utter destruction for Tyre.",
    ]);
  });
});

/**
 * A bare, parenthesized "(C:V...)" citation with no book name, sitting
 * elsewhere in the same footnote body with real prose in between and chained
 * onto nothing, still inherits the last book that resolved earlier in the body,
 * tracked by AmbientBook. 2 Samuel 12:11's note is this shape exactly: it names
 * "2 Samuel 13:14" once, in an already-tagged bibleLink, then cites four more
 * passages this way, each several sentences after the last thing named.
 */
describe('linkEmbeddedReferences — a bare parenthetical "(C:V...)" citation elsewhere in the same footnote body inherits the last book actually resolved', () => {
  it('should inherit the book from an already-tagged bibleLink sibling earlier in the same content array, across intervening prose (2 Samuel 12:11\'s real shape)', () => {
    const content = linkEmbeddedReferences(
      [
        "Amnon’s scandalous behavior with his half sister Tamar (",
        { bibleLink: "2 Samuel 13:14", content: "13:14" },
        ") and his consequent murder by his brother Absalom (13:28, 29); Absalom’s escape to a foreign land (",
        { bibleLink: "2 Samuel 13:38", content: "13:38" },
        ") and his return after three years; Absalom without recognition by David for two more years (",
        { bibleLink: "2 Samuel 14:28", content: "14:28" },
        "); David’s flight from Jerusalem, with the mass of the people against him (",
        { bibleLink: "2 Samuel 15:14", content: "15:14" },
        "), the terrible battle in the forest of Ephraim, won by David’s forces, with Absalom killed in flight (18:6ff.).",
      ],
    );
    expect(content).toEqual([
      "Amnon’s scandalous behavior with his half sister Tamar (",
      { bibleLink: "2 Samuel 13:14", content: "13:14" },
      ") and his consequent murder by his brother Absalom ",
      { bibleLink: "2 Samuel 13:28, 29", content: "(13:28, 29" },
      "); Absalom’s escape to a foreign land (",
      { bibleLink: "2 Samuel 13:38", content: "13:38" },
      ") and his return after three years; Absalom without recognition by David for two more years (",
      { bibleLink: "2 Samuel 14:28", content: "14:28" },
      "); David’s flight from Jerusalem, with the mass of the people against him (",
      { bibleLink: "2 Samuel 15:14", content: "15:14" },
      "), the terrible battle in the forest of Ephraim, won by David’s forces, with Absalom killed in flight ",
      { bibleLink: "2 Samuel 18:6", content: "(18:6" },
      "ff.).",
    ]);
  });

  it("should inherit the book from a reference resolved earlier in the very same string, not just from an already-tagged sibling", () => {
    const content = linkEmbeddedReferences(
      "He prayed (2 Kings 19:15), and God performed a miracle, one He had foretold (19:20, 32-37).",
    );
    expect(content).toEqual([
      "He prayed (",
      { bibleLink: "2 Kings 19:15" },
      "), and God performed a miracle, one He had foretold ",
      { bibleLink: "2 Kings 19:20, 32-37", content: "(19:20, 32-37" },
      ").",
    ]);
  });

  it("should never inherit a book before any reference has resolved yet, even inside parentheses", () => {
    const unchanged = "This happened (18:6ff.) long before anything else.";
    expect(linkEmbeddedReferences(unchanged)).toBe(unchanged);
  });

  it("should inherit an ambient book regardless of canon — nothing in this mechanism is canon-restricted", () => {
    const content = linkEmbeddedReferences(["See ", { bibleLink: "Judges 11:3" }, " for context (12:1) as well."]);
    expect(content).toEqual([
      "See ",
      { bibleLink: "Judges 11:3" },
      " for context ",
      { bibleLink: "Judges 12:1", content: "(12:1" },
      ") as well.",
    ]);
  });
});

/**
 * A comma list continues a *verse* list, so after a chapter-only head there is
 * none for it to continue and the comma belongs to the surrounding prose.
 * MSB2025's Maskil note is the shape — a printed list of thirteen psalms the
 * target grammar read as Psalm 32 verses 42 and 44 through 45, where Psalm 32
 * has eleven verses. `findSafeReferenceLength`'s doc comment has the corpus-wide
 * measurement and the other two versions carrying the same defect on disk.
 */
describe("linkEmbeddedReferences — a comma list after a chapter-only head is prose, not a verse list", () => {
  it("should link only the first psalm of a printed chapter list (MSB2025's Maskil note, Psalm 32:1)", () => {
    const content = linkEmbeddedReferences(
      "Maskil is probably a musical or liturgical term; used for Psalms 32, 42, 44–45, 52–55, 74, 78, 88–89, and 142.",
    );
    expect(content).toEqual([
      "Maskil is probably a musical or liturgical term; used for ",
      { bibleLink: "Psalm 32", content: "Psalms 32" },
      ", 42, 44–45, 52–55, 74, 78, 88–89, and 142.",
    ]);
  });

  it("should link only the first chapter of a continental bibliographic citation (NET2019's Genesis 3:16 note, \"Gen 3, 16\")", () => {
    const content = linkEmbeddedReferences("See the discussion in Gen 3, 16 below.");
    expect(content).toEqual(["See the discussion in ", { bibleLink: "Genesis 3", content: "Gen 3" }, ", 16 below."]);
  });

  it("should still extend a verse-bearing head through its own comma list (Genesis 14:2's real note)", () => {
    const content = linkEmbeddedReferences("six such explanatory notes (Gen. 14:2, 3, 7, 8, 15, and 17).");
    expect(content).toEqual([
      "six such explanatory notes (",
      { bibleLink: "Genesis 14:2, 3, 7, 8, 15, 17", content: "Gen. 14:2, 3, 7, 8, 15, and 17" },
      ").",
    ]);
  });

  it("should still extend a chapter-only head through a dash range, which names one span rather than a list", () => {
    const content = linkEmbeddedReferences("By faith Noah (Genesis 4–9) built an ark.");
    expect(content).toEqual(["By faith Noah (", { bibleLink: "Genesis 4–9" }, ") built an ark."]);
  });
});
