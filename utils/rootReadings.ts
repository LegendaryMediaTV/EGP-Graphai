/**
 * The two readings every codex root carries beside its `shortDefinition`: its
 * `transliteration` and its `pronunciation`.
 *
 * Both are derived from the root key and the language registry alone, so they
 * have one right answer, and this module is the only place that computes it.
 * `utils/validate.ts` calls {@link fillRootReadings} on every run to write
 * them, and `auditLexicalMaps` calls {@link rootReadings} to fail a run on a
 * stored value that still disagrees. A tool that adds a root never has to know
 * the fields exist.
 */

import fs from "fs";
import path from "path";
import { writeJsonFile } from "../functions/writeJsonFile";
import {
  pronounce,
  pronunciationTable,
  transliterate,
  transliterationTable,
} from "./lexicon";

/**
 * Directory holding one subdirectory per language codex, relative to the repo
 * root, which is where every script here is run from.
 */
const lexicalMapsDir = "./lexical-maps";

/** Homograph superscripts, which hold two roots apart and are never said. */
export const SUPERSCRIPT = /[¹²³⁴-⁹]/g;

/** The fields {@link rootReadings} derives, each absent when it cannot be. */
export interface RootReadings {
  /** The academic transliteration, e.g. `agápē`. */
  transliteration?: string;
  /** The respelled pronunciation, e.g. `ah-GAH-pay`. */
  pronunciation?: string;
}

/**
 * What one root's `transliteration` and `pronunciation` should be.
 *
 * The superscript comes off first: `κόρος¹` is transliterated and said as
 * `κόρος`. A phrase or a hyphenated name is transliterated word by word, since
 * {@link transliterate} reads one word at a time. A field is left out when the
 * registry has no table for it, and the pronunciation also when the key holds
 * something no one says aloud, like the keraia on the numeral `αʹ`.
 *
 * @param root A root key, e.g. `"ἀγάπη"`
 * @param language Subdirectory of `lexical-maps`, e.g. `"greek"`
 */
export function rootReadings(root: string, language: string): RootReadings {
  const key = root.replace(SUPERSCRIPT, "");
  const readings: RootReadings = {};

  const letters = transliterationTable(language);
  if (letters) {
    readings.transliteration = key
      .split(/([\s-]+)/)
      .map((part, i) => (i % 2 ? part : transliterate(part, letters)))
      .join("");
  }

  const sounds = pronunciationTable(language);
  const said = sounds ? pronounce(key, sounds) : null;
  if (said !== null) readings.pronunciation = said;

  return readings;
}

/**
 * Write every root's readings in one language's codex, placing them right
 * after `shortDefinition` and before `indices` and `inflections`.
 *
 * A stale value is overwritten and a field that can no longer be derived is
 * removed, so the files always say what {@link rootReadings} says. A file is
 * written only when one of its roots changed.
 *
 * @param language Subdirectory of `lexical-maps`, e.g. `"greek"`
 * @param mapsDir The directory holding the codex directories, for a test
 *   working on a copy
 * @returns How many roots changed
 */
export async function fillRootReadings(
  language: string,
  mapsDir: string = lexicalMapsDir,
): Promise<number> {
  const dir = path.join(mapsDir, language);
  if (!fs.existsSync(dir)) return 0;
  let changedRoots = 0;

  for (const name of fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file !== "_language.json")
    .sort()) {
    const filePath = path.join(dir, name);
    const data: Record<string, Record<string, unknown>> = JSON.parse(
      fs.readFileSync(filePath, "utf-8"),
    );
    let changed = false;

    for (const [root, entry] of Object.entries(data)) {
      const readings = rootReadings(root, language);
      if (
        entry.transliteration === readings.transliteration &&
        entry.pronunciation === readings.pronunciation
      )
        continue;
      data[root] = withReadings(entry, readings);
      changedRoots++;
      changed = true;
    }

    if (changed) await writeJsonFile(filePath, data);
  }
  return changedRoots;
}

/** One root rebuilt with its readings in their place, key order otherwise kept. */
function withReadings(
  entry: Record<string, unknown>,
  readings: RootReadings,
): Record<string, unknown> {
  const rebuilt: Record<string, unknown> = {};
  let placed = false;
  const place = () => {
    if (placed) return;
    if (readings.transliteration !== undefined)
      rebuilt.transliteration = readings.transliteration;
    if (readings.pronunciation !== undefined)
      rebuilt.pronunciation = readings.pronunciation;
    placed = true;
  };

  for (const [key, value] of Object.entries(entry)) {
    if (key === "transliteration" || key === "pronunciation") continue;
    if (key === "indices" || key === "inflections") place();
    rebuilt[key] = value;
  }
  place();
  return rebuilt;
}
