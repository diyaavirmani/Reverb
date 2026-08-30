import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { hasReverbPermission, resolveReverbRole } from "../src/lib/auth/roles";

const protectedPages = {
  dashboard: ["src/app/dashboard/page.tsx", "dashboard:read"],
  createCampaign: ["src/app/campaigns/new/page.tsx", "campaign:create"],
  campaignReview: ["src/app/campaigns/demo/page.tsx", "campaign:review"],
  approval: ["src/app/approval/page.tsx", "campaign:approve"],
  performance: ["src/app/performance/page.tsx", "analytics:read"]
} as const;

describe("Reverb authorization roles", () => {
  it("treats a new user without role metadata as OWNER", () => {
    expect(resolveReverbRole(undefined)).toBe("OWNER");
    expect(resolveReverbRole({})).toBe("OWNER");
  });

  it("recognizes the MANAGER foundation and rejects unsupported explicit roles", () => {
    expect(resolveReverbRole({ role: "MANAGER" })).toBe("MANAGER");
    expect(resolveReverbRole({ role: "ADMIN" })).toBeNull();
  });

  it("grants OWNER all current product permissions", () => {
    for (const permission of [
      "dashboard:read",
      "campaign:create",
      "campaign:review",
      "campaign:approve",
      "reservations:read",
      "analytics:read",
      "venue:manage"
    ] as const) {
      expect(hasReverbPermission("OWNER", permission)).toBe(true);
    }
  });

  it("keeps approval and venue management owner-only", () => {
    expect(hasReverbPermission("MANAGER", "dashboard:read")).toBe(true);
    expect(hasReverbPermission("MANAGER", "campaign:create")).toBe(true);
    expect(hasReverbPermission("MANAGER", "campaign:approve")).toBe(false);
    expect(hasReverbPermission("MANAGER", "venue:manage")).toBe(false);
  });
});

describe("Clerk route wiring", () => {
  it("keeps the landing page public and sends Get Started to the correct destination", () => {
    const landing = source("src/app/page.tsx");

    expect(landing).not.toContain("auth.protect");
    expect(landing).not.toContain("requireReverbPermission");
    expect(landing).toContain('<Show when="signed-out">');
    expect(landing).toContain('href="/sign-in?redirect_url=%2Fdashboard"');
    expect(landing).toContain('<Show when="signed-in">');
    expect(landing).toContain('href="/dashboard"');
  });

  it("protects every application page at the server resource", () => {
    for (const [path, permission] of Object.values(protectedPages)) {
      const page = source(path);
      expect(page).toContain("requireReverbPermission");
      expect(page).toContain('await requireReverbPermission("' + permission + '")');
    }
  });

  it("provides public sign-in and sign-up pages with dashboard fallbacks", () => {
    const signIn = source("src/app/sign-in/[[...sign-in]]/page.tsx");
    const signUp = source("src/app/sign-up/[[...sign-up]]/page.tsx");

    expect(signIn).toContain("<SignIn");
    expect(signIn).toContain('fallbackRedirectUrl="/dashboard"');
    expect(signUp).toContain("<SignUp");
    expect(signUp).toContain('fallbackRedirectUrl="/dashboard"');
    expect(signIn).toContain('if (isAuthenticated) redirect("/dashboard")');
    expect(signUp).toContain('if (isAuthenticated) redirect("/dashboard")');
  });

  it("uses Clerk session plumbing and an authenticated account menu with sign out", () => {
    const layout = source("src/app/layout.tsx");
    const proxy = source("src/proxy.ts");
    const account = source("src/components/authenticated-account.tsx");

    expect(proxy).toContain("clerkMiddleware");
    expect(proxy).not.toContain("auth.protect");
    expect(layout).toContain("<ClerkProvider");
    expect(layout).toContain('afterSignOutUrl="/"');
    expect(account).toContain("<UserButton");
    expect(account).toContain("useUser");
  });

  it("documents only Clerk variable names and keeps local env files ignored", () => {
    const envExample = source(".env.example");
    const gitignore = source(".gitignore");

    expect(envExample).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=");
    expect(envExample).toContain("CLERK_SECRET_KEY=");
    expect(envExample).not.toMatch(/(?:pk|sk)_(?:test|live)_/);
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".env*.local");
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}