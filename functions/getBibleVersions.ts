import * as fs from "fs";
import * as path from "path";
import BibleVersion from "../types/Version";

/** Directory containing all Bible version subfolders */
const BIBLE_VERSIONS_DIR = path.join(__dirname, "..", "bible-versions");

/** Filename for version metadata within each version folder */
const VERSION_FILENAME = "_version.json";

/** Matches the trailing 4-digit year in a version's _id (e.g. 'KJV1769' -> '1769') */
const TRAILING_YEAR_PATTERN = /(\d{4})$/;

/**
 * Groups versions by exact-match string `name`, then appends each colliding
 * member's own trailing-year suffix (e.g. " (1996)") parsed from its `_id` so
 * visually identical names become distinguishable; unique names are left
 * untouched. Non-string names are skipped from grouping to avoid a
 * false-positive collision where distinct values would otherwise coerce to
 * the same map key (e.g. two objects both stringifying to
 * "[object Object]"). A colliding member whose `_id` has no parseable year is
 * logged via `console.error` and left unmodified rather than throwing.
 *
 * @param versions - Versions to disambiguate (mutated in place, also returned)
 * @returns The same array, with colliding names now suffixed
 */
function disambiguateDuplicateNames(versions: BibleVersion[]): BibleVersion[] {
  const versionsByName = new Map<string, BibleVersion[]>();

  for (const version of versions) {
    if (typeof version.name !== "string") {
      continue;
    }

    const group = versionsByName.get(version.name);
    if (group) {
      group.push(version);
    } else {
      versionsByName.set(version.name, [version]);
    }
  }

  for (const group of versionsByName.values()) {
    if (group.length < 2) {
      continue;
    }

    for (const version of group) {
      const yearMatch = version._id.match(TRAILING_YEAR_PATTERN);
      if (!yearMatch) {
        console.error(
          `Cannot disambiguate duplicate name "${String(
            version.name
          )}" for version ${version._id}: _id has no trailing 4-digit year`
        );
        continue;
      }

      version.name = `${version.name} (${yearMatch[1]})`;
    }
  }

  return versions;
}

/**
 * Discovers and loads all Bible versions from the bible-versions directory.
 * Each version is expected to have a _version.json file in its subfolder.
 * Versions sharing an identical `name` each receive a disambiguating year
 * suffix (parsed from their own `_id`) so the returned list never contains
 * two visually identical display names.
 *
 * @param versionsDir - Optional custom directory path (defaults to bible-versions/)
 * @returns Array of BibleVersion objects sorted by _id
 * @throws Error if versionsDir doesn't exist
 */
export function getBibleVersions(versionsDir?: string): BibleVersion[] {
  const dir = versionsDir ?? BIBLE_VERSIONS_DIR;

  if (!fs.existsSync(dir)) {
    throw new Error(`Bible versions directory not found: ${dir}`);
  }

  const items = fs.readdirSync(dir);
  const versions: BibleVersion[] = [];

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (!stat.isDirectory()) {
      continue;
    }

    const versionFilePath = path.join(itemPath, VERSION_FILENAME);

    if (!fs.existsSync(versionFilePath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(versionFilePath, "utf-8");
      const version = JSON.parse(content) as BibleVersion;
      versions.push(version);
    } catch (error) {
      console.error(`Error reading version file ${versionFilePath}:`, error);
    }
  }

  versions.sort((a, b) => a._id.localeCompare(b._id));

  disambiguateDuplicateNames(versions);

  return versions;
}

/**
 * Gets a single Bible version by its ID.
 *
 * Note: deliberately does NOT apply the duplicate-name disambiguation that
 * `getBibleVersions()` does — detecting a collision here would require
 * scanning the whole directory, turning a cheap single lookup into a full
 * scan, and no current caller displays this function's `name` standalone.
 * Add disambiguation here deliberately if that changes.
 *
 * @param versionId - The version identifier (e.g., 'ASV1901', 'KJV1769')
 * @param versionsDir - Optional custom directory path
 * @returns The BibleVersion object or undefined if not found
 */
export function getBibleVersion(
  versionId: string,
  versionsDir?: string
): BibleVersion | undefined {
  const dir = versionsDir ?? BIBLE_VERSIONS_DIR;
  const versionFilePath = path.join(dir, versionId, VERSION_FILENAME);

  if (!fs.existsSync(versionFilePath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(versionFilePath, "utf-8");
    return JSON.parse(content) as BibleVersion;
  } catch (error) {
    console.error(`Error reading version file ${versionFilePath}:`, error);
    return undefined;
  }
}

/**
 * Gets all version directory names (folder names that contain _version.json).
 *
 * @param versionsDir - Optional custom directory path
 * @returns Array of version folder names
 */
export function getVersionDirectories(versionsDir?: string): string[] {
  const dir = versionsDir ?? BIBLE_VERSIONS_DIR;

  if (!fs.existsSync(dir)) {
    return [];
  }

  const items = fs.readdirSync(dir);
  const versionDirs: string[] = [];

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (!stat.isDirectory()) {
      continue;
    }

    const versionFilePath = path.join(itemPath, VERSION_FILENAME);
    if (fs.existsSync(versionFilePath)) {
      versionDirs.push(item);
    }
  }

  return versionDirs.sort();
}

export default getBibleVersions;
