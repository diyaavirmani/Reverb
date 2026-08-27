import type { AssertionCase, EvalCaseResult, EvalDataset, EvalSuiteResult } from "../utils/eval-types";

export function gradeAssertionDataset(dataset: EvalDataset): EvalSuiteResult {
  const cases = dataset.cases.map(gradeAssertionCase);
  const passCount = cases.filter((result) => result.status === "pass").length;
  const passRate = cases.length === 0 ? 1 : passCount / cases.length;

  return {
    name: dataset.name,
    category: dataset.category,
    status: passRate >= threshold(dataset, "pass_rate", 1) ? "pass" : "fail",
    metrics: {
      pass_rate: passRate,
      case_count: cases.length,
      failed_case_count: cases.length - passCount,
      ...averageMetrics(dataset.cases)
    },
    cases
  };
}

export function gradeAssertionCase(testCase: AssertionCase): EvalCaseResult {
  const started = Date.now();
  const assertions = testCase.assertions ?? objectAssertions(testCase);
  const failures = assertions.flatMap((assertion) =>
    deepEqual(assertion.actual, assertion.expected)
      ? []
      : [
          `${assertion.name} expected ${JSON.stringify(assertion.expected)} but got ${JSON.stringify(
            assertion.actual
          )}`
        ]
  );

  return {
    id: testCase.id,
    name: testCase.name,
    status: failures.length === 0 ? "pass" : "fail",
    score: assertions.length === 0 ? 1 : (assertions.length - failures.length) / assertions.length,
    summary: failures.length === 0 ? "All deterministic assertions passed." : failures.join("; "),
    failures,
    latencyMs: Date.now() - started,
    metadata: { tags: testCase.tags ?? [] }
  };
}

function objectAssertions(testCase: AssertionCase) {
  const expected = testCase.expected ?? {};
  const actual = testCase.actual ?? {};
  return Object.keys(expected).map((key) => ({
    name: key,
    expected: expected[key],
    actual: actual[key]
  }));
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function threshold(dataset: EvalDataset, metric: string, fallback: number): number {
  const value = dataset.thresholds?.[metric];
  return typeof value === "number" ? value : fallback;
}

function averageMetrics(cases: AssertionCase[]): Record<string, number> {
  const metricNames = new Set(cases.flatMap((testCase) => Object.keys(testCase.metrics ?? {})));
  return Object.fromEntries(
    Array.from(metricNames).map((metricName) => {
      const values = cases
        .map((testCase) => testCase.metrics?.[metricName])
        .filter((value): value is number => typeof value === "number");
      const average = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
      return [metricName, average];
    })
  );
}
