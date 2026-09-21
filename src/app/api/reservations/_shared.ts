import { NextResponse } from "next/server";
import { z } from "zod";

import { ReservationError, ReservationService } from "../../../lib/core/reservations";
import { createStorageRepository, type StorageRepository } from "../../../lib/repositories";
import { getSharedFixtureDataDir } from "../../../lib/repositories/shared-fixture-store";

const maxReservationBodyBytes = 8 * 1024;

export async function createReservationService(): Promise<ReservationService> {
  return new ReservationService(
    await createReservationRepository(),
    () => new Date(process.env.REVERB_CURRENT_TIME ?? Date.now())
  );
}

export async function createReservationRepository(): Promise<StorageRepository> {
  return createStorageRepository({
    env: {
      USE_FIXTURES: process.env.USE_FIXTURES ?? "true"
    },
    fixtureDataDir: await getSharedFixtureDataDir()
  });
}

export async function parseJson(request: Request) {
  try {
    const rawBody = await request.text();

    if (new TextEncoder().encode(rawBody).byteLength > maxReservationBodyBytes) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            error: "Request body is too large.",
            code: "REQUEST_BODY_TOO_LARGE"
          },
          { status: 413 }
        )
      };
    }

    return {
      ok: true as const,
      value: JSON.parse(rawBody)
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
