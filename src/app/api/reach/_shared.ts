import { NextResponse } from "next/server";
import { z } from "zod";

import { ReachExchangeError, ReachExchangeService } from "../../../lib/core/reach-exchange";
import { createStorageRepository } from "../../../lib/repositories";

export function createReachExchangeService(): ReachExchangeService {
  return new ReachExchangeService(
    createStorageRepository({
      env: {
        USE_FIXTURES: process.env.USE_FIXTURES ?? "true"
      },
      fixtureDataDir: process.env.REACH_FIXTURE_DATA_DIR
    }),
    () => new Date(process.env.REACH_CURRENT_TIME ?? Date.now())
  );
}

export async function parseJson(request: Request) {
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

export function invalidRequest(error: z.ZodError, label = "Invalid request body.") {
  return NextResponse.json(
    {
      error: label,
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    },
    { status: 400 }
  );
}

export function reachFailure(error: unknown) {
  if (error instanceof z.ZodError) {
    return invalidRequest(error);
  }

  if (error instanceof ReachExchangeError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code
      },
      { status: error.statusCode }
    );
  }

  throw error;
}
