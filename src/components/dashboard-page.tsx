"use client";

import { useEffect, useState } from "react";

import { SidebarLayout } from "./app-shell";
import { CampaignCalendar } from "./campaign-calendar";
import { applyDemoCampaignDraft, demoCampaign, type DemoCampaign } from "./demo-data";
import { getDemoTodayDate, isPastDemoDate } from "./demo-date";
import { loadDemoCampaignDraft, persistDemoCampaignDate, type DemoCampaignDraft } from "./demo-state";
import { Icon } from "./icons";
import { Badge, ButtonLink, MetricCard } from "./ui";

export default function DashboardPage() {
  const [campaign, setCampaign] = useState(demoCampaign);
  const [referenceDate, setReferenceDate] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const stored = loadDemoCampaignDraft();
      if (stored) setCampaign(applyDemoCampaignDraft(demoCampaign, stored));
      setReferenceDate(getDemoTodayDate());
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function selectCampaignDate(date: string) {
    if (isPastDemoDate(date, referenceDate ?? new Date())) return;
    const draft = persistDemoCampaignDate(date, toCampaignDraft(campaign));
    setCampaign(applyDemoCampaignDraft(campaign, draft));
  }

  return (
    <SidebarLayout active="overview">
      <header className="dashboard-header">
        <h1>Overview</h1>
        <div className="dashboard-filters"><button type="button"><Icon name="store" /> Café Aura <span>⌄</span></button><button type="button"><Icon name="calendar" /> {campaign.displayDate} <span>⌄</span></button></div>
      </header>
      <div className="dashboard-top-metrics">
        <MetricCard icon="calendar" label="Reservations (target)" value="6" />
        <MetricCard icon="seat" label="Unused Seats" value="12" />
        <MetricCard icon="wallet" label="Budget Limit" value="₹5,000" />
        <MetricCard icon="wallet" label="Budget Remaining" value="₹2,000" />
      </div>

      <section className="active-campaign-section">
        <h2>Active Campaign</h2>
        <div className="active-campaign-card card">
          <div className="campaign-details-column">
            <div className="active-title"><span className="icon-tile"><Icon name="calendar" /></span><div><h3>Friday 7–9 PM</h3><p>{campaign.displayDate}</p></div></div>
            <Badge tone="warning" dot>Awaiting Approval</Badge>
            <div className="campaign-detail-grid">
              <span><small><Icon name="spark" /> Campaign Type</small><strong>Recurring</strong></span>
              <span><small><Icon name="target" /> Target Reservations</small><strong>6</strong></span>
              <span><small><Icon name="wallet" /> Offer Type</small><strong>15% off sharing platters</strong></span>
              <span><small><Icon name="store" /> Venue</small><strong>Café Aura</strong></span>
              <span><small><Icon name="clock" /> Time Window</small><strong>7:00 PM – 9:00 PM</strong></span>
              <span><small><Icon name="calendar" /> Recurrence</small><strong>Every Friday</strong></span>
            </div>
            <ButtonLink href="/campaigns/demo" variant="secondary">View Campaign Details <Icon name="chevron" /></ButtonLink>
          </div>
          <div className="schedule-column">
            <CampaignCalendar
              selectedDate={campaign.date}
              displayDate={campaign.displayDate}
              referenceDate={referenceDate}
              onSelect={selectCampaignDate}
            />
          </div>
        </div>
      </section>

      <section className="dashboard-kpis">
        <MetricCard icon="wallet" label="Expected CPA" value="₹750" detail="Within ₹850 limit" />
        <MetricCard icon="spark" label="Best Option Score" value="92%" detail="Deterministic score" />
        <MetricCard icon="shield" label="Providers Checked" value="18" detail="Verified fixture pool" />
        <MetricCard icon="chart" label="Improvement" value="+24%" detail="vs. previous demo" trend="up" />
      </section>
      <p className="dashboard-note" id="audit"><Icon name="audit" /> Data guardrails are enforced before any campaign can reach approval.</p>
    </SidebarLayout>
  );
}

function toCampaignDraft(campaign: DemoCampaign): DemoCampaignDraft {
  return {
    spot: campaign.spot,
    unusedCapacity: campaign.unusedCapacity,
    date: campaign.date,
    startTime: campaign.startTime,
    endTime: campaign.endTime,
    targetReservations: campaign.targetReservations,
    maximumBudgetPaise: campaign.maximumBudgetPaise,
    maximumDiscountPercent: campaign.maximumDiscountPercent,
    maximumCpaPaise: campaign.maximumCpaPaise
  };
}