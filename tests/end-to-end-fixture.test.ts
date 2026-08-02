import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IntegrationAdapters } from "../src/lib/adapters";
import {
  FixtureLinqAdapter,
  FixtureN8nStorageAdapter,
  FixtureOpenAIAdapter,
  FixturePravaAdapter,
  FixtureSensoAdapter
} from "../src/lib/adapters/fixtures";
import { CampaignService } from "../src/lib/core/campaign-service";
import { ReachExchangeService } from "../src/lib/core/reach-exchange";
import { LocalFixtureRepository } from "../src/lib/repositories";
import { InMemoryPaymentAttemptGuard } from "../src/lib/security/idempotency";
import { MerchantOrderSchema } from "../src/schemas";

const fixtureSourceDirectory = join(process.cwd(), "fixtures", "data");
const fixedNow = "2026-08-01T00:00:00.000Z";

describe("Reverb Fill end-to-end fixture", () => {
  let temporaryRoot: string;
  let dataDirectory: string;
  let repository: LocalFixtureRepository;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-e2e-fixture-"));
    dataDirectory = join(temporaryRoot, "data");
    await cp(fixtureSourceDirectory, dataDirectory, { recursive: true });
    repository = new LocalFixtureRepository(dataDirectory);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("executes the complete fixture commerce path with deterministic safety gates", async () => {
    const openai = new FixtureOpenAIAdapter();
    const senso = new FixtureSensoAdapter();
    const prava = new FixturePravaAdapter();
    const n8nStorage = new FixtureN8nStorageAdapter();
    const adapters: IntegrationAdapters = {
      openai,
      senso,
      prava,
      n8nStorage,
      linq: new FixtureLinqAdapter()
    };
    const intentSpy = vi.spyOn(openai, "extractCampaignIntent");
    const explanationSpy = vi.spyOn(openai, "explainProviderDecision");
    const creativeSpy = vi.spyOn(openai, "generateCampaignCreative");
    const reviewSpy = vi.spyOn(openai, "reviewCampaignQuality");
    const sensoSpy = vi.spyOn(senso, "verifyProvider");
    const paymentResultSpy = vi.spyOn(prava, "getPaymentResult");
    const outcomeSpy = vi.spyOn(prava, "reportCheckoutOutcome");
    const deliverySpy = vi.spyOn(ReachExchangeService.prototype, "deliver");
    const activationSpy = vi.spyOn(ReachExchangeService.prototype, "activate");
    const guard = new InMemoryPaymentAttemptGuard();
    const acquireSpy = vi.spyOn(guard, "acquire");
    const reach = new ReachExchangeService(repository, clock);
    const checkoutSpy = vi.spyOn(reach, "checkout");
    const service = new CampaignService(repository, adapters, clock, {
      paymentAttemptGuard: guard,
      checkoutProvider: reach
    });

    const campaign = await service.createCampaignFromIntent({
      spotId: "spot_quiet_cup_cafe",
      requestedByOwnerId: "owner_diya_demo",
      ownerMessage:
        "Fill Friday 7-9 PM with 12 unused seats, target 6 reservations, budget Rs 5,000, maximum discount 15%, and maximum CPA Rs 850."
    });
    expect(intentSpy).toHaveBeenCalledOnce();
    expect(campaign).toMatchObject({
      status: "READY_FOR_DISCOVERY",
      unusedCapacity: 12,
      targetReservations: 6,
      maxBudgetPaise: 500000,
      maxExpectedCpaPaise: 85000
    });

    const discovery = await service.discoverOptions(campaign.id);
    expect(sensoSpy).toHaveBeenCalledTimes(3);
    expect(discovery.options).toHaveLength(3);
    const winner = discovery.options.find(
      (option) => option.packageId === "package_local_dining_boost"
    );
    const weakEvidence = discovery.options.find(
      (option) => option.packageId === "package_neighborhood_food_blast"
    );
    const lateOrHighCpa = discovery.options.find(
      (option) => option.packageId === "package_premium_weekend_push"
    );
    expect(winner).toMatchObject({
      passesDeterministicChecks: true,
      totalCostPaise: 480000,
      expectedCpaPaise: 80000
    });
    expect(weakEvidence?.passesDeterministicChecks).toBe(false);
    expect(weakEvidence?.rejectionReasons).toEqual(
      expect.arrayContaining([
        "Provider evidence confidence is below the configured threshold.",
        "Provider audience geography does not match the Spot."
      ])
    );
    expect(lateOrHighCpa?.passesDeterministicChecks).toBe(false);
    expect(lateOrHighCpa?.rejectionReasons).toEqual(
      expect.arrayContaining([
        "Promotion package price exceeds the campaign budget.",
        "Promotion package publication deadline is too late for the campaign slot.",
        "Worst-case expected CPA exceeds the campaign limit."
      ])
    );

    const selection = await service.selectOption(campaign.id);
    expect(selection.selectedOption?.packageId).toBe("package_local_dining_boost");
    const selectedProvider = await repository.getProvider(
      (await repository.getPromotionPackage(selection.selectedOption!.packageId))!.providerId
    );
    expect(selectedProvider?.id).toBe("provider_reach_local_dining");
    expect(selection.selectedOption!.totalCostPaise).toBeLessThanOrEqual(500000);
    expect(selection.selectedOption!.expectedCpaPaise).toBeLessThanOrEqual(85000);

    const explanation = await adapters.openai.explainProviderDecision({
      campaignId: campaign.id,
      selectedPackageId: selection.selectedOption!.packageId,
      selectedReasons: ["eligible", "highest_deterministic_score"],
      rejectedAlternatives: [
        {
          packageId: weakEvidence!.packageId,
          providerId: "provider_reach_neighborhood_food",
          reasons: weakEvidence!.rejectionReasons
        },
        {
          packageId: lateOrHighCpa!.packageId,
          providerId: "provider_reach_premium_weekend",
          reasons: lateOrHighCpa!.rejectionReasons
        }
      ]
    });
    expect(explanationSpy).toHaveBeenCalledOnce();
    expect(explanation.summary).not.toBe("");

    const generated = await service.generateCreative(campaign.id);
    expect(creativeSpy).toHaveBeenCalledOnce();
    expect(generated.campaign.status).toBe("QUALITY_REVIEW");
    const quality = await service.runQualityChecks(campaign.id);
    expect(reviewSpy).toHaveBeenCalledOnce();
    expect(quality).toMatchObject({
      campaign: { status: "AWAITING_OWNER_APPROVAL" },
      review: { status: "PASSED" },
      deterministicIssues: []
    });

    const approval = await service.recordOwnerApproval({
      campaignId: campaign.id,
      ownerId: "owner_diya_demo",
      approved: true
    });
    expect(approval.campaign.status).toBe("PRAVA_PENDING");
    const paymentSession = await service.createPaymentSession({ campaignId: campaign.id });
    expect(paymentSession.sessionId).toBe("fixture_prava_awaiting_user");

    const checkout = await service.completeMerchantCheckout({
      campaignId: campaign.id,
      sessionId: "fixture_prava_authorized"
    });
    expect(paymentResultSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "fixture_prava_authorized" })
    );
    expect(acquireSpy).toHaveBeenCalledOnce();
    expect(checkoutSpy).toHaveBeenCalledOnce();
    expect(checkout.campaign.status).toBe("ORDER_COMPLETED");
    expect(checkout.order.id).toBe(checkout.transaction.merchantOrderId);
    expect(outcomeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutOutcome: "MERCHANT_ORDER_CREATED",
        merchantOrderId: checkout.order.id
      })
    );

    const storedOrders = MerchantOrderSchema.array().parse(
      JSON.parse(await readFile(join(dataDirectory, "merchant-orders.json"), "utf8"))
    );
    expect(storedOrders).toHaveLength(1);

    const activation = await service.activatePromotion(campaign.id);
    expect(deliverySpy).toHaveBeenCalledOnce();
    expect(activationSpy).toHaveBeenCalledOnce();
    expect(activation.campaign.status).toBe("ACTIVE");

    const reservation = await service.recordReservation({
      campaignId: campaign.id,
      customerName: "Demo Guest",
      customerContact: "+919900000001",
      partySize: 2,
      reservationTime: "2026-08-07T14:00:00.000Z",
      trackingCode: "tracking_e2e_demo_001",
      isDemoBooking: true
    });
    expect(reservation.reservation).toMatchObject({
      campaignId: campaign.id,
      isTest: true,
      testLabel: "TEST RESERVATION - NOT A REAL CUSTOMER"
    });
    await expect(repository.listReservations(campaign.id)).resolves.toHaveLength(1);

    const summary = await service.getCampaignSummary(campaign.id);
    expect(summary.campaign.status).toBe("ACTIVE");
    expect(summary.performance).toMatchObject({
      initialUnusedCapacity: 12,
      targetReservations: 6,
      promotionSpendPaise: 480000,
      campaignStatus: "ACTIVE"
    });

    const audits = await repository.listAuditEvents();
    const campaignAudits = audits.filter(
      (event) => event.entityType === "CAMPAIGN" && event.entityId === campaign.id
    );
    expect(campaignAudits.map((event) => event.nextState)).toEqual(
      expect.arrayContaining([
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
        "ACTIVE"
      ])
    );
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "PRAVA_SESSION_CREATED" }),
        expect.objectContaining({ eventType: "MERCHANT_CHECKOUT_ATTEMPTED" }),
        expect.objectContaining({ eventType: "REACH_CHECKOUT_COMPLETED" }),
        expect.objectContaining({ eventType: "REACH_ORDER_DELIVERED" }),
        expect.objectContaining({ eventType: "REACH_ORDER_ACTIVATED" }),
        expect.objectContaining({ eventType: "RESERVATION_TRACKED" })
      ])
    );

    const paymentSessionRecord = await n8nStorage.getRecord("payment-sessions", campaign.id);
    const storedJson = [
      await readFile(join(dataDirectory, "transactions.json"), "utf8"),
      await readFile(join(dataDirectory, "merchant-orders.json"), "utf8"),
      await readFile(join(dataDirectory, "audit-events.json"), "utf8"),
      JSON.stringify(paymentSessionRecord)
    ].join("\n");
    expect(storedJson).not.toMatch(/fixture_ephemeral_|one_time|cardNumber|cvv|paymentToken/i);
    expect(checkout.transaction.pravaAuthorizationId).toBeNull();
  });
});

function clock(): Date {
  return new Date(fixedNow);
}
