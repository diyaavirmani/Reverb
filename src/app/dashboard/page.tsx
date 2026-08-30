import DashboardPageContent from "../../components/dashboard-page";
import { requireReverbPermission } from "../../lib/auth/authorization";

export default async function DashboardPage() {
  await requireReverbPermission("dashboard:read");
  return <DashboardPageContent />;
}