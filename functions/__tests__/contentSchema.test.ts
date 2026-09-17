import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import Ajv, { ValidateFunction } from "ajv";

describe("content-schema.json heading type", () => {
  let validate: ValidateFunction;

  beforeAll(() => {
    const schemaContent = fs.readFileSync("content-schema.json", "utf-8");
    const schema = JSON.parse(schemaContent);
    const ajv = new Ajv();
    validate = ajv.compile(schema);
  });

  it("should accept a heading object with no type (regression baseline)", () => {
    const valid = validate({ heading: "ALEPH" });
    expect(valid).toBe(true);
  });

  it("should accept a heading object with type acrostic", () => {
    const valid = validate({ heading: "ALEPH", type: "acrostic" });
    expect(valid).toBe(true);
  });

  it("should accept a heading object with type standard", () => {
    const valid = validate({ heading: "A Psalm of David", type: "standard" });
    expect(valid).toBe(true);
  });

  it("should reject a heading object with an invalid type value", () => {
    const valid = validate({ heading: "ALEPH", type: "bogus" });
    expect(valid).toBe(false);
  });
});

describe("content-schema.json transliteration", () => {
  let validate: ValidateFunction;

  beforeAll(() => {
    const schemaContent = fs.readFileSync("content-schema.json", "utf-8");
    const schema = JSON.parse(schemaContent);
    const ajv = new Ajv();
    validate = ajv.compile(schema);
  });

  it("should accept a text object carrying a transliteration alongside its text", () => {
    expect(
      validate({
        text: " χριστοῦ,",
        script: "G",
        transliteration: " christoû,",
      }),
    ).toBe(true);
  });

  it("should reject a transliteration on a node that has no text to be a transliteration of", () => {
    // This is also the proof that Ajv reads draft-07 `dependencies`: without
    // it, `minProperties: 1` would let this object through.
    expect(validate({ transliteration: " christoû," })).toBe(false);
  });

  it("should reject a transliteration on a nested-content object, which has no text of its own", () => {
    expect(validate({ content: ["a", "b"], transliteration: "ab" })).toBe(
      false,
    );
  });

  it("should still accept a text object with no transliteration", () => {
    expect(validate({ text: " χριστοῦ,", script: "G" })).toBe(true);
  });
});
