import { NextResponse } from "next/server";
import { z } from "zod";

import { requireReverbApiPermission } from "../../../../lib/auth/api-authorization";
import { IntegrationError, createPravaAdapter } from "../../../../lib/adapters";
import { PravaGetPaymentResultRequestSchema } from "../../../../schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireReverbApiPermission("campaign:approve");
  if (access instanceof NextResponse) return access;

  const parsed = PravaGetPaymentResultRequestSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );

  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }

  try {
    const result = await createPravaAdapter().getPaymentResult(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return integrationFailure(error);
  }
}

function invalidRequest(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "Invalid request query.",
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
