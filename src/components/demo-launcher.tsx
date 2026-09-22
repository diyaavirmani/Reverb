"use client";

import { useEffect, useState } from "react";

import { applyDemoCampaignDraft, getPerformanceLabels, type DemoCampaign } from "./demo-data";
import {
  demoCampaignDraftStorageKey,
  demoSnapshotStorageKey,
  isCompletedLifecycle,
  isNoEligibleLifecycle,
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
  revenuePaise: number | null;
  cpaPaise: number | null;
  isDemoBooking?: boolean;
  status?: string;
};

type ApiReservation = {
  id: string;
  reservationAt: string;
  seatCount: number;
  status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  isTest: boolean;
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
  const selectedOption = snapshot?.lifecycle.options?.find((option) => option.id === snapshot.lifecycle.selectedOptionId);
  const selectedAmount = selectedOption?.totalCostPaise ?? activeCampaign.selectedSpendPaise;
  const selectedProvider = selectedOption?.providerName ?? "Selected verified provider";
  const selectedPackage = selectedOption?.packageTitle ?? "Selected package";
  const rejectedOptions = snapshot?.lifecycle.options?.filter((option) => !option.eligible) ?? [];

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
      const lifecycle = await requestLifecycle(activeCampaign);

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
          <div><dt>Provider</dt><dd>{selectedProvider}</dd></div>
          <div><dt>Package</dt><dd>{selectedPackage}</dd></div>
          <div><dt>Amount</dt><dd>{formatMoney(selectedAmount)}</dd></div>
        </dl>
        <ButtonLink href="/performance" className="button-full">View Results <Icon name="arrow" /></ButtonLink>
      </div>
    );
  }

  return (
    <div className="approval-action-card">
      <div className="approval-card-title"><span><Icon name="approval" /></span><h2>Campaign Approval</h2><Badge>Demo Transaction</Badge></div>
      <dl className="approval-transaction">
        <div><dt>Provider</dt><dd>{selectedProvider}</dd></div>
        <div><dt>Package</dt><dd>{selectedPackage}</dd></div>
        <div><dt>Amount</dt><dd>{formatMoney(selectedAmount)}</dd></div>
        {selectedOption ? <div><dt>Expected Reservations</dt><dd>{selectedOption.expectedReservations}</dd></div> : null}
        {selectedOption ? <div><dt>Expected CPA</dt><dd>{formatMoney(selectedOption.expectedCpaPaise)}</dd></div> : null}
        {selectedOption ? <div><dt>Discount</dt><dd>{selectedOption.discountBps / 100}%</dd></div> : null}
      </dl>
      {rejectedOptions.length > 0 ? (
        <div className="approval-checks">
          {rejectedOptions.map((option) => (
            <span key={option.id}><i><Icon name="review" /></i>{option.packageTitle}: {option.rejectionReasons.join(", ") || "Rejected by policy"}</span>
          ))}
        </div>
      ) : null}
      <div className="approval-checks">
        {["Owner approval required", "Provider verified", "Budget compliant", "CPA compliant", "Package locked", "Amount locked", "No recurring charge"].map((check) => (
          <span key={check}><i><Icon name="check" /></i>{check}</span>
        ))}
      </div>
      <ActionButton className="button-full" onClick={approve} disabled={!hydrated || loading}>
        <Icon name="approval" /> {loading ? "Approving campaign…" : hydrated ? `Approve ${formatMoney(selectedAmount)} & Launch` : "Restoring campaign…"}
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
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [serverReservations, setServerReservations] = useState<ApiReservation[]>([]);
  const [activeCampaign, setActiveCampaign] = useState(campaign);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshResults(current: DemoSnapshot): Promise<DemoSnapshot | null> {
    const performanceResponse = await fetch(`/api/campaigns/${current.lifecycle.campaignId}/performance`);

    if (performanceResponse.status === 404) {
      window.localStorage.removeItem(demoSnapshotStorageKey);
      window.localStorage.removeItem(demoCampaignDraftStorageKey);
      setSnapshot(null);
      setServerReservations([]);
      setError("This fixture campaign is no longer available. Create a new demo campaign to continue.");
      return null;
    }

    const performancePayload = await performanceResponse.json() as { error?: string } | DemoLifecycleState["performance"];

    if (!performanceResponse.ok) {
      throw new Error("error" in performancePayload && performancePayload.error ? performancePayload.error : "Campaign performance could not be loaded.");
    }

    const reservationsResponse = await fetch(`/api/campaigns/${current.lifecycle.campaignId}/reservations`);
    const reservationsPayload = await reservationsResponse.json() as { reservations?: ApiReservation[]; error?: string };

    if (!reservationsResponse.ok) {
      throw new Error(reservationsPayload.error ?? "Campaign reservations could not be loaded.");
    }

    const next: DemoSnapshot = {
      ...current,
      lifecycle: {
        ...current.lifecycle,
        performance: performancePayload as DemoLifecycleState["performance"]
      }
    };
    persistDemoSnapshot(next);
    setSnapshot(next);
    setServerReservations(reservationsPayload.reservations ?? []);
    return next;
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const restored = loadDemoSnapshot();
      const storedCampaign = loadDemoCampaignDraft();
      setAddedReservations(restored?.addedReservations ?? []);
      setSnapshot(restored);
      if (storedCampaign) setActiveCampaign(applyDemoCampaignDraft(campaign, storedCampaign));
      if (restored?.lifecycle.campaignId) {
        void refreshResults(restored);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [campaign]);

  async function addReservation() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const current = loadDemoSnapshot();
      const campaignId = current?.lifecycle.campaignId;

      if (!current || !campaignId) {
        throw new Error("Create and approve a demo campaign before adding reservations.");
      }

      const reservationResponse = await fetch("/api/demo/reservation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId,
          customerName: "Demo Guest",
          customerContact: "demo@example.test",
          partySize: 2,
          reservationTime: activeCampaign.reservationTime,
          trackingCode: `demo_ui_${Date.now()}`,
          isDemoBooking: true
        })
      });
      const reservationPayload = (await reservationResponse.json()) as { reservationId?: string; error?: string; code?: string };

      if (!reservationResponse.ok) {
        if (reservationPayload.code === "CAPACITY_EXCEEDED") {
          throw new Error("This campaign has no remaining fixture capacity.");
        }
        if (reservationPayload.code === "DUPLICATE_TRACKING_SUBMISSION") {
          throw new Error("That fixture reservation was already recorded. Try again.");
        }
        throw new Error(reservationPayload.error ?? "The demo reservation could not be added.");
      }

      const nextReservation: AddedDemoReservation = {
        id: (reservationPayload.reservationId ?? `reservation_${Date.now()}`).slice(-4).toUpperCase(),
        time: formatReservationTime(activeCampaign.reservationTime),
        partySize: 2,
        revenuePaise: 0
      };
      const nextAdded = [...addedReservations, nextReservation];
      const next: DemoSnapshot = {
        version: 1,
        campaign: current?.campaign ?? campaignDraft(activeCampaign),
        lifecycle: current.lifecycle,
        stage: "results",
        creativeCaption: current?.creativeCaption || initialCaption,
        approved: true,
        addedReservations: nextAdded
      };
      const refreshed = await refreshResults(next);
      setAddedReservations(nextAdded);
      setMessage(refreshed ? "Demo reservation added. Results and reservations have been refreshed." : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The demo reservation could not be added.");
    } finally {
      setLoading(false);
    }
  }

  const performance = snapshot?.lifecycle.performance;
  const campaignId = snapshot?.lifecycle.campaignId ?? "Campaign pending";
  const reservationCount = performance?.confirmedReservationCount ?? reservations.length;
  const revenuePaise = performance?.estimatedRevenueRecoveredPaise ?? 0;
  const actualCpaPaise = performance?.actualCostPerReservationPaise ?? null;
  const capacityRecoveryPercent = performance?.capacityRecoveryPercent ?? 0;
  const remainingCapacity = performance?.remainingCapacity ?? activeCampaign.unusedCapacity;
  const recoveredGuests = performance?.confirmedGuestCount ?? 0;
  const allReservations: ReservationRow[] = [
    ...reservations,
    ...serverReservations.map((reservation) => ({
      id: reservation.id.slice(-4).toUpperCase(),
      time: formatReservationTime(reservation.reservationAt),
      partySize: reservation.seatCount,
      revenuePaise: reservation.isTest ? null : null,
      cpaPaise: reservation.isTest ? null : actualCpaPaise,
      isDemoBooking: reservation.isTest,
      status: reservation.status
    })),
    ...addedReservations
      .filter((row) => !serverReservations.some((reservation) => reservation.id.endsWith(row.id.toLowerCase())))
      .map((row) => ({ ...row, revenuePaise: null, cpaPaise: null, isDemoBooking: true, status: "BOOKED" }))
  ];

  return (
    <>
      <div className="results-active-banner"><span><i><Icon name="check" /></i><strong>{snapshot?.lifecycle.merchantOrderId ? "Campaign Active" : "Campaign Results"}</strong><small>Measured results come from the current fixture campaign.</small></span><span>Campaign ID <strong>{campaignId}</strong></span></div>
      <div className="results-metrics">
        <ResultMetric icon="calendar" label="Reservations" value={String(reservationCount)} detail="Total reservations" />
        <ResultMetric icon="wallet" label="Revenue Recovered" value={formatMoney(revenuePaise)} detail="Recovered revenue" positive />
        <ResultMetric icon="users" label="Actual CPA" value={actualCpaPaise === null ? "Not measured" : formatMoney(actualCpaPaise)} detail={`Spend ${formatMoney(performance?.promotionSpendPaise ?? 0)}`} />
        <ResultMetric icon="chart" label="Capacity Recovered" value={`${capacityRecoveryPercent}%`} detail={`${remainingCapacity} seats remaining`} positive />
      </div>
      <div className="results-content-grid">
        <section className="results-table-card card">
          <div className="panel-heading"><div><Icon name="reservation" /><h2>Recent Reservations</h2></div><span>{allReservations.length} total</span></div>
          <div className="table-scroll">
            <table className="reservation-table">
              <thead><tr><th>Booking ID</th><th>Date & Time</th><th>Party Size</th><th>Revenue</th><th>Actual CPA</th><th>Status</th></tr></thead>
              <tbody>{allReservations.map((reservation) => (
                <tr key={reservation.id}><td><strong>{reservation.id}</strong></td><td>{activeCampaign.displayDate}<small>{reservation.time}</small></td><td>{reservation.partySize} people</td><td>{reservation.revenuePaise === null ? "Not measured" : formatMoney(reservation.revenuePaise)}</td><td>{reservation.cpaPaise === null ? "Not measured" : formatMoney(reservation.cpaPaise)}</td><td><Badge tone="success">{reservation.isDemoBooking ? "Demo transaction" : reservation.status ?? "Confirmed"}</Badge></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="view-all-row">View All Reservations <Icon name="arrow" /></div>
        </section>

        <aside className="results-analytics" id="analytics">
          <section className="analytics-card card">
            <div className="panel-heading"><div><Icon name="chart" /><h2>Revenue Recovered</h2></div><span>Campaign total</span></div>
            <strong className="chart-total">{formatMoney(revenuePaise)}</strong>
            <span className="chart-delta">{recoveredGuests} guests confirmed</span>
            <svg className="revenue-chart" viewBox="0 0 420 150" role="img" aria-label="Revenue recovered rises steadily across the campaign period">
              <path className="chart-grid" d="M10 120H410M10 80H410M10 40H410" />
              <path className="chart-area" d="M10 124 60 118 110 108 160 105 210 88 260 81 310 55 360 47 410 18 410 140 10 140Z" />
              <polyline className="chart-line" points="10,124 60,118 110,108 160,105 210,88 260,81 310,55 360,47 410,18" />
            </svg>
            <div className="chart-labels">{getPerformanceLabels(activeCampaign.date).map((label) => <span key={label}>{label}</span>)}</div>
          </section>
          <section className="analytics-card card">
            <div className="panel-heading"><div><Icon name="spark" /><h2>Campaign Performance</h2></div></div>
            <div className="capacity-row"><span><strong>Capacity Goal</strong><small>{recoveredGuests} of {performance?.initialUnusedCapacity ?? activeCampaign.unusedCapacity} seats recovered</small></span><b>{capacityRecoveryPercent}%</b></div>
            <div className="progress-track"><span style={{ width: `${capacityRecoveryPercent}%` }} /></div>
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
      campaign: {
        date: campaign.date,
        startTime: campaign.startTime,
        endTime: campaign.endTime,
        timezone: "Asia/Kolkata",
        unusedCapacity: campaign.unusedCapacity,
        targetReservations: campaign.targetReservations,
        maximumBudgetPaise: campaign.maximumBudgetPaise,
        maximumDiscountPercent: campaign.maximumDiscountPercent,
        maximumCpaPaise: campaign.maximumCpaPaise
      },
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
  if (response.ok && isNoEligibleLifecycle(payload)) {
    const reasons = [...new Set(payload.options?.flatMap((option) => option.rejectionReasons) ?? [])];
    throw new Error(
      `No package fits these constraints.${reasons.length ? ` ${reasons.join(" ")}` : ""}`
    );
  }
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

function formatReservationTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}
