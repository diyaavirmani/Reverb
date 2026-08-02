import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as getPaymentResult } from "../src/app/api/prava/result/route";
import { POST as reportCheckoutOutcome } from "../src/app/api/prava/report/route";
import { POST as createSession } from "../src/app/api/prava/session/route";
import {
  PravaCreateSessionResultSchema,
  PravaPaymentResultSchema,
  PravaReportCheckoutOutcomeResultSchema,
  type PravaCreateSessionRequest,
  type PravaReportCheckoutOutcomeRequest
} from "../src/schemas";

const originalUseFixtures = process.env.USE_FIXTURES;

const paymentRequest: PravaCreateSessionRequest = {
  campaignId: "campaign_demo_friday",
  merchantId: "merchant_reach_local_dining",
  packageId: "package_local_dining_boost",
  merchantName: "Reach Exchange Local Dining Boost",
  packageName: "Local Dining Boost",
  amountPaise: 480000,
  currency: "INR",
  callbackUrl: "https://reverb.example.test/api/prava/result",
  idempotencyKey: "idem_prava_demo_friday"
};

const reportRequest: PravaReportCheckoutOutcomeRequest = {
  ...paymentRequest,
  sessionId: "fixture_prava_completed",
  checkoutOutcome: "MERCHANT_ORDER_CREATED",
  merchantOrderId: "merchant_order_demo_123",
  occurredAt: "2026-08-01T00:10:00.000Z"
};

const fixtureStates = [
  ["fixture_prava_awaiting_user", "AWAITING_USER"],
  ["fixture_prava_authorized", "AUTHORIZED"],
  ["fixture_prava_declined", "DECLINED"],
  ["fixture_prava_expired", "EXPIRED"],
  ["fixture_prava_failed", "FAILED"],
  ["fixture_prava_completed", "COMPLETED"]
] as const;

describe("Prava API routes", () => {
  beforeEach(() => {
    process.env.USE_FIXTURES = "true";
  });

  afterEach(() => {
    if (originalUseFixtures === undefined) {
      delete process.env.USE_FIXTURES;
    } else {
      process.env.USE_FIXTURES = originalUseFixtures;
    }
  });

  it("POST /api/prava/session creates a typed fixture session", async () => {
    const response = await createSession(jsonRequest("/api/prava/session", paymentRequest));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(PravaCreateSessionResultSchema.parse(json)).toMatchObject({
      sessionId: "fixture_prava_awaiting_user",
      status: "AWAITING_USER",
      isFixture: true
    });
  });

  it.each(fixtureStates)("GET /api/prava/result returns %s as %s", async (sessionId, status) => {
    const response = await getPaymentResult(
      new Request(
        `http://localhost/api/prava/result?campaignId=${paymentRequest.campaignId}&sessionId=${sessionId}&idempotencyKey=${paymentRequest.idempotencyKey}`
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(PravaPaymentResultSchema.parse(json)).toMatchObject({
      sessionId,
      status,
      isFixture: true
    });
  });

  it("POST /api/prava/report reports fixture checkout completion", async () => {
    const response = await reportCheckoutOutcome(jsonRequest("/api/prava/report", reportRequest));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(PravaReportCheckoutOutcomeResultSchema.parse(json)).toMatchObject({
      status: "COMPLETED",
      merchantOrderId: reportRequest.merchantOrderId,
      isFixture: true
    });
  });

  it("rejects a completed checkout report before a merchant order exists", async () => {
    const response = await reportCheckoutOutcome(
      jsonRequest("/api/prava/report", {
        ...reportRequest,
        merchantOrderId: null
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "Invalid request body."
    });
  });

  it("rejects invalid money in session requests", async () => {
    const response = await createSession(
      jsonRequest("/api/prava/session", {
        ...paymentRequest,
        amountPaise: 480000.5
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "Invalid request body."
    });
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
