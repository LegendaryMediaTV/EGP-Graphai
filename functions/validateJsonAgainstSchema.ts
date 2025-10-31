import Ajv from "ajv";
import * as fs from "fs";

export default function validateJsonAgainstSchema(
  schemaPath: string,
  jsonPath: string
): { valid: boolean; errors?: any[] } {
  try {
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    const jsonContent = fs.readFileSync(jsonPath, "utf-8");
    const data = JSON.parse(jsonContent);

    const ajv = new Ajv();
    // Load additional schemas
    try {
      const contentSchemaContent = fs.readFileSync(
        "content-schema.json",
        "utf-8"
      );
      const contentSchema = JSON.parse(contentSchemaContent);
      ajv.addSchema(contentSchema);
    } catch (e) {
      // Ignore if not found
    }
    const validate = ajv.compile(schema);
    const valid = validate(data);

    return { valid, errors: valid ? undefined : validate.errors ?? [] };
  } catch (error: any) {
    return { valid: false, errors: [error.message] };
  }
}
