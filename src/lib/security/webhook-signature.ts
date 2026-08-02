import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export function createWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  if (secret.trim() === "") {
    throw new Error("Webhook signing secret is required.");
  }

  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return `sha256=${digest}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}): boolean {
  const receivedHex = input.signature.startsWith("sha256=")
    ? input.signature.slice("sha256=".length)
    : input.signature;

  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) {
    return false;
  }

  const expectedHex = createWebhookSignature(
    input.secret,
    input.timestamp,
    input.rawBody
  ).slice("sha256=".length);
  const received = Buffer.from(receivedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function isWebhookTimestampFresh(
  timestamp: string,
  currentTimeMs = Date.now(),
  toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS
): boolean {
  const timestampMs = parseTimestamp(timestamp);

  if (timestampMs === null || !Number.isFinite(currentTimeMs) || toleranceSeconds < 0) {
    return false;
  }

  return Math.abs(currentTimeMs - timestampMs) <= toleranceSeconds * 1000;
}

function parseTimestamp(value: string): number | null {
  if (/^\d+$/.test(value)) {
    const numericValue = Number(value);

    if (!Number.isSafeInteger(numericValue)) {
      return null;
    }

    return value.length >= 13 ? numericValue : numericValue * 1000;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
