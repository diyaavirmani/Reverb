"use client";

import { useState } from "react";

type DemoState = {
  campaignId: string;
  finalStatus: string;
  merchantOrderId: string;
  reservationId: string;
  publicActivationUrl: string;
  performance: {
    confirmedReservationCount: number;
    confirmedGuestCount: number;
    remainingCapacity: number;
    capacityRecoveryPercent: number;
    actualCostPerReservationPaise: number | null;
    estimatedRevenueRecoveredPaise: number;
  };
};

export function DemoLauncher() {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Demo launch failed.");
      }
      window.localStorage.setItem("reverb-demo-lifecycle", JSON.stringify(payload));
      setState(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo launch failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <button className="button button-primary" onClick={launch} disabled={loading}>
        {loading ? "Launching fixture campaign..." : "Approve & Launch"}
      </button>
      <p className="muted">Demo transaction only. No real money moves in fixture mode.</p>
      {state ? (
        <div className="card card-pad stack">
          <strong>Campaign Active</strong>
          <p className="muted">Campaign ID: {state.campaignId}</p>
          <p className="muted">Merchant order: {state.merchantOrderId}</p>
          <p className="muted">Reservation: {state.reservationId}</p>
        </div>
      ) : null}
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
    </div>
  );
}

export function DemoReservationAction() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function addReservation() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/demo/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservation: {
            customerName: "Demo Guest",
            customerContact: "demo@example.test",
            partySize: 2,
            reservationTime: "2026-08-07T14:00:00.000Z",
            trackingCode: `demo_ui_${Date.now()}`,
            isDemoBooking: true
          }
        })
      });
      const payload = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Reservation failed.");
      }
      window.localStorage.setItem("reverb-demo-lifecycle", JSON.stringify(payload));
      setMessage("Demo reservation accepted and visibly labelled.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Reservation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <button className="button button-primary" onClick={addReservation} disabled={loading}>
        {loading ? "Adding reservation..." : "Add Demo Reservation"}
      </button>
      <p className="muted">Demo booking label is retained in fixture records.</p>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
