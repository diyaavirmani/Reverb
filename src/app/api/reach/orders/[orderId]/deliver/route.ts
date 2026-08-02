import { NextResponse } from "next/server";

import { createReachExchangeService, parseJson, reachFailure } from "../../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    orderId: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  try {
    const result = await createReachExchangeService().deliver(context.params.orderId, body.value);
    return NextResponse.json(result);
  } catch (error) {
    return reachFailure(error);
  }
}
