import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as sendLinqMessage } from "../src/app/api/linq/send/route";
import { POST as receiveLinqWebhook } from "../src/app/api/webhooks/linq/route";
import { LiveLinqAdapter } from "../src/lib/adapters/live";
import { linqProcessedEvents } from "../src/lib/security/processed-events";
import {
  createWebhookSignature,
  verifyWebhookSignature
} from "../src/lib/security/webhook-signature";
import { LinqSendMessageResultSchema } from "../src/schemas";
import webhookFixture from "../fixtures/linq/webhook-event.json";

const managedEnvironmentKeys = [
  "USE_FIXTURES",
  "NODE_ENV",
  "LINQ_WEBHOOK_SECRET",
  "N8N_INTAKE_WEBHOOK_URL",
  "N8N_INTERNAL_SECRET"
] as const;

const originalEnvironment = Object.fromEntries(
  managedEnvironmentKeys.map((key) => [key, process.env[key]])
);

describe("POST /api/webhooks/linq", () => {
  beforeEach(() => {
    process.env.USE_FIXTURES = "true";
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.LINQ_WEBHOOK_SECRET;
    delete process.env.N8N_INTAKE_WEBHOOK_URL;
    delete process.env.N8N_INTERNAL_SECRET;
    linqProcessedEvents.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    restoreEnvironment();
    linqProcessedEvents.clear();
  });

  it("accepts a valid signed fixture and preserves its external event ID", async () => {
    const event = fixtureEvent("linq_event_valid_signature");
    const secret = "test-linq-webhook-secret";
    process.env.LINQ_WEBHOOK_SECRET = secret;

    const response = await receiveLinqWebhook(
      webhookRequest(event, { secret })
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toMatchObject({
      accepted: true,
      duplicate: false,
      forwarded: false,
      eventId: event.id
    });
    expect(json).not.toHaveProperty("messageText");
    expect(json).not.toHaveProperty("raw");
  });

  it("rejects an invalid signature", async () => {
    process.env.LINQ_WEBHOOK_SECRET = "test-linq-webhook-secret";
    const response = await receiveLinqWebhook(
      webhookRequest(fixtureEvent("linq_event_invalid_signature"), {
        signature: "sha256=".padEnd(71, "0")
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Webhook signature is invalid."
    });
  });

  it("rejects a stale timestamp", async () => {
    const staleTimestamp = Math.floor((Date.now() - 10 * 60_000) / 1000).toString();
    const response = await receiveLinqWebhook(
      webhookRequest(fixtureEvent("linq_event_stale"), { timestamp: staleTimestamp })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Webhook timestamp is stale or invalid."
    });
  });

  it.each([
    ["fixture", "true", "test"],
    ["development", "false", "development"]
  ])("allows unsigned requests in %s mode", async (_label, useFixtures, nodeEnv) => {
    process.env.USE_FIXTURES = useFixtures;
    vi.stubEnv("NODE_ENV", nodeEnv);

    const response = await receiveLinqWebhook(
      webhookRequest(fixtureEvent(`linq_event_unsigned_${nodeEnv}`))
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
  });

  it("rejects an unsigned request in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await receiveLinqWebhook(
      webhookRequest(fixtureEvent("linq_event_unsigned_production"))
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Webhook signature is required."
    });
  });

  it("rejects malformed JSON", async () => {
    const response = await receiveLinqWebhook(
      rawWebhookRequest("{not-json", freshTimestamp())
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body." });
  });

  it("rejects an event with no external event ID", async () => {
    const eventWithoutId: Record<string, unknown> = { ...fixtureEvent("unused") };
    delete eventWithoutId.id;
    const response = await receiveLinqWebhook(webhookRequest(eventWithoutId));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "MISSING_EVENT_ID"
    });
  });

  it("deduplicates repeated external event IDs", async () => {
    const event = fixtureEvent("linq_event_duplicate");
    const first = await receiveLinqWebhook(webhookRequest(event));
    const duplicate = await receiveLinqWebhook(webhookRequest(event));

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      forwarded: false,
      eventId: event.id
    });
  });

  it("returns 202 local-mode acceptance when the n8n URL is missing", async () => {
    const response = await receiveLinqWebhook(
      webhookRequest(fixtureEvent("linq_event_local_acceptance"))
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      forwarded: false,
      message: "Event accepted in local mode but not forwarded."
    });
  });

  it("forwards a normalized event to n8n with a valid internal signature", async () => {
    const event = fixtureEvent("linq_event_forwarded");
    const linqSecret = "test-linq-webhook-secret";
    const internalSecret = "test-n8n-internal-secret";
    process.env.LINQ_WEBHOOK_SECRET = linqSecret;
    process.env.N8N_INTAKE_WEBHOOK_URL = "https://n8n.example.test/webhook/linq";
    process.env.N8N_INTERNAL_SECRET = internalSecret;
    const fetchMock = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >();
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await receiveLinqWebhook(
      webhookRequest(event, { secret: linqSecret })
    );

    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    const body = String(init?.body);
    const forwarded = JSON.parse(body);

    expect(url).toBe(process.env.N8N_INTAKE_WEBHOOK_URL);
    expect(init?.method).toBe("POST");
    expect(forwarded).toMatchObject({
      eventId: event.id,
      eventType: event.type,
      conversationId: event.conversation.id,
      from: event.message.from,
      to: event.message.to,
      messageText: event.message.text,
      raw: event
    });
    expect(
      verifyWebhookSignature({
        secret: internalSecret,
        timestamp: headers.get("x-reverb-timestamp") ?? "",
        rawBody: body,
        signature: headers.get("x-reverb-signature") ?? ""
      })
    ).toBe(true);
  });
});

describe("POST /api/linq/send", () => {
  beforeEach(() => {
    process.env.USE_FIXTURES = "true";
  });

  afterEach(() => {
    restoreEnvironment();
  });

  it("rejects invalid outbound message input", async () => {
    const response = await sendLinqMessage(
      jsonRequest("/api/linq/send", {
        recipient: "+919900000001",
        text: "Campaign ready"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request body."
    });
  });

  it("returns a validated fixture message result", async () => {
    const response = await sendLinqMessage(
      jsonRequest("/api/linq/send", outboundMessage("idem_linq_fixture"))
    );
    const result = LinqSendMessageResultSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      accepted: true,
      idempotencyKey: "idem_linq_fixture",
      isFixture: true
    });
  });

  it("returns the same fixture result for a repeated idempotency key", async () => {
    const request = outboundMessage("idem_linq_stable");
    const first = LinqSendMessageResultSchema.parse(
      await (await sendLinqMessage(jsonRequest("/api/linq/send", request))).json()
    );
    const repeated = LinqSendMessageResultSchema.parse(
      await (await sendLinqMessage(jsonRequest("/api/linq/send", request))).json()
    );

    expect(repeated).toEqual(first);
  });

  it("does not force a transport channel in the live adapter payload", async () => {
    const httpClient = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >();
    httpClient.mockResolvedValue(
      Response.json({ messageId: "linq_live_message_001", accepted: true }, { status: 200 })
    );
    const adapter = new LiveLinqAdapter(
      {
        baseUrl: "https://linq.example.test",
        apiKey: "test-linq-api-key",
        sendMessageUrl: "https://linq.example.test/messages"
      },
      httpClient
    );

    const result = await adapter.sendMessage(outboundMessage("idem_linq_live"));
    const sentBody = JSON.parse(String(httpClient.mock.calls[0][1].body));

    expect(result).toMatchObject({
      messageId: "linq_live_message_001",
      idempotencyKey: "idem_linq_live",
      isFixture: false
    });
    expect(sentBody).not.toHaveProperty("channel");
    expect(sentBody).not.toHaveProperty("transport");
    expect(sentBody).not.toHaveProperty("messageType");
  });
});

function fixtureEvent(id: string) {
  return {
    ...webhookFixture,
    id
  };
}

function outboundMessage(idempotencyKey: string) {
  return {
    recipient: "+919900000001",
    text: "Your Reverb Fill campaign is ready.",
    link: "https://reverb.example.test/campaign/demo",
    idempotencyKey
  };
}

function webhookRequest(
  event: unknown,
  options: {
    timestamp?: string;
    secret?: string;
    signature?: string;
  } = {}
): Request {
  const rawBody = JSON.stringify(event);
  const timestamp = options.timestamp ?? freshTimestamp();
  const signature =
    options.signature ??
    (options.secret
      ? createWebhookSignature(options.secret, timestamp, rawBody)
      : undefined);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-linq-timestamp": timestamp
  };

  if (signature !== undefined) {
    headers["x-linq-signature"] = signature;
  }

  return new Request("http://localhost/api/webhooks/linq", {
    method: "POST",
    headers,
    body: rawBody
  });
}

function rawWebhookRequest(rawBody: string, timestamp: string): Request {
  return new Request("http://localhost/api/webhooks/linq", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-linq-timestamp": timestamp
    },
    body: rawBody
  });
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

function freshTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function restoreEnvironment(): void {
  for (const key of managedEnvironmentKeys) {
    const value = originalEnvironment[key];

    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      Reflect.set(process.env, key, value);
    }
  }
}
