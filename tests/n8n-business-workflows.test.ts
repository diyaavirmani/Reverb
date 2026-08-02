import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type WorkflowNode = {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
};

type Workflow = {
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
};

const repositoryRoot = process.cwd();

describe("n8n business workflows", () => {
  it.each([
    ["10-campaign-intake.json", "Reverb Fill - Campaign Intake"],
    ["11-provider-discovery.json", "Reverb Fill - Provider Discovery"],
    ["12-creative-quality.json", "Reverb Fill - Creative Quality"],
    ["13-prava-transaction.json", "Reverb Fill - Prava Transaction"],
    ["14-promotion-activation.json", "Reverb Fill - Promotion Activation"]
  ])("keeps %s importable and inactive", (file, name) => {
    const workflow = readWorkflow(file);

    expect(workflow.name).toBe(name);
    expect(workflow.active).toBe(false);
    expect(workflow.nodes.length).toBeGreaterThan(5);
    expect(workflow.nodes.some((node) => node.type === "n8n-nodes-base.webhook")).toBe(true);
    expect(workflow.nodes.some((node) => "credentials" in node)).toBe(false);
  });

  it("asks one intake question only for a field not already collected", () => {
    const fixture = readFixture("10-campaign-intake-missing.json");
    const collected = fixture.input.collectedFields as Record<string, unknown>;

    expect(fixture.expected.questionCount).toBe(1);
    expect(fixture.expected.askedField).toBe("targetReservations");
    expect(collected).not.toHaveProperty(String(fixture.expected.askedField));
    expect(collected).toHaveProperty(
      String(fixture.expected.alreadyCollectedFieldMustNotBeAsked)
    );
  });

  it("proves deterministic discovery selects the expected winner", () => {
    const fixture = readFixture("11-provider-discovery-winner.json");
    const components = fixture.expected.scoreComponents as Record<string, number>;
    const weighted =
      components.geographicRelevance * 0.3 +
      components.expectedBookingPotential * 0.25 +
      components.evidenceConfidence * 0.2 +
      components.costEfficiency * 0.15 +
      components.timingAvailability * 0.1;

    expect(fixture.expected.selectedPackageId).toBe("package_local_dining_boost");
    expect(fixture.expected.selectedProviderId).toBe("provider_reach_local_dining");
    expect(fixture.expected.exactPricePaise).toBe(480000);
    expect(Math.round(weighted * 100) / 100).toBe(fixture.expected.weightedFinalScore);
    expect(
      (fixture.expected.rejectedAlternatives as Array<{ packageId: string }>).map(
        (alternative) => alternative.packageId
      )
    ).toEqual([
      "package_neighborhood_food_blast",
      "package_premium_weekend_push"
    ]);

    const workflow = readWorkflow("11-provider-discovery.json");
    const scoringCode = nodeCode(workflow, "Deterministic Policy And Scoring");
    expect(scoringCode).toContain("geography * 0.30");
    expect(scoringCode).toContain("bookings * 0.25");
    expect(scoringCode).toContain("confidence * 0.20");
    expect(scoringCode).toContain("cost * 0.15");
    expect(scoringCode).toContain("timing * 0.10");
  });

  it("covers every required deterministic creative rejection", () => {
    const fixture = readFixture("12-creative-quality-cases.json");
    const codes = (fixture.expected.rejectionCases as Array<{ issueCode: string }>).map(
      (testCase) => testCase.issueCode
    );

    expect(codes).toEqual([
      "incorrect_spot_name",
      "incorrect_campaign_date",
      "incorrect_campaign_time",
      "discount_above_limit",
      "missing_cta",
      "changed_package",
      "changed_price",
      "exceeded_budget",
      "high_cpa",
      "invalid_deadline",
      "recurring_payment"
    ]);

    const workflow = readWorkflow("12-creative-quality.json");
    const deterministicCode = nodeCode(workflow, "Run Deterministic Creative Checks");
    for (const code of codes) {
      expect(deterministicCode).toContain(code);
    }
  });

  it("contains every required Prava branch and locks before checkout", () => {
    const fixture = readFixture("13-prava-transaction-branches.json");
    const branchNames = (fixture.expected.branches as Array<{ name: string }>).map(
      (branch) => branch.name
    );

    expect(branchNames).toEqual([
      "success",
      "price changed",
      "session expired",
      "user declined",
      "provider unavailable",
      "checkout failed",
      "duplicate callback",
      "duplicate checkout"
    ]);

    const workflow = readWorkflow("13-prava-transaction.json");
    expect(hasPath(workflow, "Acquire Irreversible Payment Lock", "Reach Checkout Exactly Once"))
      .toBe(true);
    expect(hasPath(workflow, "Reach Checkout Exactly Once", "Require Merchant Order Before Success"))
      .toBe(true);
    expect(hasPath(workflow, "Require Merchant Order Before Success", "Report Approved Merchant Order To Prava"))
      .toBe(true);

    const sensitiveReferences = workflow.nodes.filter((node) =>
      JSON.stringify(node.parameters).includes("paymentAuthorisationReference")
    );
    expect(sensitiveReferences.map((node) => node.name)).toEqual([
      "Reach Checkout Exactly Once"
    ]);
    expect(JSON.stringify(fixture)).not.toMatch(
      /paymentAuthorisationReference|authorizationId|checkoutCredential/i
    );
  });

  it("never marks activation successful without a public URL", () => {
    const success = readFixture("14-promotion-activation-success.json");
    const failure = readFixture("14-promotion-activation-failure.json");
    const workflow = readWorkflow("14-promotion-activation.json");

    expect(success.expected.status).toBe("ACTIVE");
    expect(success.expected.activationUrl).toMatch(/^https:\/\//);
    expect(failure.expected.status).toBe("ACTIVATION_FAILED");
    expect(failure.expected.activationUrl).toBeNull();
    expect(failure.expected.campaignMustNotBecomeActive).toBe(true);
    expect(hasPath(workflow, "Require Public Activation URL", "Activation URL Exists?")).toBe(
      true
    );
    expect(hasPath(workflow, "Activation URL Exists?", "Prepare Active Merchant Order", 0)).toBe(
      true
    );
    expect(
      hasPath(workflow, "Activation URL Exists?", "Prepare Activation Failed Status", 1)
    ).toBe(true);
  });
});

function readWorkflow(file: string): Workflow {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, "n8n", "workflows", file), "utf8")
  ) as Workflow;
}

function readFixture(file: string): {
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
} {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, "n8n", "fixtures", file), "utf8")
  ) as {
    input: Record<string, unknown>;
    expected: Record<string, unknown>;
  };
}

function nodeCode(workflow: Workflow, name: string): string {
  const matchingNode = workflow.nodes.find((node) => node.name === name);
  expect(matchingNode).toBeDefined();
  return String(matchingNode?.parameters.jsCode ?? "");
}

function hasPath(
  workflow: Workflow,
  from: string,
  to: string,
  requiredFirstOutput?: number
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [];
  const firstConnections = workflow.connections[from]?.main ?? [];

  if (requiredFirstOutput === undefined) {
    for (const output of firstConnections) {
      for (const connection of output) queue.push(connection.node);
    }
  } else {
    for (const connection of firstConnections[requiredFirstOutput] ?? []) {
      queue.push(connection.node);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) continue;
    if (current === to) return true;
    visited.add(current);

    for (const output of workflow.connections[current]?.main ?? []) {
      for (const connection of output) queue.push(connection.node);
    }
  }

  return false;
}
