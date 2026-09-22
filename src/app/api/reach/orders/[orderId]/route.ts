import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../../lib/auth/api-authorization";
import { createReachExchangeService, reachFailure } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireReverbApiPermission("campaign:review");
  if (access instanceof NextResponse) return access;

  try {
    const { orderId } = await context.params;
    const result = await (await createReachExchangeService()).getOrderDetails(orderId);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
