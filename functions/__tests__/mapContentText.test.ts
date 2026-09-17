import { describe, expect, it } from "vitest";
import { mapContentNodes, mapContentText } from "../mapContentText";
import Content, { ContentObject } from "../../types/Content";

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
      mapContentText(
        [{ content: ["A", { text: "hello" }], strong: "H3968" }],
        shout,
      ),
    ).toEqual({
      content: [{ content: ["A", { text: "HELLO" }], strong: "H3968" }],
      changed: true,
    });
  });

  it("should rewrite text nested inside a footnote's own content", () => {
    expect(
      mapContentText(
        [{ text: "WORD", foot: { type: "stu", content: "hello" } }],
        shout,
      ),
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

/**
 * A node-level transform in the same spirit as {@link shout}: stamp a `lemma`
 * on any node carrying text, and report "unchanged" otherwise. Adding a key is
 * the thing a leaf-level text map cannot do, so this exercises the difference
 * between the two walkers rather than restating {@link mapContentText}'s tests.
 */
const stamp = (node: ContentObject): ContentObject | undefined =>
  typeof node.text === "string" && node.lemma === undefined
    ? { ...node, lemma: node.text.trim() }
    : undefined;

describe("mapContentNodes — recursion into every content-bearing branch", () => {
  it("should hand over a node so a transform can add a key to it", () => {
    expect(mapContentNodes([{ text: "λόγος" }], stamp)).toEqual({
      content: [{ text: "λόγος", lemma: "λόγος" }],
      changed: true,
    });
  });

  it("should reach a node nested inside a heading, a subtitle, a wrapper and a footnote", () => {
    const fixture: Content = [
      { heading: [{ text: "one" }] },
      { subtitle: [{ text: "two" }] },
      { content: [{ text: "three" }], strong: "G1" },
      { text: "four", foot: { type: "stu", content: [{ text: "five" }] } },
    ];
    expect(mapContentNodes(fixture, stamp)).toEqual({
      content: [
        { heading: [{ text: "one", lemma: "one" }] },
        { subtitle: [{ text: "two", lemma: "two" }] },
        { content: [{ text: "three", lemma: "three" }], strong: "G1" },
        {
          text: "four",
          lemma: "four",
          foot: { type: "stu", content: [{ text: "five", lemma: "five" }] },
        },
      ],
      changed: true,
    });
  });

  it("should not walk into a bibleLink node's own display-content override", () => {
    expect(
      mapContentNodes(
        [{ bibleLink: "John 3:16", content: [{ text: "here" }] }],
        stamp,
      ),
    ).toEqual({
      content: [{ bibleLink: "John 3:16", content: [{ text: "here" }] }],
      changed: false,
    });
  });

  it("should leave a bare string in a content array alone", () => {
    expect(mapContentNodes(["and ", { text: "word" }], stamp)).toEqual({
      content: ["and ", { text: "word", lemma: "word" }],
      changed: true,
    });
  });

  it("should let a transform remove a key it should not be carrying", () => {
    const strip = (node: ContentObject): ContentObject | undefined => {
      if (node.text !== undefined || node.lemma === undefined) return undefined;
      const { lemma: _lemma, ...rest } = node;
      return rest;
    };
    expect(mapContentNodes([{ lemma: "orphan", strong: "G1" }], strip)).toEqual(
      {
        content: [{ strong: "G1" }],
        changed: true,
      },
    );
  });

  it("should hand the transform a node whose children have already been rewritten", () => {
    // The walk settles a node's children first, so a transform that spreads the
    // node it is given keeps their rewrites rather than discarding them.
    const seen: unknown[] = [];
    const watch = (node: ContentObject): ContentObject | undefined => {
      if (node.foot) seen.push(node.foot);
      return stamp(node);
    };
    mapContentNodes(
      [{ text: "outer", foot: { type: "stu", content: [{ text: "inner" }] } }],
      watch,
    );
    expect(seen).toEqual([
      { type: "stu", content: [{ text: "inner", lemma: "inner" }] },
    ]);
  });
});

describe("mapContentNodes — reference semantics", () => {
  it("should return the original reference and changed: false when nothing needs rewriting", () => {
    const fixture: Content = [{ text: "word", lemma: "word" }, "plain"];
    const result = mapContentNodes(fixture, stamp);
    expect(result.content).toBe(fixture);
    expect(result.changed).toBe(false);
  });

  it("should return a new reference and changed: true when something changes", () => {
    const fixture: Content = [{ text: "word" }];
    const result = mapContentNodes(fixture, stamp);
    expect(result.content).not.toBe(fixture);
    expect(result.changed).toBe(true);
  });

  it("should accept plain string content", () => {
    expect(mapContentNodes("just a string", stamp)).toEqual({
      content: "just a string",
      changed: false,
    });
  });
});
