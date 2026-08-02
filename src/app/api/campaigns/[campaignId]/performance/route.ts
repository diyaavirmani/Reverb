import { NextResponse } from "next/server";

import { createReservationService, reservationFailure } from "../../../reservations/_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ campaignId: string }> | { campaignId: string };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { campaignId } = await context.params;
    const result = await createReservationService().getCampaignPerformance(campaignId);
    return NextResponse.json(result);
  } catch (error) {
    return reservationFailure(error);
  }
}