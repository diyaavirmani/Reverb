import { describe, expect, it, vi } from "vitest";

import { createIntegrationAdapters, loadRuntimeConfig } from "../src/lib/adapters";
import { IntegrationError } from "../src/lib/adapters/errors";
import { LivePravaAdapter, type PravaHttpClient } from "../src/lib/adapters/live";
import {
  PravaCreateSessionResultSchema,
  PravaPaymentResultSchema,
  PravaReportCheckoutOutcomeResultSchema,
  type PravaCreateSessionRequest,
  type PravaReportCheckoutOutcomeRequest
} from "../src/schemas";

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

const liveConfig = {
  baseUrl: "https://prava.example.test",
  apiKey: "test-prava-api-key",
  createSessionEndpointTemplate: "/sessions",
  resultEndpointTemplate: "/sessions/{sessionId}",
  reportCheckoutEndpointTemplate: "/sessions/{sessionId}/checkout-outcome"
};

const fixtureStates = [
  ["fixture_prava_awaiting_user", "AWAITING_USER"],
  ["fixture_prava_authorized", "AUTHORIZED"],
  ["fixture_prava_declined", "DECLINED"],
  ["fixture_prava_expired", "EXPIRED"],
  ["fixture_prava_failed", "FAILED"],
  ["fixture_prava_completed", "COMPLETED"]
] as const;

describe("Prava adapter", () => {
  it("creates an awaiting-user fixture session without claiming it is real", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).prava;

    const result = await adapter.createSession(paymentRequest);

    expect(PravaCreateSessionResultSchema.parse(result)).toMatchObject({
      sessionId: "fixture_prava_awaiting_user",
      campaignId: paymentRequest.campaignId,
      status: "AWAITING_USER",
      amountPaise: paymentRequest.amountPaise,
      isFixture: true
    });
  });

  it.each(fixtureStates)("returns %s fixture state as %s", async (sessionId, status) => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).prava;

    const result = await adapter.getPaymentResult({
      campaignId: paymentRequest.campaignId,
      sessionId,
      idempotencyKey: paymentRequest.idempotencyKey
    });

    expect(PravaPaymentResultSchema.parse(result)).toMatchObject({
      sessionId,
      campaignId: paymentRequest.campaignId,
      status,
      isFixture: true
    });
  });

  it("does not convert an unknown fixture result into success", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).prava;

    const result = await adapter.getPaymentResult({
      campaignId: paymentRequest.campaignId,
      sessionId: "fixture_prava_unknown",
      idempotencyKey: paymentRequest.idempotencyKey
    });

    expect(result).toMatchObject({
      status: "FAILED",
      failureReason: "fixture_result_not_found",
      isFixture: true
    });
  });

  it("reports completed and failed checkout outcomes as fixture observations", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).prava;

    await expect(adapter.reportCheckoutOutcome(reportRequest)).resolves.toMatchObject({
      status: "COMPLETED",
      merchantOrderId: reportRequest.merchantOrderId,
      isFixture: true
    });

    await expect(
      adapter.reportCheckoutOutcome({
        ...reportRequest,
        sessionId: "fixture_prava_failed",
        checkoutOutcome: "CHECKOUT_FAILED",
        merchantOrderId: null,
        failureReason: "provider_checkout_failed"
      })
    ).resolves.toMatchObject({
      status: "FAILED",
      merchantOrderId: null,
      isFixture: true
    });
  });

  it("uses server-side credentials and configured live endpoint templates", async () => {
    let requestBody: string | undefined;
    const fetchMock = vi.fn(async (_input: string, init: RequestInit) => {
      requestBody = String(init.body);
      return jsonResponse({
        sessionId: "live_prava_session_123",
        campaignId: paymentRequest.campaignId,
        status: "AWAITING_USER",
        currency: "INR",
        amountPaise: paymentRequest.amountPaise,
        checkoutUrl: "https://prava.example.test/checkout/live_prava_session_123",
        authorizationId: null,
        expiresAt: "2026-08-01T00:15:00.000Z",
        paymentCredential: "server-returned-credential-that-must-not-persist",
        cardToken: "server-returned-token-that-must-not-persist"
      });
    }) satisfies PravaHttpClient;
    const adapter = new LivePravaAdapter(liveConfig, fetchMock);

    const result = await adapter.createSession(paymentRequest);

    expect(result).toMatchObject({
      sessionId: "live_prava_session_123",
      status: "AWAITING_USER",
      isFixture: false
    });
    expect(JSON.stringify(result)).not.toContain("server-returned");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://prava.example.test/sessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-prava-api-key",
          "content-type": "application/json",
          "idempotency-key": paymentRequest.idempotencyKey
        })
      })
    );
    expect(JSON.parse(requestBody ?? "{}")).not.toHaveProperty("apiKey");
  });

  it("uses result endpoint templates and rejects unknown live payment states", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        sessionId: "live_prava_session_123",
        campaignId: paymentRequest.campaignId,
        status: "UNKNOWN",
        currency: "INR",
        amountPaise: paymentRequest.amountPaise,
        authorizationId: null,
        completedAt: null,
        expiresAt: null,
        declinedReason: null,
        failureReason: null
      })
    ) satisfies PravaHttpClient;
    const adapter = new LivePravaAdapter(liveConfig, fetchMock);

    await expect(
      adapter.getPaymentResult({
        campaignId: paymentRequest.campaignId,
        sessionId: "live_prava_session_123",
        idempotencyKey: paymentRequest.idempotencyKey
      })
    ).rejects.toMatchObject({
      integration: "prava",
      operation: "getPaymentResult",
      safeMessage: "Prava response failed schema validation."
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://prava.example.test/sessions/live_prava_session_123",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("redacts Prava payment credentials from integration errors", async () => {
    const error = new IntegrationError({
      integration: "prava",
      operation: "createSession",
      safeMessage: "Prava request failed.",
      cause: {
        paymentCredential: "credential-value",
        cardToken: "token-value",
        cvv: "123",
        visible: "safe"
      }
    });

    expect(error.cause).toEqual({
      paymentCredential: "[REDACTED]",
      cardToken: "[REDACTED]",
      cvv: "[REDACTED]",
      visible: "safe"
    });
  });
});

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );
}
