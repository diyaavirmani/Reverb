import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("frontend fixture lifecycle requests", () => {
  it("lets the authoritative fixture choose its valid reservation timestamp", () => {
    const form = source("src/components/campaign-form.tsx");
    const lifecycleActions = source("src/components/demo-launcher.tsx");
    const lifecycleRequest = lifecycleActions.slice(lifecycleActions.indexOf("async function requestLifecycle"));

    expect(form).not.toContain("reservationTime:");
    expect(lifecycleRequest).not.toContain("reservationTime:");
    expect(form).toContain("campaign: {");
    expect(lifecycleRequest).toContain("campaign: {");
    expect(form).not.toContain("ownerMessage: `Fill");
    expect(lifecycleRequest).not.toContain("ownerMessage: `Fill");
    expect(form).toContain('fetch("/api/demo/lifecycle"');
    expect(lifecycleRequest).toContain('fetch("/api/demo/lifecycle"');
    expect(lifecycleActions).toContain('fetch("/api/demo/reservation"');
    expect(lifecycleActions).toContain("reservationTime: activeCampaign.reservationTime");
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
