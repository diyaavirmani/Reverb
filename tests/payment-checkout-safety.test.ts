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
import { InMemoryPaymentAttemptGuard, generateIdempotencyKey } from "../src/lib/security/idempotency";
import type { ReachCheckoutRequest, ReachCheckoutResult } from "../src/schemas";

const fixtureSourceDir = join(process.cwd(), "fixtures", "data");
const fixedNow = "2026-08-01T00:00:00.000Z";
const oneTimeCredential = "one_time_prava_credential_for_test";

describe("CampaignService payment and checkout safety", () => {
  let temporaryRoot: string;
  let dataDir: string;
  let repository: LocalFixtureRepository;
  let n8nStorage: FixtureN8nStorageAdapter;
  let prava: FixturePravaAdapter;
  let adapters: IntegrationAdapters;
  let guard: InMemoryPaymentAttemptGuard;
  let service: CampaignService;
  let reach: ReachExchangeService;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-payment-safety-"));
    dataDir = join(temporaryRoot, "data");
    await cp(fixtureSourceDir, dataDir, { recursive: true });
    repository = new LocalFixtureRepository(dataDir);
    n8nStorage = new FixtureN8nStorageAdapter();
    prava = new FixturePravaAdapter();
    adapters = {
      openai: new FixtureOpenAIAdapter(),
      senso: new FixtureSensoAdapter(),
      linq: new FixtureLinqAdapter(),
      prava,
      n8nStorage
    };
    guard = new InMemoryPaymentAttemptGuard();
    reach = new ReachExchangeService(repository, clock);
    service = createService();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("marks a provider failure failed and consumes the checkout credential", async () => {
    const campaignId = await preparePaymentSession();
    const checkout = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    service = createService({ checkout });

    await expect(completeCheckout(campaignId)).rejects.toMatchObject({ code: "CHECKOUT_FAILED" });

    await expect(guard.getState(campaignId)).resolves.toMatchObject({ status: "FAILED" });
    await expect(repository.getTransaction(`transaction_${campaignId}`)).resolves.toMatchObject({
      status: "FAILED",
      pravaAuthorizationId: null,
      checkoutAttemptedAt: fixedNow
    });
  });

  it("reconciles merchant state before treating a timeout as failure", async () => {
    const campaignId = await preparePaymentSession();
    const auditLookup = vi.spyOn(repository, "listAuditEvents");
    const timeout = new Error("request timed out");
    timeout.name = "AbortError";
    service = createService({
      checkout: vi.fn(async () => {
        throw timeout;
      })
    });

    await expect(completeCheckout(campaignId)).rejects.toMatchObject({ code: "CHECKOUT_TIMEOUT" });

    expect(auditLookup).toHaveBeenCalledWith({ entityType: "MERCHANT_ORDER" });
    await expect(guard.getState(campaignId)).resolves.toMatchObject({ status: "FAILED" });
  });

  it("blocks credential reuse after a failed provider call", async () => {
    const campaignId = await preparePaymentSession();
    const checkout = vi.fn(async () => {
      throw new Error("provider failure");
    });
    service = createService({ checkout });

    await expect(completeCheckout(campaignId)).rejects.toMatchObject({ code: "CHECKOUT_FAILED" });
    await expect(completeCheckout(campaignId)).rejects.toMatchObject({
      code: "CHECKOUT_ALREADY_ATTEMPTED"
    });
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it("does not persist a one-time Prava credential", async () => {
    const campaignId = await preparePaymentSession();
    vi.spyOn(prava, "getPaymentResult").mockResolvedValue({
      sessionId: "fixture_prava_authorized",
      campaignId,
      status: "AUTHORIZED",
      currency: "INR",
      amountPaise: 480000,
      authorizationId: oneTimeCredential,
      completedAt: null,
      expiresAt: "2026-08-01T00:15:00.000Z",
      declinedReason: null,
      failureReason: null,
      isFixture: true
    });
    service = createService({ checkout: (input) => reach.checkout(input) });

    await completeCheckout(campaignId);

    const transaction = await repository.getTransaction(`transaction_${campaignId}`);
    const audits = await repository.listAuditEvents();
    const sessionRecord = await n8nStorage.getRecord("payment-sessions", campaignId);
    expect(transaction?.pravaAuthorizationId).toBeNull();
    expect(JSON.stringify({ transaction, audits, sessionRecord })).not.toContain(oneTimeCredential);
    expect(JSON.stringify(sessionRecord)).not.toContain("checkoutUrl");
    expect(await readFile(join(process.cwd(), "fixtures", "prava", "result-authorized.json"), "utf8"))
      .not.toContain('"authorizationId": "');
    expect(await readFile(join(process.cwd(), "fixtures", "prava", "session-awaiting-user.json"), "utf8"))
      .toContain('"checkoutUrl": null');
  });

  it("rejects expired approval before session creation and checkout", async () => {
    const expiredCampaignId = await prepareApprovedCampaign("2026-07-31T23:59:59.000Z");
    await expect(service.createPaymentSession({ campaignId: expiredCampaignId })).rejects.toMatchObject({
      code: "OWNER_APPROVAL_EXPIRED"
    });

    const checkoutCampaignId = await preparePaymentSession();
    const approval = await n8nStorage.getRecord("owner-approvals", checkoutCampaignId);
    await n8nStorage.saveRecord("owner-approvals", checkoutCampaignId, {
      ...approval,
      expiresAt: "2026-07-31T23:59:59.000Z"
    });
    await expect(completeCheckout(checkoutCampaignId)).rejects.toMatchObject({
      code: "OWNER_APPROVAL_EXPIRED"
    });
  });

  it("requires PRAVA_PENDING for payment session creation and checkout", async () => {
    const sessionCampaignId = await prepareApprovedCampaign();
    await setCampaignStatus(sessionCampaignId, "AWAITING_OWNER_APPROVAL");
    await expect(service.createPaymentSession({ campaignId: sessionCampaignId })).rejects.toMatchObject({
      code: "INVALID_CAMPAIGN_STATUS"
    });

    const checkoutCampaignId = await preparePaymentSession();
    await setCampaignStatus(checkoutCampaignId, "PAYMENT_AUTHORIZED");
    await expect(completeCheckout(checkoutCampaignId)).rejects.toMatchObject({
      code: "INVALID_CAMPAIGN_STATUS"
    });
  });

  it("blocks duplicate checkout calls without a second provider call", async () => {
    const campaignId = await preparePaymentSession();
    const checkout = vi.fn((input: ReachCheckoutRequest) => reach.checkout(input));
    service = createService({ checkout });

    await completeCheckout(campaignId);
    await expect(completeCheckout(campaignId)).rejects.toMatchObject({
      code: "CHECKOUT_ALREADY_ATTEMPTED"
    });
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it("returns the existing merchant order when the provider times out after creating it", async () => {
    const campaignId = await preparePaymentSession();
    const report = vi.spyOn(prava, "reportCheckoutOutcome");
    const checkout = vi.fn(async (input: ReachCheckoutRequest) => {
      await reach.checkout(input);
      const timeout = new Error("response lost");
      timeout.name = "TimeoutError";
      throw timeout;
    });
    service = createService({ checkout });

    const result = await completeCheckout(campaignId);

    expect(result.campaign.status).toBe("ORDER_COMPLETED");
    expect(result.checkout.duplicate).toBe(true);
    await expect(repository.getMerchantOrder(result.order.id)).resolves.toMatchObject({ id: result.order.id });
    await expect(guard.getState(campaignId)).resolves.toMatchObject({ status: "COMPLETED" });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutOutcome: "MERCHANT_ORDER_CREATED",
        merchantOrderId: result.order.id
      })
    );
  });

  it("reports failed checkout with a stable idempotency key and safe reason", async () => {
    const campaignId = await preparePaymentSession();
    const report = vi.spyOn(prava, "reportCheckoutOutcome");
    vi.spyOn(prava, "getPaymentResult").mockResolvedValue({
      sessionId: "fixture_prava_authorized",
      campaignId,
      status: "AUTHORIZED",
      currency: "INR",
      amountPaise: 480000,
      authorizationId: oneTimeCredential,
      completedAt: null,
      expiresAt: "2026-08-01T00:15:00.000Z",
      declinedReason: null,
      failureReason: null,
      isFixture: true
    });
    service = createService({
      checkout: vi.fn(async () => {
        throw new Error(`provider rejected ${oneTimeCredential}`);
      })
    });

    await expect(completeCheckout(campaignId)).rejects.not.toThrow(oneTimeCredential);

    const failedReport = report.mock.calls.find(([request]) => request.checkoutOutcome === "CHECKOUT_FAILED");
    expect(failedReport?.[0]).toMatchObject({
      idempotencyKey: generateIdempotencyKey(
        "prava-checkout-outcome",
        campaignId,
        "CHECKOUT_FAILED"
      ),
      failureReason: "provider_checkout_failed",
      merchantOrderId: null
    });
    expect(JSON.stringify(failedReport)).not.toContain(oneTimeCredential);
  });

  it("never reports success when the provider response has no merchant order", async () => {
    const campaignId = await preparePaymentSession();
    const report = vi.spyOn(prava, "reportCheckoutOutcome");
    const fakeCheckout: ReachCheckoutResult = {
      orderId: "missing_merchant_order",
      externalMerchantOrderId: "missing_external_order",
      campaignId,
      packageId: "package_local_dining_boost",
      merchantId: "merchant_reach_local_dining",
      merchantName: "Reverb Reach Exchange",
      amountPaise: 480000,
      currency: "INR",
      status: "CREATED",
      idempotencyKey: "fake_checkout_key",
      duplicate: false
    };
    service = createService({ checkout: vi.fn(async () => fakeCheckout) });

    await expect(completeCheckout(campaignId)).rejects.toMatchObject({
      code: "MERCHANT_ORDER_MISSING"
    });

    expect(report).not.toHaveBeenCalledWith(
      expect.objectContaining({ checkoutOutcome: "MERCHANT_ORDER_CREATED" })
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutOutcome: "CHECKOUT_FAILED", merchantOrderId: null })
    );
  });

  function createService(checkoutProvider?: Pick<ReachExchangeService, "checkout">): CampaignService {
    return new CampaignService(repository, adapters, clock, {
      paymentAttemptGuard: guard,
      ...(checkoutProvider ? { checkoutProvider } : {})
    });
  }

  async function prepareApprovedCampaign(expiresAt?: string): Promise<string> {
    const campaign = await service.createCampaignFromIntent({
      spotId: "spot_quiet_cup_cafe",
      requestedByOwnerId: "owner_payment_safety",
      ownerMessage: "Fill Friday 7-9 PM with 12 unused seats, target 6 reservations, budget Rs 5,000."
    });
    await service.discoverOptions(campaign.id);
    await service.selectOption(campaign.id);
    await service.generateCreative(campaign.id);
    await service.runQualityChecks(campaign.id);
    await service.recordOwnerApproval({
      campaignId: campaign.id,
      ownerId: "owner_payment_safety",
      approved: true,
      ...(expiresAt ? { expiresAt } : {})
    });
    return campaign.id;
  }

  async function preparePaymentSession(): Promise<string> {
    const campaignId = await prepareApprovedCampaign();
    await service.createPaymentSession({ campaignId });
    return campaignId;
  }

  function completeCheckout(campaignId: string) {
    return service.completeMerchantCheckout({
      campaignId,
      sessionId: "fixture_prava_authorized"
    });
  }

  async function setCampaignStatus(
    campaignId: string,
    status: "AWAITING_OWNER_APPROVAL" | "PAYMENT_AUTHORIZED"
  ): Promise<void> {
    const campaign = await repository.getCampaign(campaignId);
    if (campaign === null) throw new Error("Campaign fixture was not found.");
    await repository.updateCampaign({ ...campaign, status, updatedAt: fixedNow });
  }
});

function clock(): Date {
  return new Date(fixedNow);
}
