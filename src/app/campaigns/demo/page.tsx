import { CampaignJourney } from "../../../components/campaign-journey";
import { creative, demoCampaign, providers } from "../../../components/demo-data";
import { requireReverbPermission } from "../../../lib/auth/authorization";

export default async function CampaignDetailsPage() {
  await requireReverbPermission("campaign:review");
  return <CampaignJourney campaign={demoCampaign} providers={providers} creative={creative} />;
}
