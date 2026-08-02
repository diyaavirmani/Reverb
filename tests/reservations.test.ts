import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as getPerformance } from "../src/app/api/campaigns/[campaignId]/performance/route";
import { POST as createReservation } from "../src/app/api/reservations/route";
import { LocalFixtureRepository } from "../src/lib/repositories";
import {
  CampaignPerformanceReportSchema,
  ReservationSubmissionResultSchema,
  type Campaign,
  type Reservation,
  type Transaction
} from "../src/schemas";

const fixtureSourceDir = join(process.cwd(), "fixtures", "data");
const now = "2026-08-01T10:00:00.000Z";
const originalUseFixtures = process.env.USE_FIXTURES;
const originalFixtureDataDir = process.env.REVERB_FIXTURE_DATA_DIR;
const originalCurrentTime = process.env.REVERB_CURRENT_TIME;

const activeCampaign: Campaign = {
  id: "campaign_reservation_active",
  spotId: "spot_quiet_cup_cafe",
  requestedByOwnerId: "owner_diya_demo",
  status: "ACTIVE",
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

const inactiveCampaign: Campaign = {
  ...activeCampaign,
  id: "campaign_reservation_inactive",
  status: "DRAFT"
};

describe("reservation tracking API", () => {
  let temporaryRoot: string;
  let dataDir: string;
  let repository: LocalFixtureRepository;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-reservations-fixtures-"));
    dataDir = join(temporaryRoot, "data");
    await cp(fixtureSourceDir, dataDir, { recursive: true });
    repository = new LocalFixtureRepository(dataDir);
    process.env.USE_FIXTURES = "true";
    process.env.REVERB_FIXTURE_DATA_DIR = dataDir;
    process.env.REVERB_CURRENT_TIME = "2026-08-07T14:05:00.000Z";
    await repository.createCampaign(activeCampaign);
    await repository.createCampaign(inactiveCampaign);
  });

  afterEach(async () => {
    restoreEnv();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("creates a visibly labelled demo reservation for an active campaign", async () => {
    const response = await createReservation(
      jsonRequest("/api/reservations", {
        campaignId: activeCampaign.id,
        customerName: "Demo Guest",
        customerContact: "+919900000001",
        partySize: 2,
        reservationTime: "2026-08-07T14:00:00.000Z",
        trackingCode: "tracking_demo_valid",
        isDemoBooking: true
      })
    );
    const result = ReservationSubmissionResultSchema.parse(await response.json());

    expect(response.status).toBe(201);
    expect(result.reservation).toMatchObject({
      campaignId: activeCampaign.id,
      seatCount: 2,
      status: "BOOKED",
      isTest: true,
      testLabel: "TEST RESERVATION - NOT A REAL CUSTOMER"
    });
    expect(result.reservation.customerReference).toContain("TEST RESERVATION");
    await expect(repository.listAuditEvents({ entityType: "RESERVATION" })).resolves.toHaveLength(1);
  });

  it("rejects reservations for inactive campaigns", async () => {
    const response = await createReservation(
      jsonRequest("/api/reservations", {
        campaignId: inactiveCampaign.id,
        customerName: "Quiet Guest",
        customerContact: "+919900000002",
        partySize: 2,
        reservationTime: "2026-08-07T14:00:00.000Z",
        trackingCode: "tracking_inactive",
        isDemoBooking: false
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "CAMPAIGN_NOT_ACTIVE" });
  });

  it("rejects reservations that exceed unused capacity", async () => {
    await repository.saveReservation(baseReservation({ id: "reservation_existing_11", seatCount: 11 }));

    const response = await createReservation(
      jsonRequest("/api/reservations", {
        campaignId: activeCampaign.id,
        customerName: "Overflow Guest",
        customerContact: "+919900000003",
        partySize: 2,
        reservationTime: "2026-08-07T14:00:00.000Z",
        trackingCode: "tracking_capacity",
        isDemoBooking: false
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "CAPACITY_EXCEEDED" });
  });

  it("rejects duplicate tracking submissions", async () => {
    const requestBody = {
      campaignId: activeCampaign.id,
      customerName: "Repeat Guest",
      customerContact: "+919900000004",
      partySize: 2,
      reservationTime: "2026-08-07T14:00:00.000Z",
      trackingCode: "tracking_duplicate",
      isDemoBooking: false
    };

    const firstResponse = await createReservation(jsonRequest("/api/reservations", requestBody));
    const duplicateResponse = await createReservation(jsonRequest("/api/reservations", requestBody));

    expect(firstResponse.status).toBe(201);
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      code: "DUPLICATE_TRACKING_SUBMISSION"
    });
  });

  it("calculates campaign performance from confirmed reservations, spend, and spot value", async () => {
    await repository.saveReservation(baseReservation({ id: "reservation_real_1", seatCount: 2 }));
    await repository.saveReservation(baseReservation({
      id: "reservation_real_2",
      source: "tracking_real_2",
      customerReference: "Second Guest (+919900000005)",
      seatCount: 3
    }));
    await repository.saveReservation(baseReservation({
      id: "reservation_demo_1",
      source: "tracking_demo_1",
      customerReference: "TEST RESERVATION - NOT A REAL CUSTOMER: Demo Guest",
      seatCount: 2,
      isTest: true,
      testLabel: "TEST RESERVATION - NOT A REAL CUSTOMER"
    }));
    await repository.saveTransaction(completedTransaction());

    const response = await getPerformance(
      new Request(`http://localhost/api/campaigns/${activeCampaign.id}/performance`),
      { params: { campaignId: activeCampaign.id } }
    );
    const performance = CampaignPerformanceReportSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(performance).toEqual({
      initialUnusedCapacity: 12,
      targetReservations: 6,
      confirmedReservationCount: 2,
      confirmedGuestCount: 5,
      capacityRecoveryPercent: 41.67,
      remainingCapacity: 7,
      promotionSpendPaise: 480000,
      actualCostPerReservationPaise: 240000,
      estimatedRevenueRecoveredPaise: 625000,
      campaignStatus: "ACTIVE"
    });
  });
});

function baseReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "reservation_existing_1",
    campaignId: activeCampaign.id,
    activationId: "tracking_existing_1",
    spotId: activeCampaign.spotId,
    source: "tracking_existing_1",
    customerReference: "Existing Guest (+919900000000)",
    seatCount: 2,
    reservationAt: "2026-08-07T14:00:00.000Z",
    attributedAt: "2026-08-07T14:01:00.000Z",
    status: "BOOKED",
    isTest: false,
    testLabel: null,
    ...overrides
  };
}

function completedTransaction(): Transaction {
  return {
    id: "transaction_reservation_performance",
    campaignId: activeCampaign.id,
    ownerApprovalId: "approval_reservation_performance",
    providerId: "provider_reach_local_dining",
    packageId: "package_local_dining_boost",
    status: "COMPLETED",
    currency: "INR",
    amountPaise: 480000,
    idempotencyKey: "idem_reservation_performance",
    pravaAuthorizationId: null,
    checkoutAttemptedAt: now,
    merchantOrderId: "merchant_order_reservation_performance",
    createdAt: now,
    updatedAt: now
  };
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function restoreEnv(): void {
  if (originalUseFixtures === undefined) {
    delete process.env.USE_FIXTURES;
  } else {
    process.env.USE_FIXTURES = originalUseFixtures;
  }

  if (originalFixtureDataDir === undefined) {
    delete process.env.REVERB_FIXTURE_DATA_DIR;
  } else {
    process.env.REVERB_FIXTURE_DATA_DIR = originalFixtureDataDir;
  }

  if (originalCurrentTime === undefined) {
    delete process.env.REVERB_CURRENT_TIME;
  } else {
    process.env.REVERB_CURRENT_TIME = originalCurrentTime;
  }
}