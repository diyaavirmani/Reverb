import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);

export const LinqNormalizedEventSchema = z
  .object({
    eventId: nonEmptyStringSchema,
    eventType: nonEmptyStringSchema,
    conversationId: nonEmptyStringSchema,
    from: nonEmptyStringSchema,
    to: nonEmptyStringSchema,
    messageText: z.string(),
    raw: z.record(z.string(), z.unknown())
  })
  .strict();

export type LinqNormalizedEvent = z.infer<typeof LinqNormalizedEventSchema>;

export const LinqSendMessageRequestSchema = z
  .object({
    recipient: nonEmptyStringSchema,
    text: nonEmptyStringSchema,
    link: z.string().url().optional(),
    idempotencyKey: nonEmptyStringSchema
  })
  .strict();

export type LinqSendMessageRequest = z.infer<typeof LinqSendMessageRequestSchema>;

export const LinqSendMessageResultSchema = z
  .object({
    messageId: nonEmptyStringSchema,
    accepted: z.boolean(),
    idempotencyKey: nonEmptyStringSchema,
    isFixture: z.boolean()
  })
  .strict();

export type LinqSendMessageResult = z.infer<typeof LinqSendMessageResultSchema>;
