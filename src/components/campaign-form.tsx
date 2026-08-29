"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import type { DemoCampaign } from "./demo-data";
import { getDemoTodayDate, isPastDemoDate, isValidDemoDate } from "./demo-date";
import { isCompletedLifecycle, loadDemoCampaignDraft, persistDemoSnapshot, type DemoCampaignDraft } from "./demo-state";
import { Icon } from "./icons";

type CampaignFormProps = {
  campaign: DemoCampaign;
  initialCaption: string;
};

export function CampaignForm({ campaign, initialCaption }: CampaignFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(campaign.date);
  const [minimumDate, setMinimumDate] = useState<string | undefined>(undefined);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const stored = loadDemoCampaignDraft();
      if (stored) setDate(stored.date);
      setMinimumDate(getDemoTodayDate());
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const values = new FormData(event.currentTarget);
    const draft: DemoCampaignDraft = {
      spot: String(values.get("spot")),
      unusedCapacity: Number(values.get("unusedCapacity")),
      date: String(values.get("date")),
      startTime: String(values.get("startTime")),
      endTime: String(values.get("endTime")),
      targetReservations: Number(values.get("targetReservations")),
      maximumBudgetPaise: Number(values.get("maximumBudget")) * 100,
      maximumDiscountPercent: Number(values.get("maximumDiscount")),
      maximumCpaPaise: Number(values.get("maximumCpa")) * 100
    };

    if (!isValidDemoDate(draft.date) || isPastDemoDate(draft.date)) {
      setError("Choose today or a future campaign date.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/demo/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerMessage: `Fill ${draft.date} from ${draft.startTime} to ${draft.endTime} with ${draft.unusedCapacity} unused seats, target ${draft.targetReservations} reservations, budget Rs ${draft.maximumBudgetPaise / 100}, maximum discount ${draft.maximumDiscountPercent}%, and maximum CPA Rs ${draft.maximumCpaPaise / 100}.`,
          reservation: {
            customerName: "Demo Guest",
            customerContact: "demo@example.test",
            partySize: 2,
            trackingCode: `demo_campaign_${draft.date.replaceAll("-", "")}`,
            isDemoBooking: true
          }
        })
      });
      const payload = (await response.json()) as unknown;

      if (!response.ok || !isCompletedLifecycle(payload)) {
        const message = payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : "Reverb could not prepare this demo campaign. Please try again.";
        throw new Error(message);
      }

      persistDemoSnapshot({
        version: 1,
        campaign: draft,
        lifecycle: payload,
        stage: "discovery",
        creativeCaption: initialCaption,
        approved: false,
        addedReservations: []
      });
      router.push("/campaigns/demo");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reverb could not prepare this demo campaign.");
      setSubmitting(false);
    }
  }

  return (
    <form className="campaign-form card" onSubmit={submit}>
      <div className="form-section-heading">
        <span className="icon-tile"><Icon name="store" /></span>
        <div>
          <h2>Campaign request</h2>
          <p>The campaign will be evaluated against every limit below.</p>
        </div>
      </div>
      <div className="form-grid">
        <label className="field field-wide">
          <span>Venue</span>
          <select name="spot" defaultValue={campaign.spot}>
            <option>{campaign.spot}</option>
          </select>
        </label>
        <label className="field">
          <span>Unused Seats</span>
          <input name="unusedCapacity" type="number" min="1" defaultValue={campaign.unusedCapacity} required />
        </label>
        <label className="field">
          <span>Target Reservations</span>
          <input name="targetReservations" type="number" min="1" defaultValue={campaign.targetReservations} required />
        </label>
        <label className="field field-wide">
          <span>Campaign Date</span>
          <input name="date" type="date" min={minimumDate} value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="field">
          <span>Start Time</span>
          <input name="startTime" type="time" defaultValue={campaign.startTime} required />
        </label>
        <label className="field">
          <span>End Time</span>
          <input name="endTime" type="time" defaultValue={campaign.endTime} required />
        </label>
        <label className="field">
          <span>Budget Limit</span>
          <span className="input-prefix"><b>₹</b><input name="maximumBudget" type="number" min="1" defaultValue={campaign.maximumBudgetPaise / 100} required /></span>
        </label>
        <label className="field">
          <span>Maximum Discount</span>
          <span className="input-suffix"><input name="maximumDiscount" type="number" min="0" max="100" defaultValue={campaign.maximumDiscountPercent} required /><b>%</b></span>
        </label>
        <label className="field">
          <span>Maximum CPA</span>
          <span className="input-prefix"><b>₹</b><input name="maximumCpa" type="number" min="1" defaultValue={campaign.maximumCpaPaise / 100} required /></span>
        </label>
      </div>
      <div className="form-footer">
        <p><Icon name="shield" /> Deterministic checks protect budget, CPA, discount, and provider eligibility.</p>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? "Evaluating providers…" : "Find Best Campaign"}
          {!submitting ? <Icon name="arrow" /> : null}
        </button>
      </div>
      {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
    </form>
  );
}
