import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../src/app/api/demo/lifecycle/route";
import { zonedTimeToUtc } from "../src/lib/core/zoned-time";

const fixtureSourceDirectory = join(process.cwd(), "fixtures", "data");
const originalEnv = { ...process.env };

describe("structured demo lifecycle input", () => {
  let temporaryRoot: string;
  let dataDirectory: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-structured-demo-"));
    dataDirectory = join(temporaryRoot, "data");
    await cp(fixtureSourceDirectory, dataDirectory, { recursive: true });
    process.env = {
      ...originalEnv,
      USE_FIXTURES: "true",
      REVERB_FIXTURE_DATA_DIR: dataDirectory,
      REVERB_CURRENT_TIME: "2026-09-22T09:00:00.000Z",
      DEMO_SPOT_ID: "spot_quiet_cup_cafe",
      OPENAI_API_KEY: "",
      SENSO_API_KEY: "",
      LINQ_API_KEY: "",
      PRAVA_SECRET_KEY: "",
      N8N_STORAGE_WEBHOOK_URL: ""
    };
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("converts Asia/Kolkata wall time to UTC", () => {
    expect(zonedTimeToUtc("2026-08-07", "19:00", "Asia/Kolkata")).toBe("2026-08-07T13:30:00.000Z");
  });

  it.each(["2026-09-25", "2026-12-04"])(
    "keeps the fixture package eligibility pattern for %s slots",
    async (date) => {
      const response = await lifecycle({
        prepareOnly: true,
        campaign: campaignInput({ date })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        finalStatus: "AWAITING_OWNER_APPROVAL",
        selectedPackageId: "package_local_dining_boost",
        eligibleOptionCount: 1,
        rejectedOptionCount: 2
      });
      expect(body.options).toEqual(expect.arrayContaining([
        expect.objectContaining({ packageId: "package_local_dining_boost", eligible: true }),
        expect.objectContaining({ packageId: "package_neighborhood_food_blast", eligible: false }),
        expect.objectContaining({ packageId: "package_premium_weekend_push", eligible: false })
      ]));
    },
    15_000
  );

  it("uses structured money and capacity fields instead of fixture OpenAI intent values", async () => {
    const response = await lifecycle({
      prepareOnly: true,
      campaign: campaignInput({
        unusedCapacity: 8,
        targetReservations: 4,
        maximumBudgetPaise: 300000
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.finalStatus).toBe("REJECTED_BY_POLICY");
    expect(body.outcome).toBe("NO_ELIGIBLE_PACKAGE");
    expect(body.options.every((option: { totalCostPaise: number; eligible: boolean }) => !option.eligible || option.totalCostPaise <= 300000)).toBe(true);
    expect(body.performance).toMatchObject({
      initialUnusedCapacity: 8,
      targetReservations: 4
    });
  });

  it("anchors fixture packages through checkout for a future full lifecycle", async () => {
    const response = await lifecycle({
      campaign: campaignInput({ date: "2026-10-02" }),
      reservation: {
        customerName: "Future Guest",
        customerContact: "future@example.test",
        partySize: 2,
        trackingCode: "future_full_lifecycle",
        isDemoBooking: true
      }
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      finalStatus: "ACTIVE",
      selectedPackageId: "package_local_dining_boost",
      merchantOrderId: expect.any(String)
    });
  }, 15_000);

  it("returns 200 with NO_ELIGIBLE_PACKAGE for a Rs 100 budget", async () => {
    const response = await lifecycle({
      campaign: campaignInput({ maximumBudgetPaise: 100 })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      finalStatus: "REJECTED_BY_POLICY",
      outcome: "NO_ELIGIBLE_PACKAGE",
      merchantOrderId: null,
      transactionStatus: "NOT_STARTED",
      activationStatus: "NOT_STARTED"
    });
  });

  it("rejects a past structured campaign slot with a clear 422", async () => {
    const response = await lifecycle({
      prepareOnly: true,
      campaign: campaignInput({ date: "2026-09-21" })
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ code: "CAMPAIGN_SLOT_IN_PAST" });
  });
});

function campaignInput(overrides: Partial<{
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  unusedCapacity: number;
  targetReservations: number;
  maximumBudgetPaise: number;
  maximumDiscountPercent: number;
  maximumCpaPaise: number;
}> = {}) {
  return {
    date: "2026-09-25",
    startTime: "19:00",
    endTime: "21:00",
    timezone: "Asia/Kolkata",
    unusedCapacity: 12,
    targetReservations: 6,
    maximumBudgetPaise: 500000,
    maximumDiscountPercent: 15,
    maximumCpaPaise: 85000,
    ...overrides
  };
}

function lifecycle(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/demo/lifecycle", {
      method: "POST",
      body: JSON.stringify(body)
    })
  );
}
