import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { createIntegrationAdapters, loadRuntimeConfig, type IntegrationAdapters } from "../../../lib/adapters";
import { CampaignService, CampaignServiceError } from "../../../lib/core/campaign-service";
import { createStorageRepository, type StorageRepository } from "../../../lib/repositories";
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
  reservation: ReservationSubmissionSchema.omit({ campaignId: true }).partial().optional()
});

type DemoBaseInput = z.infer<typeof demoBaseRequestSchema>;
type DemoContext = Awaited<ReturnType<typeof createDemoContext>>;
const demoAdapterCache = new Map<string, IntegrationAdapters>();

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

  throw error;
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
  const fixtureDataDir = await resolveFixtureDataDir();
  const repository = createStorageRepository({
    env: { USE_FIXTURES: "true" },
    fixtureDataDir
  });
  const adapterCacheKey = process.env.REVERB_FIXTURE_DATA_DIR ?? fixtureDataDir;

  return {
    service: new CampaignService(repository, getDemoAdapters(adapterCacheKey, config), clock),
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

async function resolveFixtureDataDir(): Promise<string> {
  if (process.env.REVERB_FIXTURE_DATA_DIR) {
    return process.env.REVERB_FIXTURE_DATA_DIR;
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-demo-fixtures-"));
  const temporaryDataDir = join(temporaryRoot, "data");
  await cp(join(process.cwd(), "fixtures", "data"), temporaryDataDir, { recursive: true });
  return temporaryDataDir;
}

function getDemoAdapters(cacheKey: string, config: ReturnType<typeof loadRuntimeConfig>): IntegrationAdapters {
  const cached = demoAdapterCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const adapters = createIntegrationAdapters(config);
  demoAdapterCache.set(cacheKey, adapters);
  return adapters;
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
      eligible: option.passesDeterministicChecks,
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

export async function runReservationStage(input: z.infer<typeof demoReservationRequestSchema>) {
  const { service } = await createDemoContext();
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

export async function runReportStage(input: z.infer<typeof demoReportRequestSchema>) {
  const { service, repository } = await createDemoContext();
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

export async function runFullLifecycle(input: z.infer<typeof demoLifecycleRequestSchema>) {
  const context = await createDemoContext(input);
  const campaignStage = await prepareCampaign(context);
  const approval = await context.service.recordOwnerApproval({
    campaignId: campaignStage.campaignId,
    ownerId: context.requestedByOwnerId,
    approved: true
  });
  const paymentSession = await context.service.createPaymentSession({ campaignId: campaignStage.campaignId });
  const checkout = await context.service.completeMerchantCheckout({
    campaignId: campaignStage.campaignId,
    sessionId: "fixture_prava_authorized"
  });
  const activation = await context.service.activatePromotion(campaignStage.campaignId);
  const reservation = await context.service.recordReservation({
    campaignId: campaignStage.campaignId,
    customerName: input.reservation?.customerName ?? "Demo Guest",
    customerContact: input.reservation?.customerContact ?? "demo@example.test",
    partySize: input.reservation?.partySize ?? 2,
    reservationTime: input.reservation?.reservationTime ?? "2026-08-07T14:00:00.000Z",
    trackingCode: input.reservation?.trackingCode ?? `demo_tracking_${campaignStage.campaignId}`,
    isDemoBooking: input.reservation?.isDemoBooking ?? true
  });
  const summary = await context.service.getCampaignSummary(campaignStage.campaignId);
  const auditEvents = await context.repository.listAuditEvents();

  return {
    mode: "fixture",
    campaignId: campaignStage.campaignId,
    finalStatus: summary.campaign.status,
    selectedOptionId: campaignStage.selectedOptionId,
    selectedPackageId: campaignStage.selectedPackageId,
    eligibleOptionCount: campaignStage.eligibleOptionCount,
    rejectedOptionCount: campaignStage.rejectedOptionCount,
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
    auditEventCount: auditEvents.length
  };
}
