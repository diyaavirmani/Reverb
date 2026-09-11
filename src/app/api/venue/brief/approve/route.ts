import { NextResponse } from "next/server";

import { requireReverbPermission } from "../../../../../lib/auth/authorization";
import { saveReverbProfile } from "../../../../../lib/venue/clerk-profile";
import { reverbVenueProfileSchema } from "../../../../../lib/venue/profile";

export async function POST(request: Request) {
  const { userId } = await requireReverbPermission("venue:manage");
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = reverbVenueProfileSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Review the venue brief before approval.", issues: parsed.error.issues }, { status: 400 });
  }
  const profile = await saveReverbProfile(userId, {
    ...parsed.data,
    briefApproved: true,
    onboardingComplete: true
  });
  return NextResponse.json({ profile });
}
