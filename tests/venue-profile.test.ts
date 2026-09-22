import { describe, expect, it, vi } from "vitest";

import { getDemoCampaignScheduleForWeekday } from "../src/components/demo-date";
import {
  ClerkMetadataSizeError,
  clerkMetadataSafeBytes,
  jsonByteSize,
  prepareProfileForClerkMetadata
} from "../src/lib/venue/clerk-profile";
import { emptyReverbProfile, parseReverbProfile } from "../src/lib/venue/profile";
import {
  analyzeVenueWebsite,
  extractVenueMetadata,
  isPrivateAddress,
  validatePublicWebsiteUrl,
  WebsiteAnalysisError
} from "../src/lib/venue/website-analysis";

vi.mock("server-only", () => ({}));

function profileWithWebsite() {
  return {
    ...emptyReverbProfile,
    venue: {
      ...emptyReverbProfile.venue,
      name: "Cedar Room",
      city: "Delhi",
      address: "Market Road",
      websiteUrl: "https://cedar.example"
    }
  };
}

describe("Reverb venue profile", () => {
  it("accepts a compact complete profile and rejects missing required venue data", () => {
    expect(parseReverbProfile(profileWithWebsite())).not.toBeNull();
    expect(parseReverbProfile({ ...profileWithWebsite(), venue: { ...profileWithWebsite().venue, name: "" } })).toBeNull();
  });

  it("keeps no-website onboarding available from owner-entered data", async () => {
    const profile = { ...profileWithWebsite(), venue: { ...profileWithWebsite().venue, websiteUrl: "" } };
    const result = await analyzeVenueWebsite(profile, { now: () => new Date("2026-08-29T10:00:00.000Z") });

    expect(result.sourceUrls).toEqual([]);
    expect(result.facts).toContain("Owner-entered venue: Cedar Room");
    expect(result.lastAnalyzedAt).toBe("2026-08-29T10:00:00.000Z");
  });

  it("trims large analysis metadata before storing a Clerk profile", () => {
    const profile = {
      ...profileWithWebsite(),
      analysis: {
        ...profileWithWebsite().analysis,
        sourceStatuses: Array.from({ length: 8 }, (_, index) => ({
          url: `https://cedar.example/${index}`,
          status: "analyzed" as const,
          detail: "x".repeat(240)
        })),
        facts: Array.from({ length: 24 }, () => "f".repeat(500)),
        inferences: Array.from({ length: 16 }, () => "i".repeat(500))
      }
    };

    const trimmed = prepareProfileForClerkMetadata(profile);

    expect(jsonByteSize(trimmed)).toBeLessThanOrEqual(clerkMetadataSafeBytes);
    expect(trimmed.analysis.sourceStatuses).toEqual([]);
    expect(trimmed.analysis.facts).toEqual([]);
    expect(trimmed.analysis.inferences).toEqual([]);
  });

  it("throws a typed error when trimming analysis still exceeds Clerk metadata margin", () => {
    const profile = {
      ...profileWithWebsite(),
      brand: {
        ...profileWithWebsite().brand,
        summary: "s".repeat(8 * 1024)
      }
    };

    expect(() => prepareProfileForClerkMetadata(profile)).toThrow(ClerkMetadataSizeError);
  });
});

describe("safe public venue analysis", () => {
  it("rejects localhost, private IPs, credentials, and non-http protocols", async () => {
    await expect(validatePublicWebsiteUrl("http://127.0.0.1")).rejects.toMatchObject({ code: "PRIVATE_HOST" });
    await expect(validatePublicWebsiteUrl("https://10.0.0.5")).rejects.toMatchObject({ code: "PRIVATE_HOST" });
    await expect(validatePublicWebsiteUrl("file:///etc/passwd")).rejects.toMatchObject({ code: "INVALID_PROTOCOL" });
    await expect(validatePublicWebsiteUrl("https://user:pass@example.com")).rejects.toMatchObject({ code: "CREDENTIALS_NOT_ALLOWED" });
  });

  it("rejects a DNS result that resolves to a private network", async () => {
    await expect(validatePublicWebsiteUrl("https://venue.example", async () => [{ address: "192.168.1.2", family: 4 }])).rejects.toMatchObject({ code: "PRIVATE_HOST" });
  });

  it.each([
    "http://[::1]",
    "http://[::ffff:7f00:1]",
    "http://[::ffff:127.0.0.1]",
    "http://[fe80::1]",
    "http://[64:ff9b::7f00:1]",
    "http://[2002:7f00:1::]",
    "http://[::ffff:a9fe:a9fe]",
    "http://169.254.169.254",
    "http://0x7f.1",
    "http://2130706433",
    "https://quiet-cup.internal"
  ])("rejects private host %s with PRIVATE_HOST", async (url) => {
    await expect(
      validatePublicWebsiteUrl(url, async () => [{ address: "93.184.216.34", family: 4 }])
    ).rejects.toMatchObject({ code: "PRIVATE_HOST" });
  });

  it("extracts bounded metadata and labels inferred themes separately", () => {
    const result = extractVenueMetadata(
      "<html><head><title>Cedar Room Cafe</title><meta name='description' content='Cozy coffee and continental brunch for the community'><meta property='og:image' content='/social.jpg'></head><body><h1>Cedar Room</h1><h2>Coffee and brunch</h2><p>Cozy coffee, coffee, brunch and community.</p></body></html>",
      new URL("https://cedar.example/menu")
    );

    expect(result.pageTitle).toBe("Cedar Room Cafe");
    expect(result.metaDescription).toContain("continental brunch");
    expect(result.openGraphImage).toBe("https://cedar.example/social.jpg");
    expect(result.facts.some((fact) => fact.includes("Website title"))).toBe(true);
    expect(result.inferences.some((inference) => inference.includes("Recurring website themes"))).toBe(true);
  });

  it("uses injected public fetch dependencies without making a network call in tests", async () => {
    const result = await analyzeVenueWebsite(profileWithWebsite(), {
      resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchHtml: async () => "<title>Cedar Room</title><meta name='description' content='A family bakery'>",
      now: () => new Date("2026-08-30T10:00:00.000Z")
    });

    expect(result.sourceStatuses[0]).toMatchObject({ status: "analyzed" });
    expect(result.brand.cuisineOrOffering).toContain("bakery");
  });

  it("classifies reserved address ranges", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("::1")).toBe(true);
  });
});

describe("profile-aware campaign scheduling", () => {
  it("derives a future weekday schedule from a supplied reference date", () => {
    const schedule = getDemoCampaignScheduleForWeekday(2, new Date("2026-08-28T10:00:00.000Z"));
    expect(schedule.date).toBe("2026-09-01");
    expect(schedule.displayDate).toContain("Sep");
  });
});

void WebsiteAnalysisError;
