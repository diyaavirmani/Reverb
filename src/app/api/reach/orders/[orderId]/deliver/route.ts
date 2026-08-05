import { NextResponse } from "next/server";

import { createReachExchangeService, parseJson, reachFailure } from "../../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  try {
    const { orderId } = await context.params;
    const result = await createReachExchangeService().deliver(orderId, body.value);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
