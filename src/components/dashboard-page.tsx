"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { weekdayToIndex, type ReverbVenueProfile } from "../lib/venue/profile";
import { AgentActivity } from "./agent-activity";
import { SidebarLayout } from "./app-shell";
import { CampaignCalendar } from "./campaign-calendar";
import { applyDemoCampaignDraft, applyDemoLifecycle, type DemoCampaign } from "./demo-data";
import { getDemoTodayDate, isPastDemoDate } from "./demo-date";
import { loadDemoCampaignDraft, loadDemoSnapshot, persistDemoCampaignDate, type DemoCampaignDraft, type DemoLifecycleState } from "./demo-state";
import { Icon } from "./icons";
import { Badge, ButtonLink, MetricCard } from "./ui";

type DashboardPageProps = {
  profile: ReverbVenueProfile;
  firstName: string;
  initialCampaign: DemoCampaign;
};

export default function DashboardPage({ profile, firstName, initialCampaign }: DashboardPageProps) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [lifecycle, setLifecycle] = useState<DemoLifecycleState | null>(null);
  const [referenceDate, setReferenceDate] = useState<string | null>(null);
  const recurringWeekdays = useMemo(
    () => [...new Set(profile.operations.quietSlots.map((slot) => weekdayToIndex(slot.day)))],
    [profile.operations.quietSlots]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const snapshot = loadDemoSnapshot();
      const stored = loadDemoCampaignDraft();
      let restoredCampaign = stored ? applyDemoCampaignDraft(initialCampaign, stored) : initialCampaign;
      restoredCampaign = applyDemoLifecycle(restoredCampaign, snapshot?.lifecycle ?? null);
      setCampaign(restoredCampaign);
      setLifecycle(snapshot?.lifecycle ?? null);
      setReferenceDate(getDemoTodayDate(new Date(), profile.venue.timezone));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialCampaign, profile.venue.timezone]);

  function selectCampaignDate(date: string) {
    if (isPastDemoDate(date, referenceDate ?? new Date(), profile.venue.timezone)) return;
    const draft = persistDemoCampaignDate(date, toCampaignDraft(campaign, profile));
    setCampaign(applyDemoCampaignDraft(initialCampaign, draft));
  }

  const firstQuietSlot = profile.operations.quietSlots[0];
  const performance = lifecycle?.performance;
  const campaignPrepared = Boolean(lifecycle);
  const awaitingApproval = lifecycle?.ownerApprovalStatus === "PENDING";

  return (
    <SidebarLayout active="overview" venue={profile.venue.name}>
      <header className="dashboard-header personalized-dashboard-header">
        <div><span className="dashboard-eyebrow">{profile.venue.name}</span><h1>Welcome back, {firstName}</h1><p>Your venue intelligence, capacity opportunities, and campaign runs are in one place.</p></div>
        <div className="dashboard-filters"><button type="button"><Icon name="store" /> {profile.venue.name} <span>⌄</span></button><button type="button"><Icon name="calendar" /> {campaign.displayDate} <span>⌄</span></button></div>
      </header>

      <div className="dashboard-top-metrics">
        <MetricCard icon="seat" label="Venue Capacity" value={String(profile.venue.capacity)} detail="Owner-entered" />
        <MetricCard icon="clock" label="Quiet Windows" value={String(profile.operations.quietSlots.length)} detail="Recurring slots" />
        <MetricCard icon="wallet" label="Default Budget" value={formatMoney(profile.campaignDefaults.maxBudgetPaise)} detail="Owner limit" />
        <MetricCard icon="shield" label="Venue Brief" value="Approved" detail="Profile ready" trend="up" />
      </div>

      <div className="dashboard-intelligence-grid">
        <section className="venue-intelligence-card card">
          <div className="panel-heading"><div><Icon name="store" /><span><h2>Venue Intelligence</h2><small>Approved owner profile</small></span></div><Badge tone="success">Brief approved</Badge></div>
          <dl className="venue-intelligence-list">
            <div><dt>Venue</dt><dd>{profile.venue.name}</dd></div>
            <div><dt>Business type</dt><dd>{profile.venue.businessType}</dd></div>
            <div><dt>Location</dt><dd>{profile.venue.address}, {profile.venue.city}</dd></div>
            <div><dt>Capacity</dt><dd>{profile.venue.capacity} seats</dd></div>
            <div><dt>Brand profile</dt><dd>{profile.brand.tone} · {profile.brand.vibe || "Owner reviewed"}</dd></div>
            <div><dt>Website</dt><dd>{profile.analysis.sourceStatuses.some((source) => source.status === "analyzed") ? "Analyzed" : "Owner-entered profile"}</dd></div>
          </dl>
          <div className="card-actions"><ButtonLink href="/venue/brief" variant="secondary">View Venue Brief</ButtonLink><ButtonLink href="/onboarding" variant="secondary">Edit Venue</ButtonLink></div>
        </section>

        <section className="quiet-capacity-card card">
          <div className="panel-heading"><div><Icon name="seat" /><span><h2>Quiet Capacity</h2><small>Owner-identified opportunities</small></span></div></div>
          <div className="quiet-capacity-list">{profile.operations.quietSlots.map((slot) => <div key={`${slot.day}-${slot.startTime}`}><span><strong>{slot.day}</strong><small>{formatTime(slot.startTime)}–{formatTime(slot.endTime)}</small></span><b>{slot.estimatedUnusedSeats}<small>unused seats</small></b></div>)}</div>
          <ButtonLink href="/campaigns/new">Create Campaign <Icon name="arrow" /></ButtonLink>
        </section>
      </div>

      <section className="active-campaign-section">
        <div className="section-heading-row"><div><h2>{campaignPrepared ? "Active Campaign" : "Campaign Schedule"}</h2><p>{campaignPrepared ? "Current deterministic campaign state" : "Choose a future date for your next capacity campaign"}</p></div>{awaitingApproval ? <Badge tone="warning" dot>Awaiting Approval</Badge> : lifecycle?.finalStatus === "ACTIVE" ? <Badge tone="success" dot>Campaign Active</Badge> : null}</div>
        <div className="active-campaign-card card">
          <div className="campaign-details-column">
            <div className="active-title"><span className="icon-tile"><Icon name="calendar" /></span><div><h3>{firstQuietSlot.day} {formatTime(firstQuietSlot.startTime)}–{formatTime(firstQuietSlot.endTime)}</h3><p>{campaign.displayDate}</p></div></div>
            <div className="campaign-detail-grid">
              <span><small><Icon name="spark" /> Campaign Type</small><strong>{campaign.campaignContext ?? "Regular Day"}</strong></span>
              <span><small><Icon name="target" /> Target Reservations</small><strong>{campaign.targetReservations}</strong></span>
              <span><small><Icon name="wallet" /> Offer Type</small><strong>{campaign.offer}</strong></span>
              <span><small><Icon name="store" /> Venue</small><strong>{profile.venue.name}</strong></span>
              <span><small><Icon name="clock" /> Time Window</small><strong>{formatTime(campaign.startTime)}–{formatTime(campaign.endTime)}</strong></span>
              <span><small><Icon name="calendar" /> Recurrence</small><strong>Every {firstQuietSlot.day}</strong></span>
            </div>
            <ButtonLink href={campaignPrepared ? "/campaigns/demo" : "/campaigns/new"} variant="secondary">{campaignPrepared ? "Continue Campaign" : "Create Campaign"} <Icon name="chevron" /></ButtonLink>
          </div>
          <div className="schedule-column">
            <CampaignCalendar selectedDate={campaign.date} displayDate={campaign.displayDate} referenceDate={referenceDate} recurringWeekdays={recurringWeekdays} onSelect={selectCampaignDate} />
          </div>
        </div>
      </section>

      <AgentActivity lifecycle={lifecycle} />

      <div className="dashboard-operations-grid">
        <section className="dashboard-operation-card card"><div className="panel-heading"><div><Icon name="approval" /><span><h2>Approval Queue</h2><small>Human-in-the-loop controls</small></span></div></div>{awaitingApproval ? <><p><strong>1 campaign</strong> is waiting for explicit owner approval.</p><ButtonLink href="/approval">Review Approval <Icon name="arrow" /></ButtonLink></> : <p>No campaign spend is waiting for approval.</p>}</section>
        <section className="dashboard-operation-card card"><div className="panel-heading"><div><Icon name="chart" /><span><h2>Performance</h2><small>Measured fixture outcomes</small></span></div></div><p><strong>{performance?.confirmedReservationCount ?? 0} reservations</strong> · {performance ? `${performance.capacityRecoveryPercent}% capacity recovered` : "Run a campaign to establish results."}</p><ButtonLink href="/performance" variant="secondary">View Performance</ButtonLink></section>
      </div>

      <section className="connections-card card" id="settings">
        <div className="panel-heading"><div><Icon name="settings" /><span><h2>Connections & Publishing</h2><small>Preferences are not publisher connections</small></span></div></div>
        <div className="connections-grid">{["Instagram", "Facebook", "Google Business", "WhatsApp"].map((channel) => { const enabled = profile.campaignDefaults.preferredChannels.includes(channel as never); return <div key={channel}><span><strong>{channel}</strong><small>Preference: {enabled ? "Enabled" : "Disabled"}</small></span><Badge tone="neutral">Not connected</Badge><p>Publishing rule: Approval required</p><Link href="/onboarding">Connect a publisher later</Link></div>; })}</div>
      </section>
    </SidebarLayout>
  );
}

function toCampaignDraft(campaign: DemoCampaign, profile: ReverbVenueProfile): DemoCampaignDraft {
  return {
    spot: profile.venue.name,
    location: campaign.location,
    businessType: profile.venue.businessType,
    brandTone: profile.brand.tone,
    audience: profile.brand.audience,
    offer: campaign.offer,
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

function formatMoney(paise: number) { return `₹${(paise / 100).toLocaleString("en-IN")}`; }
function formatTime(value: string) { const [hours, minutes] = value.split(":"); const hour = Number(hours); return `${hour % 12 || 12}${minutes === "00" ? "" : `:${minutes}`} ${hour >= 12 ? "PM" : "AM"}`; }
