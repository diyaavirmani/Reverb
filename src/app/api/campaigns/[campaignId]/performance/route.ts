import { NextResponse } from "next/server";

import { createReservationService, reservationFailure } from "../../../reservations/_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    campaignId: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await createReservationService().getCampaignPerformance(
      context.params.campaignId
    );
    return NextResponse.json(result);
  } catch (error) {
    return reservationFailure(error);
  }
}