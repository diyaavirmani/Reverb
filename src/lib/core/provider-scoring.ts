import type {
  PromotionPolicyCampaign,
  PromotionPolicyEvaluation,
  PromotionPolicyEvidence,
  PromotionPolicyPackage,
  PromotionPolicyRejectionCode
} from "./policy-engine";

export const PROVIDER_SCORE_WEIGHTS = {
  geographicRelevance: 0.3,
  expectedBookingPotential: 0.25,
  evidenceConfidence: 0.2,
  costEfficiency: 0.15,
  timingAvailability: 0.1
} as const;

export type ProviderScoreComponents = {
  geographicRelevance: number;
  expectedBookingPotential: number;
  evidenceConfidence: number;
  costEfficiency: number;
  timingAvailability: number;
};

export type ProviderScoringInput = {
  campaign: PromotionPolicyCampaign;
  promotionPackage: PromotionPolicyPackage;
  providerEvidence: PromotionPolicyEvidence;
  policyEvaluation: PromotionPolicyEvaluation;
};

export type ProviderScoredPackage = {
  packageId: string;
  providerId: string;
  eligible: boolean;
  rejectionCodes: PromotionPolicyRejectionCode[];
  scoreComponents: ProviderScoreComponents;
  weightedFinalScore: number;
  expectedCpaMinimumPaise: number | null;
  expectedCpaMaximumPaise: number | null;
  worstCaseExpectedCpaPaise: number | null;
  remainingBudgetPaise: number;
  publicationDeadlineAt: string;
  strengths: string[];
  risks: string[];
};

export function scorePromotionPackage({
  campaign,
  promotionPackage,
  providerEvidence,
  policyEvaluation
}: ProviderScoringInput): ProviderScoredPackage {
  const expectedCpaMinimumPaise = ceilDivideNonNegativeIntegers(
    promotionPackage.pricePaise,
    promotionPackage.expectedReservations
  );
  const expectedCpaMaximumPaise = policyEvaluation.worstCaseExpectedCpaPaise;
  const publicationDeadlineAt = policyEvaluation.policySnapshot.publicationDeadlineAt;

  if (!policyEvaluation.eligible) {
    return {
      packageId: promotionPackage.id,
      providerId: promotionPackage.providerId,
      eligible: false,
      rejectionCodes: policyEvaluation.rejectionCodes,
      scoreComponents: zeroScoreComponents(),
      weightedFinalScore: 0,
      expectedCpaMinimumPaise,
      expectedCpaMaximumPaise,
      worstCaseExpectedCpaPaise: policyEvaluation.worstCaseExpectedCpaPaise,
      remainingBudgetPaise: policyEvaluation.remainingBudgetPaise,
      publicationDeadlineAt,
      strengths: [],
      risks: policyEvaluation.rejectionCodes.map(toMachineCode)
    };
  }

  const scoreComponents: ProviderScoreComponents = {
    geographicRelevance: calculateGeographicRelevance(campaign, providerEvidence),
    expectedBookingPotential: calculateExpectedBookingPotential(campaign, promotionPackage),
    evidenceConfidence: clampScore(providerEvidence.confidence * 100),
    costEfficiency: calculateCostEfficiency(campaign, policyEvaluation),
    timingAvailability: calculateTimingAvailability(promotionPackage, policyEvaluation)
  };

  return {
    packageId: promotionPackage.id,
    providerId: promotionPackage.providerId,
    eligible: true,
    rejectionCodes: [],
    scoreComponents,
    weightedFinalScore: calculateWeightedFinalScore(scoreComponents),
    expectedCpaMinimumPaise,
    expectedCpaMaximumPaise,
    worstCaseExpectedCpaPaise: policyEvaluation.worstCaseExpectedCpaPaise,
    remainingBudgetPaise: policyEvaluation.remainingBudgetPaise,
    publicationDeadlineAt,
    strengths: buildStrengths(campaign, promotionPackage, providerEvidence, policyEvaluation),
    risks: buildRisks(campaign, promotionPackage, providerEvidence, policyEvaluation)
  };
}

export function selectBestPackage(options: ProviderScoredPackage[]): ProviderScoredPackage | null {
  const eligibleOptions = options.filter((option) => option.eligible);

  if (eligibleOptions.length === 0) {
    return null;
  }

  return [...eligibleOptions].sort(compareScoredPackages)[0];
}

function compareScoredPackages(
  left: ProviderScoredPackage,
  right: ProviderScoredPackage
): number {
  const finalScoreDifference = right.weightedFinalScore - left.weightedFinalScore;

  if (finalScoreDifference !== 0) {
    return finalScoreDifference;
  }

  const leftWorstCaseCpa = left.worstCaseExpectedCpaPaise ?? Number.MAX_SAFE_INTEGER;
  const rightWorstCaseCpa = right.worstCaseExpectedCpaPaise ?? Number.MAX_SAFE_INTEGER;
  const worstCaseCpaDifference = leftWorstCaseCpa - rightWorstCaseCpa;

  if (worstCaseCpaDifference !== 0) {
    return worstCaseCpaDifference;
  }

  const publicationTimeDifference =
    Date.parse(left.publicationDeadlineAt) - Date.parse(right.publicationDeadlineAt);

  if (publicationTimeDifference !== 0) {
    return publicationTimeDifference;
  }

  return left.packageId.localeCompare(right.packageId);
}

function calculateWeightedFinalScore(scoreComponents: ProviderScoreComponents): number {
  return roundScore(
    scoreComponents.geographicRelevance * PROVIDER_SCORE_WEIGHTS.geographicRelevance +
      scoreComponents.expectedBookingPotential * PROVIDER_SCORE_WEIGHTS.expectedBookingPotential +
      scoreComponents.evidenceConfidence * PROVIDER_SCORE_WEIGHTS.evidenceConfidence +
      scoreComponents.costEfficiency * PROVIDER_SCORE_WEIGHTS.costEfficiency +
      scoreComponents.timingAvailability * PROVIDER_SCORE_WEIGHTS.timingAvailability
  );
}

function calculateGeographicRelevance(
  campaign: PromotionPolicyCampaign,
  providerEvidence: PromotionPolicyEvidence
): number {
  const spotAddress = campaign.spot.address;
  const audienceGeography = providerEvidence.audienceGeography;

  if (normalize(spotAddress.countryCode) !== normalize(audienceGeography.countryCode)) {
    return 0;
  }

  if (normalize(spotAddress.city) !== normalize(audienceGeography.city)) {
    return 50;
  }

  if (!spotAddress.region || !audienceGeography.region) {
    return 90;
  }

  if (normalize(spotAddress.region) !== normalize(audienceGeography.region)) {
    return 75;
  }

  return 100;
}

function calculateExpectedBookingPotential(
  campaign: PromotionPolicyCampaign,
  promotionPackage: PromotionPolicyPackage
): number {
  return clampScore((promotionPackage.minimumExpectedBookings / campaign.targetReservations) * 100);
}

function calculateCostEfficiency(
  campaign: PromotionPolicyCampaign,
  policyEvaluation: PromotionPolicyEvaluation
): number {
  if (policyEvaluation.worstCaseExpectedCpaPaise === null) {
    return 0;
  }

  return clampScore(
    ((campaign.maxExpectedCpaPaise - policyEvaluation.worstCaseExpectedCpaPaise) /
      campaign.maxExpectedCpaPaise) *
      100
  );
}

function calculateTimingAvailability(
  promotionPackage: PromotionPolicyPackage,
  policyEvaluation: PromotionPolicyEvaluation
): number {
  if (!promotionPackage.isAvailable) {
    return 0;
  }

  const evaluatedAt = Date.parse(policyEvaluation.policySnapshot.evaluatedAt);
  const publicationDeadlineAt = Date.parse(policyEvaluation.policySnapshot.publicationDeadlineAt);
  const slotStartAt = Date.parse(policyEvaluation.policySnapshot.slotStartAt);

  if (publicationDeadlineAt > slotStartAt || evaluatedAt > publicationDeadlineAt) {
    return 0;
  }

  const totalWindowMs = slotStartAt - evaluatedAt;

  if (totalWindowMs <= 0) {
    return 0;
  }

  return clampScore(((slotStartAt - publicationDeadlineAt) / totalWindowMs) * 100);
}

function buildStrengths(
  campaign: PromotionPolicyCampaign,
  promotionPackage: PromotionPolicyPackage,
  providerEvidence: PromotionPolicyEvidence,
  policyEvaluation: PromotionPolicyEvaluation
): string[] {
  const strengths: string[] = ["eligible"];

  if (calculateGeographicRelevance(campaign, providerEvidence) >= 100) {
    strengths.push("geography_exact_match");
  } else {
    strengths.push("geography_match");
  }

  if (promotionPackage.minimumExpectedBookings >= campaign.targetReservations) {
    strengths.push("meets_reservation_target");
  }

  if (providerEvidence.confidence >= 0.9) {
    strengths.push("high_confidence_evidence");
  } else {
    strengths.push("verified_evidence");
  }

  if (
    policyEvaluation.worstCaseExpectedCpaPaise !== null &&
    policyEvaluation.worstCaseExpectedCpaPaise <= Math.floor(campaign.maxExpectedCpaPaise * 0.8)
  ) {
    strengths.push("cpa_headroom");
  }

  if (policyEvaluation.remainingBudgetPaise >= Math.ceil(campaign.maxBudgetPaise * 0.1)) {
    strengths.push("budget_headroom");
  }

  if (calculateTimingAvailability(promotionPackage, policyEvaluation) >= 50) {
    strengths.push("early_publication_window");
  }

  return strengths;
}

function buildRisks(
  campaign: PromotionPolicyCampaign,
  promotionPackage: PromotionPolicyPackage,
  providerEvidence: PromotionPolicyEvidence,
  policyEvaluation: PromotionPolicyEvaluation
): string[] {
  const risks: string[] = [];

  if (promotionPackage.minimumExpectedBookings < campaign.targetReservations) {
    risks.push("minimum_bookings_below_target");
  }

  if (providerEvidence.status === "PARTIALLY_VERIFIED") {
    risks.push("partial_evidence");
  }

  if (
    policyEvaluation.worstCaseExpectedCpaPaise !== null &&
    policyEvaluation.worstCaseExpectedCpaPaise >= Math.ceil(campaign.maxExpectedCpaPaise * 0.9)
  ) {
    risks.push("cpa_near_limit");
  }

  if (policyEvaluation.remainingBudgetPaise < Math.ceil(campaign.maxBudgetPaise * 0.1)) {
    risks.push("low_remaining_budget");
  }

  if (calculateTimingAvailability(promotionPackage, policyEvaluation) < 25) {
    risks.push("short_publication_buffer");
  }

  return risks;
}

function zeroScoreComponents(): ProviderScoreComponents {
  return {
    geographicRelevance: 0,
    expectedBookingPotential: 0,
    evidenceConfidence: 0,
    costEfficiency: 0,
    timingAvailability: 0
  };
}

function ceilDivideNonNegativeIntegers(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    throw new Error("denominator must be greater than zero");
  }

  if (numerator === 0) {
    return 0;
  }

  return Math.floor((numerator - 1) / denominator) + 1;
}

function clampScore(value: number): number {
  return roundScore(Math.min(100, Math.max(0, value)));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function toMachineCode(value: string): string {
  return value.toLowerCase();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
