import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const secretEnvNames = [
  "OPENAI_API_KEY",
  "PRAVA_SECRET_KEY",
  "NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY",
  "SENSO_API_KEY",
  "LINQ_API_KEY",
  "LINQ_WEBHOOK_SECRET",
  "N8N_INTERNAL_SECRET",
  "APP_SECRET"
] as const;

export const workflowEnvNames = [
  "N8N_CAMPAIGN_URL",
  "N8N_COMMERCE_URL",
  "N8N_RESERVATION_URL",
  "N8N_REPORT_URL"
] as const;

export type EvalEnvironment = Record<string, string | undefined>;

export async function loadEvalEnvironment(): Promise<EvalEnvironment> {
  const env: EvalEnvironment = { ...process.env };
  const dotenv = await readDotEnv();

  for (const [key, value] of Object.entries(dotenv)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }

  return env;
}

export function requireFixtureMode(env: EvalEnvironment): void {
  if (env.USE_FIXTURES === "false") {
    throw new Error("Eval harness requires fixture mode. Set USE_FIXTURES=true.");
  }
}

export function presentEnvNames(env: EvalEnvironment, names: readonly string[]): string[] {
  return names.filter((name) => typeof env[name] === "string" && env[name]!.trim() !== "");
}

export function missingEnvNames(env: EvalEnvironment, names: readonly string[]): string[] {
  return names.filter((name) => typeof env[name] !== "string" || env[name]!.trim() === "");
}

async function readDotEnv(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(process.cwd(), ".env"), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");
          if (separator === -1) return ["", ""];
          const key = line.slice(0, separator).trim();
          const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "");
          return [key, value];
        })
        .filter(([key]) => key !== "")
    );
  } catch {
    return {};
  }
}
