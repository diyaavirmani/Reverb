import { NextResponse } from "next/server";

import { requireReverbPermission } from "../../../../lib/auth/authorization";
import { getReverbProfile, saveReverbProfile } from "../../../../lib/venue/clerk-profile";
import { reverbVenueProfileSchema } from "../../../../lib/venue/profile";

export async function GET() {
  const { userId } = await requireReverbPermission("dashboard:read");
  return NextResponse.json({ profile: await getReverbProfile(userId) });
}

export async function PUT(request: Request) {
  const { userId } = await requireReverbPermission("venue:manage");
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = reverbVenueProfileSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Review the highlighted venue details.", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json({ profile: await saveReverbProfile(userId, parsed.data) });
}
