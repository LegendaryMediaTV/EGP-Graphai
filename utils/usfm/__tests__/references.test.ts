import { describe, expect, it } from "vitest";
import { buildCrossReferenceContent, buildReferenceOnlyContent, linkEmbeddedReferences } from "../references";
import { Token, tokenize } from "../tokenize";

/**
 * Every raw USFM snippet below is copied verbatim from the WEBUS2020
 * source, cited by book/verse in each test's title — the same convention
 * `footnotes.test.ts` already established. Fixtures test the parser
 * against the grammar that actually exists, not a hand-invented one.
 */

/** The 66-book in-scope canon, resolved once here and used as {@link xrefFrom}'s own default `canonBookIds`. */
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

  it("should resolve a bare \"C:V\" continuation with no book name by inheriting the previous target's own book, and space the target's own unspaced verse-list comma (Matthew 5:4's real shape — \"66:10,13\" inherits \"Isaiah\" and targets \"66:10, 13\", Finding 8c, while still displaying the source's own unspaced \"66:10,13\")", () => {
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
  it('should leave a deuterocanon-book target as its own raw plain text rather than link it, and resolve the Psalms target to the canonical singular "Psalm" target while keeping the source\'s own plural display (Wisdom\'s own real, verbatim in-source multi-target list, "...Wisdom 14:21" as its own last target — real corpus text, even though Wisdom itself is out of scope for this import; Finding 8b)', () => {
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

describe("buildCrossReferenceContent — Finding 8b: a Psalms cross-reference targets the canonical singular \"Psalm\", never the source's own plural \"Psalms\"", () => {
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

describe("buildCrossReferenceContent — Finding 8c: a verse list inside a target gets the space its own comma is missing", () => {
  it('should resolve "Isaiah 53:7,8" to a "53:7, 8" target while keeping the source\'s own unspaced text as the display override (Acts 8:33\'s real shape, a directly-named target rather than a bare continuation — Matthew 5:4\'s own real continuation shape is covered above, "should resolve a bare \\"C:V\\" continuation…")', () => {
    const { footnote } = xrefFrom("\\x + \\xo 8:33 \\xt Isaiah 53:7,8\\x*");
    expect(footnote.content).toEqual({ bibleLink: "Isaiah 53:7, 8", content: "Isaiah 53:7,8" });
  });

  it('should apply both Finding 8b and 8c together on the one real target that needs both — a Psalms book-name fix and a verse-list comma space in the same target (Romans 11:10\'s real shape, "Psalms 69:22,23")', () => {
    const { footnote } = xrefFrom("\\x + \\xo 11:10 \\xt Psalms 69:22,23\\x*");
    expect(footnote.content).toEqual({ bibleLink: "Psalm 69:22, 23", content: "Psalms 69:22,23" });
  });

  it('should leave an already-spaced verse-list comma untouched, adding a display override for Finding 8b\'s book-name fix alone (1 Maccabees 7:17\'s real note, "Psalms 79:2, 3.", already spaced in the source)', () => {
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

  it('should resolve a bare reference with no lead-in word at all, to the canonical singular "Psalm" target (1 Maccabees 7:17\'s real note, "Psalms 79:2, 3." — the comma-joined verse list already matches the body\'s own real spelling exactly, so the only override needed is the book name itself, Finding 8b)', () => {
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
 * fully self-naming reference is unambiguous because it names its own
 * book, not because of what word happens to sit next to it. Several
 * fixtures below deliberately have no cue word anywhere nearby, proving the
 * reference still links on the strength of its own name alone.
 */
describe("linkEmbeddedReferences — Finding 9: a fully-qualified reference embedded in ordinary prose becomes a real bibleLink, no cue word required", () => {
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

  it('should link every fully-qualified reference in a semicolon-joined run, including one with no cue word anywhere near it, while a bare, book-less "15:28; 16:1" continuation stays unlinked prose — the one real, named residual this mechanism still leaves alone (1 Maccabees 13:53\'s real note, "See 1 Maccabees 13:53 (compare 1 Maccabees 13:48); 1 Maccabees 14:7, 34; 15:28; 16:1: also Josephus...")', () => {
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
      "; 15:28; 16:1: also Josephus. All the authorities read Gaza in this verse.",
    ]);
  });

  it('should link only the fully-qualified references, never a bare "C:V"-only continuation with no book name of its own — 1 Maccabees 3:38\'s real "10:10" and "11:27" stay unlinked prose, a real, named residual, while "2 Maccabees 8:9" — fully named — links even with no cue word right before it (1 Maccabees 3:38\'s real note, "See 1 Maccabees 3:38; 10:10, etc.; Compare 1 Maccabees 10:65; 11:27; 2 Maccabees 8:9.")', () => {
    const content = linkEmbeddedReferences(
      "See 1 Maccabees 3:38; 10:10, etc.; Compare 1 Maccabees 10:65; 11:27; 2 Maccabees 8:9.",
    );
    expect(content).toEqual([
      "See ",
      { bibleLink: "1 Maccabees 3:38" },
      "; 10:10, etc.; Compare ",
      { bibleLink: "1 Maccabees 10:65" },
      "; 11:27; ",
      { bibleLink: "2 Maccabees 8:9" },
      ".",
    ]);
  });

  it('should link a reference with no cue word anywhere near it — not even a non-adjacent one — since naming its own book is what makes it unambiguous, not the word beside it (2 Maccabees 4:21\'s real note, "Compare 2 Maccabees 4:21. See also 2 Maccabees 3:5." — Phase 14\'s own first version left "2 Maccabees 3:5" unlinked because "also" broke its cue-adjacency check; Phase 15\'s redesign has no such check to break)', () => {
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

  it("should leave a reference to a book outside canonBookIds unlinked, matching every other resolver in this module (1 Maccabees 10:65's real note, \"Compare 1 Maccabees 10:65.\" — 1 Maccabees is out of IN_SCOPE_CANON's own 66-book canon)", () => {
    const content = linkEmbeddedReferences("Compare 1 Maccabees 10:65. ", IN_SCOPE_CANON);
    expect(content).toBe("Compare 1 Maccabees 10:65. ");
  });

  it('should now link a bare reference sitting at a footnote body\'s own start with no cue word at all — Proverbs 31:10-31\'s own real, self-referential acrostic note, matching upstream HEAD\'s own real, already-linked shape exactly, and three real 1 Esdras instances sharing the identical shape (Ezra 8:3\'s real note) — Phase 14\'s first version left both unlinked, guessing this "no cue" shape was unsafe; upstream HEAD\'s own real Proverbs link proves it is not', () => {
    const proverbs =
      "Proverbs 31:10-31 form an acrostic, with each verse starting with each letter of the Hebrew alphabet, in order.";
    expect(linkEmbeddedReferences(proverbs, IN_SCOPE_CANON)).toEqual([
      { bibleLink: "Proverbs 31:10-31" },
      " form an acrostic, with each verse starting with each letter of the Hebrew alphabet, in order.",
    ]);

    const firstEsdras = "Ezra 8:3, of the sons of Shecaniah; of the sons of Parosh.";
    expect(linkEmbeddedReferences(firstEsdras, IN_SCOPE_CANON)).toEqual([
      { bibleLink: "Ezra 8:3" },
      ", of the sons of Shecaniah; of the sons of Parosh.",
    ]);
  });

  it('should never link a bare chapter-only mention with no verse — Psalm 34:1\'s own real, self-referential acrostic note ("Psalm 34 is an acrostic poem...") is otherwise structurally identical to the now-linked Proverbs note above, except it names no specific verse, and upstream HEAD itself never links a chapter-only reference anywhere in this corpus (zero exceptions across 330 distinct, real, committed bibleLink targets — see EMBEDDED_REFERENCE_SUFFIX\'s own doc comment)', () => {
    const psalm34 =
      "Psalm 34 is an acrostic poem, with each verse starting with a letter of the alphabet (ordered from Alef to Tav).";
    expect(linkEmbeddedReferences(psalm34, IN_SCOPE_CANON)).toBe(psalm34);
  });

  it('should now link Deuteronomy 33:16\'s own real "the burning bush of Exodus 3:3-4" through the generic mechanism directly — "of" is not a cue word, but this redesign never checks for one; "Exodus 3:3-4" names its own book explicitly, which is all that matters now, superseding the separate verse-specific override this used to need in imports/webus2020/import.ts', () => {
    const deuteronomy = "i.e., the burning bush of Exodus 3:3-4.";
    expect(linkEmbeddedReferences(deuteronomy, IN_SCOPE_CANON)).toEqual([
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
 * Six real 66-canon verses where the reference sits behind an ordinary
 * word — "in," "regard," "here and in," "includes," "after," "places" —
 * none of them a "See "/"Compare " lead-in. Proof that
 * `linkEmbeddedReferences` links on the reference's own name alone, with no
 * dependence on a specific cue word. Every fixture is real, verbatim
 * WEBUS2020 corpus text; every expected shape matches upstream `HEAD`'s own
 * exact, real content (dash characters modulo the later, separate,
 * post-write en-dash convention this module never applies).
 */
describe("linkEmbeddedReferences — the six real 66-canon residuals Phase 14's cue-word gate missed, now linked", () => {
  it('should link Psalm 8:5\'s real "See also the quote from the Septuagint in Hebrews 2:7." — the cue "See" sits nowhere near "Hebrews"; only the book name itself matters now', () => {
    const content = linkEmbeddedReferences(
      "Hebrew: Elohim. The word Elohim, used here, usually means “God”, but can also mean “gods”, “princes”, or “angels”. The Septuagint reads “angels” here. See also the quote from the Septuagint in Hebrews 2:7.",
      IN_SCOPE_CANON,
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
      IN_SCOPE_CANON,
    );
    expect(content).toEqual([
      "NU includes the text of verses 9-20, but mentions in a footnote that a few manuscripts omitted it. The translators of the World English Bible regard ",
      { bibleLink: "Mark 16:9-20" },
      " as reliable based on an overwhelming majority of textual evidence, including not only the authoritative Greek Majority Text New Testament, but also the TR and many of the manuscripts cited in the NU text.",
    ]);
  });

  it('should link John 3:3\'s real "The word translated “anew” here and in John 3:7 (ἄνωθεν) also means..." — "here and in" is no cue word at all', () => {
    const content = linkEmbeddedReferences('The word translated “anew” here and in John 3:7 also means “again” and “from above”.', IN_SCOPE_CANON);
    expect(content).toEqual([
      'The word translated “anew” here and in ',
      { bibleLink: "John 3:7" },
      ' also means “again” and “from above”.',
    ]);
  });

  it('should link both halves of John 8:11\'s real "NU includes John 7:53–John 8:11, but puts brackets around it..." independently, with the em dash between them left as plain text — "includes" is a verb, never a cue word, and matches upstream HEAD\'s own real two-bibleLink shape exactly', () => {
    const content = linkEmbeddedReferences(
      "NU includes John 7:53–John 8:11, but puts brackets around it to indicate that the textual critics had less confidence that this was original.",
      IN_SCOPE_CANON,
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
    const content = linkEmbeddedReferences("TR places verses 24-26 after Romans 16:24 as verses 25-27. ", IN_SCOPE_CANON);
    expect(content).toEqual(["TR places verses 24-26 after ", { bibleLink: "Romans 16:24" }, " as verses 25-27. "]);
  });

  it('should link Romans 16:25\'s real "TR places Romans 14:24-26 at the end of Romans instead of..." — "places" is a verb, never a cue word', () => {
    const content = linkEmbeddedReferences(
      "TR places Romans 14:24-26 at the end of Romans instead of at the end of chapter 14, and numbers these verses 16:25-27.",
      IN_SCOPE_CANON,
    );
    expect(content).toEqual([
      "TR places ",
      { bibleLink: "Romans 14:24-26" },
      " at the end of Romans instead of at the end of chapter 14, and numbers these verses 16:25-27.",
    ]);
  });
});
