import { describe, expect, it } from "vitest";
import { hasMixedScriptText, tagScriptRunsInContent } from "../tagScriptRunsInContent";

describe("hasMixedScriptText", () => {
  it("should be true for a string mixing a Latin letter with a Hebrew word — real WEBUS2020 Numbers 15:38 shape", () => {
    expect(hasMixedScriptText("or, tassels (Hebrew צִיצִ֛ת)")).toBe(true);
  });

  it("should be true for a string mixing a Latin letter with a Greek word — real YLT1898 Revelation 13:18 shape", () => {
    expect(hasMixedScriptText("in letters, viz., χξς, i.e. 600")).toBe(true);
  });

  it("should be false for an all-Greek string with no Latin letter at all — the shape BYZ2026's own ordinary Greek verse text carries", () => {
    expect(hasMixedScriptText("εἵνεκεν")).toBe(false);
  });

  it("should be false for ordinary Latin prose with no non-Latin character at all", () => {
    expect(hasMixedScriptText("A cubit is about 18 inches.")).toBe(false);
  });
});

describe("tagScriptRunsInContent — splitting a bare string", () => {
  it("should split a bare string's Hebrew run into its own {text, script} node — real WEBUS2020 Numbers 15:38 foot.content", () => {
    const content = "or, tassels (Hebrew צִיצִ֛ת)";

    const { content: result, changed, skipped } = tagScriptRunsInContent(content);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual(["or, tassels (Hebrew ", { text: "צִיצִ֛ת", script: "H" }, ")"]);
  });

  it("should split a Greek run out of a plain array element — real YLT1898 Revelation 13:18 foot.content shape", () => {
    const content = [
      "The Greek here (as in ",
      { bibleLink: "Revelation 7:4–17", content: "7. 4–18" },
      ") gives the number not in words but in letters, viz., χξς, i.e. 600.",
    ];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      "The Greek here (as in ",
      { bibleLink: "Revelation 7:4–17", content: "7. 4–18" },
      ") gives the number not in words but in letters, viz., ",
      { text: "χξς", script: "G" },
      ", i.e. 600.",
    ]);
  });

  it("should split a {text}-only object's mixed-script text the same way as a bare string", () => {
    const content = { text: "the word אמת means truth" };

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual(["the word ", { text: "אמת", script: "H" }, " means truth"]);
  });

  it("should split both a Hebrew and a Greek run out of the same string, in source order", () => {
    const content = "Hebrew אמת and Greek λόγος both appear here";

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      "Hebrew ",
      { text: "אמת", script: "H" },
      " and Greek ",
      { text: "λόγος", script: "G" },
      " both appear here",
    ]);
  });
});

describe("tagScriptRunsInContent — nodes needing no action", () => {
  it("should leave a node that already carries script untouched — real WEBUS2020 Psalm 3:2 shape", () => {
    const content = ["The Hebrew word rendered “God” is “", { text: "אֱלֹהִ֑ים", script: "H" }, "” (Elohim)."];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual([]);
    expect(result).toBe(content);
  });

  it("should leave an all-Greek string with no Latin mixed in untouched, matching BYZ2026's own ordinary verse text", () => {
    const content = ["εἵνεκεν ἕνεκεν"];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual([]);
    expect(result).toBe(content);
  });

  it("should leave ordinary Latin-only prose untouched", () => {
    const content = ["A cubit is about 18 inches."];

    const { content: result, changed } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(false);
    expect(result).toBe(content);
  });
});

describe("tagScriptRunsInContent — decline", () => {
  it("should decline a mixed-script node carrying strong, reporting the reason and leaving it untouched", () => {
    const content = [{ text: "the word אמת (truth)", strong: "H571" }];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual(["strong"]);
    expect(result).toBe(content);
  });

  it("should decline a mixed-script node carrying foot, reporting the reason and leaving it untouched", () => {
    const content = [{ text: "the word אמת (truth)", foot: { type: "stu", content: "a note" } }];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual(["foot"]);
    expect(result).toBe(content);
  });

  it("should decline a mixed-script node carrying marks, reporting the reason and leaving it untouched", () => {
    const content = [{ text: "the word אמת (truth)", marks: ["i"] }];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual(["marks"]);
    expect(result).toBe(content);
  });

  it("should never even consider a bibleLink node's own display content a split candidate — it is display text tied to a reference target, not a text leaf this transform reaches, matching mapContentText's identical exclusion", () => {
    const content = [{ bibleLink: "Numbers 15:38", content: "the word אמת (truth)" }];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(false);
    expect(skipped).toEqual([]);
    expect(result).toBe(content);
  });
});

describe("tagScriptRunsInContent — recursion", () => {
  it("should descend into a footnote body's own content and split a mixed-script run found there", () => {
    const content = [
      {
        text: "make themselves fringes",
        foot: { type: "trn", content: "or, tassels (Hebrew צִיצִ֛ת)" },
      },
    ];

    const { content: result, changed, skipped } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(true);
    expect(skipped).toEqual([]);
    expect(result).toEqual([
      {
        text: "make themselves fringes",
        foot: { type: "trn", content: ["or, tassels (Hebrew ", { text: "צִיצִ֛ת", script: "H" }, ")"] },
      },
    ]);
  });

  it("should descend into a heading's own content", () => {
    const content = { heading: "the word אמת means truth" };

    const { content: result, changed } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      heading: ["the word ", { text: "אמת", script: "H" }, " means truth"],
    });
  });

  it("should descend into a subtitle's own content", () => {
    const content = { subtitle: "the word אמת means truth" };

    const { content: result, changed } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual({
      subtitle: ["the word ", { text: "אמת", script: "H" }, " means truth"],
    });
  });

  it("should descend into a ContentNested wrapper's own content", () => {
    const content = [{ content: ["the word אמת means truth"], strong: "H571" }];

    const { content: result, changed } = tagScriptRunsInContent(content as never);

    expect(changed).toBe(true);
    expect(result).toEqual([
      { content: ["the word ", { text: "אמת", script: "H" }, " means truth"], strong: "H571" },
    ]);
  });
});
