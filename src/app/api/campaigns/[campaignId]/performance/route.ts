import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../../lib/auth/api-authorization";
import { createReservationService, reservationFailure } from "../../../reservations/_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireReverbApiPermission("analytics:read");
  if (access instanceof NextResponse) return access;

  try {
    const { campaignId } = await context.params;
    const result = await (await createReservationService()).getCampaignPerformance(campaignId);
    return NextResponse.json(result);
  } catch (error) {
    return reservationFailure(error);
  }
}
