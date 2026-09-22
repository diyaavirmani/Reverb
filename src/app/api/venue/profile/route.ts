import { NextResponse } from "next/server";

import { requireReverbApiPermission } from "../../../../lib/auth/api-authorization";
import { ClerkMetadataSizeError, getReverbProfile, saveReverbProfile } from "../../../../lib/venue/clerk-profile";
import { reverbVenueProfileSchema } from "../../../../lib/venue/profile";

export async function GET() {
  const access = await requireReverbApiPermission("dashboard:read");
  if (access instanceof NextResponse) return access;

  const userId = access?.userId ?? "test_user";
  return NextResponse.json({ profile: await getReverbProfile(userId) });
}

export async function PUT(request: Request) {
  const access = await requireReverbApiPermission("venue:manage");
  if (access instanceof NextResponse) return access;

  const userId = access?.userId ?? "test_user";
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
  try {
    return NextResponse.json({ profile: await saveReverbProfile(userId, parsed.data) });
  } catch (error) {
    if (error instanceof ClerkMetadataSizeError) {
      return NextResponse.json({ error: error.message, code: "PROFILE_METADATA_TOO_LARGE" }, { status: 413 });
    }
    throw error;
  }
}
