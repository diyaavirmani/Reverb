import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../../lib/auth/api-authorization";
import {
  createReservationRepository,
  createReservationService,
  reservationFailure
} from "../../../reservations/_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireReverbApiPermission("analytics:read");
  if (access instanceof NextResponse) return access;

  try {
    const { campaignId } = await context.params;
    if (access !== null) {
      const repository = await createReservationRepository();
      const campaign = await repository.getCampaign(campaignId);

      if (campaign === null || campaign.requestedByOwnerId !== access.userId) {
        return NextResponse.json(
          { error: "Campaign performance was not found.", code: "CAMPAIGN_NOT_FOUND" },
          { status: 404 }
        );
      }
    }

    const result = await (await createReservationService()).getCampaignPerformance(campaignId);
    return NextResponse.json(result);
  } catch (error) {
    return reservationFailure(error);
  }
}
