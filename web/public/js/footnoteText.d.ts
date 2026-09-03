import type Content from "../../../types/Content";
import type { Abbreviation } from "../../../types/Version";

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
 * `abbreviations` is the version's own registry, keyed by id, so an
 * `{ abbr }` node reads as its display name rather than dropping out of the
 * tooltip. Omitted at call sites with no version in scope, where an
 * abbreviation falls back to its bare id.
 *
 * @returns The joined display text, or `""` if none can be derived
 */
export function getFootnoteText(
  content: Content | null | undefined,
  abbreviations?: ReadonlyMap<string, Abbreviation> | null
): string;
