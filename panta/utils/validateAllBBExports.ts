import * as fs from "fs";
import * as path from "path";
import validateBBExport from "./validateBBExport";

const exportsDir = path.join(__dirname, "../../exports");
const files = fs
  .readdirSync(exportsDir)
  .filter((f) => f.startsWith("BibleDB.bibleVerses-") && f.endsWith(".json"));

console.log("Validating BB export files...");

let allValid = true;
for (const file of files) {
  const filePath = path.join(exportsDir, file);
  console.log(`\nValidating ${file}...`);
  const result = validateBBExport(filePath);
  if (result.valid) {
    console.log(`✅ ${file} is valid`);
  } else {
    console.log(`❌ ${file} is invalid`);
    if (result.errors) {
      result.errors.forEach((error: any) => {
        console.error(`  - ${error.instancePath || "Root"}: ${error.message}`);
      });
    }
    allValid = false;
  }
}

if (allValid) {
  console.log("\n🎉 All BB export files are valid!");
} else {
  console.log("\n❌ Some BB export files are invalid.");
  process.exit(1);
}
