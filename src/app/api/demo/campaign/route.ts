import { NextResponse } from "next/server";

import {
  demoCampaignRequestSchema,
  demoErrorResponse,
  invalidRequestResponse,
  parseJsonRequest,
  runCampaignStage
} from "../_shared";

export async function POST(request: Request) {
  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoCampaignRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(await runCampaignStage(parsedRequest.data));
  } catch (error) {
    return demoErrorResponse(error);
  }
}
