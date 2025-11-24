import Ajv from "ajv";
import * as fs from "fs";

export default function validateBBExport(jsonPath: string): {
  valid: boolean;
  errors?: any[];
} {
  try {
    const schemaPath = "./panta/bb-export-schema.json";
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    const jsonContent = fs.readFileSync(jsonPath, "utf-8");
    const data = JSON.parse(jsonContent);

    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(data);

    return { valid, errors: valid ? undefined : validate.errors ?? [] };
  } catch (error: any) {
    return { valid: false, errors: [error.message] };
  }
}
