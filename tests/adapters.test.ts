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
  APP_URL: "https://reverb.example.test",
  APP_ENV: "production",
  APP_SECRET: "test-app-secret-value",
  N8N_INTERNAL_SECRET: "test-n8n-internal-secret",
  OPENAI_API_KEY: "test-openai-api-key",
  OPENAI_MODEL: "model-main",
  OPENAI_IMAGE_MODEL: "model-image",
  SENSO_API_KEY: "test-senso-api-key",
  SENSO_API_BASE: "https://senso.example.test/api",
  SENSO_PROVIDER_FOLDER_ID: "folder-provider-evidence",
  LINQ_API_KEY: "test-linq-api-key",
  LINQ_API_BASE: "https://linq.example.test/api",
  LINQ_FROM_NUMBER: "+919900000000",
  LINQ_WEBHOOK_URL: "https://reverb.example.test/api/webhooks/linq",
  LINQ_WEBHOOK_SECRET: "test-linq-webhook-secret",
  NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY: "pk_test_placeholder",
  PRAVA_SECRET_KEY: "sk_test_placeholder",
  PRAVA_API_BASE: "https://prava.example.test",
  PRAVA_INTEGRATION_TYPE: "embedding",
  PRAVA_CURRENCY: "INR",
  N8N_BASE_URL: "https://n8n.example.test",
  N8N_INTAKE_WEBHOOK_URL: "https://n8n.example.test/webhook/intake",
  N8N_STORAGE_WEBHOOK_URL: "https://n8n.example.test/webhook/storage",
  N8N_CAMPAIGN_WEBHOOK_URL: "https://n8n.example.test/webhook/campaign",
  N8N_REPORT_WEBHOOK_URL: "https://n8n.example.test/webhook/report",
  DEMO_SPOT_ID: "spot_quiet_cup_cafe",
  DEMO_OWNER_EMAIL: "owner@example.test",
  DEMO_TIMEZONE: "Asia/Kolkata"
};

const openAIModels = {
  intent: "model-main",
  decision: "model-main",
  creative: "model-main",
  qualityReview: "model-main"
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
  it("loads fixture mode with minimal variables", () => {
    expect(loadRuntimeConfig({ USE_FIXTURES: "true" })).toEqual({
      useFixtures: true,
      mode: "fixture"
    });

    const adapters = createIntegrationAdapters(loadRuntimeConfig({ USE_FIXTURES: "true" }));
    expect(Object.values(adapters).every((adapter) => adapter.mode === "fixture")).toBe(true);
  });

  it("defaults to fixture mode", () => {
    expect(loadRuntimeConfig({})).toEqual({
      useFixtures: true,
      mode: "fixture"
    });
  });

  it("loads complete live mode from the final variable contract", () => {
    const config = loadRuntimeConfig(completeLiveEnv);
    const adapters = createIntegrationAdapters(config);

    if (config.mode !== "live") {
      throw new Error("Expected live config");
    }

    expect(config.runtime).toMatchObject({
      appUrl: completeLiveEnv.APP_URL,
      appEnv: completeLiveEnv.APP_ENV
    });
    expect(config.integrations.openai).toMatchObject({
      imageModel: completeLiveEnv.OPENAI_IMAGE_MODEL,
      models: openAIModels
    });
    expect(config.integrations.senso.providerFolderId).toBe(
      completeLiveEnv.SENSO_PROVIDER_FOLDER_ID
    );
    expect(config.integrations.linq).toMatchObject({
      fromNumber: completeLiveEnv.LINQ_FROM_NUMBER,
      webhookUrl: completeLiveEnv.LINQ_WEBHOOK_URL
    });
    expect(config.integrations.prava).toMatchObject({
      publishableKey: completeLiveEnv.NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY,
      integrationType: completeLiveEnv.PRAVA_INTEGRATION_TYPE,
      currency: "INR"
    });
    expect(config.n8n.storageWebhookUrl).toBe(completeLiveEnv.N8N_STORAGE_WEBHOOK_URL);
    expect(config.demo.timezone).toBe(completeLiveEnv.DEMO_TIMEZONE);
    expect(Object.values(adapters).every((adapter) => adapter.mode === "live")).toBe(true);
  });

  it("reports every missing required live variable by name", () => {
    expect(() => loadRuntimeConfig({ USE_FIXTURES: "false" })).toThrow(IntegrationError);

    try {
      loadRuntimeConfig({ USE_FIXTURES: "false" });
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      const configError = error as IntegrationError;
      expect(configError.safeMessage).toContain("Live mode missing required configuration");
      expect(configError.safeMessage).toContain("APP_URL");
      expect(configError.safeMessage).toContain("OPENAI_MODEL");
      expect(configError.safeMessage).toContain("SENSO_API_BASE");
      expect(configError.safeMessage).toContain("LINQ_FROM_NUMBER");
      expect(configError.safeMessage).toContain("PRAVA_SECRET_KEY");
      expect(configError.safeMessage).toContain("N8N_REPORT_WEBHOOK_URL");
      expect(configError.safeMessage).toContain("DEMO_TIMEZONE");
    }
  });

  it("never includes secret values in configuration errors", () => {
    try {
      loadRuntimeConfig({
        ...completeLiveEnv,
        SENSO_API_BASE: "not-a-url"
      });
      throw new Error("Expected runtime configuration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).safeMessage).toBe("Runtime configuration is invalid.");
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(completeLiveEnv.APP_SECRET);
      expect(serialized).not.toContain(completeLiveEnv.OPENAI_API_KEY);
      expect(serialized).not.toContain(completeLiveEnv.LINQ_WEBHOOK_SECRET);
      expect(serialized).not.toContain(completeLiveEnv.PRAVA_SECRET_KEY);
      expect(serialized).not.toContain(completeLiveEnv.N8N_INTERNAL_SECRET);
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
        model: "model-main",
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





