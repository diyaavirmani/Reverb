import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink } from "./ui";

const links = [
  ["Home", "/"],
  ["Dashboard", "/dashboard"],
  ["Create Campaign", "/campaigns/new"],
  ["Recommendation", "/campaigns/demo"],
  ["Approval", "/approval"],
  ["Performance", "/performance"]
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="navbar">
        <div className="nav-inner">
          <Link href="/" className="brand" aria-label="Reverb Fill home">
            <span className="brand-mark">R</span>
            <span>
              Reverb Fill
              <span className="muted" style={{ display: "block", fontSize: "0.78rem", fontWeight: 600 }}>
                Fill quiet slots at local spots
              </span>
            </span>
          </Link>
          <nav className="nav-links" aria-label="Primary navigation">
            {links.map(([label, href]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
            <ButtonLink href="/campaigns/new">Run Demo</ButtonLink>
          </nav>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="footer-inner">
          <strong>Reverb Fill</strong>
          <span>Agentic commerce for local spots</span>
          <span>Verified providers · Controlled approval · Automated reporting</span>
        </div>
      </footer>
    </div>
  );
}
