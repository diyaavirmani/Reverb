"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { approvalModeLabel, type ReverbVenueProfile } from "../lib/venue/profile";
import { Brand } from "./app-shell";
import { Icon } from "./icons";

export function VenueBrief({ initialProfile }: { initialProfile: ReverbVenueProfile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/venue/brief/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Reverb could not approve this brief.");
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reverb could not approve this brief.");
      setSubmitting(false);
    }
  }

  function downloadMarkdown() {
    const body = briefMarkdown(profile);
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${profile.venue.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "venue"}-reverb-brief.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <main className="brief-page">
    <header className="brief-toolbar"><Brand compact /><div><button className="button button-secondary" type="button" onClick={() => window.print()}><Icon name="audit" /> Print / Save PDF</button><button className="button button-secondary" type="button" onClick={downloadMarkdown}><Icon name="arrow" /> Download Brief</button></div></header>
    <article className="venue-brief">
      <header className="brief-cover"><span className="brief-label">Venue Intelligence Brief</span><h1>{profile.venue.name}</h1><p>{profile.venue.businessType} · {profile.venue.city}</p><dl><div><dt>Analysis date</dt><dd>{formatAnalysisDate(profile.analysis.lastAnalyzedAt)}</dd></div><div><dt>Sources analyzed</dt><dd>{profile.analysis.sourceStatuses.filter((source) => source.status === "analyzed").length}</dd></div><div><dt>Owner review</dt><dd>{profile.briefApproved ? "Approved" : "Required"}</dd></div></dl></header>
      {!profile.venue.websiteUrl ? <div className="brief-notice"><Icon name="spark" /> No public website was provided. Reverb created the brief from the information you entered.</div> : null}
      <BriefSection number="01" title="Business Overview" source="Owner-entered data"><BriefField label="Venue name" value={profile.venue.name} onChange={(value) => setProfile({ ...profile, venue: { ...profile.venue, name: value } })} /><BriefField label="Business type" value={profile.venue.businessType} onChange={(value) => setProfile({ ...profile, venue: { ...profile.venue, businessType: value as ReverbVenueProfile["venue"]["businessType"] } })} /><BriefField label="Summary" area value={profile.brand.summary} onChange={(value) => setProfile({ ...profile, brand: { ...profile.brand, summary: value } })} /></BriefSection>
      <BriefSection number="02" title="Venue & Location" source="Owner-entered data"><BriefField label="City" value={profile.venue.city} onChange={(value) => setProfile({ ...profile, venue: { ...profile.venue, city: value } })} /><BriefField label="Address / Area" value={profile.venue.address} onChange={(value) => setProfile({ ...profile, venue: { ...profile.venue, address: value } })} /><BriefFact label="Capacity" value={`${profile.venue.capacity} seats`} /></BriefSection>
      <BriefSection number="03" title="Offering / Cuisine" source="Confirmed + editable"><BriefField label="Offering" area value={profile.brand.cuisineOrOffering} placeholder="Add the venue's main cuisine, menu, or service offering." onChange={(value) => setProfile({ ...profile, brand: { ...profile.brand, cuisineOrOffering: value } })} /></BriefSection>
      <BriefSection number="04" title="Brand Personality" source="Reverb inference"><BriefField label="Vibe" value={profile.brand.vibe} placeholder="Add or correct the venue vibe." onChange={(value) => setProfile({ ...profile, brand: { ...profile.brand, vibe: value } })} /><BriefField label="Campaign tone" value={profile.brand.tone} onChange={(value) => setProfile({ ...profile, brand: { ...profile.brand, tone: value as ReverbVenueProfile["brand"]["tone"] } })} /><BriefFact label="Keywords" value={profile.brand.keywords.join(", ") || "No recurring keywords identified"} /></BriefSection>
      <BriefSection number="05" title="Likely Audience" source="Reverb inference"><BriefField label="Audience" area value={profile.brand.audience} placeholder="Describe the audience Reverb should prioritize." onChange={(value) => setProfile({ ...profile, brand: { ...profile.brand, audience: value } })} /></BriefSection>
      <BriefSection number="06" title="Operating Profile" source="Owner-entered data"><BriefFact label="Open days" value={profile.operations.openingDays.join(", ")} /><BriefFact label="Default hours" value={`${profile.operations.openingHours.startTime}–${profile.operations.openingHours.endTime}`} /></BriefSection>
      <BriefSection number="07" title="Quiet Capacity Windows" source="Owner-entered data"><div className="brief-slot-list">{profile.operations.quietSlots.map((slot) => <div key={`${slot.day}-${slot.startTime}`}><strong>{slot.day}</strong><span>{slot.startTime}–{slot.endTime}</span><small>{slot.estimatedUnusedSeats} estimated unused seats</small></div>)}</div></BriefSection>
      <BriefSection number="08" title="Campaign Guardrails" source="Owner-entered data"><BriefFact label="Maximum budget" value={money(profile.campaignDefaults.maxBudgetPaise)} /><BriefFact label="Maximum discount" value={`${profile.campaignDefaults.maxDiscountPct}%`} /><BriefFact label="Maximum CPA" value={money(profile.campaignDefaults.maxCpaPaise)} /><BriefFact label="Approval mode" value={approvalModeLabel(profile.campaignDefaults.approvalMode)} /></BriefSection>
      <BriefSection number="09" title="Preferred Channels" source="Owner preference"><div className="brief-chip-list">{profile.campaignDefaults.preferredChannels.length ? profile.campaignDefaults.preferredChannels.map((channel) => <span key={channel}>{channel}</span>) : <p>No preferred channels selected.</p>}</div></BriefSection>
      <BriefSection number="10" title="Promotion Opportunities" source="Reverb inference"><p className="brief-copy">Prioritize owner-approved offers during the quiet windows above. Reverb will evaluate demo provider packages against the approved budget, discount, CPA, capacity, and provider-evidence rules before presenting a campaign.</p><InferenceList profile={profile} setProfile={setProfile} /></BriefSection>
      <BriefSection number="11" title="Evidence & Sources" source="Evidence"><div className="brief-sources">{profile.analysis.sourceStatuses.length ? profile.analysis.sourceStatuses.map((source) => <div key={source.url}><span className={`source-status ${source.status}`}>{source.status.replace("_", " ")}</span><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><small>{source.detail}</small></div>) : <p>Owner-entered details only.</p>}</div><div className="brief-facts">{profile.analysis.facts.map((fact) => <p key={fact}><Icon name="check" /> {fact}</p>)}</div></BriefSection>
      {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
      <footer className="brief-approval"><div><Icon name="shield" /><span><strong>Owner approval required</strong><small>Approve only after correcting or removing inaccurate information.</small></span></div><div><Link className="button button-secondary" href="/onboarding">Edit Venue</Link><button className="button button-primary" type="button" disabled={submitting} onClick={approve}>{submitting ? "Approving..." : "Approve Venue Brief"} {!submitting ? <Icon name="arrow" /> : null}</button></div></footer>
    </article>
  </main>;
}

function BriefSection({ number, title, source, children }: { number: string; title: string; source: string; children: React.ReactNode }) { return <section className="brief-section"><header><span>{number}</span><div><h2>{title}</h2><small>{source}</small></div></header><div className="brief-section-body">{children}</div></section>; }
function BriefField({ label, value, placeholder, area, onChange }: { label: string; value: string; placeholder?: string; area?: boolean; onChange: (value: string) => void }) { return <label className="brief-field"><span>{label}</span>{area ? <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</label>; }
function BriefFact({ label, value }: { label: string; value: string }) { return <div className="brief-fact"><span>{label}</span><strong>{value}</strong></div>; }
function InferenceList({ profile, setProfile }: { profile: ReverbVenueProfile; setProfile: (profile: ReverbVenueProfile) => void }) { return <div className="brief-inferences">{profile.analysis.inferences.map((inference, index) => <div key={`${inference}-${index}`}><span><small>Reverb inference</small>{inference}</span><button type="button" onClick={() => setProfile({ ...profile, analysis: { ...profile.analysis, inferences: profile.analysis.inferences.filter((_, inferenceIndex) => inferenceIndex !== index) } })}>Remove</button></div>)}</div>; }
function formatAnalysisDate(value?: string) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Not analyzed"; }
function money(paise: number) { return `₹${(paise / 100).toLocaleString("en-IN")}`; }
function briefMarkdown(profile: ReverbVenueProfile) { return `# Venue Intelligence Brief\n\n## ${profile.venue.name}\n\n- Business type: ${profile.venue.businessType}\n- Location: ${profile.venue.address}, ${profile.venue.city}\n- Capacity: ${profile.venue.capacity}\n- Brand summary: ${profile.brand.summary || "Not provided"}\n- Offering: ${profile.brand.cuisineOrOffering || "Not provided"}\n- Audience: ${profile.brand.audience || "Not provided"}\n- Tone: ${profile.brand.tone}\n\n## Quiet capacity\n${profile.operations.quietSlots.map((slot) => `- ${slot.day}, ${slot.startTime}-${slot.endTime}: ${slot.estimatedUnusedSeats} unused seats`).join("\n")}\n\n## Guardrails\n- Maximum budget: ${money(profile.campaignDefaults.maxBudgetPaise)}\n- Maximum discount: ${profile.campaignDefaults.maxDiscountPct}%\n- Maximum CPA: ${money(profile.campaignDefaults.maxCpaPaise)}\n- Approval: ${approvalModeLabel(profile.campaignDefaults.approvalMode)}\n\n## Evidence\n${profile.analysis.facts.map((fact) => `- ${fact}`).join("\n") || "- Owner-entered data only"}\n`; }
