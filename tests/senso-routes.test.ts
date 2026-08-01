import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../src/app/api/senso/verify-provider/route";
import {
  PromotionPackageSchema,
  PromotionProviderSchema,
  SensoCampaignContextSchema,
  SensoProviderVerificationSchema
} from "../src/schemas";
import packagesJson from "../fixtures/data/promotion-packages.json";
import providersJson from "../fixtures/data/providers.json";

const originalUseFixtures = process.env.USE_FIXTURES;

const providers = providersJson.map((provider) => PromotionProviderSchema.parse(provider));
const packages = packagesJson.map((promotionPackage) => PromotionPackageSchema.parse(promotionPackage));

const providerA = providerById("provider_reach_local_dining");
const packageA = packageById("package_local_dining_boost");

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

describe("POST /api/senso/verify-provider", () => {
  beforeEach(() => {
    process.env.USE_FIXTURES = "true";
  });

  afterEach(() => {
    if (originalUseFixtures === undefined) {
      delete process.env.USE_FIXTURES;
    } else {
      process.env.USE_FIXTURES = originalUseFixtures;
    }
  });

  it("returns the matching fixture verification", async () => {
    const response = await POST(
      jsonRequest({
        provider: providerA,
        package: packageA,
        campaignContext
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(SensoProviderVerificationSchema.parse(json)).toMatchObject({
      verificationStatus: "VERIFIED",
      evidenceConfidence: 0.94,
      verifiedPricePaise: 480000
    });
  });

  it("returns UNVERIFIED for a request with no matching evidence", async () => {
    const response = await POST(
      jsonRequest({
        provider: { ...providerA, id: "provider_without_evidence" },
        package: { ...packageA, id: "package_without_evidence", providerId: "provider_without_evidence" },
        campaignContext
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(SensoProviderVerificationSchema.parse(json)).toMatchObject({
      verificationStatus: "UNVERIFIED",
      evidenceConfidence: 0,
      sourceReferences: []
    });
  });

  it("rejects invalid request bodies", async () => {
    const response = await POST(
      jsonRequest({
        provider: providerA,
        campaignContext
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "Invalid request body."
    });
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/senso/verify-provider", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

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
