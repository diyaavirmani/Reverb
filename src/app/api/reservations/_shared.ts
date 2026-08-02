import { NextResponse } from "next/server";
import { z } from "zod";

import { ReservationError, ReservationService } from "../../../lib/core/reservations";
import { createStorageRepository } from "../../../lib/repositories";

export function createReservationService(): ReservationService {
  return new ReservationService(
    createStorageRepository({
      env: {
        USE_FIXTURES: process.env.USE_FIXTURES ?? "true"
      },
      fixtureDataDir: process.env.REVERB_FIXTURE_DATA_DIR
    }),
    () => new Date(process.env.REVERB_CURRENT_TIME ?? Date.now())
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

export function reservationFailure(error: unknown) {
  if (error instanceof z.ZodError) {
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

  if (error instanceof ReservationError) {
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