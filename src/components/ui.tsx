import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "./icons";

type PropsWithChildren = { children: ReactNode };

export function PageContainer({ children, className = "" }: PropsWithChildren & { className?: string }) {
  return <main className={`page-container ${className}`}>{children}</main>;
}

export function Card({ children, className = "" }: PropsWithChildren & { className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Badge({
  children,
  tone = "default",
  dot = false
}: PropsWithChildren & {
  tone?: "default" | "success" | "warning" | "danger" | "neutral";
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = ""
}: PropsWithChildren & {
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Link className={`button button-${variant} ${className}`} href={href}>
      {children}
    </Link>
  );
}

export function ActionButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  trend,
  className = ""
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: IconName;
  trend?: "up" | "down";
  className?: string;
}) {
  return (
    <Card className={`metric-card ${className}`}>
      <div className="metric-topline">
        {icon ? <span className="icon-tile"><Icon name={icon} /></span> : null}
        <span className="metric-label">{label}</span>
      </div>
      <strong className={`metric-value${trend ? ` metric-${trend}` : ""}`}>{value}</strong>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes("active") || normalized.includes("selected") || normalized.includes("verified")
    ? "success"
    : normalized.includes("rejected") || normalized.includes("blocked")
      ? "danger"
      : normalized.includes("approval") || normalized.includes("demo")
        ? "warning"
        : "default";
  return <Badge tone={tone} dot>{status}</Badge>;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow ? <span className="breadcrumb">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function InfoPanel({
  icon,
  title,
  children,
  tone = "blue"
}: PropsWithChildren & { icon: IconName; title: string; tone?: "blue" | "green" }) {
  return (
    <div className={`info-panel info-panel-${tone}`}>
      <span className="info-icon"><Icon name={icon} /></span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function WorkflowProgress({ active }: { active: "discovery" | "creative" | "approval" | "results" }) {
  const steps = [
    ["discovery", "Provider Discovery"],
    ["creative", "Creative Review"],
    ["approval", "Campaign Approval"],
    ["results", "Results"]
  ] as const;
  const activeIndex = steps.findIndex(([id]) => id === active);

  return (
    <ol className="workflow-progress" aria-label="Campaign progress">
      {steps.map(([id, label], index) => (
        <li className={index < activeIndex ? "complete" : index === activeIndex ? "current" : ""} key={id}>
          <span>{index < activeIndex ? <Icon name="check" /> : index + 1}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

export function SummaryStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="summary-stat">
      <span className="summary-icon"><Icon name={icon} /></span>
      <span><small>{label}</small><strong>{value}</strong></span>
    </div>
  );
}
