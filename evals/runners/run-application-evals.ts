import { gradeAssertionDataset } from "../graders/deterministic-graders";
import { writeEvalReport } from "../utils/eval-report";
import { logSuiteSummary } from "../utils/eval-logger";
import { loadEvalEnvironment } from "../utils/eval-sandbox";
import type { EvalSuiteResult } from "../utils/eval-types";
import { assertEvalEnvironment, exitForSuites, isMainModule, readDatasets, statusLine } from "./shared";

export async function runApplicationEvals(): Promise<EvalSuiteResult[]> {
  const env = await loadEvalEnvironment();
  assertEvalEnvironment(env);
  return (await readDatasets("application")).map(gradeAssertionDataset);
}

if (isMainModule(import.meta.url)) {
  const suites = await runApplicationEvals();
  await writeEvalReport(suites);
  logSuiteSummary("Application evals", suites.some((suite) => suite.status === "fail") ? "FAIL" : "PASS", statusLine(suites));
  exitForSuites(suites);
}
