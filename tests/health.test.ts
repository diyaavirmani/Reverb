import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a healthy API status", async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({
      service: "reverb-fill-api",
      status: "ok"
    });
  });
});
