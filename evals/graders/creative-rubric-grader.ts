import type { AssertionCase, EvalCaseResult, EvalDataset, EvalSuiteResult } from "../utils/eval-types";

const requiredDimensions = [
  "brand_alignment",
  "offer_correctness",
  "time_slot_correctness",
  "cta_quality",
  "factual_grounding",
  "constraint_compliance",
  "unsupported_claim_absence"
];

export function gradeCreativeDataset(dataset: EvalDataset): EvalSuiteResult {
  const cases = dataset.cases.map(gradeCreativeCase);
  const passCount = cases.filter((result) => result.status === "pass").length;

  return {
    name: dataset.name,
    category: dataset.category,
    status: passCount === cases.length ? "pass" : "fail",
    metrics: {
      pass_rate: cases.length === 0 ? 1 : passCount / cases.length,
      average_creative_quality:
        cases.length === 0 ? 0 : cases.reduce((sum, result) => sum + result.score, 0) / cases.length
    },
    cases
  };
}

function gradeCreativeCase(testCase: AssertionCase): EvalCaseResult {
  const rubric = testCase.metrics ?? {};
  const missing = requiredDimensions.filter((dimension) => typeof rubric[dimension] !== "number");
  const dimensionScores = requiredDimensions
    .map((dimension) => rubric[dimension])
    .filter((score): score is number => typeof score === "number");
  const average = dimensionScores.length === 0 ? 0 : dimensionScores.reduce((sum, score) => sum + score, 0) / dimensionScores.length;
  const failures = [
    ...missing.map((dimension) => `Missing rubric dimension: ${dimension}`),
    ...(average >= 4 ? [] : [`Average creative quality below 4.0: ${average}`]),
    ...(rubric.constraint_compliance === 5 ? [] : ["Constraint compliance must be 5."]),
    ...(rubric.unsupported_claim_absence === 5 ? [] : ["Unsupported claim absence must be 5."])
  ];

  return {
    id: testCase.id,
    name: testCase.name,
    status: failures.length === 0 ? "pass" : "fail",
    score: average,
    summary: failures.length === 0 ? "Creative rubric passed." : failures.join("; "),
    failures,
    latencyMs: 0,
    metadata: { tags: testCase.tags ?? [] }
  };
}
