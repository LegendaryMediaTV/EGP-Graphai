import * as fs from "fs";
import * as path from "path";
import BibleVersion from "../types/Version";

/** Directory containing all Bible version subfolders */
const BIBLE_VERSIONS_DIR = path.join(__dirname, "..", "bible-versions");

/** Filename for version metadata within each version folder */
const VERSION_FILENAME = "_version.json";

/**
 * Discovers and loads all Bible versions from the bible-versions directory.
 * Each version is expected to have a _version.json file in its subfolder.
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

    // Only process directories
    if (!stat.isDirectory()) {
      continue;
    }

    const versionFilePath = path.join(itemPath, VERSION_FILENAME);

    // Check if _version.json exists in this directory
    if (!fs.existsSync(versionFilePath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(versionFilePath, "utf-8");
      const version = JSON.parse(content) as BibleVersion;
      versions.push(version);
    } catch (error) {
      // Log parsing errors but continue processing other versions
      console.error(`Error reading version file ${versionFilePath}:`, error);
    }
  }

  // Sort versions alphabetically by _id
  versions.sort((a, b) => a._id.localeCompare(b._id));

  return versions;
}

/**
 * Gets a single Bible version by its ID.
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
