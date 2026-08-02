import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FixtureLinqAdapter, FixtureN8nStorageAdapter, FixtureOpenAIAdapter, FixturePravaAdapter, FixtureSensoAdapter } from "../src/lib/adapters/fixtures";
import { CampaignService } from "../src/lib/core/campaign-service";
import { LocalFixtureRepository } from "../src/lib/repositories";
import type { IntegrationAdapters } from "../src/lib/adapters";
import type { CampaignCreative } from "../src/schemas";

const fixtureSourceDir = join(process.cwd(), "fixtures", "data");
const fixedNow = "2026-08-01T00:00:00.000Z";

const deterministicQualityCases: Array<{
  name: string;
  expectedIssue: string;
  mutate: (creative: CampaignCreative) => CampaignCreative;
}> = [
  {
    name: "rejects an inaccurate Spot name",
    expectedIssue: "spot_name_missing_or_inaccurate",
    mutate: (creative) => replaceCreative(creative, /(the )?quiet cup( cafe)?/gi, "Different Spot")
  },
  {
    name: "rejects an inaccurate campaign date",
    expectedIssue: "campaign_date_missing_or_inaccurate",
    mutate: (creative) => replaceCreative(creative, /friday/gi, "Thursday")
  },
  {
    name: "rejects an inaccurate campaign time",
    expectedIssue: "campaign_time_missing_or_inaccurate",
    mutate: (creative) => replaceCreative(creative, /7-9 PM/g, "6-8 PM")
  },
  {
    name: "rejects an inaccurate discount",
    expectedIssue: "discount_missing_or_inaccurate",
    mutate: (creative) => replaceCreative(creative, /15%/g, "25%")
  },
  {
    name: "rejects an inaccurate budget",
    expectedIssue: "budget_missing_or_inaccurate",
    mutate: (creative) => replaceCreative(creative, /5,000/g, "6,000")
  },
  {
    name: "rejects an inaccurate provider",
    expectedIssue: "provider_missing_or_inaccurate",
    mutate: (creative) =>
      replaceCreative(
        creative,
        /Provider Reach Exchange Local Dining Boost/g,
        "Provider Different Distribution Partner"
      )
  },
  {
    name: "rejects an inaccurate package",
    expectedIssue: "package_missing_or_inaccurate",
    mutate: (creative) =>
      replaceCreative(creative, /package Local Dining Boost/g, "package Different Package")
  },
  {
    name: "rejects an inaccurate expected CPA",
    expectedIssue: "expected_cpa_missing_or_inaccurate",
    mutate: (creative) => replaceCreative(creative, /expected CPA INR 800/g, "expected CPA INR 900")
  },
  {
    name: "rejects an inaccurate publication deadline",
    expectedIssue: "deadline_missing_or_inaccurate",
    mutate: (creative) => replaceCreative(creative, /publication deadline Friday 6:30 PM/g, "publication deadline Friday 7:30 PM")
  },
  {
    name: "rejects a missing CTA",
    expectedIssue: "cta_missing",
    mutate: (creative) => ({ ...creative, callToAction: "" })
  }
];
describe("CampaignService", () => {
  let temporaryRoot: string;
  let dataDir: string;
  let repository: LocalFixtureRepository;
  let n8nStorage: FixtureN8nStorageAdapter;
  let service: CampaignService;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-campaign-service-"));
    dataDir = join(temporaryRoot, "data");
    await cp(fixtureSourceDir, dataDir, { recursive: true });
    repository = new LocalFixtureRepository(dataDir);
    n8nStorage = new FixtureN8nStorageAdapter();
    const adapters: IntegrationAdapters = {
      openai: new FixtureOpenAIAdapter(),
      senso: new FixtureSensoAdapter(),
      linq: new FixtureLinqAdapter(),
      prava: new FixturePravaAdapter(),
      n8nStorage
    };
    service = new CampaignService(repository, adapters, () => new Date(fixedNow));
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("runs the fixture happy path from campaign creation to ACTIVE without real API calls", async () => {
    const created = await service.createCampaignFromIntent({
      spotId: "spot_quiet_cup_cafe",
      requestedByOwnerId: "owner_diya_demo",
      ownerMessage: "Fill Friday 7-9 PM with 12 unused seats, target 6 reservations, budget Rs 5,000."
    });
    expect(created.status).toBe("READY_FOR_DISCOVERY");

    const discovery = await service.discoverOptions(created.id);
    expect(discovery.campaign.status).toBe("OPTIONS_READY");
    expect(discovery.options).toHaveLength(3);
    expect(discovery.options.filter((option) => option.passesDeterministicChecks)).toHaveLength(1);

    const selection = await service.selectOption(created.id);
    expect(selection.campaign.status).toBe("GENERATING_CREATIVE");
    expect(selection.selectedOption).toMatchObject({ packageId: "package_local_dining_boost" });

    const creative = await service.generateCreative(created.id);
    expect(creative.campaign.status).toBe("QUALITY_REVIEW");
    expect(creative.assets).toHaveLength(4);

    const quality = await service.runQualityChecks(created.id);
    expect(quality.campaign.status).toBe("AWAITING_OWNER_APPROVAL");
    expect(quality.review.status).toBe("PASSED");
    expect(quality.deterministicIssues).toEqual([]);

    const approval = await service.recordOwnerApproval({
      campaignId: created.id,
      ownerId: "owner_diya_demo",
      approved: true
    });
    expect(approval.campaign.status).toBe("PRAVA_PENDING");
    expect(approval.approval.status).toBe("APPROVED");

    const paymentSession = await service.createPaymentSession({ campaignId: created.id });
    expect(paymentSession.sessionId).toBe("fixture_prava_awaiting_user");
    expect(paymentSession.transaction.status).toBe("SESSION_CREATED");

    const checkout = await service.completeMerchantCheckout({
      campaignId: created.id,
      sessionId: "fixture_prava_authorized"
    });
    expect(checkout.campaign.status).toBe("ORDER_COMPLETED");
    expect(checkout.transaction.merchantOrderId).toBe(checkout.order.id);

    const activation = await service.activatePromotion(created.id);
    expect(activation.campaign.status).toBe("ACTIVE");
    expect(activation.activation.publicActivationUrl).toContain("https://reach.reverb-fill.test/activations/");

    const reservation = await service.recordReservation({
      campaignId: created.id,
      customerName: "Demo Guest",
      customerContact: "+919900000001",
      partySize: 2,
      reservationTime: "2026-08-07T14:00:00.000Z",
      trackingCode: "tracking_campaign_service_demo",
      isDemoBooking: true
    });
    expect(reservation.reservation.testLabel).toBe("TEST RESERVATION - NOT A REAL CUSTOMER");

    const summary = await service.getCampaignSummary(created.id);
    expect(summary.campaign.status).toBe("ACTIVE");
    expect(summary.selectedOption).toMatchObject({ packageId: "package_local_dining_boost" });
    expect(summary.transaction).toMatchObject({ status: "COMPLETED", merchantOrderId: checkout.order.id });
    expect(summary.performance).toMatchObject({
      campaignStatus: "ACTIVE",
      confirmedReservationCount: 0,
      confirmedGuestCount: 0,
      promotionSpendPaise: 480000
    });

    await expect(repository.listAuditEvents({ entityType: "CAMPAIGN", entityId: created.id })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "CAMPAIGN_CREATED_FROM_INTENT" }),
        expect.objectContaining({ eventType: "PROMOTION_ACTIVATED" })
      ])
    );
  });
  it.each(deterministicQualityCases)("$name", async ({ expectedIssue, mutate }) => {
    const campaignId = await prepareGeneratedCampaign();
    const storedCreative = await n8nStorage.getRecord("campaign-creatives", campaignId);
    if (storedCreative === null) throw new Error("Generated creative fixture was not found.");
    const creative = storedCreative.creative as CampaignCreative;
    await n8nStorage.saveRecord("campaign-creatives", campaignId, {
      ...storedCreative,
      creative: mutate(creative)
    });

    const quality = await service.runQualityChecks(campaignId);

    expect(quality.deterministicIssues).toContain(expectedIssue);
    expect(quality.review.status).toBe("NEEDS_REVISION");
    expect(quality.campaign.status).toBe("REJECTED_BY_POLICY");
  });

  async function prepareGeneratedCampaign(): Promise<string> {
    const campaign = await service.createCampaignFromIntent({
      spotId: "spot_quiet_cup_cafe",
      requestedByOwnerId: "owner_quality_negative",
      ownerMessage: "Fill Friday 7-9 PM with 12 unused seats, target 6 reservations, budget Rs 5,000."
    });
    await service.discoverOptions(campaign.id);
    await service.selectOption(campaign.id);
    await service.generateCreative(campaign.id);
    return campaign.id;
  }
});
function replaceCreative(
  creative: CampaignCreative,
  search: string | RegExp,
  replacement: string
): CampaignCreative {
  return {
    headline: creative.headline.replace(search, replacement),
    caption: creative.caption.replace(search, replacement),
    offerText: creative.offerText.replace(search, replacement),
    callToAction: creative.callToAction.replace(search, replacement),
    providerBrief: creative.providerBrief.replace(search, replacement),
    imagePrompt: creative.imagePrompt.replace(search, replacement)
  };
}