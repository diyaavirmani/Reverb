import type { Campaign, PromotionPackage, ProviderEvidence, Spot } from "../../schemas";

export const DEFAULT_EVIDENCE_CONFIDENCE_THRESHOLD = 0.8;

export type AudienceGeography = {
  city: string;
  region?: string;
  countryCode: string;
};

export type ApprovedPromotionPackageSnapshot = {
  packageId: string;
  merchantId: string;
  providerSku?: string;
  pricePaise: number;
};

export type PromotionPolicyCampaign = Campaign & {
  spot: Pick<Spot, "id" | "address">;
  approvedOption?: ApprovedPromotionPackageSnapshot;
  policy?: {
    evidenceConfidenceThreshold?: number;
  };
};

export type PromotionPolicyPackage = PromotionPackage & {
  isAvailable: boolean;
  hasRecurringBilling: boolean;
  minimumExpectedBookings: number;
  publicationDeadlineAt?: string;
};

export type PromotionPolicyEvidence = ProviderEvidence & {
  confidence: number;
  audienceGeography: AudienceGeography;
};

export type PromotionPolicyRejectionCode =
  | "PACKAGE_UNAVAILABLE"
  | "BUDGET_EXCEEDED"
  | "RECURRING_BILLING"
  | "PUBLICATION_DEADLINE_TOO_LATE"
  | "ZERO_MINIMUM_EXPECTED_BOOKINGS"
  | "WORST_CASE_CPA_EXCEEDED"
  | "PROVIDER_EVIDENCE_UNVERIFIED"
  | "EVIDENCE_CONFIDENCE_TOO_LOW"
  | "AUDIENCE_GEOGRAPHY_MISMATCH"
  | "PACKAGE_CHANGED"
  | "PRICE_CHANGED"
  | "MERCHANT_CHANGED";

export type PromotionPolicySnapshot = {
  evaluatedAt: string;
  campaignId: string;
  packageId: string;
  providerEvidenceId: string;
  packagePricePaise: number;
  campaignBudgetPaise: number;
  campaignMaxExpectedCpaPaise: number;
  remainingBudgetPaise: number;
  minimumExpectedBookings: number;
  worstCaseExpectedCpaPaise: number | null;
  publicationDeadlineAt: string;
  slotStartAt: string;
  evidenceConfidence: number;
  evidenceConfidenceThreshold: number;
  audienceGeography: AudienceGeography;
  spotGeography: AudienceGeography;
  approvedOption?: ApprovedPromotionPackageSnapshot;
};

export type PromotionPolicyEvaluation = {
  eligible: boolean;
  rejectionCodes: PromotionPolicyRejectionCode[];
  rejectionReasons: string[];
  worstCaseExpectedCpaPaise: number | null;
  remainingBudgetPaise: number;
  policySnapshot: PromotionPolicySnapshot;
};

export function evaluatePromotionPackage(
  campaign: PromotionPolicyCampaign,
  promotionPackage: PromotionPolicyPackage,
  providerEvidence: PromotionPolicyEvidence,
  currentTime: Date | string
): PromotionPolicyEvaluation {
  assertSafeNonNegativeInteger(campaign.maxBudgetPaise, "campaign.maxBudgetPaise");
  assertSafeNonNegativeInteger(campaign.maxExpectedCpaPaise, "campaign.maxExpectedCpaPaise");
  assertSafeNonNegativeInteger(promotionPackage.pricePaise, "promotionPackage.pricePaise");
  assertSafeNonNegativeInteger(
    promotionPackage.minimumExpectedBookings,
    "promotionPackage.minimumExpectedBookings"
  );

  const evaluatedAt = toUtcIsoString(currentTime);
  const publicationDeadlineAt =
    promotionPackage.publicationDeadlineAt ?? promotionPackage.bookingDeadlineAt;
  const evidenceConfidenceThreshold =
    campaign.policy?.evidenceConfidenceThreshold ?? DEFAULT_EVIDENCE_CONFIDENCE_THRESHOLD;
  const remainingBudgetPaise = campaign.maxBudgetPaise - promotionPackage.pricePaise;
  const worstCaseExpectedCpaPaise =
    promotionPackage.minimumExpectedBookings === 0
      ? null
      : ceilDivideNonNegativeIntegers(
          promotionPackage.pricePaise,
          promotionPackage.minimumExpectedBookings
        );
  const spotGeography = {
    city: campaign.spot.address.city,
    region: campaign.spot.address.region,
    countryCode: campaign.spot.address.countryCode
  };

  const rejectionCodes: PromotionPolicyRejectionCode[] = [];
  const rejectionReasons: string[] = [];
  const reject = (code: PromotionPolicyRejectionCode, reason: string) => {
    rejectionCodes.push(code);
    rejectionReasons.push(reason);
  };

  if (!promotionPackage.isAvailable) {
    reject("PACKAGE_UNAVAILABLE", "Promotion package is unavailable.");
  }

  if (promotionPackage.pricePaise > campaign.maxBudgetPaise) {
    reject("BUDGET_EXCEEDED", "Promotion package price exceeds the campaign budget.");
  }

  if (promotionPackage.hasRecurringBilling) {
    reject("RECURRING_BILLING", "Promotion package has recurring billing.");
  }

  if (
    isAfter(publicationDeadlineAt, campaign.slotStartAt) ||
    isAfter(evaluatedAt, publicationDeadlineAt)
  ) {
    reject(
      "PUBLICATION_DEADLINE_TOO_LATE",
      "Promotion package publication deadline is too late for the campaign slot."
    );
  }

  if (promotionPackage.minimumExpectedBookings === 0) {
    reject(
      "ZERO_MINIMUM_EXPECTED_BOOKINGS",
      "Promotion package minimum expected bookings must be greater than zero."
    );
  }

  if (
    worstCaseExpectedCpaPaise !== null &&
    worstCaseExpectedCpaPaise > campaign.maxExpectedCpaPaise
  ) {
    reject(
      "WORST_CASE_CPA_EXCEEDED",
      "Worst-case expected CPA exceeds the campaign limit."
    );
  }

  if (providerEvidence.status === "UNVERIFIED") {
    reject("PROVIDER_EVIDENCE_UNVERIFIED", "Provider evidence is unverified.");
  }

  if (providerEvidence.confidence < evidenceConfidenceThreshold) {
    reject(
      "EVIDENCE_CONFIDENCE_TOO_LOW",
      "Provider evidence confidence is below the configured threshold."
    );
  }

  if (!audienceGeographyMatchesSpot(providerEvidence.audienceGeography, spotGeography)) {
    reject(
      "AUDIENCE_GEOGRAPHY_MISMATCH",
      "Provider audience geography does not match the Spot."
    );
  }

  if (campaign.approvedOption) {
    if (
      campaign.approvedOption.packageId !== promotionPackage.id ||
      (campaign.approvedOption.providerSku !== undefined &&
        campaign.approvedOption.providerSku !== promotionPackage.providerSku)
    ) {
      reject("PACKAGE_CHANGED", "Live package information differs from the approved option.");
    }

    if (campaign.approvedOption.pricePaise !== promotionPackage.pricePaise) {
      reject("PRICE_CHANGED", "Live package price differs from the approved option.");
    }

    if (campaign.approvedOption.merchantId !== promotionPackage.merchantId) {
      reject("MERCHANT_CHANGED", "Live merchant differs from the approved option.");
    }
  }

  return {
    eligible: rejectionCodes.length === 0,
    rejectionCodes,
    rejectionReasons,
    worstCaseExpectedCpaPaise,
    remainingBudgetPaise,
    policySnapshot: {
      evaluatedAt,
      campaignId: campaign.id,
      packageId: promotionPackage.id,
      providerEvidenceId: providerEvidence.id,
      packagePricePaise: promotionPackage.pricePaise,
      campaignBudgetPaise: campaign.maxBudgetPaise,
      campaignMaxExpectedCpaPaise: campaign.maxExpectedCpaPaise,
      remainingBudgetPaise,
      minimumExpectedBookings: promotionPackage.minimumExpectedBookings,
      worstCaseExpectedCpaPaise,
      publicationDeadlineAt,
      slotStartAt: campaign.slotStartAt,
      evidenceConfidence: providerEvidence.confidence,
      evidenceConfidenceThreshold,
      audienceGeography: providerEvidence.audienceGeography,
      spotGeography,
      approvedOption: campaign.approvedOption
    }
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

function assertSafeNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a safe non-negative integer`);
  }
}

function isAfter(leftIsoDateTime: string, rightIsoDateTime: string): boolean {
  return Date.parse(leftIsoDateTime) > Date.parse(rightIsoDateTime);
}

function toUtcIsoString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const timestamp = date.getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error("currentTime must be a valid date");
  }

  return date.toISOString();
}

function audienceGeographyMatchesSpot(
  audienceGeography: AudienceGeography,
  spotGeography: AudienceGeography
): boolean {
  if (normalize(audienceGeography.countryCode) !== normalize(spotGeography.countryCode)) {
    return false;
  }

  if (normalize(audienceGeography.city) !== normalize(spotGeography.city)) {
    return false;
  }

  if (
    spotGeography.region !== undefined &&
    audienceGeography.region !== undefined &&
    normalize(audienceGeography.region) !== normalize(spotGeography.region)
  ) {
    return false;
  }

  return true;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
