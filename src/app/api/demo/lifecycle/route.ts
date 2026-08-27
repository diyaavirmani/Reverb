import { NextResponse } from "next/server";

import {
  demoErrorResponse,
  demoLifecycleRequestSchema,
  invalidRequestResponse,
  parseJsonRequest,
  runFullLifecycle
} from "../_shared";

export async function POST(request: Request) {
  const json = await parseJsonRequest(request);

  if (!json.ok) {
    return json.response;
  }

  const parsedRequest = demoLifecycleRequestSchema.safeParse(json.value);

  if (!parsedRequest.success) {
    return invalidRequestResponse(parsedRequest.error);
  }

  try {
    return NextResponse.json(await runFullLifecycle(parsedRequest.data));
  } catch (error) {
    return demoErrorResponse(error);
  }
}
