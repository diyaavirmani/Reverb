import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../lib/auth/api-authorization";
import { createReachExchangeService, reachFailure } from "../_shared";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireReverbApiPermission("campaign:review");
  if (access instanceof NextResponse) return access;

  try {
    const packages = await (await createReachExchangeService()).listPackages();
    return NextResponse.json({ packages });
  } catch (error) {
    return reachFailure(error);
  }
}
