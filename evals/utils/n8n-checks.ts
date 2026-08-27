import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function listWorkflowNames(): Promise<string[]> {
  const directory = join(process.cwd(), "n8n", "workflows");
  return (await readdir(directory)).filter((fileName) => fileName.endsWith(".json")).sort();
}

export async function workflowContainsNode(workflowFileName: string, nodeName: string): Promise<boolean> {
  const raw = await readFile(join(process.cwd(), "n8n", "workflows", workflowFileName), "utf8");
  const workflow = JSON.parse(raw) as { nodes?: { name?: string }[] };
  return Array.isArray(workflow.nodes) && workflow.nodes.some((node) => node.name === nodeName);
}
