import { redirect } from "next/navigation";

import { requireReverbPermission } from "../../lib/auth/authorization";
import { getReverbProfile } from "../../lib/venue/clerk-profile";
import { isApprovedReverbProfile } from "../../lib/venue/profile";

export default async function AppEntryPage() {
  const { userId } = await requireReverbPermission("dashboard:read");
  const profile = await getReverbProfile(userId);
  redirect(isApprovedReverbProfile(profile) ? "/dashboard" : "/onboarding");
}
