"use client";

import { useState } from "react";

import { demoCampaign } from "./demo-data";

export function CampaignForm() {
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    setSubmitting(true);
    window.localStorage.setItem(
      "reverb-demo-campaign",
      JSON.stringify({
        spot: demoCampaign.spot,
        unusedCapacity: demoCampaign.unusedCapacity,
        targetReservations: demoCampaign.targetReservations,
        maximumBudgetPaise: demoCampaign.maximumBudgetPaise,
        maximumDiscountPercent: demoCampaign.maximumDiscountPercent,
        maximumCpaPaise: demoCampaign.maximumCpaPaise
      })
    );
    window.location.href = "/campaigns/demo";
  }

  return (
    <form
      className="card card-pad stack"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="form-grid">
        <label className="field">
          <span>Spot</span>
          <select defaultValue={demoCampaign.spot}>
            <option>{demoCampaign.spot}</option>
          </select>
        </label>
        <label className="field">
          <span>Unused capacity</span>
          <input type="number" min="1" defaultValue={demoCampaign.unusedCapacity} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" defaultValue={demoCampaign.date} />
        </label>
        <label className="field">
          <span>Start time</span>
          <input type="time" defaultValue={demoCampaign.startTime} />
        </label>
        <label className="field">
          <span>End time</span>
          <input type="time" defaultValue={demoCampaign.endTime} />
        </label>
        <label className="field">
          <span>Target reservations</span>
          <input type="number" min="1" defaultValue={demoCampaign.targetReservations} />
        </label>
        <label className="field">
          <span>Maximum budget</span>
          <input type="number" min="1" defaultValue={demoCampaign.maximumBudgetPaise / 100} />
        </label>
        <label className="field">
          <span>Maximum discount</span>
          <input type="number" min="0" max="100" defaultValue={demoCampaign.maximumDiscountPercent} />
        </label>
        <label className="field">
          <span>Maximum CPA</span>
          <input type="number" min="1" defaultValue={demoCampaign.maximumCpaPaise / 100} />
        </label>
      </div>
      <div className="row">
        <p className="muted">Fixture mode uses deterministic local records and does not require paid provider keys.</p>
        <button className="button button-primary" type="submit" disabled={submitting}>
          Find Best Campaign
        </button>
      </div>
    </form>
  );
}
