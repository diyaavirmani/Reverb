import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/demo/lifecycle/route";
import { AuditEventSchema, MerchantOrderSchema, ReservationSchema } from "../src/schemas";

const fixtureSourceDirectory = join(process.cwd(), "fixtures", "data");
const originalEnv = { ...process.env };

describe("direct fixture demo lifecycle API", () => {
  let temporaryRoot: string;
  let dataDirectory: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-direct-demo-"));
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
    "runs campaign to performance without live APIs or running n8n",
    async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("External fetch should not be called in fixture demo lifecycle.");
      });

      const response = await POST(
        new Request("http://localhost/api/demo/lifecycle", {
          method: "POST",
          body: JSON.stringify({})
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(body).toMatchObject({
        mode: "fixture",
        finalStatus: "ACTIVE",
        selectedPackageId: "package_local_dining_boost",
        eligibleOptionCount: 1,
        rejectedOptionCount: 2,
        qualityStatus: "PASSED",
        ownerApprovalStatus: "APPROVED",
        transactionStatus: "COMPLETED",
        activationStatus: "ACTIVE",
        isDemoBooking: true,
        performance: {
          initialUnusedCapacity: 12,
          targetReservations: 6,
          promotionSpendPaise: 480000,
          campaignStatus: "ACTIVE"
        }
      });
      expect(body.merchantOrderId).toEqual(expect.any(String));
      expect(body.reservationId).toEqual(expect.any(String));
      expect(body.auditEventCount).toBeGreaterThanOrEqual(12);

      const storedOrders = MerchantOrderSchema.array().parse(
        JSON.parse(await readFile(join(dataDirectory, "merchant-orders.json"), "utf8"))
      );
      const storedReservations = ReservationSchema.array().parse(
        JSON.parse(await readFile(join(dataDirectory, "reservations.json"), "utf8"))
      );
      const storedAuditEvents = AuditEventSchema.array().parse(
        JSON.parse(await readFile(join(dataDirectory, "audit-events.json"), "utf8"))
      );
      const storedJson = [
        await readFile(join(dataDirectory, "transactions.json"), "utf8"),
        await readFile(join(dataDirectory, "merchant-orders.json"), "utf8"),
        await readFile(join(dataDirectory, "audit-events.json"), "utf8")
      ].join("\n");

      expect(storedOrders).toHaveLength(1);
      expect(storedReservations).toHaveLength(1);
      expect(storedAuditEvents.length).toBeGreaterThanOrEqual(12);
      expect(storedJson).not.toMatch(/fixture_ephemeral_|paymentAuthorisationReference|card|cvv|token/i);
    },
    15000
  );

  it(
    "uses a temporary fixture copy when no writable fixture data directory is configured",
    async () => {
      const sourceCampaignsPath = join(fixtureSourceDirectory, "campaigns.json");
      const beforeCampaigns = await readFile(sourceCampaignsPath, "utf8");
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("External fetch should not be called in fixture demo lifecycle.");
      });
      process.env = {
        ...originalEnv,
        USE_FIXTURES: "true",
        REVERB_CURRENT_TIME: "2026-08-01T00:00:00.000Z",
        DEMO_SPOT_ID: "spot_quiet_cup_cafe",
        OPENAI_API_KEY: "",
        SENSO_API_KEY: "",
        LINQ_API_KEY: "",
        PRAVA_SECRET_KEY: "",
        N8N_STORAGE_WEBHOOK_URL: ""
      };
      delete process.env.REVERB_FIXTURE_DATA_DIR;

      const response = await POST(
        new Request("http://localhost/api/demo/lifecycle", {
          method: "POST",
          body: JSON.stringify({})
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        mode: "fixture",
        finalStatus: "ACTIVE",
        selectedPackageId: "package_local_dining_boost"
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect(readFile(sourceCampaignsPath, "utf8")).resolves.toBe(beforeCampaigns);
    },
    15000
  );
});
