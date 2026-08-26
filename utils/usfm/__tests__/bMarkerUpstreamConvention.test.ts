import { describe, expect, it } from "vitest";
import { segmentVerses } from "../segmentVerses";
import { readFixture } from "./fixtures";
import { fixedOutputMatchesRule, ParagraphBreakBoundary, upstreamMatchesRule } from "./upstreamHeadConvention";

/**
 * Regression check for the `\b` stanza-break fix's two-part convention
 * (drop `break` from the line before a real `\b`, add `paragraph` to the
 * line after it), against one byte-exact WEBUS2020 fixture: Ezra 4:16→17's
 * `\b \p \v 17` shape, where `\p` sits between the `\b` and the `\v` that
 * actually marks the boundary. `upstreamMatchesRule`/`fixedOutputMatchesRule`
 * compare `segmentVerses()`'s output against WEBUS2020's own committed
 * `HEAD` content for the same two verses, copied here as a literal.
 *
 * This file used to scan all 66 canonical books and track 9 named
 * edition-drift exceptions (WEB's own "2020 stable text" disagreeing with
 * whichever revision `HEAD` was built from); that corpus-wide sweep is
 * dropped for this one targeted case. None of the nine were safe to freeze
 * into a fixture: Judges 5:11, the most documented of them, no longer even
 * matches this checkout's own corpus text — the edition drift it names is
 * still moving.
 */
describe("the \\b stanza-break fix, checked against a real WEBUS2020 fixture", () => {
  it("should reproduce the two-part convention for Ezra 4:16→17's real \\b \\p \\v 17 shape, matching WEBUS2020's own real upstream HEAD content", () => {
    const records = segmentVerses(readFixture("ezra-4-16-17-b-p.usfm"), "EZR");
    const upstream = [
      {
        chapter: 4,
        verse: 16,
        content:
          "We inform the king that if this city is built and the walls finished, then you will have no possession beyond the River.",
      },
      {
        chapter: 4,
        verse: 17,
        content: [
          {
            paragraph: true,
            text: "Then the king sent an answer to Rehum the chancellor, and to Shimshai the scribe, and to the rest of their companions who live in Samaria, and in the rest of the country beyond the River:",
          },
          { paragraph: true, text: "Peace." },
        ],
      },
    ];
    const boundary: ParagraphBreakBoundary = { beforeChapter: 4, beforeVerse: 16, afterChapter: 4, afterVerse: 17 };

    expect(upstreamMatchesRule(upstream, boundary)).toBe(true);
    expect(fixedOutputMatchesRule(records, boundary)).toBe(true);
  });
});
