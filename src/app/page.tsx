import { demoCampaign, formatRupees, providers, workflow } from "../components/demo-data";
import { Badge, ButtonLink, Card, MetricCard, PageContainer, TimelineStep } from "../components/ui";

export default function Home() {
  return (
    <PageContainer>
      <section className="hero">
        <div className="stack">
          <Badge>Agentic commerce for local spots</Badge>
          <h1>Fill quiet slots. Recover real revenue.</h1>
          <p className="lead">
            Reverb Fill helps cafes and restaurants turn underbooked time slots into approved,
            verified promotion campaigns with tracked reservations and fixture-safe demo commerce.
          </p>
          <div className="actions">
            <ButtonLink href="/campaigns/new">Run Demo Campaign</ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary">
              View Dashboard
            </ButtonLink>
          </div>
        </div>
        <Card>
          <div className="stack">
            <div className="row">
              <div>
                <p className="eyebrow">Active demo</p>
                <h2 style={{ fontSize: "2rem" }}>{demoCampaign.spot}</h2>
              </div>
              <Badge tone="warning">Demo transaction</Badge>
            </div>
            <div className="grid grid-2">
              <MetricCard label="Slot" value={demoCampaign.slot} detail="Underbooked service window" />
              <MetricCard label="Unused capacity" value="12 seats" detail="Inventory expires after the slot" />
              <MetricCard label="Target" value="6 reservations" detail="Owner-defined campaign goal" />
              <MetricCard label="Budget" value={formatRupees(demoCampaign.maximumBudgetPaise)} detail="Hard deterministic cap" />
            </div>
            <div className="console">
              {workflow.slice(0, 5).map((step, index) => (
                <div className="console-line" key={step}>
                  <span>{step}</span>
                  <Badge tone={index < 3 ? "success" : "default"}>{index < 3 ? "Ready" : "Next"}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Product flow</p>
            <h2>From quiet slot to tracked performance</h2>
          </div>
        </div>
        <div className="grid grid-3">
          {workflow.map((step, index) => (
            <Card key={step}>
              <TimelineStep index={index + 1} title={step} detail="Fixture mode keeps this deterministic for the showcase." />
            </Card>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Recommendation</p>
            <h2>Verified provider selected without live keys</h2>
          </div>
          <ButtonLink href="/campaigns/demo" variant="secondary">
            Open Details
          </ButtonLink>
        </div>
        <div className="grid grid-3">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <div className="stack">
                <Badge tone={provider.badge}>{provider.decision}</Badge>
                <h3>{provider.provider}</h3>
                <p className="muted">{provider.reason}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </PageContainer>
  );
}
