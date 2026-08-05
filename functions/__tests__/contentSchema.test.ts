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
