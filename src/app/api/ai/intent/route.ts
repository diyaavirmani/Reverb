import { NextResponse } from "next/server";
import { z } from "zod";

import { IntegrationError, createOpenAIAdapter } from "../../../../lib/adapters";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    ownerMessage: z.string().min(1),
    spotId: z.string().min(1).optional(),
    currentTime: z.string().min(1).optional()
  })
  .strict();

export async function POST(request: Request) {
  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = requestSchema.safeParse(body.value);

  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }

  try {
    const result = await createOpenAIAdapter().extractCampaignIntent(parsed.data);
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
