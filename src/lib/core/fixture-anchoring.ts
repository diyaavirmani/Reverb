import type { PromotionPackage, SensoProviderVerification } from "../../schemas";

const fixtureAnchorSlotStart = "2026-08-07T13:30:00.000Z";

export function anchorFixturePackagesToCampaignSlot(
  packages: PromotionPackage[],
  campaignSlotStartAt: string
): PromotionPackage[] {
  const deltaMs = Date.parse(campaignSlotStartAt) - Date.parse(fixtureAnchorSlotStart);

  if (!Number.isFinite(deltaMs)) {
    return packages;
  }

  return packages.map((promotionPackage) => ({
    ...promotionPackage,
    bookingDeadlineAt: shiftIso(promotionPackage.bookingDeadlineAt, deltaMs),
    validFrom: shiftIso(promotionPackage.validFrom, deltaMs),
    validUntil: shiftIso(promotionPackage.validUntil, deltaMs)
  }));
}

export function anchorFixtureVerificationToCampaignSlot(
  verification: SensoProviderVerification,
  campaignSlotStartAt: string
): SensoProviderVerification {
  const deltaMs = Date.parse(campaignSlotStartAt) - Date.parse(fixtureAnchorSlotStart);

  if (!Number.isFinite(deltaMs)) {
    return verification;
  }

  return {
    ...verification,
    verifiedPublicationDeadline: verification.verifiedPublicationDeadline !== null
      ? shiftIso(verification.verifiedPublicationDeadline, deltaMs)
      : null
  };
}

function shiftIso(value: string, deltaMs: number): string {
  return new Date(Date.parse(value) + deltaMs).toISOString();
}
