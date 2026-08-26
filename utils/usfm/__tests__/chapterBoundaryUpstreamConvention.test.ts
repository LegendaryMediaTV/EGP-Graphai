import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { buildHeadingSpanContent } from "../headings";
import { segmentVerses } from "../segmentVerses";
import { tokenize } from "../tokenize";
import {
  fixedOutputMatchesRule,
  ParagraphBreakBoundary,
  readCanonicalBooks,
  readUpstreamBookJson,
  SOURCE_DIR,
  upstreamMatchesRule,
  usfmFilesByRegistryId,
} from "./upstreamHeadConvention";

/**
 * A durable, corpus-wide check that a `\b`-less chapter boundary still
 * gets the "clean cut, chapter paragraph start" convention — not just the
 * `\b`-adjacent case, which `bMarkerUpstreamConvention.test.ts` already
 * covers — exercising the actual `segmentVerses()` code path directly
 * rather than inspecting raw text by eye. Report only: nothing here writes
 * to `bible-versions/`.
 *
 * Classifies every real `\c` chapter marker in WEBUS2020's own raw USFM by
 * two independent facts: whether a real `\b` sits directly in front of it,
 * and what real marker opens the new chapter once `\ms1` and any
 * heading/subtitle span in front of it are skipped past — a `\p`-family
 * marker (already correct, since it sets `pendingParagraph` on its own
 * regardless of `\c`), a bare `\q1`/`\q2`/`\q3` (the `\b`-less bug this
 * test targets), `\b` itself (Job 5's own real `\c N \b \q1 \v 1...`
 * shape, already harmless either way), or something else. For every
 * boundary with real content on both sides, checks whether `HEAD` already
 * carries the two-part convention and whether `segmentVerses()`
 * reproduces it.
 */

/** `\d`/`\sp`/`\s1`/`\qc` — the same heading/subtitle markers `segmentVerses.ts`'s own `SUPERSCRIPTION_OR_SPEAKER_MARKER_NAMES` set names, reconstructed here independently rather than imported, the same "cross-check production, don't just re-run it" discipline `bMarkerUpstreamConvention.test.ts`'s own `HEADING_MARKER_NAMES` already established. */
const HEADING_MARKER_NAMES = new Set(["d", "sp", "s1", "qc"]);

/** `\p`/`\m`/`\nb`/`\li1`/`\pi1`/`\mi` — the markers that already set `pendingParagraph` on their own. */
const PARAGRAPH_OPENING_MARKER_NAMES = new Set(["p", "m", "nb", "li1", "pi1", "mi"]);

/** `\q1`/`\q2`/`\q3` — the bare poetry-line markers this test targets. */
const BARE_BREAK_MARKER_NAMES = new Set(["q1", "q2", "q3"]);

/** One classified `\c` chapter boundary — {@link ParagraphBreakBoundary}'s own before/after verse-position fields, plus what precedes and what opens this `\c` marker. */
interface ChapterBoundary extends ParagraphBreakBoundary {
  /** Whether a real `\b` sits directly in front of this `\c`, skipping only whitespace-only text. */
  readonly bAdjacent: boolean;
  /** What the new chapter's own real content actually opens with, once `\ms1` and any heading/subtitle span are skipped past. */
  readonly opensWith: "paragraph" | "bareBreak" | "stanzaBreak" | "other";
}

/**
 * Classifies every real `\c` marker in `source`. Looks backward past
 * whitespace-only text for a directly-preceding `\b`, and forward — past
 * whitespace, `\ms1`, and any {@link HEADING_MARKER_NAMES} span — for the
 * first real, content-opening marker the new chapter carries. `\ms1` and
 * each heading/subtitle marker's own trailing span is skipped with
 * `buildHeadingSpanContent`, the identical function `segmentVerses.ts`
 * itself uses for exactly this purpose — not a parallel, hand-rolled walk
 * that could quietly disagree with it, e.g. by tripping on a `\d` span's
 * own embedded footnote (Psalm 89:52→90:1's real shape) the way a naive
 * marker-only walk would.
 */
function classifyChapterBoundaries(source: string): ChapterBoundary[] {
  const tokens = tokenize(source);
  const boundaries: ChapterBoundary[] = [];
  let chapter = 0;
  let verse = 0;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "marker" && token.name === "v") {
      verse = Number(token.value);
      continue;
    }
    if (!(token.type === "marker" && token.name === "c")) continue;

    const beforeChapter = chapter;
    const beforeVerse = verse;
    const afterChapter = Number(token.value);

    let back = index - 1;
    while (back >= 0 && tokens[back].type === "text" && (tokens[back] as { text: string }).text.trim().length === 0) {
      back--;
    }
    const bAdjacent = back >= 0 && tokens[back].type === "marker" && (tokens[back] as { name: string }).name === "b";

    let forward = index + 1;
    let opensWith: ChapterBoundary["opensWith"] = "other";
    while (forward < tokens.length) {
      const candidate = tokens[forward];
      if (candidate.type === "text" && candidate.text.trim().length === 0) {
        forward++;
        continue;
      }
      if (candidate.type === "marker" && (candidate.name === "ms1" || HEADING_MARKER_NAMES.has(candidate.name))) {
        forward = buildHeadingSpanContent(tokens, forward + 1).nextIndex;
        continue;
      }
      if (candidate.type === "marker" && PARAGRAPH_OPENING_MARKER_NAMES.has(candidate.name)) opensWith = "paragraph";
      else if (candidate.type === "marker" && BARE_BREAK_MARKER_NAMES.has(candidate.name)) opensWith = "bareBreak";
      else if (candidate.type === "marker" && candidate.name === "b") opensWith = "stanzaBreak";
      break;
    }

    boundaries.push({ beforeChapter, beforeVerse, afterChapter, afterVerse: 1, bAdjacent, opensWith });
    chapter = afterChapter;
    verse = 0;
  }

  return boundaries;
}

// Report-only, corpus-wide measurement: needs the exact WEBUS2020 revision
// `HEAD`'s own committed JSON was built from, locally at `SOURCE_DIR`
// (gitignored) — a mismatched revision fails silently with wrong counts,
// not loudly. Guarded with a plain `if`, not `describe.skipIf`: vitest
// still runs a skipped describe's own callback body, which would run the
// corpus read regardless.
if (!fs.existsSync(SOURCE_DIR)) {
  describe.skip(
    "\\b-less chapter-boundary handling, measured corpus-wide against WEBUS2020's own real upstream HEAD",
    () => {
      it("requires the local WEBUS2020 raw USFM corpus at imports/webus2020/ebible-usfm", () => {});
    },
  );
} else {
describe(
  "\\b-less chapter-boundary handling, measured corpus-wide against WEBUS2020's own real upstream HEAD",
  () => {
  const usfmFiles = usfmFilesByRegistryId();
  const books = readCanonicalBooks();

  const bAdjacentResults: { key: string; upstreamMatch: boolean; fixedMatch: boolean }[] = [];
  const bareBreakResults: { key: string; upstreamMatch: boolean; fixedMatch: boolean }[] = [];
  const otherOpensWithResults: { key: string; opensWith: string; upstreamMatch: boolean; fixedMatch: boolean }[] = [];
  let noUpstreamCounterpartCount = 0;

  for (const book of books) {
    const filename = usfmFiles.get(book.id);
    if (filename === undefined) continue; // No real raw USFM for this book id — not expected, but never fatal to this report-only measurement.

    const source = fs.readFileSync(path.join(SOURCE_DIR, filename), "utf8");
    const boundaries = classifyChapterBoundaries(source);
    const records = segmentVerses(source, book.id);
    const upstream = readUpstreamBookJson(book);

    for (const boundary of boundaries) {
      const upstreamMatch = upstreamMatchesRule(upstream, boundary);
      const fixedMatch = fixedOutputMatchesRule(records, boundary);
      if (upstreamMatch === undefined || fixedMatch === undefined) {
        noUpstreamCounterpartCount++;
        continue;
      }

      const key = `${book.id} ${boundary.beforeChapter}:${boundary.beforeVerse}->${boundary.afterChapter}:1`;
      if (boundary.bAdjacent) {
        bAdjacentResults.push({ key, upstreamMatch, fixedMatch });
      } else if (boundary.opensWith === "bareBreak") {
        bareBreakResults.push({ key, upstreamMatch, fixedMatch });
      } else {
        otherOpensWithResults.push({ key, opensWith: boundary.opensWith, upstreamMatch, fixedMatch });
      }
    }
  }

  it("should find real, scoreable chapter boundaries in three shapes: \\b-adjacent, a bare \\qN opening with no \\b at all, and everything else (already correct, since a \\p-family marker or \\b itself already sets pendingParagraph on its own)", () => {
    // bMarkerUpstreamConvention.test.ts already measures this same
    // \b-adjacent population independently, from \b's own side rather
    // than \c's; this walk should find the same real count.
    expect(bAdjacentResults.length).toBe(59);
    // Freshly-measured count of \b-less chapter boundaries that open
    // directly with a bare \q1/\q2/\q3, within the canonical-book,
    // HEAD-comparable scope.
    expect(bareBreakResults.length).toBe(197);
    // The residual "opens with something else" bucket (\p-family, or \b
    // itself directly after \c, Job 5's own shape) should still be a real,
    // substantial population — proof this walk is finding ordinary,
    // already-correct chapter boundaries too, not just the broken ones.
    expect(otherOpensWithResults.length).toBeGreaterThan(400);
  });

  it("should reproduce the two-part convention at 100% for the \\b-adjacent chapter boundaries (59/59) — confirming this \\c-level fix changes nothing already fixed at the \\b level", () => {
    expect(bAdjacentResults.length).toBe(59);
    expect(bAdjacentResults.every((r) => r.upstreamMatch)).toBe(true);
    expect(bAdjacentResults.every((r) => r.fixedMatch)).toBe(true);
  });

  it("should reproduce the two-part convention at 196/197 for every real \\b-less chapter boundary that opens directly with a bare \\qN, including every real \\ms1 book-division boundary (e.g. Psalm 89:52→90:1) and Deuteronomy 31:30→32:1's own real, no-heading-at-all shape — with the one real, named exception explained rather than chased", () => {
    // Psalm 33:22→34:1 is the one real exception: HEAD anchors verse 1's
    // own acrostic footnote to its own textless node ahead of the real
    // text, a tree-shape choice from whatever earlier, now-superseded
    // pipeline built HEAD (a footnote placed differently, not a wrong
    // flag — the same kind of artifact seen elsewhere in this corpus).
    // `upstreamMatchesRule` mistakes that textless node for a heading
    // (`upstreamBlocks`'s own `isHeading` heuristic has nothing else to go
    // on without a `text` key) and skips it, so it reports
    // `upstreamMatch: false` here even though HEAD's own real intent —
    // paragraph starts at verse 1 — is the same thing this fix produces,
    // just merged into one block instead of HEAD's own three-way split.
    const knownException = "PSA 33:22->34:1";
    const [exceptionRow, ...rest] = [
      bareBreakResults.find((r) => r.key === knownException),
      ...bareBreakResults.filter((r) => r.key !== knownException),
    ];
    expect(exceptionRow).toBeDefined();
    expect(exceptionRow?.upstreamMatch).toBe(false);
    expect(exceptionRow?.fixedMatch).toBe(true);

    expect(rest.length).toBe(196);
    const upstreamMatching = rest.filter((r) => r.upstreamMatch);
    // Every other one of these boundaries should already carry the
    // convention in HEAD — a bare \qN opening a chapter is a shape
    // upstream always treats this way, with or without a \b.
    expect(upstreamMatching.length).toBe(rest.length);
    expect(upstreamMatching.every((r) => r.fixedMatch)).toBe(true);

    const keys = bareBreakResults.map((r) => r.key);
    expect(keys).toContain("DEU 31:30->32:1");
    expect(keys).toContain("PSA 90:17->91:1");
    expect(keys).toContain("PSA 41:13->42:1");
    expect(keys).toContain("PSA 72:20->73:1");
    expect(keys).toContain("PSA 89:52->90:1");
    expect(keys).toContain("PSA 106:48->107:1");
  });

  it("should leave every other real chapter boundary (opening with a \\p-family marker, or with \\b itself directly after \\c) matching HEAD wherever HEAD itself carries the convention — proof this fix changes nothing outside its own real, \\b-less bare-\\qN scope", () => {
    expect(otherOpensWithResults.length).toBeGreaterThan(0);
    const upstreamMatching = otherOpensWithResults.filter((r) => r.upstreamMatch);
    const bothMatching = upstreamMatching.filter((r) => r.fixedMatch);
    expect(bothMatching.length).toBe(upstreamMatching.length);
  });
  },
);
}
