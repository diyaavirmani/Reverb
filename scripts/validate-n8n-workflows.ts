import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

const workflowsDirectory = path.resolve("n8n/workflows");
const sensitiveFieldPattern = /^(card(?:Data|Number)?|cvv|pan|payment[_-]?(?:token|credential)|paymentAuthori[sz]ationReference)$/i;
const secretKeyPattern = /^(api[_-]?key|secret|password|authorization)$/i;

async function main(): Promise<void> {
  const files = (await readdir(workflowsDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const errors: string[] = [];

  for (const file of files) {
    const filePath = path.join(workflowsDirectory, file);
    let workflow: unknown;

    try {
      workflow = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      errors.push(`${file}: malformed JSON (${safeErrorMessage(error)})`);
      continue;
    }

    validateWorkflow(file, workflow, errors);
  }

  if (errors.length > 0) {
    console.error(`n8n workflow validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`n8n workflows valid: ${files.length} file${files.length === 1 ? "" : "s"}`);
}

function validateWorkflow(file: string, value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${file}: workflow must be a JSON object`);
    return;
  }

  if (typeof value.name !== "string" || value.name.trim() === "") {
    errors.push(`${file}: name is required`);
  }

  if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
    errors.push(`${file}: nodes must be a non-empty array`);
  }

  if (!isRecord(value.connections)) {
    errors.push(`${file}: connections must be an object`);
  }

  if (value.active !== false) {
    errors.push(`${file}: active must be false`);
  }

  inspectValue(file, value, "$", errors);
}

function inspectValue(file: string, value: unknown, location: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectValue(file, item, `${location}[${index}]`, errors));
    return;
  }

  if (!isRecord(value)) {
    if (typeof value === "string" && sensitiveFieldPattern.test(value)) {
      errors.push(`${file}: prohibited payment field at ${location}`);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;

    if (key === "credentials") {
      errors.push(`${file}: credentials must remain unassigned at ${childLocation}`);
      continue;
    }

    if (sensitiveFieldPattern.test(key)) {
      errors.push(`${file}: prohibited payment field at ${childLocation}`);
    }

    if (
      secretKeyPattern.test(key) &&
      typeof child === "string" &&
      child.trim() !== "" &&
      !child.includes("$env.")
    ) {
      errors.push(`${file}: embedded credential value at ${childLocation}`);
    }

    inspectValue(file, child, childLocation, errors);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown parse error";
}

void main();
