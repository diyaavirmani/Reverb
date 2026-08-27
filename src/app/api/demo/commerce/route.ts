import { NextResponse } from "next/server";

import {
  demoCommerceRequestSchema,
  demoErrorResponse,
  invalidRequestResponse,
  parseJsonRequest,
  runCommerceStage
} from "../_shared";

export async function POST(request: Request) {
  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoCommerceRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(await runCommerceStage(parsedRequest.data));
  } catch (error) {
    return demoErrorResponse(error);
  }
}
