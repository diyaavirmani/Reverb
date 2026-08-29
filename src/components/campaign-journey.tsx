"use client";

import { useEffect, useMemo, useState } from "react";

import { AppSidebar, ApplicationHeader } from "./app-shell";
import { applyDemoCampaignDraft, type DemoCampaign, type DemoProvider } from "./demo-data";
import { loadDemoCampaignDraft, loadDemoSnapshot, updateDemoSnapshot } from "./demo-state";
import { Icon } from "./icons";
import { ActionButton, Badge, InfoPanel, StatusBadge, SummaryStat, WorkflowProgress } from "./ui";

type CreativeData = {
  headline: string;
  discount: string;
  offer: string;
  time: string;
  cta: string;
  caption: string;
};

export function CampaignJourney({
  campaign,
  providers,
  creative
}: {
  campaign: DemoCampaign;
  providers: DemoProvider[];
  creative: CreativeData;
}) {
  const [stage, setStage] = useState<"discovery" | "creative">("discovery");
  const [activeCampaign, setActiveCampaign] = useState(campaign);
  const [tab, setTab] = useState<"comparison" | "shortlist">("comparison");
  const [caption, setCaption] = useState(creative.caption);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const stored = loadDemoSnapshot();
      const storedCampaign = loadDemoCampaignDraft();
      if (storedCampaign) setActiveCampaign(applyDemoCampaignDraft(campaign, storedCampaign));
      if (stored?.creativeCaption) setCaption(stored.creativeCaption);
      if (new URLSearchParams(window.location.search).get("step") === "creative") setStage("creative");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [campaign]);

  const visibleProviders = useMemo(
    () => tab === "shortlist" ? providers.filter((provider) => provider.decision === "Selected") : providers,
    [providers, tab]
  );

  function showCreative() {
    updateDemoSnapshot((current) => ({ ...current, stage: "creative" }));
    window.history.replaceState(null, "", "/campaigns/demo?step=creative");
    setStage("creative");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveCaption() {
    updateDemoSnapshot((current) => ({ ...current, creativeCaption: caption }));
    setEditing(false);
    setSaved(true);
  }

  function proceedToApproval() {
    updateDemoSnapshot((current) => ({ ...current, creativeCaption: caption, stage: "approval" }));
    window.location.href = "/approval";
  }

  if (stage === "creative") {
    return (
      <div className="top-nav-page">
        <ApplicationHeader current="Discovery" />
        <main className="creative-page">
          <div className="creative-topline">
            <button className="text-button" type="button" onClick={() => {
              window.history.replaceState(null, "", "/campaigns/demo");
              setStage("discovery");
            }}>← Back to Discovery</button>
            <WorkflowProgress active="creative" />
          </div>
          <header className="creative-heading">
            <h1>Creative Review</h1>
            <p>Review your campaign creative and quality checks for {activeCampaign.displayDate} before approval.</p>
          </header>
          <div className="creative-layout">
            <section className="creative-preview-column">
              <div className="creative-carousel">
                <button className="carousel-arrow" aria-label="Previous creative" type="button">‹</button>
                <CampaignPoster creative={creative} campaign={activeCampaign} />
                <button className="carousel-arrow" aria-label="Next creative" type="button">›</button>
              </div>
              <div className="creative-tools">
                <span><Icon name="spark" /> Fit</span>
                <span className="carousel-count">1 / 3</span>
                <button type="button"><Icon name="download" /> Download</button>
              </div>
            </section>

            <section className="creative-review-column">
              <div className="review-tabs"><button className="active" type="button">Post Caption</button><button type="button">Details</button></div>
              <textarea
                className={`caption-editor${editing ? " editing" : ""}`}
                aria-label="Campaign caption"
                value={caption}
                readOnly={!editing}
                onChange={(event) => setCaption(event.target.value)}
              />
              <div className="caption-meta"><span>{editing ? "Editing locally" : "AI-suggested caption"}</span><span>{caption.length} / 500</span></div>
              <div className="quality-checks">
                <div><h2>Quality Checks</h2><p>All checks passed. Creative is good to go.</p></div>
                {["Discount within 15%", "CTA present", "Time slot correct", "Budget compliant", "Provider/package matched"].map((check) => (
                  <div className="quality-row" key={check}><span><i><Icon name="check" /></i>{check}</span><Badge tone="success">Passed</Badge></div>
                ))}
              </div>
              <div className="creative-provider-note"><Icon name="approval" /> This creative is tailored for <strong>Delhi Food Guide — Friday Story Placement.</strong></div>
              {saved ? <p className="inline-success" role="status">Caption saved locally.</p> : null}
            </section>
          </div>
          <div className="creative-actions">
            <ActionButton variant="secondary" onClick={editing ? saveCaption : () => { setSaved(false); setEditing(true); }}>
              <Icon name={editing ? "check" : "edit"} /> {editing ? "Save Caption" : "Edit Creative"}
            </ActionButton>
            <ActionButton onClick={proceedToApproval}>Proceed to Approval <Icon name="arrow" /></ActionButton>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <AppSidebar active="discovery" />
      <main className="app-main discovery-page">
        <div className="discovery-header">
          <div><span className="breadcrumb">Campaigns / Café Aura</span><h1>Provider Discovery</h1><p>Compare verified providers and packages to find the best fit for your campaign.</p></div>
          <ActionButton onClick={showCreative}><Icon name="spark" /> Review Creative</ActionButton>
        </div>

        <section className="campaign-summary-card">
          <div className="summary-venue">
            <span className="summary-photo" />
            <span><strong>{activeCampaign.spot}</strong><small>{activeCampaign.displayDate} · 7–9 PM</small><small>{activeCampaign.location}</small></span>
          </div>
          <SummaryStat icon="target" label="Target Reservations" value="6" />
          <SummaryStat icon="wallet" label="Budget Limit" value="₹5,000" />
          <SummaryStat icon="seat" label="Unused Seats" value="12" />
          <SummaryStat icon="wallet" label="Budget Remaining" value="₹2,000" />
          <SummaryStat icon="spark" label="Priority" value="High" />
        </section>

        <div className="provider-toolbar">
          <div className="provider-tabs">
            <button className={tab === "comparison" ? "active" : ""} type="button" onClick={() => setTab("comparison")}>Provider Comparison</button>
            <button className={tab === "shortlist" ? "active" : ""} type="button" onClick={() => setTab("shortlist")}>Shortlist <span>1</span></button>
          </div>
          <div className="provider-controls"><label>Sort by <select aria-label="Sort providers" defaultValue="score"><option value="score">Best CPA within budget</option><option value="price">Lowest price</option></select></label><button aria-label="Filter providers" type="button"><Icon name="filter" /></button></div>
        </div>

        <ProviderTable providers={visibleProviders} />
        <div className="provider-footer"><span>Showing {visibleProviders.length} of {providers.length} providers</span><span className="pagination"><button type="button">‹</button><button className="active" type="button">1</button><button type="button">›</button></span></div>
        <div className="discovery-explanations">
          <InfoPanel icon="spark" title="Why this provider?">Delhi Food Guide offers the strongest expected booking performance while remaining within the campaign&apos;s budget and CPA constraints.</InfoPanel>
          <InfoPanel icon="shield" title="Verified provider pool" tone="green">Providers in the demo fixture have deterministic verification/evidence data and are evaluated against the same campaign constraints.</InfoPanel>
        </div>
      </main>
    </div>
  );
}

function ProviderTable({ providers }: { providers: DemoProvider[] }) {
  return (
    <div className="provider-table-wrap card">
      <table className="provider-table">
        <thead><tr><th aria-label="Select" /><th>Provider</th><th>Package</th><th>Price</th><th>Expected Bookings</th><th>Worst CPA</th><th>Decision</th></tr></thead>
        <tbody>
          {providers.map((provider) => {
            const selected = provider.decision === "Selected";
            return (
              <tr className={selected ? "selected" : ""} key={provider.id}>
                <td><input aria-label={`Select ${provider.provider}`} type="checkbox" checked={selected} readOnly /></td>
                <td><div className="provider-cell"><span className="provider-logo">{provider.provider.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><span><strong>{provider.provider}</strong><small>{provider.category} · {provider.location}</small><em><Icon name="shield" /> Verified</em></span></div></td>
                <td><strong>{provider.package}</strong><small className="table-subtext">Featured placement</small></td>
                <td><strong>{formatMoney(provider.pricePaise)}</strong></td>
                <td><strong>{provider.expectedBookings}</strong><small className={selected ? "positive" : "warning-text"}>{selected ? "Strong confidence" : provider.warning}</small></td>
                <td><strong>{formatMoney(provider.worstCpaPaise)}</strong><small className={selected ? "positive" : "danger-text"}>{selected ? "Within budget" : "Over target"}</small></td>
                <td><StatusBadge status={provider.decision} /><small className={selected ? "positive" : "danger-text"}>{provider.reason}</small></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CampaignPoster({ creative, campaign }: { creative: CreativeData; campaign: DemoCampaign }) {
  return (
    <div className="campaign-poster" aria-label="Café Aura campaign creative">
      <div className="poster-copy">
        <strong>{creative.headline}</strong>
        <b>{creative.discount}</b>
        <strong>{creative.offer}</strong>
        <span>{creative.time}</span>
        <em>{creative.cta}</em>
      </div>
      <div className="poster-venue"><strong>{campaign.spot}</strong><span>{campaign.location}</span></div>
    </div>
  );
}

function formatMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
