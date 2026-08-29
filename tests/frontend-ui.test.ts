import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { workflow } from "../src/components/demo-data";
import { demoSnapshotStorageKey, parseDemoCampaignDraft, parseDemoSnapshot, type DemoSnapshot } from "../src/components/demo-state";

const routeFiles = {
  landing: "src/app/page.tsx",
  dashboard: "src/components/dashboard-page.tsx",
  create: "src/app/campaigns/new/page.tsx",
  demo: "src/components/campaign-journey.tsx",
  approval: "src/app/approval/page.tsx",
  results: "src/app/performance/page.tsx"
};

const activeUiFiles = [
  ...Object.values(routeFiles),
  "src/app/layout.tsx",
  "src/app/dashboard/page.tsx",
  "src/components/app-shell.tsx",
  "src/components/campaign-calendar.tsx",
  "src/components/campaign-date-text.tsx",
  "src/components/campaign-form.tsx",
  "src/components/demo-data.ts",
  "src/components/demo-launcher.tsx",
  "src/components/ui.tsx"
];

describe("approved frontend journey", () => {
  it("keeps the seven conceptual stages in the approved order", () => {
    expect(workflow).toEqual([
      "Campaign Request",
      "Verified Discovery",
      "Agent Decision",
      "Creative Review",
      "Campaign Approval",
      "Campaign Launch",
      "Reservations"
    ]);
  });

  it("keeps the approved screen headings on their target routes", () => {
    expect(source(routeFiles.landing)).toContain("Fill quiet slots.");
    expect(source(routeFiles.dashboard)).toContain("Active Campaign");
    expect(source(routeFiles.create)).toContain("Create Campaign");
    expect(source(routeFiles.demo)).toContain("Provider Discovery");
    expect(source(routeFiles.demo)).toContain("Creative Review");
    expect(source(routeFiles.approval)).toContain("Secure Campaign Approval");
    expect(source(routeFiles.results)).toContain("Results & Reservations");
  });
  it("uses the simplified Reverb brand and focused landing hero", () => {
    const landing = source(routeFiles.landing);
    const shell = source("src/components/app-shell.tsx");
    const activeSource = activeUiFiles.map(source).join("\n");

    expect(shell).toContain('src="/images/reverb-wordmark.png"');
    expect(shell).toContain('alt="Reverb"');
    expect(shell).toContain('aria-label="Reverb home"');
    expect(shell).not.toContain("brand-signal");
    expect(shell).not.toContain("Run Demo");
    expect(landing).toContain("An AI agent that finds empty capacity, launches promotions, and turns it into measurable revenue.");
    expect(landing).toContain("Get Started");
    expect(landing).not.toContain("Agentic commerce for local spots");
    expect(landing).not.toContain("See it in action");
    expect(landing).not.toContain('className="text-cta"');
    expect(activeSource).not.toContain("Reverb Fill");
  });

  it("uses the authoritative lifecycle and versioned client snapshot", () => {
    const form = source("src/components/campaign-form.tsx");
    expect(form).toContain('fetch("/api/demo/lifecycle"');
    expect(form).toContain("persistDemoSnapshot");
    expect(demoSnapshotStorageKey).toBe("reverb-demo-snapshot-v1");
  });

  it("excludes obsolete integration brands and card-payment inputs from active UI", () => {
    const activeSource = activeUiFiles.map(source).join("\n");
    expect(activeSource).not.toMatch(/\b(?:prava|senso|linq)\b/i);
    expect(activeSource).not.toMatch(/card number|cardholder|\bcvv\b|\bexpiry\b|visa/i);
    expect(activeSource).toContain("Demo transaction — no real payment will be processed.");
  });

  it("rejects malformed persisted snapshots", () => {
    expect(parseDemoSnapshot(null)).toBeNull();
    expect(parseDemoSnapshot("not-json")).toBeNull();
    expect(parseDemoSnapshot(JSON.stringify({ version: 1 }))).toBeNull();
  });
  it("keeps one validated campaign date across the persisted frontend journey", () => {
    const draft = validSnapshot().campaign;

    expect(parseDemoCampaignDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parseDemoCampaignDraft(JSON.stringify({ ...draft, date: "2026-02-30" }))).toBeNull();
    expect(source(routeFiles.dashboard)).toContain("persistDemoCampaignDate");
    expect(source(routeFiles.create)).toContain("CampaignForm");
    expect(source(routeFiles.demo)).toContain("loadDemoCampaignDraft");
    expect(source(routeFiles.approval)).toContain("CampaignDateText");
    expect(source(routeFiles.results)).toContain("CampaignDateText");
  });

  it("restores a valid persisted lifecycle snapshot", () => {
    const snapshot = validSnapshot();
    expect(parseDemoSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function validSnapshot(): DemoSnapshot {
  return {
    version: 1,
    campaign: {
      spot: "Café Aura",
      unusedCapacity: 12,
      date: "2026-09-04",
      startTime: "19:00",
      endTime: "21:00",
      targetReservations: 6,
      maximumBudgetPaise: 500000,
      maximumDiscountPercent: 15,
      maximumCpaPaise: 85000
    },
    lifecycle: {
      mode: "fixture",
      campaignId: "campaign_demo",
      finalStatus: "ACTIVE",
      selectedOptionId: "option_demo",
      selectedPackageId: "package_local_dining_boost",
      eligibleOptionCount: 1,
      rejectedOptionCount: 3,
      qualityStatus: "PASSED",
      ownerApprovalStatus: "APPROVED",
      paymentSessionStatus: "AUTHORIZED",
      transactionStatus: "COMPLETED",
      merchantOrderId: "order_demo",
      activationStatus: "ACTIVE",
      publicActivationUrl: "https://example.test/demo",
      reservationId: "reservation_demo",
      isDemoBooking: true,
      performance: {
        confirmedReservationCount: 0,
        confirmedGuestCount: 0,
        remainingCapacity: 12,
        capacityRecoveryPercent: 0,
        actualCostPerReservationPaise: null,
        estimatedRevenueRecoveredPaise: 0
      },
      auditEventCount: 21
    },
    stage: "discovery",
    creativeCaption: "Friday plans?",
    approved: false,
    addedReservations: []
  };
}
