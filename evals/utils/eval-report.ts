import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { EvalCaseResult, EvalReport, EvalSuiteResult } from "./eval-types";
import { containsForbiddenReportContent, redactText } from "./redaction-checks";

export async function writeEvalReport(suites: EvalSuiteResult[]): Promise<EvalReport> {
  const report = buildEvalReport(suites);
  const outputDirectory = join(process.cwd(), "evals", "reports");
  const json = JSON.stringify(report, null, 2);
  const markdown = toMarkdown(report);

  if (containsForbiddenReportContent(json) || containsForbiddenReportContent(markdown)) {
    throw new Error("Eval report redaction failed.");
  }

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "latest-eval-report.json"), `${json}\n`, "utf8");
  await writeFile(join(outputDirectory, "latest-eval-report.md"), `${markdown}\n`, "utf8");
  return report;
}

export function buildEvalReport(suites: EvalSuiteResult[]): EvalReport {
  const cases = suites.flatMap((suite) => suite.cases);
  const failedCases = cases.filter((result) => result.status === "fail");
  const regressions = failedCases.filter((result) =>
    String(result.metadata?.tags ?? "").toLowerCase().includes("regression")
  );
  const totalMs = cases.reduce((total, result) => total + result.latencyMs, 0);
  const datasetCounts = Object.fromEntries(
    suites.map((suite) => [suite.name, suite.cases.length])
  );

  return {
    timestamp: new Date().toISOString(),
    mode: "fixture",
    datasetCounts,
    componentScores: collectScores(suites, "component"),
    workflowScores: collectScores(suites, "workflow"),
    applicationScores: collectScores(suites, "application"),
    safetyGuardrailResults: suites.filter((suite) => suite.category === "guardrail"),
    latencySummary: {
      totalMs,
      averageCaseMs: cases.length === 0 ? 0 : Math.round(totalMs / cases.length)
    },
    failedCases,
    regressions,
    recommendedFixOrder: buildFixOrder(failedCases),
    suites
  };
}

export function toMarkdown(report: EvalReport): string {
  const lines = [
    "# REVERB EVALUATION REPORT",
    "",
    `Timestamp: ${report.timestamp}`,
    "",
    "## Component Evals",
    ...suiteLines(report.suites, "component"),
    "",
    "## Workflow Evals",
    ...suiteLines(report.suites, "workflow"),
    "",
    "## Application Evals",
    ...suiteLines(report.suites, "application"),
    "",
    "## Guardrails",
    ...report.safetyGuardrailResults.map((suite) => `- ${suite.name}: ${suite.status.toUpperCase()}`),
    "",
    "## Failed Cases",
    ...(report.failedCases.length === 0
      ? ["- None"]
      : report.failedCases.map((result) => `- ${result.id}: ${result.summary}`)),
    "",
    "## Recommended Fix Order",
    ...(report.recommendedFixOrder.length === 0
      ? ["- None"]
      : report.recommendedFixOrder.map((item) => `- ${item}`))
  ];

  return redactText(lines.join("\n"));
}

function collectScores(
  suites: EvalSuiteResult[],
  category: "component" | "workflow" | "application"
): Record<string, number> {
  return Object.fromEntries(
    suites
      .filter((suite) => suite.category === category)
      .map((suite) => [suite.name, suite.metrics.pass_rate ?? 0])
  );
}

function suiteLines(
  suites: EvalSuiteResult[],
  category: "component" | "workflow" | "application"
): string[] {
  const categorySuites = suites.filter((suite) => suite.category === category);
  if (categorySuites.length === 0) return ["- No datasets"];
  return categorySuites.map((suite) => {
    if (suite.status === "skip") {
      return `- ${suite.name}: SKIP (${suite.skippedReason ?? "not executed"})`;
    }

    return `- ${suite.name}: ${suite.status.toUpperCase()} (${Math.round((suite.metrics.pass_rate ?? 0) * 1000) / 10}%)`;
  });
}

function buildFixOrder(failedCases: EvalCaseResult[]): string[] {
  return failedCases.map((result) => `${result.id}: ${result.failures[0] ?? result.summary}`);
}
