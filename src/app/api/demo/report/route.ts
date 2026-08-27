import { NextResponse } from "next/server";

import {
  demoErrorResponse,
  demoReportRequestSchema,
  invalidRequestResponse,
  parseJsonRequest,
  runReportStage
} from "../_shared";

export async function POST(request: Request) {
  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoReportRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(await runReportStage(parsedRequest.data));
  } catch (error) {
    return demoErrorResponse(error);
  }
}
