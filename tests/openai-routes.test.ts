import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as explainDecisionPost } from "../src/app/api/ai/explain-decision/route";
import { POST as generateCampaignPost } from "../src/app/api/ai/generate-campaign/route";
import { POST as intentPost } from "../src/app/api/ai/intent/route";
import { POST as reviewQualityPost } from "../src/app/api/ai/review-quality/route";
import {
  CampaignCreativeSchema,
  CampaignIntentSchema,
  DecisionExplanationSchema,
  OpenAIQualityReviewSchema
} from "../src/schemas";

const originalUseFixtures = process.env.USE_FIXTURES;

const creativeRequest = {
  headline: "Friday tables are open",
  caption: "Book now.",
  offerText: "Save up to 15%.",
  callToAction: "Reserve",
  providerBrief: "Promote locally.",
  imagePrompt: "Cafe table."
};

describe("OpenAI API routes", () => {
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

  it("POST /api/ai/intent returns a validated fixture intent", async () => {
    const response = await intentPost(jsonRequest("/api/ai/intent", { ownerMessage: "Fill Friday seats" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(CampaignIntentSchema.parse(json)).toMatchObject({
      unusedCapacity: 12,
      maximumBudgetPaise: 500000
    });
  });

  it("POST /api/ai/explain-decision returns a validated fixture explanation", async () => {
    const response = await explainDecisionPost(
      jsonRequest("/api/ai/explain-decision", {
        campaignId: "campaign_demo_friday",
        selectedPackageId: "pkg_local_food_creator",
        selectedReasons: ["within_budget"],
        rejectedAlternatives: [
          {
            packageId: "pkg_geo_weak",
            reasons: ["geographic_evidence_unverified"]
          }
        ]
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(DecisionExplanationSchema.parse(json).selectedReasons).toContain("within_budget");
  });

  it("POST /api/ai/generate-campaign returns validated fixture creative", async () => {
    const response = await generateCampaignPost(
      jsonRequest("/api/ai/generate-campaign", {
        campaignId: "campaign_demo_friday",
        packageId: "pkg_local_food_creator",
        spotName: "The Quiet Cup",
        timeWindow: "Friday 7-9 PM"
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(CampaignCreativeSchema.parse(json).callToAction).toBe("Reserve your table");
  });

  it("POST /api/ai/review-quality returns a validated fixture review", async () => {
    const response = await reviewQualityPost(
      jsonRequest("/api/ai/review-quality", {
        campaignId: "campaign_demo_friday",
        creative: creativeRequest
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(OpenAIQualityReviewSchema.parse(json)).toMatchObject({
      approved: true,
      unsupportedClaims: []
    });
  });

  it("rejects invalid route request bodies", async () => {
    const response = await intentPost(jsonRequest("/api/ai/intent", { spotId: "spot_demo" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "Invalid request body."
    });
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
