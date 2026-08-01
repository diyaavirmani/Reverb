import { existsSync } from "node:fs";
import { join } from "node:path";

const requiredFixtureDirectories = [
  "fixtures",
  "fixtures/openai",
  "fixtures/senso",
  "fixtures/prava",
  "fixtures/linq",
  "fixtures/data",
  "fixtures/sheets"
];

const missingDirectories = requiredFixtureDirectories.filter(
  (directory) => !existsSync(join(process.cwd(), directory))
);

if (missingDirectories.length > 0) {
  throw new Error(`Missing fixture directories: ${missingDirectories.join(", ")}`);
}

console.log("Fixture directories are present.");
