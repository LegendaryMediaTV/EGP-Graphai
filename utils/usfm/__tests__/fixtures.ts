import * as fs from "fs";
import * as path from "path";

/**
 * Read a fixture file.
 *
 * Every fixture under `utils/usfm/__tests__/fixtures/*.usfm` is a byte-exact
 * `sed`/line-range extract from a real file in
 * `imports/webus2020/ebible-usfm/`, never hand-typed — `imports/guide.md`
 * §6's own rule that a hand-invented fixture tests the parser against a
 * cleaner grammar than the one that actually exists.
 *
 * @param name - Fixture file name, e.g. `genesis-1-2.usfm`.
 * @returns The fixture's contents, verbatim.
 */
export function readFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}
