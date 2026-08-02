import { NextResponse } from "next/server";

import { IntegrationError } from "../../../../lib/adapters";
import {
  LinqNormalizationError,
  normalizeLinqEvent
} from "../../../../lib/adapters/linq/normalize";
import { loadLinqWebhookConfig } from "../../../../lib/adapters/runtime-config";
import { linqProcessedEvents } from "../../../../lib/security/processed-events";
import {
  createWebhookSignature,
  isWebhookTimestampFresh,
  verifyWebhookSignature
} from "../../../../lib/security/webhook-signature";

export const runtime = "nodejs";

const signatureHeader = "x-linq-signature";
const timestampHeader = "x-linq-timestamp";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const configResult = readConfig();

  if (!configResult.ok) {
    return configResult.response;
  }

  const config = configResult.config;
  const timestamp = request.headers.get(timestampHeader);

  if (timestamp === null) {
    return unauthorized("Webhook timestamp is required.");
  }

  if (!isWebhookTimestampFresh(timestamp)) {
    return unauthorized("Webhook timestamp is stale or invalid.");
  }

  const signature = request.headers.get(signatureHeader);
  const allowUnsigned =
    !config.isProduction &&
    (config.useFixtures || config.nodeEnv === "development" || config.nodeEnv === "test");

  if (signature === null) {
    if (!allowUnsigned) {
      return unauthorized("Webhook signature is required.");
    }
  } else if (config.webhookSecret === undefined) {
    if (!allowUnsigned) {
      return unauthorized("Webhook signature could not be verified.");
    }
  } else if (
    !verifyWebhookSignature({
      secret: config.webhookSecret,
      timestamp,
      rawBody,
      signature
    })
  ) {
    return unauthorized("Webhook signature is invalid.");
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let event;

  try {
    event = normalizeLinqEvent(parsedBody);
  } catch (error) {
    if (error instanceof LinqNormalizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Invalid Linq event." }, { status: 400 });
  }

  if (!linqProcessedEvents.claim(event.eventId)) {
    return NextResponse.json(
      {
        accepted: true,
        duplicate: true,
        forwarded: false,
        eventId: event.eventId
      },
      { status: 202 }
    );
  }

  if (config.n8nIntakeWebhookUrl === undefined) {
    return NextResponse.json(
      {
        accepted: true,
        duplicate: false,
        forwarded: false,
        eventId: event.eventId,
        message: "Event accepted in local mode but not forwarded."
      },
      { status: 202 }
    );
  }

  if (config.n8nInternalSecret === undefined) {
    linqProcessedEvents.release(event.eventId);
    return NextResponse.json(
      { error: "Internal webhook signing is not configured." },
      { status: 503 }
    );
  }

  const forwardBody = JSON.stringify(event);
  const forwardTimestamp = Math.floor(Date.now() / 1000).toString();
  const forwardSignature = createWebhookSignature(
    config.n8nInternalSecret,
    forwardTimestamp,
    forwardBody
  );

  try {
    const response = await fetch(config.n8nIntakeWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reverb-event-id": event.eventId,
        "x-reverb-signature": forwardSignature,
        "x-reverb-timestamp": forwardTimestamp
      },
      body: forwardBody
    });

    if (!response.ok) {
      linqProcessedEvents.release(event.eventId);
      return NextResponse.json(
        { error: "Event forwarding was not accepted." },
        { status: 502 }
      );
    }
  } catch {
    linqProcessedEvents.release(event.eventId);
    return NextResponse.json({ error: "Event forwarding failed." }, { status: 502 });
  }

  return NextResponse.json(
    {
      accepted: true,
      duplicate: false,
      forwarded: true,
      eventId: event.eventId
    },
    { status: 202 }
  );
}

function readConfig() {
  try {
    return {
      ok: true as const,
      config: loadLinqWebhookConfig()
    };
  } catch (error) {
    if (error instanceof IntegrationError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: error.safeMessage }, { status: 500 })
      };
    }

    throw error;
  }
}

function unauthorized(error: string) {
  return NextResponse.json({ error }, { status: 401 });
}
