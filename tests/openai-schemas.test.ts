import { describe, expect, it } from "vitest";

import {
  CampaignCreativeSchema,
  CampaignIntentSchema,
  DecisionExplanationSchema,
  OpenAIQualityReviewSchema
} from "../src/schemas";

const validIntent = {
  unusedCapacity: 12,
  targetReservations: 6,
  maximumBudgetPaise: 500000,
  maximumDiscountPercent: 15,
  maximumExpectedCpaPaise: 85000,
  startTime: "2026-08-07T13:30:00.000Z",
  endTime: "2026-08-07T15:30:00.000Z",
  missingFields: []
};

describe("OpenAI schemas", () => {
  it("accepts valid campaign intent records", () => {
    expect(CampaignIntentSchema.parse(validIntent)).toEqual(validIntent);
  });

  it("rejects decimal paise, non-UTC dates, and invalid time ranges", () => {
    expect(() =>
      CampaignIntentSchema.parse({
        ...validIntent,
        maximumBudgetPaise: 500000.5
      })
    ).toThrow();

    expect(() =>
      CampaignIntentSchema.parse({
        ...validIntent,
        startTime: "2026-08-07T19:00:00+05:30"
      })
    ).toThrow();

    expect(() =>
      CampaignIntentSchema.parse({
        ...validIntent,
        endTime: validIntent.startTime
      })
    ).toThrow();
  });

  it("rejects extra fields", () => {
    expect(() =>
      CampaignCreativeSchema.parse({
        headline: "Friday tables",
        caption: "Book now.",
        offerText: "Save up to 15%.",
        callToAction: "Reserve",
        providerBrief: "Promote locally.",
        imagePrompt: "Cafe table.",
        spendApproved: true
      })
    ).toThrow();
  });

  it("requires decision explanations and review scores to stay within bounds", () => {
    expect(() =>
      DecisionExplanationSchema.parse({
        summary: "Selected package wins.",
        selectedReasons: [],
        rejectedAlternatives: [],
        riskDisclosure: "Owner approval is still required."
      })
    ).toThrow();

    expect(() =>
      OpenAIQualityReviewSchema.parse({
        approved: true,
        brandToneScore: 101,
        clarityScore: 90,
        unsupportedClaims: [],
        issues: [],
        revisionInstructions: []
      })
    ).toThrow();
  });
});
