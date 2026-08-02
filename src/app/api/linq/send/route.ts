import { NextResponse } from "next/server";

import { IntegrationError, createLinqAdapter } from "../../../../lib/adapters";
import {
  LinqSendMessageRequestSchema,
  LinqSendMessageResultSchema
} from "../../../../schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = LinqSendMessageRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  try {
    const result = await createLinqAdapter().sendMessage(parsed.data);
    return NextResponse.json(LinqSendMessageResultSchema.parse(result));
  } catch (error) {
    if (error instanceof IntegrationError) {
      return NextResponse.json(
        {
          error: error.safeMessage,
          integration: error.integration,
          operation: error.operation
        },
        { status: error.statusCode ?? 500 }
      );
    }

    throw error;
  }
}
