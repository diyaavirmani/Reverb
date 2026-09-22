import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../../lib/auth/api-authorization";
import { createReservationRepository, reservationFailure } from "../../../reservations/_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireReverbApiPermission("reservations:read");
  if (access instanceof NextResponse) return access;

  try {
    const { campaignId } = await context.params;
    const repository = await createReservationRepository();
    const campaign = await repository.getCampaign(campaignId);

    if (campaign === null || (access !== null && campaign.requestedByOwnerId !== access.userId)) {
      return NextResponse.json(
        { error: "Campaign reservations were not found.", code: "CAMPAIGN_NOT_FOUND" },
        { status: 404 }
      );
    }

    const reservations = await repository.listReservations(campaignId);
    return NextResponse.json({ reservations });
  } catch (error) {
    return reservationFailure(error);
  }
}
