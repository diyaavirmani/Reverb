import { NextResponse } from "next/server";
import { z } from "zod";

import { IntegrationError, createPravaAdapter } from "../../../../lib/adapters";
import { PravaCreateSessionRequestSchema } from "../../../../schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = PravaCreateSessionRequestSchema.safeParse(body.value);

  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }

  try {
    const result = await createPravaAdapter().createSession(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return integrationFailure(error);
  }
}

async function parseJson(request: Request) {
  try {
    return {
      ok: true as const,
      value: await request.json()
    };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    };
  }
}

function invalidRequest(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "Invalid request body.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    },
    { status: 400 }
  );
}

function integrationFailure(error: unknown) {
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
