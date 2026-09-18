/**
 * Every committable JSON file in this repo, and the schema that governs it.
 *
 * The point is coverage, not validation. Four data schemas existed here for
 * months with nothing applying them, and `language-schema.json` had drifted so
 * far from `_language.json` that wiring it up would have failed the run: it
 * declared ten properties and the file carried thirteen. A schema nothing runs
 * is documentation, and documentation of a format is the thing most likely to
 * be wrong about it.
 *
 * So the question this module answers is not "does this file match its schema"
 * but "**which** schema governs this file, and does it match". A JSON file that
 * matches no rule in {@link SCHEMA_RULES} is a finding in its own right. That is
 * what stops a new data file from entering the repo unschematised, which is how
 * a format gets away from you: not by one file breaking its schema, but by the
 * fifth file nobody wrote one for.
 *
 * **Committable means committable.** The file set comes from `git ls-files`
 * rather than a directory walk, because a walk over the working tree cannot
 * tell a data file from a scratch file, and this repo keeps a lot of the
 * second kind under `_specs/`. A walk would either report hundreds of
 * gitignored working files or need its own list of what to skip, and that list
 * would drift the same way the schemas did.
 *
 * **A schema is checked too**, against JSON Schema's own meta-schema, which is
 * what `ajv.validateSchema` applies. A schema with a typo in it silently stops
 * constraining anything, and that failure is invisible from the data side.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import Ajv from "ajv";

/** One committable JSON file the repo does not govern with a schema. */
export interface SchemaFinding {
  /** Repo-relative path, as `git ls-files` prints it. */
  file: string;
  /** What is wrong: no rule covers it, or it failed the schema that does. */
  reason: string;
}

/** What {@link auditJsonSchemas} found across the repo. */
export interface JsonSchemaAudit {
  /** Every file that matches no rule or fails its schema. */
  findings: SchemaFinding[];
  /** Committable JSON files considered. */
  scanned: number;
  /** Files checked against a schema, as opposed to excused by a rule. */
  checked: number;
}

/**
 * One rule: which files it claims, and what governs them.
 *
 * `schema` names the schema file to validate against. `meta` means the file is
 * itself a schema and is checked against JSON Schema's meta-schema. `owner`
 * means the format belongs to a tool outside this repo, and the string says
 * which — those files are not ours to schematise and npm or tsc rewrites them
 * on its own schedule, so a repo schema for one would be a second opinion that
 * loses every argument.
 */
interface SchemaRule {
  /** True for a file this rule governs. */
  claims: (file: string) => boolean;
  /** The schema file, for a rule that validates. */
  schema?: string;
  /** Set when the file is itself a schema. */
  meta?: true;
  /** The tool that owns the format, for a file this repo does not govern. */
  owner?: string;
  /**
   * The step in `npm run validate` that already checks this file in depth,
   * named where one exists.
   *
   * Those steps validate a verse at a time and report the book, chapter and
   * verse a failure sits in, which is the answer a person needs and one this
   * module cannot give from a whole-file check. Repeating the work here would
   * add a second pass over every node in the corpus to say the same thing worse.
   * So the
   * rule still records what governs the file — that is the coverage claim —
   * and this module confirms the schema exists and compiles rather than
   * running it again.
   */
  delegatedTo?: string;
}

/**
 * Which schema governs what, read top to bottom, first match winning.
 *
 * Ordered so the narrow rules come before the broad one: a codex letter file
 * and `_language.json` sit in the same directory, so the language rule has to
 * be asked first or the letter rule would swallow it.
 */
const SCHEMA_RULES: SchemaRule[] = [
  {
    claims: (file) => path.basename(file).endsWith("-schema.json"),
    meta: true,
  },
  {
    claims: (file) => file === "bible-books/bible-books.json",
    schema: "bible-books/bible-books-schema.json",
    delegatedTo: "Bible books schema validation",
  },
  {
    claims: (file) => /^bible-versions\/[^/]+\/_version\.json$/.test(file),
    schema: "bible-versions/bible-versions-schema.json",
    delegatedTo: "Bible version file validation",
  },
  {
    claims: (file) =>
      /^bible-versions\/[^/]+\/\d{2}-[A-Z0-9]+\.json$/.test(file),
    schema: "bible-versions/bible-verses-schema.json",
    delegatedTo: "Bible verse file validation",
  },
  {
    claims: (file) => /^lexical-maps\/[^/]+\/_language\.json$/.test(file),
    schema: "lexical-maps/language-schema.json",
  },
  {
    claims: (file) => /^lexical-maps\/[^/]+\/indices\/[^/]+\.json$/.test(file),
    schema: "lexical-maps/index-schema.json",
  },
  {
    claims: (file) =>
      /^lexical-maps\/[^/]+\/morphology\/[^/]+\.json$/.test(file),
    schema: "lexical-maps/morphology-schema.json",
  },
  {
    claims: (file) => /^lexical-maps\/[^/]+\/[^/]+\.json$/.test(file),
    schema: "lexical-maps/codex-schema.json",
  },
  {
    claims: (file) => file === "package.json" || file === "package-lock.json",
    owner: "npm",
  },
  { claims: (file) => file === "tsconfig.json", owner: "TypeScript" },
  { claims: (file) => file === ".claude/launch.json", owner: "Claude Code" },
];

/**
 * What governs one committable JSON file, or null when nothing does.
 *
 * Exported so the mapping can be asked about directly. The audit's own answer
 * depends on the repo's current contents; this one depends on nothing, which is
 * what makes the table testable as a table.
 *
 * @param file Repo-relative path, as `git ls-files` prints it.
 */
export function governanceOf(file: string): {
  schema?: string;
  meta?: true;
  owner?: string;
  delegatedTo?: string;
} | null {
  const rule = SCHEMA_RULES.find((candidate) => candidate.claims(file));
  if (!rule) return null;
  const { claims, ...governance } = rule;
  void claims;
  return governance;
}

/** The file list, read once: git is a subprocess and the answer does not move. */
let committable: string[] | null = null;

/**
 * Every committable JSON file, repo-relative, sorted.
 *
 * @throws When git cannot be asked, since a run that silently checked nothing
 *   would report the same clean result as a run that checked everything.
 */
export function committableJsonFiles(): string[] {
  if (committable) return committable;
  try {
    const out = execFileSync("git", ["ls-files", "-z", "*.json"], {
      encoding: "utf-8",
    });
    committable = out.split("\0").filter(Boolean).sort();
  } catch (error) {
    throw new Error(
      `cannot list committable JSON files: \`git ls-files\` failed (${(error as Error).message}). ` +
        "This check reads the git index because committable is a git question, and a directory walk " +
        "cannot tell a data file from a scratch file.",
    );
  }
  return committable;
}

/**
 * Check every committable JSON file against the schema its location implies.
 *
 * Schemas are compiled once and reused: `bible-verses-schema.json` governs every
 * book file on disk, and compiling it once per file is most of the run for no
 * answer it does not already have.
 */
export function auditJsonSchemas(): JsonSchemaAudit {
  const findings: SchemaFinding[] = [];
  let scanned = 0;
  let checked = 0;

  const files = committableJsonFiles();
  /** Schema path to the compiled validator, or to why it could not compile. */
  const compiled = new Map<string, ReturnType<Ajv["compile"]> | string>();

  for (const file of files) {
    scanned++;
    const rule = SCHEMA_RULES.find((candidate) => candidate.claims(file));
    if (!rule) {
      findings.push({
        file,
        reason:
          "no rule in SCHEMA_RULES governs this file, so nothing validates its shape",
      });
      continue;
    }
    if (rule.owner) continue;
    if (rule.delegatedTo) {
      // The coverage claim is still checked: a rule naming a schema that is
      // gone or will not compile is the same hole as no rule at all.
      const validate = validatorFor(rule.schema!, compiled);
      if (typeof validate === "string") {
        findings.push({
          file,
          reason: `${rule.schema} did not compile: ${validate}`,
        });
      }
      continue;
    }

    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (error) {
      findings.push({
        file,
        reason: `not readable as JSON: ${(error as Error).message}`,
      });
      continue;
    }

    if (rule.meta) {
      checked++;
      const ajv = new Ajv({ strict: false });
      // `validateSchema` takes a schema, and what was just parsed is whatever
      // the file held; a file claiming to be a schema and not being one is the
      // finding this rule exists to make.
      if (!ajv.validateSchema(data as Parameters<Ajv["validateSchema"]>[0])) {
        findings.push({
          file,
          reason: `not a valid JSON Schema: ${describe(ajv.errors)}`,
        });
      }
      continue;
    }

    const validate = validatorFor(rule.schema!, compiled);
    if (typeof validate === "string") {
      findings.push({
        file,
        reason: `${rule.schema} did not compile: ${validate}`,
      });
      continue;
    }
    checked++;
    if (!validate(data)) {
      findings.push({
        file,
        reason: `does not match ${rule.schema}: ${describe(validate.errors)}`,
      });
    }
  }

  return { findings, scanned, checked };
}

/**
 * The compiled validator for one schema, built on first use.
 *
 * Every schema in the repo is added to the instance before compiling, because
 * `bible-verses-schema.json` refers to `content-schema.json` by `$id` and ajv
 * resolves that reference against what it has been given rather than fetching
 * it. Adding them all is simpler than tracking which schema needs which.
 */
function validatorFor(
  schemaPath: string,
  cache: Map<string, ReturnType<Ajv["compile"]> | string>,
): ReturnType<Ajv["compile"]> | string {
  const held = cache.get(schemaPath);
  if (held !== undefined) return held;

  let made: ReturnType<Ajv["compile"]> | string;
  try {
    const ajv = new Ajv({ strict: false, allErrors: false });
    for (const other of committableJsonFiles().filter(
      (f) => f.endsWith("-schema.json") && f !== schemaPath,
    )) {
      try {
        ajv.addSchema(JSON.parse(fs.readFileSync(other, "utf-8")));
      } catch {
        // A schema that will not parse is reported on its own line by the meta
        // rule above; it must not take every file that depends on it with it.
      }
    }
    made = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, "utf-8")));
  } catch (error) {
    made = (error as Error).message;
  }
  cache.set(schemaPath, made);
  return made;
}

/** The first few ajv errors as one line. */
function describe(errors: unknown): string {
  if (!Array.isArray(errors) || !errors.length) return "no detail";
  return errors
    .slice(0, 3)
    .map(
      (error: any) =>
        `${error.instancePath || "/"} ${error.message}${error.params?.additionalProperty ? ` ("${error.params.additionalProperty}")` : ""}`,
    )
    .join("; ");
}

/** One finding as a single line, for the audit's own output. */
export function formatSchemaFinding(finding: SchemaFinding): string {
  return `${finding.file} — ${finding.reason}`;
}
