import { demoCampaign, formatRupees, selectedProvider, workflow } from "../../components/demo-data";
import { Badge, ButtonLink, Card, MetricCard, PageContainer, StatusBadge, TimelineStep } from "../../components/ui";

export default function DashboardPage() {
  return (
    <PageContainer>
      <div className="section-header">
        <div>
          <Badge>Fixture showcase</Badge>
          <h1 style={{ marginTop: 14 }}>{demoCampaign.title}</h1>
          <p className="lead" style={{ marginTop: 18 }}>
            Campaign command center for the simplified Reverb flow. The UI talks to Next.js APIs directly;
            n8n remains optional for automation demos.
          </p>
        </div>
        <StatusBadge status="Campaign Active" />
      </div>

      <div className="grid grid-4">
        <MetricCard label="Campaigns" value="1" detail="Fixture demo campaign" />
        <MetricCard label="Spend" value={formatRupees(demoCampaign.selectedSpendPaise)} detail="Demo transaction amount" />
        <MetricCard label="Demo reservations" value="1" detail="Labelled test booking" />
        <MetricCard label="Reported recovery" value="0%" detail="Demo bookings excluded from real totals" />
      </div>

      <section className="section dashboard-grid">
        <Card>
          <div className="stack">
            <div className="row">
              <div>
                <p className="eyebrow">Active campaign</p>
                <h2>{demoCampaign.spot}</h2>
              </div>
              <Badge tone="success">{demoCampaign.slot}</Badge>
            </div>
            <div className="grid grid-3">
              <MetricCard label="Target" value="6" detail="Reservations" />
              <MetricCard label="Selected provider" value="90" detail={`${selectedProvider.provider} score`} />
              <MetricCard label="Revenue recovered" value={formatRupees(demoCampaign.estimatedRevenueRecoveredPaise)} detail="Estimated from average booking value" />
            </div>
            <ButtonLink href="/campaigns/demo">View Recommendation</ButtonLink>
          </div>
        </Card>
        <Card>
          <div className="stack">
            <p className="eyebrow">Workflow</p>
            <div className="timeline">
              {workflow.map((step, index) => (
                <TimelineStep key={step} index={index + 1} title={step} />
              ))}
            </div>
          </div>
        </Card>
      </section>
    </PageContainer>
  );
}
