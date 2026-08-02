import { z } from "zod";

import { PaiseSchema, UtcDateTimeStringSchema } from "./domain";

const nonEmptyStringSchema = z.string().min(1);

export const PravaPaymentResultStatusSchema = z.enum([
  "AWAITING_USER",
  "AUTHORIZED",
  "DECLINED",
  "EXPIRED",
  "FAILED",
  "COMPLETED"
]);

export type PravaPaymentResultStatus = z.infer<typeof PravaPaymentResultStatusSchema>;

export const PravaPaymentContextSchema = z
  .object({
    campaignId: nonEmptyStringSchema,
    merchantId: nonEmptyStringSchema,
    packageId: nonEmptyStringSchema,
    merchantName: nonEmptyStringSchema,
    packageName: nonEmptyStringSchema,
    amountPaise: PaiseSchema,
    currency: z.literal("INR"),
    callbackUrl: z.string().url(),
    idempotencyKey: nonEmptyStringSchema
  })
  .strict();

export type PravaPaymentContext = z.infer<typeof PravaPaymentContextSchema>;

export const PravaCreateSessionRequestSchema = PravaPaymentContextSchema;
export type PravaCreateSessionRequest = z.infer<typeof PravaCreateSessionRequestSchema>;

export const PravaCreateSessionResultSchema = z
  .object({
    sessionId: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    status: PravaPaymentResultStatusSchema,
    currency: z.literal("INR"),
    amountPaise: PaiseSchema,
    checkoutUrl: z.string().url().nullable(),
    authorizationId: nonEmptyStringSchema.nullable(),
    expiresAt: UtcDateTimeStringSchema.nullable(),
    isFixture: z.boolean()
  })
  .strict();

export type PravaCreateSessionResult = z.infer<typeof PravaCreateSessionResultSchema>;

export const PravaGetPaymentResultRequestSchema = z
  .object({
    campaignId: nonEmptyStringSchema,
    sessionId: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema.optional()
  })
  .strict();

export type PravaGetPaymentResultRequest = z.infer<typeof PravaGetPaymentResultRequestSchema>;

export const PravaPaymentResultSchema = z
  .object({
    sessionId: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    status: PravaPaymentResultStatusSchema,
    currency: z.literal("INR"),
    amountPaise: PaiseSchema,
    authorizationId: nonEmptyStringSchema.nullable(),
    completedAt: UtcDateTimeStringSchema.nullable(),
    expiresAt: UtcDateTimeStringSchema.nullable(),
    declinedReason: nonEmptyStringSchema.nullable(),
    failureReason: nonEmptyStringSchema.nullable(),
    isFixture: z.boolean()
  })
  .strict();

export type PravaPaymentResult = z.infer<typeof PravaPaymentResultSchema>;

export const PravaCheckoutOutcomeSchema = z.enum(["MERCHANT_ORDER_CREATED", "CHECKOUT_FAILED"]);
export type PravaCheckoutOutcome = z.infer<typeof PravaCheckoutOutcomeSchema>;

export const PravaReportCheckoutOutcomeRequestSchema = PravaPaymentContextSchema.extend({
  sessionId: nonEmptyStringSchema,
  checkoutOutcome: PravaCheckoutOutcomeSchema,
  merchantOrderId: nonEmptyStringSchema.nullable(),
  occurredAt: UtcDateTimeStringSchema.optional(),
  failureReason: nonEmptyStringSchema.optional()
})
  .strict()
  .superRefine((request, context) => {
    if (request.checkoutOutcome === "MERCHANT_ORDER_CREATED" && request.merchantOrderId === null) {
      context.addIssue({
        code: "custom",
        path: ["merchantOrderId"],
        message: "merchantOrderId is required before reporting a completed checkout"
      });
    }
  });

export type PravaReportCheckoutOutcomeRequest = z.infer<
  typeof PravaReportCheckoutOutcomeRequestSchema
>;

export const PravaReportCheckoutOutcomeResultSchema = z
  .object({
    campaignId: nonEmptyStringSchema,
    sessionId: nonEmptyStringSchema,
    received: z.boolean(),
    status: z.enum(["COMPLETED", "FAILED"]),
    merchantOrderId: nonEmptyStringSchema.nullable(),
    isFixture: z.boolean()
  })
  .strict();

export type PravaReportCheckoutOutcomeResult = z.infer<
  typeof PravaReportCheckoutOutcomeResultSchema
>;
