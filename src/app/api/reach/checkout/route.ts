import { NextResponse } from "next/server";

import { createReachExchangeService, parseJson, reachFailure } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  try {
    const result = await createReachExchangeService().checkout(body.value);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
