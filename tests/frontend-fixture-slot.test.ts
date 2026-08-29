import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("frontend fixture lifecycle requests", () => {
  it("lets the authoritative fixture choose its valid reservation timestamp", () => {
    const form = source("src/components/campaign-form.tsx");
    const lifecycleActions = source("src/components/demo-launcher.tsx");

    expect(form).not.toContain("reservationTime:");
    expect(lifecycleActions).not.toContain("reservationTime:");
    expect(form).toContain('fetch("/api/demo/lifecycle"');
    expect(lifecycleActions).toContain('fetch("/api/demo/lifecycle"');
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
