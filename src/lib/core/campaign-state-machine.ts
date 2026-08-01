import {
  CampaignSchema,
  type AuditEvent,
  type Campaign,
  type CampaignStatus
} from "../../schemas";
import { createAuditEvent } from "./audit";

export const TERMINAL_CAMPAIGN_STATUSES = [
  "COMPLETED",
  "REJECTED_BY_POLICY",
  "OWNER_DECLINED",
  "PRAVA_EXPIRED",
  "PAYMENT_DECLINED",
  "PRICE_CHANGED",
  "PROVIDER_UNAVAILABLE",
  "CHECKOUT_FAILED",
  "ACTIVATION_FAILED",
  "CANCELLED"
] as const satisfies readonly CampaignStatus[];

export const CAMPAIGN_STATUS_TRANSITIONS = {
  DRAFT: ["NEEDS_INFORMATION", "READY_FOR_DISCOVERY", "CANCELLED"],
  NEEDS_INFORMATION: ["READY_FOR_DISCOVERY", "CANCELLED"],
  READY_FOR_DISCOVERY: ["VERIFYING_PROVIDERS", "REJECTED_BY_POLICY", "CANCELLED"],
  VERIFYING_PROVIDERS: [
    "OPTIONS_READY",
    "REJECTED_BY_POLICY",
    "PROVIDER_UNAVAILABLE",
    "CANCELLED"
  ],
  OPTIONS_READY: ["GENERATING_CREATIVE", "REJECTED_BY_POLICY", "CANCELLED"],
  GENERATING_CREATIVE: ["QUALITY_REVIEW", "REJECTED_BY_POLICY", "CANCELLED"],
  QUALITY_REVIEW: ["AWAITING_OWNER_APPROVAL", "REJECTED_BY_POLICY", "CANCELLED"],
  AWAITING_OWNER_APPROVAL: [
    "PRAVA_PENDING",
    "OWNER_DECLINED",
    "PRICE_CHANGED",
    "PROVIDER_UNAVAILABLE",
    "CANCELLED"
  ],
  PRAVA_PENDING: [
    "PAYMENT_AUTHORIZED",
    "PRAVA_EXPIRED",
    "PAYMENT_DECLINED",
    "PRICE_CHANGED",
    "PROVIDER_UNAVAILABLE",
    "CANCELLED"
  ],
  PAYMENT_AUTHORIZED: [
    "CHECKOUT_IN_PROGRESS",
    "PAYMENT_DECLINED",
    "PRICE_CHANGED",
    "PROVIDER_UNAVAILABLE",
    "CHECKOUT_FAILED",
    "CANCELLED"
  ],
  CHECKOUT_IN_PROGRESS: [
    "ORDER_COMPLETED",
    "PAYMENT_DECLINED",
    "PRICE_CHANGED",
    "PROVIDER_UNAVAILABLE",
    "CHECKOUT_FAILED"
  ],
  ORDER_COMPLETED: ["ACTIVATING", "ACTIVATION_FAILED"],
  ACTIVATING: ["ACTIVE", "ACTIVATION_FAILED", "PROVIDER_UNAVAILABLE"],
  ACTIVE: ["COMPLETED", "ACTIVATION_FAILED"],
  COMPLETED: [],
  REJECTED_BY_POLICY: [],
  OWNER_DECLINED: [],
  PRAVA_EXPIRED: [],
  PAYMENT_DECLINED: [],
  PRICE_CHANGED: [],
  PROVIDER_UNAVAILABLE: [],
  CHECKOUT_FAILED: [],
  ACTIVATION_FAILED: [],
  CANCELLED: []
} as const satisfies Record<CampaignStatus, readonly CampaignStatus[]>;

export type CampaignTransitionContext = {
  actorType?: AuditEvent["actorType"];
  actorId?: string;
  occurredAt?: Date | string;
  idempotencyKey?: string;
  eventType?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type CampaignTransitionResult = {
  campaign: Campaign;
  auditEvent: AuditEvent;
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return (CAMPAIGN_STATUS_TRANSITIONS[from] as readonly CampaignStatus[]).includes(to);
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid campaign status transition: ${from} -> ${to}`);
  }
}

export function transitionCampaign(
  campaign: Campaign,
  to: CampaignStatus,
  context: CampaignTransitionContext = {}
): CampaignTransitionResult {
  const from = campaign.status;

  assertTransition(from, to);

  const occurredAt = toUtcIsoString(context.occurredAt ?? new Date());
  const updatedCampaign = CampaignSchema.parse({
    ...campaign,
    status: to,
    updatedAt: occurredAt
  });
  const auditEvent = createAuditEvent(
    campaign.id,
    context.eventType ?? "CAMPAIGN_STATUS_CHANGED",
    context.description ?? `Campaign status changed from ${from} to ${to}.`,
    {
      ...context.metadata,
      actorType: context.actorType ?? "SYSTEM",
      actorId: context.actorId,
      occurredAt,
      idempotencyKey: context.idempotencyKey,
      previousState: from,
      nextState: to
    }
  );

  return {
    campaign: updatedCampaign,
    auditEvent
  };
}

function toUtcIsoString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    throw new Error("occurredAt must be a valid date");
  }

  return date.toISOString();
}

