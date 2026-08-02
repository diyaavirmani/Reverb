import { NextResponse } from "next/server";

import { createReachExchangeService, reachFailure } from "../../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    orderId: string;
  };
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const result = await createReachExchangeService().activate(context.params.orderId);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
