import { creative, demoCampaign, formatRupees, selectedProvider } from "../../components/demo-data";
import { DemoLauncher } from "../../components/demo-launcher";
import { Badge, Card, MetricCard, PageContainer } from "../../components/ui";

export default function ApprovalPage() {
  return (
    <PageContainer>
      <div className="section-header">
        <div>
          <Badge>Campaign Preview</Badge>
          <h1 style={{ marginTop: 14 }}>Approve the exact demo campaign</h1>
          <p className="lead" style={{ marginTop: 18 }}>
            Review the generated campaign and approve the fixture transaction. No real payment credential
            is collected or stored.
          </p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="stack">
          <Card>
            <div className="preview-panel">
              <Badge tone="success">{demoCampaign.spot}</Badge>
              <h2>{creative.headline}</h2>
              <p>{creative.offer}</p>
              <strong>{creative.cta}</strong>
            </div>
          </Card>
          <Card>
            <div className="stack">
              <p className="eyebrow">Generated campaign copy</p>
              <h2>{creative.headline}</h2>
              <p>{creative.caption}</p>
              <p>{creative.offer}</p>
              <strong>{creative.cta}</strong>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <div className="stack">
              <div className="row">
                <h2>Approval Summary</h2>
                <Badge tone="warning">Demo transaction</Badge>
              </div>
              <MetricCard label="Provider" value={selectedProvider.provider} detail={selectedProvider.package} />
              <MetricCard label="Spend" value={formatRupees(demoCampaign.selectedSpendPaise)} detail={`Budget ${formatRupees(demoCampaign.maximumBudgetPaise)}`} />
              <MetricCard label="CPA constraint" value="Rs 850" detail="Worst-case expected CPA Rs 800" />
              <p className="muted">
                The campaign cannot change merchant, package, amount, discount, or CPA after approval.
              </p>
            </div>
          </Card>
          <DemoLauncher />
        </div>
      </div>
    </PageContainer>
  );
}
