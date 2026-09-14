import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../../../lib/auth/api-authorization";
import { createReachExchangeService, parseJson, reachFailure } from "../../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const access = await requireReverbApiPermission("campaign:approve");
  if (access instanceof NextResponse) return access;

  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  try {
    const { orderId } = await context.params;
    const result = await createReachExchangeService().activate(orderId, body.value);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
