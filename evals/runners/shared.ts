import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { EvalDataset, EvalSuiteResult } from "../utils/eval-types";
import { requireFixtureMode, type EvalEnvironment } from "../utils/eval-sandbox";

export async function readDataset(pathParts: string[]): Promise<EvalDataset> {
  const raw = await readFile(join(process.cwd(), ...pathParts), "utf8");
  return JSON.parse(raw) as EvalDataset;
}

export async function readDatasets(category: "component" | "workflow" | "application"): Promise<EvalDataset[]> {
  const files =
    category === "component"
      ? [
          "intent-extraction.cases.json",
          "provider-scoring.cases.json",
          "policy-engine.cases.json",
          "creative-quality.cases.json",
          "payment-safety.cases.json",
          "reservation-performance.cases.json"
        ]
      : category === "workflow"
        ? [
            "campaign-orchestrator.cases.json",
            "commerce.cases.json",
            "reservation-performance.cases.json",
            "reporting.cases.json"
          ]
        : [
            "happy-path.cases.json",
            "failure-path.cases.json",
            "adversarial.cases.json",
            "regression.cases.json"
          ];

  return Promise.all(files.map((fileName) => readDataset(["evals", "datasets", category, fileName])));
}

export function assertEvalEnvironment(env: EvalEnvironment): void {
  requireFixtureMode(env);
}

export function exitForSuites(suites: EvalSuiteResult[]): void {
  if (suites.some((suite) => suite.status === "fail")) {
    process.exitCode = 1;
  }
}

export function statusLine(suites: EvalSuiteResult[]): string {
  const failed = suites.filter((suite) => suite.status === "fail").length;
  const skipped = suites.filter((suite) => suite.status === "skip").length;
  const passed = suites.filter((suite) => suite.status === "pass").length;
  return `${passed} passed, ${skipped} skipped, ${failed} failed`;
}

export function isMainModule(importMetaUrl: string): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && importMetaUrl === pathToFileURL(entryPoint).href;
}
