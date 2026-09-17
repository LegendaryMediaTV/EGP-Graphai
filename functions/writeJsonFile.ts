/**
 * Writes files the way the repository's tools need them written: all-or-nothing
 * and loud when it cannot be done, with in-process Prettier formatting on top.
 *
 * The bytes go to a staging file and are renamed over the target, because
 * `fs.writeFileSync` on Windows intermittently dies with `UNKNOWN: unknown
 * error, open '<file>'`. The failing operation is reopening an existing file
 * for truncation while something else — a backup agent, an indexer, a virus
 * scanner — still holds it; such a holder blocks the open but not the replace,
 * and no reader ever sees a half-written file.
 *
 * Formatting runs in process because the `prettier --write` subprocess it
 * replaced cost one process per file, thousands across a full run.
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
  contents: string,
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
          `Failed to write ${filePath} after ${attempt + 1} attempts: ${reason}`,
        );
      }

      console.warn(`  Retrying write of ${filePath} (${reason})`);
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt]),
      );
    }
  }
}

/**
 * Renders `data` as Prettier-formatted JSON text.
 *
 * Stringified compact, never with an indent argument: `JSON.stringify(data,
 * null, 2)` puts a newline after every object's `{`, and Prettier's JSON
 * printer treats an existing break there as an authored choice to preserve,
 * so indenting first would lock every object onto its own lines regardless of
 * length. Compact input carries no such signal, letting Prettier collapse
 * anything that fits — which is what makes this converge on the same bytes as
 * formatting a file's own raw text, so a file built from this is already a
 * fixed point of that pass too.
 *
 * @param data - Anything JSON-serializable
 * @returns Prettier-formatted JSON text, newline-terminated
 */
export async function formatJsonData(data: unknown): Promise<string> {
  return prettier.format(JSON.stringify(data) + "\n", { parser: "json" });
}

/**
 * Renders already-assembled Markdown as Prettier-formatted Markdown text.
 *
 * The companion to {@link formatJsonData} for the repository's other
 * generated artifact, `exports/markdown-par/**`, which `utils/exportContent.ts`
 * assembles line by line and would otherwise write with whatever line breaks
 * and blank lines that assembly happened to produce.
 *
 * One pass is enough: Prettier's Markdown printer settles on the first pass
 * for every document the exporter produces. Its TypeScript printer does not
 * always settle, so this is a property of the Markdown printer and this
 * input, not a guarantee of the library.
 *
 * @param markdown - Assembled Markdown text
 * @returns Prettier-formatted Markdown, newline-terminated
 */
export async function formatMarkdownText(markdown: string): Promise<string> {
  return prettier.format(markdown, { parser: "markdown" });
}

/**
 * Writes `data` as Prettier-formatted JSON, or throws naming the file.
 *
 * @param filePath - Where to write
 * @param data - Anything JSON-serializable
 * @throws If the bytes are not on disk once the retries are spent
 */
export async function writeJsonFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  const contents = await formatJsonData(data);
  await writeFileAtomic(filePath, contents);
}

export default writeJsonFile;
