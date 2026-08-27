import { gradeGuardrails } from "../graders/safety-graders";
import { writeEvalReport } from "../utils/eval-report";
import { logSafe, logSuiteSummary } from "../utils/eval-logger";
import { loadEvalEnvironment, requireFixtureMode } from "../utils/eval-sandbox";
import type { EvalSuiteResult } from "../utils/eval-types";
import { runApplicationEvals } from "./run-application-evals";
import { runComponentEvals } from "./run-component-evals";
import { runWorkflowEvals } from "./run-workflow-evals";
import { exitForSuites, isMainModule, statusLine } from "./shared";

const args = new Set(process.argv.slice(2));

export async function runAllEvals(): Promise<EvalSuiteResult[]> {
  const env = await loadEvalEnvironment();
  requireFixtureMode(env);

  if (args.has("--guardrails-only")) {
    return [gradeGuardrails()];
  }

  const suites = [
    ...(await runComponentEvals()),
    ...(await runWorkflowEvals()),
    ...(await runApplicationEvals()),
    gradeGuardrails()
  ];

  if (args.has("--bug-discovery")) {
    logSafe("Bug discovery mode enabled: adversarial, regression, duplicate, malformed, and timeout cases included.");
  }

  return suites;
}

if (isMainModule(import.meta.url)) {
  const suites = await runAllEvals();
  const report = await writeEvalReport(suites);
  logSuiteSummary("All evals", suites.some((suite) => suite.status === "fail") ? "FAIL" : "PASS", statusLine(suites));
  if (args.has("--bug-discovery")) {
    logSafe(`Bug candidates: ${report.recommendedFixOrder.length === 0 ? "none" : report.recommendedFixOrder.join("; ")}`);
  }
  exitForSuites(suites);
}
