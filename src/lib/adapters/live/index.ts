import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z, type ZodType } from "zod";

import {
  CampaignCreativeSchema,
  CampaignIntentSchema,
  DecisionExplanationSchema,
  OpenAIQualityReviewSchema,
  SensoProviderVerificationSchema
} from "../../../schemas";
import { IntegrationError } from "../errors";
import type {
  LinqAdapter,
  N8nStorageAdapter,
  OpenAIAdapter,
  PravaAdapter,
  SensoAdapter
} from "../types";

type LiveAdapterConfig = {
  baseUrl?: string;
  apiKey: string;
};

export type OpenAIModelConfig = {
  intent: string;
  decision: string;
  creative: string;
  qualityReview: string;
};

export type LiveOpenAIAdapterConfig = {
  apiKey: string;
  models: OpenAIModelConfig;
};

export type OpenAIResponsesClient = {
  responses: {
    parse(params: Record<string, unknown>): Promise<{ output_parsed: unknown | null }>;
  };
};

export type LiveSensoAdapterConfig = LiveAdapterConfig & {
  verifyProviderUrl: string;
};

export type SensoHttpClient = (input: string, init: RequestInit) => Promise<Response>;

type StructuredRequest<T> = {
  operation: keyof Omit<OpenAIAdapter, "mode">;
  model: string;
  schemaName: string;
  schema: ZodType<T>;
  systemPrompt: string;
  request: unknown;
};

export class LiveOpenAIAdapter implements OpenAIAdapter {
  readonly mode = "live";
  private readonly client: OpenAIResponsesClient;

  constructor(
    private readonly config: LiveOpenAIAdapterConfig,
    client?: OpenAIResponsesClient
  ) {
    this.client = client ?? (new OpenAI({ apiKey: config.apiKey }) as unknown as OpenAIResponsesClient);
  }

  async extractCampaignIntent(
    request: Parameters<OpenAIAdapter["extractCampaignIntent"]>[0]
  ): ReturnType<OpenAIAdapter["extractCampaignIntent"]> {
    return this.parseStructured({
      operation: "extractCampaignIntent",
      model: this.config.models.intent,
      schemaName: "campaign_intent",
      schema: CampaignIntentSchema,
      systemPrompt:
        "Extract a Reverb Fill campaign intent from the owner request. Use ISO-8601 UTC timestamps, integer paise for money, and list unknown required values in missingFields. Do not approve spending.",
      request
    });
  }

  async explainProviderDecision(
    request: Parameters<OpenAIAdapter["explainProviderDecision"]>[0]
  ): ReturnType<OpenAIAdapter["explainProviderDecision"]> {
    return this.parseStructured({
      operation: "explainProviderDecision",
      model: this.config.models.decision,
      schemaName: "decision_explanation",
      schema: DecisionExplanationSchema,
      systemPrompt:
        "Explain the deterministic provider decision using only supplied facts. OpenAI may explain the decision but may not approve spending or override policy checks.",
      request
    });
  }

  async generateCampaignCreative(
    request: Parameters<OpenAIAdapter["generateCampaignCreative"]>[0]
  ): ReturnType<OpenAIAdapter["generateCampaignCreative"]> {
    return this.parseStructured({
      operation: "generateCampaignCreative",
      model: this.config.models.creative,
      schemaName: "campaign_creative",
      schema: CampaignCreativeSchema,
      systemPrompt:
        "Generate concise campaign creative for a local Spot promotion. Respect supplied budget, discount, and offer constraints exactly, and do not invent unsupported claims.",
      request
    });
  }

  async reviewCampaignQuality(
    request: Parameters<OpenAIAdapter["reviewCampaignQuality"]>[0]
  ): ReturnType<OpenAIAdapter["reviewCampaignQuality"]> {
    return this.parseStructured({
      operation: "reviewCampaignQuality",
      model: this.config.models.qualityReview,
      schemaName: "quality_review",
      schema: OpenAIQualityReviewSchema,
      systemPrompt:
        "Review campaign creative for brand tone, clarity, and unsupported claims. This is quality feedback only and never authorizes payment or checkout.",
      request
    });
  }

  private async parseStructured<T>({
    operation,
    model,
    schemaName,
    schema,
    systemPrompt,
    request
  }: StructuredRequest<T>): Promise<T> {
    try {
      const response = await this.client.responses.parse({
        model,
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: JSON.stringify(request)
          }
        ],
        text: {
          format: zodTextFormat(schema, schemaName)
        }
      });

      return schema.parse(response.output_parsed);
    } catch (error) {
      throw toOpenAIIntegrationError(operation, error);
    }
  }
}

export class LiveSensoAdapter implements SensoAdapter {
  readonly mode = "live";

  constructor(
    private readonly config: LiveSensoAdapterConfig,
    private readonly httpClient: SensoHttpClient = fetch
  ) {}

  async verifyProvider(
    provider: Parameters<SensoAdapter["verifyProvider"]>[0],
    promotionPackage: Parameters<SensoAdapter["verifyProvider"]>[1],
    campaignContext: Parameters<SensoAdapter["verifyProvider"]>[2]
  ): ReturnType<SensoAdapter["verifyProvider"]> {
    try {
      const response = await this.httpClient(this.config.verifyProviderUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          provider,
          package: promotionPackage,
          campaignContext
        })
      });

      if (!response.ok) {
        throw new IntegrationError({
          integration: "senso",
          operation: "verifyProvider",
          safeMessage: "Senso provider verification request failed.",
          statusCode: response.status,
          retryable: response.status === 429 || response.status >= 500,
          cause: {
            status: response.status,
            statusText: response.statusText,
            verifyProviderUrl: this.config.verifyProviderUrl
          }
        });
      }

      return SensoProviderVerificationSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }

      throw toSensoIntegrationError(error);
    }
  }
}

export class LiveLinqAdapter implements LinqAdapter {
  readonly mode = "live";

  constructor(private readonly config: LiveAdapterConfig) {}

  async sendMessage(): ReturnType<LinqAdapter["sendMessage"]> {
    throw liveNotImplemented("linq", "sendMessage", this.config);
  }
}

export class LivePravaAdapter implements PravaAdapter {
  readonly mode = "live";

  constructor(private readonly config: LiveAdapterConfig) {}

  async authorizePayment(): ReturnType<PravaAdapter["authorizePayment"]> {
    throw liveNotImplemented("prava", "authorizePayment", this.config);
  }
}

export class LiveN8nStorageAdapter implements N8nStorageAdapter {
  readonly mode = "live";

  constructor(private readonly config: LiveAdapterConfig) {}

  async getRecord(): ReturnType<N8nStorageAdapter["getRecord"]> {
    throw liveNotImplemented("n8nStorage", "getRecord", this.config);
  }

  async saveRecord(): ReturnType<N8nStorageAdapter["saveRecord"]> {
    throw liveNotImplemented("n8nStorage", "saveRecord", this.config);
  }

  async appendAuditEvent(): ReturnType<N8nStorageAdapter["appendAuditEvent"]> {
    throw liveNotImplemented("n8nStorage", "appendAuditEvent", this.config);
  }
}

function toOpenAIIntegrationError(operation: string, error: unknown): IntegrationError {
  const statusCode = getStatusCode(error);

  return new IntegrationError({
    integration: "openai",
    operation,
    safeMessage:
      error instanceof z.ZodError
        ? "OpenAI response failed schema validation."
        : "OpenAI live adapter request failed.",
    statusCode,
    retryable: statusCode === 429 || (statusCode !== undefined && statusCode >= 500),
    cause: error
  });
}

function toSensoIntegrationError(error: unknown): IntegrationError {
  const statusCode = getStatusCode(error);

  return new IntegrationError({
    integration: "senso",
    operation: "verifyProvider",
    safeMessage:
      error instanceof z.ZodError
        ? "Senso response failed schema validation."
        : "Senso provider verification request failed.",
    statusCode,
    retryable: statusCode === 429 || (statusCode !== undefined && statusCode >= 500),
    cause: error
  });
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = "status" in error ? error.status : "statusCode" in error ? error.statusCode : undefined;
  return typeof candidate === "number" ? candidate : undefined;
}

function liveNotImplemented(
  integration: ConstructorParameters<typeof IntegrationError>[0]["integration"],
  operation: string,
  config: LiveAdapterConfig
): IntegrationError {
  return new IntegrationError({
    integration,
    operation,
    safeMessage: `${integration} live adapter is not implemented yet.`,
    retryable: false,
    cause: {
      baseUrl: config.baseUrl
    }
  });
}
