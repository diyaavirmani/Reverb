import type { EvalCaseResult } from "../utils/eval-types";

export function gradeTraceOrder(id: string, name: string, actual: string[], expected: string[]): EvalCaseResult {
  const missing = expected.filter((stage) => !actual.includes(stage));
  const orderValid = expected.every((stage, index) => {
    if (index === 0) return true;
    return actual.indexOf(expected[index - 1]!) <= actual.indexOf(stage);
  });
  const failures = [
    ...missing.map((stage) => `Missing stage: ${stage}`),
    ...(orderValid ? [] : ["Workflow stages are out of order."])
  ];

  return {
    id,
    name,
    status: failures.length === 0 ? "pass" : "fail",
    score: failures.length === 0 ? 1 : 0,
    summary: failures.length === 0 ? "Trace order passed." : failures.join("; "),
    failures,
    latencyMs: 0
  };
}
