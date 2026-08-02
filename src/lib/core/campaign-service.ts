import { randomUUID } from "node:crypto";

import type { IntegrationAdapters } from "../adapters";
import type { StorageRepository } from "../repositories";
import {
  InMemoryPaymentAttemptGuard,
  generateIdempotencyKey,
  type PaymentAttemptGuard
} from "../security/idempotency";
import { transitionCampaign } from "./campaign-state-machine";
import {
  evaluatePromotionPackage,
  type PromotionPolicyCampaign,
  type PromotionPolicyEvidence,
  type PromotionPolicyPackage
} from "./policy-engine";
import { scorePromotionPackage, selectBestPackage, type ProviderScoredPackage } from "./provider-scoring";
import { ReachExchangeError, ReachExchangeService } from "./reach-exchange";
import { ReservationService } from "./reservations";
import {
  AuditEventSchema,
  CampaignAssetSchema,
  CampaignDecisionSchema,
  CampaignPerformanceReportSchema,
  CampaignSchema,
  OwnerApprovalSchema,
  QualityReviewSchema,
  ReachCheckoutResultSchema,
  TransactionSchema,
  type Campaign,
  type CampaignOption,
  type CampaignStatus,
  type MerchantOrder,
  type OpenAIQualityReview,
  type PromotionPackage,
  type PromotionProvider,
  type ReachCheckoutResult,
  type ReservationSubmission,
  type SensoProviderVerification,
  type Spot
} from "../../schemas";

const decisions = "campaign-decisions";
const creatives = "campaign-creatives";
const reviews = "quality-reviews";
const approvals = "owner-approvals";
const sessions = "payment-sessions";
const activations = "promotion-activations";
const callbackUrl = "https://reverb-fill.example.test/api/prava/result";
const reachMerchantName = "Reverb Reach Exchange";

export class CampaignServiceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
    this.name = "CampaignServiceError";
  }
}

export type CampaignServiceOptions = {
  paymentAttemptGuard?: PaymentAttemptGuard;
  checkoutProvider?: Pick<ReachExchangeService, "checkout">;
};

export class CampaignService {
  private readonly reach: ReachExchangeService;
  private readonly reservations: ReservationService;
  private readonly paymentAttemptGuard: PaymentAttemptGuard;
  private readonly checkoutProvider: Pick<ReachExchangeService, "checkout">;

  constructor(
    private readonly repository: StorageRepository,
    private readonly adapters: IntegrationAdapters,
    private readonly clock: () => Date = () => new Date(),
    options: CampaignServiceOptions = {}
  ) {
    this.reach = new ReachExchangeService(repository, clock);
    this.reservations = new ReservationService(repository, clock);
    this.paymentAttemptGuard = options.paymentAttemptGuard ?? new InMemoryPaymentAttemptGuard();
    this.checkoutProvider = options.checkoutProvider ?? this.reach;
  }

  async createCampaignFromIntent(input: {
    spotId: string;
    requestedByOwnerId: string;
    ownerMessage: string;
  }) {
    const spot = await this.requireSpot(input.spotId);
    const intent = await this.adapters.openai.extractCampaignIntent({
      ownerMessage: input.ownerMessage,
      spotId: spot.id,
      currentTime: this.now()
    });
    const now = this.now();
    const campaign = CampaignSchema.parse({
      id: `campaign_${randomUUID()}`,
      spotId: spot.id,
      requestedByOwnerId: input.requestedByOwnerId,
      status: "DRAFT",
      requestSummary: input.ownerMessage,
      slotStartAt: intent.startTime,
      slotEndAt: intent.endTime,
      unusedCapacity: intent.unusedCapacity,
      targetReservations: intent.targetReservations,
      maxBudgetPaise: intent.maximumBudgetPaise,
      maxDiscountBps: intent.maximumDiscountPercent * 100,
      maxExpectedCpaPaise: intent.maximumExpectedCpaPaise,
      createdAt: now,
      updatedAt: now
    });

    await this.repository.createCampaign(campaign);
    return this.transition(
      campaign,
      intent.missingFields.length === 0 ? "READY_FOR_DISCOVERY" : "NEEDS_INFORMATION",
      "CAMPAIGN_CREATED_FROM_INTENT",
      "Campaign created from owner intent.",
      { missingFields: intent.missingFields }
    );
  }

  async discoverOptions(campaignId: string) {
    let campaign = await this.requireCampaign(campaignId);
    const spot = await this.requireSpot(campaign.spotId);
    campaign = await this.transition(
      campaign,
      "VERIFYING_PROVIDERS",
      "PROVIDER_VERIFICATION_STARTED",
      "Started Senso provider verification."
    );
    const providers = await this.repository.listProviders();
    const packages = await this.repository.listPromotionPackages();
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const options: CampaignOption[] = [];

    for (const promotionPackage of packages) {
      const provider = providerById.get(promotionPackage.providerId);
      if (!provider) continue;

      const verification = await this.adapters.senso.verifyProvider(
        provider,
        promotionPackage,
        this.sensoContext(campaign, spot)
      );
      const policyCampaign = this.policyCampaign(campaign, spot);
      const policyPackage = this.policyPackage(promotionPackage, provider, verification);
      const policyEvidence = this.policyEvidence(provider, promotionPackage, verification, spot);
      const evaluation = evaluatePromotionPackage(policyCampaign, policyPackage, policyEvidence, this.clock());
      const scored = scorePromotionPackage({
        campaign: policyCampaign,
        promotionPackage: policyPackage,
        providerEvidence: policyEvidence,
        policyEvaluation: evaluation
      });
      const rejects = new Set(evaluation.rejectionCodes);
      options.push({
        id: `option_${campaign.id}_${promotionPackage.id}`,
        campaignId: campaign.id,
        packageId: promotionPackage.id,
        evidenceIds: [policyEvidence.id],
        score: Math.round(scored.weightedFinalScore),
        totalCostPaise: promotionPackage.pricePaise,
        expectedReservations: promotionPackage.expectedReservations,
        expectedCpaPaise: evaluation.worstCaseExpectedCpaPaise ?? promotionPackage.expectedCpaPaise,
        discountBps: promotionPackage.discountBps,
        deterministicChecks: {
          budget: !rejects.has("BUDGET_EXCEEDED"),
          deadline: !rejects.has("PUBLICATION_DEADLINE_TOO_LATE"),
          price: !rejects.has("PRICE_CHANGED"),
          merchant: !rejects.has("MERCHANT_CHANGED"),
          discount: promotionPackage.discountBps <= campaign.maxDiscountBps,
          cpa: !rejects.has("WORST_CASE_CPA_EXCEEDED")
        },
        passesDeterministicChecks: evaluation.eligible,
        rejectionReasons: evaluation.rejectionReasons,
        generatedSummary: scored.eligible ? scored.strengths.join(",") : scored.risks.join(","),
        createdAt: this.now()
      });
    }

    await this.repository.saveCampaignOptions(campaign.id, options);
    const eligibleCount = options.filter((option) => option.passesDeterministicChecks).length;
    campaign = await this.transition(
      campaign,
      eligibleCount > 0 ? "OPTIONS_READY" : "REJECTED_BY_POLICY",
      eligibleCount > 0 ? "CAMPAIGN_OPTIONS_READY" : "NO_ELIGIBLE_OPTIONS",
      eligibleCount > 0 ? "Eligible promotion options are ready." : "No promotion options passed deterministic checks.",
      { optionCount: options.length, eligibleOptionCount: eligibleCount }
    );
    return { campaign, options };
  }

  async selectOption(campaignId: string) {
    let campaign = await this.requireCampaign(campaignId);
    const options = await this.repository.getCampaignOptions(campaign.id);
    const selected = selectBestPackage(await this.scoredFromOptions(campaign, options));
    const selectedOption = selected
      ? options.find((option) => option.packageId === selected.packageId) ?? null
      : null;
    const decision = CampaignDecisionSchema.parse({
      id: `decision_${campaign.id}`,
      campaignId: campaign.id,
      selectedOptionId: selectedOption?.id ?? null,
      status: selectedOption ? "SELECTED" : "NO_VALID_OPTIONS",
      deterministicChecks: selectedOption?.deterministicChecks ?? allChecks(false),
      decisionReason: selectedOption
        ? `Selected ${selectedOption.packageId} using deterministic provider scoring.`
        : "No eligible promotion package passed deterministic checks.",
      decidedBy: "SYSTEM",
      decidedAt: this.now()
    });

    await this.adapters.n8nStorage.saveRecord(decisions, campaign.id, { ...decision });
    campaign = await this.transition(
      campaign,
      selectedOption ? "GENERATING_CREATIVE" : "REJECTED_BY_POLICY",
      selectedOption ? "CAMPAIGN_OPTION_SELECTED" : "CAMPAIGN_OPTION_REJECTED",
      decision.decisionReason,
      { selectedOptionId: selectedOption?.id ?? null, selectedPackageId: selectedOption?.packageId ?? null }
    );
    return { campaign, decision, selectedOption };
  }
  async generateCreative(campaignId: string) {
    let campaign = await this.requireCampaign(campaignId);
    const spot = await this.requireSpot(campaign.spotId);
    const selectedOption = await this.requireSelectedOption(campaign.id);
    const promotionPackage = await this.requirePromotionPackage(selectedOption.packageId);
    const creative = await this.adapters.openai.generateCampaignCreative({
      campaignId: campaign.id,
      packageId: promotionPackage.id,
      spotName: spot.name,
      timeWindow: `${campaign.slotStartAt} to ${campaign.slotEndAt}`,
      offerText: `Up to ${campaign.maxDiscountBps / 100}% off`,
      constraints: {
        budgetPaise: campaign.maxBudgetPaise,
        expectedCpaPaise: selectedOption.expectedCpaPaise,
        providerId: promotionPackage.providerId,
        packageId: promotionPackage.id
      }
    });
    const model = this.adapters.openai.mode === "fixture" ? "fixture-openai-model" : "configured-openai-model";
    const now = this.now();
    const assets = [
      CampaignAssetSchema.parse({
        id: `asset_${campaign.id}_promotion_copy`,
        campaignId: campaign.id,
        optionId: selectedOption.id,
        type: "PROMOTION_COPY",
        content: [creative.headline, creative.caption, creative.offerText, creative.callToAction].join("\n\n"),
        generatedBy: "OPENAI",
        model,
        requiresOwnerApproval: true,
        createdAt: now
      }),
      CampaignAssetSchema.parse({
        id: `asset_${campaign.id}_message`,
        campaignId: campaign.id,
        optionId: selectedOption.id,
        type: "MESSAGE",
        content: `${creative.caption}\n\n${creative.callToAction}`,
        generatedBy: "OPENAI",
        model,
        requiresOwnerApproval: true,
        createdAt: now
      }),
      CampaignAssetSchema.parse({
        id: `asset_${campaign.id}_provider_brief`,
        campaignId: campaign.id,
        optionId: selectedOption.id,
        type: "OWNER_SUMMARY",
        content: creative.providerBrief,
        generatedBy: "OPENAI",
        model,
        requiresOwnerApproval: true,
        createdAt: now
      }),
      CampaignAssetSchema.parse({
        id: `asset_${campaign.id}_image_prompt`,
        campaignId: campaign.id,
        optionId: selectedOption.id,
        type: "IMAGE_PROMPT",
        content: creative.imagePrompt,
        generatedBy: "OPENAI",
        model,
        requiresOwnerApproval: true,
        createdAt: now
      })
    ];

    for (const asset of assets) await this.repository.saveCampaignAsset(asset);
    await this.adapters.n8nStorage.saveRecord(creatives, campaign.id, {
      campaignId: campaign.id,
      selectedOptionId: selectedOption.id,
      packageId: promotionPackage.id,
      creative,
      assetIds: assets.map((asset) => asset.id),
      createdAt: now
    });
    campaign = await this.transition(campaign, "QUALITY_REVIEW", "CAMPAIGN_CREATIVE_GENERATED", "Campaign creative generated for quality review.", {
      assetIds: assets.map((asset) => asset.id),
      packageId: promotionPackage.id
    });
    return { campaign, assets };
  }

  async runQualityChecks(campaignId: string) {
    let campaign = await this.requireCampaign(campaignId);
    const spot = await this.requireSpot(campaign.spotId);
    const selectedOption = await this.requireSelectedOption(campaign.id);
    const promotionPackage = await this.requirePromotionPackage(selectedOption.packageId);
    const provider = await this.requireProvider(promotionPackage.providerId);
    const creativeRecord = await this.requireCreative(campaign.id);
    const deterministicIssues = this.deterministicQualityIssues(
      campaign,
      spot,
      selectedOption,
      promotionPackage,
      provider,
      creativeRecord.creative
    );
    const aiReview = await this.adapters.openai.reviewCampaignQuality({
      campaignId: campaign.id,
      creative: creativeRecord.creative,
      constraints: {
        spotName: spot.name,
        campaignDate: campaign.slotStartAt,
        discountBps: campaign.maxDiscountBps,
        budgetPaise: campaign.maxBudgetPaise,
        providerId: provider.id,
        packageId: promotionPackage.id,
        expectedCpaPaise: selectedOption.expectedCpaPaise,
        deadline: promotionPackage.bookingDeadlineAt
      }
    });
    const aiIssues = aiReviewIssues(aiReview);
    const allIssues = [...deterministicIssues, ...aiIssues];
    const review = QualityReviewSchema.parse({
      id: `quality_${campaign.id}`,
      campaignId: campaign.id,
      assetIds: creativeRecord.assetIds,
      status: allIssues.length === 0 ? "PASSED" : aiReview.approved ? "NEEDS_REVISION" : "FAILED",
      issues: allIssues,
      reviewedBy: "SYSTEM",
      reviewedAt: this.now()
    });

    await this.adapters.n8nStorage.saveRecord(reviews, campaign.id, { ...review });
    campaign = await this.transition(
      campaign,
      review.status === "PASSED" ? "AWAITING_OWNER_APPROVAL" : "REJECTED_BY_POLICY",
      review.status === "PASSED" ? "QUALITY_REVIEW_PASSED" : "QUALITY_REVIEW_FAILED",
      review.status === "PASSED" ? "Campaign passed deterministic and AI quality review." : "Campaign failed quality review.",
      { deterministicIssues, aiIssues, brandToneScore: aiReview.brandToneScore, clarityScore: aiReview.clarityScore }
    );
    return { campaign, review, deterministicIssues, aiReview };
  }

  async recordOwnerApproval(input: { campaignId: string; ownerId: string; approved: boolean; expiresAt?: string }) {
    let campaign = await this.requireCampaign(input.campaignId);
    const selectedOption = await this.requireSelectedOption(campaign.id);
    const now = this.now();
    const approval = OwnerApprovalSchema.parse({
      id: `approval_${campaign.id}`,
      campaignId: campaign.id,
      ownerId: input.ownerId,
      selectedOptionId: selectedOption.id,
      status: input.approved ? "APPROVED" : "DECLINED",
      approvedBudgetPaise: input.approved ? campaign.maxBudgetPaise : 0,
      approvedAt: input.approved ? now : null,
      expiresAt: input.expiresAt ?? new Date(this.clock().getTime() + 30 * 60_000).toISOString(),
      createdAt: now
    });

    await this.adapters.n8nStorage.saveRecord(approvals, campaign.id, { ...approval });
    campaign = await this.transition(
      campaign,
      input.approved ? "PRAVA_PENDING" : "OWNER_DECLINED",
      input.approved ? "OWNER_APPROVED_CAMPAIGN" : "OWNER_DECLINED_CAMPAIGN",
      input.approved ? "Owner approved the selected campaign option." : "Owner declined the selected campaign option.",
      { approvalId: approval.id, selectedOptionId: selectedOption.id, approvedBudgetPaise: approval.approvedBudgetPaise },
      "OWNER",
      input.ownerId
    );
    return { campaign, approval };
  }

  async createPaymentSession(input: { campaignId: string; callbackUrl?: string }) {
    const campaign = await this.requireCampaign(input.campaignId);
    this.assertCampaignStatus(campaign, "PRAVA_PENDING", "create a payment session");
    const selectedOption = await this.requireSelectedOption(campaign.id);
    const approval = await this.requireApproval(campaign.id);
    const promotionPackage = await this.requirePromotionPackage(selectedOption.packageId);
    const idempotencyKey = generateIdempotencyKey("prava-session", campaign.id, promotionPackage.id);
    const session = await this.adapters.prava.createSession({
      campaignId: campaign.id,
      merchantId: promotionPackage.merchantId,
      packageId: promotionPackage.id,
      merchantName: reachMerchantName,
      packageName: promotionPackage.title,
      amountPaise: selectedOption.totalCostPaise,
      currency: "INR",
      callbackUrl: input.callbackUrl ?? callbackUrl,
      idempotencyKey
    });
    const now = this.now();
    const transaction = TransactionSchema.parse({
      id: `transaction_${campaign.id}`,
      campaignId: campaign.id,
      ownerApprovalId: approval.id,
      providerId: promotionPackage.providerId,
      packageId: promotionPackage.id,
      status: session.status === "AUTHORIZED" ? "AUTHORIZED" : "SESSION_CREATED",
      currency: "INR",
      amountPaise: session.amountPaise,
      idempotencyKey,
      pravaAuthorizationId: null,
      checkoutAttemptedAt: null,
      merchantOrderId: null,
      createdAt: now,
      updatedAt: now
    });

    await this.repository.saveTransaction(transaction);
    await this.adapters.n8nStorage.saveRecord(sessions, campaign.id, {
      campaignId: campaign.id,
      providerSessionId: session.sessionId,
      sessionStatus: session.status,
      currency: session.currency,
      amountPaise: session.amountPaise,
      expiresAt: session.expiresAt,
      isFixture: session.isFixture,
      idempotencyKey,
      transactionId: transaction.id,
      createdAt: now
    });
    await this.repository.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      eventType: "PRAVA_SESSION_CREATED",
      actorType: "PRAVA",
      occurredAt: now,
      idempotencyKey,
      previousState: null,
      nextState: transaction.status,
      metadata: {
        campaignId: campaign.id,
        providerSessionId: session.sessionId,
        amountPaise: transaction.amountPaise,
        isFixture: session.isFixture
      }
    });
    return { campaign, transaction, sessionId: session.sessionId, checkoutUrl: session.checkoutUrl };
  }

  async completeMerchantCheckout(input: { campaignId: string; sessionId?: string }) {
    let campaign = await this.requireCampaign(input.campaignId);
    const existingTransaction = await this.requireTransaction(campaign.id);

    if (existingTransaction.checkoutAttemptedAt !== null) {
      throw checkoutAlreadyAttempted(campaign.id);
    }

    this.assertCampaignStatus(campaign, "PRAVA_PENDING", "complete merchant checkout");
    await this.requireApproval(campaign.id);
    const selectedOption = await this.requireSelectedOption(campaign.id);
    const promotionPackage = await this.requirePromotionPackage(selectedOption.packageId);
    const paymentSession = await this.requirePaymentSession(campaign.id);
    const sessionId = input.sessionId ?? paymentSession.providerSessionId;
    const existingGuardState = await this.paymentAttemptGuard.getState(campaign.id);

    if (existingGuardState !== null) {
      throw checkoutAlreadyAttempted(campaign.id);
    }

    const paymentResult = await this.adapters.prava.getPaymentResult({
      campaignId: campaign.id,
      sessionId,
      idempotencyKey: paymentSession.idempotencyKey
    });

    if (paymentResult.status !== "AUTHORIZED" || paymentResult.authorizationId === null) {
      const failedTransaction = TransactionSchema.parse({
        ...existingTransaction,
        status: paymentTransactionFailureStatus(paymentResult.status),
        pravaAuthorizationId: null,
        updatedAt: this.now()
      });
      await this.saveTransactionState(
        existingTransaction,
        failedTransaction,
        "PRAVA_PAYMENT_NOT_AUTHORIZED",
        paymentSession.idempotencyKey,
        { paymentStatus: paymentResult.status }
      );
      await this.transition(
        campaign,
        paymentFailureStatus(paymentResult.status),
        "PRAVA_PAYMENT_NOT_AUTHORIZED",
        "Prava payment result did not authorize checkout.",
        { transactionId: failedTransaction.id, paymentStatus: paymentResult.status },
        "PRAVA"
      );
      throw new CampaignServiceError("PAYMENT_NOT_AUTHORIZED", "Payment was not authorized by Prava.", 409);
    }

    let transaction = TransactionSchema.parse({
      ...existingTransaction,
      status: "AUTHORIZED",
      pravaAuthorizationId: null,
      updatedAt: this.now()
    });
    await this.saveTransactionState(
      existingTransaction,
      transaction,
      "PRAVA_PAYMENT_AUTHORIZED",
      paymentSession.idempotencyKey,
      { providerSessionId: sessionId }
    );
    campaign = await this.transition(
      campaign,
      "PAYMENT_AUTHORIZED",
      "PRAVA_PAYMENT_AUTHORIZED",
      "Prava authorized the owner-approved checkout.",
      { providerSessionId: sessionId, transactionId: transaction.id },
      "PRAVA"
    );
    campaign = await this.transition(
      campaign,
      "CHECKOUT_IN_PROGRESS",
      "MERCHANT_CHECKOUT_STARTED",
      "Provider checkout started after Prava authorization.",
      { packageId: promotionPackage.id, transactionId: transaction.id }
    );

    await this.paymentAttemptGuard.acquire(campaign.id, sessionId);
    const checkoutIdempotencyKey = generateIdempotencyKey(
      "reach-checkout",
      campaign.id,
      promotionPackage.id
    );
    const attemptedTransaction = TransactionSchema.parse({
      ...transaction,
      status: "CHECKOUT_ATTEMPTED",
      pravaAuthorizationId: null,
      checkoutAttemptedAt: this.now(),
      updatedAt: this.now()
    });
    await this.saveTransactionState(
      transaction,
      attemptedTransaction,
      "MERCHANT_CHECKOUT_ATTEMPTED",
      checkoutIdempotencyKey,
      { packageId: promotionPackage.id, merchantId: promotionPackage.merchantId }
    );
    await this.paymentAttemptGuard.markAttempted(campaign.id, sessionId);
    transaction = attemptedTransaction;

    let checkout: ReachCheckoutResult;
    let order: MerchantOrder | null;

    try {
      checkout = await this.checkoutProvider.checkout({
        campaignId: campaign.id,
        packageId: promotionPackage.id,
        approvedMerchantId: promotionPackage.merchantId,
        approvedAmountPaise: selectedOption.totalCostPaise,
        idempotencyKey: checkoutIdempotencyKey,
        paymentAuthorisationReference: paymentResult.authorizationId
      });
      order = await this.repository.getMerchantOrder(checkout.orderId);

      if (order === null) {
        throw new CampaignServiceError(
          "MERCHANT_ORDER_MISSING",
          "Merchant order must exist before checkout can be reported successful.",
          500
        );
      }
    } catch (error) {
      order = await this.reconcileMerchantOrder(checkoutIdempotencyKey);

      if (order === null) {
        await this.failCheckout({
          campaign,
          transaction,
          sessionId,
          promotionPackage,
          checkoutIdempotencyKey,
          error
        });
        throw safeCheckoutError(error);
      }

      checkout = this.reconciledCheckoutResult(
        campaign.id,
        promotionPackage,
        checkoutIdempotencyKey,
        order
      );
    }

    return this.completeCheckoutWithOrder({
      campaign,
      transaction,
      sessionId,
      promotionPackage,
      checkoutIdempotencyKey,
      checkout,
      order
    });
  }
  async activatePromotion(campaignId: string) {
    let campaign = await this.requireCampaign(campaignId);
    const transaction = await this.requireTransaction(campaign.id);
    if (transaction.merchantOrderId === null) {
      throw new CampaignServiceError("MERCHANT_ORDER_REQUIRED", "Promotion cannot activate before a merchant order exists.", 409);
    }
    const creative = await this.requireCreative(campaign.id);
    await this.reach.deliver(transaction.merchantOrderId, {
      approvedCreative: [creative.creative.headline, creative.creative.caption, creative.creative.offerText, creative.creative.callToAction].join("\n\n"),
      campaignBrief: creative.creative.providerBrief,
      idempotencyKey: generateIdempotencyKey(
        "reach-delivery",
        campaign.id,
        transaction.merchantOrderId
      )
    });
    campaign = await this.transition(campaign, "ACTIVATING", "PROMOTION_ACTIVATION_STARTED", "Provider brief delivered and promotion activation started.", { merchantOrderId: transaction.merchantOrderId });
    const activation = await this.reach.activate(transaction.merchantOrderId, {
      idempotencyKey: generateIdempotencyKey(
        "reach-activation",
        campaign.id,
        transaction.merchantOrderId
      )
    });
    await this.adapters.n8nStorage.saveRecord(activations, campaign.id, {
      campaignId: campaign.id,
      merchantOrderId: transaction.merchantOrderId,
      publicActivationUrl: activation.publicActivationUrl,
      activatedAt: this.now()
    });
    campaign = await this.transition(campaign, "ACTIVE", "PROMOTION_ACTIVATED", "Promotion is active with a public activation URL.", {
      merchantOrderId: transaction.merchantOrderId,
      publicActivationUrl: activation.publicActivationUrl
    });
    return { campaign, activation };
  }

  async recordReservation(input: ReservationSubmission) {
    return this.reservations.createReservation(input);
  }

  async getCampaignSummary(campaignId: string) {
    const campaign = await this.requireCampaign(campaignId);
    const spot = await this.requireSpot(campaign.spotId);
    const decision = await this.getDecision(campaign.id);
    const selectedOption = decision?.selectedOptionId ? await this.requireOption(campaign.id, decision.selectedOptionId) : null;
    const ownerApproval = await this.getApproval(campaign.id);
    const transaction = await this.repository.getTransaction(`transaction_${campaign.id}`);
    const performance = CampaignPerformanceReportSchema.parse(await this.repository.getCampaignPerformance(campaign.id));
    return { campaign, spot, selectedOption, decision, ownerApproval, transaction, performance };
  }

  private async transition(
    campaign: Campaign,
    to: CampaignStatus,
    eventType: string,
    description: string,
    metadata: Record<string, unknown> = {},
    actorType: "OWNER" | "SYSTEM" | "OPENAI" | "SENSO" | "PRAVA" | "PROVIDER" | "LINQ" | "N8N" = "SYSTEM",
    actorId?: string
  ) {
    const result = transitionCampaign(campaign, to, { eventType, description, metadata, actorType, actorId, occurredAt: this.now() });
    await this.repository.updateCampaign(result.campaign);
    await this.repository.appendAuditEvent(result.auditEvent);
    return result.campaign;
  }

  private sensoContext(campaign: Campaign, spot: Spot) {
    return {
      campaignId: campaign.id,
      spotId: spot.id,
      spotName: spot.name,
      category: spot.category,
      city: spot.address.city,
      region: spot.address.region,
      countryCode: spot.address.countryCode,
      slotStartAt: campaign.slotStartAt,
      slotEndAt: campaign.slotEndAt,
      maximumBudgetPaise: campaign.maxBudgetPaise,
      maximumExpectedCpaPaise: campaign.maxExpectedCpaPaise
    };
  }

  private policyCampaign(campaign: Campaign, spot: Spot): PromotionPolicyCampaign {
    return { ...campaign, spot: { id: spot.id, address: spot.address } };
  }

  private policyPackage(promotionPackage: PromotionPackage, provider: PromotionProvider, verification: SensoProviderVerification): PromotionPolicyPackage {
    return {
      ...promotionPackage,
      pricePaise: verification.verifiedPricePaise ?? promotionPackage.pricePaise,
      isAvailable: provider.isActive,
      hasRecurringBilling: false,
      minimumExpectedBookings: verification.historicalBookingMin,
      publicationDeadlineAt: verification.verifiedPublicationDeadline ?? promotionPackage.bookingDeadlineAt
    };
  }

  private policyEvidence(provider: PromotionProvider, promotionPackage: PromotionPackage, verification: SensoProviderVerification, spot: Spot): PromotionPolicyEvidence {
    const firstReference = verification.sourceReferences[0];
    return {
      id: firstReference?.id ?? `evidence_${provider.id}_${promotionPackage.id}`,
      providerId: provider.id,
      packageId: promotionPackage.id,
      status: verification.verificationStatus,
      source: "SENSO",
      ...(firstReference?.url ? { evidenceUrl: firstReference.url } : {}),
      summary: verification.verifiedDeliverable ?? (verification.warnings.join(", ") || "No provider evidence available."),
      collectedAt: firstReference?.observedAt ?? this.now(),
      verifiedAt: verification.verificationStatus === "UNVERIFIED" ? undefined : this.now(),
      createdAt: this.now(),
      confidence: verification.evidenceConfidence,
      audienceGeography: verification.localAudiencePercent >= 50
        ? { city: spot.address.city, region: spot.address.region, countryCode: spot.address.countryCode }
        : { city: "unverified-market", region: spot.address.region, countryCode: spot.address.countryCode }
    };
  }

  private async scoredFromOptions(campaign: Campaign, options: CampaignOption[]): Promise<ProviderScoredPackage[]> {
    const scored: ProviderScoredPackage[] = [];
    for (const option of options) {
      const promotionPackage = await this.requirePromotionPackage(option.packageId);
      scored.push({
        packageId: option.packageId,
        providerId: promotionPackage.providerId,
        eligible: option.passesDeterministicChecks,
        rejectionCodes: [],
        scoreComponents: { geographicRelevance: 0, expectedBookingPotential: 0, evidenceConfidence: 0, costEfficiency: 0, timingAvailability: 0 },
        weightedFinalScore: option.score,
        expectedCpaMinimumPaise: option.expectedCpaPaise,
        expectedCpaMaximumPaise: option.expectedCpaPaise,
        worstCaseExpectedCpaPaise: option.expectedCpaPaise,
        remainingBudgetPaise: campaign.maxBudgetPaise - option.totalCostPaise,
        publicationDeadlineAt: promotionPackage.bookingDeadlineAt,
        strengths: option.passesDeterministicChecks ? ["eligible"] : [],
        risks: option.rejectionReasons
      });
    }
    return scored;
  }

  private deterministicQualityIssues(campaign: Campaign, spot: Spot, option: CampaignOption, promotionPackage: PromotionPackage, provider: PromotionProvider, creative: CreativeRecord["creative"]): string[] {
    const issues: string[] = [];
    const content = [creative.headline, creative.caption, creative.offerText, creative.callToAction, creative.providerBrief].join(" ");
    const normalizedContent = normalizeFactText(content);
    if (!spotNameMatches(spot.name, normalizedContent)) issues.push("spot_name_missing_or_inaccurate");
    if (!normalizedContent.includes(normalizeFactText(weekdayName(campaign.slotStartAt, spot.timezone)))) issues.push("campaign_date_missing_or_inaccurate");
    if (!containsLocalTimeRange(normalizedContent, campaign.slotStartAt, campaign.slotEndAt, spot.timezone)) issues.push("campaign_time_missing_or_inaccurate");
    if (!containsPercentage(normalizedContent, promotionPackage.discountBps / 100)) issues.push("discount_missing_or_inaccurate");
    if (!containsLabeledAmount(normalizedContent, "budget", campaign.maxBudgetPaise)) issues.push("budget_missing_or_inaccurate");
    if (!containsLabeledText(normalizedContent, "provider", provider.name)) issues.push("provider_missing_or_inaccurate");
    if (!containsLabeledText(normalizedContent, "package", promotionPackage.title)) issues.push("package_missing_or_inaccurate");
    if (!containsLabeledAmount(normalizedContent, "expected cpa", option.expectedCpaPaise)) issues.push("expected_cpa_missing_or_inaccurate");
    if (!containsLabeledDateTime(normalizedContent, "publication deadline", promotionPackage.bookingDeadlineAt, spot.timezone)) issues.push("deadline_missing_or_inaccurate");
    if (promotionPackage.discountBps > campaign.maxDiscountBps) issues.push("discount_exceeds_campaign_limit");
    if (option.totalCostPaise > campaign.maxBudgetPaise) issues.push("budget_exceeds_campaign_limit");
    if (!provider.isActive) issues.push("provider_inactive");
    if (promotionPackage.id !== option.packageId) issues.push("package_mismatch");
    if (option.expectedCpaPaise > campaign.maxExpectedCpaPaise) issues.push("expected_cpa_exceeds_campaign_limit");
    if (Date.parse(promotionPackage.bookingDeadlineAt) > Date.parse(campaign.slotStartAt)) issues.push("deadline_after_campaign_start");
    if (creative.callToAction.trim() === "") issues.push("cta_missing");
    return issues;
  }

  private async requireCampaign(id: string) {
    const campaign = await this.repository.getCampaign(id);
    if (campaign === null) throw new CampaignServiceError("CAMPAIGN_NOT_FOUND", "Campaign was not found.", 404);
    return campaign;
  }

  private async requireSpot(id: string) {
    const spot = await this.repository.getSpot(id);
    if (spot === null) throw new CampaignServiceError("SPOT_NOT_FOUND", "Spot was not found.", 404);
    return spot;
  }

  private async requireProvider(id: string) {
    const provider = await this.repository.getProvider(id);
    if (provider === null) throw new CampaignServiceError("PROVIDER_NOT_FOUND", "Provider was not found.", 404);
    return provider;
  }

  private async requirePromotionPackage(id: string) {
    const promotionPackage = await this.repository.getPromotionPackage(id);
    if (promotionPackage === null) throw new CampaignServiceError("PACKAGE_NOT_FOUND", "Promotion package was not found.", 404);
    return promotionPackage;
  }

  private async requireOption(campaignId: string, optionId: string) {
    const option = (await this.repository.getCampaignOptions(campaignId)).find((candidate) => candidate.id === optionId);
    if (!option) throw new CampaignServiceError("OPTION_NOT_FOUND", "Campaign option was not found.", 404);
    return option;
  }

  private async requireSelectedOption(campaignId: string) {
    const decision = await this.getDecision(campaignId);
    if (decision === null || decision.selectedOptionId === null) throw new CampaignServiceError("SELECTED_OPTION_NOT_FOUND", "Selected campaign option was not found.", 409);
    return this.requireOption(campaignId, decision.selectedOptionId);
  }

  private async getDecision(campaignId: string) {
    const record = await this.adapters.n8nStorage.getRecord(decisions, campaignId);
    return record === null ? null : CampaignDecisionSchema.parse(record);
  }

  private async getApproval(campaignId: string) {
    const record = await this.adapters.n8nStorage.getRecord(approvals, campaignId);
    return record === null ? null : OwnerApprovalSchema.parse(record);
  }

  private assertCampaignStatus(
    campaign: Campaign,
    expectedStatus: CampaignStatus,
    operation: string
  ): void {
    if (campaign.status !== expectedStatus) {
      throw new CampaignServiceError(
        "INVALID_CAMPAIGN_STATUS",
        `Campaign must be ${expectedStatus} to ${operation}.`,
        409
      );
    }
  }

  private async saveTransactionState(
    previous: ReturnType<typeof TransactionSchema.parse>,
    next: ReturnType<typeof TransactionSchema.parse>,
    eventType: string,
    idempotencyKey: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.repository.saveTransaction(next);
    await this.repository.appendAuditEvent(
      AuditEventSchema.parse({
        id: `audit_${randomUUID()}`,
        entityType: "TRANSACTION",
        entityId: next.id,
        eventType,
        actorType: "SYSTEM",
        actorId: "campaign-service",
        occurredAt: this.now(),
        idempotencyKey,
        previousState: previous.status,
        nextState: next.status,
        metadata: {
          campaignId: next.campaignId,
          ...metadata
        }
      })
    );
  }

  private async reconcileMerchantOrder(idempotencyKey: string): Promise<MerchantOrder | null> {
    const events = await this.repository.listAuditEvents({ entityType: "MERCHANT_ORDER" });
    const checkoutEvent = events.findLast(
      (event) =>
        event.eventType === "REACH_CHECKOUT_COMPLETED" &&
        event.idempotencyKey === idempotencyKey
    );
    const orderId = checkoutEvent?.metadata.orderId;

    if (typeof orderId !== "string" || orderId.trim() === "") {
      return null;
    }

    return this.repository.getMerchantOrder(orderId);
  }

  private reconciledCheckoutResult(
    campaignId: string,
    promotionPackage: PromotionPackage,
    idempotencyKey: string,
    order: MerchantOrder
  ): ReachCheckoutResult {
    return ReachCheckoutResultSchema.parse({
      orderId: order.id,
      externalMerchantOrderId: order.externalMerchantOrderId,
      campaignId,
      packageId: promotionPackage.id,
      merchantId: promotionPackage.merchantId,
      merchantName: reachMerchantName,
      amountPaise: order.amountPaise,
      currency: order.currency,
      status: order.status,
      idempotencyKey,
      duplicate: true
    });
  }

  private async completeCheckoutWithOrder(input: {
    campaign: Campaign;
    transaction: ReturnType<typeof TransactionSchema.parse>;
    sessionId: string;
    promotionPackage: PromotionPackage;
    checkoutIdempotencyKey: string;
    checkout: ReachCheckoutResult;
    order: MerchantOrder;
  }) {
    await this.paymentAttemptGuard.markCompleted(input.campaign.id, input.sessionId);
    const completedTransaction = TransactionSchema.parse({
      ...input.transaction,
      status: "COMPLETED",
      pravaAuthorizationId: null,
      merchantOrderId: input.order.id,
      updatedAt: this.now()
    });
    await this.saveTransactionState(
      input.transaction,
      completedTransaction,
      "MERCHANT_CHECKOUT_COMPLETED",
      input.checkoutIdempotencyKey,
      { merchantOrderId: input.order.id }
    );
    const completedCampaign = await this.transition(
      input.campaign,
      "ORDER_COMPLETED",
      "MERCHANT_ORDER_CREATED",
      "Merchant order exists and checkout completed.",
      { transactionId: completedTransaction.id, merchantOrderId: input.order.id }
    );
    await this.reportPravaCheckoutOutcome({
      campaignId: input.campaign.id,
      transaction: completedTransaction,
      sessionId: input.sessionId,
      promotionPackage: input.promotionPackage,
      checkoutOutcome: "MERCHANT_ORDER_CREATED",
      merchantOrderId: input.order.id
    });

    return {
      campaign: completedCampaign,
      transaction: completedTransaction,
      order: input.order,
      checkout: input.checkout
    };
  }

  private async failCheckout(input: {
    campaign: Campaign;
    transaction: ReturnType<typeof TransactionSchema.parse>;
    sessionId: string;
    promotionPackage: PromotionPackage;
    checkoutIdempotencyKey: string;
    error: unknown;
  }): Promise<void> {
    const failureReason = checkoutFailureReason(input.error);
    await this.paymentAttemptGuard.markFailed(input.campaign.id, input.sessionId, failureReason);
    const failedTransaction = TransactionSchema.parse({
      ...input.transaction,
      status: "FAILED",
      pravaAuthorizationId: null,
      updatedAt: this.now()
    });
    await this.saveTransactionState(
      input.transaction,
      failedTransaction,
      "MERCHANT_CHECKOUT_FAILED",
      input.checkoutIdempotencyKey,
      { failureReason }
    );
    await this.transition(
      input.campaign,
      checkoutFailureCampaignStatus(input.error),
      "MERCHANT_CHECKOUT_FAILED",
      "Provider checkout failed without a merchant order.",
      { transactionId: failedTransaction.id, failureReason }
    );
    await this.reportPravaCheckoutOutcome({
      campaignId: input.campaign.id,
      transaction: failedTransaction,
      sessionId: input.sessionId,
      promotionPackage: input.promotionPackage,
      checkoutOutcome: "CHECKOUT_FAILED",
      merchantOrderId: null,
      failureReason
    });
  }

  private async reportPravaCheckoutOutcome(input: {
    campaignId: string;
    transaction: ReturnType<typeof TransactionSchema.parse>;
    sessionId: string;
    promotionPackage: PromotionPackage;
    checkoutOutcome: "MERCHANT_ORDER_CREATED" | "CHECKOUT_FAILED";
    merchantOrderId: string | null;
    failureReason?: string;
  }): Promise<void> {
    const idempotencyKey = generateIdempotencyKey(
      "prava-checkout-outcome",
      input.campaignId,
      input.checkoutOutcome
    );

    try {
      const result = await this.adapters.prava.reportCheckoutOutcome({
        campaignId: input.campaignId,
        merchantId: input.promotionPackage.merchantId,
        packageId: input.promotionPackage.id,
        merchantName: reachMerchantName,
        packageName: input.promotionPackage.title,
        amountPaise: input.transaction.amountPaise,
        currency: "INR",
        callbackUrl,
        idempotencyKey,
        sessionId: input.sessionId,
        checkoutOutcome: input.checkoutOutcome,
        merchantOrderId: input.merchantOrderId,
        occurredAt: this.now(),
        ...(input.failureReason ? { failureReason: input.failureReason } : {})
      });
      await this.repository.appendAuditEvent(
        AuditEventSchema.parse({
          id: `audit_${randomUUID()}`,
          entityType: "TRANSACTION",
          entityId: input.transaction.id,
          eventType: "PRAVA_CHECKOUT_OUTCOME_REPORTED",
          actorType: "PRAVA",
          occurredAt: this.now(),
          idempotencyKey,
          previousState: input.transaction.status,
          nextState: input.transaction.status,
          metadata: {
            campaignId: input.campaignId,
            checkoutOutcome: input.checkoutOutcome,
            merchantOrderId: input.merchantOrderId,
            reportStatus: result.status
          }
        })
      );
    } catch {
      await this.repository.appendAuditEvent(
        AuditEventSchema.parse({
          id: `audit_${randomUUID()}`,
          entityType: "TRANSACTION",
          entityId: input.transaction.id,
          eventType: "PRAVA_CHECKOUT_OUTCOME_REPORT_FAILED",
          actorType: "SYSTEM",
          actorId: "campaign-service",
          occurredAt: this.now(),
          idempotencyKey,
          previousState: input.transaction.status,
          nextState: input.transaction.status,
          metadata: {
            campaignId: input.campaignId,
            checkoutOutcome: input.checkoutOutcome,
            merchantOrderId: input.merchantOrderId
          }
        })
      );
    }
  }
  private async requireApproval(campaignId: string) {
    const approval = await this.getApproval(campaignId);
    if (approval === null) {
      throw new CampaignServiceError("OWNER_APPROVAL_REQUIRED", "Owner approval is required.", 409);
    }
    if (approval.status === "EXPIRED" || Date.parse(approval.expiresAt) <= this.clock().getTime()) {
      throw new CampaignServiceError("OWNER_APPROVAL_EXPIRED", "Owner approval has expired.", 409);
    }
    if (approval.status !== "APPROVED") {
      throw new CampaignServiceError("OWNER_APPROVAL_REQUIRED", "Owner approval is required.", 409);
    }
    return approval;
  }

  private async requireTransaction(campaignId: string) {
    const transaction = await this.repository.getTransaction(`transaction_${campaignId}`);
    if (transaction === null) throw new CampaignServiceError("TRANSACTION_NOT_FOUND", "Transaction was not found.", 404);
    return transaction;
  }

  private async requireCreative(campaignId: string): Promise<CreativeRecord> {
    const record = await this.adapters.n8nStorage.getRecord(creatives, campaignId);
    if (record === null) throw new CampaignServiceError("CREATIVE_NOT_FOUND", "Campaign creative was not found.", 404);
    return parseCreative(record);
  }

  private async requirePaymentSession(campaignId: string): Promise<PaymentSessionRecord> {
    const record = await this.adapters.n8nStorage.getRecord(sessions, campaignId);
    if (record === null) throw new CampaignServiceError("PAYMENT_SESSION_NOT_FOUND", "Payment session was not found.", 404);
    return parsePaymentSession(record);
  }

  private now() {
    return this.clock().toISOString();
  }
}
type CreativeRecord = {
  campaignId: string;
  selectedOptionId: string;
  packageId: string;
  creative: {
    headline: string;
    caption: string;
    offerText: string;
    callToAction: string;
    providerBrief: string;
    imagePrompt: string;
  };
  assetIds: string[];
  createdAt: string;
};

type PaymentSessionRecord = {
  campaignId: string;
  providerSessionId: string;
  idempotencyKey: string;
  transactionId: string;
  createdAt: string;
};
function parseCreative(record: Record<string, unknown>): CreativeRecord {
  const creative = record.creative as CreativeRecord["creative"] | undefined;
  const assetIds = record.assetIds;
  if (!creative || !Array.isArray(assetIds) || assetIds.some((assetId) => typeof assetId !== "string")) {
    throw new CampaignServiceError("CREATIVE_RECORD_INVALID", "Campaign creative record is invalid.", 500);
  }
  return {
    campaignId: requiredString(record.campaignId, "campaignId"),
    selectedOptionId: requiredString(record.selectedOptionId, "selectedOptionId"),
    packageId: requiredString(record.packageId, "packageId"),
    creative,
    assetIds,
    createdAt: requiredString(record.createdAt, "createdAt")
  };
}

function parsePaymentSession(record: Record<string, unknown>): PaymentSessionRecord {
  return {
    campaignId: requiredString(record.campaignId, "campaignId"),
    providerSessionId: requiredString(record.providerSessionId, "providerSessionId"),
    idempotencyKey: requiredString(record.idempotencyKey, "idempotencyKey"),
    transactionId: requiredString(record.transactionId, "transactionId"),
    createdAt: requiredString(record.createdAt, "createdAt")
  };
}
function allChecks(value: boolean) {
  return { budget: value, deadline: value, price: value, merchant: value, discount: value, cpa: value };
}

function paymentFailureStatus(status: string): CampaignStatus {
  return status === "EXPIRED" ? "PRAVA_EXPIRED" : "PAYMENT_DECLINED";
}

function paymentTransactionFailureStatus(
  status: string
): "AWAITING_USER" | "DECLINED" | "EXPIRED" | "FAILED" {
  if (status === "AWAITING_USER" || status === "DECLINED" || status === "EXPIRED") {
    return status;
  }
  return "FAILED";
}

function checkoutAlreadyAttempted(campaignId: string): CampaignServiceError {
  return new CampaignServiceError(
    "CHECKOUT_ALREADY_ATTEMPTED",
    `A Prava credential cannot be reused after checkout is attempted for campaign ${campaignId}.`,
    409
  );
}

function checkoutFailureCampaignStatus(error: unknown): CampaignStatus {
  if (error instanceof ReachExchangeError && error.code === "PRICE_CHANGED") {
    return "PRICE_CHANGED";
  }
  if (error instanceof ReachExchangeError && error.code === "PROVIDER_UNAVAILABLE") {
    return "PROVIDER_UNAVAILABLE";
  }
  return "CHECKOUT_FAILED";
}

function checkoutFailureReason(error: unknown): string {
  if (isTimeoutError(error)) return "provider_timeout";
  if (error instanceof ReachExchangeError && error.code === "PRICE_CHANGED") return "price_changed";
  if (error instanceof ReachExchangeError && error.code === "PROVIDER_UNAVAILABLE") {
    return "provider_unavailable";
  }
  if (error instanceof CampaignServiceError && error.code === "MERCHANT_ORDER_MISSING") {
    return "merchant_order_missing";
  }
  return "provider_checkout_failed";
}

function safeCheckoutError(error: unknown): CampaignServiceError {
  if (isTimeoutError(error)) {
    return new CampaignServiceError(
      "CHECKOUT_TIMEOUT",
      "Provider checkout timed out and no merchant order was found.",
      504
    );
  }
  if (error instanceof ReachExchangeError && error.code === "PRICE_CHANGED") {
    return new CampaignServiceError("PRICE_CHANGED", "Provider price changed before checkout.", 409);
  }
  if (error instanceof ReachExchangeError && error.code === "PROVIDER_UNAVAILABLE") {
    return new CampaignServiceError("PROVIDER_UNAVAILABLE", "Provider is unavailable.", 409);
  }
  if (error instanceof CampaignServiceError && error.code === "MERCHANT_ORDER_MISSING") {
    return error;
  }
  return new CampaignServiceError(
    "CHECKOUT_FAILED",
    "Provider checkout failed and no merchant order was found.",
    502
  );
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return error.name === "AbortError" || error.name === "TimeoutError" || code === "ETIMEDOUT";
}

function aiReviewIssues(review: OpenAIQualityReview): string[] {
  const issues: string[] = [];
  if (!review.approved) issues.push("ai_review_not_approved");
  if (review.brandToneScore < 70) issues.push("tone_score_below_threshold");
  if (review.clarityScore < 70) issues.push("clarity_score_below_threshold");
  if (review.unsupportedClaims.length > 0) issues.push("unsupported_claims_present");
  if (review.issues.some((issue) => normalize(issue).includes("grammar"))) issues.push("grammar_issue_present");
  return [...issues, ...review.issues];
}

function spotNameMatches(spotName: string, normalizedContent: string): boolean {
  const tokens = spotName
    .split(/\s+/)
    .map(normalize)
    .filter((token) => token.length > 2 && !["cafe", "restaurant", "the"].includes(token));
  return tokens.length > 0 && tokens.every((token) => normalizedContent.includes(token));
}

function weekdayName(isoTimestamp: string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(new Date(isoTimestamp));
}

function normalizeFactText(value: string): string {
  return value
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/[^a-z0-9%:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPercentage(content: string, percent: number): boolean {
  return content.includes(`${percent}%`);
}

function containsLabeledText(content: string, label: string, value: string): boolean {
  return content.includes(`${normalizeFactText(label)} ${normalizeFactText(value)}`);
}

function containsLabeledAmount(content: string, label: string, amountPaise: number): boolean {
  const rupees = amountPaise / 100;
  const normalizedLabel = normalizeFactText(label);
  return [
    `${normalizedLabel} inr ${rupees}`,
    `${normalizedLabel} rs ${rupees}`,
    `${normalizedLabel} ${rupees}`
  ].some((candidate) => content.includes(candidate));
}

function containsLabeledDateTime(
  content: string,
  label: string,
  isoTimestamp: string,
  timeZone: string
): boolean {
  const weekday = normalizeFactText(weekdayName(isoTimestamp, timeZone));
  const time = localTime(isoTimestamp, timeZone);
  return content.includes(`${normalizeFactText(label)} ${weekday} ${time}`);
}

function containsLocalTimeRange(
  content: string,
  startTimestamp: string,
  endTimestamp: string,
  timeZone: string
): boolean {
  const start = localTime(startTimestamp, timeZone);
  const end = localTime(endTimestamp, timeZone);
  const [startValue, startPeriod] = start.split(" ");
  const [endValue, endPeriod] = end.split(" ");
  const variants = [`${start}-${end}`, `${startValue}-${end}`];
  if (startPeriod === endPeriod) variants.push(`${startValue}-${endValue} ${endPeriod}`);
  return variants.some((variant) => content.includes(variant));
}

function localTime(isoTimestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone
  })
    .format(new Date(isoTimestamp))
    .toLowerCase()
    .replace(":00", "");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CampaignServiceError("STORAGE_RECORD_INVALID", `${label} is required.`, 500);
  }
  return value;
}