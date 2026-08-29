import { describe, expect, it } from "vitest";
import { buildFootnoteContent } from "../footnotes";
import { Token, tokenize } from "../tokenize";
import { ContentBibleLink } from "../../../types/Content";

/**
 * A fully-qualified reference sitting *inside* a larger run of ordinary
 * footnote prose, with no `\x`/`\+xt` marker anywhere near it, still
 * becomes a `bibleLink` — on the strength of naming its own book and
 * verse, with no "See "/"Compare " cue word required. Each case below
 * calls the production function `buildFootnoteContent` (also
 * `segmentVerses.ts`'s own path) directly, against a byte-exact WEBUS2020
 * footnote body — a targeted regression check against named examples, not
 * a corpus-wide sweep. Every raw USFM snippet is copied verbatim from the
 * corpus, cited by book/verse in each test's own title, the same
 * convention `footnotes.test.ts` already establishes for
 * `buildFootnoteContent` fixtures.
 */

/** Finds the first `\f`...`\f*` span in `raw` and builds its footnote content, mirroring `footnotes.test.ts`'s own `footnoteFrom` shape. */
function footnoteFrom(raw: string): ReturnType<typeof buildFootnoteContent> {
  const tokens: Token[] = tokenize(raw);
  const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "f");
  if (openIndex === -1) throw new Error(`footnoteFrom: no \\f open token found in: ${raw}`);
  return buildFootnoteContent(tokens, openIndex + 1);
}

/** One real, resolved `bibleLink` found inside a footnote's built content. */
interface EmbeddedLink {
  /** The resolved `bibleLink` target string. */
  readonly target: string;
  /** The link's own display override, or `undefined` when the target and the source's own raw text are identical. */
  readonly content: string | undefined;
}

/** Recursively collects every `bibleLink` node found anywhere in `content` into `out`. */
function collectLinks(content: unknown, out: EmbeddedLink[]): void {
  if (content === null || content === undefined || typeof content !== "object") return;
  if (Array.isArray(content)) {
    for (const item of content) collectLinks(item, out);
    return;
  }
  if ("bibleLink" in (content as Record<string, unknown>)) {
    const link = content as ContentBibleLink;
    out.push({ target: link.bibleLink, content: typeof link.content === "string" ? link.content : undefined });
  }
}

describe("a fully-qualified reference embedded in ordinary footnote prose, checked against real WEBUS2020 fixtures", () => {
  it('should link both of Matthew 27:35\'s real "and"-joined references, matching upstream HEAD\'s own exact shape ("[see Psalms 22:18 and John 19:24]" — Psalms 22:18 also gets its own singular "Psalm" book-name override) — each found and resolved independently now, with no dedicated "and"-chain rule needed', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 27:35 \\ft TR adds “that it might be fulfilled which was spoken by the prophet: ‘They divided my garments among them, and for my clothing they cast lots;’” [see Psalms 22:18 and John 19:24]\\f*',
    );
    expect(footnote.content).toEqual([
      "TR adds “that it might be fulfilled which was spoken by the prophet: ‘They divided my garments among them, and for my clothing they cast lots;’” [see ",
      { bibleLink: "Psalm 22:18", content: "Psalms 22:18" },
      " and ",
      { bibleLink: "John 19:24" },
      "]",
    ]);
  });

  it('should link Matthew 23:5\'s real "See Deuteronomy 6:8", matching upstream HEAD\'s own exact shape', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 23:5 \\ft phylacteries (tefillin in Hebrew) are small leather pouches that some Jewish men wear on their forehead and arm in prayer. They are used to carry a small scroll with some Scripture in it. See Deuteronomy 6:8.\\f*',
    );
    expect(footnote.content).toEqual([
      "Phylacteries (tefillin in Hebrew) are small leather pouches that some Jewish men wear on their forehead and arm in prayer. They are used to carry a small scroll with some Scripture in it. See ",
      { bibleLink: "Deuteronomy 6:8" },
      ".",
    ]);
  });

  it('should link Revelation 2:17\'s real "See Exodus 11:7-9", matching upstream HEAD\'s own exact shape (modulo the dash character, a separate, later, post-write convention this fix never applies)', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 2:17 \\ft Manna is supernatural food, named after the Hebrew for “What is it?”. See Exodus 11:7-9.\\f*',
    );
    expect(footnote.content).toEqual([
      "Manna is supernatural food, named after the Hebrew for “What is it?”. See ",
      { bibleLink: "Exodus 11:7-9" },
      ".",
    ]);
  });

  it('should now link Deuteronomy 33:16\'s own real "the burning bush of Exodus 3:3-4" through this generic mechanism directly — "of" is not a cue word, but this redesign never checks for one; "Exodus 3:3-4" names its own book explicitly, superseding the separate verse-specific override this used to need', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 33:16 \\ft i.e., the burning bush of Exodus 3:3-4.\\f*');
    expect(footnote.content).toEqual([
      "I.e., the burning bush of ",
      { bibleLink: "Exodus 3:3-4" },
      ".",
    ]);
  });

  it("should now link Proverbs 31:10-31's own real, self-referential acrostic note, matching upstream HEAD's own real, already-linked shape exactly — naming a specific verse is what makes a bare, cue-less, body-initial reference safe to link, not a cue word", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 31:10 \\ft Proverbs 31:10-31 form an acrostic, with each verse starting with each letter of the Hebrew alphabet, in order.\\f*',
    );
    expect(footnote.content).toEqual([
      { bibleLink: "Proverbs 31:10-31" },
      " form an acrostic, with each verse starting with each letter of the Hebrew alphabet, in order.",
    ]);
  });

  it("should now link all three of 1 Esdras's real \"bare reference at a body's own start\" notes, sharing Proverbs 31:10-31's own identical shape and now resolved the identical way — real cross-references into canonical Ezra, with no upstream baseline for 1 Esdras itself but the same generic mechanism applying regardless", () => {
    const firstEsdrasNotes = [
      footnoteFrom('\\f + \\fr 8:29 \\ft Ezra 8:3, \\fqa of the sons of Shecaniah; of the sons of Parosh.\\f*'),
      footnoteFrom('\\f + \\fr 8:32 \\ft Ezra 8:5, \\fqa of the sons of Shecaniah, the son of Jahaziel.\\f*'),
      footnoteFrom('\\f + \\fr 8:36 \\ft Ezra 8:10, \\fqa of the sons of Shelomith, the son of Josiphiah.\\f*'),
    ];
    const expectedTargets = ["Ezra 8:3", "Ezra 8:5", "Ezra 8:10"];
    firstEsdrasNotes.forEach(({ footnote }, index) => {
      const links: EmbeddedLink[] = [];
      collectLinks(footnote.content, links);
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe(expectedTargets[index]);
    });
  });

  it('should now link both of John 8:11\'s real, dash-joined "NU includes John 7:53–John 8:11, but puts brackets around it..." independently, matching upstream HEAD\'s own real two-bibleLink shape exactly — one of six real 66-canon references linked with no cue word nearby ("includes" is a verb, never a cue word)', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 8:11 \\ft NU includes John 7:53–John 8:11, but puts brackets around it to indicate that the textual critics had less confidence that this was original.\\f*',
    );
    expect(footnote.content).toEqual([
      "NU includes ",
      { bibleLink: "John 7:53" },
      "–",
      { bibleLink: "John 8:11" },
      ", but puts brackets around it to indicate that the textual critics had less confidence that this was original.",
    ]);
  });

  it('should now link Mark 16:9\'s real self-referential "...the translators of the World English Bible regard Mark 16:9-20 as reliable...", matching upstream HEAD\'s own real, already-linked shape exactly — another of the six real residuals ("regard" is a verb, never a cue word)', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 16:9 \\ft NU includes the text of verses 9-20, but mentions in a footnote that a few manuscripts omitted it. The translators of the World English Bible regard Mark 16:9-20 as reliable based on an overwhelming majority of textual evidence, including not only the authoritative Greek Majority Text New Testament, but also the TR and many of the manuscripts cited in the NU text.\\f*',
    );
    expect(footnote.content).toEqual([
      "NU includes the text of verses 9-20, but mentions in a footnote that a few manuscripts omitted it. The translators of the World English Bible regard ",
      { bibleLink: "Mark 16:9-20" },
      " as reliable based on an overwhelming majority of textual evidence, including not only the authoritative Greek Majority Text New Testament, but also the TR and many of the manuscripts cited in the NU text.",
    ]);
  });

  it("should now link a bare chapter-only mention with no verse too — Genesis 3:24's real \"See Ezekiel 10.\" links the whole chapter, reversing this module's own earlier verse-mandatory rule", () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 3:24 \\ft cherubim are powerful angelic creatures, messengers of God with wings. See Ezekiel 10.\\f*',
    );
    expect(footnote.content).toEqual([
      "Cherubim are powerful angelic creatures, messengers of God with wings. See ",
      { bibleLink: "Ezekiel 10" },
      ".",
    ]);
  });

  it('should link the chapter-only prefix of Esther-Greek 8:13\'s own real, malformed "perhaps rulers, see Luke 22. 25." even though the source itself has no colon joining a verse — "Luke 22" resolves as a real chapter-only mention, leaving the malformed ". 25." as ordinary trailing text rather than guessed into a verse it never named', () => {
    const { footnote } = footnoteFrom('\\f + \\fr 8:13 \\ft perhaps rulers, see Luke 22. 25. \\f*');
    expect(footnote.content).toEqual(["Perhaps rulers, see ", { bibleLink: "Luke 22" }, ". 25."]);
  });

  it('should now link each of Psalm 34:1, 111:1, and 112:1\'s own real, self-referential "Psalm NN is an acrostic poem..." notes — each names a real, registry-resolvable chapter, and a chapter-only mention now links the same as any other', () => {
    const psalmAcrostics = [
      { footnote: footnoteFrom(
        '\\f + \\fr 34:1 \\ft Psalm 34 is an acrostic poem, with each verse starting with a letter of the alphabet (ordered from Alef to Tav).\\f*',
      ).footnote, book: "Psalm 34" },
      { footnote: footnoteFrom(
        '\\f + \\fr 111:1 \\ft Psalm 111 is an acrostic poem, with each verse after the initial “Praise Yah!” starting with a letter of the alphabet (ordered from Alef to Tav).\\f*',
      ).footnote, book: "Psalm 111" },
      { footnote: footnoteFrom(
        '\\f + \\fr 112:1 \\ft Psalm 112 is an acrostic poem, with each verse after the initial “Praise Yah!” starting with a letter of the alphabet (ordered from Alef to Tav).\\f*',
      ).footnote, book: "Psalm 112" },
    ];
    for (const { footnote, book } of psalmAcrostics) {
      const links: EmbeddedLink[] = [];
      collectLinks(footnote.content, links);
      expect(links).toEqual([{ target: book, content: undefined }]);
    }
  });

  it('should now link both of Daniel-Greek 3:24\'s real "...inserted between Daniel 3:23 and Daniel 3:24 of the traditional Hebrew Bible" references, independently — this sentence carries no cue word at all', () => {
    const { footnote } = footnoteFrom(
      '\\f + \\fr 3:24 \\ft \\+bk The Song of the Three Holy Children\\+bk* is an addition to \\+bk Daniel\\+bk* found in the Greek Septuagint but not found in the traditional Hebrew text of \\+bk Daniel\\+bk*. This portion is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. It is found inserted between Daniel 3:23 and Daniel 3:24 of the traditional Hebrew Bible. Here, the verses after 23 from the Hebrew Bible are numbered starting at 91 to make room for these verses.\\f*',
    );
    const links: EmbeddedLink[] = [];
    collectLinks(footnote.content, links);
    expect(links.map((l) => l.target)).toEqual(["Daniel 3:23", "Daniel 3:24"]);
  });
});
