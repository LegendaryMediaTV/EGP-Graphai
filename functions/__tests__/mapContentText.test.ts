import { describe, expect, it } from "vitest";
import { mapContentText } from "../mapContentText";
import Content from "../../types/Content";

/**
 * A transform to exercise the walker's own traversal, independent of any
 * real convention: uppercase any leaf whose text isn't already fully
 * uppercase, and report "unchanged" (`undefined`) otherwise. This makes
 * "was this leaf visited and rewritten" trivially observable per test,
 * without pulling in a real string-level convention like
 * `normalizeFractionText`/`normalizeEllipsisText`.
 */
const shout = (text: string): string | undefined =>
  text === text.toUpperCase() ? undefined : text.toUpperCase();

describe("mapContentText — recursion into every content-bearing branch", () => {
  it("should rewrite a node's own text", () => {
    expect(mapContentText([{ text: "hello" }], shout)).toEqual({
      content: [{ text: "HELLO" }],
      changed: true,
    });
  });

  it("should rewrite a bare string array element", () => {
    expect(mapContentText(["hello", "world"], shout)).toEqual({
      content: ["HELLO", "WORLD"],
      changed: true,
    });
  });

  it("should rewrite text nested inside a heading", () => {
    expect(mapContentText([{ heading: [{ text: "hello" }] }], shout)).toEqual({
      content: [{ heading: [{ text: "HELLO" }] }],
      changed: true,
    });
  });

  it("should rewrite text nested inside a subtitle", () => {
    expect(mapContentText([{ subtitle: [{ text: "hello" }] }], shout)).toEqual({
      content: [{ subtitle: [{ text: "HELLO" }] }],
      changed: true,
    });
  });

  it("should rewrite text nested inside a ContentNested wrapper's own content", () => {
    expect(
      mapContentText([{ content: ["A", { text: "hello" }], strong: "H3968" }], shout),
    ).toEqual({
      content: [{ content: ["A", { text: "HELLO" }], strong: "H3968" }],
      changed: true,
    });
  });

  it("should rewrite text nested inside a footnote's own content", () => {
    expect(
      mapContentText([{ text: "WORD", foot: { type: "stu", content: "hello" } }], shout),
    ).toEqual({
      content: [{ text: "WORD", foot: { type: "stu", content: "HELLO" } }],
      changed: true,
    });
  });

  it("should rewrite text nested two levels deep, inside a footnote nested in a footnote", () => {
    expect(
      mapContentText(
        {
          text: "WORD",
          foot: {
            type: "stu",
            content: {
              text: "NOTE",
              foot: { type: "xrf", content: "hello" },
            },
          },
        },
        shout,
      ),
    ).toEqual({
      content: {
        text: "WORD",
        foot: {
          type: "stu",
          content: {
            text: "NOTE",
            foot: { type: "xrf", content: "HELLO" },
          },
        },
      },
      changed: true,
    });
  });
});

describe("mapContentText — the bibleLink exclusion", () => {
  it("should not walk into a bibleLink node's own display-content override", () => {
    expect(
      mapContentText([{ bibleLink: "John 3:16", content: "hello" }], shout),
    ).toEqual({
      content: [{ bibleLink: "John 3:16", content: "hello" }],
      changed: false,
    });
  });

  it("should never visit a bibleLink node's own target string", () => {
    // "john 3:16" is lowercase, so `shout` would rewrite it on sight if the
    // walker ever reached it — it must not, since a bibleLink target isn't
    // reached by any branch this walker follows.
    expect(mapContentText([{ bibleLink: "john 3:16" }], shout)).toEqual({
      content: [{ bibleLink: "john 3:16" }],
      changed: false,
    });
  });
});

describe("mapContentText — reference semantics", () => {
  it("should return the original array reference and changed: false when nothing needs rewriting", () => {
    const fixture: Content = [{ text: "ALREADY UPPER" }, "ALSO UPPER"];
    const result = mapContentText(fixture, shout);
    expect(result.content).toBe(fixture);
    expect(result.changed).toBe(false);
  });

  it("should return a new reference and changed: true when something changes", () => {
    const fixture: Content = [{ text: "hello" }];
    const result = mapContentText(fixture, shout);
    expect(result.content).not.toBe(fixture);
    expect(result.changed).toBe(true);
  });

  it("should accept plain string content", () => {
    expect(mapContentText("ALREADY UPPER", shout)).toEqual({
      content: "ALREADY UPPER",
      changed: false,
    });
  });
});

describe("mapContentText — a transform that changes nothing", () => {
  it("should leave the tree untouched when the transform returns undefined for every input", () => {
    const noop = (): string | undefined => undefined;
    const fixture: Content = [{ text: "hello" }, "world", { heading: "Title" }];
    expect(mapContentText(fixture, noop)).toEqual({
      content: fixture,
      changed: false,
    });
  });
});

describe("mapContentText — multiple independent rewrites", () => {
  it("should rewrite every offending leaf in an array independently when there's more than one", () => {
    expect(
      mapContentText([{ text: "hello" }, "PLAIN", { text: "world" }], shout),
    ).toEqual({
      content: [{ text: "HELLO" }, "PLAIN", { text: "WORLD" }],
      changed: true,
    });
  });
});
