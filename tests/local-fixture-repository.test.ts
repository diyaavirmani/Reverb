import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStorageRepository, LocalFixtureRepository } from "../src/lib/repositories";
import type { Campaign, Reservation, Transaction } from "../src/schemas";

const fixtureSourceDir = join(process.cwd(), "fixtures", "data");
const now = "2026-08-01T10:00:00.000Z";

const campaign: Campaign = {
  id: "campaign_test_001",
  spotId: "spot_quiet_cup_cafe",
  requestedByOwnerId: "owner_diya_demo",
  status: "DRAFT",
  requestSummary: "Fill 12 unused seats on Friday evening.",
  slotStartAt: "2026-08-07T13:30:00.000Z",
  slotEndAt: "2026-08-07T15:30:00.000Z",
  unusedCapacity: 12,
  targetReservations: 6,
  maxBudgetPaise: 500000,
  maxDiscountBps: 1500,
  maxExpectedCpaPaise: 85000,
  createdAt: now,
  updatedAt: now
};

describe("LocalFixtureRepository", () => {
  let temporaryRoot: string;
  let dataDir: string;
  let repository: LocalFixtureRepository;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-fill-fixtures-"));
    dataDir = join(temporaryRoot, "data");
    await cp(fixtureSourceDir, dataDir, { recursive: true });
    repository = new LocalFixtureRepository(dataDir);
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("looks up seeded spots, providers, and promotion packages", async () => {
    await expect(repository.getSpot("spot_quiet_cup_cafe")).resolves.toMatchObject({
      id: "spot_quiet_cup_cafe",
      category: "CAFE"
    });

    await expect(repository.listProviders()).resolves.toHaveLength(3);
    await expect(repository.getProvider("provider_reach_local_dining")).resolves.toMatchObject({
      verificationStatus: "VERIFIED"
    });

    await expect(repository.listPromotionPackages()).resolves.toHaveLength(3);
    await expect(repository.getPromotionPackage("package_local_dining_boost")).resolves.toMatchObject(
      {
        pricePaise: 480000,
        expectedCpaPaise: 80000
      }
    );
  });

  it("creates, updates, and looks up a campaign", async () => {
    await expect(repository.createCampaign(campaign)).resolves.toEqual(campaign);
    await expect(repository.getCampaign(campaign.id)).resolves.toEqual(campaign);

    const updatedCampaign: Campaign = {
      ...campaign,
      status: "READY_FOR_DISCOVERY",
      updatedAt: "2026-08-01T10:05:00.000Z"
    };

    await expect(repository.updateCampaign(updatedCampaign)).resolves.toEqual(updatedCampaign);
    await expect(repository.getCampaign(campaign.id)).resolves.toEqual(updatedCampaign);
  });

  it("rejects duplicate campaign IDs", async () => {
    await repository.createCampaign(campaign);

    await expect(repository.createCampaign(campaign)).rejects.toThrow(
      "Duplicate campaign id: campaign_test_001"
    );
  });

  it("rejects duplicate campaign option IDs when saving the complete result", async () => {
    await repository.createCampaign(campaign);

    const option = {
      id: "option_duplicate",
      campaignId: campaign.id,
      packageId: "package_local_dining_boost",
      evidenceIds: ["evidence_local_dining_boost"],
      score: 100,
      totalCostPaise: 480000,
      expectedReservations: 6,
      expectedCpaPaise: 80000,
      discountBps: 1500,
      deterministicChecks: {
        budget: true,
        deadline: true,
        price: true,
        merchant: true,
        discount: true,
        cpa: true
      },
      passesDeterministicChecks: true,
      rejectionReasons: [],
      createdAt: now
    };

    await expect(repository.saveCampaignOptions(campaign.id, [option, option])).rejects.toThrow(
      "Duplicate campaign option id: option_duplicate"
    );
  });

  it("returns campaign performance from saved fixture records", async () => {
    await repository.createCampaign(campaign);

    const transaction: Transaction = {
      id: "transaction_test_001",
      campaignId: campaign.id,
      ownerApprovalId: "approval_test_001",
      providerId: "provider_reach_local_dining",
      packageId: "package_local_dining_boost",
      status: "COMPLETED",
      currency: "INR",
      amountPaise: 480000,
      idempotencyKey: "idem_test_001",
      pravaAuthorizationId: "prava_test_001",
      checkoutAttemptedAt: now,
      merchantOrderId: "merchant_order_test_001",
      createdAt: now,
      updatedAt: now
    };
    const reservation: Reservation = {
      id: "reservation_test_001",
      campaignId: campaign.id,
      activationId: "activation_test_001",
      spotId: "spot_quiet_cup_cafe",
      source: "Reach Exchange fixture",
      customerReference: "customer_fixture_001",
      seatCount: 2,
      reservationAt: "2026-08-07T14:00:00.000Z",
      attributedAt: "2026-08-07T14:01:00.000Z",
      status: "BOOKED",
      isTest: false,
      testLabel: null
    };

    await repository.saveTransaction(transaction);
    await repository.saveReservation(reservation);

    await expect(repository.getCampaignPerformance(campaign.id)).resolves.toEqual({
      campaignId: campaign.id,
      targetReservations: 6,
      attributedReservations: 1,
      testReservations: 0,
      spendPaise: 480000,
      expectedCpaPaise: null,
      actualCpaPaise: 480000
    });
  });
});

describe("createStorageRepository", () => {
  it("uses fixture storage only when USE_FIXTURES is true", () => {
    expect(
      createStorageRepository({
        env: { USE_FIXTURES: "true" },
        fixtureDataDir: fixtureSourceDir
      })
    ).toBeInstanceOf(LocalFixtureRepository);
  });

  it("throws a clear live repository error when USE_FIXTURES is false", () => {
    expect(() =>
      createStorageRepository({
        env: { USE_FIXTURES: "false" },
        fixtureDataDir: fixtureSourceDir
      })
    ).toThrow("live repository not configured");
  });
});
