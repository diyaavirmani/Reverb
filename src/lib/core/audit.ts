import { randomUUID } from "node:crypto";

import { AuditEventSchema, type AuditEvent } from "../../schemas";

export type CreateAuditEventMetadata = Record<string, unknown> & {
  actorType?: AuditEvent["actorType"];
  actorId?: string;
  occurredAt?: Date | string;
  idempotencyKey?: string;
  previousState?: string | null;
  nextState?: string | null;
};

export function createAuditEvent(
  campaignId: string,
  eventType: string,
  description: string,
  metadata: CreateAuditEventMetadata = {}
): AuditEvent {
  if (eventType.trim() === "") {
    throw new Error("eventType is required");
  }

  if (description.trim() === "") {
    throw new Error("description is required");
  }

  const {
    actorType = "SYSTEM",
    actorId,
    occurredAt = new Date(),
    idempotencyKey,
    previousState = null,
    nextState = null,
    ...eventMetadata
  } = metadata;

  return AuditEventSchema.parse({
    id: `audit_${randomUUID()}`,
    entityType: "CAMPAIGN",
    entityId: campaignId,
    eventType,
    actorType,
    ...(actorId ? { actorId } : {}),
    occurredAt: toUtcIsoString(occurredAt),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    previousState,
    nextState,
    metadata: {
      description,
      ...eventMetadata
    }
  });
}

function toUtcIsoString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    throw new Error("occurredAt must be a valid date");
  }

  return date.toISOString();
}
