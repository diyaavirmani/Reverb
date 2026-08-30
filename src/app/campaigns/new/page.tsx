import { SidebarLayout } from "../../../components/app-shell";
import { CampaignForm } from "../../../components/campaign-form";
import { creative, demoCampaign } from "../../../components/demo-data";
import { Icon } from "../../../components/icons";
import { requireReverbPermission } from "../../../lib/auth/authorization";

export default async function CreateCampaignPage() {
  await requireReverbPermission("campaign:create");

  return (
    <SidebarLayout active="new">
      <header className="create-header"><span className="breadcrumb">Campaigns / New Campaign</span><h1>Create Campaign</h1><p>Tell Reverb what capacity you need to recover and the constraints it must respect.</p></header>
      <div className="create-layout">
        <CampaignForm campaign={demoCampaign} initialCaption={creative.caption} />
        <aside className="constraint-panel card">
          <span className="constraint-icon"><Icon name="shield" /></span>
          <h2>Guardrails stay in control</h2>
          <p>Reverb evaluates every package before it can be recommended.</p>
          <div className="constraint-list">
            {["Budget limit enforced", "Maximum CPA protected", "Discount capped at 15%", "Verified providers only", "Owner approval required"].map((item) => <span key={item}><i><Icon name="check" /></i>{item}</span>)}
          </div>
          <div className="constraint-note"><Icon name="spark" /><span><strong>Deterministic fixture journey</strong><small>The complete lifecycle runs locally without external services.</small></span></div>
        </aside>
      </div>
    </SidebarLayout>
  );
}
