import type {
  AuditEvent,
  CampaignCreative,
  CampaignIntent,
  DecisionExplanation,
  DecisionRejectedAlternative,
  OpenAIQualityReview,
  PromotionPackage,
  PromotionProvider,
  SensoCampaignContext,
  SensoProviderVerification
} from "../../schemas";

export type AdapterMode = "fixture" | "live";

export type IntegrationName = "openai" | "senso" | "linq" | "prava" | "n8nStorage";

export type OpenAIExtractCampaignIntentRequest = {
  ownerMessage: string;
  spotId?: string;
  currentTime?: string;
};

export type OpenAIExplainProviderDecisionRequest = {
  campaignId: string;
  selectedPackageId: string;
  selectedReasons: string[];
  rejectedAlternatives: DecisionRejectedAlternative[];
  riskFacts?: string[];
};

export type OpenAIGenerateCampaignCreativeRequest = {
  campaignId: string;
  packageId: string;
  spotName: string;
  timeWindow: string;
  offerText?: string;
  constraints?: Record<string, unknown>;
};

export type OpenAIReviewCampaignQualityRequest = {
  campaignId: string;
  creative: CampaignCreative;
  constraints?: Record<string, unknown>;
};

export interface OpenAIAdapter {
  readonly mode: AdapterMode;
  extractCampaignIntent(request: OpenAIExtractCampaignIntentRequest): Promise<CampaignIntent>;
  explainProviderDecision(request: OpenAIExplainProviderDecisionRequest): Promise<DecisionExplanation>;
  generateCampaignCreative(request: OpenAIGenerateCampaignCreativeRequest): Promise<CampaignCreative>;
  reviewCampaignQuality(request: OpenAIReviewCampaignQualityRequest): Promise<OpenAIQualityReview>;
}

export interface SensoAdapter {
  readonly mode: AdapterMode;
  verifyProvider(
    provider: PromotionProvider,
    promotionPackage: PromotionPackage,
    campaignContext: SensoCampaignContext
  ): Promise<SensoProviderVerification>;
}

export type LinqSendMessageRequest = {
  campaignId: string;
  recipient: string;
  body: string;
};

export type LinqSendMessageResult = {
  messageId: string;
  accepted: boolean;
};

export interface LinqAdapter {
  readonly mode: AdapterMode;
  sendMessage(request: LinqSendMessageRequest): Promise<LinqSendMessageResult>;
}

export type PravaAuthorizePaymentRequest = {
  campaignId: string;
  amountPaise: number;
  currency: "INR";
  idempotencyKey: string;
};

export type PravaAuthorizePaymentResult = {
  authorizationId: string;
  expiresAt: string;
  status: "AUTHORIZED";
};

export interface PravaAdapter {
  readonly mode: AdapterMode;
  authorizePayment(request: PravaAuthorizePaymentRequest): Promise<PravaAuthorizePaymentResult>;
}

export type N8nStorageRecord = Record<string, unknown>;

export interface N8nStorageAdapter {
  readonly mode: AdapterMode;
  getRecord(collection: string, id: string): Promise<N8nStorageRecord | null>;
  saveRecord(collection: string, id: string, value: N8nStorageRecord): Promise<N8nStorageRecord>;
  appendAuditEvent(event: AuditEvent): Promise<AuditEvent>;
}

export type IntegrationAdapters = {
  openai: OpenAIAdapter;
  senso: SensoAdapter;
  linq: LinqAdapter;
  prava: PravaAdapter;
  n8nStorage: N8nStorageAdapter;
};
