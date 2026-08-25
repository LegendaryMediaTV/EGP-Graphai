import { describe, expect, it } from "vitest";
import { uniformFraction } from "../fractions";
import { segmentVerses, VerseBlock } from "../segmentVerses";
import { readFixture } from "./fixtures";

/**
 * Verse segmentation tests. Fixtures are drawn verbatim from the real USFM
 * source (`imports/guide.md` §6), never hand-written, and every expected
 * value was read directly off the fixture file rather than guessed.
 */

/**
 * Projects a block down to `{ text, paragraph?, break? }` so a paragraph/
 * break-placement test doesn't also have to assert the full `nodes` shape
 * (a separate concern, covered by its own describe block below). `toEqual`
 * already ignores an `undefined` field, so this reads as the optional
 * shape directly.
 */
function blockFlags(blocks: readonly VerseBlock[]): { text: string; paragraph?: boolean; break?: boolean }[] {
  return blocks.map(({ text, paragraph, break: brk }) => ({ text, paragraph, break: brk }));
}

/** `Array.prototype.at` isn't available under this project's `ES2020` lib target; this is the one-line stand-in used by the tests below. */
function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

describe("segmentVerses — Genesis 1-2 (a chapter boundary mid-token-stream, a footnote aside excluded)", () => {
  const records = segmentVerses(readFixture("genesis-1-2.usfm"), "GEN");

  it("should emit exactly 31 verses for chapter 1 and 25 for chapter 2, none dropped or duplicated", () => {
    const chapterOne = records.filter((record) => record.chapter === 1).map((record) => record.verse);
    const chapterTwo = records.filter((record) => record.chapter === 2).map((record) => record.verse);
    expect(chapterOne).toEqual(Array.from({ length: 31 }, (_, index) => index + 1));
    expect(chapterTwo).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
  });

  it("should not duplicate verse 1 across the two chapters", () => {
    const verseOnes = records.filter((record) => record.verse === 1);
    expect(verseOnes.map((record) => record.chapter)).toEqual([1, 2]);
  });

  it("should carry every record's own book id from the caller, not from the source", () => {
    expect(records.every((record) => record.book === "GEN")).toBe(true);
  });

  it('should keep verse 1\'s own Strong\'s-tagged words as plain text, with the H8064 footnote body excluded entirely', () => {
    const verseOne = records.find((record) => record.chapter === 1 && record.verse === 1);
    expect(verseOne?.rawContent).toBe("In the beginning, God created the heavens and the earth.");
  });

  it("should exclude a footnote naming God's Hebrew name from verse 4 of chapter 2, keeping the surrounding prose intact", () => {
    const verseFour = records.find((record) => record.chapter === 2 && record.verse === 4);
    expect(verseFour?.rawContent).not.toContain("Yahweh” is God’s proper Name");
    expect(verseFour?.rawContent).toContain("Yahweh God made the earth and the heavens.");
  });
});

describe("segmentVerses — Psalm 3 (a \\d superscription before any verse, \\qs Selah kept as plain text)", () => {
  const records = segmentVerses(readFixture("psalm-3.usfm"), "PSA");

  it("should emit exactly 8 verses, all in chapter 3", () => {
    expect(records.map((record) => record.verse)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(records.every((record) => record.chapter === 3)).toBe(true);
  });

  it("should exclude the \\d superscription's own text from verse 1's content", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.rawContent).not.toContain("Absalom");
  });

  it('should keep "Selah." as plain verse text at the end of verse 2, with the footnote before it excluded', () => {
    const verseTwo = records.find((record) => record.verse === 2);
    expect(verseTwo?.rawContent.endsWith("Selah.")).toBe(true);
    expect(verseTwo?.rawContent).not.toContain("Elohim");
  });
});

describe("segmentVerses — Luke 17:35-37 (verse 36 is entirely a textual-variant footnote, no verse text of its own)", () => {
  const records = segmentVerses(readFixture("luke-17-35-37.usfm"), "LUK");

  it("should still emit a record for verse 36, never dropping it", () => {
    expect(records.map((record) => record.verse)).toEqual([35, 36, 37]);
  });

  it("should fall back to the footnote's own real text for verse 36, with its \\fr label and + caller symbol stripped", () => {
    const verse36 = records.find((record) => record.verse === 36);
    expect(verse36?.rawContent).toBe(
      "Some Greek manuscripts add: “Two will be in the field: the one taken, and the other left.”",
    );
  });

  it("should not apply the fallback to verse 37, which carries real verse text of its own", () => {
    const verse37 = records.find((record) => record.verse === 37);
    expect(verse37?.rawContent).toBe('They, answering, asked him, “Where, Lord?”');
  });
});

describe("segmentVerses — Genesis 1 (\\p opens a prose paragraph on the block that follows, at chapter start and mid-chapter alike)", () => {
  const records = segmentVerses(readFixture("genesis-1-2.usfm"), "GEN");

  it("should flag verse 1's own first (and only) block paragraph: true — the chapter's own opening \\p", () => {
    const verseOne = records.find((record) => record.chapter === 1 && record.verse === 1);
    expect(blockFlags(verseOne?.blocks ?? [])).toEqual([
      { text: "In the beginning, God created the heavens and the earth.", paragraph: true },
    ]);
  });

  it("should carry no flag on verse 2's own block — no \\p between verses 1 and 2 in the real source", () => {
    const verseTwo = records.find((record) => record.chapter === 1 && record.verse === 2);
    expect(blockFlags(verseTwo?.blocks ?? [])).toEqual([
      {
        text:
          "The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters.",
      },
    ]);
  });

  it("should flag verse 3's own first block paragraph: true — a real mid-chapter \\p, not just a chapter-start special case", () => {
    const verseThree = records.find((record) => record.chapter === 1 && record.verse === 3);
    expect(verseThree?.blocks[0]).toMatchObject({ paragraph: true });
  });
});

describe("segmentVerses — Numbers 13:1-5 (\\p and \\m both open a paragraph on the block that follows; \\m splits a verse mid-stream and also crosses a verse boundary)", () => {
  const records = segmentVerses(readFixture("numbers-13-1-5.usfm"), "NUM");

  it("should flag verse 1's only block paragraph: true (\\p before it)", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(blockFlags(verseOne?.blocks ?? [])).toEqual([{ text: "Yahweh spoke to Moses, saying,", paragraph: true }]);
  });

  it("should split verse 4 into two blocks at the mid-verse \\m, the first unflagged and the second paragraph: true", () => {
    const verseFour = records.find((record) => record.verse === 4);
    expect(blockFlags(verseFour?.blocks ?? [])).toEqual([
      { text: "These were their names:" },
      { text: "Of the tribe of Reuben, Shammua the son of Zaccur.", paragraph: true },
    ]);
  });

  it("should flag verse 5's own first block paragraph: true even though its own \\m marker sits in verse 4's own token stream, before the verse boundary", () => {
    const verseFive = records.find((record) => record.verse === 5);
    expect(blockFlags(verseFive?.blocks ?? [])).toEqual([
      { text: "Of the tribe of Simeon, Shaphat the son of Hori.", paragraph: true },
    ]);
  });
});

describe("segmentVerses — Genesis 50:1 (\\nb behaves exactly like \\p)", () => {
  it("should flag the verse's own first block paragraph: true", () => {
    const records = segmentVerses(readFixture("genesis-50-1.usfm"), "GEN");
    expect(blockFlags(records[0].blocks)).toEqual([
      { text: "Joseph fell on his father’s face, wept on him, and kissed him.", paragraph: true },
    ]);
  });
});

describe("segmentVerses — Psalm 3 (\\q1/\\q2 end a poetry line with break: true on the block that precedes; the psalm's own opening \\q1, with nothing before it in this isolated fixture, never reaches back onto anything — but Finding 7's own \\c-level fix still gives the real first line its own paragraph: true, through \\c's own dispatch rather than through that reach-back)", () => {
  const records = segmentVerses(readFixture("psalm-3.usfm"), "PSA");

  it("should split verse 1 into its own two poetry lines, the first carrying paragraph: true from \\c 3's own dispatch (Finding 7), both ending break: true, after the subtitle block that attaches ahead of them", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(blockFlags((verseOne?.blocks ?? []).slice(1))).toEqual([
      { text: "Yahweh, how my adversaries have increased!", paragraph: true, break: true },
      { text: "Many are those who rise up against me.", break: true },
    ]);
  });

  it("should keep \"Selah.\" attached to verse 2's own second line, both still break: true", () => {
    const verseTwo = records.find((record) => record.verse === 2);
    expect(blockFlags(verseTwo?.blocks ?? [])).toEqual([
      { text: "Many there are who say of my soul,", break: true },
      { text: "“There is no help for him in God.” Selah.", break: true },
    ]);
  });

  it("should leave the fixture's own final line unflagged — nothing follows it in this isolated excerpt to attach a break to", () => {
    const blocks = records.find((record) => record.verse === 8)?.blocks ?? [];
    expect(last(blockFlags(blocks))).toEqual({
      text: "May your blessing be on your people. Selah.",
    });
  });
});

describe("segmentVerses — Psalm 10:11-13 (\\b, a real stanza break — the upstream-confirmed two-part rule: the line it closes loses break: true entirely, and the line that follows opens paragraph: true instead)", () => {
  const records = segmentVerses(readFixture("psalm-10-11-13.usfm"), "PSA");

  it("should drop break: true from verse 11's own last line entirely — the \\b immediately following it means this was a real stanza gap, not an ordinary line-wrap", () => {
    const blocks = records.find((record) => record.verse === 11)?.blocks ?? [];
    expect(last(blockFlags(blocks))).toEqual({
      text: "He will never see it.”",
    });
  });

  it("should flag verse 12's own first line paragraph: true from the \\b, in addition to its own ordinary break: true from the \\q2 that follows it — the bare \\q1 between \\b and \\v 12 is absorbed, not treated as a second, competing break marker", () => {
    const verseTwelve = records.find((record) => record.verse === 12);
    expect(blockFlags(verseTwelve?.blocks ?? [])[0]).toEqual({
      text: "Arise, Yahweh!",
      paragraph: true,
      break: true,
    });
  });
});

describe("segmentVerses — Genesis 49:1-9 (three real \\b stanza breaks at 2→3, 4→5, and 7→8, alongside a same-verse \\q1/\\q2 pair with no \\b between them — the upstream-confirmed two-part rule, verified directly against bible-versions/WEBUS2020/01-GEN.json@HEAD)", () => {
  const records = segmentVerses(readFixture("genesis-49-1-9.usfm"), "GEN");

  it("should drop break: true entirely from verse 2's own last line (the \\b immediately following it) and from verse 4's and verse 7's own last lines the same way — three independent real \\b instances, same real fix", () => {
    const verseTwo = records.find((record) => record.verse === 2);
    const verseFour = records.find((record) => record.verse === 4);
    const verseSeven = records.find((record) => record.verse === 7);
    expect(last(blockFlags(verseTwo?.blocks ?? []))).toEqual({ text: "Listen to Israel, your father." });
    expect(last(blockFlags(verseFour?.blocks ?? []))).toEqual({
      text: "then defiled it. He went up to my couch.",
    });
    expect(last(blockFlags(verseSeven?.blocks ?? []))).toEqual({
      text: "and scatter them in Israel.",
    });
  });

  it("should flag verse 3's, verse 5's, and verse 8's own first line paragraph: true from the \\b that precedes each — in addition to each one's own ordinary break: true from the \\q2 line that follows it, the same dual-flag shape Psalm 10:12 already locks", () => {
    const verseThree = records.find((record) => record.verse === 3);
    const verseFive = records.find((record) => record.verse === 5);
    const verseEight = records.find((record) => record.verse === 8);
    expect(blockFlags(verseThree?.blocks ?? [])[0]).toEqual({
      text: "“Reuben, you are my firstborn, my might, and the beginning of my strength,",
      paragraph: true,
      break: true,
    });
    expect(blockFlags(verseFive?.blocks ?? [])[0]).toEqual({
      text: "“Simeon and Levi are brothers.",
      paragraph: true,
      break: true,
    });
    expect(blockFlags(verseEight?.blocks ?? [])[0]).toEqual({
      text: "“Judah, your brothers will praise you.",
      paragraph: true,
      break: true,
    });
  });

  it("should leave verse 3's own second line (\\q2, immediately following its own first line with no \\b between them) with an ordinary break: true and no paragraph flag — the same-verse, no-\\b case stays exactly as it always has", () => {
    const verseThree = records.find((record) => record.verse === 3);
    expect(blockFlags(verseThree?.blocks ?? [])[1]).toEqual({
      text: "excelling in dignity, and excelling in power.",
      break: true,
    });
  });

  it("should leave verse 6's own four lines (no \\b anywhere near this verse) exactly as ordinary poetry line-wraps always have been — every line break: true, none carrying paragraph", () => {
    const verseSix = records.find((record) => record.verse === 6);
    expect(blockFlags(verseSix?.blocks ?? [])).toEqual([
      { text: "My soul, don’t come into their council.", break: true },
      { text: "My glory, don’t be united to their assembly;", break: true },
      { text: "for in their anger they killed men.", break: true },
      { text: "In their self-will they hamstrung cattle.", break: true },
    ]);
  });
});

describe("segmentVerses — the real \\b-then-bare-\\qN idiom itself (Genesis 49:2→3: \\q2 ...father. / \\b / \\q1 / \\v 3 \"Reuben...), isolated from the two-block-boundary assertions above — this is the exact trap this phase's own first, wrong mechanical sketch (flushBlock(true) for \\b) would have failed", () => {
  const records = segmentVerses(readFixture("genesis-49-1-9.usfm"), "GEN");

  it("should not let the bare \\q1 sitting between \\b and \\v 3 resurrect verse 2's own dropped break: true — a naive fix that only stopped \\b itself from setting break: true, without also absorbing this bare \\qN, would fail here: BREAK_MARKER_NAMES's own \"nothing accumulated, reach backward\" rule (flushBlock's own doc comment) would otherwise find verse 2's own now-bare last line and set break: true right back onto it", () => {
    const verseTwo = records.find((record) => record.verse === 2);
    const lastBlock = last(verseTwo?.blocks ?? []);

    // The precise shape a resurrected break would take: `break: true`
    // reappearing on the exact block the fix just cleared. Asserted
    // directly, not just implied by the block-boundary tests above, so a
    // regression here fails with an unambiguous message rather than a
    // generic shape mismatch.
    expect(lastBlock?.break).toBeUndefined();
    expect(blockFlags(verseTwo?.blocks ?? [])).toEqual([
      { text: "Assemble yourselves, and hear, you sons of Jacob.", break: true },
      { text: "Listen to Israel, your father." },
    ]);
  });

  it("should still let verse 3's own first block open paragraph: true — the bare \\q1 being absorbed rather than dispatched doesn't cost the pending paragraph flag \\b itself already set", () => {
    const verseThree = records.find((record) => record.verse === 3);
    expect(blockFlags(verseThree?.blocks ?? [])[0]).toMatchObject({ paragraph: true });
  });
});

describe("segmentVerses — 1 Samuel 2:1-5 (two real \\b stanza breaks, at 2→3 and 3→4, alternating with two ordinary bare-\\q1 verse boundaries with no \\b at all, at 1→2 and 4→5 — proving the fix touches only the \\b-adjacent boundaries and leaves the ordinary ones untouched, verified directly against bible-versions/WEBUS2020/09-1SM.json@HEAD)", () => {
  const records = segmentVerses(readFixture("1-samuel-2-1-5.usfm"), "1SM");

  it("should still flag verse 1's own last line break: true from the ordinary bare \\q1 that opens verse 2 — no \\b sits at this boundary, so the reach-back this corpus has always used here is untouched", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(last(blockFlags(verseOne?.blocks ?? []))).toEqual({
      text: "because I rejoice in your salvation.",
      break: true,
    });
  });

  it("should leave verse 2's own first line with no paragraph flag — no \\b precedes verse 2 either, only the same ordinary bare \\q1 reach-back", () => {
    const verseTwo = records.find((record) => record.verse === 2);
    expect(blockFlags(verseTwo?.blocks ?? [])[0]).toEqual({
      text: "There is no one as holy as Yahweh,",
      break: true,
    });
  });

  it("should drop break: true entirely from verse 2's own last line — the real \\b immediately following it — and from verse 3's own last line the same way, from the second real \\b", () => {
    const verseTwo = records.find((record) => record.verse === 2);
    const verseThree = records.find((record) => record.verse === 3);
    expect(last(blockFlags(verseTwo?.blocks ?? []))).toEqual({
      text: "nor is there any rock like our God.",
    });
    expect(last(blockFlags(verseThree?.blocks ?? []))).toEqual({
      text: "By him actions are weighed.",
    });
  });

  it("should flag verse 3's and verse 4's own first line paragraph: true from each real \\b, alongside each one's own ordinary break: true", () => {
    const verseThree = records.find((record) => record.verse === 3);
    const verseFour = records.find((record) => record.verse === 4);
    expect(blockFlags(verseThree?.blocks ?? [])[0]).toEqual({
      text: "“Don’t keep talking so exceedingly proudly.",
      paragraph: true,
      break: true,
    });
    expect(blockFlags(verseFour?.blocks ?? [])[0]).toEqual({
      text: "“The bows of the mighty men are broken.",
      paragraph: true,
      break: true,
    });
  });

  it("should leave verse 5's own first line with no paragraph flag — verse 4→5 is an ordinary bare-\\q1 boundary again, no \\b involved", () => {
    const verseFive = records.find((record) => record.verse === 5);
    expect(blockFlags(verseFive?.blocks ?? [])[0]).toEqual({
      text: "Those who were full have hired themselves out for bread.",
      break: true,
    });
  });
});

describe("segmentVerses — Job 5:26-6:2 (a real \\b stanza break sitting directly on a chapter boundary — Job 5's own last verse into chapter 6's own first, one of 59 real chapter-boundary matches confirmed corpus-wide)", () => {
  const records = segmentVerses(readFixture("job-5-26-6-2.usfm"), "JOB");

  it("should drop break: true entirely from Job 5:27's own last line — the real \\b sits between the chapter's own last verse and the \\c 6 boundary that follows it", () => {
    // This fixture opens mid-chapter-5 (no `\c 5` marker of its own, per its
    // own byte-exact line range), so `chapter` stays at its initial `0`
    // for verse 27 — filtering by `verse` alone is unambiguous, since this
    // fixture's only other verse 27 would require a second chapter 5 to
    // exist within it, which it doesn't.
    const verseTwentySeven = records.find((record) => record.verse === 27);
    expect(last(blockFlags(verseTwentySeven?.blocks ?? []))).toEqual({
      text: "Hear it, and know it for your good.”",
    });
  });

  it("should flag Job 6:1's own first (and only) block paragraph: true — pendingParagraph survives the \\c 6 boundary itself, the same way it already survives an ordinary \\p/\\m boundary — reinforced here by chapter 6's own real \\p, which would have set the identical flag on its own", () => {
    const chapterSixVerseOne = records.find((record) => record.chapter === 6 && record.verse === 1);
    expect(blockFlags(chapterSixVerseOne?.blocks ?? [])).toEqual([
      { text: "Then Job answered,", paragraph: true, break: true },
    ]);
  });
});

describe("segmentVerses — Job 16:22-17:1 (the real chapter-boundary shape of the \\b-then-bare-\\qN idiom itself: \\b \\c 17 \\q1 \\v 1... — a real bug a corpus-wide measurement caught: the suppression guard originally cleared on \\c, since \\c is neither whitespace nor a break marker, letting the bare \\q1 behind it run its own ordinary dispatch and re-add the break \\b had just dropped)", () => {
  const records = segmentVerses(readFixture("job-16-22-17-1-chapter-b.usfm"), "JOB");

  it("should drop break: true entirely from verse 22's own last line and not let the bare \\q1 sitting between \\c 17 and \\v 1 resurrect it — the guard must survive \\c itself, not just whitespace", () => {
    const verseTwentyTwo = records.find((record) => record.verse === 22);
    expect(last(blockFlags(verseTwentyTwo?.blocks ?? []))).toEqual({
      text: "I will go the way of no return.",
    });
  });

  it("should flag chapter 17 verse 1's own first line paragraph: true, alongside its own ordinary break: true", () => {
    const chapterSeventeenVerseOne = records.find((record) => record.chapter === 17 && record.verse === 1);
    expect(blockFlags(chapterSeventeenVerseOne?.blocks ?? [])[0]).toEqual({
      text: "“My spirit is consumed.",
      paragraph: true,
      break: true,
    });
  });
});

describe("segmentVerses — Psalm 46:11-47:1 (the real heading-adjacent shape of the same idiom: \\b \\c 47 \\d ... \\q1 \\v 1... — a second real bug the same corpus-wide measurement caught: the guard also needs to survive a \\d/\\sp/\\s1/\\qc heading marker, not just \\c, since a Psalm superscription routinely sits between a chapter-ending \\b and its own bare \\qN)", () => {
  const records = segmentVerses(readFixture("psalm-46-11-47-1-heading-b.usfm"), "PSA");

  it("should drop break: true entirely from Psalm 46:11's own last line and not let the bare \\q1 sitting behind \\c 47's own \\d superscription resurrect it", () => {
    const verseEleven = records.find((record) => record.verse === 11);
    expect(last(blockFlags(verseEleven?.blocks ?? []))).toEqual({
      text: "The God of Jacob is our refuge. Selah.",
    });
  });

  it("should still attach the \\d superscription as Psalm 47:1's own leading heading block, ahead of its own real first line, which itself carries paragraph: true and break: true", () => {
    const chapterFortySevenVerseOne = records.find((record) => record.chapter === 47 && record.verse === 1);
    const blocks = chapterFortySevenVerseOne?.blocks ?? [];
    expect(blocks[0]?.headingContent).toMatchObject({ subtitle: "For the Chief Musician. A Psalm by the sons of Korah." });
    expect(blockFlags([blocks[1]])).toEqual([
      { text: "Oh clap your hands, all you nations.", paragraph: true, break: true },
    ]);
  });
});

describe("segmentVerses — Deuteronomy 31:28-32:2 (Finding 7's own real report: a \\b-less chapter boundary — \\p \\v 30 ... \\c 32 \\q1 \\v 1..., no \\b anywhere near it — gets the identical clean-cut, chapter-paragraph-start convention Phase 5 only gave the \\b-adjacent case)", () => {
  const records = segmentVerses(readFixture("deuteronomy-31-28-32-2.usfm"), "DEU");

  it("should leave 31:30's own single block clean, with no break: true reach-back from chapter 32's own bare \\q1", () => {
    // This fixture, like job-16-22-17-1-chapter-b.usfm's own established
    // precedent, carries no leading \c 31 marker, so verse 30 lands under
    // this walk's own default chapter, 0 — matched by verse number alone,
    // unambiguous since this fixture has exactly one verse 30.
    const verseThirty = records.find((record) => record.verse === 30);
    expect(blockFlags(verseThirty?.blocks ?? [])).toEqual([
      {
        text: "Moses spoke in the ears of all the assembly of Israel the words of this song, until they were finished.",
        paragraph: true,
      },
    ]);
  });

  it("should flag chapter 32 verse 1's own first line paragraph: true, even though nothing but a bare \\q1 sits directly behind \\c 32", () => {
    const chapterThirtyTwoVerseOne = records.find((record) => record.chapter === 32 && record.verse === 1);
    expect(blockFlags(chapterThirtyTwoVerseOne?.blocks ?? [])).toEqual([
      { text: "Give ear, you heavens, and I will speak.", paragraph: true, break: true },
      { text: "Let the earth hear the words of my mouth.", break: true },
    ]);
  });
});

describe("segmentVerses — Psalm 90:16-91:2 (Finding 7's own second real book: the same \\b-less chapter-boundary convention with no \\d superscription in the gap at all — Psalm 91 carries none)", () => {
  const records = segmentVerses(readFixture("psalm-90-16-91-2.usfm"), "PSA");

  it("should leave Psalm 90:17's own last block clean, with no break: true reach-back from chapter 91's own bare \\q1", () => {
    // No leading \c 90 marker in this fixture either — matched by verse
    // number alone, unambiguous since this fixture has exactly one verse
    // 17 (see the identical note on the Deuteronomy fixture above).
    const verseSeventeen = records.find((record) => record.verse === 17);
    expect(last(blockFlags(verseSeventeen?.blocks ?? []))).toEqual({
      text: "Yes, establish the work of our hands.",
    });
  });

  it("should flag Psalm 91:1's own first line paragraph: true", () => {
    const chapterNinetyOneVerseOne = records.find((record) => record.chapter === 91 && record.verse === 1);
    expect(blockFlags(chapterNinetyOneVerseOne?.blocks ?? [])[0]).toEqual({
      text: "He who dwells in the secret place of the Most High",
      paragraph: true,
      break: true,
    });
  });
});

describe("segmentVerses — Psalm 41:11-42:2 (Finding 7's own \\ms1-adjacent shape: \\c 42 \\ms1 BOOK 2 \\d ... \\q1 \\v 1..., no \\b at all — the guard must survive \\ms1 too, not only \\c and the heading markers, or the bare \\q1 sitting behind all three still reaches back across the boundary)", () => {
  const records = segmentVerses(readFixture("psalm-41-11-42-2-ms1-d.usfm"), "PSA");

  it("should leave Psalm 41:13's own last block clean, with no break: true reach-back through \\ms1 and \\d from chapter 42's own bare \\q1", () => {
    // This fixture, like the project's own established convention for an
    // isolated mid-chapter extract (job-16-22-17-1-chapter-b.usfm's own
    // verse-22 lookup is the direct precedent), carries no leading \c 41
    // marker of its own, so verse 13 here lands under this walk's own
    // default chapter, 0 — matched by verse number alone, unambiguous
    // since this fixture has exactly one verse 13.
    const verseThirteen = records.find((record) => record.verse === 13);
    expect(last(blockFlags(verseThirteen?.blocks ?? []))).toEqual({
      text: "Amen and amen.",
    });
  });

  it("should still attach the \\d superscription as Psalm 42:1's own leading heading block, ahead of its own real first line, which itself carries paragraph: true — with the real \\ms1 book-division heading (blocks[0]) landing ahead of both, the identical stacking order the isolated psalm-42-opening.usfm fixture already establishes", () => {
    const chapterFortyTwoVerseOne = records.find((record) => record.chapter === 42 && record.verse === 1);
    const blocks = chapterFortyTwoVerseOne?.blocks ?? [];
    expect(blocks[0]?.headingContent).toMatchObject({ heading: expect.anything() });
    expect(blocks[1]?.headingContent).toMatchObject({
      subtitle: "For the Chief Musician. A contemplation by the sons of Korah.",
    });
    expect(blockFlags([blocks[2]])).toEqual([
      { text: "As the deer pants for the water brooks,", paragraph: true, break: true },
    ]);
  });
});

describe("segmentVerses — Psalm 1 into Psalm 2 (corrected by Finding 7: this chapter boundary gets the same clean-cut, chapter-paragraph-start convention as every other one, not the \"same rule, two sides\" cross-chapter reach this describe block used to assert)", () => {
  const records = segmentVerses(readFixture("psalm-1-2-boundary.usfm"), "PSA");

  // This block's own two tests used to assert the opposite of what's
  // below: that Psalm 2's own opening bare \q1 reaches backward across
  // the chapter boundary to retroactively mark Psalm 1:6's own last line
  // break: true, leaving Psalm 2:1 itself unflagged — cited against
  // bible-versions/ASV1901/19-PSA.json's own Psalm 22/23 boundary as
  // precedent. Checked directly against WEBUS2020's own real upstream
  // HEAD (git show HEAD:bible-versions/WEBUS2020/19-PSA.json), that
  // precedent turns out to describe the same bug this whole finding is
  // about, not the real convention: HEAD leaves Psalm 1:6 clean and gives
  // Psalm 2:1 paragraph: true, the identical shape as every other real
  // \b-less chapter boundary this phase measured (Deuteronomy 31:30→32:1,
  // Psalm 90:17→91:1, the four \ms1 book-division boundaries). ASV1901's
  // own already-shipped file was never reimported after Phase 5's or this
  // phase's own segmentVerses.ts fixes landed, so it still reflects the
  // old, unfixed behavior at its own analogous boundary — a real,
  // accepted staleness (ASV1901 reimport is out of scope for this
  // objective), not evidence for a second, real convention.
  it("should leave Psalm 1:6's own last block clean, with no break: true reach-back from Psalm 2's own opening \\q1 — matching WEBUS2020's own real upstream HEAD", () => {
    const blocks =
      records.find((record) => record.chapter === 1 && record.verse === 6)?.blocks ?? [];
    expect(last(blockFlags(blocks))).toEqual({
      text: "but the way of the wicked shall perish.",
    });
  });

  it("should flag Psalm 2:1's own block paragraph: true — the chapter boundary's own clean cut, not a reach-back that never fires", () => {
    const psalm2VerseOne = records.find((record) => record.chapter === 2 && record.verse === 1);
    expect(blockFlags(psalm2VerseOne?.blocks ?? [])).toEqual([
      { text: "Why do the nations rage,", paragraph: true },
    ]);
  });
});

describe("segmentVerses — Genesis 1:1 (Strong's attachment: the leading-space convention and the forward-merge default, verified against real dense \\w tagging)", () => {
  const records = segmentVerses(readFixture("genesis-1-2.usfm"), "GEN");

  it("should attach every joining space to the leading edge of the word after the gap, never trailing the word before it (the KJV1769 convention) — \"God\" also carries the real footnote its own \\f marker immediately follows, which does not disturb the spacing convention around it", () => {
    const verseOne = records.find((record) => record.chapter === 1 && record.verse === 1);
    expect(verseOne?.blocks[0].nodes).toEqual([
      { text: "In", strong: "H8064" },
      { text: " the", strong: "H1254" },
      { text: " beginning,", strong: "H7225" },
      {
        text: " God",
        strong: "H8064",
        foot: {
          // trn, not stu — footnoteTypeRules.ts classifies this template
          // as a translation-alternative note.
          type: "trn",
          content: ["The Hebrew word rendered “God” is “", { text: "אֱלֹהִ֑ים", script: "H" }, "” (Elohim)."],
        },
      },
      { text: " created", strong: "H1254" },
      { text: " the", strong: "H1254" },
      { text: " heavens", strong: "H8064" },
      { text: " and", strong: "H8064" },
      { text: " the", strong: "H1254" },
      { text: " earth.", strong: "H8064" },
    ]);
  });

  it("should attach the untagged connector comma to the trailing edge of \"beginning\", the strong-carrying node it ends, per convention #3 (tight punctuation trails backward, never leads forward like an ordinary connector word) — matching utils/auditNodes.ts's own \"leading punctuation glued to the wrong node\" check", () => {
    const verseOne = records.find((record) => record.chapter === 1 && record.verse === 1);
    const nodes = verseOne?.blocks[0].nodes ?? [];
    expect(nodes.some((node) => node.text === ",")).toBe(false);
    expect(nodes.find((node) => node.strong === "H7225")).toEqual({ text: " beginning,", strong: "H7225" });
    expect(nodes.find((node) => node.strong === "H8064" && node.text === " God")).toBeDefined();
  });
});

describe("segmentVerses — Genesis 1:1, the includeStrongs toggle (utils/importUsfm.ts's ImportOptions.strongs)", () => {
  it("should produce zero strong keys anywhere when includeStrongs is false, leaving the footnote attached", () => {
    const records = segmentVerses(readFixture("genesis-1-2.usfm"), "GEN", undefined, false);
    const verseOne = records.find((record) => record.chapter === 1 && record.verse === 1);
    const nodes = verseOne?.blocks[0].nodes ?? [];
    expect(nodes.some((node) => node.strong !== undefined)).toBe(false);
    expect(nodes.find((node) => node.foot !== undefined)?.foot).toEqual({
      // trn, not stu — footnoteTypeRules.ts classifies this template as a
      // translation-alternative note.
      type: "trn",
      content: ["The Hebrew word rendered “God” is “", { text: "אֱלֹהִ֑ים", script: "H" }, "” (Elohim)."],
    });
  });

  it("should merge the leading connector forward into the footnoted word and leave the trailing text as its own separate node — the real upstream Genesis 1:1 shape (two nodes), not three, once Strong's numbers (WEBUS2020's own real strongs: false) leave foot as the only thing marking \"God\" as a target", () => {
    const records = segmentVerses(readFixture("genesis-1-2.usfm"), "GEN", undefined, false);
    const verseOne = records.find((record) => record.chapter === 1 && record.verse === 1);
    expect(verseOne?.blocks[0].nodes).toEqual([
      {
        text: "In the beginning, God",
        foot: {
          // trn, not stu — footnoteTypeRules.ts classifies this template
          // as a translation-alternative note.
          type: "trn",
          content: ["The Hebrew word rendered “God” is “", { text: "אֱלֹהִ֑ים", script: "H" }, "” (Elohim)."],
        },
      },
      { text: " created the heavens and the earth." },
    ]);
  });

  it("should leave output byte-identical to today's default when includeStrongs is true or omitted", () => {
    const withDefault = segmentVerses(readFixture("genesis-1-2.usfm"), "GEN");
    const withExplicitTrue = segmentVerses(readFixture("genesis-1-2.usfm"), "GEN", undefined, true);
    expect(withExplicitTrue).toEqual(withDefault);

    const verseOne = withDefault.find((record) => record.chapter === 1 && record.verse === 1);
    expect(verseOne?.blocks[0].nodes).toEqual([
      { text: "In", strong: "H8064" },
      { text: " the", strong: "H1254" },
      { text: " beginning,", strong: "H7225" },
      {
        text: " God",
        strong: "H8064",
        foot: {
          // trn, not stu — footnoteTypeRules.ts classifies this template
          // as a translation-alternative note.
          type: "trn",
          content: ["The Hebrew word rendered “God” is “", { text: "אֱלֹהִ֑ים", script: "H" }, "” (Elohim)."],
        },
      },
      { text: " created", strong: "H1254" },
      { text: " the", strong: "H1254" },
      { text: " heavens", strong: "H8064" },
      { text: " and", strong: "H8064" },
      { text: " the", strong: "H1254" },
      { text: " earth.", strong: "H8064" },
    ]);
  });
});

describe("segmentVerses — Psalm 3:2 (\\qs Selah gets marks: [\"i\"], and a marks mismatch keeps it split from the plain text before it)", () => {
  const records = segmentVerses(readFixture("psalm-3.usfm"), "PSA");

  it("should tag \"Selah.\" with marks: [\"i\"] and no strong, as its own node — the marks mismatch against the plain text before it blocks the merge that would otherwise apply", () => {
    const verseTwo = records.find((record) => record.verse === 2);
    const secondLine = verseTwo?.blocks[1]?.nodes ?? [];
    expect(last(secondLine)).toEqual({ text: " Selah.", marks: ["i"] });
  });
});

describe("segmentVerses — John 14:16 (\\wj Words of Christ, a nested \\+w Strong's word inside it, a bare untagged connector, and a footnote splitting one \\wj utterance into two source spans)", () => {
  const records = segmentVerses(readFixture("john-14-16.usfm"), "JHN");

  it("should tag every word in both \\wj spans marks: [\"woc\"], including the \\+w-nested Strong's words, which also keep their own strong number", () => {
    const verseSixteen = records.find((record) => record.verse === 16);
    const nodes = verseSixteen?.blocks[0]?.nodes ?? [];
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((node) => node.marks?.includes("woc"))).toBe(true);
    expect(nodes.find((node) => node.text === " will")).toMatchObject({ strong: "G1510", marks: ["woc"] });
  });

  it("should attach the real footnote to \"Counselor,\" itself — the text run its own \\f marker immediately follows — rather than merging it away: the footnote gets a real, typed shape instead of being dropped", () => {
    const verseSixteen = records.find((record) => record.verse === 16);
    const nodes = verseSixteen?.blocks[0]?.nodes ?? [];
    const counselor = nodes.find((node) => node.text?.trim() === "Counselor,");
    expect(counselor).toMatchObject({ text: " Counselor, ", marks: ["woc"] });
    expect(counselor?.foot).toMatchObject({
      type: "trn",
      content: ["Greek ", { text: "παρακλητον", script: "G" }, ": Counselor, Helper, Intercessor, Advocate, and Comforter."],
    });
  });

  it("should still reunite the two \\wj spans into one continuous marks: [\"woc\"] run once the footnote's own space folds onto the next span's first word — the footnote now carries real content instead of being dropped, but the reunion mechanism is unchanged: the bare joining space between \\f* and the reopened \\wj has no marks of its own, so it folds forward onto \"that\" rather than reopening a gap", () => {
    const verseSixteen = records.find((record) => record.verse === 16);
    const nodes = verseSixteen?.blocks[0]?.nodes ?? [];
    expect(nodes.find((node) => node.text === " that")).toMatchObject({ strong: "G2443", marks: ["woc"] });
    expect(nodes.every((node) => node.marks?.includes("woc"))).toBe(true);
  });

  it("should exclude the footnote's own Greek gloss from the verse's plain rawContent, matching how other footnote asides are dropped", () => {
    const verseSixteen = records.find((record) => record.verse === 16);
    expect(verseSixteen?.rawContent).not.toContain("παρακλητον");
    expect(verseSixteen?.rawContent).toBe(
      "I will pray to the Father, and he will give you another Counselor, that he may be with you forever:",
    );
  });
});

describe("segmentVerses — Psalm 119:1-16 (the \\d ALEPH/\\d BETH acrostic boundary mid-stream)", () => {
  const records = segmentVerses(readFixture("psalm-119-aleph-beth.usfm"), "PSA");

  it("should emit verses 1 through 16, none dropped or duplicated", () => {
    expect(records.map((record) => record.verse)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
  });

  it("should exclude both \\d ALEPH and \\d BETH from every verse's own content", () => {
    expect(records.some((record) => record.rawContent.includes("ALEPH"))).toBe(false);
    expect(records.some((record) => record.rawContent.includes("BETH"))).toBe(false);
  });

  it("should not let \\d BETH's own heading text leak onto the end of verse 8, the verse immediately preceding it", () => {
    const verseEight = records.find((record) => record.verse === 8);
    expect(verseEight?.rawContent.endsWith("me.")).toBe(true);
  });
});

describe("segmentVerses — Acts 7:37 (a footnote and a cross-reference back to back, no text between them — both must survive, neither overwriting the other)", () => {
  const records = segmentVerses(readFixture("acts-7-37.usfm"), "ACT", new Set(["ACT", "DEU"]));

  it('should attach both the \\f\'s own trn footnote and the \\x\'s own xrf cross-reference, on two separate nodes, since one ContentObject can carry only one foot (the real WEBUS2020 shape that first exposed this: "brothers, like me." is followed immediately by \\f...\\f*\\x...\\x* with nothing between them)', () => {
    const verseThirtySeven = records.find((record) => record.verse === 37);
    const nodes = verseThirtySeven?.blocks.flatMap((block) => block.nodes ?? []) ?? [];
    const footed = nodes.filter((node) => node.foot !== undefined);
    expect(footed).toHaveLength(2);
    expect(footed[0].foot).toEqual({ type: "var", content: "TR adds \u201cYou shall listen to him.\u201d" });
    expect(footed[1]).toEqual({ foot: { type: "xrf", content: { bibleLink: "Deuteronomy 18:15" } } });
  });
});

describe("segmentVerses — 2 Kings 12:1-5 (a mid-verse cross-reference, attached to the connector text its own \\x marker immediately follows)", () => {
  const canon = new Set(["EXO", "2KG"]);
  const records = segmentVerses(readFixture("2-kings-12-1-5.usfm"), "2KG", canon);

  it("should emit verses 1 through 5, none dropped or duplicated", () => {
    expect(records.map((record) => record.verse)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should attach a real xrf footnote, resolved to Exodus 30:12, to the connector text \"evaluated,\" the \\x marker immediately follows in the real source", () => {
    const verseFour = records.find((record) => record.verse === 4);
    const nodes = verseFour?.blocks.flatMap((block) => block.nodes ?? []) ?? [];
    const footed = nodes.find((node) => node.foot !== undefined);
    expect(footed?.foot).toEqual({ type: "xrf", content: { bibleLink: "Exodus 30:12" } });
    expect(footed?.text?.trim().endsWith("evaluated,")).toBe(true);
  });

  it("should keep the \\xo locator and \\x's own caller symbol out of the verse's plain rawContent, joining the surrounding prose with a single space", () => {
    const verseFour = records.find((record) => record.verse === 4);
    expect(verseFour?.rawContent).not.toContain("12:4");
    expect(verseFour?.rawContent).not.toContain("Exodus");
    expect(verseFour?.rawContent).toContain("evaluated, and all the money");
  });
});

describe("segmentVerses — Psalm 3's own \\d superscription lands as a real subtitle on verse 1, before the paragraph content", () => {
  const records = segmentVerses(readFixture("psalm-3.usfm"), "PSA");

  it("should attach the subtitle as verse 1's own first block, ahead of the poetry content", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.blocks[0]).toEqual({
      text: "",
      headingContent: { subtitle: "A Psalm by David, when he fled from Absalom his son." },
    });
  });

  it("should still flag verse 1's own real content blocks break: true, unaffected by the subtitle now sitting ahead of them", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.blocks.slice(1).map((block) => ({ text: block.text, break: block.break }))).toEqual([
      { text: "Yahweh, how my adversaries have increased!", break: true },
      { text: "Many are those who rise up against me.", break: true },
    ]);
  });
});

describe("segmentVerses — Psalm 46's own \\d superscription carries a real, attached footnote", () => {
  const records = segmentVerses(readFixture("psalm-46-opening.usfm"), "PSA");

  it("should attach the footnote inside the subtitle's own content, not drop it", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.blocks[0]).toEqual({
      text: "",
      headingContent: {
        subtitle: {
          text: "For the Chief Musician. By the sons of Korah. According to Alamoth.",
          foot: { type: "stu", content: "Alamoth is a musical term." },
        },
      },
    });
  });
});

describe("segmentVerses — Psalm 119's acrostic \\d markers, including the two real \\w-tagging artifacts on \"HE\" and \"SIN AND SHIN\"", () => {
  it("should attach ALEPH as verse 1's own first block and BETH as verse 9's, with verse 8's own last real block still carrying break: true unaffected (matching the already-shipped WEBUS2020 corpus's own real shape)", () => {
    const records = segmentVerses(readFixture("psalm-119-aleph-beth.usfm"), "PSA");
    const verseOne = records.find((record) => record.verse === 1);
    const verseEight = records.find((record) => record.verse === 8);
    const verseNine = records.find((record) => record.verse === 9);

    expect(verseOne?.blocks[0]).toEqual({ text: "", headingContent: { heading: "ALEPH", type: "acrostic" } });
    expect(last(verseEight?.blocks ?? [])).toMatchObject({ text: "Don’t utterly forsake me.", break: true });
    expect(verseEight?.blocks.some((block) => block.headingContent !== undefined)).toBe(false);
    expect(verseNine?.blocks[0]).toEqual({ text: "", headingContent: { heading: "BETH", type: "acrostic" } });
  });

  it("should strip the stray \\w tag from \"HE\" and still classify it as an acrostic heading, not an ordinary subtitle", () => {
    const records = segmentVerses(readFixture("psalm-119-he.usfm"), "PSA");
    const verseThirtyThree = records.find((record) => record.verse === 33);
    expect(verseThirtyThree?.blocks[0]).toEqual({ text: "", headingContent: { heading: "HE", type: "acrostic" } });
  });

  it("should strip the stray \\w tag from the middle of \"SIN AND SHIN\" and still classify it as acrostic", () => {
    const records = segmentVerses(readFixture("psalm-119-sin-and-shin.usfm"), "PSA");
    const verseOneSixtyOne = records.find((record) => record.verse === 161);
    expect(verseOneSixtyOne?.blocks[0]).toEqual({
      text: "",
      headingContent: { heading: "SIN AND SHIN", type: "acrostic" },
    });
  });
});

describe("segmentVerses — Psalm 1's own \\ms1 BOOK 1 (no \\d superscription on this psalm) and Psalm 42's own BOOK 2 + \\d combination", () => {
  it("should attach the first book-division heading to Psalm 1:1, ahead of its own paragraph content, with the range computed from this run's own emitted chapter data", () => {
    const records = segmentVerses(readFixture("psalm-1-opening.usfm"), "PSA");
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.blocks[0]).toEqual({
      text: "",
      headingContent: { heading: [{ text: "Book One", marks: ["sc"] }, " (Psalms 1–1)"] },
    });
    // Finding 7: \c 1's own dispatch sets paragraph: true through \ms1
    // regardless of the heading in front of it — the real first content
    // block still carries it, matching WEBUS2020's own real upstream HEAD.
    expect(verseOne?.blocks[1]).toMatchObject({ paragraph: true });
  });

  it("should stack the book-division heading before the subtitle before the paragraph content, in that order, on Psalm 42:1", () => {
    const records = segmentVerses(readFixture("psalm-42-opening.usfm"), "PSA");
    const verseOne = records.find((record) => record.verse === 1);
    // Verse 1 has two poetry lines (\q1 + \q2), so the block list is
    // heading, heading, content, content.
    const kinds = verseOne?.blocks.map((block) => (block.headingContent === undefined ? "content" : "heading"));
    expect(kinds).toEqual(["heading", "heading", "content", "content"]);
    // This isolated fixture only sees the first (and only) \ms1 boundary,
    // so the ordinal is genuinely "Book One" here — a real full-Psalms run
    // produces "Book Two" for Psalm 42's actual position (see the
    // whole-corpus verify.ts check).
    expect(verseOne?.blocks[0].headingContent).toEqual({
      heading: [{ text: "Book One", marks: ["sc"] }, " (Psalms 42–42)"],
    });
    expect(verseOne?.blocks[1].headingContent).toEqual({
      subtitle: "For the Chief Musician. A contemplation by the sons of Korah.",
    });
    // Finding 7: the guard set by \c 42 must survive both \ms1 and \d to
    // still be standing when the bare \q1 behind them arrives — proven
    // here by the real first content block (blocks[2]) carrying
    // paragraph: true even in this isolated fixture, with nothing at all
    // preceding \c 42.
    expect(verseOne?.blocks[2]).toMatchObject({ paragraph: true });
  });
});

describe("segmentVerses — Song of Solomon's \\sp speaker labels, both across a verse boundary and mid-verse", () => {
  const records = segmentVerses(readFixture("song-of-solomon-1-1-5.usfm"), "SNG");

  it("should attach \"Beloved\" to verse 2's own first block, never to verse 1's own trailing block, even though the \\sp marker sits in verse 1's own token stream before the verse boundary (another real source's Song of Solomon 1:2 precedent shape)", () => {
    const verseOne = records.find((record) => record.verse === 1);
    const verseTwo = records.find((record) => record.verse === 2);
    expect(verseOne?.blocks.some((block) => block.headingContent !== undefined)).toBe(false);
    expect(verseTwo?.blocks[0]).toEqual({ text: "", headingContent: { heading: "Beloved" } });
  });

  it("should flag verse 1's own trailing block break: true, retroactively fixed up once the \\sp-forced flush and the following \\q1 both apply to it", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(last(verseOne?.blocks ?? [])).toMatchObject({
      text: "The Song of songs, which is Solomon’s.",
      break: true,
    });
  });

  it("should insert \"Friends\" and \"Beloved\" as their own mid-verse blocks inside verse 4, in source order, between the real text blocks that surround them", () => {
    const verseFour = records.find((record) => record.verse === 4);
    const kinds = verseFour?.blocks.map((block) =>
      block.headingContent !== undefined ? (block.headingContent as { heading?: unknown }).heading : block.text,
    );
    expect(kinds).toEqual([
      "Take me away with you.",
      "Let’s hurry.",
      "The king has brought me into his rooms.",
      "Friends",
      "We will be glad and rejoice in you.",
      "We will praise your love more than wine!",
      "Beloved",
      "They are right to love you.",
    ]);
  });
});

describe("segmentVerses — Numbers 21:14's \\bk/\\bk* book-title citation (Finding 6: tagged marks: [\"i\"] on each of its own real Strong's-tagged words, no longer dropped as plain text)", () => {
  it("should tag every one of the citation's own 7 \\+w-tagged words marks: [\"i\"] individually — each keeps its own Strong's number, since a marks mismatch against its plain-text neighbors on both sides stops any of them from coalescing into the surrounding text", () => {
    const records = segmentVerses(readFixture("numbers-21-14.usfm"), "NUM");
    const verse = records.find((record) => record.verse === 14);
    const nodes = verse?.blocks.flatMap((block) => block.nodes ?? []) ?? [];
    const marked = nodes.filter((node) => node.marks !== undefined);
    expect(marked).toEqual([
      { text: " The", strong: "H5921", marks: ["i"] },
      { text: " Book", strong: "H5612", marks: ["i"] },
      { text: " of", strong: "H3068", marks: ["i"] },
      { text: " the", strong: "H5921", marks: ["i"] },
      { text: " Wars", strong: "H4421", marks: ["i"] },
      { text: " of", strong: "H3068", marks: ["i"] },
      { text: " Yahweh", strong: "H3068", marks: ["i"] },
    ]);
    // Plain text immediately before and after the citation stays
    // unmarked and un-coalesced with it — the marks mismatch that already
    // keeps \qs's own Selah split from its neighbors (above) applies here
    // identically.
    const citationStart = nodes.indexOf(marked[0]);
    expect(nodes[citationStart - 1]).toEqual({ text: " in", strong: "H5921" });
    expect(nodes[citationStart + marked.length]).toMatchObject({ text: ", “Vaheb in" });
  });
});

describe("segmentVerses — Ezra 8:2's own \\li1 list items, flattened to paragraph like \\p/\\m/\\nb", () => {
  it("should split verse 2 into three separate paragraph-flagged blocks, one per \\li1 list item, instead of one run-on block", () => {
    const records = segmentVerses(readFixture("ezra-8-1-3-li1.usfm"), "EZR");
    const verseTwo = records.find((record) => record.verse === 2);
    // All three carry paragraph: true, including the first: the empty
    // \li1 right before \v 2 sets the pending flag, which carries across
    // the verse boundary the same way \p's pending flag does (Numbers
    // 13:4→13:5, above).
    expect(blockFlags(verseTwo?.blocks ?? [])).toEqual([
      { text: "Of the sons of Phinehas, Gershom.", paragraph: true },
      { text: "Of the sons of Ithamar, Daniel.", paragraph: true },
      { text: "Of the sons of David, Hattush.", paragraph: true },
    ]);
  });

  it("should carry the trailing \\li1's own paragraph flag across the verse boundary onto verse 3's first block, exactly as \\p already does", () => {
    const records = segmentVerses(readFixture("ezra-8-1-3-li1.usfm"), "EZR");
    const verseThree = records.find((record) => record.verse === 3);
    expect(blockFlags(verseThree?.blocks ?? [])[0]).toMatchObject({ paragraph: true });
  });
});

describe("segmentVerses — Ezra 4's own \\mi/\\pi1 letter-quoting markers, flattened to paragraph like \\p/\\m/\\nb", () => {
  const records = segmentVerses(readFixture("ezra-4-11-18-mi-pi1.usfm"), "EZR");

  it("should flag the block \\mi opens (\"To King Artaxerxes...\") paragraph: true", () => {
    const verseEleven = records.find((record) => record.verse === 11);
    expect(last(blockFlags(verseEleven?.blocks ?? []))).toMatchObject({ paragraph: true });
  });

  it("should flag verse 12's own first block paragraph: true from the \\pi1 immediately before it", () => {
    const verseTwelve = records.find((record) => record.verse === 12);
    expect(blockFlags(verseTwelve?.blocks ?? [])[0]).toMatchObject({ paragraph: true });
  });
});

// ---------------------------------------------------------------------------
// Deuterocanon fixtures — every fixture below is real, verbatim
// `imports/webus2020/ebible-usfm/{47-BAR,66-DAG,43-ESG,53-2MA,56-PS2,41-TOB,
// 46-SIR}eng-web.usfm` text.
// ---------------------------------------------------------------------------

describe("segmentVerses — \\s1 (Baruch 6, a chapter-start pericope heading with nothing accumulated yet)", () => {
  it("should attach \\s1's own text as verse 1's own first block, ahead of the paragraph content — the identical chapter-start mechanism already proven for a Psalm superscription", () => {
    const records = segmentVerses(readFixture("baruch-6-s1.usfm"), "BAR");
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.blocks[0]).toEqual({ text: "", headingContent: { heading: "The Letter of Jeremy (Jeremiah)" } });
    expect(verseOne?.blocks[1]).toMatchObject({
      text: "A copy of a letter that Jeremy sent to those who were to be led captives into Babylon by the king of the Babylonians, to give them the message that God commanded him.",
      paragraph: true,
    });
  });
});

describe("segmentVerses — \\s1 (Daniel 3:23/24, mid-chapter, with an embedded footnote in the \\s1 span itself)", () => {
  // The footnote's own trailing "...inserted between Daniel 3:23 and Daniel
  // 3:24..." also links both references independently — a real, unrelated
  // side effect of Finding 9's redesigned scan (Phase 15), which finds any
  // fully-qualified reference in a footnote body regardless of what word
  // (if any) sits next to it. This test's own real point is still \+bk's
  // marks: ["i"] tagging (Finding 6); the two bibleLink nodes below are the
  // fixture's own real, current shape, not this test's own subject.
  it("should insert the heading between verse 23 and verse 24, with the embedded \\f...\\f* footnote (including its own 3 \\+bk citations, each tagged marks: [\"i\"] per Finding 6) attached to the heading's own text — the same embedded-footnote mechanism a Psalm superscription already proves, exercised for the first time on a non-Psalm \\s1", () => {
    const records = segmentVerses(readFixture("daniel-3-23-24-s1.usfm"), "DAG");
    const verseTwentyThree = records.find((record) => record.verse === 23);
    const verseTwentyFour = records.find((record) => record.verse === 24);

    expect(verseTwentyThree?.blocks.some((block) => block.headingContent !== undefined)).toBe(false);
    expect(verseTwentyFour?.blocks[0]).toEqual({
      text: "",
      headingContent: {
        heading: {
          text: "THE SONG OF THE THREE HOLY CHILDREN",
          foot: {
            type: "var",
            content: [
              { text: "The Song of the Three Holy Children", marks: ["i"] },
              " is an addition to ",
              { text: "Daniel", marks: ["i"] },
              " found in the Greek Septuagint but not found in the traditional Hebrew text of ",
              { text: "Daniel", marks: ["i"] },
              ". This portion is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches. It is found inserted between ",
              { bibleLink: "Daniel 3:23" },
              " and ",
              { bibleLink: "Daniel 3:24" },
              " of the traditional Hebrew Bible. Here, the verses after 23 from the Hebrew Bible are numbered starting at 91 to make room for these verses.",
            ],
          },
        },
      },
    });
    expect(verseTwentyFour?.blocks[1]).toMatchObject({
      text: "They walked in the midst of the fire, praising God, and blessing the Lord.",
      paragraph: true,
    });
  });
});

describe("segmentVerses — \\s1 (Daniel 3:90/91, mid-chapter, no embedded footnote of its own)", () => {
  it("should insert the heading between verse 90 and verse 91, verse 91's own separate footnote landing on its own content, never on the heading", () => {
    const records = segmentVerses(readFixture("daniel-3-90-91-s1.usfm"), "DAG");
    const verseNinety = records.find((record) => record.verse === 90);
    const verseNinetyOne = records.find((record) => record.verse === 91);

    expect(verseNinety?.blocks.some((block) => block.headingContent !== undefined)).toBe(false);
    expect(verseNinetyOne?.blocks[0]).toEqual({ text: "", headingContent: { heading: "Deliverance from the Furnace" } });
    expect(verseNinetyOne?.blocks[1]).toMatchObject({ paragraph: true });
  });
});

describe("segmentVerses — \\s1 (Daniel 13 and 14, chapter-start pericope headings — plain text, each book's own real chapter-1-of-the-pericope footnote landing on the verse content that follows, never on the heading)", () => {
  it("should attach \"THE HISTORY OF SUSANNA\" to Daniel 13's own verse 1", () => {
    const records = segmentVerses(readFixture("daniel-13-s1-opening.usfm"), "DAG");
    const chapterThirteenVerseOne = records.find((record) => record.chapter === 13 && record.verse === 1);
    expect(chapterThirteenVerseOne?.blocks[0]).toEqual({ text: "", headingContent: { heading: "THE HISTORY OF SUSANNA" } });
    expect(chapterThirteenVerseOne?.blocks[1]).toMatchObject({ paragraph: true });
  });

  it("should tag all 4 of the verse-1 footnote's own real \\+bk citations marks: [\"i\"] (Finding 6), on the verse content's own footnote, not the heading (Daniel 13:1)", () => {
    const records = segmentVerses(readFixture("daniel-13-s1-opening.usfm"), "DAG");
    const chapterThirteenVerseOne = records.find((record) => record.chapter === 13 && record.verse === 1);
    const foot = chapterThirteenVerseOne?.blocks[1]?.nodes?.[0]?.foot;
    expect(foot?.content).toContainEqual({ text: "The History of Susanna", marks: ["i"] });
    expect(foot?.content).toContainEqual({ text: "Daniel", marks: ["i"] });
  });

  it("should attach \"Bel and the Dragon\" to Daniel 14's own verse 1", () => {
    const records = segmentVerses(readFixture("daniel-14-s1-opening.usfm"), "DAG");
    const chapterFourteenVerseOne = records.find((record) => record.chapter === 14 && record.verse === 1);
    expect(chapterFourteenVerseOne?.blocks[0]).toEqual({ text: "", headingContent: { heading: "Bel and the Dragon" } });
    expect(chapterFourteenVerseOne?.blocks[1]).toMatchObject({ paragraph: true });
  });

  it("should tag all 4 of the verse-1 footnote's own real \\+bk citations marks: [\"i\"] (Finding 6), on the verse content's own footnote, not the heading (Daniel 14:1)", () => {
    const records = segmentVerses(readFixture("daniel-14-s1-opening.usfm"), "DAG");
    const chapterFourteenVerseOne = records.find((record) => record.chapter === 14 && record.verse === 1);
    const foot = chapterFourteenVerseOne?.blocks[1]?.nodes?.[0]?.foot;
    expect(foot?.content).toContainEqual({ text: "Bel and the Dragon", marks: ["i"] });
    expect(foot?.content).toContainEqual({ text: "Daniel", marks: ["i"] });
  });
});

describe("segmentVerses — \\pc (2 Maccabees 1:18-19, a decorative divider sandwiched between two real \\b stanza breaks, mid-verse-boundary, with real text on both sides — the one real live bug this construct's own chrome-drop fixes)", () => {
  it("should drop the dash-divider's own text entirely, leaking into neither verse 18 nor verse 19, and should drop break: true from verse 18's own last line entirely (the first \\b) rather than keep it — the second \\b (after the dropped \\pc text) is a harmless no-op, since nothing accumulated for it to close, and \\p already guarantees verse 19's own paragraph: true independent of either \\b", () => {
    const records = segmentVerses(readFixture("2-maccabees-1-16-19-pc.usfm"), "2MA");
    const verseEighteen = records.find((record) => record.verse === 18);
    const verseNineteen = records.find((record) => record.verse === 19);

    expect(blockFlags(verseEighteen?.blocks ?? [])).toEqual([
      {
        text: "even as he promised through the law—in God have we hope, that he will soon have mercy upon us, and gather us together out of everywhere under heaven into his holy place; for he delivered us out of great evils, and purified the place.",
      },
    ]);
    expect(verseNineteen?.blocks[0]).toMatchObject({
      text: "Now the things concerning Judas Maccabaeus and his brothers, the purification of the greatest temple, the dedication of the altar,",
      paragraph: true,
    });
  });
});

describe("segmentVerses — \\cp/\\d (Psalm 151's own front matter — \\cp sits before any \\v, already structurally harmless; \\d's own embedded footnote lands the same way a Psalm superscription's already does)", () => {
  it("should drop \\cp's own text entirely and attach the \\d superscription (with its embedded footnote) as verse 1's own first real heading block", () => {
    const records = segmentVerses(readFixture("psalm-151-opening.usfm"), "PS2");
    const verseOne = records.find((record) => record.verse === 1);
    const headingBlocks = verseOne?.blocks.filter((block) => block.headingContent !== undefined) ?? [];

    expect(verseOne?.blocks.every((block) => !(block.text ?? "").includes("151"))).toBe(true);
    const subtitleBlock = headingBlocks.find(
      (block) => block.headingContent !== undefined && "subtitle" in (block.headingContent as object),
    );
    expect(subtitleBlock?.headingContent).toEqual({
      subtitle: [
        {
          text: "This Psalm is a genuine one of David, though extra,",
          foot: { type: "trn", content: "or, supernumerary" },
        },
        " composed when he fought in single combat with Goliath.",
      ],
    });
  });

  it("should tag this fixture's own real \\ip block's single \\bk citation marks: [\"i\"] (Finding 6, Psalm 151's own \"Psalm 151\" self-citation)", () => {
    const records = segmentVerses(readFixture("psalm-151-opening.usfm"), "PS2");
    const verseOne = records.find((record) => record.verse === 1);
    const introBlock = verseOne?.blocks.find(
      (block) => block.text === "" && block.headingContent === undefined && block.nodes?.[0]?.foot !== undefined,
    );
    expect(introBlock?.nodes?.[0].foot?.content).toEqual([
      { text: "Psalm 151", marks: ["i"] },
      " is recognized as Deuterocanonical Scripture by the Greek Orthodox and Russian Orthodox Churches.",
    ]);
  });
});

describe("segmentVerses — \\ip (every \\ip block becomes a footnote on a textless leading node, attached to the book's own verse 1:1)", () => {
  it("should attach Tobit's own single \\ip block (one embedded \\bk citation, tagged marks: [\"i\"] per Finding 6) as a textless leading node ahead of verse 1's own real content, carrying the verse's own paragraph: true along with it", () => {
    const records = segmentVerses(readFixture("tobit-opening-ip.usfm"), "TOB");
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.blocks[0]).toEqual({
      text: "",
      paragraph: true,
      nodes: [
        {
          foot: {
            type: "stu",
            content: [
              { text: "Tobit", marks: ["i"] },
              " is recognized as Deuterocanonical Scripture by the Roman Catholic, Greek Orthodox, and Russian Orthodox Churches.",
            ],
          },
        },
      ],
    });
    expect(verseOne?.blocks[1]?.paragraph).toBeUndefined();
  });

  it("should keep both of an \\ip block's own two embedded \\bk citations, each tagged marks: [\"i\"], and classify the real, Septuagint-naming body var, not every \\ip is stu (Baruch)", () => {
    const records = segmentVerses(readFixture("baruch-opening-ip.usfm"), "BAR");
    const verseOne = records.find((record) => record.verse === 1);
    const introNode = (verseOne?.blocks[0]?.nodes ?? [])[0];
    expect(introNode?.foot?.type).toBe("var");
    expect(introNode?.foot?.content).toContainEqual({ text: "The Letter of Jeremiah", marks: ["i"] });
    expect(introNode?.foot?.content).toContainEqual({ text: "Baruch", marks: ["i"] });
  });

  /** Textless leading `\ip` blocks: `text: ""`, a single foot-only node, never a `headingContent` block — distinct from an ordinary textless-leading-footnote content block a real `\p`-opened verse can independently carry (Esther-Greek 1:1's own real double-`\fl` note is exactly such a case, and must not be mistaken for one of these). */
  function introFootnoteBlocks(blocks: readonly VerseBlock[]): VerseBlock[] {
    return blocks.filter(
      (block) => block.text === "" && block.headingContent === undefined && block.nodes?.[0]?.foot !== undefined,
    );
  }

  it("should attach Esther-Greek's own two \\ip blocks as two separate textless leading nodes, in source order, not one merged block — \\is1 contributing nothing, and never confused with the real, ordinary footnote-leading content block Esther-Greek 1:1's own real double-\\fl note independently produces", () => {
    const records = segmentVerses(readFixture("esther-greek-opening.usfm"), "ESG");
    const verseOne = records.find((record) => record.verse === 1);
    const introBlocks = introFootnoteBlocks(verseOne?.blocks ?? []);

    expect(introBlocks).toHaveLength(2);
    expect(introBlocks[0].nodes?.[0].foot?.content).toContain("5 additions");
    expect(introBlocks[1].nodes?.[0].foot?.content).toContain("KJV versification");
    expect(verseOne?.blocks[0]).toBe(introBlocks[0]);
    expect(verseOne?.blocks[1]).toBe(introBlocks[1]);
  });

  it("should move verse 1's own paragraph: true onto only the first of Esther-Greek's two \\ip blocks, never the second, and off the real \\p-opened block it originally sat on", () => {
    const records = segmentVerses(readFixture("esther-greek-opening.usfm"), "ESG");
    const verseOne = records.find((record) => record.verse === 1);

    expect(verseOne?.blocks[0]?.paragraph).toBe(true);
    expect(verseOne?.blocks[1]?.paragraph).toBeUndefined();
    expect(verseOne?.blocks[2]?.paragraph).toBeUndefined();
  });

  it("should attach Sirach's own two \\ip blocks — the modern editorial blurb and the real, ancient Prologue alike — as two separate textless leading nodes in source order, with nothing lost to chrome for either one, ahead of the real poetry content that follows", () => {
    const records = segmentVerses(readFixture("sirach-opening-ip.usfm"), "SIR");
    const verseOne = records.find((record) => record.verse === 1);
    const introBlocks = introFootnoteBlocks(verseOne?.blocks ?? []);

    expect(introBlocks).toHaveLength(2);
    // The first block's own two \bk citations (Finding 6) are each tagged
    // marks: ["i"], so its foot.content is an array now, not a bare
    // string — the second block (the real, ancient Prologue) carries no
    // \bk citation at all and keeps its own plain-string shape unchanged.
    expect(introBlocks[0].nodes?.[0].foot?.content).toContainEqual({
      text: "The Wisdom of Jesus the Son of Sirach",
      marks: ["i"],
    });
    expect(introBlocks[0].nodes?.[0].foot?.content).toContainEqual({ text: "Ecclesiasticus", marks: ["i"] });
    expect(introBlocks[1].nodes?.[0].foot?.content).toContain("WHEREAS many and great things");
    expect(verseOne?.blocks[0]).toBe(introBlocks[0]);
    expect(verseOne?.blocks[1]).toBe(introBlocks[1]);
    expect(verseOne?.blocks[2]).toMatchObject({ text: "All wisdom comes from the Lord," });
  });

  it("should move verse 1's own paragraph: true (from the \\b stanza break ahead of \\q1 \\v 1) onto the first of Sirach's two \\ip blocks, never the second, and off the real poetry content it originally sat on", () => {
    const records = segmentVerses(readFixture("sirach-opening-ip.usfm"), "SIR");
    const verseOne = records.find((record) => record.verse === 1);

    expect(verseOne?.blocks[0]?.paragraph).toBe(true);
    expect(verseOne?.blocks[1]?.paragraph).toBeUndefined();
    expect(verseOne?.blocks[2]?.paragraph).toBeUndefined();
  });
});

describe("segmentVerses — already-established mechanisms need no change for the deuterocanon corpus (Daniel 4's own real \\pi1/\\q3 fixture)", () => {
  it("should flag every \\pi1-opened block paragraph: true, including the one carrying across the verse 1→2 boundary, exactly as Ezra's own \\pi1 already does", () => {
    const records = segmentVerses(readFixture("daniel-4-pi1-q3.usfm"), "DAG");
    const verseOne = records.find((record) => record.verse === 1);
    const verseTwo = records.find((record) => record.verse === 2);

    expect(blockFlags(verseOne?.blocks ?? [])).toEqual([
      { text: "Nebuchadnezzar the king,", paragraph: true },
      { text: "to all the peoples, nations, and languages, who dwell in all the earth:", paragraph: true },
      { text: "Peace be multiplied to you.", paragraph: true },
    ]);
    expect(blockFlags(verseTwo?.blocks ?? [])[0]).toMatchObject({ paragraph: true });
  });

  it("should flag every \\q3-ended block break: true exactly like \\q1/\\q2 already do — this corpus's own first real \\q3 exercise (canonical scope is 100% \\q3-free)", () => {
    const records = segmentVerses(readFixture("daniel-4-pi1-q3.usfm"), "DAG");
    const verseThree = records.find((record) => record.verse === 3);
    expect(blockFlags(verseThree?.blocks ?? [])).toEqual([
      { text: "How great are his signs!", break: true },
      { text: "How mighty are his wonders!", break: true },
      { text: "His kingdom is an everlasting kingdom.", break: true },
      { text: "His dominion is from generation to generation.", break: undefined },
    ]);
  });
});

/**
 * Real fixtures from two additional sources (ASV1901, MSB2025), locking in
 * behavior beyond WEB's corpus: the `\add`/`\qc` constructs neither WEB nor
 * earlier fixtures exercise, and confirmation that already-established
 * rules (poetry breaks, paragraph markers, no synthesized small-caps) hold
 * on these sources' real text too.
 */
/**
 * ASV1901's `\qc` (Psalm 119's acrostic letter heading, on a different
 * marker than `\d`) is dispatched the same way `\d`/`\sp`/`\s1` already
 * are, producing a standalone `{heading: [...], type: "acrostic"}` block —
 * `splitScriptRuns` separates the real Hebrew glyph from its trailing
 * transliterated name and period, matching another real source's own
 * already-shipped shape for a source that really prints the glyph.
 */
describe("segmentVerses — ASV1901's real \\qc (Psalm 119's acrostic letter heading, on a different marker than \\d)", () => {
  it("should attach a real {heading: [...], type: \"acrostic\"} block for \\qc's own \"א ALEPH.\" ahead of verse 1's own paragraph content, splitting the Hebrew letter from its transliterated name", () => {
    const records = segmentVerses(readFixture("asv1901-psalm-119-aleph.usfm"), "PSA");
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.blocks[0]).toEqual({
      text: "",
      headingContent: { heading: [{ text: "א", script: "H" }, " ALEPH."], type: "acrostic" },
    });
  });
});

/**
 * The same `\qc` dispatch also covers the mid-corpus case (BETH onward,
 * where `started` is already `true`), reusing `\d`/`\sp`/`\s1`'s
 * `pendingHeadingBlocks` attach-to-what-comes-next mechanism rather than a
 * second, parallel fix. `asv1901-psalm-119-beth.usfm` (verses 7-9, real,
 * verbatim) proves it: verse 8's last block still ends cleanly at
 * "utterly." with `break: true`, and verse 9's first block is the BETH
 * heading.
 */
describe("segmentVerses — ASV1901's real \\qc, the mid-corpus case (Psalm 119:7-9, the BETH transition)", () => {
  const records = segmentVerses(readFixture("asv1901-psalm-119-beth.usfm"), "PSA");

  it("should leave verse 8's own last block ending cleanly at \"utterly.\" with break: true, never carrying BETH's own heading text", () => {
    const verseEight = records.find((record) => record.verse === 8);
    expect(last(verseEight?.blocks ?? [])).toMatchObject({ text: "Oh forsake me not utterly.", break: true });
    expect(verseEight?.rawContent).not.toContain("BETH");
  });

  it("should attach the BETH heading as verse 9's own first block, never verse 8's", () => {
    const verseNine = records.find((record) => record.verse === 9);
    expect(verseNine?.blocks[0]).toEqual({
      text: "",
      headingContent: { heading: [{ text: "ב", script: "H" }, " BETH."], type: "acrostic" },
    });
  });
});

/**
 * ASV1901's real `\add` (translator-supplied words, USFM's standard
 * italics convention) mirrors `\qs`'s own `insideQs`/`marks: ["i"]` shape
 * exactly — `imports/kjv/kjvContent.ts:195`'s own already-shipped
 * `add: "i"` mapping for KJV1769's HTML-sourced equivalent construct is
 * the cross-version confirmation this mapping is correct USFM/repo
 * convention.
 */
describe("segmentVerses — ASV1901's real \\add (translator-supplied words), a construct WEB's own corpus never carries", () => {
  it('should tag "and" with marks: ["i"] and no strong, as its own node, from Genesis 1:11\'s real \\add span — left/right neighbors (", " and the connector-merged "fruit-trees bearing") stay split from it, the same marks-mismatch rule that already keeps \\qs\'s own Selah split from its neighbors', () => {
    const records = segmentVerses(readFixture("asv1901-genesis-1-11.usfm"), "GEN");
    const verseEleven = records.find((record) => record.verse === 11);
    const nodes = verseEleven?.blocks[0]?.nodes ?? [];
    const addIndex = nodes.findIndex((node) => "marks" in node && node.marks?.includes("i"));
    expect(nodes[addIndex]).toEqual({ text: "and", marks: ["i"] });
    expect(nodes[addIndex - 1]).toEqual({ text: ", " });
    expect(nodes[addIndex + 1]).toMatchObject({ text: " fruit-trees bearing", strong: "H6213" });
  });

  it('should tag "the" with marks: ["i"] and no strong from 2 Peter 1:1\'s real \\add span, sitting directly between two \\w-tagged words with no plain prose to lean on — the joining space on each side folds onto its own leading edge as usual, but the marks mismatch still keeps it split from both "and" and "Saviour"', () => {
    const records = segmentVerses(readFixture("asv1901-2peter-1-1.usfm"), "2PE");
    const verseOne = records.find((record) => record.verse === 1);
    const nodes = verseOne?.blocks[0]?.nodes ?? [];
    const addIndex = nodes.findIndex((node) => "marks" in node && node.marks?.includes("i"));
    expect(nodes[addIndex]).toEqual({ text: " the", marks: ["i"] });
    expect(nodes[addIndex - 1]).toMatchObject({ text: " and", strong: "G2532" });
    expect(nodes[addIndex + 1]).toMatchObject({ text: " Saviour", strong: "G4990" });
  });
});

describe("segmentVerses — MSB2025's real \"LORD\" (Genesis 2:4) — GREEN, locking: no marks: [\"sc\"] is ever synthesized from plain source text", () => {
  it('should render "LORD" as plain text with its own strong number and no marks at all, per guide.md §6\'s casing-uniformity rule ("a source that hard-codes a whole phrase in full capitals with no size-variation anywhere in it is very likely trying to represent \'print this in plain full capitals,\' not \'print this in small caps\'") — MSB2025 carries zero \\nd/\\sc markup anywhere in its own source, so this needs no code change: `InlineMarkName` (`"woc" | "i"`) has no "sc" member at all, and segmentVerses/inlineMarks.ts never synthesizes one from source content', () => {
    const records = segmentVerses(readFixture("msb2025-genesis-2-4-lord.usfm"), "GEN");
    const verseFour = records.find((record) => record.verse === 4);
    const nodes = verseFour?.blocks.flatMap((block) => block.nodes ?? []) ?? [];
    const lordNode = nodes.find((node) => node.text?.trim() === "LORD");
    expect(lordNode).toMatchObject({ strong: "H3068" });
    expect(lordNode?.marks).toBeUndefined();
    expect(nodes.every((node) => node.marks === undefined)).toBe(true);
  });
});

describe("segmentVerses — MSB2025's real Genesis 1:1-5 — GREEN, locking: \\m immediately before every single \\v already produces paragraph: true on every verse's own first block, the existing marker-type rule applied to a corpus where \\m is not rare but exclusive", () => {
  const records = segmentVerses(readFixture("msb2025-genesis-1-1-5.usfm"), "GEN");

  it("should flag every one of verses 1-5's own first block paragraph: true — PARAGRAPH_MARKER_NAMES already includes \"m\" (added for WEB's own 80 rare instances), and this corpus's own real shape (bare \\m before every \\v, zero \\p anywhere) needs no new rule, only this explicit, named confirmation", () => {
    for (let verse = 1; verse <= 5; verse++) {
      const record = records.find((r) => r.verse === verse);
      expect(record?.blocks[0]).toMatchObject({ paragraph: true });
    }
  });

  it("should carry no \\p-family marker anywhere in this corpus's own real shape — zero \\p, confirmed directly against the fixture, not merely assumed", () => {
    // A structural fact about this fixture, and the whole 66-book MSB2025
    // canon: every verse here has exactly one block, since nothing besides
    // \m ever opens or breaks a line.
    expect(records.every((record) => record.blocks.length === 1)).toBe(true);
  });
});

describe("segmentVerses — ASV1901's real Job 4:8-12 poetry (\\q1 lines, a real \\b stanza break, then \\q2) — GREEN, locking: the upstream-confirmed two-part \\b rule produces correct output for this source's own real poetry density too, not just WEB's own", () => {
  const records = segmentVerses(readFixture("asv1901-job-4-8-12.usfm"), "JOB");

  it("should flag both of verse 9's own lines break: true, with no paragraph flag anywhere — no \\b sits near verse 9, so its own \\q1/\\q2 lines behave exactly like ordinary poetry line-wraps always have", () => {
    const verseNine = records.find((record) => record.verse === 9);
    expect(blockFlags(verseNine?.blocks ?? [])).toEqual([
      { text: "By the breath of God they perish,", break: true },
      { text: "And by the blast of his anger are they consumed.", break: true },
    ]);
  });

  it("should drop break: true from verse 11's own last line entirely, and absorb the bare \\q2 that immediately follows the real \\b — the second line of verse 11 was a genuine stanza gap, not an ordinary line-wrap, so it carries no flag at all rather than break: true", () => {
    const verseEleven = records.find((record) => record.verse === 11);
    expect(blockFlags(verseEleven?.blocks ?? [])).toEqual([
      { text: "The old lion perisheth for lack of prey,", break: true },
      { text: "And the whelps of the lioness are scattered abroad." },
    ]);
  });

  it("should flag verse 12's own first line paragraph: true from the \\b, in addition to its own ordinary break: true from the trailing \\q1 that follows it (not from the bare \\q2 right after \\b, already absorbed rather than spent as a reach-back), and leave its second, fixture-final line unflagged since nothing follows it here", () => {
    const verseTwelve = records.find((record) => record.verse === 12);
    expect(blockFlags(verseTwelve?.blocks ?? [])).toEqual([
      { text: "Now a thing was secretly brought to me,", paragraph: true, break: true },
      { text: "And mine ear received a whisper thereof.", paragraph: undefined, break: undefined },
    ]);
  });
});

describe("segmentVerses — MSB2025's real Acts 8:37 (\\v 37 with nothing at all after it — no text, no footnote, unlike WEB's own disputed-verse shape)", () => {
  // See `flush()`'s doc comment for why WEB never hits `blocks.length === 0`
  // here (Luke 17:36/Acts 8:37/15:34/24:7 fall back to a footnote-only
  // block there). MSB2025 carries no \f/\x anywhere in its corpus, so its
  // Acts 8:37 — `\v 37` followed by nothing but whitespace — has no
  // footnote to fall back on either: one of exactly 4 traditionally-
  // disputed verses this "majority text" edition marks empty rather than
  // supplying a reading or footnote.
  const records = segmentVerses(readFixture("msb2025-acts-8-37.usfm"), "ACT");

  it("should emit no verse record at all for verse 37 — guide.md's own already-established rule for \"omitted textual variants\" (\"Emit no verse record at all\"), the correct behavior for a verse whose real USFM content is nothing, not an empty stand-in block", () => {
    expect(records.find((record) => record.verse === 37)).toBeUndefined();
  });

  it("should still emit real records for verses 36 and 38, the ones immediately surrounding the omitted verse, unaffected by its own absence", () => {
    const verseThirtySix = records.find((record) => record.verse === 36);
    const verseThirtyEight = records.find((record) => record.verse === 38);
    expect(verseThirtySix?.blocks[0]).toMatchObject({ paragraph: true });
    expect(verseThirtySix?.blocks[0].text).toMatch(/^As they traveled/);
    expect(verseThirtyEight?.blocks[0]).toMatchObject({ paragraph: true });
    expect(verseThirtyEight?.blocks[0].text).toMatch(/^And Philip gave orders/);
  });
});

/**
 * `normalizeFractionText` (`utils/usfm/fractions.ts`) is wired into this
 * file's own per-token `text` handling too (the same fix already proven
 * from the footnote side in `footnotes.test.ts`), so a raw fraction
 * converts regardless of which of the two real ingestion points first
 * reads it. WEBUS2020 carries no real instance of either shape below —
 * every real fraction it has sits inside a footnote — so both fixtures
 * here are constructed rather than drawn from `readFixture()`;
 * `fixtures.ts`'s own "never hand-typed" rule protects a real-corpus
 * extract from drifting from its source, which doesn't apply to a shape
 * the corpus never carries in the first place.
 */
describe("segmentVerses — fraction normalization reaches ordinary verse text too (synthetic — no real WEBUS2020 instance outside a footnote)", () => {
  const records = segmentVerses("\\v 1 It was about 2/3 of a bushel.", "GEN");

  it("should normalize a genuine ASCII fraction in ordinary verse prose, not only inside a footnote", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.rawContent).toBe(`It was about ${uniformFraction("2", "3")} of a bushel.`);
    expect(verseOne?.blocks[0]?.text).toBe(`It was about ${uniformFraction("2", "3")} of a bushel.`);
  });
});

describe("segmentVerses — fraction normalization reaches the empty-verse fallback too (synthetic — mirrors the real Luke 17:36 footnote-only shape above, with a fraction added)", () => {
  const records = segmentVerses('\\v 1 \\f + \\fr 1:1 \\ft It was about 2/3 of a bushel.\\f*', "GEN");

  it("should normalize the fraction in rawContent's own empty-verse fallback, proving plainText (not just the footnote's displayed content) reaches this path already normalized", () => {
    const verseOne = records.find((record) => record.verse === 1);
    expect(verseOne?.rawContent).toBe(`It was about ${uniformFraction("2", "3")} of a bushel.`);
  });
});
