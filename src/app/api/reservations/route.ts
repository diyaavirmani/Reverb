import { NextResponse } from "next/server";

import { createReservationService, parseJson, reservationFailure } from "./_shared";
import { ReservationSubmissionSchema } from "../../../schemas";

export const runtime = "nodejs";

const reservationRateLimit = {
  maxRequests: 10,
  windowMs: 60_000
};
const reservationRateBuckets = new Map<string, { count: number; windowStartedAt: number }>();

export async function POST(request: Request) {
  const rateLimit = checkReservationRateLimit(request);
  if (rateLimit instanceof NextResponse) return rateLimit;

  const body = await parseJson(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = ReservationSubmissionSchema.safeParse(body.value);

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
    const result = await (await createReservationService()).createReservation(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return reservationFailure(error);
  }
}

function checkReservationRateLimit(request: Request): NextResponse | null {
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const now = Date.now();
  const bucket = reservationRateBuckets.get(ipAddress);

  if (!bucket || now - bucket.windowStartedAt >= reservationRateLimit.windowMs) {
    reservationRateBuckets.set(ipAddress, { count: 1, windowStartedAt: now });
    return null;
  }

  bucket.count += 1;

  if (bucket.count <= reservationRateLimit.maxRequests) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((reservationRateLimit.windowMs - (now - bucket.windowStartedAt)) / 1000)
  );

  return NextResponse.json(
    {
      error: "Too many reservation submissions.",
      code: "RATE_LIMITED"
    },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfterSeconds)
      }
    }
  );
}
