import { describe, expect, it } from "vitest";
import { buildCrossReferenceContent } from "../references";
import { Token, tokenize } from "../tokenize";

/**
 * Finding 8b (a Psalms cross-reference targets the canonical singular
 * "Psalm", never the source's own plural "Psalms") and Finding 8c (a verse
 * list inside a target gets the space its own comma is missing), checked
 * against two byte-exact WEBUS2020 fixtures upstream HEAD's committed
 * content already backs: Matthew 4:6's `\xt Psalms 91:11-12` and Matthew
 * 5:4's `\xt Isaiah 61:2; 66:10,13` (the second target, a bare "C:V"
 * continuation, inherits "Isaiah" from the first — `addSpaceAfterVerseListComma`'s
 * own doc comment in `../references.ts` names this exact pair as its
 * worked example).
 *
 * Targeted regression check calling the production function
 * `buildCrossReferenceContent` directly — not a corpus-wide sweep. The
 * whole-corpus counts this file used to measure (88 Finding 8b instances,
 * 13 Finding 8c instances) are dropped along with the corpus read.
 */

/** Finds the first `\x`...`\x*` span in `raw` and builds its cross-reference content, mirroring `footnotes.test.ts`'s own `footnoteFrom` shape for `\f`. */
function crossReferenceFrom(raw: string): ReturnType<typeof buildCrossReferenceContent> {
  const tokens: Token[] = tokenize(raw);
  const openIndex = tokens.findIndex((token) => token.type === "open" && token.name === "x");
  if (openIndex === -1) throw new Error(`crossReferenceFrom: no \\x open token found in: ${raw}`);
  return buildCrossReferenceContent(tokens, openIndex + 1);
}

describe("bibleLink target conventions — Finding 8b/8c, checked against real WEBUS2020 fixtures", () => {
  it("should resolve the two named fixtures exactly as upstream WEBUS2020's own committed HEAD does (Matthew 4:6 and Matthew 5:4, modulo the dash character, a separate later post-write convention this module never applies)", () => {
    const matthew46 = crossReferenceFrom("\\x + \\xo 4:6 \\xt Psalms 91:11-12 \\x*");
    expect(matthew46.footnote.content).toEqual({ bibleLink: "Psalm 91:11-12", content: "Psalms 91:11-12" });

    const matthew54 = crossReferenceFrom("\\x + \\xo 5:4 \\xt Isaiah 61:2; 66:10,13\\x*");
    expect(matthew54.footnote.content).toEqual([
      { bibleLink: "Isaiah 61:2" },
      "; ",
      { bibleLink: "Isaiah 66:10, 13", content: "66:10,13" },
    ]);
  });
});
