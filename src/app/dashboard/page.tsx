import DashboardPageContent from "../../components/dashboard-page";
import { currentUser } from "@clerk/nextjs/server";
import { demoCampaignForProfile } from "../../components/demo-data";
import { requireApprovedReverbPermission } from "../../lib/auth/authorization";

export default async function DashboardPage() {
  const { profile } = await requireApprovedReverbPermission("dashboard:read");
  const user = await currentUser();
  const firstName = user?.firstName ?? user?.fullName?.split(" ")[0] ?? "there";
  return <DashboardPageContent profile={profile} firstName={firstName} initialCampaign={demoCampaignForProfile(profile, user?.fullName)} />;
}
