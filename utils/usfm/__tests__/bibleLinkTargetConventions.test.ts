import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { buildCrossReferenceContent } from "../references";
import { buildFootnoteContent } from "../footnotes";
import { Token, tokenize } from "../tokenize";
import { REPO_ROOT, usfmFilesByRegistryId } from "./upstreamHeadConvention";
import BibleVersion from "../../../types/Version";
import { ContentBibleLink } from "../../../types/Content";

/**
 * Corpus-wide collision test for Finding 8b (a Psalms cross-reference
 * targets the canonical singular "Psalm", never the source's own plural
 * "Psalms") and Finding 8c (a verse list inside a target gets the space its
 * own comma is missing) — walks every real `\x`/`\f`-derived `bibleLink` in
 * the whole WEBUS2020 corpus, using the same production functions
 * `segmentVerses.ts`/`footnotes.ts` themselves call, and measures the exact
 * real population both fixes touch rather than trusting the task's own
 * preliminary counts (79 and "roughly 12") — recounted here at 88 and 13.
 *
 * Deliberately corpus-wide, not limited to the 66 canonical books: three of
 * the 88 real Finding 8b instances, and one of the 13 real Finding 8c
 * instances, live in `\f`-derived deuterocanon footnotes (Wisdom, 1
 * Maccabees, 1 Esdras) that have no upstream `HEAD` baseline at all — a
 * canon-restricted scan would silently miss them.
 */

const versionFile = path.join(REPO_ROOT, "bible-versions", "WEBUS2020", "_version.json");
const version: BibleVersion = JSON.parse(fs.readFileSync(versionFile, "utf8"));
const CANON_BOOK_IDS = new Set((version.books ?? []).map((book) => book._id));

/** One real, resolved `bibleLink` node found anywhere in the corpus, plus where it came from — only for this test's own error messages. */
interface CorpusLink {
  readonly file: string;
  readonly target: string;
  readonly content: string | undefined;
}

function collectLinks(content: unknown, file: string, out: CorpusLink[]): void {
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

/**
 * Every real `bibleLink` this corpus's raw USFM produces, walked exactly the
 * way `segmentVerses.ts` does in production: every `\x`...`\x*` span through
 * {@link buildCrossReferenceContent}, every `\f`...`\f*` span through
 * {@link buildFootnoteContent} (which resolves a reference-only body the
 * identical way — the only path that reaches Wisdom 11:4's and 1 Maccabees
 * 7:17's own real Psalms citations), restricted to the version's own real
 * canon exactly as `utils/importUsfm.ts` computes it.
 */
function scanCorpus(): readonly CorpusLink[] {
  const links: CorpusLink[] = [];
  const sourceDir = path.join(REPO_ROOT, "imports", "webus2020", "ebible-usfm");

  for (const [bookId, file] of usfmFilesByRegistryId()) {
    if (!CANON_BOOK_IDS.has(bookId)) continue; // front matter, glossary, and anything outside this version's own canon

    const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const tokens: Token[] = tokenize(source);
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.type === "open" && token.name === "x") {
        const result = buildCrossReferenceContent(tokens, index + 1, CANON_BOOK_IDS);
        collectLinks(result.footnote.content, file, links);
        index = result.nextIndex;
        continue;
      }
      if (token.type === "open" && token.name === "f") {
        const result = buildFootnoteContent(tokens, index + 1, CANON_BOOK_IDS);
        if (result.footnote.type === "xrf") collectLinks(result.footnote.content, file, links);
        index = result.nextIndex;
        continue;
      }
      index++;
    }
  }

  return links;
}

// Report-only, corpus-wide measurement: needs WEBUS2020's own real raw USFM
// locally (gitignored, never committed — a fresh clone doesn't have it).
// Guarded before `scanCorpus()` ever runs, not with `describe.skipIf`:
// vitest still runs a skipped describe's own callback body to collect its
// child tests, and the real crash site here (`const links = scanCorpus()`)
// sits at module scope, outside any describe at all.
const SOURCE_AVAILABLE = fs.existsSync(path.join(REPO_ROOT, "imports", "webus2020", "ebible-usfm"));
const links = SOURCE_AVAILABLE ? scanCorpus() : [];

if (!SOURCE_AVAILABLE) {
  describe.skip("bibleLink target conventions — Finding 8b/8c, measured against the whole real WEBUS2020 corpus", () => {
    it("requires the local WEBUS2020 raw USFM corpus at imports/webus2020/ebible-usfm", () => {});
  });
} else {
describe("bibleLink target conventions — Finding 8b/8c, measured against the whole real WEBUS2020 corpus", () => {
  it("should resolve every real Psalms cross-reference to the canonical singular \"Psalm\" target — exactly 88 real corpus-wide instances, none left plural", () => {
    const psalmsOrPsalm = links.filter((link) => /^Psalms? \d/.test(link.target));
    expect(psalmsOrPsalm).toHaveLength(88);
    for (const link of psalmsOrPsalm) {
      expect(link.target).toMatch(/^Psalm \d/);
    }
  });

  it("should leave every real Psalms citation's own display text exactly as the source wrote it (plural, unspaced dashes, a \"See \" lead-in, or a bare \"C:V\" continuation naming no book at all — whatever shape it already had)", () => {
    const psalmTargets = links.filter((link) => link.target.startsWith("Psalm "));
    for (const link of psalmTargets) {
      expect(link.content).toBeDefined();
      // "See Psalms 107:29" (Luke) keeps its own pre-existing lead-in; a
      // bare "69:4" (John 15:25's continuation, inheriting "Psalm" from the
      // prior target) names no book of its own at all — both pre-existing,
      // unrelated shapes this fix leaves alone.
      expect(link.content).toMatch(/^(?:(?:See )?Psalms |\d)/);
    }
  });

  it("should add a space after every real verse-list comma the raw source omitted — exactly 13 real corpus-wide instances, matched by their own preserved, unspaced raw display text", () => {
    const hadUnspacedComma = links.filter((link) => link.content !== undefined && /,\d/.test(link.content));
    expect(hadUnspacedComma).toHaveLength(13);
    for (const link of hadUnspacedComma) {
      expect(link.target).not.toMatch(/,\d/);
    }
  });

  it("should leave no unspaced verse-list comma anywhere in the whole corpus's resolved targets, corpus-wide, not only the 13 already-named instances", () => {
    const stillUnspaced = links.filter((link) => /,\d/.test(link.target));
    expect(stillUnspaced).toEqual([]);
  });

  it("should touch no other book name — the only two real target/display book-name pairs in the whole corpus are Finding 8b's own Psalms/Psalm and the pre-existing, unrelated Wisdom/\"Wisdom of Solomon\" alias normalization", () => {
    const BOOK_NAME_LEAD_IN = /^(?:See|Compare)\s+/;
    const bookNamePrefix = (text: string): string | undefined => {
      const withoutLeadIn = text.replace(BOOK_NAME_LEAD_IN, "");
      const match = /^([A-Za-z][A-Za-z ]*?)\s\d/.exec(withoutLeadIn);
      return match?.[1];
    };

    const realPairs = new Set<string>();
    for (const link of links) {
      if (link.content === undefined) continue;
      const targetPrefix = bookNamePrefix(link.target);
      const contentPrefix = bookNamePrefix(link.content);
      if (targetPrefix === undefined || contentPrefix === undefined) continue; // a bare "C:V" continuation names no book of its own
      if (targetPrefix !== contentPrefix) realPairs.add(`${contentPrefix} -> ${targetPrefix}`);
    }

    expect([...realPairs].sort()).toEqual(["Psalms -> Psalm", "Wisdom -> Wisdom of Solomon"]);
  });

  it("should resolve the two named fixtures exactly as upstream WEBUS2020's own committed HEAD does (Matthew 4:6 and Matthew 5:4, modulo the dash character, a separate later post-write convention this module never applies)", () => {
    const matthew46 = links.find((link) => link.file === "70-MATeng-web.usfm" && link.content === "Psalms 91:11-12");
    expect(matthew46?.target).toBe("Psalm 91:11-12");

    const matthew54 = links.find((link) => link.file === "70-MATeng-web.usfm" && link.content === "66:10,13");
    expect(matthew54?.target).toBe("Isaiah 66:10, 13");
  });
});
}
