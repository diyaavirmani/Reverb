import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../lib/auth/api-authorization";
import {
  demoErrorResponse,
  demoLifecycleRequestSchema,
  invalidRequestResponse,
  parseJsonRequest,
  runFullLifecycle
} from "../_shared";

export async function POST(request: Request) {
  const access = await requireReverbApiPermission("campaign:create");
  if (access instanceof NextResponse) return access;

  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoLifecycleRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(
      await runFullLifecycle({ ...parsedRequest.data, requestedByOwnerId: access?.userId })
    );
  } catch (error) {
    return demoErrorResponse(error);
  }
}
