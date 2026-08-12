import type Content from "../../../types/Content";

/**
 * Type declaration for the plain, unbundled `footnoteText.js` (not compiled
 * through `allowJs`) — without it, `__tests__/footnoteText.test.ts`'s direct
 * import of that script has no type information at all (TS7016 under
 * `strict`).
 *
 * `content` is this repo's own `Content` type (see `types/Content.ts`),
 * matching the real call site (`node.foot.content` in `ContentNode.js`),
 * plus `null`/`undefined` for the two cases the implementation explicitly
 * guards and returns `""` for.
 *
 * @returns The joined display text, or `""` if none can be derived
 */
export function getFootnoteText(content: Content | null | undefined): string;
