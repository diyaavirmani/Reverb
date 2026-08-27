import { createHmac } from "node:crypto";

import type { EvalEnvironment } from "./eval-sandbox";

export type EvalHttpResult = {
  status: number;
  ok: boolean;
  body: unknown;
  emptyBody: boolean;
  latencyMs: number;
};

export async function postSignedJson(
  url: string,
  payload: Record<string, unknown>,
  env: EvalEnvironment
): Promise<EvalHttpResult> {
  const started = Date.now();
  const body = JSON.stringify(payload);
  const headers = new Headers({
    "content-type": "application/json"
  });
  const internalSecret = env.N8N_INTERNAL_SECRET;

  if (internalSecret && internalSecret.trim() !== "") {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", internalSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    headers.set("x-reverb-timestamp", timestamp);
    headers.set("x-reverb-signature", `sha256=${signature}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body
  });
  const raw = await response.text();
  const trimmed = raw.trim();
  const parsedBody = trimmed === "" ? null : safeJsonParse(trimmed);

  return {
    status: response.status,
    ok: response.ok,
    body: parsedBody,
    emptyBody: trimmed === "",
    latencyMs: Date.now() - started
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
