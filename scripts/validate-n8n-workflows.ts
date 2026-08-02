import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

const workflowsDirectory = path.resolve("n8n/workflows");
const fixturesDirectory = path.resolve("n8n/fixtures");
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

  const fixtureFiles = (await readdir(fixturesDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of fixtureFiles) {
    const filePath = path.join(fixturesDirectory, file);
    let fixture: unknown;

    try {
      fixture = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      errors.push(`${file}: malformed fixture JSON (${safeErrorMessage(error)})`);
      continue;
    }

    validateFixture(file, fixture, errors);
  }

  if (errors.length > 0) {
    console.error(`n8n workflow validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `n8n workflows valid: ${files.length} workflow${files.length === 1 ? "" : "s"}, ${fixtureFiles.length} fixture${fixtureFiles.length === 1 ? "" : "s"}`
  );
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

  if (Array.isArray(value.nodes) && isRecord(value.connections)) {
    validateGraph(file, value.nodes, value.connections, errors);
  }

  inspectValue(file, value, "$", errors);
}

function validateGraph(
  file: string,
  nodes: unknown[],
  connections: JsonRecord,
  errors: string[]
): void {
  const names = new Set<string>();
  const ids = new Set<string>();

  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node)) {
      errors.push(`${file}: node ${index} must be an object`);
      continue;
    }

    if (typeof node.name !== "string" || node.name.trim() === "") {
      errors.push(`${file}: node ${index} requires a name`);
    } else if (names.has(node.name)) {
      errors.push(`${file}: duplicate node name ${node.name}`);
    } else {
      names.add(node.name);
    }

    if (typeof node.id !== "string" || node.id.trim() === "") {
      errors.push(`${file}: node ${index} requires an id`);
    } else if (ids.has(node.id)) {
      errors.push(`${file}: duplicate node id ${node.id}`);
    } else {
      ids.add(node.id);
    }

    if (typeof node.type !== "string" || !isRecord(node.parameters)) {
      errors.push(`${file}: node ${index} requires type and parameters`);
    }
  }

  for (const [source, connectionGroup] of Object.entries(connections)) {
    if (!names.has(source)) {
      errors.push(`${file}: connection source does not exist: ${source}`);
    }

    if (!isRecord(connectionGroup) || !Array.isArray(connectionGroup.main)) {
      errors.push(`${file}: invalid connection group for ${source}`);
      continue;
    }

    for (const output of connectionGroup.main) {
      if (!Array.isArray(output)) {
        errors.push(`${file}: invalid connection output for ${source}`);
        continue;
      }

      for (const connection of output) {
        if (
          !isRecord(connection) ||
          typeof connection.node !== "string" ||
          !names.has(connection.node)
        ) {
          errors.push(`${file}: connection from ${source} has an unknown target`);
        }
      }
    }
  }
}

function validateFixture(file: string, value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${file}: fixture must be a JSON object`);
    return;
  }

  if (typeof value.scenario !== "string" || value.scenario.trim() === "") {
    errors.push(`${file}: fixture scenario is required`);
  }

  if (!isRecord(value.input)) {
    errors.push(`${file}: fixture input must be an object`);
  }

  if (!isRecord(value.expected)) {
    errors.push(`${file}: fixture expected result must be an object`);
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
