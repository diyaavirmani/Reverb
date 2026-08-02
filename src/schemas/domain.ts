import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);
const percentBpsSchema = z.number().int().min(0).max(10000);
const positiveIntegerSchema = z.number().int().positive();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const PaiseSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const UtcDateTimeStringSchema = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
      return false;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    const normalizedInput = value.includes(".") ? value : value.replace("Z", ".000Z");
    return parsed.toISOString() === normalizedInput;
  },
  { message: "Expected an ISO-8601 UTC timestamp ending in Z" }
);

export const CampaignStatusSchema = z.enum([
  "DRAFT",
  "NEEDS_INFORMATION",
  "READY_FOR_DISCOVERY",
  "VERIFYING_PROVIDERS",
  "OPTIONS_READY",
  "GENERATING_CREATIVE",
  "QUALITY_REVIEW",
  "AWAITING_OWNER_APPROVAL",
  "PRAVA_PENDING",
  "PAYMENT_AUTHORIZED",
  "CHECKOUT_IN_PROGRESS",
  "ORDER_COMPLETED",
  "ACTIVATING",
  "ACTIVE",
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
]);

export const VerificationStatusSchema = z.enum([
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED"
]);

export const PaymentStatusSchema = z.enum([
  "NOT_CREATED",
  "SESSION_CREATED",
  "AWAITING_USER",
  "AUTHORIZED",
  "CHECKOUT_ATTEMPTED",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "FAILED"
]);

export const OrderStatusSchema = z.enum([
  "CREATED",
  "PAID",
  "BRIEF_DELIVERED",
  "SCHEDULED",
  "ACTIVE",
  "CANCELLED",
  "FAILED"
]);

export const CampaignStatus = CampaignStatusSchema.enum;
export const VerificationStatus = VerificationStatusSchema.enum;
export const PaymentStatus = PaymentStatusSchema.enum;
export const OrderStatus = OrderStatusSchema.enum;

export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

const addressSchema = z
  .object({
    line1: nonEmptyStringSchema,
    line2: z.string().optional(),
    city: nonEmptyStringSchema,
    region: z.string().optional(),
    postalCode: z.string().optional(),
    countryCode: z.string().length(2)
  })
  .strict();

export const SpotSchema = z
  .object({
    id: nonEmptyStringSchema,
    ownerId: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    category: z.enum(["CAFE", "RESTAURANT", "SALON", "STUDIO", "OTHER"]),
    averageBookingValuePaise: PaiseSchema,
    timezone: nonEmptyStringSchema,
    address: addressSchema,
    createdAt: UtcDateTimeStringSchema,
    updatedAt: UtcDateTimeStringSchema
  })
  .strict();

export type Spot = z.infer<typeof SpotSchema>;

export const CampaignSchema = z
  .object({
    id: nonEmptyStringSchema,
    spotId: nonEmptyStringSchema,
    requestedByOwnerId: nonEmptyStringSchema,
    status: CampaignStatusSchema,
    requestSummary: nonEmptyStringSchema,
    slotStartAt: UtcDateTimeStringSchema,
    slotEndAt: UtcDateTimeStringSchema,
    unusedCapacity: positiveIntegerSchema,
    targetReservations: positiveIntegerSchema,
    maxBudgetPaise: PaiseSchema,
    maxDiscountBps: percentBpsSchema,
    maxExpectedCpaPaise: PaiseSchema,
    createdAt: UtcDateTimeStringSchema,
    updatedAt: UtcDateTimeStringSchema
  })
  .strict()
  .refine((campaign) => campaign.slotEndAt > campaign.slotStartAt, {
    message: "slotEndAt must be after slotStartAt",
    path: ["slotEndAt"]
  });

export type Campaign = z.infer<typeof CampaignSchema>;

export const PromotionProviderSchema = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    merchantId: nonEmptyStringSchema,
    adapter: z.enum(["REACH_EXCHANGE"]),
    verificationStatus: VerificationStatusSchema,
    isActive: z.boolean(),
    createdAt: UtcDateTimeStringSchema,
    updatedAt: UtcDateTimeStringSchema
  })
  .strict();

export type PromotionProvider = z.infer<typeof PromotionProviderSchema>;

export const ProviderEvidenceSchema = z
  .object({
    id: nonEmptyStringSchema,
    providerId: nonEmptyStringSchema,
    packageId: nonEmptyStringSchema.optional(),
    status: VerificationStatusSchema,
    source: z.enum(["SENSO"]),
    evidenceUrl: z.string().url().optional(),
    summary: nonEmptyStringSchema,
    collectedAt: UtcDateTimeStringSchema,
    verifiedAt: UtcDateTimeStringSchema.optional(),
    createdAt: UtcDateTimeStringSchema
  })
  .strict();

export type ProviderEvidence = z.infer<typeof ProviderEvidenceSchema>;

export const PromotionPackageSchema = z
  .object({
    id: nonEmptyStringSchema,
    providerId: nonEmptyStringSchema,
    merchantId: nonEmptyStringSchema,
    providerSku: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    currency: z.literal("INR"),
    pricePaise: PaiseSchema,
    expectedReservations: positiveIntegerSchema,
    expectedCpaPaise: PaiseSchema,
    discountBps: percentBpsSchema,
    bookingDeadlineAt: UtcDateTimeStringSchema,
    validFrom: UtcDateTimeStringSchema,
    validUntil: UtcDateTimeStringSchema,
    verificationStatus: VerificationStatusSchema,
    evidenceIds: z.array(nonEmptyStringSchema).min(1),
    createdAt: UtcDateTimeStringSchema,
    updatedAt: UtcDateTimeStringSchema
  })
  .strict()
  .refine((promotionPackage) => promotionPackage.validUntil > promotionPackage.validFrom, {
    message: "validUntil must be after validFrom",
    path: ["validUntil"]
  });

export type PromotionPackage = z.infer<typeof PromotionPackageSchema>;

const deterministicChecksSchema = z
  .object({
    budget: z.boolean(),
    deadline: z.boolean(),
    price: z.boolean(),
    merchant: z.boolean(),
    discount: z.boolean(),
    cpa: z.boolean()
  })
  .strict();

export const CampaignOptionSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    packageId: nonEmptyStringSchema,
    evidenceIds: z.array(nonEmptyStringSchema).min(1),
    score: nonNegativeIntegerSchema,
    totalCostPaise: PaiseSchema,
    expectedReservations: positiveIntegerSchema,
    expectedCpaPaise: PaiseSchema,
    discountBps: percentBpsSchema,
    deterministicChecks: deterministicChecksSchema,
    passesDeterministicChecks: z.boolean(),
    rejectionReasons: z.array(nonEmptyStringSchema),
    generatedSummary: nonEmptyStringSchema.optional(),
    createdAt: UtcDateTimeStringSchema
  })
  .strict();

export type CampaignOption = z.infer<typeof CampaignOptionSchema>;

export const CampaignDecisionSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    selectedOptionId: nonEmptyStringSchema.nullable(),
    status: z.enum(["SELECTED", "NO_VALID_OPTIONS", "REJECTED_BY_POLICY"]),
    deterministicChecks: deterministicChecksSchema,
    decisionReason: nonEmptyStringSchema,
    decidedBy: z.literal("SYSTEM"),
    decidedAt: UtcDateTimeStringSchema
  })
  .strict();

export type CampaignDecision = z.infer<typeof CampaignDecisionSchema>;

export const CampaignAssetSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    optionId: nonEmptyStringSchema,
    type: z.enum(["OWNER_SUMMARY", "PROMOTION_COPY", "MESSAGE", "IMAGE_PROMPT"]),
    content: nonEmptyStringSchema,
    generatedBy: z.literal("OPENAI"),
    model: nonEmptyStringSchema,
    requiresOwnerApproval: z.literal(true),
    createdAt: UtcDateTimeStringSchema
  })
  .strict();

export type CampaignAsset = z.infer<typeof CampaignAssetSchema>;

export const QualityReviewSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    assetIds: z.array(nonEmptyStringSchema).min(1),
    status: z.enum(["PASSED", "FAILED", "NEEDS_REVISION"]),
    issues: z.array(nonEmptyStringSchema),
    reviewedBy: z.enum(["SYSTEM", "OWNER"]),
    reviewedAt: UtcDateTimeStringSchema
  })
  .strict();

export type QualityReview = z.infer<typeof QualityReviewSchema>;

export const OwnerApprovalSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    ownerId: nonEmptyStringSchema,
    selectedOptionId: nonEmptyStringSchema,
    status: z.enum(["APPROVED", "DECLINED", "EXPIRED"]),
    approvedBudgetPaise: PaiseSchema,
    approvedAt: UtcDateTimeStringSchema.nullable(),
    expiresAt: UtcDateTimeStringSchema,
    createdAt: UtcDateTimeStringSchema
  })
  .strict();

export type OwnerApproval = z.infer<typeof OwnerApprovalSchema>;

export const TransactionSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    ownerApprovalId: nonEmptyStringSchema,
    providerId: nonEmptyStringSchema,
    packageId: nonEmptyStringSchema,
    status: PaymentStatusSchema,
    currency: z.literal("INR"),
    amountPaise: PaiseSchema,
    idempotencyKey: nonEmptyStringSchema,
    pravaAuthorizationId: nonEmptyStringSchema.nullable(),
    checkoutAttemptedAt: UtcDateTimeStringSchema.nullable(),
    merchantOrderId: nonEmptyStringSchema.nullable(),
    createdAt: UtcDateTimeStringSchema,
    updatedAt: UtcDateTimeStringSchema
  })
  .strict();

export type Transaction = z.infer<typeof TransactionSchema>;

export const MerchantOrderSchema = z
  .object({
    id: nonEmptyStringSchema,
    transactionId: nonEmptyStringSchema,
    providerId: nonEmptyStringSchema,
    externalMerchantOrderId: nonEmptyStringSchema,
    status: OrderStatusSchema,
    currency: z.literal("INR"),
    amountPaise: PaiseSchema,
    scheduledStartAt: UtcDateTimeStringSchema,
    scheduledEndAt: UtcDateTimeStringSchema,
    paidAt: UtcDateTimeStringSchema.nullable(),
    createdAt: UtcDateTimeStringSchema,
    updatedAt: UtcDateTimeStringSchema
  })
  .strict()
  .refine((order) => order.scheduledEndAt > order.scheduledStartAt, {
    message: "scheduledEndAt must be after scheduledStartAt",
    path: ["scheduledEndAt"]
  });

export type MerchantOrder = z.infer<typeof MerchantOrderSchema>;

export const PromotionActivationSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    merchantOrderId: nonEmptyStringSchema,
    status: z.enum(["PENDING", "ACTIVE", "FAILED", "CANCELLED", "COMPLETED"]),
    trackingCode: nonEmptyStringSchema,
    startsAt: UtcDateTimeStringSchema,
    endsAt: UtcDateTimeStringSchema,
    activatedAt: UtcDateTimeStringSchema.nullable(),
    createdAt: UtcDateTimeStringSchema,
    updatedAt: UtcDateTimeStringSchema
  })
  .strict()
  .refine((activation) => activation.endsAt > activation.startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"]
  });

export type PromotionActivation = z.infer<typeof PromotionActivationSchema>;

export const ReservationSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    activationId: nonEmptyStringSchema,
    spotId: nonEmptyStringSchema,
    source: nonEmptyStringSchema,
    customerReference: nonEmptyStringSchema,
    seatCount: positiveIntegerSchema,
    reservationAt: UtcDateTimeStringSchema,
    attributedAt: UtcDateTimeStringSchema,
    status: z.enum(["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
    isTest: z.boolean(),
    testLabel: z.string().nullable()
  })
  .strict()
  .refine((reservation) => !reservation.isTest || reservation.testLabel?.includes("TEST"), {
    message: "testLabel must clearly include TEST when isTest is true",
    path: ["testLabel"]
  });

export type Reservation = z.infer<typeof ReservationSchema>;

export const AuditEventSchema = z
  .object({
    id: nonEmptyStringSchema,
    entityType: z.enum([
      "CAMPAIGN",
      "CAMPAIGN_OPTION",
      "OWNER_APPROVAL",
      "TRANSACTION",
      "MERCHANT_ORDER",
      "PROMOTION_ACTIVATION",
      "RESERVATION",
      "PAYMENT_LOCK"
    ]),
    entityId: nonEmptyStringSchema,
    eventType: nonEmptyStringSchema,
    actorType: z.enum(["OWNER", "SYSTEM", "OPENAI", "SENSO", "PRAVA", "PROVIDER", "LINQ", "N8N"]),
    actorId: z.string().optional(),
    occurredAt: UtcDateTimeStringSchema,
    idempotencyKey: z.string().optional(),
    previousState: z.string().nullable(),
    nextState: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown())
  })
  .strict();

export type AuditEvent = z.infer<typeof AuditEventSchema>;

const conversationMessageSchema = z
  .object({
    role: z.enum(["OWNER", "ASSISTANT", "SYSTEM"]),
    content: nonEmptyStringSchema,
    createdAt: UtcDateTimeStringSchema
  })
  .strict();

export const ConversationStateSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    ownerId: nonEmptyStringSchema,
    channel: z.enum(["LINQ", "N8N", "API"]),
    campaignStatus: CampaignStatusSchema,
    messages: z.array(conversationMessageSchema),
    requiredInformation: z.array(nonEmptyStringSchema),
    updatedAt: UtcDateTimeStringSchema
  })
  .strict();

export type ConversationState = z.infer<typeof ConversationStateSchema>;

export const ProcessedEventSchema = z
  .object({
    id: nonEmptyStringSchema,
    source: z.enum(["N8N", "LINQ", "OPENAI", "SENSO", "PRAVA", "REACH_EXCHANGE"]),
    externalEventId: nonEmptyStringSchema,
    eventType: nonEmptyStringSchema,
    status: z.enum(["PROCESSED", "IGNORED", "FAILED"]),
    idempotencyKey: nonEmptyStringSchema,
    replayCount: nonNegativeIntegerSchema,
    processedAt: UtcDateTimeStringSchema
  })
  .strict();

export type ProcessedEvent = z.infer<typeof ProcessedEventSchema>;

export const PaymentLockSchema = z
  .object({
    id: nonEmptyStringSchema,
    campaignId: nonEmptyStringSchema,
    transactionId: nonEmptyStringSchema.nullable(),
    lockKey: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema,
    status: z.enum(["ACQUIRED", "RELEASED", "EXPIRED"]),
    attemptCount: positiveIntegerSchema,
    acquiredAt: UtcDateTimeStringSchema,
    expiresAt: UtcDateTimeStringSchema,
    releasedAt: UtcDateTimeStringSchema.nullable()
  })
  .strict()
  .refine((lock) => lock.expiresAt > lock.acquiredAt, {
    message: "expiresAt must be after acquiredAt",
    path: ["expiresAt"]
  });

export type PaymentLock = z.infer<typeof PaymentLockSchema>;
