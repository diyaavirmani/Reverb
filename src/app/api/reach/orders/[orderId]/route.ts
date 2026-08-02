import { NextResponse } from "next/server";

import { createReachExchangeService, reachFailure } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ orderId: string }> | { orderId: string };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const result = await createReachExchangeService().getOrderDetails(orderId);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
