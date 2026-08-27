import Link from "next/link";
import type { ReactNode } from "react";

type PropsWithChildren = {
  children: ReactNode;
};

export function PageContainer({ children }: PropsWithChildren) {
  return <main className="page">{children}</main>;
}

export function Card({ children, className = "" }: PropsWithChildren & { className?: string }) {
  return <section className={`card card-pad ${className}`}>{children}</section>;
}

export function Badge({
  children,
  tone = "default"
}: PropsWithChildren & { tone?: "default" | "success" | "warning" | "danger" }) {
  const className =
    tone === "success"
      ? "badge badge-success"
      : tone === "warning"
        ? "badge badge-warning"
        : tone === "danger"
          ? "badge badge-danger"
          : "badge";
  return <span className={className}>{children}</span>;
}

export function ButtonLink({
  href,
  children,
  variant = "primary"
}: PropsWithChildren & { href: string; variant?: "primary" | "secondary" }) {
  return (
    <Link className={`button button-${variant}`} href={href}>
      {children}
    </Link>
  );
}

export function MetricCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="metric">
      <p className="muted">{label}</p>
      <div className="metric-value">{value}</div>
      <p className="muted" style={{ marginTop: 12 }}>
        {detail}
      </p>
    </Card>
  );
}

export function TimelineStep({
  index,
  title,
  detail
}: {
  index: number;
  title: string;
  detail?: string;
}) {
  return (
    <div className="timeline-step">
      <div className="timeline-dot">{index}</div>
      <div>
        <strong>{title}</strong>
        {detail ? <p className="muted">{detail}</p> : null}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes("active")
    ? "success"
    : normalized.includes("rejected") || normalized.includes("blocked")
      ? "danger"
      : normalized.includes("approval") || normalized.includes("demo")
        ? "warning"
        : "default";
  return <Badge tone={tone}>{status}</Badge>;
}
