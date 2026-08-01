import { describe, expect, it } from "vitest";

import {
  evaluatePromotionPackage,
  type PromotionPolicyCampaign,
  type PromotionPolicyEvidence,
  type PromotionPolicyPackage
} from "../src/lib/core/policy-engine";

const currentTime = "2026-08-07T12:00:00.000Z";

const campaign: PromotionPolicyCampaign = {
  id: "campaign_policy_001",
  spotId: "spot_quiet_cup_cafe",
  requestedByOwnerId: "owner_diya_demo",
  status: "READY_FOR_DISCOVERY",
  requestSummary: "Fill 12 unused seats on Friday evening.",
  slotStartAt: "2026-08-07T13:30:00.000Z",
  slotEndAt: "2026-08-07T15:30:00.000Z",
  unusedCapacity: 12,
  targetReservations: 6,
  maxBudgetPaise: 500000,
  maxDiscountBps: 1500,
  maxExpectedCpaPaise: 85000,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  spot: {
    id: "spot_quiet_cup_cafe",
    address: {
      line1: "12 Market Road",
      city: "Bengaluru",
      region: "KA",
      postalCode: "560001",
      countryCode: "IN"
    }
  },
  approvedOption: {
    packageId: "package_local_creator",
    merchantId: "merchant_local_creator",
    providerSku: "local_creator_boost",
    pricePaise: 480000
  },
  policy: {
    evidenceConfidenceThreshold: 0.8
  }
};

const promotionPackage: PromotionPolicyPackage = {
  id: "package_local_creator",
  providerId: "provider_local_creator",
  merchantId: "merchant_local_creator",
  providerSku: "local_creator_boost",
  title: "Local Creator Boost",
  description: "Verified local creator package for the dinner slot.",
  currency: "INR",
  pricePaise: 480000,
  expectedReservations: 6,
  expectedCpaPaise: 80000,
  discountBps: 1500,
  bookingDeadlineAt: "2026-08-07T13:00:00.000Z",
  validFrom: "2026-08-07T13:30:00.000Z",
  validUntil: "2026-08-07T15:30:00.000Z",
  verificationStatus: "VERIFIED",
  evidenceIds: ["evidence_local_creator"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  isAvailable: true,
  hasRecurringBilling: false,
  minimumExpectedBookings: 6
};

const providerEvidence: PromotionPolicyEvidence = {
  id: "evidence_local_creator",
  providerId: "provider_local_creator",
  packageId: "package_local_creator",
  status: "VERIFIED",
  source: "SENSO",
  evidenceUrl: "https://example.com/evidence/local-creator",
  summary: "Senso verified local geography and audience quality.",
  collectedAt: "2026-08-01T00:00:00.000Z",
  verifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  confidence: 0.92,
  audienceGeography: {
    city: "Bengaluru",
    region: "KA",
    countryCode: "IN"
  }
};

function evaluate(
  packageOverride: Partial<PromotionPolicyPackage> = {},
  evidenceOverride: Partial<PromotionPolicyEvidence> = {},
  campaignOverride: Partial<PromotionPolicyCampaign> = {}
) {
  return evaluatePromotionPackage(
    { ...campaign, ...campaignOverride },
    { ...promotionPackage, ...packageOverride },
    { ...providerEvidence, ...evidenceOverride },
    currentTime
  );
}

describe("evaluatePromotionPackage", () => {
  it("accepts a valid package", () => {
    expect(evaluate()).toMatchObject({
      eligible: true,
      rejectionCodes: [],
      rejectionReasons: [],
      worstCaseExpectedCpaPaise: 80000,
      remainingBudgetPaise: 20000
    });
  });

  it("rejects an over-budget package", () => {
    expect(evaluate({ pricePaise: 510000 }, {}, { approvedOption: undefined })).toMatchObject({
      eligible: false,
      rejectionCodes: ["BUDGET_EXCEEDED"],
      remainingBudgetPaise: -10000
    });
  });

  it("rejects a high-CPA package", () => {
    expect(evaluate({ minimumExpectedBookings: 5 }, {}, { approvedOption: undefined })).toMatchObject({
      eligible: false,
      rejectionCodes: ["WORST_CASE_CPA_EXCEEDED"],
      worstCaseExpectedCpaPaise: 96000
    });
  });

  it("rejects a recurring package", () => {
    expect(evaluate({ hasRecurringBilling: true })).toMatchObject({
      eligible: false,
      rejectionCodes: ["RECURRING_BILLING"]
    });
  });

  it("rejects an unavailable package", () => {
    expect(evaluate({ isAvailable: false })).toMatchObject({
      eligible: false,
      rejectionCodes: ["PACKAGE_UNAVAILABLE"]
    });
  });

  it("rejects a late package", () => {
    expect(evaluate({ publicationDeadlineAt: "2026-08-07T14:00:00.000Z" })).toMatchObject({
      eligible: false,
      rejectionCodes: ["PUBLICATION_DEADLINE_TOO_LATE"]
    });
  });

  it("rejects an unverified provider", () => {
    expect(evaluate({}, { status: "UNVERIFIED" })).toMatchObject({
      eligible: false,
      rejectionCodes: ["PROVIDER_EVIDENCE_UNVERIFIED"]
    });
  });

  it("rejects insufficient confidence", () => {
    expect(evaluate({}, { confidence: 0.7 })).toMatchObject({
      eligible: false,
      rejectionCodes: ["EVIDENCE_CONFIDENCE_TOO_LOW"]
    });
  });

  it("rejects a changed price", () => {
    expect(
      evaluate({}, {}, { approvedOption: { ...campaign.approvedOption!, pricePaise: 470000 } })
    ).toMatchObject({
      eligible: false,
      rejectionCodes: ["PRICE_CHANGED"]
    });
  });

  it("rejects a changed merchant", () => {
    expect(
      evaluate({}, {}, { approvedOption: { ...campaign.approvedOption!, merchantId: "new_merchant" } })
    ).toMatchObject({
      eligible: false,
      rejectionCodes: ["MERCHANT_CHANGED"]
    });
  });

  it("rejects zero expected bookings", () => {
    expect(evaluate({ minimumExpectedBookings: 0 }, {}, { approvedOption: undefined })).toMatchObject({
      eligible: false,
      rejectionCodes: ["ZERO_MINIMUM_EXPECTED_BOOKINGS"],
      worstCaseExpectedCpaPaise: null
    });
  });
});
