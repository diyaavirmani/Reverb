import { CampaignForm } from "../../../components/campaign-form";
import { Badge, Card, PageContainer } from "../../../components/ui";

export default function CreateCampaignPage() {
  return (
    <PageContainer>
      <div className="section-header">
        <div>
          <Badge>Create Campaign</Badge>
          <h1 style={{ marginTop: 14 }}>Create a fixture campaign</h1>
          <p className="lead" style={{ marginTop: 18 }}>
            Enter the quiet slot constraints. Reverb uses local fixture data to recommend a campaign
            without requiring live provider keys.
          </p>
        </div>
      </div>
      <div className="dashboard-grid">
        <CampaignForm />
        <Card>
          <div className="stack">
            <p className="eyebrow">What happens next</p>
            <h2>Find Best Campaign</h2>
            <p className="muted">
              The backend evaluates provider packages with deterministic checks for budget, discount,
              merchant, deadline, price, CPA, and availability.
            </p>
            <p className="muted">
              Fixture mode simulates the commerce path and labels the transaction as demo-only.
            </p>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
