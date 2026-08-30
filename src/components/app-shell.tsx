import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthenticatedAccount } from "./authenticated-account";

import { Icon, type IconName } from "./icons";

export type SidebarSection =
  | "overview"
  | "new"
  | "discovery"
  | "review"
  | "approval"
  | "reservations"
  | "analytics"
  | "audit"
  | "settings";

const primaryLinks: Array<{ label: string; href: string; icon: IconName; id: SidebarSection }> = [
  { label: "Overview", href: "/dashboard", icon: "home", id: "overview" },
  { label: "New Campaign", href: "/campaigns/new", icon: "plus", id: "new" },
  { label: "Discovery", href: "/campaigns/demo", icon: "search", id: "discovery" },
  { label: "Review", href: "/campaigns/demo?step=creative", icon: "review", id: "review" },
  { label: "Approval", href: "/approval", icon: "approval", id: "approval" },
  { label: "Reservations", href: "/performance", icon: "reservation", id: "reservations" }
];

const secondaryLinks: Array<{ label: string; href: string; icon: IconName; id: SidebarSection }> = [
  { label: "Analytics", href: "/performance#analytics", icon: "chart", id: "analytics" },
  { label: "Audit Trail", href: "/dashboard#audit", icon: "audit", id: "audit" },
  { label: "Settings", href: "/dashboard#settings", icon: "settings", id: "settings" }
];

const applicationLinks = [
  ["Overview", "/dashboard"],
  ["Campaigns", "/campaigns/new"],
  ["Discovery", "/campaigns/demo"],
  ["Approval", "/approval"],
  ["Reservations", "/performance"],
  ["Analytics", "/performance#analytics"]
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="site-root">{children}</div>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand${compact ? " brand-compact" : ""}`} aria-label="Reverb home">
      <Image className="brand-wordmark" src="/images/reverb-wordmark.png" alt="Reverb" width={181} height={60} />
    </Link>
  );
}

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-nav">
        <Brand />
        <nav className="marketing-links" aria-label="Marketing navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#results">Results</a>
          <a href="#about">About</a>
        </nav>
      </div>
    </header>
  );
}

export function ApplicationHeader({ current }: { current?: string }) {
  return (
    <header className="application-header">
      <Brand />
      <nav className="application-links" aria-label="Application navigation">
        {applicationLinks.map(([label, href]) => (
          <Link className={current === label ? "active" : ""} href={href} key={href}>
            {label}
          </Link>
        ))}
      </nav>
      <AuthenticatedAccount placement="header" venue={"Caf\u00e9 Aura"} />
    </header>
  );
}

export function AppSidebar({ active }: { active: SidebarSection }) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <Brand />
      </div>
      <nav className="sidebar-nav" aria-label="Campaign navigation">
        {primaryLinks.map((item) => (
          <SidebarLink {...item} active={active === item.id} key={item.id} />
        ))}
        <span className="sidebar-section-label">Insights</span>
        {secondaryLinks.map((item) => (
          <SidebarLink {...item} active={active === item.id} key={item.id} />
        ))}
      </nav>
      <AuthenticatedAccount placement="sidebar" venue={"Caf\u00e9 Aura"} />
    </aside>
  );
}

export function SidebarLayout({ active, children }: { active: SidebarSection; children: ReactNode }) {
  return (
    <div className="app-layout">
      <AppSidebar active={active} />
      <main className="app-main">{children}</main>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer" id="about">
      <div>
        <Brand compact />
        <span>Controlled campaigns for underused local capacity.</span>
      </div>
      <span>Fixture-first demo · No external services required</span>
    </footer>
  );
}

function SidebarLink({ label, href, icon, active }: { label: string; href: string; icon: IconName; active: boolean }) {
  return (
    <Link className={`sidebar-link${active ? " active" : ""}`} href={href} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}
