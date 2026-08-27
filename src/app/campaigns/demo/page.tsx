import { demoCampaign, formatRupees, providers, selectedProvider } from "../../../components/demo-data";
import { Badge, ButtonLink, Card, MetricCard, PageContainer, StatusBadge } from "../../../components/ui";

export default function CampaignDetailsPage() {
  return (
    <PageContainer>
      <div className="section-header">
        <div>
          <Badge>Recommended Promotion</Badge>
          <h1 style={{ marginTop: 14 }}>Best campaign package selected</h1>
          <p className="lead" style={{ marginTop: 18 }}>
            Reverb compares local distribution options and recommends the package that passes
            deterministic constraints with the strongest provider score.
          </p>
        </div>
        <ButtonLink href="/approval">Continue to Approval</ButtonLink>
      </div>

      <section className="dashboard-grid">
        <Card>
          <div className="stack">
            <div className="row">
              <div>
                <p className="eyebrow">Selected provider</p>
                <h2>{selectedProvider.provider}</h2>
              </div>
              <StatusBadge status={selectedProvider.verificationStatus} />
            </div>
            <div className="grid grid-3">
              <MetricCard label="Package" value={selectedProvider.package} detail="Local distribution" />
              <MetricCard label="Price" value={formatRupees(selectedProvider.pricePaise)} detail="Within Rs 5,000 budget" />
              <MetricCard label="Score" value={`${selectedProvider.score}/100`} detail="Deterministic weighted score" />
              <MetricCard label="Expected bookings" value={selectedProvider.expectedBookings} detail="Fixture evidence range" />
              <MetricCard label="Expected CPA" value={selectedProvider.expectedCpa} detail="Below Rs 850 cap" />
              <MetricCard label="Remaining budget" value={formatRupees(demoCampaign.remainingBudgetPaise)} detail="After demo spend" />
            </div>
            <p className="muted">{selectedProvider.reason}</p>
          </div>
        </Card>
        <Card>
          <div className="stack">
            <p className="eyebrow">Why selected</p>
            <p>
              This package is verified, available for the campaign slot, within budget, within discount
              limit, and under the owner&apos;s maximum expected CPA.
            </p>
            <Badge tone="warning">Demo transaction path</Badge>
          </div>
        </Card>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Rejected alternatives</p>
            <h2>Invalid options remain visible</h2>
          </div>
        </div>
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Package</th>
                <th>Price</th>
                <th>Expected CPA</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.id}>
                  <td>{provider.provider}</td>
                  <td>{provider.package}</td>
                  <td>{formatRupees(provider.pricePaise)}</td>
                  <td>{provider.expectedCpa}</td>
                  <td>
                    <div className="stack">
                      <Badge tone={provider.badge}>{provider.decision}</Badge>
                      <span className="muted">{provider.reason}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </PageContainer>
  );
}
