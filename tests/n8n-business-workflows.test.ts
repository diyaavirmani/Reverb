import { existsSync, readFileSync } from "node:fs";
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
};

const repositoryRoot = process.cwd();
const primaryWorkflows = [
  {
    file: "10-campaign-orchestrator.json",
    name: "Reverb Fill - 10 Campaign Orchestrator",
    path: "reverb/campaign",
    workflow: "campaign-orchestrator",
    backendNode: "Call Campaign Stage API",
    backendRoute: "/api/demo/campaign"
  },
  {
    file: "13-commerce.json",
    name: "Reverb Fill - 13 Commerce",
    path: "reverb/commerce",
    workflow: "commerce",
    backendNode: "Call Commerce Stage API",
    backendRoute: "/api/demo/commerce"
  },
  {
    file: "15-reservation-performance.json",
    name: "Reverb Fill - 15 Reservation Performance",
    path: "reverb/reservation",
    workflow: "reservation-performance",
    backendNode: "Call Reservation Stage API",
    backendRoute: "/api/demo/reservation"
  },
  {
    file: "16-campaign-reporting.json",
    name: "Reverb Fill - 16 Campaign Reporting",
    path: "reverb/report",
    workflow: "campaign-reporting",
    backendNode: "Call Report Stage API",
    backendRoute: "/api/demo/report"
  }
] as const;
const legacyWorkflowFiles = [
  "01-check-processed-event.json",
  "02-create-audit-event.json",
  "03-conversation-state.json",
  "04-payment-lock.json",
  "05-storage-gateway.json",
  "10-campaign-intake.json",
  "11-provider-discovery.json",
  "12-creative-quality.json",
  "13-prava-transaction.json",
  "14-promotion-activation.json",
  "15-reservation-performance.json",
  "16-campaign-reporting.json"
];
const retiredInternalReferences = [
  "N8N_CHECK_PROCESSED_EVENT_URL",
  "N8N_CREATE_AUDIT_EVENT_URL",
  "N8N_CONVERSATION_STATE_URL",
  "N8N_PAYMENT_LOCK_URL",
  "N8N_STORAGE_WEBHOOK_URL",
  "01-check-processed-event",
  "02-create-audit-event",
  "03-conversation-state",
  "05-storage-gateway",
  "11-provider-discovery",
  "12-creative-quality"
];

describe("simplified n8n workflows", () => {
  it.each(primaryWorkflows)(
    "keeps $file importable and inactive",
    ({ file, name, path: webhookPath }) => {
      const workflow = readWorkflow(file);
      const webhook = workflow.nodes.find((node) => node.type === "n8n-nodes-base.webhook");

      expect(workflow.name).toBe(name);
      expect(workflow.active).toBe(false);
      expect(workflow.nodes.map((node) => node.type)).toEqual([
        "n8n-nodes-base.webhook",
        "n8n-nodes-base.code",
        "n8n-nodes-base.httpRequest",
        "n8n-nodes-base.code",
        "n8n-nodes-base.respondToWebhook"
      ]);
      expect(webhook?.parameters.path).toBe(webhookPath);
      expect(workflow.nodes.some((node) => node.type === "n8n-nodes-base.respondToWebhook"))
        .toBe(true);
      expect(workflow.nodes.some((node) => "credentials" in node)).toBe(false);
    }
  );

  it("preserves the retired workflow exports under workflows-legacy", () => {
    for (const file of legacyWorkflowFiles) {
      expect(existsSync(path.join(repositoryRoot, "n8n", "workflows-legacy", file))).toBe(true);
    }
  });

  it("removes n8n-to-n8n plumbing from primary workflows", () => {
    for (const { file } of primaryWorkflows) {
      const rawWorkflow = readFileSync(
        path.join(repositoryRoot, "n8n", "workflows", file),
        "utf8"
      );

      for (const reference of retiredInternalReferences) {
        expect(rawWorkflow).not.toContain(reference);
      }
    }
  });

  it.each(primaryWorkflows)("uses the standard response contract in $file", ({ file, workflow }) => {
    const rawWorkflow = readFileSync(
      path.join(repositoryRoot, "n8n", "workflows", file),
      "utf8"
    );

    expect(rawWorkflow).toContain(`workflow: '${workflow}'`);
    expect(rawWorkflow).toContain("ok: true");
    expect(rawWorkflow).toContain("status: 'completed'");
    expect(rawWorkflow).toContain("errors: []");
    expect(rawWorkflow).toContain("ok: false");
    expect(rawWorkflow).toContain("status: 'failed'");
  });

  it.each(primaryWorkflows)(
    "calls backend product logic instead of duplicating business logic in $file",
    ({ file, backendNode, backendRoute }) => {
      const workflow = readWorkflow(file);
      const node = workflow.nodes.find((candidate) => candidate.name === backendNode);

      expect(node).toBeDefined();
      expect(node?.type).toBe("n8n-nodes-base.httpRequest");
      expect(JSON.stringify(node?.parameters)).toContain("$env.APP_URL");
      expect(JSON.stringify(node?.parameters)).toContain(backendRoute);
    }
  );
});

function readWorkflow(file: string): Workflow {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, "n8n", "workflows", file), "utf8")
  ) as Workflow;
}
