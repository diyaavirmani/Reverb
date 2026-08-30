import type { ReactNode } from "react";

import { Brand } from "./app-shell";

export function AuthShell({ children, title, description }: { children: ReactNode; title: string; description: string }) {
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <Brand />
        <header>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <div className="auth-provider-panel">{children}</div>
      </div>
    </main>
  );
}