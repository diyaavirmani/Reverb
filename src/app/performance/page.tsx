import { SidebarLayout } from "../../components/app-shell";
import { CampaignDateText } from "../../components/campaign-date-text";
import { baseReservations, creative, demoCampaign } from "../../components/demo-data";
import { ResultsExperience } from "../../components/demo-launcher";
import { Icon } from "../../components/icons";

export default function PerformancePage() {

  return (
    <SidebarLayout active="reservations">
      <header className="results-header">
        <div><h1>Results & Reservations</h1><p>Measured campaign outcomes for {demoCampaign.spot}.</p></div>
        <div className="results-header-actions"><button type="button"><Icon name="calendar" /> <CampaignDateText date={demoCampaign.date} /> <span>⌄</span></button></div>
      </header>
      <ResultsExperience campaign={demoCampaign} reservations={baseReservations} initialCaption={creative.caption} />
    </SidebarLayout>
  );
}
