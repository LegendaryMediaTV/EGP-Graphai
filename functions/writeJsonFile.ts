/**
 * Writes files the way the repository's tools need them written: all-or-nothing
 * and loud when it cannot be done, with a JSON convenience on top.
 *
 * Every tool that maintains `bible-versions/` or `exports/` used to write the
 * bytes itself and then shell out to `prettier --write` once per file. That
 * cost a process per book — thousands across a full run — and on Windows it
 * intermittently died with `UNKNOWN: unknown error, open '<file>'`.
 *
 * Removing the subprocess does not remove the transient: `fs.writeFileSync`
 * meets it too, because the failing operation is reopening an existing file for
 * truncation while something else — a backup agent, an indexer, a virus
 * scanner — still holds it. So the bytes go to a staging file and are renamed
 * over the target. A scanner holding the old file blocks the open but not the
 * replace, and no reader ever sees a half-written file.
 */

import * as fs from "fs";
import * as prettier from "prettier";

/**
 * Backoff before each retry of a write, in milliseconds. Its length sets how
 * many attempts a file gets: one more than there are delays.
 */
const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000];

/**
 * Writes `contents` verbatim, replacing any existing file, or throws naming it.
 *
 * The bytes land in a staging file beside the target and are renamed over it,
 * so a reader never sees a partial file and a holder of the old file cannot
 * block the write. Attempts that hit the Windows transient described above are
 * retried on a backoff, then reported rather than absorbed.
 *
 * Use this for text that is already exactly what belongs on disk — Markdown,
 * plain text, or Prettier output. For JSON built from an object, use
 * {@link writeJsonFile}, which formats first.
 *
 * @param filePath - Where to write
 * @param contents - The exact text to write, unmodified
 * @throws If the bytes are not on disk once the retries are spent
 */
export async function writeFileAtomic(
  filePath: string,
  contents: string
): Promise<void> {
  const expectedBytes = Buffer.byteLength(contents);
  const staging = `${filePath}.writing`;

  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(staging, contents);
      const stagedBytes = fs.statSync(staging).size;
      if (stagedBytes !== expectedBytes) {
        throw new Error(`only ${stagedBytes} of ${expectedBytes} bytes landed`);
      }
      fs.renameSync(staging, filePath);
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      if (attempt === RETRY_DELAYS_MS.length) {
        try {
          fs.rmSync(staging, { force: true });
        } catch {
          // The staging file is not the deliverable, and the throw below
          // reports the failure either way.
        }
        throw new Error(
          `Failed to write ${filePath} after ${attempt + 1} attempts: ${reason}`
        );
      }

      console.warn(`  Retrying write of ${filePath} (${reason})`);
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt])
      );
    }
  }
}

/**
 * Writes `data` as Prettier-formatted JSON, or throws naming the file.
 *
 * Formatting runs in-process, with the same call `utils/validate.ts` makes, so
 * the two produce identical bytes and a file this writes is already a fixed
 * point of validation. The bytes reach disk through {@link writeFileAtomic}.
 *
 * @param filePath - Where to write
 * @param data - Anything JSON-serializable
 * @throws If the bytes are not on disk once the retries are spent
 */
export async function writeJsonFile(
  filePath: string,
  data: unknown
): Promise<void> {
  const contents = await prettier.format(JSON.stringify(data, null, 2) + "\n", {
    parser: "json",
  });

  await writeFileAtomic(filePath, contents);
}

export default writeJsonFile;
