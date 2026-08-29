import { CampaignJourney } from "../../../components/campaign-journey";
import { creative, demoCampaign, providers } from "../../../components/demo-data";

export default function CampaignDetailsPage() {
  return <CampaignJourney campaign={demoCampaign} providers={providers} creative={creative} />;
}
