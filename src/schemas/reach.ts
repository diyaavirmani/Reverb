import { z } from "zod";

import {
  MerchantOrderSchema,
  OrderStatusSchema,
  PaiseSchema,
  UtcDateTimeStringSchema
} from "./domain";

const nonEmptyStringSchema = z.string().min(1);
const percentBpsSchema = z.number().int().min(0).max(10000);
const positiveIntegerSchema = z.number().int().positive();

export const ReachPackageSchema = z
  .object({
    packageId: nonEmptyStringSchema,
    providerId: nonEmptyStringSchema,
    merchantId: nonEmptyStringSchema,
    merchantName: nonEmptyStringSchema,
    packageName: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    currency: z.literal("INR"),
    catalogPricePaise: PaiseSchema,
    livePricePaise: PaiseSchema,
    expectedReservations: positiveIntegerSchema,
    expectedCpaPaise: PaiseSchema,
    discountBps: percentBpsSchema,
    publicationDeadlineAt: UtcDateTimeStringSchema,
    validFrom: UtcDateTimeStringSchema,
    validUntil: UtcDateTimeStringSchema,
    available: z.boolean(),
    priceChangedFromPaise: PaiseSchema.nullable()
  })
  .strict();

export type ReachPackage = z.infer<typeof ReachPackageSchema>;

export const ReachQuoteSchema = z
  .object({
    packageId: nonEmptyStringSchema,
    merchantId: nonEmptyStringSchema,
    merchantName: nonEmptyStringSchema,
    currency: z.literal("INR"),
    livePricePaise: PaiseSchema,
    available: z.boolean(),
    publicationDeadlineAt: UtcDateTimeStringSchema,
    priceChangedFromPaise: PaiseSchema.nullable()
  })
  .strict();

export type ReachQuote = z.infer<typeof ReachQuoteSchema>;

export const ReachCheckoutRequestSchema = z
  .object({
    campaignId: nonEmptyStringSchema,
    packageId: nonEmptyStringSchema,
    approvedMerchantId: nonEmptyStringSchema,
    approvedAmountPaise: PaiseSchema,
    idempotencyKey: nonEmptyStringSchema,
    paymentAuthorisationReference: nonEmptyStringSchema
  })
  .strict();

export type ReachCheckoutRequest = z.infer<typeof ReachCheckoutRequestSchema>;

export const ReachCheckoutResultSchema = z
  .object({
    orderId: nonEmptyStringSchema,
    externalMerchantOrderId: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    packageId: nonEmptyStringSchema,
    merchantId: nonEmptyStringSchema,
    merchantName: nonEmptyStringSchema,
    amountPaise: PaiseSchema,
    currency: z.literal("INR"),
    status: OrderStatusSchema,
    idempotencyKey: nonEmptyStringSchema,
    duplicate: z.boolean()
  })
  .strict();

export type ReachCheckoutResult = z.infer<typeof ReachCheckoutResultSchema>;

export const ReachOrderDetailsSchema = z
  .object({
    order: MerchantOrderSchema,
    campaignId: nonEmptyStringSchema,
    packageId: nonEmptyStringSchema,
    merchantId: nonEmptyStringSchema,
    merchantName: nonEmptyStringSchema,
    delivered: z.boolean(),
    activated: z.boolean(),
    creativeAssetId: nonEmptyStringSchema.nullable(),
    briefAssetId: nonEmptyStringSchema.nullable(),
    publicActivationUrl: z.string().url().nullable()
  })
  .strict();

export type ReachOrderDetails = z.infer<typeof ReachOrderDetailsSchema>;

export const ReachDeliverRequestSchema = z
  .object({
    approvedCreative: nonEmptyStringSchema,
    campaignBrief: nonEmptyStringSchema
  })
  .strict();

export type ReachDeliverRequest = z.infer<typeof ReachDeliverRequestSchema>;

export const ReachDeliveryResultSchema = z
  .object({
    order: ReachOrderDetailsSchema,
    creativeAssetId: nonEmptyStringSchema,
    briefAssetId: nonEmptyStringSchema
  })
  .strict();

export type ReachDeliveryResult = z.infer<typeof ReachDeliveryResultSchema>;

export const ReachActivationResultSchema = z
  .object({
    order: ReachOrderDetailsSchema,
    publicActivationUrl: z.string().url()
  })
  .strict();

export type ReachActivationResult = z.infer<typeof ReachActivationResultSchema>;
