import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import validateBBExport from "../../utils/validateBBExport";

describe("validateBBExport", () => {
  it("should validate a valid BB export file", () => {
    // Create a temporary valid file
    const validData = [
      {
        _id: "kjv-101001001",
        version: "kjv",
        chapter: "genesis-1",
        sequence: "101001001",
        number: 1,
        text: "In the beginning God created the heaven and the earth.",
        paragraphs: [0],
      },
    ];
    const tempFile = path.join(__dirname, "temp-valid.json");
    fs.writeFileSync(tempFile, JSON.stringify(validData, null, 2));

    const result = validateBBExport(tempFile);
    expect(result.valid).toBe(true);

    fs.unlinkSync(tempFile);
  });

  it("should invalidate an invalid BB export file - missing required field", () => {
    const invalidData = [
      {
        _id: "kjv-101001001",
        version: "kjv",
        chapter: "genesis-1",
        sequence: "101001001",
        // missing number
        text: "In the beginning God created the heaven and the earth.",
      },
    ];
    const tempFile = path.join(__dirname, "temp-invalid.json");
    fs.writeFileSync(tempFile, JSON.stringify(invalidData, null, 2));

    const result = validateBBExport(tempFile);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);

    fs.unlinkSync(tempFile);
  });

  it("should invalidate an invalid BB export file - wrong type", () => {
    const invalidData = [
      {
        _id: "kjv-101001001",
        version: "kjv",
        chapter: "genesis-1",
        sequence: "101001001",
        number: "1", // should be number
        text: "In the beginning God created the heaven and the earth.",
      },
    ];
    const tempFile = path.join(__dirname, "temp-invalid-type.json");
    fs.writeFileSync(tempFile, JSON.stringify(invalidData, null, 2));

    const result = validateBBExport(tempFile);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();

    fs.unlinkSync(tempFile);
  });

  it("should validate with optional fields", () => {
    const validData = [
      {
        _id: "kjv-101001001",
        version: "kjv",
        chapter: "genesis-1",
        sequence: "101001001",
        number: 1,
        text: "In the beginning God created the heaven and the earth.",
        paragraphs: [0, 10],
        footnotes: [{ text: "Note 1", type: "var" }, { text: "Note 2" }],
      },
    ];
    const tempFile = path.join(__dirname, "temp-optional.json");
    fs.writeFileSync(tempFile, JSON.stringify(validData, null, 2));

    const result = validateBBExport(tempFile);
    expect(result.valid).toBe(true);

    fs.unlinkSync(tempFile);
  });

  it("should invalidate invalid footnote type", () => {
    const invalidData = [
      {
        _id: "kjv-101001001",
        version: "kjv",
        chapter: "genesis-1",
        sequence: "101001001",
        number: 1,
        text: "In the beginning God created the heaven and the earth.",
        footnotes: [{ text: "Note 1", type: "invalid" }],
      },
    ];
    const tempFile = path.join(__dirname, "temp-invalid-footnote.json");
    fs.writeFileSync(tempFile, JSON.stringify(invalidData, null, 2));

    const result = validateBBExport(tempFile);
    expect(result.valid).toBe(false);

    fs.unlinkSync(tempFile);
  });
});
