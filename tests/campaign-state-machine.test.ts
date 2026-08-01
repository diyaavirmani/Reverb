import { describe, expect, it } from "vitest";

import { createAuditEvent } from "../src/lib/core/audit";
import {
  CAMPAIGN_STATUS_TRANSITIONS,
  TERMINAL_CAMPAIGN_STATUSES,
  assertTransition,
  canTransition,
  transitionCampaign
} from "../src/lib/core/campaign-state-machine";
import { CampaignStatusSchema, type Campaign, type CampaignStatus } from "../src/schemas";

const baseCampaign: Campaign = {
  id: "campaign_state_001",
  spotId: "spot_quiet_cup_cafe",
  requestedByOwnerId: "owner_diya_demo",
  status: "DRAFT",
  requestSummary: "Fill 12 unused seats on Friday evening.",
  slotStartAt: "2026-08-07T13:30:00.000Z",
  slotEndAt: "2026-08-07T15:30:00.000Z",
  unusedCapacity: 12,
  targetReservations: 6,
  maxBudgetPaise: 500000,
  maxDiscountBps: 1500,
  maxExpectedCpaPaise: 85000,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

const happyPathTransitions: Array<[CampaignStatus, CampaignStatus]> = [
  ["DRAFT", "READY_FOR_DISCOVERY"],
  ["READY_FOR_DISCOVERY", "VERIFYING_PROVIDERS"],
  ["VERIFYING_PROVIDERS", "OPTIONS_READY"],
  ["OPTIONS_READY", "GENERATING_CREATIVE"],
  ["GENERATING_CREATIVE", "QUALITY_REVIEW"],
  ["QUALITY_REVIEW", "AWAITING_OWNER_APPROVAL"],
  ["AWAITING_OWNER_APPROVAL", "PRAVA_PENDING"],
  ["PRAVA_PENDING", "PAYMENT_AUTHORIZED"],
  ["PAYMENT_AUTHORIZED", "CHECKOUT_IN_PROGRESS"],
  ["CHECKOUT_IN_PROGRESS", "ORDER_COMPLETED"],
  ["ORDER_COMPLETED", "ACTIVATING"],
  ["ACTIVATING", "ACTIVE"],
  ["ACTIVE", "COMPLETED"]
];

describe("campaign state machine", () => {
  it("defines transition entries for every campaign status", () => {
    expect(Object.keys(CAMPAIGN_STATUS_TRANSITIONS).sort()).toEqual(
      [...CampaignStatusSchema.options].sort()
    );
  });

  it.each([
    ["DRAFT", "NEEDS_INFORMATION"],
    ["NEEDS_INFORMATION", "READY_FOR_DISCOVERY"],
    ...happyPathTransitions
  ] satisfies Array<[CampaignStatus, CampaignStatus]>)(
    "allows %s -> %s",
    (from, to) => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  );

  it.each([
    ["READY_FOR_DISCOVERY", "REJECTED_BY_POLICY"],
    ["VERIFYING_PROVIDERS", "PROVIDER_UNAVAILABLE"],
    ["OPTIONS_READY", "REJECTED_BY_POLICY"],
    ["GENERATING_CREATIVE", "REJECTED_BY_POLICY"],
    ["QUALITY_REVIEW", "REJECTED_BY_POLICY"],
    ["AWAITING_OWNER_APPROVAL", "OWNER_DECLINED"],
    ["AWAITING_OWNER_APPROVAL", "PRICE_CHANGED"],
    ["PRAVA_PENDING", "PRAVA_EXPIRED"],
    ["PRAVA_PENDING", "PAYMENT_DECLINED"],
    ["PAYMENT_AUTHORIZED", "PRICE_CHANGED"],
    ["PAYMENT_AUTHORIZED", "CHECKOUT_FAILED"],
    ["CHECKOUT_IN_PROGRESS", "CHECKOUT_FAILED"],
    ["CHECKOUT_IN_PROGRESS", "PRICE_CHANGED"],
    ["ORDER_COMPLETED", "ACTIVATION_FAILED"],
    ["ACTIVATING", "ACTIVATION_FAILED"],
    ["ACTIVE", "ACTIVATION_FAILED"]
  ] satisfies Array<[CampaignStatus, CampaignStatus]>)(
    "allows explicit failure transition %s -> %s",
    (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    }
  );

  it.each([
    ["READY_FOR_DISCOVERY", "DRAFT"],
    ["OPTIONS_READY", "VERIFYING_PROVIDERS"],
    ["PAYMENT_AUTHORIZED", "PRAVA_PENDING"],
    ["ACTIVE", "ACTIVATING"]
  ] satisfies Array<[CampaignStatus, CampaignStatus]>)(
    "rejects backwards transition %s -> %s",
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(
        `Invalid campaign status transition: ${from} -> ${to}`
      );
    }
  );

  it.each([
    ["DRAFT", "VERIFYING_PROVIDERS"],
    ["READY_FOR_DISCOVERY", "OPTIONS_READY"],
    ["OPTIONS_READY", "PRAVA_PENDING"],
    ["AWAITING_OWNER_APPROVAL", "PAYMENT_AUTHORIZED"],
    ["PRAVA_PENDING", "CHECKOUT_IN_PROGRESS"],
    ["PAYMENT_AUTHORIZED", "ORDER_COMPLETED"],
    ["CHECKOUT_IN_PROGRESS", "ACTIVE"],
    ["ORDER_COMPLETED", "ACTIVE"]
  ] satisfies Array<[CampaignStatus, CampaignStatus]>)(
    "rejects direct skipped transition %s -> %s",
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow();
    }
  );

  it("marks terminal states as having no outgoing transitions", () => {
    TERMINAL_CAMPAIGN_STATUSES.forEach((status) => {
      expect(CAMPAIGN_STATUS_TRANSITIONS[status]).toEqual([]);
    });
  });

  it("transitions a campaign and produces an audit event", () => {
    const result = transitionCampaign(baseCampaign, "READY_FOR_DISCOVERY", {
      actorType: "OWNER",
      actorId: "owner_diya_demo",
      occurredAt: "2026-08-01T10:00:00.000Z",
      idempotencyKey: "idem_transition_001",
      metadata: {
        source: "test"
      }
    });

    expect(result.campaign).toEqual({
      ...baseCampaign,
      status: "READY_FOR_DISCOVERY",
      updatedAt: "2026-08-01T10:00:00.000Z"
    });
    expect(result.auditEvent).toMatchObject({
      entityType: "CAMPAIGN",
      entityId: baseCampaign.id,
      eventType: "CAMPAIGN_STATUS_CHANGED",
      actorType: "OWNER",
      actorId: "owner_diya_demo",
      occurredAt: "2026-08-01T10:00:00.000Z",
      idempotencyKey: "idem_transition_001",
      previousState: "DRAFT",
      nextState: "READY_FOR_DISCOVERY",
      metadata: {
        description: "Campaign status changed from DRAFT to READY_FOR_DISCOVERY.",
        source: "test"
      }
    });
    expect(result.auditEvent.id).toMatch(/^audit_/);
  });

  it("rejects invalid transitions without producing an update", () => {
    expect(() => transitionCampaign(baseCampaign, "ACTIVE")).toThrow(
      "Invalid campaign status transition: DRAFT -> ACTIVE"
    );
  });
});

describe("createAuditEvent", () => {
  it("creates a strict campaign audit event", () => {
    const auditEvent = createAuditEvent(
      "campaign_state_001",
      "CUSTOM_EVENT",
      "Custom audit event.",
      {
        actorType: "SYSTEM",
        occurredAt: "2026-08-01T11:00:00.000Z",
        previousState: "OPTIONS_READY",
        nextState: "GENERATING_CREATIVE",
        reason: "test"
      }
    );

    expect(auditEvent).toMatchObject({
      entityType: "CAMPAIGN",
      entityId: "campaign_state_001",
      eventType: "CUSTOM_EVENT",
      actorType: "SYSTEM",
      occurredAt: "2026-08-01T11:00:00.000Z",
      previousState: "OPTIONS_READY",
      nextState: "GENERATING_CREATIVE",
      metadata: {
        description: "Custom audit event.",
        reason: "test"
      }
    });
  });

  it("requires a non-empty event type and description", () => {
    expect(() => createAuditEvent("campaign_state_001", "", "description")).toThrow(
      "eventType is required"
    );
    expect(() => createAuditEvent("campaign_state_001", "EVENT", "")).toThrow(
      "description is required"
    );
  });
});
