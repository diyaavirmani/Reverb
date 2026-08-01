import { describe, expect, it, vi } from "vitest";

import { createIntegrationAdapters, loadRuntimeConfig } from "../src/lib/adapters";
import { LiveSensoAdapter } from "../src/lib/adapters/live";
import {
  PromotionPackageSchema,
  PromotionProviderSchema,
  SensoCampaignContextSchema,
  SensoProviderVerificationSchema
} from "../src/schemas";
import packagesJson from "../fixtures/data/promotion-packages.json";
import providersJson from "../fixtures/data/providers.json";

const providers = providersJson.map((provider) => PromotionProviderSchema.parse(provider));
const packages = packagesJson.map((promotionPackage) => PromotionPackageSchema.parse(promotionPackage));

const campaignContext = SensoCampaignContextSchema.parse({
  campaignId: "campaign_demo_friday",
  spotId: "spot_demo_cafe",
  spotName: "The Quiet Cup",
  category: "CAFE",
  city: "Bengaluru",
  region: "Karnataka",
  countryCode: "IN",
  slotStartAt: "2026-08-07T13:30:00.000Z",
  slotEndAt: "2026-08-07T15:30:00.000Z",
  maximumBudgetPaise: 500000,
  maximumExpectedCpaPaise: 85000
});

const providerA = providerById("provider_reach_local_dining");
const providerB = providerById("provider_reach_neighborhood_food");
const providerC = providerById("provider_reach_premium_weekend");
const packageA = packageById("package_local_dining_boost");
const packageB = packageById("package_neighborhood_food_blast");
const packageC = packageById("package_premium_weekend_push");

const liveVerifiedResponse = SensoProviderVerificationSchema.parse({
  verificationStatus: "VERIFIED",
  evidenceConfidence: 0.9,
  localAudiencePercent: 80,
  historicalBookingMin: 6,
  historicalBookingMax: 8,
  verifiedPricePaise: 480000,
  verifiedDeliverable: "Verified local distribution placement.",
  verifiedPublicationDeadline: "2026-08-07T12:30:00.000Z",
  cancellationPolicy: "Cancelable before checkout.",
  sourceReferences: [
    {
      id: "senso_ref_live_mock",
      label: "Mocked Senso verification response",
      observedAt: "2026-08-01T00:00:00.000Z"
    }
  ],
  warnings: []
});

describe("Senso adapter", () => {
  it("returns Provider A fixture with strong local evidence and valid history", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).senso;

    const result = await adapter.verifyProvider(providerA, packageA, campaignContext);

    expect(result).toMatchObject({
      verificationStatus: "VERIFIED",
      evidenceConfidence: 0.94,
      localAudiencePercent: 82,
      historicalBookingMin: 6,
      verifiedPricePaise: 480000,
      warnings: []
    });
    expect(result.sourceReferences.length).toBeGreaterThan(0);
  });

  it("returns Provider B fixture with weak geographic evidence", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).senso;

    const result = await adapter.verifyProvider(providerB, packageB, campaignContext);

    expect(result.verificationStatus).toBe("PARTIALLY_VERIFIED");
    expect(result.evidenceConfidence).toBeLessThan(0.5);
    expect(result.localAudiencePercent).toBe(18);
    expect(result.warnings).toContain("weak_geographic_evidence");
  });

  it("returns Provider C fixture with verified information but invalid deadline or CPA evidence", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).senso;

    const result = await adapter.verifyProvider(providerC, packageC, campaignContext);

    expect(result.verificationStatus).toBe("VERIFIED");
    expect(result.verifiedPricePaise).toBe(540000);
    expect(result.verifiedPublicationDeadline).toBe("2026-08-07T16:00:00.000Z");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "publication_deadline_after_campaign_window",
        "conservative_cpa_likely_above_campaign_limit"
      ])
    );
  });

  it("returns UNVERIFIED when no evidence fixture exists", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).senso;

    const result = await adapter.verifyProvider(
      { ...providerA, id: "provider_without_evidence" },
      { ...packageA, id: "package_without_evidence", providerId: "provider_without_evidence" },
      campaignContext
    );

    expect(result).toMatchObject({
      verificationStatus: "UNVERIFIED",
      evidenceConfidence: 0,
      localAudiencePercent: 0,
      historicalBookingMin: 0,
      historicalBookingMax: 0,
      verifiedPricePaise: null,
      verifiedDeliverable: null,
      verifiedPublicationDeadline: null,
      cancellationPolicy: null,
      sourceReferences: [],
      warnings: ["no_evidence_available"]
    });
  });

  it("uses the configured live endpoint and validates the response", async () => {
    let requestBody: string | undefined;
    const fetchMock = vi.fn(async (_input: string, init: RequestInit) => {
      requestBody = String(init.body);
      return new Response(JSON.stringify(liveVerifiedResponse), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const adapter = new LiveSensoAdapter(
      {
        baseUrl: "https://senso.example.test",
        apiKey: "test-senso-api-key",
        verifyProviderUrl: "https://senso.example.test/configured/verify"
      },
      fetchMock
    );

    await expect(adapter.verifyProvider(providerA, packageA, campaignContext)).resolves.toEqual(
      liveVerifiedResponse
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://senso.example.test/configured/verify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-senso-api-key",
          "content-type": "application/json"
        })
      })
    );

    const body = JSON.parse(requestBody ?? "{}");
    expect(body).toMatchObject({
      provider: { id: providerA.id },
      package: { id: packageA.id },
      campaignContext: { campaignId: campaignContext.campaignId }
    });
  });

  it("rejects live responses that contain no sources but claim verification", async () => {
    const fetchMock = vi.fn(async (_input: string, _init: RequestInit) =>
      new Response(
        JSON.stringify({
          ...liveVerifiedResponse,
          sourceReferences: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    const adapter = new LiveSensoAdapter(
      {
        baseUrl: "https://senso.example.test",
        apiKey: "test-senso-api-key",
        verifyProviderUrl: "https://senso.example.test/configured/verify"
      },
      fetchMock
    );

    await expect(adapter.verifyProvider(providerA, packageA, campaignContext)).rejects.toMatchObject({
      integration: "senso",
      operation: "verifyProvider",
      safeMessage: "Senso response failed schema validation."
    });
  });
});

function providerById(id: string) {
  const provider = providers.find((candidate) => candidate.id === id);

  if (provider === undefined) {
    throw new Error(`Missing provider ${id}`);
  }

  return provider;
}

function packageById(id: string) {
  const promotionPackage = packages.find((candidate) => candidate.id === id);

  if (promotionPackage === undefined) {
    throw new Error(`Missing package ${id}`);
  }

  return promotionPackage;
}

