"use client";

import { useMemo, useState } from "react";

import type { DemoLifecycleState } from "./demo-state";
import { Icon } from "./icons";
import { Badge } from "./ui";

export function AgentActivity({ lifecycle, compact = false }: { lifecycle: DemoLifecycleState | null; compact?: boolean }) {
  const [view, setView] = useState<"product" | "inspector">("product");
  const rawTrace = lifecycle?.executionTrace;
  const trace = useMemo(() => rawTrace ?? [], [rawTrace]);
  const [selectedId, setSelectedId] = useState<string | null>(trace[0]?.id ?? null);
  const selected = useMemo(
    () => trace.find((event) => event.id === selectedId) ?? trace[0] ?? null,
    [selectedId, trace]
  );

  return (
    <section className={`agent-activity card${compact ? " compact" : ""}`} id="audit">
      <header className="panel-heading">
        <div><Icon name="spark" /><span><h2>Agent Activity</h2><small>Backend campaign execution</small></span></div>
        <div className="activity-view-toggle" aria-label="Activity view">
          <button className={view === "product" ? "active" : ""} type="button" onClick={() => setView("product")}>Product View</button>
          <button className={view === "inspector" ? "active" : ""} type="button" onClick={() => setView("inspector")}>Inspector</button>
        </div>
      </header>
      {!lifecycle ? (
        <div className="activity-empty"><span><Icon name="spark" /></span><div><strong>No campaign run yet</strong><p>Create a campaign to see provider evaluation, policy checks, approval, and results here.</p></div></div>
      ) : view === "product" ? (
        <div className="activity-product-view">
          <div className="activity-timeline">
            {trace.map((event) => (
              <button className={`${event.status}${selected?.id === event.id ? " selected" : ""}`} type="button" key={event.id} onClick={() => setSelectedId(event.id)}>
                <i>{event.status === "complete" ? <Icon name="check" /> : event.status === "failed" ? "!" : <span />}</i>
                <span><strong>{friendlyStep(event.step)}</strong><small>{event.summary}</small></span>
                {event.durationMs !== null ? <em>{event.durationMs} ms</em> : <em>Waiting</em>}
              </button>
            ))}
          </div>
          {selected ? <div className="activity-detail"><Badge tone={selected.status === "complete" ? "success" : selected.status === "failed" ? "danger" : "warning"}>{selected.status}</Badge><h3>{selected.summary}</h3><dl><div><dt>Important input</dt><dd>{selected.inputSummary}</dd></div><div><dt>Result</dt><dd>{selected.outputSummary ?? "Owner action is required before this step can continue."}</dd></div></dl></div> : null}
          <PolicyGrid lifecycle={lifecycle} />
        </div>
      ) : (
        <div className="activity-inspector">
          <dl>
            <div><dt>Run ID</dt><dd>{lifecycle.runId ?? `run_${lifecycle.campaignId}`}</dd></div>
            <div><dt>Environment</dt><dd>Fixture</dd></div>
            <div><dt>Campaign</dt><dd>{lifecycle.campaignId}</dd></div>
            <div><dt>Current status</dt><dd>{lifecycle.finalStatus}</dd></div>
            <div><dt>API endpoint</dt><dd>POST /api/demo/lifecycle</dd></div>
            <div><dt>Audit events</dt><dd>{lifecycle.auditEventCount}</dd></div>
          </dl>
          <PolicyGrid lifecycle={lifecycle} />
          <p>No credentials, raw provider payloads, or private user metadata are included in this trace.</p>
        </div>
      )}
    </section>
  );
}

function PolicyGrid({ lifecycle }: { lifecycle: DemoLifecycleState }) {
  const checks = lifecycle.policyChecks ?? [];
  if (!checks.length) return null;
  return <div className="policy-trace"><h3>Policy checks</h3><div>{checks.map((check) => <span className={check.status.toLowerCase()} key={check.key}><i>{check.status === "PASS" ? <Icon name="check" /> : check.status === "FAIL" ? "!" : "…"}</i><b>{check.label}</b><em>{check.status}</em><small>{formatPaiseDetail(check.detail)}</small></span>)}</div></div>;
}

function friendlyStep(step: string) {
  return step.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatPaiseDetail(detail: string) {
  return detail.replace(/(\d+) paise/g, (_, value: string) => `₹${(Number(value) / 100).toLocaleString("en-IN")}`);
}
