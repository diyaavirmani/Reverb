import { NextResponse } from "next/server";

import {
  demoErrorResponse,
  demoReservationRequestSchema,
  invalidRequestResponse,
  parseJsonRequest,
  runReservationStage
} from "../_shared";

export async function POST(request: Request) {
  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoReservationRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(await runReservationStage(parsedRequest.data));
  } catch (error) {
    return demoErrorResponse(error);
  }
}
