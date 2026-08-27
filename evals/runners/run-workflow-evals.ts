import { gradeAssertionCase } from "../graders/deterministic-graders";
import { postSignedJson } from "../utils/eval-client";
import { writeEvalReport } from "../utils/eval-report";
import { logSafe, logSuiteSummary } from "../utils/eval-logger";
import {
  loadEvalEnvironment,
  missingEnvNames,
  presentEnvNames,
  workflowEnvNames,
  type EvalEnvironment
} from "../utils/eval-sandbox";
import type { AssertionCase, EvalCaseResult, EvalDataset, EvalSuiteResult } from "../utils/eval-types";
import { assertEvalEnvironment, exitForSuites, isMainModule, readDatasets, statusLine } from "./shared";

const suiteAliases: Record<string, string> = {
  "campaign-orchestrator": "campaign-orchestrator",
  campaign: "campaign-orchestrator",
  commerce: "commerce",
  "reservation-performance": "reservation-performance",
  reservation: "reservation-performance",
  reporting: "reporting"
};

const workflowUrlByDataset: Record<string, string> = {
  "campaign-orchestrator": "N8N_CAMPAIGN_URL",
  commerce: "N8N_COMMERCE_URL",
  "reservation-performance": "N8N_RESERVATION_URL",
  reporting: "N8N_REPORT_URL"
};

export type WorkflowEvalOptions = {
  suite?: string;
};

export async function runWorkflowEvals(options: WorkflowEvalOptions = {}): Promise<EvalSuiteResult[]> {
  const env = await loadEvalEnvironment();
  assertEvalEnvironment(env);
  logSafe(`Workflow env present by name: ${presentEnvNames(env, workflowEnvNames).join(", ") || "none"}`);
  logSafe(`Workflow env missing by name: ${missingEnvNames(env, workflowEnvNames).join(", ") || "none"}`);
  const datasets = filterDatasets(await readDatasets("workflow"), options.suite);

  if (env.EVAL_EXECUTE_WORKFLOWS !== "true") {
    return datasets.map((dataset) => skippedSuite(dataset, "Workflow execution skipped. Set EVAL_EXECUTE_WORKFLOWS=true to call local n8n webhooks."));
  }

  return Promise.all(datasets.map((dataset) => executeWorkflowDataset(dataset, env)));
}

function filterDatasets(datasets: EvalDataset[], requestedSuite: string | undefined): EvalDataset[] {
  if (requestedSuite === undefined) {
    return datasets;
  }

  const suiteName = suiteAliases[requestedSuite];
  const validSuiteNames = Object.keys(suiteAliases).sort();

  if (suiteName === undefined) {
    throw new Error(
      `Unknown workflow suite: ${requestedSuite}. Valid suites: ${validSuiteNames.join(", ")}`
    );
  }

  return datasets.filter((dataset) => dataset.name === suiteName);
}

async function executeWorkflowDataset(dataset: EvalDataset, env: EvalEnvironment): Promise<EvalSuiteResult> {
  const envName = workflowUrlByDataset[dataset.name];
  const url = envName ? env[envName] : undefined;

  if (!url) {
    return skippedSuite(dataset, `Workflow evals skipped because ${envName ?? "workflow URL"} is missing.`);
  }

  const cases = await Promise.all(dataset.cases.map((testCase) => executeWorkflowCase(testCase, url, env)));
  const failed = cases.filter((testCase) => testCase.status === "fail");

  return {
    name: dataset.name,
    category: "workflow",
    status: failed.length === 0 ? "pass" : "fail",
    metrics: {
      pass_rate: cases.length === 0 ? 1 : (cases.length - failed.length) / cases.length,
      failed_case_count: failed.length
    },
    cases
  };
}

async function executeWorkflowCase(
  testCase: AssertionCase,
  url: string,
  env: EvalEnvironment
): Promise<EvalCaseResult> {
  const payload = buildWorkflowPayload(testCase);

  try {
    const response = await postSignedJson(url, payload, env);
    const failures = [
      ...(response.emptyBody ? ["n8n returned an empty response body."] : []),
      ...(response.ok ? [] : [`n8n returned HTTP ${response.status}.`])
    ];
    const failureCause = classifyFailure(failures);

    return {
      id: testCase.id,
      name: testCase.name,
      status: failures.length === 0 ? "pass" : "fail",
      score: failures.length === 0 ? 1 : 0,
      summary: failures.length === 0 ? `HTTP ${response.status}.` : failures.join("; "),
      failures,
      latencyMs: response.latencyMs,
      metadata: { status: response.status, failureCause, tags: testCase.tags ?? [] }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow error.";
    return {
      id: testCase.id,
      name: testCase.name,
      status: "fail",
      score: 0,
      summary: message,
      failures: [message],
      latencyMs: 0,
      metadata: { failureCause: classifyFailure([message]), tags: testCase.tags ?? [] }
    };
  }
}

function buildWorkflowPayload(testCase: AssertionCase): Record<string, unknown> {
  return {
    request_id: testCase.id,
    eval_id: testCase.id,
    evalId: testCase.id,
    source: "reverb_eval_harness",
    ...testCase.input
  };
}

function classifyFailure(failures: string[]): string | null {
  const joinedFailures = failures.join(" ").toLowerCase();

  if (joinedFailures.includes("empty response body")) return "empty_n8n_response";
  if (joinedFailures.includes("request_id")) return "missing_request_id";
  if (joinedFailures.includes("unsupported") || joinedFailures.includes("invalid_operation")) {
    return "unsupported_storage_operation";
  }
  if (joinedFailures.includes("google") || joinedFailures.includes("sheet")) {
    return "google_sheets_side_effect_mismatch";
  }
  if (joinedFailures.includes("payload")) return "wrong_eval_payload";
  if (joinedFailures.includes("http")) return "n8n_workflow_response_contract_issue";
  return failures.length === 0 ? null : "n8n_workflow_response_contract_issue";
}

function skippedSuite(dataset: EvalDataset, reason: string): EvalSuiteResult {
  return {
    name: dataset.name,
    category: "workflow",
    status: "skip",
    metrics: {
      pass_rate: 0,
      skipped_case_count: dataset.cases.length
    },
    cases: dataset.cases.map((testCase) => ({
      ...gradeAssertionCase({ ...testCase, actual: testCase.expected }),
      status: "skip",
      score: 0,
      summary: reason,
      failures: []
    })),
    skippedReason: reason
  };
}

if (isMainModule(import.meta.url)) {
  const options = parseCliOptions(process.argv.slice(2));
  const suites = await runWorkflowEvals(options);
  await writeEvalReport(suites);
  for (const suite of suites) {
    logSafe(`Workflow suite: ${suite.name}`);
    logSafe(`Cases run: ${suite.cases.length}`);
    logSafe(`Passed: ${suite.cases.filter((testCase) => testCase.status === "pass").length}`);
    logSafe(`Failed: ${suite.cases.filter((testCase) => testCase.status === "fail").length}`);
    logSafe(`Skipped: ${suite.cases.filter((testCase) => testCase.status === "skip").length}`);
  }
  logSuiteSummary("Workflow evals", suites.some((suite) => suite.status === "fail") ? "FAIL" : "PASS", statusLine(suites));
  exitForSuites(suites);
}

function parseCliOptions(args: string[]): WorkflowEvalOptions {
  const suiteFlagIndex = args.indexOf("--suite");

  if (suiteFlagIndex === -1) {
    return {};
  }

  const suite = args[suiteFlagIndex + 1];

  if (suite === undefined || suite.trim() === "" || suite.startsWith("--")) {
    throw new Error(`--suite requires a suite name. Valid suites: ${Object.keys(suiteAliases).sort().join(", ")}`);
  }

  return { suite };
}
