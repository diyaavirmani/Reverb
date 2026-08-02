import { LinqNormalizedEventSchema, type LinqNormalizedEvent } from "../../../schemas";

export class LinqNormalizationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "LinqNormalizationError";
  }
}

export function normalizeLinqEvent(value: unknown): LinqNormalizedEvent {
  const raw = asRecord(value);

  if (raw === null) {
    throw new LinqNormalizationError("INVALID_EVENT", "Linq event must be a JSON object.");
  }

  const data = recordValue(raw.data) ?? raw;
  const message = recordValue(data.message) ?? recordValue(raw.message) ?? data;
  const conversation = recordValue(data.conversation) ?? recordValue(raw.conversation);

  const eventId = firstString(
    raw.eventId,
    raw.event_id,
    raw.id,
    data.eventId,
    data.event_id,
    data.id
  );

  if (eventId === undefined) {
    throw new LinqNormalizationError("MISSING_EVENT_ID", "Linq event ID is required.");
  }

  const normalized = {
    eventId,
    eventType: requireString(
      "event type",
      raw.eventType,
      raw.event_type,
      raw.type,
      data.eventType,
      data.event_type,
      data.type
    ),
    conversationId: requireString(
      "conversation ID",
      raw.conversationId,
      raw.conversation_id,
      data.conversationId,
      data.conversation_id,
      conversation?.id
    ),
    from: requireString("sender", message.from, data.from, raw.from),
    to: requireString("recipient", message.to, data.to, raw.to),
    messageText:
      firstString(message.text, message.body, data.messageText, data.message_text, raw.messageText) ??
      "",
    raw
  };

  return LinqNormalizedEventSchema.parse(normalized);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return asRecord(value) ?? undefined;
}

function requireString(label: string, ...values: unknown[]): string {
  const value = firstString(...values);

  if (value === undefined) {
    throw new LinqNormalizationError(
      `MISSING_${label.toUpperCase().replaceAll(" ", "_")}`,
      `Linq ${label} is required.`
    );
  }

  return value;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
}
