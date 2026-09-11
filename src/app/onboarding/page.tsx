import { OnboardingFlow } from "../../components/onboarding-flow";
import { requireReverbPermission } from "../../lib/auth/authorization";
import { getReverbProfile } from "../../lib/venue/clerk-profile";

export default async function OnboardingPage() {
  const { userId } = await requireReverbPermission("venue:manage");
  const profile = await getReverbProfile(userId);
  return <OnboardingFlow initialProfile={profile} />;
}
