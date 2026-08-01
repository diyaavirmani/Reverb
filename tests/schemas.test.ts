import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  CampaignAssetSchema,
  CampaignDecisionSchema,
  CampaignOptionSchema,
  CampaignSchema,
  ConversationStateSchema,
  MerchantOrderSchema,
  OwnerApprovalSchema,
  PaymentLockSchema,
  ProcessedEventSchema,
  PromotionActivationSchema,
  PromotionPackageSchema,
  PromotionProviderSchema,
  ProviderEvidenceSchema,
  QualityReviewSchema,
  ReservationSchema,
  SpotSchema,
  TransactionSchema
} from "../src/schemas";

const now = "2026-08-01T10:00:00.000Z";
const slotStart = "2026-08-07T13:30:00.000Z";
const slotEnd = "2026-08-07T15:30:00.000Z";

const spot = {
  id: "spot_001",
  ownerId: "owner_001",
  name: "Quiet Cup Cafe",
  category: "CAFE",
  timezone: "Asia/Kolkata",
  address: {
    line1: "12 Market Road",
    city: "Bengaluru",
    region: "KA",
    postalCode: "560001",
    countryCode: "IN"
  },
  createdAt: now,
  updatedAt: now
};

const campaign = {
  id: "campaign_001",
  spotId: "spot_001",
  requestedByOwnerId: "owner_001",
  status: "READY_FOR_DISCOVERY",
  requestSummary: "Fill 12 unused seats on Friday evening.",
  slotStartAt: slotStart,
  slotEndAt: slotEnd,
  unusedCapacity: 12,
  targetReservations: 6,
  maxBudgetPaise: 500000,
  maxDiscountBps: 1500,
  maxExpectedCpaPaise: 85000,
  createdAt: now,
  updatedAt: now
};

const provider = {
  id: "provider_001",
  name: "Reach Exchange",
  merchantId: "merchant_001",
  adapter: "REACH_EXCHANGE",
  verificationStatus: "VERIFIED",
  isActive: true,
  createdAt: now,
  updatedAt: now
};

const evidence = {
  id: "evidence_001",
  providerId: "provider_001",
  packageId: "package_001",
  status: "VERIFIED",
  source: "SENSO",
  evidenceUrl: "https://example.com/evidence/package-001",
  summary: "Senso verified local dining reach.",
  collectedAt: now,
  verifiedAt: now,
  createdAt: now
};

const promotionPackage = {
  id: "package_001",
  providerId: "provider_001",
  merchantId: "merchant_001",
  providerSku: "reach_local_dining_boost",
  title: "Local Dining Boost",
  description: "Verified local distribution for Friday dinner.",
  currency: "INR",
  pricePaise: 480000,
  expectedReservations: 6,
  expectedCpaPaise: 80000,
  discountBps: 1500,
  bookingDeadlineAt: "2026-08-07T13:00:00.000Z",
  validFrom: slotStart,
  validUntil: slotEnd,
  verificationStatus: "VERIFIED",
  evidenceIds: ["evidence_001"],
  createdAt: now,
  updatedAt: now
};

const deterministicChecks = {
  budget: true,
  deadline: true,
  price: true,
  merchant: true,
  discount: true,
  cpa: true
};

const campaignOption = {
  id: "option_001",
  campaignId: "campaign_001",
  packageId: "package_001",
  evidenceIds: ["evidence_001"],
  score: 92,
  totalCostPaise: 480000,
  expectedReservations: 6,
  expectedCpaPaise: 80000,
  discountBps: 1500,
  deterministicChecks,
  passesDeterministicChecks: true,
  rejectionReasons: [],
  generatedSummary: "Best verified option within budget and CPA.",
  createdAt: now
};

const campaignDecision = {
  id: "decision_001",
  campaignId: "campaign_001",
  selectedOptionId: "option_001",
  status: "SELECTED",
  deterministicChecks,
  decisionReason: "Only verified package within deterministic constraints.",
  decidedBy: "SYSTEM",
  decidedAt: now
};

const campaignAsset = {
  id: "asset_001",
  campaignId: "campaign_001",
  optionId: "option_001",
  type: "PROMOTION_COPY",
  content: "Friday dinner seats available with a limited local offer.",
  generatedBy: "OPENAI",
  model: "fixture-openai-model",
  requiresOwnerApproval: true,
  createdAt: now
};

const qualityReview = {
  id: "quality_001",
  campaignId: "campaign_001",
  assetIds: ["asset_001"],
  status: "PASSED",
  issues: [],
  reviewedBy: "SYSTEM",
  reviewedAt: now
};

const ownerApproval = {
  id: "approval_001",
  campaignId: "campaign_001",
  ownerId: "owner_001",
  selectedOptionId: "option_001",
  status: "APPROVED",
  approvedBudgetPaise: 500000,
  approvedAt: now,
  expiresAt: "2026-08-07T12:30:00.000Z",
  createdAt: now
};

const transaction = {
  id: "transaction_001",
  campaignId: "campaign_001",
  ownerApprovalId: "approval_001",
  providerId: "provider_001",
  packageId: "package_001",
  status: "COMPLETED",
  currency: "INR",
  amountPaise: 480000,
  idempotencyKey: "idem_checkout_001",
  pravaAuthorizationId: "prava_auth_001",
  checkoutAttemptedAt: now,
  merchantOrderId: "merchant_order_001",
  createdAt: now,
  updatedAt: now
};

const merchantOrder = {
  id: "merchant_order_001",
  transactionId: "transaction_001",
  providerId: "provider_001",
  externalMerchantOrderId: "fixture_reach_order_001",
  status: "PAID",
  currency: "INR",
  amountPaise: 480000,
  scheduledStartAt: slotStart,
  scheduledEndAt: slotEnd,
  paidAt: now,
  createdAt: now,
  updatedAt: now
};

const promotionActivation = {
  id: "activation_001",
  campaignId: "campaign_001",
  merchantOrderId: "merchant_order_001",
  status: "ACTIVE",
  trackingCode: "rf_test_tracking_001",
  startsAt: slotStart,
  endsAt: slotEnd,
  activatedAt: now,
  createdAt: now,
  updatedAt: now
};

const reservation = {
  id: "TEST-reservation-001",
  campaignId: "campaign_001",
  activationId: "activation_001",
  spotId: "spot_001",
  source: "Reach Exchange fixture",
  customerReference: "TEST CUSTOMER",
  seatCount: 2,
  reservationAt: "2026-08-07T14:00:00.000Z",
  attributedAt: "2026-08-07T14:01:00.000Z",
  status: "BOOKED",
  isTest: true,
  testLabel: "TEST RESERVATION - NOT A REAL CUSTOMER"
};

const auditEvent = {
  id: "audit_001",
  entityType: "MERCHANT_ORDER",
  entityId: "merchant_order_001",
  eventType: "ORDER_PAID",
  actorType: "PROVIDER",
  actorId: "provider_001",
  occurredAt: now,
  idempotencyKey: "idem_checkout_001",
  previousState: "CREATED",
  nextState: "PAID",
  metadata: {
    externalMerchantOrderId: "fixture_reach_order_001"
  }
};

const conversationState = {
  id: "conversation_001",
  campaignId: "campaign_001",
  ownerId: "owner_001",
  channel: "LINQ",
  campaignStatus: "AWAITING_OWNER_APPROVAL",
  messages: [
    {
      role: "OWNER",
      content: "Please fill Friday evening.",
      createdAt: now
    }
  ],
  requiredInformation: [],
  updatedAt: now
};

const processedEvent = {
  id: "processed_001",
  source: "REACH_EXCHANGE",
  externalEventId: "evt_001",
  eventType: "merchant_order.paid",
  status: "PROCESSED",
  idempotencyKey: "idem_checkout_001",
  replayCount: 0,
  processedAt: now
};

const paymentLock = {
  id: "lock_001",
  campaignId: "campaign_001",
  transactionId: "transaction_001",
  lockKey: "campaign_001:checkout",
  idempotencyKey: "idem_checkout_001",
  status: "RELEASED",
  attemptCount: 1,
  acquiredAt: now,
  expiresAt: "2026-08-01T10:05:00.000Z",
  releasedAt: "2026-08-01T10:01:00.000Z"
};

describe("domain schemas", () => {
  it.each([
    ["Spot", SpotSchema, spot],
    ["Campaign", CampaignSchema, campaign],
    ["PromotionProvider", PromotionProviderSchema, provider],
    ["ProviderEvidence", ProviderEvidenceSchema, evidence],
    ["PromotionPackage", PromotionPackageSchema, promotionPackage],
    ["CampaignOption", CampaignOptionSchema, campaignOption],
    ["CampaignDecision", CampaignDecisionSchema, campaignDecision],
    ["CampaignAsset", CampaignAssetSchema, campaignAsset],
    ["QualityReview", QualityReviewSchema, qualityReview],
    ["OwnerApproval", OwnerApprovalSchema, ownerApproval],
    ["Transaction", TransactionSchema, transaction],
    ["MerchantOrder", MerchantOrderSchema, merchantOrder],
    ["PromotionActivation", PromotionActivationSchema, promotionActivation],
    ["Reservation", ReservationSchema, reservation],
    ["AuditEvent", AuditEventSchema, auditEvent],
    ["ConversationState", ConversationStateSchema, conversationState],
    ["ProcessedEvent", ProcessedEventSchema, processedEvent],
    ["PaymentLock", PaymentLockSchema, paymentLock]
  ])("accepts a valid %s record", (_name, schema, record) => {
    expect(schema.safeParse(record).success).toBe(true);
  });

  it("rejects invalid money values", () => {
    expect(
      CampaignSchema.safeParse({
        ...campaign,
        maxBudgetPaise: 5000.5
      }).success
    ).toBe(false);

    expect(
      PromotionPackageSchema.safeParse({
        ...promotionPackage,
        pricePaise: -1
      }).success
    ).toBe(false);
  });

  it("rejects invalid timestamp values", () => {
    expect(
      SpotSchema.safeParse({
        ...spot,
        createdAt: "2026-08-01T10:00:00+05:30"
      }).success
    ).toBe(false);

    expect(
      CampaignSchema.safeParse({
        ...campaign,
        slotEndAt: "2026-08-07T12:30:00.000Z"
      }).success
    ).toBe(false);
  });

  it("rejects invalid enum values", () => {
    expect(
      CampaignSchema.safeParse({
        ...campaign,
        status: "APPROVED_BY_AI"
      }).success
    ).toBe(false);

    expect(
      TransactionSchema.safeParse({
        ...transaction,
        status: "PAID"
      }).success
    ).toBe(false);
  });

  it("rejects records with missing required fields", () => {
    const spotWithoutOwnerId: Record<string, unknown> = { ...spot };
    delete spotWithoutOwnerId.ownerId;

    const transactionWithoutId: Record<string, unknown> = { ...transaction };
    delete transactionWithoutId.id;

    expect(SpotSchema.safeParse(spotWithoutOwnerId).success).toBe(false);
    expect(TransactionSchema.safeParse(transactionWithoutId).success).toBe(false);
  });

  it("rejects undeclared fields", () => {
    expect(
      TransactionSchema.safeParse({
        ...transaction,
        cardToken: "must-not-be-stored"
      }).success
    ).toBe(false);
  });
});

