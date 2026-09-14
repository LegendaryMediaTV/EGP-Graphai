import { describe, expect, it } from "vitest";
import Content from "../../types/Content";
import { mergeSplitVerseListsInContent } from "../fixSplitVerseLists";

/**
 * Every fixture below is a real corpus shape, cited by version and verse where
 * one exists — the convention `fixBibleLinkDisplayProse.test.ts` and
 * `references.test.ts` already established. The few invented ones say so, and
 * exist only for shapes the merge has to refuse that nothing on disk happens to
 * spell out.
 */

describe("mergeSplitVerseListsInContent — folding a split verse list", () => {
  it("should fold a trailing bare verse into the link before it (ASV1901 Genesis 46:13)", () => {
    const result = mergeSplitVerseListsInContent([
      "See ",
      { bibleLink: "Numbers 26:23", content: "Num. 26:23" },
      ", ",
      { bibleLink: "Numbers 26:24", content: "24" },
      ".",
    ]);
    expect(result).toEqual({
      content: ["See ", { bibleLink: "Numbers 26:23, 24", content: "Num. 26:23, 24" }, "."],
      changed: true,
    });
  });

  it("should fold a whole run in one pass, however many verses it names (ASV1901 1 Samuel 17:8)", () => {
    const result = mergeSplitVerseListsInContent([
      { bibleLink: "1 Samuel 17:10", content: "10" },
      ", ",
      { bibleLink: "1 Samuel 17:21", content: "21" },
      ", ",
      { bibleLink: "1 Samuel 17:22", content: "22" },
      ", ",
      { bibleLink: "1 Samuel 17:26", content: "26" },
    ]);
    expect(result).toEqual({
      content: { bibleLink: "1 Samuel 17:10, 21, 22, 26", content: "10, 21, 22, 26" },
      changed: true,
    });
  });

  it("should keep a display override that spells the chapter the target repeats (ASV1901 Ruth 3:11)", () => {
    const result = mergeSplitVerseListsInContent([
      { bibleLink: "Ruth 4:1", content: "4:1" },
      ", ",
      { bibleLink: "Ruth 4:11", content: "11" },
    ]);
    expect(result).toEqual({ content: { bibleLink: "Ruth 4:1, 11", content: "4:1, 11" }, changed: true });
  });

  it("should reach a link inside a footnote body rather than only the verse's own top level (ASV1901 Exodus 7:9)", () => {
    const result = mergeSplitVerseListsInContent([
      "the ",
      {
        text: "rod",
        foot: {
          type: "stu",
          content: [
            "Compare ",
            { bibleLink: "Exodus 7:10", content: "10" },
            ", ",
            { bibleLink: "Exodus 7:12", content: "12" },
          ],
        },
      },
    ]);
    expect(result).toEqual({
      content: [
        "the ",
        {
          text: "rod",
          foot: { type: "stu", content: ["Compare ", { bibleLink: "Exodus 7:10, 12", content: "10, 12" }] },
        },
      ],
      changed: true,
    });
  });

  it("should keep a range intact on either side of the comma (a real single-verse-plus-range shape)", () => {
    const result = mergeSplitVerseListsInContent([
      { bibleLink: "1 Peter 3:1", content: "1 Pet. 3:1" },
      ", ",
      { bibleLink: "1 Peter 3:5–6", content: "5, 6" },
    ]);
    expect(result).toEqual({
      content: { bibleLink: "1 Peter 3:1, 5–6", content: "1 Pet. 3:1, 5, 6" },
      changed: true,
    });
  });

  it("should absorb a sub-verse letter into the display and leave it out of the target (a real sub-verse-letter shape)", () => {
    const result = mergeSplitVerseListsInContent([
      { bibleLink: "Leviticus 1:13", content: "Lev 1:13b" },
      ", ",
      { bibleLink: "Leviticus 1:17", content: "17b" },
    ]);
    expect(result).toEqual({
      content: { bibleLink: "Leviticus 1:13, 17", content: "Lev 1:13b, 17b" },
      changed: true,
    });
  });

  it("should keep a version's own comma spacing in the display while the target takes the standard one (a real unspaced-list shape)", () => {
    const result = mergeSplitVerseListsInContent([
      { bibleLink: "Genesis 5:1", content: "Gn 5:1" },
      ",",
      { bibleLink: "Genesis 5:3", content: "3" },
    ]);
    expect(result).toEqual({ content: { bibleLink: "Genesis 5:1, 3", content: "Gn 5:1,3" }, changed: true });
  });

  it("should accept a `{text}`-only separator the same as the bare string it is equivalent to (an invented shape, for the equivalence the schema already states)", () => {
    const result = mergeSplitVerseListsInContent([
      { bibleLink: "Isaiah 2:10", content: "Is 2:10" },
      { text: ", " },
      { bibleLink: "Isaiah 2:19", content: "19" },
    ]);
    expect(result).toEqual({ content: { bibleLink: "Isaiah 2:10, 19", content: "Is 2:10, 19" }, changed: true });
  });
});

describe("mergeSplitVerseListsInContent — the display a merge rewrites", () => {
  it("should drop the repeated book name where the second link had no display override of its own (MSB2025 Genesis 15:6)", () => {
    const result = mergeSplitVerseListsInContent([
      "Cited in ",
      { bibleLink: "Romans 4:3" },
      ", ",
      { bibleLink: "Romans 4:22" },
      ", and ",
      { bibleLink: "James 2:23" },
    ]);
    expect(result).toEqual({
      content: ["Cited in ", { bibleLink: "Romans 4:3, 22" }, ", and ", { bibleLink: "James 2:23" }],
      changed: true,
    });
  });

  it("should drop the whole override when the merged display would only restate the merged target (YLT1898 2 John 1:1)", () => {
    const result = mergeSplitVerseListsInContent([
      "see ",
      { bibleLink: "1 Peter 5:1" },
      ", ",
      { bibleLink: "1 Peter 5:5" },
      "; ",
      { bibleLink: "Acts 15:2" },
    ]);
    expect(result).toEqual({
      content: ["see ", { bibleLink: "1 Peter 5:1, 5" }, "; ", { bibleLink: "Acts 15:2" }],
      changed: true,
    });
  });
});

describe("mergeSplitVerseListsInContent — what it declines to merge", () => {
  it("should leave a sentence that names two places alone, however it is punctuated (ASV1901 Matthew 23:14)", () => {
    const content: Content = [
      "Some authorities insert here, or after ",
      { bibleLink: "Matthew 23:12", content: "verse 12" },
      ", ",
      { bibleLink: "Matthew 23:14", content: "verse 14" },
      " the following.",
    ];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave two chapters of one book as two links (MSB2025 Exodus 20:12)", () => {
    const content: Content = [{ bibleLink: "Matthew 15:4" }, ", ", { bibleLink: "Matthew 19:19" }];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave two books as two links (an invented shape, for the book check itself)", () => {
    const content: Content = [
      { bibleLink: "Genesis 10:1–5", content: "1–5" },
      ", ",
      { bibleLink: "1 Chronicles 1:5–7", content: "1 Chr. 1:5–7" },
    ];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave links a semicolon separates alone, the punctuation that means a second citation (ASV1901 Matthew 23:14)", () => {
    const content: Content = [
      { bibleLink: "Mark 12:40", content: "Mk. 12:40" },
      "; ",
      { bibleLink: "Luke 20:47", content: "Lk. 20:47" },
    ];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave links a whole clause separates alone (an invented shape, for the separator check itself)", () => {
    const content: Content = [
      { bibleLink: "Genesis 16:16", content: "Gen. 16:16" },
      "), so Ishmael was fourteen when Isaac was born. Isaac was weaned (",
      { bibleLink: "Genesis 16:8", content: "Gen. 16:8" },
    ];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a chapter-only reference alone, since a comma after one lists chapters rather than verses (an invented shape, for the chapter-list rule itself)", () => {
    const content: Content = [{ bibleLink: "Habakkuk 1", content: "Hab 1" }, ", ", { bibleLink: "Habakkuk 2", content: "2" }];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a cross-chapter range alone rather than appending a verse to an endpoint pair (an invented shape, for the target grammar itself)", () => {
    const content: Content = [
      { bibleLink: "2 Kings 6:31–7:20", content: "6:31–7:20" },
      ", ",
      { bibleLink: "2 Kings 6:33", content: "33" },
    ];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a comma that also anchors a footnote alone, since folding it would lose the anchor (an invented shape, for the separator check itself)", () => {
    const content: Content = [
      { bibleLink: "Isaiah 2:10", content: "Is 2:10" },
      { text: ", ", foot: { type: "stu", content: "A note." } },
      { bibleLink: "Isaiah 2:19", content: "19" },
    ];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should leave a formatted comma alone, since the merged link could not carry its mark (an invented shape, for the separator check itself)", () => {
    const content: Content = [
      { bibleLink: "Isaiah 2:10", content: "Is 2:10" },
      { text: ", ", marks: ["i"] },
      { bibleLink: "Isaiah 2:19", content: "19" },
    ];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should return the original reference untouched when a tree holds no split list at all (ASV1901 Genesis 46:13)", () => {
    const content: Content = ["In ", { bibleLink: "1 Chronicles 7:1", content: "1 Chr. 7:1" }, ", see the note."];
    const result = mergeSplitVerseListsInContent(content);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });
});

describe("mergeSplitVerseListsInContent — the shape of what it leaves behind", () => {
  it("should collapse a body its own merge emptied down to the bare link (ASV1901 Numbers 4:3)", () => {
    const result = mergeSplitVerseListsInContent([
      { bibleLink: "Numbers 4:35", content: "35" },
      ", ",
      { bibleLink: "Numbers 4:39", content: "39" },
      ", ",
      { bibleLink: "Numbers 4:43", content: "43" },
    ]);
    expect(result).toEqual({ content: { bibleLink: "Numbers 4:35, 39, 43", content: "35, 39, 43" }, changed: true });
  });

  it("should leave a one-element array that arrived that way as an array (an invented shape, for the collapse rule itself)", () => {
    const content: Content = [{ bibleLink: "Numbers 4:35", content: "35" }];
    expect(mergeSplitVerseListsInContent(content)).toEqual({ content, changed: false });
  });

  it("should be a fixed point of itself, so a second pass over its own output changes nothing (ASV1901 Genesis 46:13)", () => {
    const once = mergeSplitVerseListsInContent([
      { bibleLink: "Numbers 26:23", content: "Num. 26:23" },
      ", ",
      { bibleLink: "Numbers 26:24", content: "24" },
    ]);
    expect(once.changed).toBe(true);
    const twice = mergeSplitVerseListsInContent(once.content);
    expect(twice).toEqual({ content: once.content, changed: false });
  });

  it("should merge inside a heading the same way it does inside a footnote (an invented shape, for the heading recursion itself)", () => {
    const result = mergeSplitVerseListsInContent({
      heading: ["A Psalm of David, ", { bibleLink: "Psalm 3:1" }, ", ", { bibleLink: "Psalm 3:2" }],
    });
    expect(result).toEqual({
      content: { heading: ["A Psalm of David, ", { bibleLink: "Psalm 3:1, 2" }] },
      changed: true,
    });
  });
});
