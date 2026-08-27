import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function listSheetTemplateNames(): Promise<string[]> {
  const directory = join(process.cwd(), "fixtures", "sheets");
  return (await readdir(directory)).filter((fileName) => fileName.endsWith(".csv")).sort();
}

export async function sheetHasColumn(sheetName: string, columnName: string): Promise<boolean> {
  const raw = await readFile(join(process.cwd(), "fixtures", "sheets", sheetName), "utf8");
  const header = raw.split(/\r?\n/)[0] ?? "";
  return header.split(",").includes(columnName);
}
