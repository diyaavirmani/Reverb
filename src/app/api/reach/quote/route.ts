import { NextResponse } from "next/server";

import { createReachExchangeService, reachFailure } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const packageId = new URL(request.url).searchParams.get("packageId");

  if (packageId === null || packageId.trim() === "") {
    return NextResponse.json({ error: "packageId is required." }, { status: 400 });
  }

  try {
    const quote = await createReachExchangeService().getQuote(packageId);
    return NextResponse.json(quote);
  } catch (error) {
    return reachFailure(error);
  }
}
