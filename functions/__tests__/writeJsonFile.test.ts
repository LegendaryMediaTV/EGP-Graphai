import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as prettier from "prettier";
import { writeFileAtomic, writeJsonFile } from "../writeJsonFile";

describe("writeJsonFile", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-json-file-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const sample = [
    {
      _id: "kjv-101001001",
      version: "kjv",
      text: "In the beginning God created the heaven and the earth.",
      footnotes: [] as unknown[],
      paragraphs: [0],
    },
  ];

  describe("writeJsonFile", () => {
    it("should write the same bytes the prettier subprocess produced", async () => {
      // Every caller used to write JSON.stringify(data, null, 2) + "\n" and
      // then hand the file to `prettier --write`. Formatting that exact string
      // in-process has to land on the same bytes or the swap moves the data.
      const file = path.join(dir, "parity.json");
      await writeJsonFile(file, sample);

      expect(fs.readFileSync(file, "utf-8")).toBe(
        await prettier.format(JSON.stringify(sample, null, 2) + "\n", {
          parser: "json",
        })
      );
    });

    it("should leave the file settled, so re-running validate.ts changes nothing", async () => {
      // utils/validate.ts reformats with the same call and rewrites on any
      // difference; a file this wrote must already be a fixed point of it.
      const file = path.join(dir, "settled.json");
      await writeJsonFile(file, sample);

      const written = fs.readFileSync(file, "utf-8");
      expect(await prettier.format(written, { parser: "json" })).toBe(written);
    });

    it("should replace the contents of a file that already exists", async () => {
      const file = path.join(dir, "replaced.json");
      await writeJsonFile(file, { first: true });
      await writeJsonFile(file, { second: true });

      expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({
        second: true,
      });
    });

    it("should surface a failed write naming the file", async () => {
      const file = path.join(dir, "json-occupied");
      fs.mkdirSync(file, { recursive: true });

      vi.useFakeTimers();
      try {
        const rejection = expect(writeJsonFile(file, sample)).rejects.toThrow(
          /Failed to write .*json-occupied after \d+ attempts/
        );
        await vi.runAllTimersAsync();
        await rejection;
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("writeFileAtomic", () => {
    it("should write the given text verbatim, without reformatting it", async () => {
      // utils/validate.ts and utils/exportContent.ts hand over text that is
      // already exactly what belongs on disk — Prettier output, Markdown, or
      // plain verse text. Touching it would corrupt the non-JSON exports.
      const file = path.join(dir, "verbatim.md");
      const contents = "# Genesis\n\n  ragged   spacing  kept\n";
      await writeFileAtomic(file, contents);

      expect(fs.readFileSync(file, "utf-8")).toBe(contents);
    });

    it("should replace the contents of a file that already exists", async () => {
      const file = path.join(dir, "replaced.txt");
      await writeFileAtomic(file, "old");
      await writeFileAtomic(file, "new");

      expect(fs.readFileSync(file, "utf-8")).toBe("new");
    });

    it("should write text whose bytes outnumber its characters", async () => {
      // The staging file is size-checked in bytes; a multi-byte verse must not
      // read as a short write. Hebrew and Greek run through these exports.
      const file = path.join(dir, "multibyte.txt");
      const contents = "בְּרֵאשִׁית — ἐν ἀρχῇ\n";
      await writeFileAtomic(file, contents);

      expect(fs.readFileSync(file, "utf-8")).toBe(contents);
    });

    it("should throw naming the file when the bytes cannot be written", async () => {
      // A directory can never be replaced by a file, so this stands in for the
      // `UNKNOWN: unknown error, open '<file>'` the tools used to meet. Fake
      // timers collapse the retry backoff, which is otherwise seconds long.
      const file = path.join(dir, "occupied");
      fs.mkdirSync(file, { recursive: true });

      vi.useFakeTimers();
      try {
        const rejection = expect(
          writeFileAtomic(file, "contents")
        ).rejects.toThrow(/Failed to write .*occupied after \d+ attempts/);
        await vi.runAllTimersAsync();
        await rejection;
      } finally {
        vi.useRealTimers();
      }
    });

    it("should leave no staging file behind when it gives up", async () => {
      const file = path.join(dir, "abandoned");
      fs.mkdirSync(file, { recursive: true });

      vi.useFakeTimers();
      try {
        const rejection = expect(
          writeFileAtomic(file, "contents")
        ).rejects.toThrow();
        await vi.runAllTimersAsync();
        await rejection;
      } finally {
        vi.useRealTimers();
      }

      expect(fs.existsSync(`${file}.writing`)).toBe(false);
    });
  });
});
