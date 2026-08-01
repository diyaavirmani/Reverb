import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z, type ZodType } from "zod";

import {
  CampaignCreativeSchema,
  CampaignIntentSchema,
  DecisionExplanationSchema,
  OpenAIQualityReviewSchema,
  SensoProviderVerificationSchema,
  type AuditEvent,
  type CampaignCreative,
  type CampaignIntent,
  type DecisionExplanation,
  type OpenAIQualityReview,
  type SensoProviderVerification
} from "../../../schemas";
import { IntegrationError } from "../errors";
import type {
  LinqAdapter,
  N8nStorageAdapter,
  OpenAIAdapter,
  PravaAdapter,
  PravaAuthorizePaymentResult,
  SensoAdapter
} from "../types";

const fixtureNow = "2026-08-01T00:00:00.000Z";
const sensoFixtureFiles = new Map<string, string>([
  [
    "provider_reach_local_dining:package_local_dining_boost",
    "provider-a-local-dining.json"
  ],
  [
    "provider_reach_neighborhood_food:package_neighborhood_food_blast",
    "provider-b-weak-geography.json"
  ],
  [
    "provider_reach_premium_weekend:package_premium_weekend_push",
    "provider-c-late-or-cpa.json"
  ]
]);

export class FixtureOpenAIAdapter implements OpenAIAdapter {
  readonly mode = "fixture";

  constructor(private readonly fixtureDirectory = join(process.cwd(), "fixtures", "openai")) {}

  async extractCampaignIntent(): Promise<CampaignIntent> {
    return this.loadFixture(CampaignIntentSchema, "campaign-intent.json");
  }

  async explainProviderDecision(): Promise<DecisionExplanation> {
    return this.loadFixture(DecisionExplanationSchema, "decision-explanation.json");
  }

  async generateCampaignCreative(): Promise<CampaignCreative> {
    return this.loadFixture(CampaignCreativeSchema, "campaign-creative.json");
  }

  async reviewCampaignQuality(): Promise<OpenAIQualityReview> {
    return this.loadFixture(OpenAIQualityReviewSchema, "quality-review.json");
  }

  private async loadFixture<T>(schema: ZodType<T>, fileName: string): Promise<T> {
    try {
      const raw = await readFile(join(this.fixtureDirectory, fileName), "utf8");
      return schema.parse(JSON.parse(stripByteOrderMark(raw)));
    } catch (error) {
      const isValidationError = error instanceof z.ZodError;

      throw new IntegrationError({
        integration: "openai",
        operation: "loadFixture",
        safeMessage: isValidationError
          ? `OpenAI fixture ${fileName} failed schema validation.`
          : `OpenAI fixture ${fileName} could not be loaded.`,
        retryable: false,
        cause: {
          fileName,
          error
        }
      });
    }
  }
}

export class FixtureSensoAdapter implements SensoAdapter {
  readonly mode = "fixture";

  constructor(private readonly fixtureDirectory = join(process.cwd(), "fixtures", "senso")) {}

  async verifyProvider(
    provider: Parameters<SensoAdapter["verifyProvider"]>[0],
    promotionPackage: Parameters<SensoAdapter["verifyProvider"]>[1]
  ): ReturnType<SensoAdapter["verifyProvider"]> {
    const fileName = sensoFixtureFiles.get(`${provider.id}:${promotionPackage.id}`);

    if (fileName === undefined) {
      return SensoProviderVerificationSchema.parse(noEvidenceVerification());
    }

    return this.loadFixture(fileName);
  }

  private async loadFixture(fileName: string): Promise<SensoProviderVerification> {
    try {
      const raw = await readFile(join(this.fixtureDirectory, fileName), "utf8");
      return SensoProviderVerificationSchema.parse(JSON.parse(stripByteOrderMark(raw)));
    } catch (error) {
      const isValidationError = error instanceof z.ZodError;

      throw new IntegrationError({
        integration: "senso",
        operation: "loadFixture",
        safeMessage: isValidationError
          ? `Senso fixture ${fileName} failed schema validation.`
          : `Senso fixture ${fileName} could not be loaded.`,
        retryable: false,
        cause: {
          fileName,
          error
        }
      });
    }
  }
}

export class FixtureLinqAdapter implements LinqAdapter {
  readonly mode = "fixture";

  async sendMessage(request: Parameters<LinqAdapter["sendMessage"]>[0]) {
    return {
      messageId: `fixture_linq_${request.campaignId}`,
      accepted: true
    };
  }
}

export class FixturePravaAdapter implements PravaAdapter {
  readonly mode = "fixture";

  async authorizePayment(
    request: Parameters<PravaAdapter["authorizePayment"]>[0]
  ): Promise<PravaAuthorizePaymentResult> {
    return {
      authorizationId: `fixture_prava_${request.campaignId}_${request.idempotencyKey.slice(0, 8)}`,
      expiresAt: "2026-08-01T00:15:00.000Z",
      status: "AUTHORIZED"
    };
  }
}

export class FixtureN8nStorageAdapter implements N8nStorageAdapter {
  readonly mode = "fixture";
  private readonly records = new Map<string, Record<string, unknown>>();
  private readonly auditEvents: AuditEvent[] = [];

  async getRecord(collection: string, id: string) {
    return this.records.get(recordKey(collection, id)) ?? null;
  }

  async saveRecord(collection: string, id: string, value: Record<string, unknown>) {
    const record = {
      ...value,
      id
    };

    this.records.set(recordKey(collection, id), record);
    return record;
  }

  async appendAuditEvent(event: AuditEvent) {
    this.auditEvents.push(event);
    return event;
  }
}

function noEvidenceVerification(): SensoProviderVerification {
  return {
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
  };
}

function stripByteOrderMark(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function recordKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}
