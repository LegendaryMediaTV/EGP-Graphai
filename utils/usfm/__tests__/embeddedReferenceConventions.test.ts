import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { buildFootnoteContent } from "../footnotes";
import { Token, tokenize } from "../tokenize";
import { REPO_ROOT, usfmFilesByRegistryId } from "./upstreamHeadConvention";
import BibleVersion from "../../../types/Version";
import { ContentBibleLink } from "../../../types/Content";
import Footnote from "../../../types/Footnote";

/**
 * Corpus-wide collision test for Finding 9 (resolving 8a): a fully-qualified
 * reference sitting *inside* a larger run of ordinary footnote prose, with
 * no `\x`/`\+xt` marker anywhere near it. Walks every real `\f`...`\f*`
 * footnote in the whole 81-book WEBUS2020 corpus through the same
 * production function `segmentVerses.ts` itself calls, and measures the
 * exact real population `linkEmbeddedReferences` (`../references.ts`)
 * touches.
 *
 * Phase 14's own first version gated detection on a "See "/"Compare " cue
 * word and measured 72 real links this way. Phase 15 redesigned
 * `linkEmbeddedReferences` after the user's own correction: the cue-word
 * gate was the wrong safeguard, and the real one — registry-and-grammar
 * validation, with an explicit verse required — already existed
 * independently. That redesign measured 99 real embedded references at the
 * time (a 27-instance gain over the cue-word version, for a real,
 * documented reason — see each `it` below).
 *
 * Measured directly against the real, current corpus, the population is now
 * **53**, concentrated entirely in 1 Maccabees (52 → 19) and 2 Maccabees
 * (20 → 8); 1 Esdras and 2 Esdras hold at their own original 7 and 3. Later
 * classification-accuracy work elsewhere in this pipeline (`stu`/`var`/`trn`
 * vs. `xrf` — a body that is *nothing but* a reference belongs in the
 * `xrf` bucket, resolved by `buildReferenceOnlyContent` instead, and never
 * reaches `linkEmbeddedReferences` at all) moved a real share of 1/2
 * Maccabees' own reference-only footnote bodies out of this count — this
 * measurement's own filter (`if (footnote.type === "xrf") continue`)
 * excludes them by design, the same rule it always has.
 *
 * Deliberately corpus-wide, not limited to the 66 canonical books: most of
 * the 53 real instances live in the deuterocanon (19 in 1 Maccabees alone),
 * which carries no upstream `HEAD` baseline at all.
 */

const versionFile = path.join(REPO_ROOT, "bible-versions", "WEBUS2020", "_version.json");
const version: BibleVersion = JSON.parse(fs.readFileSync(versionFile, "utf8"));
const CANON_BOOK_IDS = new Set((version.books ?? []).map((book) => book._id));
const SOURCE_DIR = path.join(REPO_ROOT, "imports", "webus2020", "ebible-usfm");

/** One real, resolved `bibleLink` found inside a non-`xrf` footnote anywhere in the corpus, plus where it came from — only for this test's own error messages. */
interface EmbeddedLink {
  readonly file: string;
  readonly target: string;
  readonly content: string | undefined;
}

function collectLinks(content: unknown, file: string, out: EmbeddedLink[]): void {
  if (content === null || content === undefined || typeof content !== "object") return;
  if (Array.isArray(content)) {
    for (const item of content) collectLinks(item, file, out);
    return;
  }
  if ("bibleLink" in (content as Record<string, unknown>)) {
    const link = content as ContentBibleLink;
    out.push({ file, target: link.bibleLink, content: typeof link.content === "string" ? link.content : undefined });
  }
}

interface CorpusFootnote {
  readonly file: string;
  readonly footnote: Footnote;
  readonly plainText: string;
}

/**
 * Every real `\f`-derived footnote this corpus's raw USFM produces, walked
 * exactly the way `segmentVerses.ts` does in production — restricted to the
 * version's own real 81-book canon exactly as `utils/importUsfm.ts`
 * computes it, `\x`...`\x*` spans skipped entirely (Finding 9 only ever
 * concerns a `\f` body; an `\x` target is already fully marker-based).
 */
function scanFootnotes(): readonly CorpusFootnote[] {
  const footnotes: CorpusFootnote[] = [];

  for (const [bookId, file] of usfmFilesByRegistryId()) {
    if (!CANON_BOOK_IDS.has(bookId)) continue; // front matter, glossary — not one of this version's 81 real books

    const source = fs.readFileSync(path.join(SOURCE_DIR, file), "utf8");
    const tokens: Token[] = tokenize(source);
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type === "open" && token.name === "x") {
        index++;
        for (; index < tokens.length; index++) {
          const inner = tokens[index];
          if (inner.type === "close" && inner.name === "x") break;
        }
        index++;
        continue;
      }
      if (token.type === "open" && token.name === "f") {
        const result = buildFootnoteContent(tokens, index + 1, CANON_BOOK_IDS);
        footnotes.push({ file, footnote: result.footnote, plainText: result.plainText });
        index = result.nextIndex;
        continue;
      }
      index++;
    }
  }

  return footnotes;
}

// Report-only, corpus-wide measurement: needs WEBUS2020's own real raw USFM
// locally at `SOURCE_DIR` (gitignored, never committed — a fresh clone
// doesn't have it). Guarded before `scanFootnotes()` ever runs, not with
// `describe.skipIf`: vitest still runs a skipped describe's own callback
// body to collect its child tests, and the real crash site here (`const
// footnotes = scanFootnotes()`) sits at module scope, outside any describe
// at all.
const SOURCE_AVAILABLE = fs.existsSync(SOURCE_DIR);
const footnotes = SOURCE_AVAILABLE ? scanFootnotes() : [];

/** Every embedded link found inside a non-`xrf` footnote — Finding 9's own real, new population; an `xrf`-typed footnote's own link(s) are the pre-existing `buildReferenceOnlyContent` path, unrelated to this fix. */
const embeddedLinks: EmbeddedLink[] = [];
for (const { file, footnote } of footnotes) {
  if (footnote.type === "xrf") continue;
  collectLinks(footnote.content, file, embeddedLinks);
}

if (!SOURCE_AVAILABLE) {
  describe.skip(
    "Finding 9 — a fully-qualified reference embedded in ordinary footnote prose, measured against the whole real 81-book WEBUS2020 corpus",
    () => {
      it("requires the local WEBUS2020 raw USFM corpus at imports/webus2020/ebible-usfm", () => {});
    },
  );
} else {
describe("Finding 9 — a fully-qualified reference embedded in ordinary footnote prose, measured against the whole real 81-book WEBUS2020 corpus", () => {
  it("should link exactly 53 real embedded references corpus-wide, none of them from an already-xrf-typed footnote", () => {
    expect(embeddedLinks).toHaveLength(53);
  });

  it('should link both of Matthew 27:35\'s real "and"-joined references, matching upstream HEAD\'s own exact shape ("[see Psalms 22:18 and John 19:24]" — Psalms 22:18 also carries Finding 8b\'s own book-name override) — each found and resolved independently now, with no dedicated "and"-chain rule needed', () => {
    const matthew2735 = footnotes.find((f) => f.plainText.includes("[see Psalms 22:18 and John 19:24]"));
    expect(matthew2735?.footnote.content).toEqual([
      "TR adds “that it might be fulfilled which was spoken by the prophet: ‘They divided my garments among them, and for my clothing they cast lots;’” [see ",
      { bibleLink: "Psalm 22:18", content: "Psalms 22:18" },
      " and ",
      { bibleLink: "John 19:24" },
      "]",
    ]);
  });

  it('should link Matthew 23:5\'s real "See Deuteronomy 6:8", matching upstream HEAD\'s own exact shape', () => {
    const matthew235 = footnotes.find((f) => f.plainText.includes("See Deuteronomy 6:8"));
    expect(matthew235?.footnote.content).toEqual([
      "Phylacteries (tefillin in Hebrew) are small leather pouches that some Jewish men wear on their forehead and arm in prayer. They are used to carry a small scroll with some Scripture in it. See ",
      { bibleLink: "Deuteronomy 6:8" },
      ".",
    ]);
  });

  it('should link Revelation 2:17\'s real "See Exodus 11:7-9", matching upstream HEAD\'s own exact shape (modulo the dash character, a separate, later, post-write convention this fix never applies)', () => {
    const revelation217 = footnotes.find((f) => f.plainText.includes("See Exodus 11:7-9"));
    expect(revelation217?.footnote.content).toEqual([
      "Manna is supernatural food, named after the Hebrew for “What is it?”. See ",
      { bibleLink: "Exodus 11:7-9" },
      ".",
    ]);
  });

  it('should now link Deuteronomy 33:16\'s own real "the burning bush of Exodus 3:3-4" through this generic mechanism directly — "of" is not a cue word, but Phase 15\'s redesign never checks for one; "Exodus 3:3-4" names its own book explicitly, superseding the separate verse-specific override this used to need in imports/webus2020/import.ts', () => {
    const deuteronomy3316 = footnotes.find((f) => f.plainText.includes("the burning bush of Exodus 3:3-4"));
    expect(deuteronomy3316?.footnote.content).toEqual([
      "I.e., the burning bush of ",
      { bibleLink: "Exodus 3:3-4" },
      ".",
    ]);
  });

  it("should now link Proverbs 31:10-31's own real, self-referential acrostic note, matching upstream HEAD's own real, already-linked shape exactly — Phase 14's cue-word gate wrongly left this unlinked, guessing a bare, cue-less, body-initial reference was unsafe; upstream HEAD's own real link proves naming a specific verse is what makes it safe, not a cue word", () => {
    const proverbs3110 = footnotes.find((f) => f.plainText.startsWith("Proverbs 31:10-31"));
    expect(proverbs3110).toBeDefined();
    expect(proverbs3110?.footnote.content).toEqual([
      { bibleLink: "Proverbs 31:10-31" },
      " form an acrostic, with each verse starting with each letter of the Hebrew alphabet, in order.",
    ]);
  });

  it("should now link all three of 1 Esdras's real \"bare reference at a body's own start\" notes, sharing Proverbs 31:10-31's own identical shape and now resolved the identical way — real cross-references into canonical Ezra, with no upstream baseline for 1 Esdras itself but the same generic mechanism applying regardless", () => {
    const firstEsdrasNotes = footnotes.filter(
      (f) => f.file === "54-1ESeng-web.usfm" && /^Ezra 8:(?:3|5|10),/.test(f.plainText),
    );
    expect(firstEsdrasNotes).toHaveLength(3);
    for (const note of firstEsdrasNotes) {
      const links: EmbeddedLink[] = [];
      collectLinks(note.footnote.content, note.file, links);
      expect(links).toHaveLength(1);
      expect(links[0].target).toMatch(/^Ezra 8:(?:3|5|10)$/);
    }
  });

  it('should now link both of John 8:11\'s real, dash-joined "NU includes John 7:53–John 8:11, but puts brackets around it..." independently, matching upstream HEAD\'s own real two-bibleLink shape exactly — one of the six real 66-canon residuals Phase 14\'s cue-word gate missed ("includes" is a verb, never a cue word)', () => {
    const john811 = footnotes.find((f) => f.plainText.includes("NU includes John 7:53–John 8:11"));
    expect(john811?.footnote.content).toEqual([
      "NU includes ",
      { bibleLink: "John 7:53" },
      "–",
      { bibleLink: "John 8:11" },
      ", but puts brackets around it to indicate that the textual critics had less confidence that this was original.",
    ]);
  });

  it('should now link Mark 16:9\'s real self-referential "...the translators of the World English Bible regard Mark 16:9-20 as reliable...", matching upstream HEAD\'s own real, already-linked shape exactly — another of the six real residuals ("regard" is a verb, never a cue word)', () => {
    const mark169 = footnotes.find((f) => f.plainText.includes("regard Mark 16:9-20 as reliable"));
    expect(mark169?.footnote.content).toEqual([
      "NU includes the text of verses 9-20, but mentions in a footnote that a few manuscripts omitted it. The translators of the World English Bible regard ",
      { bibleLink: "Mark 16:9-20" },
      " as reliable based on an overwhelming majority of textual evidence, including not only the authoritative Greek Majority Text New Testament, but also the TR and many of the manuscripts cited in the NU text.",
    ]);
  });

  it("should never link a bare chapter-only mention with no verse, even when a real cue word introduces it — Genesis 3:24's real \"See Ezekiel 10.\" no longer links (a chapter-only mention Phase 14's own cue-word-gated version wrongly linked; upstream HEAD carries no baseline for this verse either way, but the corpus-wide 0-out-of-330 evidence — see EMBEDDED_REFERENCE_SUFFIX's own doc comment — says a chapter-only mention should never link)", () => {
    const genesis324 = footnotes.find((f) => f.plainText.includes("See Ezekiel 10"));
    expect(genesis324?.footnote.content).toBe(
      "Cherubim are powerful angelic creatures, messengers of God with wings. See Ezekiel 10.",
    );
  });

  it('should never link Esther-Greek 8:13\'s own real, malformed "perhaps rulers, see Luke 22. 25." — the source itself has no colon between chapter and verse, so this is correctly left alone rather than guessed at (also, chapter-only "Luke 22" alone would fail the verse-mandatory rule regardless)', () => {
    const estherGreek813 = footnotes.find((f) => f.plainText.includes("perhaps rulers, see Luke 22"));
    expect(estherGreek813?.footnote.content).toBe("Perhaps rulers, see Luke 22. 25.");
  });

  it('should never link any of Psalm 34:1, 111:1, or 112:1\'s own real, self-referential "Psalm NN is an acrostic poem..." notes — each names a real, registry-resolvable chapter with no verse, and upstream HEAD itself never links any of the three (unlike Proverbs 31:10-31 and Mark 16:9-20 above, both of which name a specific verse)', () => {
    const psalmAcrostics = footnotes.filter((f) => /^Psalm (?:34|111|112) is an acrostic poem/.test(f.plainText));
    expect(psalmAcrostics).toHaveLength(3);
    for (const note of psalmAcrostics) {
      expect(typeof note.footnote.content).toBe("string");
    }
  });

  it("should keep every deuterocanon-heavy book's own real population exactly where it was measured (1 Maccabees 19, 2 Maccabees 8, 1 Esdras 7, 2 Esdras 3 — no upstream baseline for any of the four, so this is the only real guard against a silent regression in either direction)", () => {
    const byFile = new Map<string, number>();
    for (const link of embeddedLinks) byFile.set(link.file, (byFile.get(link.file) ?? 0) + 1);
    expect(byFile.get("52-1MAeng-web.usfm")).toBe(19);
    expect(byFile.get("53-2MAeng-web.usfm")).toBe(8);
    expect(byFile.get("54-1ESeng-web.usfm")).toBe(7);
    expect(byFile.get("58-2ESeng-web.usfm")).toBe(3);
  });

  it('should now link both of Daniel-Greek 3:24\'s real "...inserted between Daniel 3:23 and Daniel 3:24 of the traditional Hebrew Bible" references, independently — a real, new addition beyond Phase 14\'s own cue-word-gated scope (this sentence carries no cue word at all)', () => {
    const danielGreek324 = footnotes.find((f) => f.plainText.includes("inserted between Daniel 3:23 and Daniel 3:24"));
    const links: EmbeddedLink[] = [];
    if (danielGreek324 !== undefined) collectLinks(danielGreek324.footnote.content, danielGreek324.file, links);
    expect(links.map((l) => l.target)).toEqual(["Daniel 3:23", "Daniel 3:24"]);
  });
});
}
