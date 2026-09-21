import { NextResponse } from "next/server";

import { createReachExchangeService, reachFailure } from "../_shared";

export const runtime = "nodejs";

export async function GET() {
  try {
    const packages = await (await createReachExchangeService()).listPackages();
    return NextResponse.json({ packages });
  } catch (error) {
    return reachFailure(error);
  }
}
