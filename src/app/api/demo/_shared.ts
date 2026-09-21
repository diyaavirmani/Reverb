import { NextResponse } from "next/server";
import { z } from "zod";

import { createIntegrationAdapters, loadRuntimeConfig, type IntegrationAdapters } from "../../../lib/adapters";
import { CampaignService, CampaignServiceError } from "../../../lib/core/campaign-service";
import { InvalidCampaignTransitionError } from "../../../lib/core/campaign-state-machine";
import { createStorageRepository, type StorageRepository } from "../../../lib/repositories";
import { getSharedFixtureDataDir } from "../../../lib/repositories/shared-fixture-store";
import { ReservationSubmissionSchema } from "../../../schemas";

export const defaultCurrentTime = "2026-08-01T00:00:00.000Z";
export const defaultOwnerMessage =
  "Fill Friday 7-9 PM with 12 unused seats, target 6 reservations, budget Rs 5,000, maximum discount 15%, and maximum CPA Rs 850.";

export const demoBaseRequestSchema = z
  .object({
    spotId: z.string().min(1).optional(),
    requestedByOwnerId: z.string().min(1).optional(),
    ownerId: z.string().min(1).optional(),
    ownerMessage: z.string().min(1).optional()
  })
  .strict();

export const demoCampaignRequestSchema = demoBaseRequestSchema.extend({
  emptySeats: z.number().int().positive().optional(),
  unusedCapacity: z.number().int().positive().optional(),
  date: z.string().min(1).optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  targetReservations: z.number().int().positive().optional(),
  budgetPaise: z.number().int().positive().optional(),
  maximumBudgetPaise: z.number().int().positive().optional(),
  maxDiscountPercent: z.number().min(0).max(100).optional(),
  maximumDiscountPercent: z.number().min(0).max(100).optional(),
  maxCpaPaise: z.number().int().positive().optional(),
  maximumCpaPaise: z.number().int().positive().optional()
});

export const demoCommerceRequestSchema = demoBaseRequestSchema.extend({
  campaignId: z.string().min(1).optional(),
  ownerApproval: z.boolean().optional().default(true),
  approvedAmountPaise: z.number().int().nonnegative().optional(),
  maximumBudgetPaise: z.number().int().positive().optional()
});

export const demoReservationRequestSchema = z
  .object({
    campaignId: z.string().min(1),
    customerName: z.string().min(1).default("Demo Guest"),
    customerContact: z.string().min(1).default("demo@example.test"),
    partySize: z.number().int().positive().default(2),
    reservationTime: z.string().min(1).default("2026-08-07T14:00:00.000Z"),
    trackingCode: z.string().min(1).optional(),
    isDemoBooking: z.boolean().default(true)
  })
  .strict();

export const demoReportRequestSchema = z
  .object({
    campaignId: z.string().min(1)
  })
  .strict();

export const demoLifecycleRequestSchema = demoBaseRequestSchema.extend({
  reservation: ReservationSubmissionSchema.omit({ campaignId: true }).partial().optional(),
  prepareOnly: z.boolean().optional().default(false)
});

type DemoBaseInput = z.infer<typeof demoBaseRequestSchema>;
type DemoContext = Awaited<ReturnType<typeof createDemoContext>>;

declare global {
  var __reverbDemoAdapters: IntegrationAdapters | undefined;
}

export async function parseJsonRequest(request: Request) {
  try {
    return {
      ok: true as const,
      value: await request.json()
    };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    };
  }
}

export function invalidRequestResponse(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "Invalid request body.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    },
    { status: 400 }
  );
}

export function demoErrorResponse(error: unknown) {
  if (error instanceof CampaignServiceError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof InvalidCampaignTransitionError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "INVALID_CAMPAIGN_TRANSITION",
        from: error.from,
        to: error.to
      },
      { status: 422 }
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "Invalid lifecycle record.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  console.error("Unexpected demo API error", error);
  return NextResponse.json(
    {
      error: "Unexpected demo API error.",
      code: "INTERNAL_ERROR"
    },
    { status: 500 }
  );
}

export async function createDemoContext(input: DemoBaseInput = {}) {
  const config = loadRuntimeConfig({
    ...process.env,
    USE_FIXTURES: process.env.USE_FIXTURES ?? "true"
  });

  if (!config.useFixtures) {
    throw new CampaignServiceError(
      "FIXTURE_MODE_REQUIRED",
      "Direct demo APIs are available only in fixture mode.",
      409
    );
  }

  const clock = () => new Date(process.env.REVERB_CURRENT_TIME ?? defaultCurrentTime);
  const fixtureDataDir = await getSharedFixtureDataDir();
  const repository = createStorageRepository({
    env: { USE_FIXTURES: "true" },
    fixtureDataDir
  });

  return {
    service: new CampaignService(repository, getDemoAdapters(config), clock),
    repository,
    spotId: await resolveDemoSpotId(repository, input.spotId ?? process.env.DEMO_SPOT_ID),
    requestedByOwnerId: input.requestedByOwnerId ?? input.ownerId ?? "owner_diya_demo",
    ownerMessage: input.ownerMessage ?? defaultOwnerMessage
  };
}

async function resolveDemoSpotId(repository: StorageRepository, configuredSpotId?: string): Promise<string> {
  if (configuredSpotId) {
    const configuredSpot = await repository.getSpot(configuredSpotId);

    if (configuredSpot !== null) {
      return configuredSpot.id;
    }
  }

  const fixtureSpots = await repository.listSpots();
  const demoSpot = fixtureSpots.find((spot) => spot.id === "spot_quiet_cup_cafe") ?? fixtureSpots[0];

  if (!demoSpot) {
    throw new CampaignServiceError("SPOT_NOT_FOUND", "Spot was not found.", 404);
  }

  return demoSpot.id;
}

function getDemoAdapters(config: ReturnType<typeof loadRuntimeConfig>): IntegrationAdapters {
  if (!globalThis.__reverbDemoAdapters) {
    globalThis.__reverbDemoAdapters = createIntegrationAdapters(config);
  }

  return globalThis.__reverbDemoAdapters;
}

export async function runCampaignStage(input: z.infer<typeof demoCampaignRequestSchema>) {
  return prepareCampaign(await createDemoContext(input));
}

async function prepareCampaign(context: DemoContext) {
  const campaign = await context.service.createCampaignFromIntent({
    spotId: context.spotId,
    requestedByOwnerId: context.requestedByOwnerId,
    ownerMessage: context.ownerMessage
  });
  const discovery = await context.service.discoverOptions(campaign.id);
  const selection = await context.service.selectOption(campaign.id);
  if (selection.selectedOption === null) {
    const summary = await context.service.getCampaignSummary(campaign.id);
    return {
      ...buildCampaignStage(discovery.options, null, "NOT_STARTED", [], campaign.id, summary.campaign.status),
      outcome: "NO_ELIGIBLE_PACKAGE",
      finalStatus: summary.campaign.status
    };
  }
  const creative = await context.service.generateCreative(campaign.id);
  const quality = await context.service.runQualityChecks(campaign.id);
  const summary = await context.service.getCampaignSummary(campaign.id);

  return {
    mode: "fixture",
    campaignId: campaign.id,
    status: summary.campaign.status,
    selectedOptionId: selection.selectedOption?.id ?? null,
    selectedPackageId: selection.selectedOption?.packageId ?? null,
    eligibleOptionCount: discovery.options.filter((option) => option.passesDeterministicChecks).length,
    rejectedOptionCount: discovery.options.filter((option) => !option.passesDeterministicChecks).length,
    options: discovery.options.map((option) => ({
      id: option.id,
      packageId: option.packageId,
      score: option.score,
      totalCostPaise: option.totalCostPaise,
      expectedReservations: option.expectedReservations,
      expectedCpaPaise: option.expectedCpaPaise,
      discountBps: option.discountBps,
      eligible: option.passesDeterministicChecks,
      deterministicChecks: option.deterministicChecks,
      rejectionReasons: option.rejectionReasons
    })),
    qualityStatus: quality.review.status,
    assetIds: creative.assets.map((asset) => asset.id)
  };
}

export async function runCommerceStage(input: z.infer<typeof demoCommerceRequestSchema>) {
  if (!input.ownerApproval) {
    throw new CampaignServiceError("OWNER_APPROVAL_REQUIRED", "Owner approval must be true.", 409);
  }

  const context = await createDemoContext(input);
  const campaignId = input.campaignId ?? (await prepareCampaign(context)).campaignId;
  await assertCampaignOwner(context.repository, campaignId, input.requestedByOwnerId);
  const approval = await context.service.recordOwnerApproval({
    campaignId,
    ownerId: context.requestedByOwnerId,
    approved: true
  });
  const paymentSession = await context.service.createPaymentSession({ campaignId });
  const checkout = await context.service.completeMerchantCheckout({
    campaignId,
    sessionId: "fixture_prava_authorized"
  });
  const activation = await context.service.activatePromotion(campaignId);

  return {
    mode: "fixture",
    campaignId,
    ownerApprovalStatus: approval.approval.status,
    paymentSessionStatus: paymentSession.transaction.status,
    transactionStatus: checkout.transaction.status,
    merchantOrderId: checkout.order.id,
    activationStatus: activation.campaign.status,
    publicActivationUrl: activation.activation.publicActivationUrl,
    demoTransaction: true
  };
}

export async function runReservationStage(
  input: z.infer<typeof demoReservationRequestSchema>,
  requestedByOwnerId?: string
) {
  const { service, repository } = await createDemoContext({ requestedByOwnerId });
  await assertCampaignOwner(repository, input.campaignId, requestedByOwnerId);
  const trackingCode = input.trackingCode ?? `demo_tracking_${input.campaignId}`;
  const reservation = await service.recordReservation({
    campaignId: input.campaignId,
    customerName: input.customerName,
    customerContact: input.customerContact,
    partySize: input.partySize,
    reservationTime: input.reservationTime,
    trackingCode,
    isDemoBooking: input.isDemoBooking
  });
  const summary = await service.getCampaignSummary(input.campaignId);

  return {
    mode: "fixture",
    campaignId: input.campaignId,
    reservationId: reservation.reservation.id,
    isDemoBooking: reservation.reservation.isTest,
    performance: summary.performance
  };
}

export async function runReportStage(
  input: z.infer<typeof demoReportRequestSchema>,
  requestedByOwnerId?: string
) {
  const { service, repository } = await createDemoContext({ requestedByOwnerId });
  await assertCampaignOwner(repository, input.campaignId, requestedByOwnerId);
  const summary = await service.getCampaignSummary(input.campaignId);
  const reservations = await repository.listReservations(input.campaignId);
  const merchantOrder =
    summary.transaction?.merchantOrderId === null || summary.transaction?.merchantOrderId === undefined
      ? null
      : await repository.getMerchantOrder(summary.transaction.merchantOrderId);

  return {
    mode: "fixture",
    campaignId: input.campaignId,
    campaignStatus: summary.campaign.status,
    performance: summary.performance,
    selectedOption: summary.selectedOption,
    transaction: summary.transaction,
    merchantOrder,
    reservationCount: reservations.length
  };
}

async function assertCampaignOwner(
  repository: StorageRepository,
  campaignId: string,
  requestedByOwnerId?: string
): Promise<void> {
  if (!requestedByOwnerId) {
    return;
  }

  const campaign = await repository.getCampaign(campaignId);

  if (campaign === null || campaign.requestedByOwnerId !== requestedByOwnerId) {
    throw new CampaignServiceError("CAMPAIGN_NOT_FOUND", "Campaign was not found.", 404);
  }
}

export async function runFullLifecycle(input: z.infer<typeof demoLifecycleRequestSchema>) {
  const context = await createDemoContext(input);
  const trace: LifecycleTraceEvent[] = [];
  const campaign = await traced(trace, "campaign_request", "Campaign request created", {
    inputSummary: context.ownerMessage,
    run: () => context.service.createCampaignFromIntent({
      spotId: context.spotId,
      requestedByOwnerId: context.requestedByOwnerId,
      ownerMessage: context.ownerMessage
    }),
    outputSummary: (result) => `${result.unusedCapacity} unused seats; target ${result.targetReservations} reservations.`
  });
  const discovery = await traced(trace, "provider_discovery", "Provider packages discovered", {
    inputSummary: `Campaign ${campaign.id}`,
    run: () => context.service.discoverOptions(campaign.id),
    outputSummary: (result) => `${result.options.length} provider packages evaluated.`
  });
  const selection = await traced(trace, "provider_scoring", "Valid provider package selected", {
    inputSummary: `${discovery.options.length} evaluated options`,
    run: () => context.service.selectOption(campaign.id),
    outputSummary: (result) => result.selectedOption
      ? `${result.selectedOption.packageId} selected with score ${result.selectedOption.score}.`
      : "No package passed policy."
  });
  if (selection.selectedOption === null) {
    const rejectedSummary = await context.service.getCampaignSummary(campaign.id);
    const campaignStage = buildCampaignStage(
      discovery.options,
      null,
      "NOT_STARTED",
      [],
      campaign.id,
      rejectedSummary.campaign.status
    );
    const auditEvents = await context.repository.listAuditEvents();

    return {
      mode: "fixture",
      runId: `run_${campaign.id}`,
      campaignId: campaign.id,
      finalStatus: rejectedSummary.campaign.status,
      outcome: "NO_ELIGIBLE_PACKAGE",
      selectedOptionId: null,
      selectedPackageId: null,
      eligibleOptionCount: campaignStage.eligibleOptionCount,
      rejectedOptionCount: campaignStage.rejectedOptionCount,
      options: campaignStage.options,
      qualityStatus: "NOT_STARTED",
      ownerApprovalStatus: "NOT_STARTED",
      paymentSessionStatus: "NOT_STARTED",
      transactionStatus: "NOT_STARTED",
      merchantOrderId: null,
      activationStatus: "NOT_STARTED",
      publicActivationUrl: null,
      reservationId: null,
      isDemoBooking: true,
      performance: rejectedSummary.performance,
      auditEventCount: auditEvents.length,
      executionTrace: trace,
      policyChecks: []
    };
  }
  const creative = await traced(trace, "creative_preparation", "Campaign creative prepared", {
    inputSummary: `Selected package ${selection.selectedOption?.packageId ?? "none"}`,
    run: () => context.service.generateCreative(campaign.id),
    outputSummary: (result) => `${result.assets.length} approval-gated creative assets prepared.`
  });
  const quality = await traced(trace, "constraint_evaluation", "Creative and policy checks evaluated", {
    inputSummary: `${creative.assets.length} creative assets`,
    run: () => context.service.runQualityChecks(campaign.id),
    outputSummary: (result) => `Quality status ${result.review.status}; ${result.deterministicIssues.length} deterministic issues.`
  });
  const preparedSummary = await context.service.getCampaignSummary(campaign.id);
  const campaignStage = buildCampaignStage(discovery.options, selection.selectedOption, quality.review.status, creative.assets.map((asset) => asset.id), campaign.id, preparedSummary.campaign.status);
  const policyChecks = buildPolicyChecks(preparedSummary, campaignStage.options);

  if (input.prepareOnly) {
    const waitingAt = new Date().toISOString();
    trace.push({
      id: `${campaign.id}_owner_approval`,
      step: "owner_approval",
      status: "waiting",
      startedAt: waitingAt,
      endedAt: null,
      durationMs: null,
      summary: "Waiting for the owner to approve campaign spend.",
      inputSummary: "Human approval required",
      outputSummary: null
    });
    const auditEvents = await context.repository.listAuditEvents();
    return {
      mode: "fixture",
      runId: `run_${campaign.id}`,
      campaignId: campaign.id,
      finalStatus: preparedSummary.campaign.status,
      selectedOptionId: campaignStage.selectedOptionId,
      selectedPackageId: campaignStage.selectedPackageId,
      eligibleOptionCount: campaignStage.eligibleOptionCount,
      rejectedOptionCount: campaignStage.rejectedOptionCount,
      options: campaignStage.options,
      qualityStatus: campaignStage.qualityStatus,
      ownerApprovalStatus: "PENDING",
      paymentSessionStatus: "NOT_STARTED",
      transactionStatus: "NOT_STARTED",
      merchantOrderId: null,
      activationStatus: "NOT_STARTED",
      publicActivationUrl: null,
      reservationId: null,
      isDemoBooking: true,
      performance: preparedSummary.performance,
      auditEventCount: auditEvents.length,
      executionTrace: trace,
      policyChecks
    };
  }

  const approval = await traced(trace, "owner_approval", "Owner approved the campaign", {
    inputSummary: "Explicit owner approval: true",
    run: () => context.service.recordOwnerApproval({ campaignId: campaign.id, ownerId: context.requestedByOwnerId, approved: true }),
    outputSummary: (result) => `Approval status ${result.approval.status}.`
  });
  const paymentSession = await traced(trace, "demo_transaction", "Controlled demo transaction created", {
    inputSummary: `Approved campaign ${campaign.id}`,
    run: () => context.service.createPaymentSession({ campaignId: campaign.id }),
    outputSummary: (result) => `Fixture transaction status ${result.transaction.status}.`
  });
  const checkout = await context.service.completeMerchantCheckout({
    campaignId: campaign.id,
    sessionId: "fixture_prava_authorized"
  });
  const activation = await traced(trace, "campaign_activation", "Campaign activated", {
    inputSummary: `Merchant order ${checkout.order.id}`,
    run: () => context.service.activatePromotion(campaign.id),
    outputSummary: (result) => `Campaign status ${result.campaign.status}.`
  });
  const reservation = await traced(trace, "reservation", "Demo reservation received", {
    inputSummary: `${input.reservation?.partySize ?? 2} guests`,
    run: () => context.service.recordReservation({
      campaignId: campaign.id,
      customerName: input.reservation?.customerName ?? "Demo Guest",
      customerContact: input.reservation?.customerContact ?? "demo@example.test",
      partySize: input.reservation?.partySize ?? 2,
      reservationTime: input.reservation?.reservationTime ?? "2026-08-07T14:00:00.000Z",
      trackingCode: input.reservation?.trackingCode ?? `demo_tracking_${campaign.id}`,
      isDemoBooking: input.reservation?.isDemoBooking ?? true
    }),
    outputSummary: (result) => `Reservation ${result.reservation.id} recorded.`
  });
  const summary = await traced(trace, "performance", "Campaign performance recalculated", {
    inputSummary: `Campaign ${campaign.id}`,
    run: () => context.service.getCampaignSummary(campaign.id),
    outputSummary: (result) => `${result.performance.confirmedReservationCount} confirmed reservations.`
  });
  const auditEvents = await context.repository.listAuditEvents();

  return {
    mode: "fixture",
    runId: `run_${campaign.id}`,
    campaignId: campaign.id,
    finalStatus: summary.campaign.status,
    selectedOptionId: campaignStage.selectedOptionId,
    selectedPackageId: campaignStage.selectedPackageId,
    eligibleOptionCount: campaignStage.eligibleOptionCount,
    rejectedOptionCount: campaignStage.rejectedOptionCount,
    options: campaignStage.options,
    qualityStatus: campaignStage.qualityStatus,
    ownerApprovalStatus: approval.approval.status,
    paymentSessionStatus: paymentSession.transaction.status,
    transactionStatus: checkout.transaction.status,
    merchantOrderId: checkout.order.id,
    activationStatus: activation.campaign.status,
    publicActivationUrl: activation.activation.publicActivationUrl,
    reservationId: reservation.reservation.id,
    isDemoBooking: reservation.reservation.isTest,
    performance: summary.performance,
    auditEventCount: auditEvents.length,
    executionTrace: trace,
    policyChecks: buildPolicyChecks(summary, campaignStage.options)
  };
}

type LifecycleOption = ReturnType<typeof buildCampaignStage>["options"][number];
type LifecycleTraceEvent = {
  id: string;
  step: string;
  status: "complete" | "waiting" | "failed";
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  summary: string;
  inputSummary: string;
  outputSummary: string | null;
};

async function traced<T>(
  trace: LifecycleTraceEvent[],
  step: string,
  summary: string,
  operation: { inputSummary: string; run: () => Promise<T>; outputSummary: (result: T) => string }
): Promise<T> {
  const startedAt = new Date();
  const started = performance.now();
  try {
    const result = await operation.run();
    const endedAt = new Date();
    trace.push({
      id: `${step}_${trace.length + 1}`,
      step,
      status: "complete",
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, Math.round((performance.now() - started) * 100) / 100),
      summary,
      inputSummary: operation.inputSummary,
      outputSummary: operation.outputSummary(result)
    });
    return result;
  } catch (error) {
    const endedAt = new Date();
    trace.push({
      id: `${step}_${trace.length + 1}`,
      step,
      status: "failed",
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, Math.round((performance.now() - started) * 100) / 100),
      summary: error instanceof Error ? error.message : "Lifecycle step failed.",
      inputSummary: operation.inputSummary,
      outputSummary: null
    });
    throw error;
  }
}

function buildCampaignStage(
  options: Awaited<ReturnType<CampaignService["discoverOptions"]>>["options"],
  selectedOption: Awaited<ReturnType<CampaignService["selectOption"]>>["selectedOption"],
  qualityStatus: string,
  assetIds: string[],
  campaignId: string,
  status: string
) {
  const mappedOptions = options.map((option) => ({
    id: option.id,
    packageId: option.packageId,
    score: option.score,
    totalCostPaise: option.totalCostPaise,
    expectedReservations: option.expectedReservations,
    expectedCpaPaise: option.expectedCpaPaise,
    discountBps: option.discountBps,
    eligible: option.passesDeterministicChecks,
    deterministicChecks: option.deterministicChecks,
    rejectionReasons: option.rejectionReasons
  }));
  return {
    mode: "fixture",
    campaignId,
    status,
    selectedOptionId: selectedOption?.id ?? null,
    selectedPackageId: selectedOption?.packageId ?? null,
    eligibleOptionCount: options.filter((option) => option.passesDeterministicChecks).length,
    rejectedOptionCount: options.filter((option) => !option.passesDeterministicChecks).length,
    options: mappedOptions,
    qualityStatus,
    assetIds
  };
}

function buildPolicyChecks(
  summary: Awaited<ReturnType<CampaignService["getCampaignSummary"]>>,
  options: LifecycleOption[]
) {
  const selected = options.find((option) => option.id === summary.selectedOption?.id) ?? null;
  if (!selected) return [];
  return [
    { key: "budget", label: "Budget", status: selected.deterministicChecks.budget ? "PASS" : "FAIL", detail: `${selected.totalCostPaise} paise <= ${summary.campaign.maxBudgetPaise} paise` },
    { key: "cpa", label: "CPA", status: selected.deterministicChecks.cpa ? "PASS" : "FAIL", detail: `${selected.expectedCpaPaise} paise <= ${summary.campaign.maxExpectedCpaPaise} paise` },
    { key: "discount", label: "Discount", status: selected.deterministicChecks.discount ? "PASS" : "FAIL", detail: `${selected.discountBps / 100}% <= ${summary.campaign.maxDiscountBps / 100}%` },
    { key: "provider", label: "Provider verification", status: selected.eligible ? "PASS" : "FAIL", detail: selected.eligible ? "Selected package passed provider evidence policy." : "Provider evidence policy failed." },
    { key: "capacity", label: "Capacity", status: summary.performance.remainingCapacity >= 0 ? "PASS" : "FAIL", detail: `${summary.performance.remainingCapacity} seats remain available.` },
    { key: "approval", label: "Owner approval", status: summary.ownerApproval?.status === "APPROVED" ? "PASS" : "WAITING", detail: summary.ownerApproval?.status === "APPROVED" ? "Explicit owner approval recorded." : "Campaign cannot launch without owner approval." }
  ];
}
