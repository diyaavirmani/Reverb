import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const checkedExtensions = new Set([
  ".css",
  ".csv",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml"
]);

const { stdout } = await execFileAsync("git", ["ls-files"]);
const files = stdout
  .split("\n")
  .filter((file) => checkedExtensions.has(file.slice(file.lastIndexOf("."))));
const offenders: string[] = [];

for (const file of files) {
  const bytes = await readFile(file);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  throw new Error(`UTF-8 BOM found in tracked files: ${offenders.join(", ")}`);
}

console.log(`BOM check passed (${files.length} tracked files).`);
