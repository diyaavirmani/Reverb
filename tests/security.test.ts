import { describe, expect, it } from "vitest";

import {
  InMemoryPaymentAttemptGuard,
  generateIdempotencyKey
} from "../src/lib/security/idempotency";
import { redactSensitiveHeaders, redactSensitiveObject } from "../src/lib/security/redaction";
import { constantTimeEqual, hashPayload } from "../src/lib/security/signatures";

describe("idempotency helpers", () => {
  it("generates stable repeated idempotency keys", () => {
    const firstKey = generateIdempotencyKey("checkout", "campaign_001", "provider_checkout");
    const secondKey = generateIdempotencyKey("checkout", "campaign_001", "provider_checkout");

    expect(firstKey).toBe(secondKey);
    expect(firstKey).toMatch(/^idem_[a-f0-9]{48}$/);
  });

  it("generates different keys for different operations", () => {
    expect(generateIdempotencyKey("checkout", "campaign_001", "authorize")).not.toBe(
      generateIdempotencyKey("checkout", "campaign_001", "capture")
    );
  });

  it("hashes payloads canonically", () => {
    expect(hashPayload({ b: 2, a: 1 })).toBe(hashPayload({ a: 1, b: 2 }));
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
});

describe("redaction", () => {
  it("redacts sensitive nested object fields without mutating the original", () => {
    const payload = {
      customer: {
        name: "Diya",
        cardNumber: "4111111111111111",
        nested: {
          cvv: "123",
          accessToken: "tok_live",
          password: "secret-password"
        }
      },
      credentialId: "prava_credential",
      safeField: "visible"
    };

    expect(redactSensitiveObject(payload)).toEqual({
      customer: {
        name: "Diya",
        cardNumber: "[REDACTED]",
        nested: {
          cvv: "[REDACTED]",
          accessToken: "[REDACTED]",
          password: "[REDACTED]"
        }
      },
      credentialId: "[REDACTED]",
      safeField: "visible"
    });
    expect(payload.customer.cardNumber).toBe("4111111111111111");
  });

  it("redacts sensitive headers", () => {
    expect(
      redactSensitiveHeaders({
        authorization: "Bearer secret",
        "x-api-token": "tok",
        "content-type": "application/json"
      })
    ).toEqual({
      authorization: "[REDACTED]",
      "x-api-token": "[REDACTED]",
      "content-type": "application/json"
    });
  });
});

describe("PaymentAttemptGuard", () => {
  it("blocks a second checkout attempt after one is attempted", async () => {
    const guard = new InMemoryPaymentAttemptGuard();

    await expect(guard.acquire("campaign_001", "session_001")).resolves.toMatchObject({
      status: "ACQUIRED"
    });
    await expect(guard.markAttempted("campaign_001", "session_001")).resolves.toMatchObject({
      status: "ATTEMPTED"
    });
    await expect(guard.acquire("campaign_001", "session_002")).rejects.toThrow(
      "Checkout attempt already recorded for campaign: campaign_001"
    );
  });

  it("tracks completed and failed states for the acquired session", async () => {
    const completedGuard = new InMemoryPaymentAttemptGuard();
    await completedGuard.acquire("campaign_completed", "session_001");
    await completedGuard.markAttempted("campaign_completed", "session_001");
    await expect(
      completedGuard.markCompleted("campaign_completed", "session_001")
    ).resolves.toMatchObject({
      status: "COMPLETED"
    });

    const failedGuard = new InMemoryPaymentAttemptGuard();
    await failedGuard.acquire("campaign_failed", "session_001");
    await failedGuard.markAttempted("campaign_failed", "session_001");
    await expect(
      failedGuard.markFailed("campaign_failed", "session_001", "declined")
    ).resolves.toMatchObject({
      status: "FAILED",
      failureReason: "declined"
    });
  });
});

describe("constantTimeEqual", () => {
  it("compares equal values safely", () => {
    expect(constantTimeEqual("same-value", "same-value")).toBe(true);
  });

  it("returns false without throwing for different values and lengths", () => {
    expect(() => constantTimeEqual("short", "much-longer-value")).not.toThrow();
    expect(constantTimeEqual("short", "much-longer-value")).toBe(false);
    expect(constantTimeEqual("same-length-a", "same-length-b")).toBe(false);
  });
});
