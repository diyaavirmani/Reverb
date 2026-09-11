import { redirect } from "next/navigation";

import { VenueBrief } from "../../../components/venue-brief";
import { requireReverbPermission } from "../../../lib/auth/authorization";
import { getReverbProfile } from "../../../lib/venue/clerk-profile";

export default async function VenueBriefPage() {
  const { userId } = await requireReverbPermission("venue:manage");
  const profile = await getReverbProfile(userId);
  if (!profile) redirect("/onboarding");
  return <VenueBrief initialProfile={profile} />;
}
