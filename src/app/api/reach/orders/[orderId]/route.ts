import { NextResponse } from "next/server";

import { createReachExchangeService, reachFailure } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    orderId: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await createReachExchangeService().getOrderDetails(context.params.orderId);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
