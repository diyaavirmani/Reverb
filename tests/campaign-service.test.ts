import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FixtureLinqAdapter, FixtureN8nStorageAdapter, FixtureOpenAIAdapter, FixturePravaAdapter, FixtureSensoAdapter } from "../src/lib/adapters/fixtures";
import { CampaignService } from "../src/lib/core/campaign-service";
import { LocalFixtureRepository } from "../src/lib/repositories";
import type { IntegrationAdapters } from "../src/lib/adapters";

const fixtureSourceDir = join(process.cwd(), "fixtures", "data");
const fixedNow = "2026-08-01T00:00:00.000Z";

describe("CampaignService", () => {
  let temporaryRoot: string;
  let dataDir: string;
  let repository: LocalFixtureRepository;
  let service: CampaignService;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-campaign-service-"));
    dataDir = join(temporaryRoot, "data");
    await cp(fixtureSourceDir, dataDir, { recursive: true });
    repository = new LocalFixtureRepository(dataDir);
    const adapters: IntegrationAdapters = {
      openai: new FixtureOpenAIAdapter(),
      senso: new FixtureSensoAdapter(),
      linq: new FixtureLinqAdapter(),
      prava: new FixturePravaAdapter(),
      n8nStorage: new FixtureN8nStorageAdapter()
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
});