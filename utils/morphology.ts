/**
 * Read a morphology code back into the registry's own parse vocabulary.
 *
 * The map stores what is known about a form as category-tagged codes, and a
 * morphology code is one rendering of that. Reading the rendering back is how a
 * corpus can be checked against the map that ought to explain it: decode the
 * token's code, look the spelling up, and ask whether any cell says the same
 * thing. That check is what makes the map's claim testable rather than asserted,
 * and it is what would have caught a cell deleted by mistake.
 *
 * The grammar comes from the scheme file itself (`morphology/robinson.json`),
 * not from a table written here, so a change there carries through and this
 * cannot drift out of step with it.
 */

import fs from "fs";
import path from "path";

/** A morphology scheme as its own file describes it. */
interface Scheme {
  _id: string;
  delimiter?: string;
  heads: Record<string, { pos: string; slots: string[][] }>;
  slots: Record<string, SlotSpec>;
  qualifiers?: Record<string, string>;
  tokens: Record<string, Record<string, string>>;
}

interface SlotSpec {
  prefix?: Record<string, string>;
  fields?: string[];
  variants?: { length: number; fields: string[] }[];
}

/** Read one language's morphology scheme by id, or null when there is none. */
export function readScheme(language: string, id: string): Scheme | null {
  const file = path.join("./lexical-maps", language, "morphology", `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Scheme;
}

/**
 * Decode one code into the parse codes it states.
 *
 * @returns The registry codes, or null when the scheme cannot read the code at
 *   all. A code it reads only partly returns what it could read, because a
 *   partial answer still tests most of what the map claims.
 */
export function decodeMorph(code: string, scheme: Scheme): string[] | null {
  const delimiter = scheme.delimiter ?? "-";
  const parts = code.split(delimiter);
  const head = scheme.heads[parts[0]];
  if (!head) return null;

  const out = [head.pos];
  const qualifiers = scheme.qualifiers ?? {};
  // Trailing qualifiers first, so what remains is positional. Read from the end
  // because that is where the scheme puts them, and a qualifier is a whole part.
  const groups: string[] = [];
  for (const part of parts.slice(1)) {
    if (qualifiers[part]) out.push(qualifiers[part]);
    else groups.push(part);
  }

  head.slots.forEach((alternatives, position) => {
    const group = groups[position];
    if (group === undefined) return;
    for (const name of alternatives) {
      const read = readSlot(group, scheme.slots[name], scheme);
      if (read) {
        out.push(...read);
        return;
      }
    }
  });

  return out.length > 1 || head.slots.length === 0 ? out : out;
}

/** Read one positional group against one slot's own spec. */
function readSlot(group: string, spec: SlotSpec | undefined, scheme: Scheme): string[] | null {
  if (!spec) return null;
  let rest = group;
  const out: string[] = [];

  // A prefix the slot declares, such as Robinson's `2` for a second formation.
  for (const [char, meaning] of Object.entries(spec.prefix ?? {})) {
    if (rest.startsWith(char)) {
      out.push(meaning);
      rest = rest.slice(char.length);
    }
  }

  // A slot whose whole group is one token, which is how declinability works:
  // the group is `PRI`, not one character per field.
  const wholeGroup = Object.entries(scheme.tokens).find(([, table]) => table[rest] !== undefined);
  const fields = spec.fields ?? spec.variants?.find((v) => v.length === rest.length)?.fields;
  if (!fields) {
    return wholeGroup ? [...out, scheme.tokens[wholeGroup[0]][rest]] : null;
  }
  if (rest.length !== fields.length) {
    return wholeGroup ? [...out, scheme.tokens[wholeGroup[0]][rest]] : null;
  }

  for (let i = 0; i < fields.length; i++) {
    const table = scheme.tokens[fields[i]];
    const meaning = table?.[rest[i]];
    if (!meaning) return null;
    out.push(meaning);
  }
  return out;
}

/**
 * Whether a decoded token parse is one the map's cell accounts for.
 *
 * Two ways it can be. Either the cell says the same thing, compared by
 * category so a cell stating more is still an account of a code stating less.
 *
 * Or the cell says the word does not inflect and the code names a case. That is
 * narrowing, not disagreement, and both sides are right: the map records what
 * the word is, apart from any sentence, and an indeclinable has no case
 * marking at all. A corpus can then narrow it from context, and the same word
 * legitimately reads `N-PRI` in a corpus that did not and `N-GSM` in one that
 * did. Rejecting the second would be rejecting the map's own purpose, which is
 * to say what a form could be so that something else can say which it is.
 */
export function accountsFor(cell: string[], token: string[], categoryOf: Map<string, string>): boolean {
  const indeclinable = cell.some((code) => code.startsWith("indecl"));
  const openCategories = new Set(indeclinable ? ["case", "number", "gender", "declinability"] : []);

  for (const code of token) {
    const category = categoryOf.get(code);
    if (!category) {
      if (!cell.includes(code)) return false;
      continue;
    }
    if (openCategories.has(category)) continue;
    const mine = cell.find((c) => categoryOf.get(c) === category);
    if (mine === undefined) continue; // the cell leaves this open, which the token may fill
    if (mine !== code) return false;
  }
  return true;
}
