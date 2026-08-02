import { NextResponse } from "next/server";

import { createReservationService, parseJson, reservationFailure } from "./_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  try {
    const result = await createReservationService().createReservation(body.value);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return reservationFailure(error);
  }
}