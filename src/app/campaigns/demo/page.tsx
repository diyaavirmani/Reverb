import { CampaignJourney } from "../../../components/campaign-journey";
import { createDeterministicCreative, demoCampaignForProfile, providers } from "../../../components/demo-data";
import { requireApprovedReverbPermission } from "../../../lib/auth/authorization";

export default async function CampaignDetailsPage() {
  const { profile } = await requireApprovedReverbPermission("campaign:review");
  const campaign = demoCampaignForProfile(profile);
  return <CampaignJourney campaign={campaign} providers={providers} creative={createDeterministicCreative(campaign, profile)} venue={profile.venue.name} />;
}
