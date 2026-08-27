import { demoCampaign, formatRupees } from "../../components/demo-data";
import { DemoReservationAction } from "../../components/demo-launcher";
import { Badge, ButtonLink, Card, MetricCard, PageContainer, StatusBadge, TimelineStep } from "../../components/ui";

export default function PerformancePage() {
  return (
    <PageContainer>
      <div className="section-header">
        <div>
          <Badge>Performance</Badge>
          <h1 style={{ marginTop: 14 }}>Campaign results</h1>
          <p className="lead" style={{ marginTop: 18 }}>
            Performance uses fixture reservations and local campaign records. Demo bookings remain labelled.
          </p>
        </div>
        <StatusBadge status="Campaign Active" />
      </div>

      <div className="grid grid-3">
        <MetricCard label="Campaign status" value="Active" detail="Promotion is active in fixture mode" />
        <MetricCard label="Demo reservation count" value="1" detail="One labelled test reservation" />
        <MetricCard label="Real seats recovered" value="0" detail="Demo bookings are excluded from real totals" />
        <MetricCard label="Actual CPA" value="Not counted" detail="No real reservation CPA from demo bookings" />
        <MetricCard label="Estimated revenue recovered" value={formatRupees(demoCampaign.estimatedRevenueRecoveredPaise)} detail="Based on average booking value" />
        <MetricCard label="Remaining real capacity" value="12 seats" detail="Capacity guard blocks overbooking" />
      </div>

      <section className="section dashboard-grid">
        <Card>
          <div className="stack">
            <h2>Add a demonstration reservation</h2>
            <p className="muted">
              This action calls the fixture lifecycle API and records a clearly labelled demo booking.
            </p>
            <DemoReservationAction />
          </div>
        </Card>
        <Card>
          <div className="stack">
            <p className="eyebrow">Audit preview</p>
            {["Campaign created", "Provider selected", "Campaign approved", "Demo transaction completed", "Reservation tracked"].map(
              (event, index) => (
                <TimelineStep key={event} index={index + 1} title={event} />
              )
            )}
            <ButtonLink href="/dashboard" variant="secondary">
              Back to Dashboard
            </ButtonLink>
          </div>
        </Card>
      </section>
    </PageContainer>
  );
}
