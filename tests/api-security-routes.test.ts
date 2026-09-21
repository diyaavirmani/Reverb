import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const fixtureSourceDir = join(process.cwd(), "fixtures", "data");

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock
}));

vi.mock("server-only", () => ({}));

const pravaReportBody = {
  campaignId: "campaign_demo_friday",
  merchantId: "merchant_reach_local_dining",
  packageId: "package_local_dining_boost",
  merchantName: "Reach Exchange Local Dining Boost",
  packageName: "Local Dining Boost",
  amountPaise: 480000,
  currency: "INR",
  callbackUrl: "https://reverb.example.test/api/prava/result",
  idempotencyKey: "idem_prava_security",
  sessionId: "fixture_prava_completed",
  checkoutOutcome: "MERCHANT_ORDER_CREATED",
  merchantOrderId: "merchant_order_demo_123",
  occurredAt: "2026-08-01T00:10:00.000Z"
};

describe("API route security gates", () => {
  let temporaryRoot = "";

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("USE_FIXTURES", "true");
    authMock.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (temporaryRoot) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
    temporaryRoot = "";
  });

  it.each([
    ["GET /api/reach/packages", async () => (await import("../src/app/api/reach/packages/route")).GET()],
    [
      "GET /api/reach/quote",
      async () =>
        (await import("../src/app/api/reach/quote/route")).GET(
          new Request("http://localhost/api/reach/quote?packageId=package_local_dining_boost")
        )
    ],
    [
      "POST /api/prava/report",
      async () =>
        (await import("../src/app/api/prava/report/route")).POST(
          jsonRequest("/api/prava/report", pravaReportBody)
        )
    ],
    [
      "GET /api/prava/result",
      async () =>
        (await import("../src/app/api/prava/result/route")).GET(
          new Request(
            "http://localhost/api/prava/result?campaignId=campaign_demo_friday&sessionId=fixture_prava_completed&idempotencyKey=idem_prava_security"
          )
        )
    ],
    ["GET /api/venue/profile", async () => (await import("../src/app/api/venue/profile/route")).GET()],
    [
      "POST /api/venue/analyze",
      async () =>
        (await import("../src/app/api/venue/analyze/route")).POST(
          jsonRequest("/api/venue/analyze", {})
        )
    ],
    [
      "POST /api/venue/brief/approve",
      async () =>
        (await import("../src/app/api/venue/brief/approve/route")).POST(
          jsonRequest("/api/venue/brief/approve", {})
        )
    ]
  ])("%s returns JSON 401 without a session", async (_label, callRoute) => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: {} });

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toMatchObject({ error: "Authentication required." });
  });

  it.each([
    [
      "POST /api/prava/report",
      async () =>
        (await import("../src/app/api/prava/report/route")).POST(
          jsonRequest("/api/prava/report", pravaReportBody)
        )
    ],
    [
      "GET /api/prava/result",
      async () =>
        (await import("../src/app/api/prava/result/route")).GET(
          new Request(
            "http://localhost/api/prava/result?campaignId=campaign_demo_friday&sessionId=fixture_prava_completed&idempotencyKey=idem_prava_security"
          )
        )
    ]
  ])("%s rejects MANAGER role for campaign approval", async (_label, callRoute) => {
    authMock.mockResolvedValue({
      userId: "user_manager",
      sessionClaims: { metadata: { role: "MANAGER" } }
    });

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ error: "You do not have permission for this action." });
  });

  it("hides another owner's campaign performance", async () => {
    await useIsolatedFixtureStore((value) => {
      temporaryRoot = value;
    });
    const campaignPost = (await import("../src/app/api/demo/campaign/route")).POST;
    const performanceGet = (await import("../src/app/api/campaigns/[campaignId]/performance/route")).GET;

    authMock.mockResolvedValue({
      userId: "user_owner_a",
      sessionClaims: { metadata: { role: "OWNER" } }
    });
    const campaignResponse = await campaignPost(jsonRequest("/api/demo/campaign", {}));
    const campaign = await campaignResponse.json();
    expect(campaignResponse.status).toBe(200);

    authMock.mockResolvedValue({
      userId: "user_owner_b",
      sessionClaims: { metadata: { role: "OWNER" } }
    });
    const performanceResponse = await performanceGet(
      new Request(`http://localhost/api/campaigns/${campaign.campaignId}/performance`),
      { params: Promise.resolve({ campaignId: campaign.campaignId }) }
    );

    expect(performanceResponse.status).toBe(404);
    await expect(performanceResponse.json()).resolves.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
  });

  it("prevents another owner from modifying or reporting a demo campaign", async () => {
    await useIsolatedFixtureStore((value) => {
      temporaryRoot = value;
    });
    const campaignPost = (await import("../src/app/api/demo/campaign/route")).POST;
    const commercePost = (await import("../src/app/api/demo/commerce/route")).POST;
    const reservationPost = (await import("../src/app/api/demo/reservation/route")).POST;
    const reportPost = (await import("../src/app/api/demo/report/route")).POST;

    authMock.mockResolvedValue({
      userId: "user_owner_a",
      sessionClaims: { metadata: { role: "OWNER" } }
    });
    const campaignResponse = await campaignPost(jsonRequest("/api/demo/campaign", {}));
    const campaign = await campaignResponse.json();
    expect(campaignResponse.status).toBe(200);

    authMock.mockResolvedValue({
      userId: "user_owner_b",
      sessionClaims: { metadata: { role: "OWNER" } }
    });

    for (const response of [
      await commercePost(jsonRequest("/api/demo/commerce", { campaignId: campaign.campaignId })),
      await reservationPost(jsonRequest("/api/demo/reservation", { campaignId: campaign.campaignId })),
      await reportPost(jsonRequest("/api/demo/report", { campaignId: campaign.campaignId }))
    ]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    }
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function useIsolatedFixtureStore(setRoot: (root: string) => void): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-api-security-"));
  const dataDir = join(temporaryRoot, "data");
  await cp(fixtureSourceDir, dataDir, { recursive: true });
  setRoot(temporaryRoot);
  vi.stubEnv("REVERB_FIXTURE_DATA_DIR", dataDir);
  vi.stubEnv("REVERB_CURRENT_TIME", "2026-08-01T00:00:00.000Z");
}
