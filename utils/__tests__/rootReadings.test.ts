import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fillRootReadings, rootReadings } from "../rootReadings";

describe("rootReadings", () => {
  it("should transliterate and pronounce a root key", () => {
    expect(rootReadings("ἀγάπη", "greek")).toEqual({
      transliteration: "agápē",
      pronunciation: "ah-GAH-pay",
    });
  });

  it("should drop a homograph superscript from both readings", () => {
    expect(rootReadings("κόρος¹", "greek")).toEqual({
      transliteration: "kóros",
      pronunciation: "KAW-raws",
    });
  });

  it("should transliterate a phrase word by word, keeping its separator", () => {
    // Word by word matters for a rough breathing: on one string it would move
    // to the front of the whole phrase.
    expect(rootReadings("Ἄρειος Πάγος", "greek").transliteration).toBe(
      "Áreios Págos",
    );
    expect(rootReadings("Ηλαμ-ααρ", "greek").transliteration).toBe("Ēlam-aar");
  });

  it("should give a numeral a transliteration but no pronunciation", () => {
    expect(rootReadings("ιβʹ", "greek")).toEqual({ transliteration: "ibʹ" });
  });

  it("should leave out both readings for a language with no registry", () => {
    expect(rootReadings("anything", "klingon")).toEqual({});
  });
});

describe("fillRootReadings", () => {
  let mapsDir: string;
  const codex = () => path.join(mapsDir, "greek", "alpha.json");
  const read = () => JSON.parse(fs.readFileSync(codex(), "utf-8"));

  beforeEach(() => {
    mapsDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-readings-"));
    fs.mkdirSync(path.join(mapsDir, "greek"));
    fs.writeFileSync(
      codex(),
      JSON.stringify({
        ἀγάπη: {
          language: "greek",
          pos: "noun",
          shortDefinition: "a love",
          indices: { strongs: "G26" },
          inflections: {},
        },
        αʹ: {
          language: "greek",
          pos: "adj",
          shortDefinition: "to be first",
          pronunciation: "stale",
          inflections: {},
        },
      }),
    );
  });

  afterEach(() => fs.rmSync(mapsDir, { recursive: true, force: true }));

  it("should write both readings after shortDefinition and before the indices", async () => {
    expect(await fillRootReadings("greek", mapsDir)).toBe(2);

    const root = read()["ἀγάπη"];
    expect(Object.keys(root)).toEqual([
      "language",
      "pos",
      "shortDefinition",
      "transliteration",
      "pronunciation",
      "indices",
      "inflections",
    ]);
    expect(root.pronunciation).toBe("ah-GAH-pay");
  });

  it("should remove a reading that can no longer be derived", async () => {
    await fillRootReadings("greek", mapsDir);

    expect(read()["αʹ"]).not.toHaveProperty("pronunciation");
    expect(read()["αʹ"].transliteration).toBe("aʹ");
  });

  it("should change nothing on a second run", async () => {
    await fillRootReadings("greek", mapsDir);
    const before = fs.readFileSync(codex(), "utf-8");

    expect(await fillRootReadings("greek", mapsDir)).toBe(0);
    expect(fs.readFileSync(codex(), "utf-8")).toBe(before);
  });
});
