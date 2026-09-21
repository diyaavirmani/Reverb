import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../lib/auth/api-authorization";
import {
  demoErrorResponse,
  demoReportRequestSchema,
  invalidRequestResponse,
  parseJsonRequest,
  runReportStage
} from "../_shared";

export async function POST(request: Request) {
  const access = await requireReverbApiPermission("analytics:read");
  if (access instanceof NextResponse) return access;

  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoReportRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(await runReportStage(parsedRequest.data, access?.userId));
  } catch (error) {
    return demoErrorResponse(error);
  }
}
