"use client";

import { useEffect, useState } from "react";

import { applyDemoCampaignDraft, getPerformanceLabels, type DemoCampaign } from "./demo-data";
import {
  isCompletedLifecycle,
  loadDemoCampaignDraft,
  loadDemoSnapshot,
  persistDemoSnapshot,
  type AddedDemoReservation,
  type DemoCampaignDraft,
  type DemoLifecycleState,
  type DemoSnapshot
} from "./demo-state";
import { Icon } from "./icons";
import { ActionButton, Badge, ButtonLink } from "./ui";

type ReservationRow = {
  id: string;
  time: string;
  partySize: number;
  revenuePaise: number;
  cpaPaise: number;
};

export function ApprovalExperience({
  campaign,
  initialCaption
}: {
  campaign: DemoCampaign;
  initialCaption: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [activeCampaign, setActiveCampaign] = useState(campaign);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const restored = loadDemoSnapshot();
      const storedCampaign = loadDemoCampaignDraft();
      setSnapshot(restored);
      if (storedCampaign) setActiveCampaign(applyDemoCampaignDraft(campaign, storedCampaign));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [campaign]);

  async function approve() {
    setLoading(true);
    setError(null);

    try {
      let lifecycle = snapshot?.lifecycle ?? null;
      if (!isCompletedLifecycle(lifecycle)) lifecycle = await requestLifecycle(activeCampaign);

      const next: DemoSnapshot = {
        version: 1,
        campaign: snapshot?.campaign ?? campaignDraft(activeCampaign),
        lifecycle,
        stage: "results",
        creativeCaption: snapshot?.creativeCaption || initialCaption,
        approved: true,
        addedReservations: snapshot?.addedReservations ?? []
      };
      persistDemoSnapshot(next);
      setSnapshot(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Campaign approval could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  if (snapshot?.approved) {
    return (
      <div className="approval-success" aria-live="polite">
        <span className="success-seal"><Icon name="check" /></span>
        <Badge tone="success">Demo Transaction Approved</Badge>
        <h2>Campaign Active</h2>
        <p>The fixture transaction completed and the campaign is ready to report measured results.</p>
        <dl className="success-summary">
          <div><dt>Provider</dt><dd>Delhi Food Guide</dd></div>
          <div><dt>Package</dt><dd>Friday Story Placement</dd></div>
          <div><dt>Amount</dt><dd>₹3,000</dd></div>
        </dl>
        <ButtonLink href="/performance" className="button-full">View Results <Icon name="arrow" /></ButtonLink>
      </div>
    );
  }

  return (
    <div className="approval-action-card">
      <div className="approval-card-title"><span><Icon name="approval" /></span><h2>Campaign Approval</h2><Badge>Demo Transaction</Badge></div>
      <dl className="approval-transaction">
        <div><dt>Provider</dt><dd>Delhi Food Guide</dd></div>
        <div><dt>Package</dt><dd>Friday Story Placement</dd></div>
        <div><dt>Amount</dt><dd>₹3,000</dd></div>
      </dl>
      <div className="approval-checks">
        {["Owner approval required", "Provider verified", "Budget compliant", "CPA compliant", "Package locked", "Amount locked", "No recurring charge"].map((check) => (
          <span key={check}><i><Icon name="check" /></i>{check}</span>
        ))}
      </div>
      <ActionButton className="button-full" onClick={approve} disabled={!hydrated || loading}>
        <Icon name="approval" /> {loading ? "Approving campaign…" : hydrated ? "Approve ₹3,000 & Launch" : "Restoring campaign…"}
      </ActionButton>
      <p className="demo-disclaimer">Demo transaction — no real payment will be processed.</p>
      {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function ResultsExperience({
  campaign,
  reservations,
  initialCaption
}: {
  campaign: DemoCampaign;
  reservations: ReservationRow[];
  initialCaption: string;
}) {
  const [addedReservations, setAddedReservations] = useState<AddedDemoReservation[]>([]);
  const [activeCampaign, setActiveCampaign] = useState(campaign);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const restored = loadDemoSnapshot();
      const storedCampaign = loadDemoCampaignDraft();
      setAddedReservations(restored?.addedReservations ?? []);
      if (storedCampaign) setActiveCampaign(applyDemoCampaignDraft(campaign, storedCampaign));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [campaign]);

  async function addReservation() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const lifecycle = await requestLifecycle(activeCampaign, `demo_ui_${Date.now()}`);
      const nextReservation: AddedDemoReservation = {
        id: lifecycle.reservationId.slice(-4).toUpperCase(),
        time: addedReservations.length % 2 === 0 ? "8:45 PM" : "8:55 PM",
        partySize: 2,
        revenuePaise: 215000
      };
      const nextAdded = [...addedReservations, nextReservation];
      const current = loadDemoSnapshot();
      const next: DemoSnapshot = {
        version: 1,
        campaign: current?.campaign ?? campaignDraft(activeCampaign),
        lifecycle: current?.lifecycle ?? lifecycle,
        stage: "results",
        creativeCaption: current?.creativeCaption || initialCaption,
        approved: true,
        addedReservations: nextAdded
      };
      persistDemoSnapshot(next);
      setAddedReservations(nextAdded);
      setMessage("Demo reservation added. Results and capacity metrics have been updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The demo reservation could not be added.");
    } finally {
      setLoading(false);
    }
  }

  const reservationCount = reservations.length + addedReservations.length;
  const revenuePaise = 4260000 + addedReservations.reduce((total, row) => total + row.revenuePaise, 0);
  const actualCpaPaise = Math.round(284000 / reservationCount);
  const allReservations = [
    ...reservations,
    ...addedReservations.map((row) => ({ ...row, cpaPaise: actualCpaPaise }))
  ];

  return (
    <>
      <div className="results-active-banner"><span><i><Icon name="check" /></i><strong>Campaign Active</strong><small>Your campaign is running and delivering good results.</small></span><span>Campaign ID <strong>RF-DEMO-042</strong></span></div>
      <div className="results-metrics">
        <ResultMetric icon="calendar" label="Reservations" value={String(reservationCount)} detail="Total reservations" />
        <ResultMetric icon="wallet" label="Revenue Recovered" value={formatMoney(revenuePaise)} detail="Recovered revenue" positive />
        <ResultMetric icon="users" label="Actual CPA" value={formatMoney(actualCpaPaise)} detail="Cost per reservation" />
        <ResultMetric icon="chart" label="Capacity Recovered" value="33%" detail="vs. campaign goal" positive />
      </div>
      <div className="results-content-grid">
        <section className="results-table-card card">
          <div className="panel-heading"><div><Icon name="reservation" /><h2>Recent Reservations</h2></div><span>{reservationCount} total</span></div>
          <div className="table-scroll">
            <table className="reservation-table">
              <thead><tr><th>Booking ID</th><th>Date & Time</th><th>Party Size</th><th>Revenue</th><th>Actual CPA</th><th>Status</th></tr></thead>
              <tbody>{allReservations.map((reservation) => (
                <tr key={reservation.id}><td><strong>{reservation.id}</strong></td><td>{activeCampaign.displayDate}<small>{reservation.time}</small></td><td>{reservation.partySize} people</td><td>{formatMoney(reservation.revenuePaise)}</td><td>{formatMoney(reservation.cpaPaise)}</td><td><Badge tone="success">Confirmed</Badge></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="view-all-row">View All Reservations <Icon name="arrow" /></div>
        </section>

        <aside className="results-analytics" id="analytics">
          <section className="analytics-card card">
            <div className="panel-heading"><div><Icon name="chart" /><h2>Revenue Recovered</h2></div><span>Campaign total</span></div>
            <strong className="chart-total">{formatMoney(revenuePaise)}</strong>
            <span className="chart-delta">↑ 24% vs previous 4 weeks</span>
            <svg className="revenue-chart" viewBox="0 0 420 150" role="img" aria-label="Revenue recovered rises steadily across the campaign period">
              <path className="chart-grid" d="M10 120H410M10 80H410M10 40H410" />
              <path className="chart-area" d="M10 124 60 118 110 108 160 105 210 88 260 81 310 55 360 47 410 18 410 140 10 140Z" />
              <polyline className="chart-line" points="10,124 60,118 110,108 160,105 210,88 260,81 310,55 360,47 410,18" />
            </svg>
            <div className="chart-labels">{getPerformanceLabels(activeCampaign.date).map((label) => <span key={label}>{label}</span>)}</div>
          </section>
          <section className="analytics-card card">
            <div className="panel-heading"><div><Icon name="spark" /><h2>Campaign Performance</h2></div></div>
            <div className="performance-stats"><span><small>Impressions</small><strong>12,450</strong><em>↑ 18%</em></span><span><small>Clicks</small><strong>1,286</strong><em>↑ 29%</em></span><span><small>Click-through rate</small><strong>10.3%</strong><em>On track</em></span></div>
            <div className="capacity-row"><span><strong>Capacity Goal</strong><small>4 of 12 seats recovered</small></span><b>33%</b></div>
            <div className="progress-track"><span style={{ width: "33%" }} /></div>
          </section>
        </aside>
      </div>
      <div className="analytics-banner">
        <span className="analytics-banner-icon"><Icon name="chart" /></span>
        <div><strong>Keep the campaign moving</strong><p>Add another fixture-safe reservation and watch the local results update immediately.</p></div>
        <ActionButton onClick={addReservation} disabled={loading}>{loading ? "Adding reservation…" : "Add Demo Reservation"} {!loading ? <Icon name="plus" /> : null}</ActionButton>
      </div>
      {message ? <p className="results-message success-message" role="status">{message}</p> : null}
      {error ? <p className="results-message form-error" role="alert">{error}</p> : null}
    </>
  );
}

function ResultMetric({ icon, label, value, detail, positive = false }: { icon: "calendar" | "wallet" | "users" | "chart"; label: string; value: string; detail: string; positive?: boolean }) {
  return <section className="result-metric card"><span className={`icon-tile${positive ? " success" : ""}`}><Icon name={icon} /></span><span><small>{label}</small><strong className={positive ? "positive" : ""}>{value}</strong><em>{detail}</em></span></section>;
}

function campaignDraft(campaign: DemoCampaign): DemoCampaignDraft {
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

async function requestLifecycle(campaign: DemoCampaign, trackingCode = `demo_approval_${campaign.date.replaceAll("-", "")}`): Promise<DemoLifecycleState> {
  const response = await fetch("/api/demo/lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ownerMessage: `Fill ${campaign.date} from ${campaign.startTime} to ${campaign.endTime} with ${campaign.unusedCapacity} unused seats, target ${campaign.targetReservations} reservations, budget Rs ${campaign.maximumBudgetPaise / 100}, maximum discount ${campaign.maximumDiscountPercent}%, and maximum CPA Rs ${campaign.maximumCpaPaise / 100}.`,
      reservation: {
        customerName: "Demo Guest",
        customerContact: "demo@example.test",
        partySize: 2,
        trackingCode,
        isDemoBooking: true
      }
    })
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok || !isCompletedLifecycle(payload)) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : "The fixture lifecycle did not complete. Please try again.";
    throw new Error(message);
  }
  return payload;
}

function formatMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
