export type EvalStatus = "pass" | "fail" | "skip";

export type AssertionCase = {
  id: string;
  name: string;
  tags?: string[];
  input?: Record<string, unknown>;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  assertions?: EvalAssertion[];
  metrics?: Record<string, number>;
  notes?: string;
};

export type EvalAssertion = {
  name: string;
  expected: unknown;
  actual: unknown;
};

export type EvalDataset = {
  name: string;
  category: "component" | "workflow" | "application";
  metrics: string[];
  thresholds?: Record<string, number | string>;
  cases: AssertionCase[];
};

export type EvalCaseResult = {
  id: string;
  name: string;
  status: EvalStatus;
  score: number;
  summary: string;
  failures: string[];
  latencyMs: number;
  metadata?: Record<string, unknown>;
};

export type EvalSuiteResult = {
  name: string;
  category: "component" | "workflow" | "application" | "guardrail";
  status: EvalStatus;
  metrics: Record<string, number>;
  cases: EvalCaseResult[];
  skippedReason?: string;
};

export type EvalReport = {
  timestamp: string;
  mode: "fixture";
  datasetCounts: Record<string, number>;
  componentScores: Record<string, number>;
  workflowScores: Record<string, number>;
  applicationScores: Record<string, number>;
  safetyGuardrailResults: EvalSuiteResult[];
  latencySummary: {
    totalMs: number;
    averageCaseMs: number;
  };
  failedCases: EvalCaseResult[];
  regressions: EvalCaseResult[];
  recommendedFixOrder: string[];
  suites: EvalSuiteResult[];
};
