import { describe, expect, it } from "vitest";
import { segmentVerses } from "../segmentVerses";
import { readFixture } from "./fixtures";
import { fixedOutputMatchesRule, ParagraphBreakBoundary, upstreamMatchesRule } from "./upstreamHeadConvention";

/**
 * A `\b`-less chapter boundary still gets the "clean cut, chapter paragraph
 * start" convention — not just the `\b`-adjacent case
 * `bMarkerUpstreamConvention.test.ts` covers. The ordinary, no-`\b`,
 * bare-`\qN` shape (`segmentVerses.test.ts`'s own Deuteronomy 31:28-32:2,
 * Psalm 90:16-91:2, and Psalm 41:11-42:2 fixtures) is already exercised
 * there in detail; this file's own remaining value is one named exception:
 * Psalm 33:22→34:1, checked against one byte-exact WEBUS2020 fixture.
 *
 * That exception exists because `HEAD` anchors Psalm 34:1's acrostic
 * footnote to a textless node ahead of the chapter's first line — a tree
 * shape from whatever earlier pipeline built `HEAD`, not a wrong flag.
 * `upstreamMatchesRule`'s "skip a heading node" heuristic has nothing but a
 * missing `text` key to go on, so it mistakes that textless node for a
 * heading and reports a mismatch here — even though `HEAD`'s real intent
 * (a paragraph starting at verse 1) is exactly what `segmentVerses()`
 * produces, just merged into one block instead of `HEAD`'s three-way split.
 *
 * Targeted regression check against one named example — not a corpus-wide
 * sweep. The whole-corpus counts this file used to measure (59 `\b`-adjacent
 * boundaries, 197 bare-`\qN` boundaries, 400+ "everything else" boundaries)
 * are dropped along with the corpus/`HEAD` reads.
 */
describe("chapter-boundary handling, checked against a real WEBUS2020 fixture", () => {
  it("should reproduce Psalm 33:22→34:1's own real, named exception: HEAD's own textless footnote-anchored node hides the real paragraph start from upstreamMatchesRule's heading heuristic, but segmentVerses() itself still gets it right", () => {
    const records = segmentVerses(readFixture("psalm-33-22-34-1-textless-footnote-node.usfm"), "PSA");
    const upstream = [
      {
        chapter: 33,
        verse: 22,
        content: [{ text: "Let your loving kindness be on us, Yahweh,", break: true }, "since we have hoped in you."],
      },
      {
        chapter: 34,
        verse: 1,
        content: [
          {
            subtitle:
              "By David; when he pretended to be insane before Abimelech, who drove him away, and he departed.",
          },
          {
            paragraph: true,
            foot: {
              type: "stu",
              content: "Psalm 34 is an acrostic poem, with each verse starting with a letter of the alphabet (ordered from Alef to Tav).",
            },
          },
          { text: "I will bless Yahweh at all times.", break: true },
          { text: "His praise will always be in my mouth.", break: true },
        ],
      },
    ];
    const boundary: ParagraphBreakBoundary = { beforeChapter: 33, beforeVerse: 22, afterChapter: 34, afterVerse: 1 };

    expect(upstreamMatchesRule(upstream, boundary)).toBe(false);
    expect(fixedOutputMatchesRule(records, boundary)).toBe(true);
  });
});
