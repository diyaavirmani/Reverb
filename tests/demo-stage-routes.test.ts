import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as campaignPost } from "../src/app/api/demo/campaign/route";
import { POST as commercePost } from "../src/app/api/demo/commerce/route";
import { POST as lifecyclePost } from "../src/app/api/demo/lifecycle/route";
import { POST as reportPost } from "../src/app/api/demo/report/route";
import { POST as reservationPost } from "../src/app/api/demo/reservation/route";
import { GET as performanceGet } from "../src/app/api/campaigns/[campaignId]/performance/route";
import { POST as reservationTrackingPost } from "../src/app/api/reservations/route";

const fixtureSourceDirectory = join(process.cwd(), "fixtures", "data");
const originalEnv = { ...process.env };

describe("demo stage APIs", () => {
  let temporaryRoot: string;
  let dataDirectory: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-demo-stage-"));
    dataDirectory = join(temporaryRoot, "data");
    await cp(fixtureSourceDirectory, dataDirectory, { recursive: true });
    process.env = {
      ...originalEnv,
      USE_FIXTURES: "true",
      REVERB_FIXTURE_DATA_DIR: dataDirectory,
      REVERB_CURRENT_TIME: "2026-08-01T00:00:00.000Z",
      DEMO_SPOT_ID: "spot_quiet_cup_cafe",
      OPENAI_API_KEY: "",
      SENSO_API_KEY: "",
      LINQ_API_KEY: "",
      PRAVA_SECRET_KEY: "",
      N8N_STORAGE_WEBHOOK_URL: ""
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = originalEnv;
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it(
    "runs each simplified fixture stage without external network calls",
    async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("External fetch should not be called by demo stage APIs in fixture mode.");
      });

      const campaign = await postJson(campaignPost, "/api/demo/campaign", {});
      expect(campaign.status).toBe(200);
      expect(campaign.body).toMatchObject({
        mode: "fixture",
        status: "AWAITING_OWNER_APPROVAL",
        selectedPackageId: "package_local_dining_boost",
        eligibleOptionCount: 1,
        rejectedOptionCount: 2,
        qualityStatus: "PASSED"
      });

      const commerce = await postJson(commercePost, "/api/demo/commerce", {
        campaignId: campaign.body.campaignId,
        ownerApproval: true,
        approvedAmountPaise: 480000,
        maximumBudgetPaise: 500000
      });
      expect(commerce.status).toBe(200);
      expect(commerce.body).toMatchObject({
        mode: "fixture",
        campaignId: campaign.body.campaignId,
        ownerApprovalStatus: "APPROVED",
        transactionStatus: "COMPLETED",
        activationStatus: "ACTIVE",
        demoTransaction: true
      });
      expect(commerce.body.merchantOrderId).toEqual(expect.any(String));

      const reservation = await postJson(reservationPost, "/api/demo/reservation", {
        campaignId: campaign.body.campaignId,
        customerName: "Demo Guest",
        customerContact: "demo@example.test",
        partySize: 2,
        reservationTime: "2026-08-07T14:00:00.000Z",
        trackingCode: "stage_route_reservation_001",
        isDemoBooking: true
      });
      expect(reservation.status).toBe(200);
      expect(reservation.body).toMatchObject({
        mode: "fixture",
        campaignId: campaign.body.campaignId,
        isDemoBooking: true,
        reservationId: expect.any(String),
        performance: {
          campaignStatus: "ACTIVE"
        }
      });

      const report = await postJson(reportPost, "/api/demo/report", {
        campaignId: campaign.body.campaignId
      });
      expect(report.status).toBe(200);
      expect(report.body).toMatchObject({
        mode: "fixture",
        campaignId: campaign.body.campaignId,
        campaignStatus: "ACTIVE",
        reservationCount: 1,
        performance: {
          campaignStatus: "ACTIVE"
        }
      });

      const lifecycle = await postJson(lifecyclePost, "/api/demo/lifecycle", {});
      expect(lifecycle.status).toBe(200);
      expect(lifecycle.body).toMatchObject({
        mode: "fixture",
        finalStatus: "ACTIVE",
        selectedPackageId: "package_local_dining_boost",
        transactionStatus: "COMPLETED",
        activationStatus: "ACTIVE",
        isDemoBooking: true
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    },
    15000
  );

  it(
    "shares one fixture store across sequential route-handler requests when no override is configured",
    async () => {
      delete process.env.REVERB_FIXTURE_DATA_DIR;

      const campaign = await postJson(campaignPost, "/api/demo/campaign", {});
      expect(campaign.status).toBe(200);

      const commerce = await postJson(commercePost, "/api/demo/commerce", {
        campaignId: campaign.body.campaignId,
        ownerApproval: true
      });
      expect(commerce.status).toBe(200);

      const reservation = await postJson(reservationPost, "/api/demo/reservation", {
        campaignId: campaign.body.campaignId,
        trackingCode: "shared_store_route_reservation"
      });
      expect(reservation.status).toBe(200);

      const report = await postJson(reportPost, "/api/demo/report", {
        campaignId: campaign.body.campaignId
      });
      expect(report.status).toBe(200);
      expect(report.body).toMatchObject({
        campaignId: campaign.body.campaignId,
        reservationCount: 1,
        campaignStatus: "ACTIVE"
      });
    },
    15000
  );

  it(
    "uses one temporary fixture directory across repeated lifecycles",
    async () => {
      delete process.env.REVERB_FIXTURE_DATA_DIR;
      const initialTempDirCount = await countTempFixtureDirs();

      for (let index = 0; index < 20; index += 1) {
        const response = await postJson(lifecyclePost, "/api/demo/lifecycle", {
          prepareOnly: true
        });
        expect(response.status).toBe(200);
      }

      await expect(countTempFixtureDirs()).resolves.toBeLessThanOrEqual(initialTempDirCount + 1);
    },
    30000
  );

  it(
    "makes public reservation route writes visible to campaign performance for a demo campaign",
    async () => {
      delete process.env.REVERB_FIXTURE_DATA_DIR;

      const lifecycle = await postJson(lifecyclePost, "/api/demo/lifecycle", {});
      expect(lifecycle.status).toBe(200);

      const trackedReservation = await postJson(reservationTrackingPost, "/api/reservations", {
        campaignId: lifecycle.body.campaignId,
        customerName: "Visible Guest",
        customerContact: "+919900000099",
        partySize: 2,
        reservationTime: "2026-08-07T14:30:00.000Z",
        trackingCode: "shared_store_public_reservation",
        isDemoBooking: false
      });
      expect(trackedReservation.status).toBe(201);

      const performanceResponse = await performanceGet(
        new Request(`http://localhost/api/campaigns/${lifecycle.body.campaignId}/performance`),
        { params: Promise.resolve({ campaignId: lifecycle.body.campaignId }) }
      );
      const performance = await performanceResponse.json();

      expect(performanceResponse.status).toBe(200);
      expect(performance.confirmedReservationCount).toBe(1);
      expect(performance.confirmedGuestCount).toBe(2);
    },
    15000
  );
});

async function postJson(handler: (request: Request) => Promise<Response>, path: string, body: unknown) {
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      body: JSON.stringify(body)
    })
  );

  return {
    status: response.status,
    body: await response.json()
  };
}

async function countTempFixtureDirs(): Promise<number> {
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("reverb-demo-fixtures-")).length;
}
