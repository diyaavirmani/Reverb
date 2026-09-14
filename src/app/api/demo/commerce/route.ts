import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../lib/auth/api-authorization";
import {
  demoCommerceRequestSchema,
  demoErrorResponse,
  invalidRequestResponse,
  parseJsonRequest,
  runCommerceStage
} from "../_shared";

export async function POST(request: Request) {
  const access = await requireReverbApiPermission("campaign:approve");
  if (access instanceof NextResponse) return access;

  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoCommerceRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(
      await runCommerceStage({ ...parsedRequest.data, requestedByOwnerId: access?.userId })
    );
  } catch (error) {
    return demoErrorResponse(error);
  }
}
