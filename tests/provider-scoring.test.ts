import { describe, expect, it } from "vitest";

import {
  scorePromotionPackage,
  selectBestPackage,
  type ProviderScoredPackage
} from "../src/lib/core/provider-scoring";
import {
  evaluatePromotionPackage,
  type PromotionPolicyCampaign,
  type PromotionPolicyEvidence,
  type PromotionPolicyPackage
} from "../src/lib/core/policy-engine";

const currentTime = "2026-08-07T10:00:00.000Z";

const campaign: PromotionPolicyCampaign = {
  id: "campaign_scoring_001",
  spotId: "spot_quiet_cup_cafe",
  requestedByOwnerId: "owner_diya_demo",
  status: "READY_FOR_DISCOVERY",
  requestSummary: "Fill 12 unused seats on Friday evening.",
  slotStartAt: "2026-08-07T13:00:00.000Z",
  slotEndAt: "2026-08-07T15:00:00.000Z",
  unusedCapacity: 12,
  targetReservations: 10,
  maxBudgetPaise: 500000,
  maxDiscountBps: 1500,
  maxExpectedCpaPaise: 100000,
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
  }
};

const promotionPackage: PromotionPolicyPackage = {
  id: "package_scoring_001",
  providerId: "provider_scoring_001",
  merchantId: "merchant_scoring_001",
  providerSku: "local_creator_scoring",
  title: "Local Creator Scoring",
  description: "Verified local creator package for scoring.",
  currency: "INR",
  pricePaise: 300000,
  expectedReservations: 10,
  expectedCpaPaise: 30000,
  discountBps: 1500,
  bookingDeadlineAt: "2026-08-07T12:00:00.000Z",
  validFrom: "2026-08-07T13:00:00.000Z",
  validUntil: "2026-08-07T15:00:00.000Z",
  verificationStatus: "VERIFIED",
  evidenceIds: ["evidence_scoring_001"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  isAvailable: true,
  hasRecurringBilling: false,
  minimumExpectedBookings: 6
};

const providerEvidence: PromotionPolicyEvidence = {
  id: "evidence_scoring_001",
  providerId: "provider_scoring_001",
  packageId: "package_scoring_001",
  status: "VERIFIED",
  source: "SENSO",
  evidenceUrl: "https://example.com/evidence/scoring",
  summary: "Senso verified audience geography and confidence.",
  collectedAt: "2026-08-01T00:00:00.000Z",
  verifiedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  confidence: 0.8,
  audienceGeography: {
    city: "Bengaluru",
    region: "KA",
    countryCode: "IN"
  }
};

function score(
  campaignOverride: Partial<PromotionPolicyCampaign> = {},
  packageOverride: Partial<PromotionPolicyPackage> = {},
  evidenceOverride: Partial<PromotionPolicyEvidence> = {}
) {
  const testCampaign = { ...campaign, ...campaignOverride };
  const testPackage = { ...promotionPackage, ...packageOverride };
  const testEvidence = { ...providerEvidence, ...evidenceOverride };
  const policyEvaluation = evaluatePromotionPackage(
    testCampaign,
    testPackage,
    testEvidence,
    currentTime
  );

  return scorePromotionPackage({
    campaign: testCampaign,
    promotionPackage: testPackage,
    providerEvidence: testEvidence,
    policyEvaluation
  });
}

function scoredOption(
  override: Partial<ProviderScoredPackage> & Pick<ProviderScoredPackage, "packageId">
): ProviderScoredPackage {
  const { packageId, ...rest } = override;

  return {
    packageId,
    providerId: "provider_tie",
    eligible: true,
    rejectionCodes: [],
    scoreComponents: {
      geographicRelevance: 100,
      expectedBookingPotential: 100,
      evidenceConfidence: 100,
      costEfficiency: 100,
      timingAvailability: 100
    },
    weightedFinalScore: 80,
    expectedCpaMinimumPaise: 40000,
    expectedCpaMaximumPaise: 50000,
    worstCaseExpectedCpaPaise: 50000,
    remainingBudgetPaise: 200000,
    publicationDeadlineAt: "2026-08-07T12:00:00.000Z",
    strengths: ["eligible"],
    risks: [],
    ...rest
  };
}

describe("scorePromotionPackage", () => {
  it("calculates score components and CPA ranges", () => {
    expect(score()).toMatchObject({
      eligible: true,
      scoreComponents: {
        geographicRelevance: 100,
        expectedBookingPotential: 60,
        evidenceConfidence: 80,
        costEfficiency: 50,
        timingAvailability: 33.33
      },
      weightedFinalScore: 71.83,
      expectedCpaMinimumPaise: 30000,
      expectedCpaMaximumPaise: 50000,
      worstCaseExpectedCpaPaise: 50000,
      remainingBudgetPaise: 200000,
      strengths: ["eligible", "geography_exact_match", "verified_evidence", "cpa_headroom", "budget_headroom"],
      risks: ["minimum_bookings_below_target"]
    });
  });

  it("keeps score components within 0-100 boundaries", () => {
    const result = score(
      {},
      {
        expectedReservations: 20,
        minimumExpectedBookings: 20
      },
      {
        confidence: 1.5,
        audienceGeography: {
          city: "Bengaluru",
          countryCode: "IN"
        }
      }
    );

    expect(result.scoreComponents).toMatchObject({
      geographicRelevance: 90,
      expectedBookingPotential: 100,
      evidenceConfidence: 100,
      costEfficiency: 85
    });
    expect(Object.values(result.scoreComponents).every((value) => value >= 0 && value <= 100)).toBe(
      true
    );
  });

  it("returns a rejected option without a final score", () => {
    expect(score({}, { pricePaise: 600000 })).toMatchObject({
      eligible: false,
      rejectionCodes: ["BUDGET_EXCEEDED"],
      scoreComponents: {
        geographicRelevance: 0,
        expectedBookingPotential: 0,
        evidenceConfidence: 0,
        costEfficiency: 0,
        timingAvailability: 0
      },
      weightedFinalScore: 0,
      risks: ["budget_exceeded"]
    });
  });
});

describe("selectBestPackage", () => {
  it("prefers the higher final score", () => {
    expect(
      selectBestPackage([
        scoredOption({ packageId: "package_a", weightedFinalScore: 85 }),
        scoredOption({ packageId: "package_b", weightedFinalScore: 90 })
      ])?.packageId
    ).toBe("package_b");
  });

  it("breaks score ties with lower worst-case expected CPA", () => {
    expect(
      selectBestPackage([
        scoredOption({ packageId: "package_a", worstCaseExpectedCpaPaise: 50000 }),
        scoredOption({ packageId: "package_b", worstCaseExpectedCpaPaise: 45000 })
      ])?.packageId
    ).toBe("package_b");
  });

  it("breaks CPA ties with earlier publication time", () => {
    expect(
      selectBestPackage([
        scoredOption({
          packageId: "package_a",
          publicationDeadlineAt: "2026-08-07T12:00:00.000Z"
        }),
        scoredOption({
          packageId: "package_b",
          publicationDeadlineAt: "2026-08-07T11:00:00.000Z"
        })
      ])?.packageId
    ).toBe("package_b");
  });

  it("breaks publication ties with lexicographically smaller package ID", () => {
    expect(
      selectBestPackage([
        scoredOption({ packageId: "package_b" }),
        scoredOption({ packageId: "package_a" })
      ])?.packageId
    ).toBe("package_a");
  });

  it("ignores rejected options and returns null when none are eligible", () => {
    const eligibleOption = scoredOption({ packageId: "package_eligible", weightedFinalScore: 10 });
    const rejectedOption = scoredOption({
      packageId: "package_rejected",
      eligible: false,
      weightedFinalScore: 100,
      rejectionCodes: ["BUDGET_EXCEEDED"],
      risks: ["budget_exceeded"]
    });

    expect(selectBestPackage([rejectedOption, eligibleOption])?.packageId).toBe(
      "package_eligible"
    );
    expect(selectBestPackage([rejectedOption])).toBeNull();
  });
});

