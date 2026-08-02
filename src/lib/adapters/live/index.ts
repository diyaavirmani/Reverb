import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z, type ZodType } from "zod";

import {
  CampaignCreativeSchema,
  CampaignIntentSchema,
  DecisionExplanationSchema,
  OpenAIQualityReviewSchema,
  PravaCreateSessionRequestSchema,
  PravaCreateSessionResultSchema,
  PravaGetPaymentResultRequestSchema,
  PravaPaymentResultSchema,
  PravaReportCheckoutOutcomeRequestSchema,
  PravaReportCheckoutOutcomeResultSchema,
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
  apiKey?: string;
};

type LiveCredentialAdapterConfig = {
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

export type LiveSensoAdapterConfig = LiveCredentialAdapterConfig & {
  verifyProviderUrl: string;
};

export type LivePravaAdapterConfig = LiveCredentialAdapterConfig & {
  createSessionEndpointTemplate: string;
  resultEndpointTemplate: string;
  reportCheckoutEndpointTemplate: string;
};

export type SensoHttpClient = (input: string, init: RequestInit) => Promise<Response>;
export type PravaHttpClient = (input: string, init: RequestInit) => Promise<Response>;

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

  constructor(
    private readonly config: LivePravaAdapterConfig,
    private readonly httpClient: PravaHttpClient = fetch
  ) {}

  async createSession(
    request: Parameters<PravaAdapter["createSession"]>[0]
  ): ReturnType<PravaAdapter["createSession"]> {
    const parsedRequest = PravaCreateSessionRequestSchema.parse(request);
    const url = buildEndpointUrl(this.config.baseUrl, this.config.createSessionEndpointTemplate, parsedRequest);

    return this.requestPrava("createSession", url, {
      method: "POST",
      idempotencyKey: parsedRequest.idempotencyKey,
      body: parsedRequest,
      parse: (raw) => normalizePravaCreateSession(raw, parsedRequest)
    });
  }

  async getPaymentResult(
    request: Parameters<PravaAdapter["getPaymentResult"]>[0]
  ): ReturnType<PravaAdapter["getPaymentResult"]> {
    const parsedRequest = PravaGetPaymentResultRequestSchema.parse(request);
    const url = buildEndpointUrl(this.config.baseUrl, this.config.resultEndpointTemplate, parsedRequest);

    return this.requestPrava("getPaymentResult", url, {
      method: "GET",
      idempotencyKey: parsedRequest.idempotencyKey,
      parse: (raw) => normalizePravaPaymentResult(raw, parsedRequest)
    });
  }

  async reportCheckoutOutcome(
    request: Parameters<PravaAdapter["reportCheckoutOutcome"]>[0]
  ): ReturnType<PravaAdapter["reportCheckoutOutcome"]> {
    const parsedRequest = PravaReportCheckoutOutcomeRequestSchema.parse(request);
    const url = buildEndpointUrl(this.config.baseUrl, this.config.reportCheckoutEndpointTemplate, parsedRequest);

    return this.requestPrava("reportCheckoutOutcome", url, {
      method: "POST",
      idempotencyKey: parsedRequest.idempotencyKey,
      body: parsedRequest,
      parse: (raw) => normalizePravaReportOutcome(raw, parsedRequest)
    });
  }

  private async requestPrava<T>(
    operation: string,
    url: string,
    options: {
      method: "GET" | "POST";
      idempotencyKey?: string;
      body?: unknown;
      parse: (raw: unknown) => T;
    }
  ): Promise<T> {
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json"
      };

      if (options.idempotencyKey !== undefined) {
        headers["idempotency-key"] = options.idempotencyKey;
      }

      const response = await this.httpClient(url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });

      if (!response.ok) {
        throw new IntegrationError({
          integration: "prava",
          operation,
          safeMessage: "Prava request failed.",
          statusCode: response.status,
          retryable: response.status === 429 || response.status >= 500,
          cause: {
            status: response.status,
            statusText: response.statusText,
            url
          }
        });
      }

      return options.parse(await response.json());
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }

      throw toPravaIntegrationError(operation, error);
    }
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

function toPravaIntegrationError(operation: string, error: unknown): IntegrationError {
  const statusCode = getStatusCode(error);

  return new IntegrationError({
    integration: "prava",
    operation,
    safeMessage:
      error instanceof z.ZodError
        ? "Prava response failed schema validation."
        : "Prava request failed.",
    statusCode,
    retryable: statusCode === 429 || (statusCode !== undefined && statusCode >= 500),
    cause: error
  });
}

type PravaCreateSessionRequestInput = z.infer<typeof PravaCreateSessionRequestSchema>;
type PravaGetPaymentResultRequestInput = z.infer<typeof PravaGetPaymentResultRequestSchema>;
type PravaReportCheckoutOutcomeRequestInput = z.infer<
  typeof PravaReportCheckoutOutcomeRequestSchema
>;

function normalizePravaCreateSession(
  raw: unknown,
  request: PravaCreateSessionRequestInput
) {
  const record = safeRecord(raw);

  return PravaCreateSessionResultSchema.parse({
    sessionId: asString(record.sessionId),
    campaignId: asString(record.campaignId) ?? request.campaignId,
    status: record.status,
    currency: asString(record.currency) ?? request.currency,
    amountPaise: asNumber(record.amountPaise) ?? request.amountPaise,
    checkoutUrl: asNullableString(record.checkoutUrl),
    authorizationId: asNullableString(record.authorizationId),
    expiresAt: asNullableString(record.expiresAt),
    isFixture: false
  });
}

function normalizePravaPaymentResult(
  raw: unknown,
  request: PravaGetPaymentResultRequestInput
) {
  const record = safeRecord(raw);

  return PravaPaymentResultSchema.parse({
    sessionId: asString(record.sessionId) ?? request.sessionId,
    campaignId: asString(record.campaignId) ?? request.campaignId,
    status: record.status,
    currency: record.currency,
    amountPaise: record.amountPaise,
    authorizationId: asNullableString(record.authorizationId),
    completedAt: asNullableString(record.completedAt),
    expiresAt: asNullableString(record.expiresAt),
    declinedReason: asNullableString(record.declinedReason),
    failureReason: asNullableString(record.failureReason),
    isFixture: false
  });
}

function normalizePravaReportOutcome(
  raw: unknown,
  request: PravaReportCheckoutOutcomeRequestInput
) {
  const record = safeRecord(raw);

  return PravaReportCheckoutOutcomeResultSchema.parse({
    campaignId: asString(record.campaignId) ?? request.campaignId,
    sessionId: asString(record.sessionId) ?? request.sessionId,
    received: record.received,
    status: record.status,
    merchantOrderId: asNullableString(record.merchantOrderId),
    isFixture: false
  });
}
function buildEndpointUrl(
  baseUrl: string | undefined,
  endpointTemplate: string,
  values: Record<string, unknown>
): string {
  const substituted = endpointTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];

    if (value === undefined || value === null || value === "") {
      throw new IntegrationError({
        integration: "prava",
        operation: "buildEndpointUrl",
        safeMessage: `Prava endpoint template is missing value for ${key}.`,
        retryable: false,
        cause: {
          key
        }
      });
    }

    return encodeURIComponent(String(value));
  });

  if (/^https?:\/\//i.test(substituted)) {
    return substituted;
  }

  if (baseUrl === undefined) {
    throw new IntegrationError({
      integration: "prava",
      operation: "buildEndpointUrl",
      safeMessage: "Prava base URL is not configured.",
      retryable: false
    });
  }

  return new URL(substituted.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return asString(value) ?? null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
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



