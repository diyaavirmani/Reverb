import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/health/route";
import { EnvironmentValidationError, validateReverbEnvironment } from "../src/lib/config/env";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a healthy API status with dependency checks", async () => {
    vi.stubEnv("USE_FIXTURES", "true");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_dummy");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_dummy");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      checks: {
        fixtureMode: true,
        clerkKeysPresent: true,
        fixtureStoreReadable: true
      }
    });
  });

  it("returns 503 when required runtime checks fail", async () => {
    vi.stubEnv("USE_FIXTURES", "false");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_dummy");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_dummy");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      checks: {
        fixtureMode: false,
        clerkKeysPresent: true
      }
    });
  });
});

describe("deployment environment validation", () => {
  it("fails production startup with missing variable names only", () => {
    expect(() =>
      validateReverbEnvironment({
        NODE_ENV: "production",
        USE_FIXTURES: "true",
        APP_ENV: "production"
      })
    ).toThrow(EnvironmentValidationError);

    try {
      validateReverbEnvironment({
        NODE_ENV: "production",
        USE_FIXTURES: "true",
        APP_ENV: "production"
      });
    } catch (error) {
      expect(error).toMatchObject({
        missingKeys: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "APP_URL"]
      });
      expect(String(error)).not.toContain("sk_");
    }
  });

  it("rejects test bypass flags in production", () => {
    expect(() =>
      validateReverbEnvironment({
        NODE_ENV: "production",
        USE_FIXTURES: "true",
        APP_ENV: "production",
        APP_URL: "https://reverb.example",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "dummy_public_key",
        CLERK_SECRET_KEY: "dummy_secret_key",
        REVERB_AUTH_TEST_BYPASS: "true"
      })
    ).toThrow(/REVERB_AUTH_TEST_BYPASS/);
  });
});
