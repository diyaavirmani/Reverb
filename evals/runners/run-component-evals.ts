import { gradeCreativeDataset } from "../graders/creative-rubric-grader";
import { gradeAssertionDataset } from "../graders/deterministic-graders";
import { writeEvalReport } from "../utils/eval-report";
import { logSuiteSummary } from "../utils/eval-logger";
import { loadEvalEnvironment } from "../utils/eval-sandbox";
import type { EvalSuiteResult } from "../utils/eval-types";
import { assertEvalEnvironment, exitForSuites, isMainModule, readDatasets, statusLine } from "./shared";

export async function runComponentEvals(): Promise<EvalSuiteResult[]> {
  const env = await loadEvalEnvironment();
  assertEvalEnvironment(env);
  const datasets = await readDatasets("component");
  return datasets.map((dataset) =>
    dataset.name === "creative-quality" ? gradeCreativeDataset(dataset) : gradeAssertionDataset(dataset)
  );
}

if (isMainModule(import.meta.url)) {
  const suites = await runComponentEvals();
  await writeEvalReport(suites);
  logSuiteSummary("Component evals", suites.some((suite) => suite.status === "fail") ? "FAIL" : "PASS", statusLine(suites));
  exitForSuites(suites);
}
