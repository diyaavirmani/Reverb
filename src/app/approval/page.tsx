import { ApplicationHeader } from "../../components/app-shell";
import { CampaignDateText } from "../../components/campaign-date-text";
import { creative, demoCampaign } from "../../components/demo-data";
import { ApprovalExperience } from "../../components/demo-launcher";
import { Icon } from "../../components/icons";
import { Badge, WorkflowProgress } from "../../components/ui";

export default function ApprovalPage() {

  return (
    <div className="top-nav-page approval-page-shell">
      <ApplicationHeader current="Approval" />
      <main className="approval-page">
        <div className="approval-topline"><span className="breadcrumb">Home / Campaign Approval</span><WorkflowProgress active="approval" /></div>
        <header className="approval-heading"><h1>Secure Campaign Approval</h1><p>Review the selected package and approve the controlled demo transaction.</p></header>
        <div className="approval-layout">
          <div className="approval-summary-column">
            <section className="approval-summary-card card">
              <div className="approval-section-title"><span><Icon name="store" /></span><h2>Provider & Package</h2></div>
              <div className="approval-provider"><span className="approval-provider-photo" /><div><strong>Delhi Food Guide</strong><Badge tone="success"><Icon name="shield" /> Verified Provider</Badge><b>Friday Story Placement</b><small>Selected package</small></div></div>
            </section>
            <section className="approval-summary-card card">
              <div className="approval-section-title"><span><Icon name="review" /></span><h2>Package Summary</h2></div>
              <dl className="package-summary">
                <div><dt>Placement</dt><dd>Friday Story Placement</dd></div>
                <div><dt>Campaign Date</dt><dd><CampaignDateText date={demoCampaign.date} /></dd></div>
                <div><dt>Amount</dt><dd>₹3,000</dd></div>
                <div><dt>Budget Limit</dt><dd>₹5,000</dd></div>
                <div><dt>Remaining After Approval</dt><dd className="positive">₹2,000</dd></div>
                <div><dt>Recurring Charge</dt><dd>No</dd></div>
                <div><dt>Maximum CPA</dt><dd>₹850</dd></div>
                <div><dt>Maximum Discount</dt><dd>15%</dd></div>
              </dl>
              <div className="locked-note"><Icon name="approval" /> These campaign details are locked for this approval step.</div>
            </section>
          </div>
          <div className="approval-action-column">
            <ApprovalExperience campaign={demoCampaign} initialCaption={creative.caption} />
            <section className="what-next-card card"><span><Icon name="check" /></span><div><h2>What happens next?</h2><p>Once approved, the fixture lifecycle confirms the order, activates the campaign, and makes results available immediately.</p></div></section>
          </div>
        </div>
        <section className="reassurance-strip">
          <Reassurance icon="shield" title="Constraint Protected" detail="Business rules enforced" />
          <Reassurance icon="approval" title="Verified Providers" detail="Evidence-based selection" />
          <Reassurance icon="wallet" title="No Hidden Spend" detail="Amount locked before approval" />
          <Reassurance icon="clock" title="Instant Confirmation" detail="Fixture lifecycle updates immediately" />
        </section>
      </main>
    </div>
  );
}

function Reassurance({ icon, title, detail }: { icon: "shield" | "approval" | "wallet" | "clock"; title: string; detail: string }) {
  return <div><span><Icon name={icon} /></span><p><strong>{title}</strong><small>{detail}</small></p></div>;
}
