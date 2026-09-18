import { describe, expect, it } from "vitest";
import {
  auditJsonSchemas,
  committableJsonFiles,
  governanceOf,
} from "../jsonSchemas";

/**
 * The table is asked about directly rather than through the audit, because the
 * audit's answer depends on what the repo currently holds and the table's does
 * not. The audit is then run once over the real repo, which is the assertion
 * that actually matters: no committable JSON file is ungoverned.
 */
describe("governanceOf", () => {
  it("should send each lexical-map file to the schema its directory implies", () => {
    expect(governanceOf("lexical-maps/greek/_language.json")).toEqual({
      schema: "lexical-maps/language-schema.json",
    });
    expect(governanceOf("lexical-maps/greek/indices/strongs.json")).toEqual({
      schema: "lexical-maps/index-schema.json",
    });
    expect(governanceOf("lexical-maps/greek/morphology/robinson.json")).toEqual(
      {
        schema: "lexical-maps/morphology-schema.json",
      },
    );
    expect(governanceOf("lexical-maps/greek/alpha.json")).toEqual({
      schema: "lexical-maps/codex-schema.json",
    });
  });

  it("should ask the language rule before the codex rule, since both sit in one directory", () => {
    // `_language.json` and `alpha.json` are siblings, and the codex rule claims
    // any `.json` at that level. Reversed, every language registry in the repo
    // would be validated against the codex schema and pass for the wrong reason.
    expect(governanceOf("lexical-maps/greek/_language.json")?.schema).toBe(
      "lexical-maps/language-schema.json",
    );
  });

  it("should treat a schema as something to check rather than something to check against", () => {
    expect(governanceOf("content-schema.json")).toEqual({ meta: true });
    expect(governanceOf("lexical-maps/codex-schema.json")).toEqual({
      meta: true,
    });
  });

  it("should name the step that already validates a file in depth", () => {
    expect(governanceOf("bible-versions/BYZ2026/01-MAT.json")).toEqual({
      schema: "bible-versions/bible-verses-schema.json",
      delegatedTo: "Bible verse file validation",
    });
    expect(
      governanceOf("bible-versions/BYZ2026/_version.json")?.delegatedTo,
    ).toBe("Bible version file validation");
  });

  it("should record who owns a format this repo does not", () => {
    // Not an omission. npm rewrites these on its own schedule, so a schema here
    // would be a second opinion that loses every argument.
    expect(governanceOf("package.json")).toEqual({ owner: "npm" });
    expect(governanceOf("package-lock.json")).toEqual({ owner: "npm" });
    expect(governanceOf("tsconfig.json")).toEqual({ owner: "TypeScript" });
    expect(governanceOf("exports/bb/AMP1987/01-GEN.json")).toEqual({
      owner: "npm run export",
    });
    expect(
      governanceOf("panta/functions/__tests__/fixtures/nlt2-samples.json"),
    ).toEqual({ owner: "vitest" });
  });

  it("should govern nothing it has no rule for", () => {
    // This is the guard. A new data file lands here until someone writes it a
    // schema, and the audit fails the run for exactly this answer.
    expect(governanceOf("data/new-thing.json")).toBeNull();
    expect(
      governanceOf("lexical-maps/greek/indices/deeper/strongs.json"),
    ).toBeNull();
  });
});

describe("auditJsonSchemas", () => {
  it("should find every committable JSON file governed and matching", () => {
    const audit = auditJsonSchemas();

    expect(audit.findings).toEqual([]);
    expect(audit.scanned).toBe(committableJsonFiles().length);
    expect(audit.scanned).toBeGreaterThan(500);
    expect(audit.checked).toBeGreaterThan(0);
  });
});
