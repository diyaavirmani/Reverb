"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  approvalModes,
  businessTypes,
  channelNames,
  emptyReverbProfile,
  weekdays,
  type ReverbVenueProfile,
  type ReverbWeekday
} from "../lib/venue/profile";
import { Brand } from "./app-shell";
import { Icon } from "./icons";

type OnboardingFlowProps = { initialProfile: ReverbVenueProfile | null };

const stepLabels = ["Business", "Presence", "Operations", "Guardrails", "Control"];

export function OnboardingFlow({ initialProfile }: OnboardingFlowProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<ReverbVenueProfile>(initialProfile ?? emptyReverbProfile);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);

  function next() {
    const issue = validateStep(step, profile);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setStep((current) => Math.min(stepLabels.length - 1, current + 1));
  }

  async function analyze() {
    const issue = validateStep(step, profile);
    if (issue) {
      setError(issue);
      return;
    }
    setSubmitting(true);
    setError(null);
    setAnalysisFailed(false);
    try {
      const response = await fetch("/api/venue/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile)
      });
      const payload = await response.json() as { profile?: ReverbVenueProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error ?? "Reverb could not analyze this venue.");
      router.push("/venue/brief");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reverb could not analyze this venue.");
      setAnalysisFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function continueWithEnteredDetails() {
    setSubmitting(true);
    setError(null);
    const sourceUrls = profile.venue.websiteUrl ? [profile.venue.websiteUrl] : [];
    const fallback: ReverbVenueProfile = {
      ...profile,
      onboardingComplete: false,
      briefApproved: false,
      brand: {
        ...profile.brand,
        summary: profile.brand.summary || `A ${profile.venue.businessType.toLowerCase()} in ${profile.venue.city}.`
      },
      analysis: {
        lastAnalyzedAt: new Date().toISOString(),
        sourceUrls,
        sourceStatuses: sourceUrls.map((url) => ({
          url,
          status: "unavailable" as const,
          detail: "Source unavailable for automatic analysis."
        })),
        facts: [
          `Owner-entered venue: ${profile.venue.name}`,
          `Owner-entered business type: ${profile.venue.businessType}`,
          `Owner-entered location: ${profile.venue.address}, ${profile.venue.city}`
        ],
        inferences: []
      }
    };
    try {
      const response = await fetch("/api/venue/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fallback)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Reverb could not save the venue profile.");
      router.push("/venue/brief");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reverb could not save the venue profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-brand"><Brand compact /></header>
      <div className="onboarding-frame">
        <div className="onboarding-intro">
          <span className="onboarding-kicker">Venue setup</span>
          <h1>Tell Reverb about your venue</h1>
          <p>Reverb uses your venue profile and business constraints to understand unused capacity and prepare relevant campaigns.</p>
        </div>
        <ol className="onboarding-progress" aria-label="Onboarding progress">
          {stepLabels.map((label, index) => (
            <li className={index === step ? "active" : index < step ? "complete" : ""} key={label}>
              <span>{index < step ? <Icon name="check" /> : index + 1}</span><small>{label}</small>
            </li>
          ))}
        </ol>
        <section className="onboarding-card card">
          {step === 0 ? <BusinessStep profile={profile} setProfile={setProfile} /> : null}
          {step === 1 ? <PresenceStep profile={profile} setProfile={setProfile} /> : null}
          {step === 2 ? <OperationsStep profile={profile} setProfile={setProfile} /> : null}
          {step === 3 ? <GuardrailsStep profile={profile} setProfile={setProfile} /> : null}
          {step === 4 ? <ControlStep profile={profile} setProfile={setProfile} /> : null}
          {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
          {analysisFailed ? (
            <button className="button button-secondary" type="button" disabled={submitting} onClick={continueWithEnteredDetails}>
              Continue with entered details
            </button>
          ) : null}
          <footer className="onboarding-actions">
            <button className="button button-secondary" type="button" disabled={step === 0 || submitting} onClick={() => { setError(null); setStep((current) => current - 1); }}>Back</button>
            {step < stepLabels.length - 1 ? (
              <button className="button button-primary" type="button" onClick={next}>Continue <Icon name="arrow" /></button>
            ) : (
              <button className="button button-primary" type="button" disabled={submitting} onClick={analyze}>
                {submitting ? "Analyzing venue..." : "Analyze Venue"} {!submitting ? <Icon name="spark" /> : null}
              </button>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}

function BusinessStep({ profile, setProfile }: StepProps) {
  return <><StepHeading number="01" title="Business basics" detail="Start with the operating identity Reverb should use." /><div className="onboarding-grid">
    <Field label="Venue Name" wide><input value={profile.venue.name} onChange={(event) => setProfile(updateVenue(profile, "name", event.target.value))} required /></Field>
    <Field label="Business Type"><select value={profile.venue.businessType} onChange={(event) => setProfile(updateVenue(profile, "businessType", event.target.value as ReverbVenueProfile["venue"]["businessType"]))}>{businessTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
    <Field label="City"><input value={profile.venue.city} onChange={(event) => setProfile(updateVenue(profile, "city", event.target.value))} required /></Field>
    <Field label="Address / Area" wide><input value={profile.venue.address} onChange={(event) => setProfile(updateVenue(profile, "address", event.target.value))} required /></Field>
    <Field label="Timezone"><input value={profile.venue.timezone} onChange={(event) => setProfile(updateVenue(profile, "timezone", event.target.value))} /></Field>
    <Field label="Seating Capacity"><input type="number" min="1" value={profile.venue.capacity} onChange={(event) => setProfile(updateVenue(profile, "capacity", Number(event.target.value)))} /></Field>
    <Field label="Business phone (optional)" wide><input type="tel" value={profile.venue.phone ?? ""} onChange={(event) => setProfile(updateVenue(profile, "phone", event.target.value))} /></Field>
  </div></>;
}

function PresenceStep({ profile, setProfile }: StepProps) {
  const urls: Array<[keyof ReverbVenueProfile["venue"], string, string]> = [
    ["websiteUrl", "Website URL", "https://yourvenue.example"],
    ["googleBusinessUrl", "Google Business / Maps URL", "https://maps.google.com/..."],
    ["bookingUrl", "Booking / directory URL", "https://booking.example/..."],
    ["instagramUrl", "Instagram URL", "https://instagram.com/..."],
    ["facebookUrl", "Facebook URL", "https://facebook.com/..."],
    ["otherUrl", "Other relevant URL", "https://..."]
  ];
  return <><StepHeading number="02" title="Online presence" detail="Add public sources that help Reverb understand the venue." />
    <div className="onboarding-note"><Icon name="spark" /><p>Reverb can automatically analyze public information from your own website. Other links may be used as references where automated access is unavailable.</p></div>
    <div className="onboarding-grid">{urls.map(([key, label, placeholder]) => <Field label={label} wide key={key}><input type="url" placeholder={placeholder} value={String(profile.venue[key] ?? "")} onChange={(event) => setProfile(updateVenue(profile, key, event.target.value))} /></Field>)}</div>
  </>;
}

function OperationsStep({ profile, setProfile }: StepProps) {
  function toggleDay(day: ReverbWeekday) {
    const openingDays = profile.operations.openingDays.includes(day)
      ? profile.operations.openingDays.filter((value) => value !== day)
      : [...profile.operations.openingDays, day];
    setProfile({ ...profile, operations: { ...profile.operations, openingDays } });
  }
  function updateSlot(index: number, values: Partial<ReverbVenueProfile["operations"]["quietSlots"][number]>) {
    const quietSlots = profile.operations.quietSlots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...values } : slot);
    setProfile({ ...profile, operations: { ...profile.operations, quietSlots } });
  }
  return <><StepHeading number="03" title="Operating profile" detail="Define when you operate and where unused capacity tends to appear." />
    <div className="field"><span>Which days are you open?</span><div className="day-picker">{weekdays.map((day) => <button className={profile.operations.openingDays.includes(day) ? "active" : ""} type="button" key={day} onClick={() => toggleDay(day)}>{day.slice(0, 3)}</button>)}</div></div>
    <div className="onboarding-grid compact"><Field label="Default opening time"><input type="time" value={profile.operations.openingHours.startTime} onChange={(event) => setProfile({ ...profile, operations: { ...profile.operations, openingHours: { ...profile.operations.openingHours, startTime: event.target.value } } })} /></Field><Field label="Default closing time"><input type="time" value={profile.operations.openingHours.endTime} onChange={(event) => setProfile({ ...profile, operations: { ...profile.operations, openingHours: { ...profile.operations.openingHours, endTime: event.target.value } } })} /></Field></div>
    <div className="quiet-slot-heading"><div><h3>When is your venue usually quiet?</h3><p>Add one or more recurring capacity windows.</p></div></div>
    <div className="quiet-slot-list">{profile.operations.quietSlots.map((slot, index) => <div className="quiet-slot-row" key={`${index}-${slot.day}`}>
      <select aria-label="Quiet day" value={slot.day} onChange={(event) => updateSlot(index, { day: event.target.value as ReverbWeekday })}>{weekdays.map((day) => <option key={day}>{day}</option>)}</select>
      <input aria-label="Quiet slot start" type="time" value={slot.startTime} onChange={(event) => updateSlot(index, { startTime: event.target.value })} />
      <input aria-label="Quiet slot end" type="time" value={slot.endTime} onChange={(event) => updateSlot(index, { endTime: event.target.value })} />
      <input aria-label="Estimated unused seats" type="number" min="1" value={slot.estimatedUnusedSeats} onChange={(event) => updateSlot(index, { estimatedUnusedSeats: Number(event.target.value) })} />
      {profile.operations.quietSlots.length > 1 ? <button className="icon-button" aria-label="Remove quiet slot" type="button" onClick={() => setProfile({ ...profile, operations: { ...profile.operations, quietSlots: profile.operations.quietSlots.filter((_, slotIndex) => slotIndex !== index) } })}>×</button> : null}
    </div>)}</div>
    <button className="quiet-slot-add" type="button" onClick={() => setProfile({ ...profile, operations: { ...profile.operations, quietSlots: [...profile.operations.quietSlots, { day: "Tuesday", startTime: "15:00", endTime: "18:00", estimatedUnusedSeats: 8 }] } })}>+ Add another quiet slot</button>
  </>;
}

function GuardrailsStep({ profile, setProfile }: StepProps) {
  return <><StepHeading number="04" title="Business guardrails" detail="Set default limits. Every recommendation must stay inside them." /><div className="onboarding-grid">
    <Field label="Default maximum campaign budget"><span className="input-prefix"><b>₹</b><input type="number" min="1" value={profile.campaignDefaults.maxBudgetPaise / 100} onChange={(event) => setProfile(updateDefaults(profile, "maxBudgetPaise", Number(event.target.value) * 100))} /></span></Field>
    <Field label="Default maximum discount"><span className="input-suffix"><input type="number" min="0" max="100" value={profile.campaignDefaults.maxDiscountPct} onChange={(event) => setProfile(updateDefaults(profile, "maxDiscountPct", Number(event.target.value)))} /><b>%</b></span></Field>
    <Field label="Maximum cost per reservation" wide><span className="input-prefix"><b>₹</b><input type="number" min="1" value={profile.campaignDefaults.maxCpaPaise / 100} onChange={(event) => setProfile(updateDefaults(profile, "maxCpaPaise", Number(event.target.value) * 100))} /></span></Field>
  </div><div className="onboarding-note success"><Icon name="shield" /><p>These owner-supplied values feed Reverb&apos;s deterministic budget, discount, and CPA checks.</p></div></>;
}

function ControlStep({ profile, setProfile }: StepProps) {
  return <><StepHeading number="05" title="Approval and channels" detail="Choose what Reverb may prepare and where campaigns may eventually run." />
    <div className="approval-choice-list">{approvalModes.map((mode) => <label className={profile.campaignDefaults.approvalMode === mode ? "active" : ""} key={mode}><input type="radio" name="approvalMode" checked={profile.campaignDefaults.approvalMode === mode} onChange={() => setProfile(updateDefaults(profile, "approvalMode", mode))} /><span><strong>{approvalLabel(mode)}</strong><small>{mode === "ALWAYS_APPROVE" ? "Recommended for MVP: Reverb prepares, you launch." : "This preference can be changed later."}</small></span></label>)}</div>
    <div className="channel-preferences"><h3>Preferred channels</h3><p>Preferences do not connect a publisher.</p><div>{channelNames.map((channel) => <label key={channel}><input type="checkbox" checked={profile.campaignDefaults.preferredChannels.includes(channel)} onChange={() => { const current = profile.campaignDefaults.preferredChannels; setProfile(updateDefaults(profile, "preferredChannels", current.includes(channel) ? current.filter((value) => value !== channel) : [...current, channel])); }} /><span>{channel}</span></label>)}</div></div>
  </>;
}

type StepProps = { profile: ReverbVenueProfile; setProfile: (profile: ReverbVenueProfile) => void };
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`field${wide ? " field-wide" : ""}`}><span>{label}</span>{children}</label>; }
function StepHeading({ number, title, detail }: { number: string; title: string; detail: string }) { return <header className="onboarding-step-heading"><span>{number}</span><div><h2>{title}</h2><p>{detail}</p></div></header>; }
function updateVenue<K extends keyof ReverbVenueProfile["venue"]>(profile: ReverbVenueProfile, key: K, value: ReverbVenueProfile["venue"][K]): ReverbVenueProfile { return { ...profile, venue: { ...profile.venue, [key]: value } }; }
function updateDefaults<K extends keyof ReverbVenueProfile["campaignDefaults"]>(profile: ReverbVenueProfile, key: K, value: ReverbVenueProfile["campaignDefaults"][K]): ReverbVenueProfile { return { ...profile, campaignDefaults: { ...profile.campaignDefaults, [key]: value } }; }
function approvalLabel(mode: (typeof approvalModes)[number]) { if (mode === "DRAFT_ONLY") return "Draft campaigns only"; if (mode === "APPROVED_RECURRING_RULES") return "Allow approved recurring campaign rules"; return "Prepare campaigns, always ask before launch"; }
function validateStep(step: number, profile: ReverbVenueProfile): string | null {
  if (step === 0 && (!profile.venue.name.trim() || !profile.venue.city.trim() || !profile.venue.address.trim() || profile.venue.capacity < 1)) return "Enter the venue name, city, address, and seating capacity.";
  if (step === 2 && (profile.operations.openingDays.length === 0 || profile.operations.quietSlots.length === 0)) return "Choose at least one opening day and one quiet capacity window.";
  if (step === 3 && (profile.campaignDefaults.maxBudgetPaise < 100 || profile.campaignDefaults.maxCpaPaise < 100)) return "Budget and maximum cost per reservation must be greater than zero.";
  return null;
}
