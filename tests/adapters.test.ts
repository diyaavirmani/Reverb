import { describe, expect, it, vi } from "vitest";

import {
  IntegrationError,
  createIntegrationAdapters,
  loadRuntimeConfig
} from "../src/lib/adapters";
import { LiveOpenAIAdapter, type OpenAIResponsesClient } from "../src/lib/adapters/live";
import { CampaignIntentSchema } from "../src/schemas";

const completeLiveEnv = {
  USE_FIXTURES: "false",
  OPENAI_API_KEY: "test-openai-api-key",
  OPENAI_INTENT_MODEL: "model-intent",
  OPENAI_DECISION_MODEL: "model-decision",
  OPENAI_CREATIVE_MODEL: "model-creative",
  OPENAI_QUALITY_REVIEW_MODEL: "model-quality-review",
  SENSO_API_BASE_URL: "https://senso.example.test",
  SENSO_API_KEY: "test-senso-api-key",
  SENSO_VERIFY_PROVIDER_URL: "https://senso.example.test/verify-provider",
  LINQ_API_BASE_URL: "https://linq.example.test",
  LINQ_API_KEY: "test-linq-api-key",
  PRAVA_API_BASE_URL: "https://prava.example.test",
  PRAVA_API_KEY: "test-prava-api-key",
  PRAVA_CREATE_SESSION_ENDPOINT_TEMPLATE: "/sessions",
  PRAVA_RESULT_ENDPOINT_TEMPLATE: "/sessions/{sessionId}",
  PRAVA_REPORT_CHECKOUT_ENDPOINT_TEMPLATE: "/sessions/{sessionId}/checkout-outcome",
  N8N_API_BASE_URL: "https://n8n.example.test",
  N8N_API_KEY: "test-n8n-api-key"
};

const openAIModels = {
  intent: "model-intent",
  decision: "model-decision",
  creative: "model-creative",
  qualityReview: "model-quality-review"
};

const validIntent = CampaignIntentSchema.parse({
  unusedCapacity: 12,
  targetReservations: 6,
  maximumBudgetPaise: 500000,
  maximumDiscountPercent: 15,
  maximumExpectedCpaPaise: 85000,
  startTime: "2026-08-07T13:30:00.000Z",
  endTime: "2026-08-07T15:30:00.000Z",
  missingFields: []
});

describe("runtime configuration", () => {
  it("defaults to fixture mode", () => {
    expect(loadRuntimeConfig({})).toEqual({
      useFixtures: true,
      mode: "fixture"
    });
  });

  it("chooses fixture adapters when fixture mode is enabled", () => {
    const adapters = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" }));

    expect(adapters.openai.mode).toBe("fixture");
    expect(adapters.senso.mode).toBe("fixture");
    expect(adapters.linq.mode).toBe("fixture");
    expect(adapters.prava.mode).toBe("fixture");
    expect(adapters.n8nStorage.mode).toBe("fixture");
  });

  it("fails clearly when live mode lacks required configuration", () => {
    expect(() =>
      loadRuntimeConfig({
        USE_FIXTURES: "false",
        OPENAI_API_KEY: "test-openai-api-key"
      })
    ).toThrow(IntegrationError);

    try {
      loadRuntimeConfig({
        USE_FIXTURES: "false",
        OPENAI_API_KEY: "test-openai-api-key"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).safeMessage).toContain(
        "Live mode missing required configuration"
      );
      expect((error as IntegrationError).safeMessage).toContain("OPENAI_INTENT_MODEL");
      expect((error as IntegrationError).safeMessage).toContain("SENSO_API_BASE_URL");
      expect((error as IntegrationError).safeMessage).toContain("SENSO_VERIFY_PROVIDER_URL");
      expect((error as IntegrationError).safeMessage).not.toContain("test-openai-api-key");
    }
  });

  it("fails clearly when live mode lacks Senso endpoint configuration", () => {
    const { SENSO_VERIFY_PROVIDER_URL: _sensoEndpoint, ...envWithoutSensoEndpoint } = completeLiveEnv;

    expect(() => loadRuntimeConfig(envWithoutSensoEndpoint)).toThrow(IntegrationError);

    try {
      loadRuntimeConfig(envWithoutSensoEndpoint);
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).safeMessage).toContain("SENSO_VERIFY_PROVIDER_URL");
      expect((error as IntegrationError).safeMessage).not.toContain("test-senso-api-key");
    }
  });

  it("does not require a live Linq API key yet", () => {
    const { LINQ_API_KEY: _linqApiKey, ...envWithoutLinqKey } = completeLiveEnv;
    const config = loadRuntimeConfig(envWithoutLinqKey);

    if (config.mode !== "live") {
      throw new Error("Expected live config");
    }

    expect(config.integrations.linq.apiKey).toBeUndefined();
  });

  it("fails clearly when live mode lacks Prava endpoint templates", () => {
    const {
      PRAVA_CREATE_SESSION_ENDPOINT_TEMPLATE: _createEndpoint,
      PRAVA_RESULT_ENDPOINT_TEMPLATE: _resultEndpoint,
      PRAVA_REPORT_CHECKOUT_ENDPOINT_TEMPLATE: _reportEndpoint,
      ...envWithoutPravaEndpoints
    } = completeLiveEnv;

    expect(() => loadRuntimeConfig(envWithoutPravaEndpoints)).toThrow(IntegrationError);

    try {
      loadRuntimeConfig(envWithoutPravaEndpoints);
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).safeMessage).toContain(
        "PRAVA_CREATE_SESSION_ENDPOINT_TEMPLATE"
      );
      expect((error as IntegrationError).safeMessage).toContain("PRAVA_RESULT_ENDPOINT_TEMPLATE");
      expect((error as IntegrationError).safeMessage).not.toContain("test-prava-api-key");
    }
  });

  it("chooses live adapters only when all live variables are present", () => {
    const config = loadRuntimeConfig(completeLiveEnv);
    const adapters = createIntegrationAdapters(config);

    if (config.mode !== "live") {
      throw new Error("Expected live config");
    }

    expect(config.integrations.openai.models).toEqual(openAIModels);
    expect(adapters.openai.mode).toBe("live");
    expect(adapters.senso.mode).toBe("live");
    expect(adapters.linq.mode).toBe("live");
    expect(adapters.prava.mode).toBe("live");
    expect(adapters.n8nStorage.mode).toBe("live");
  });

  it("rejects invalid live URLs without printing secret values", () => {
    try {
      loadRuntimeConfig({
        ...completeLiveEnv,
        SENSO_API_BASE_URL: "not-a-url"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).safeMessage).toBe("Runtime configuration is invalid.");
      expect(JSON.stringify(error)).not.toContain("test-openai-api-key");
      expect(JSON.stringify(error)).not.toContain("test-senso-api-key");
    }
  });
});

describe("OpenAI adapters", () => {
  it("returns validated fixture responses", async () => {
    const adapter = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" })).openai;

    await expect(adapter.extractCampaignIntent({ ownerMessage: "Fill Friday seats" })).resolves.toEqual(
      validIntent
    );
    await expect(
      adapter.explainProviderDecision({
        campaignId: "campaign_demo_friday",
        selectedPackageId: "pkg_local_food_creator",
        selectedReasons: ["within_budget"],
        rejectedAlternatives: []
      })
    ).resolves.toMatchObject({
      selectedReasons: expect.arrayContaining(["within_budget"])
    });
    await expect(
      adapter.generateCampaignCreative({
        campaignId: "campaign_demo_friday",
        packageId: "pkg_local_food_creator",
        spotName: "The Quiet Cup",
        timeWindow: "Friday 7-9 PM"
      })
    ).resolves.toMatchObject({
      callToAction: "Reserve your table"
    });
    await expect(
      adapter.reviewCampaignQuality({
        campaignId: "campaign_demo_friday",
        creative: {
          headline: "Friday tables are open",
          caption: "Book now.",
          offerText: "Save up to 15%.",
          callToAction: "Reserve",
          providerBrief: "Promote locally.",
          imagePrompt: "Cafe table."
        }
      })
    ).resolves.toMatchObject({
      approved: true
    });
  });

  it("uses structured output parameters for the live adapter", async () => {
    const parse = vi.fn(async () => ({ output_parsed: validIntent }));
    const client = { responses: { parse } } satisfies OpenAIResponsesClient;
    const adapter = new LiveOpenAIAdapter(
      {
        apiKey: "test-openai-api-key",
        models: openAIModels
      },
      client
    );

    await expect(adapter.extractCampaignIntent({ ownerMessage: "Fill Friday seats" })).resolves.toEqual(
      validIntent
    );

    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "model-intent",
        text: expect.objectContaining({
          format: expect.any(Object)
        })
      })
    );
  });

  it("rejects live responses that fail schema validation", async () => {
    const parse = vi.fn(async () => ({ output_parsed: { unusedCapacity: 12 } }));
    const client = { responses: { parse } } satisfies OpenAIResponsesClient;
    const adapter = new LiveOpenAIAdapter(
      {
        apiKey: "test-openai-api-key",
        models: openAIModels
      },
      client
    );

    await expect(adapter.extractCampaignIntent({ ownerMessage: "Fill Friday seats" })).rejects.toMatchObject({
      integration: "openai",
      operation: "extractCampaignIntent",
      safeMessage: "OpenAI response failed schema validation."
    });
  });
});

describe("IntegrationError", () => {
  it("stores only redacted cause details", () => {
    const error = new IntegrationError({
      integration: "prava",
      operation: "authorizePayment",
      safeMessage: "Prava authorization failed.",
      statusCode: 401,
      retryable: false,
      cause: {
        authorization: "Bearer test-value",
        nested: {
          paymentToken: "tok_test_value",
          safe: "visible"
        }
      }
    });

    expect(error).toMatchObject({
      integration: "prava",
      operation: "authorizePayment",
      safeMessage: "Prava authorization failed.",
      statusCode: 401,
      retryable: false,
      cause: {
        authorization: "[REDACTED]",
        nested: {
          paymentToken: "[REDACTED]",
          safe: "visible"
        }
      }
    });
  });
});





