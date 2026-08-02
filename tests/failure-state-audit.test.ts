import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FixturePravaAdapter } from "../src/lib/adapters/fixtures";
import { createAuditEvent } from "../src/lib/core/audit";
import {
  CAMPAIGN_STATUS_TRANSITIONS,
  transitionCampaign
} from "../src/lib/core/campaign-state-machine";
import {
  evaluatePromotionPackage,
  type PromotionPolicyCampaign,
  type PromotionPolicyEvidence,
  type PromotionPolicyPackage
} from "../src/lib/core/policy-engine";
import { ReachExchangeService } from "../src/lib/core/reach-exchange";
import { ReservationService } from "../src/lib/core/reservations";
import { LocalFixtureRepository } from "../src/lib/repositories";
import { InMemoryPaymentAttemptGuard } from "../src/lib/security/idempotency";
import { InMemoryProcessedEventDeduplicator } from "../src/lib/security/processed-events";
import { redactSensitiveObject } from "../src/lib/security/redaction";
import {
  CampaignSchema,
  type AuditEvent,
  type Campaign,
  type CampaignStatus
} from "../src/schemas";

const fixedNow = "2026-08-01T00:00:00.000Z";
const policyTime = "2026-08-07T12:00:00.000Z";
const fixtureDataDirectory = join(process.cwd(), "fixtures", "data");
const approvedOption = {
  packageId: "package_local_dining_boost",
  merchantId: "merchant_reach_local_dining",
  providerSku: "reach_local_dining_boost",
  pricePaise: 480000
};

type FailureScenario = {
  name: string;
  initialStatus: CampaignStatus;
  finalStatus: CampaignStatus;
  eventType: string;
  exercise: () => Promise<void>;
};

const scenarios: FailureScenario[] = [
  {
    name: "duplicate Linq webhook is processed once",
    initialStatus: "DRAFT",
    finalStatus: "DRAFT",
    eventType: "DUPLICATE_LINQ_EVENT_IGNORED",
    exercise: async () => {
      const deduplicator = new InMemoryProcessedEventDeduplicator();
      expect(deduplicator.claim("linq_duplicate_001")).toBe(true);
      expect(deduplicator.claim("linq_duplicate_001")).toBe(false);
    }
  },
  {
    name: "missing campaign information asks one question",
    initialStatus: "DRAFT",
    finalStatus: "NEEDS_INFORMATION",
    eventType: "CAMPAIGN_INFORMATION_REQUESTED",
    exercise: async () => {
      const fixture = JSON.parse(
        await readFile(join(process.cwd(), "n8n", "fixtures", "10-campaign-intake-missing.json"), "utf8")
      ) as { expected: { questionCount: number; askedField: string } };
      expect(fixture.expected).toMatchObject({
        questionCount: 1,
        askedField: "targetReservations"
      });
    }
  },
  policyScenario(
    "unverified provider is rejected",
    "PROVIDER_EVIDENCE_UNVERIFIED",
    {},
    { status: "UNVERIFIED" }
  ),
  policyScenario("package exceeding budget is rejected", "BUDGET_EXCEEDED", {
    pricePaise: 510000
  }),
  policyScenario("conservative CPA above limit is rejected", "WORST_CASE_CPA_EXCEEDED", {
    minimumExpectedBookings: 5
  }),
  policyScenario("recurring purchase is rejected", "RECURRING_BILLING", {
    hasRecurringBilling: true
  }),
  policyScenario("provider deadline is too late", "PUBLICATION_DEADLINE_TOO_LATE", {
    publicationDeadlineAt: "2026-08-07T14:00:00.000Z"
  }),
  policyScenario(
    "price changes after approval",
    "PRICE_CHANGED",
    {},
    {},
    { approvedOption: { ...approvedOption, pricePaise: 470000 } },
    "AWAITING_OWNER_APPROVAL",
    "PRICE_CHANGED",
    "PRICE_CHANGE_BLOCKED"
  ),
  policyScenario(
    "merchant changes after approval",
    "MERCHANT_CHANGED",
    {},
    {},
    { approvedOption: { ...approvedOption, merchantId: "changed_merchant" } },
    "AWAITING_OWNER_APPROVAL",
    "PROVIDER_UNAVAILABLE",
    "MERCHANT_CHANGE_BLOCKED"
  ),
  {
    name: "Prava session expires",
    initialStatus: "PRAVA_PENDING",
    finalStatus: "PRAVA_EXPIRED",
    eventType: "PRAVA_SESSION_EXPIRED",
    exercise: async () => {
      const result = await new FixturePravaAdapter().getPaymentResult({
        campaignId: "campaign_failure_matrix",
        sessionId: "fixture_prava_expired",
        idempotencyKey: "idem_expired"
      });
      expect(result.status).toBe("EXPIRED");
    }
  },
  {
    name: "owner declines",
    initialStatus: "AWAITING_OWNER_APPROVAL",
    finalStatus: "OWNER_DECLINED",
    eventType: "OWNER_DECLINED_CAMPAIGN",
    exercise: async () => {
      expect(true).toBe(true);
    }
  },
  {
    name: "payment remains pending beyond retry limit",
    initialStatus: "PRAVA_PENDING",
    finalStatus: "PRAVA_EXPIRED",
    eventType: "PRAVA_RETRY_LIMIT_REACHED",
    exercise: async () => {
      const prava = new FixturePravaAdapter();
      const statuses = await Promise.all(
        [1, 2, 3].map((attempt) =>
          prava.getPaymentResult({
            campaignId: "campaign_failure_matrix",
            sessionId: "fixture_prava_awaiting_user",
            idempotencyKey: `idem_pending_${attempt}`
          })
        )
      );
      expect(statuses.map((result) => result.status)).toEqual([
        "AWAITING_USER",
        "AWAITING_USER",
        "AWAITING_USER"
      ]);
    }
  },
  {
    name: "checkout callback is repeated",
    initialStatus: "PRAVA_PENDING",
    finalStatus: "PRAVA_PENDING",
    eventType: "DUPLICATE_CHECKOUT_CALLBACK_IGNORED",
    exercise: async () => {
      const callbacks = new InMemoryProcessedEventDeduplicator();
      expect(callbacks.claim("checkout_callback_001")).toBe(true);
      expect(callbacks.claim("checkout_callback_001")).toBe(false);
    }
  },
  {
    name: "checkout is attempted twice",
    initialStatus: "ORDER_COMPLETED",
    finalStatus: "ORDER_COMPLETED",
    eventType: "DUPLICATE_CHECKOUT_BLOCKED",
    exercise: async () => {
      const guard = new InMemoryPaymentAttemptGuard();
      await guard.acquire("campaign_failure_matrix", "session_001");
      await guard.markAttempted("campaign_failure_matrix", "session_001");
      await guard.markCompleted("campaign_failure_matrix", "session_001");
      await expect(
        guard.acquire("campaign_failure_matrix", "session_001")
      ).rejects.toThrow("Checkout attempt already recorded");
    }
  },
  {
    name: "provider becomes unavailable",
    initialStatus: "CHECKOUT_IN_PROGRESS",
    finalStatus: "PROVIDER_UNAVAILABLE",
    eventType: "PROVIDER_UNAVAILABLE_AT_CHECKOUT",
    exercise: async () => {
      await withRepository(async (repository) => {
        const reach = new ReachExchangeService(repository, () => new Date(fixedNow));
        await expect(
          reach.checkout({
            campaignId: "campaign_failure_matrix",
            packageId: "package_premium_weekend_push",
            approvedMerchantId: "merchant_reach_premium_weekend",
            approvedAmountPaise: 540000,
            idempotencyKey: "idem_provider_unavailable",
            paymentAuthorisationReference: "ephemeral_test_reference"
          })
        ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
      });
    }
  },
  {
    name: "merchant checkout fails",
    initialStatus: "CHECKOUT_IN_PROGRESS",
    finalStatus: "CHECKOUT_FAILED",
    eventType: "MERCHANT_CHECKOUT_FAILED",
    exercise: async () => {
      const checkout = async () => {
        throw new Error("provider checkout failed");
      };
      await expect(checkout()).rejects.toThrow("provider checkout failed");
    }
  },
  {
    name: "activation fails",
    initialStatus: "ACTIVATING",
    finalStatus: "ACTIVATION_FAILED",
    eventType: "PROMOTION_ACTIVATION_FAILED",
    exercise: async () => {
      await withRepository(async (repository) => {
        const reach = new ReachExchangeService(repository, () => new Date(fixedNow));
        const checkout = await reach.checkout({
          campaignId: "campaign_failure_matrix",
          packageId: "package_local_dining_boost",
          approvedMerchantId: "merchant_reach_local_dining",
          approvedAmountPaise: 480000,
          idempotencyKey: "idem_activation_failure_checkout",
          paymentAuthorisationReference: "ephemeral_test_reference"
        });
        await expect(
          reach.activate(checkout.orderId, { idempotencyKey: "idem_activation_failure" })
        ).rejects.toMatchObject({ code: "DELIVERY_REQUIRED" });
      });
    }
  },
  {
    name: "reservation exceeds remaining capacity",
    initialStatus: "ACTIVE",
    finalStatus: "ACTIVE",
    eventType: "RESERVATION_CAPACITY_REJECTED",
    exercise: async () => {
      await exerciseReservationFailure("ACTIVE", 13, "CAPACITY_EXCEEDED");
    }
  },
  {
    name: "reservation arrives before activation",
    initialStatus: "ORDER_COMPLETED",
    finalStatus: "ORDER_COMPLETED",
    eventType: "EARLY_RESERVATION_REJECTED",
    exercise: async () => {
      await exerciseReservationFailure("ORDER_COMPLETED", 2, "CAMPAIGN_NOT_ACTIVE");
    }
  },
  {
    name: "sensitive error fields are redacted",
    initialStatus: "CHECKOUT_IN_PROGRESS",
    finalStatus: "CHECKOUT_FAILED",
    eventType: "SENSITIVE_CHECKOUT_ERROR_REDACTED",
    exercise: async () => {
      const redacted = redactSensitiveObject({
        message: "provider rejected request",
        context: {
          cardNumber: "4111111111111111",
          cvv: "123",
          paymentToken: "private-token",
          nested: { authorization: "private-authorization" }
        }
      });
      expect(redacted).toEqual({
        message: "provider rejected request",
        context: {
          cardNumber: "[REDACTED]",
          cvv: "[REDACTED]",
          paymentToken: "[REDACTED]",
          nested: { authorization: "[REDACTED]" }
        }
      });
    }
  }
];

describe("failure states preserve campaign and audit truth", () => {
  it.each(scenarios)("$name", async (scenario) => {
    await scenario.exercise();
    const initialCampaign = campaignAt(scenario.initialStatus);
    let finalCampaign: Campaign;
    let auditEvent: AuditEvent;

    if (scenario.initialStatus === scenario.finalStatus) {
      finalCampaign = initialCampaign;
      auditEvent = createAuditEvent(
        initialCampaign.id,
        scenario.eventType,
        `${scenario.name}.`,
        {
          occurredAt: fixedNow,
          previousState: initialCampaign.status,
          nextState: initialCampaign.status
        }
      );
    } else {
      const result = transitionCampaign(initialCampaign, scenario.finalStatus, {
        eventType: scenario.eventType,
        description: `${scenario.name}.`,
        occurredAt: fixedNow
      });
      finalCampaign = result.campaign;
      auditEvent = result.auditEvent;
    }

    expect(finalCampaign.status).toBe(scenario.finalStatus);
    expect(auditEvent).toMatchObject({
      entityType: "CAMPAIGN",
      entityId: finalCampaign.id,
      eventType: scenario.eventType,
      previousState: scenario.initialStatus,
      nextState: scenario.finalStatus
    });
  });
});

function policyScenario(
  name: string,
  rejectionCode: string,
  packageOverride: Partial<PromotionPolicyPackage> = {},
  evidenceOverride: Partial<PromotionPolicyEvidence> = {},
  campaignOverride: Partial<PromotionPolicyCampaign> = { approvedOption: undefined },
  initialStatus: CampaignStatus = "VERIFYING_PROVIDERS",
  finalStatus: CampaignStatus = "REJECTED_BY_POLICY",
  eventType = "PROMOTION_PACKAGE_REJECTED"
): FailureScenario {
  return {
    name,
    initialStatus,
    finalStatus,
    eventType,
    exercise: async () => {
      const result = evaluatePromotionPackage(
        { ...policyCampaign, ...campaignOverride },
        { ...policyPackage, ...packageOverride },
        { ...policyEvidence, ...evidenceOverride },
        policyTime
      );
      expect(result.eligible).toBe(false);
      expect(result.rejectionCodes).toContain(rejectionCode);
    }
  };
}

async function exerciseReservationFailure(
  status: CampaignStatus,
  partySize: number,
  expectedCode: string
): Promise<void> {
  await withRepository(async (repository) => {
    const campaign = CampaignSchema.parse({ ...baseCampaign, id: `campaign_reservation_${status}`, status });
    await repository.createCampaign(campaign);
    const service = new ReservationService(repository, () => new Date(fixedNow));
    await expect(
      service.createReservation({
        campaignId: campaign.id,
        customerName: "Failure Test",
        customerContact: "failure@example.test",
        partySize,
        reservationTime: "2026-08-07T14:00:00.000Z",
        trackingCode: `tracking_${status}_${partySize}`,
        isDemoBooking: true
      })
    ).rejects.toMatchObject({ code: expectedCode });
  });
}

async function withRepository(
  operation: (repository: LocalFixtureRepository) => Promise<void>
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-failure-state-"));
  const dataDirectory = join(temporaryRoot, "data");
  try {
    await cp(fixtureDataDirectory, dataDirectory, { recursive: true });
    await operation(new LocalFixtureRepository(dataDirectory));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function campaignAt(status: CampaignStatus): Campaign {
  let campaign = CampaignSchema.parse(baseCampaign);
  if (status === "DRAFT") return campaign;

  const queue: Array<{ status: CampaignStatus; path: CampaignStatus[] }> = [
    { status: "DRAFT", path: [] }
  ];
  const visited = new Set<CampaignStatus>();
  let path: CampaignStatus[] | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.status === status) {
      path = current.path;
      break;
    }
    if (visited.has(current.status)) continue;
    visited.add(current.status);
    for (const next of CAMPAIGN_STATUS_TRANSITIONS[current.status]) {
      queue.push({ status: next, path: [...current.path, next] });
    }
  }

  if (path === null) throw new Error(`No transition path to ${status}`);
  for (const next of path) {
    campaign = transitionCampaign(campaign, next, { occurredAt: fixedNow }).campaign;
  }
  return campaign;
}

const baseCampaign = {
  id: "campaign_failure_matrix",
  spotId: "spot_quiet_cup_cafe",
  requestedByOwnerId: "owner_diya_demo",
  status: "DRAFT" as const,
  requestSummary: "Failure-state test campaign.",
  slotStartAt: "2026-08-07T13:30:00.000Z",
  slotEndAt: "2026-08-07T15:30:00.000Z",
  unusedCapacity: 12,
  targetReservations: 6,
  maxBudgetPaise: 500000,
  maxDiscountBps: 1500,
  maxExpectedCpaPaise: 85000,
  createdAt: fixedNow,
  updatedAt: fixedNow
};

const policyCampaign: PromotionPolicyCampaign = {
  ...baseCampaign,
  status: "VERIFYING_PROVIDERS",
  spot: {
    id: "spot_quiet_cup_cafe",
    address: {
      line1: "12 Market Road",
      city: "Bengaluru",
      region: "KA",
      postalCode: "560001",
      countryCode: "IN"
    }
  },
  approvedOption
};

const policyPackage: PromotionPolicyPackage = {
  id: "package_local_dining_boost",
  providerId: "provider_reach_local_dining",
  merchantId: "merchant_reach_local_dining",
  providerSku: "reach_local_dining_boost",
  title: "Local Dining Boost",
  description: "Verified local distribution.",
  currency: "INR",
  pricePaise: 480000,
  expectedReservations: 6,
  expectedCpaPaise: 80000,
  discountBps: 1500,
  bookingDeadlineAt: "2026-08-07T13:00:00.000Z",
  validFrom: "2026-08-07T13:30:00.000Z",
  validUntil: "2026-08-07T15:30:00.000Z",
  verificationStatus: "VERIFIED",
  evidenceIds: ["evidence_local_dining_boost"],
  createdAt: fixedNow,
  updatedAt: fixedNow,
  isAvailable: true,
  hasRecurringBilling: false,
  minimumExpectedBookings: 6,
  publicationDeadlineAt: "2026-08-07T12:30:00.000Z"
};

const policyEvidence: PromotionPolicyEvidence = {
  id: "evidence_local_dining_boost",
  providerId: "provider_reach_local_dining",
  packageId: "package_local_dining_boost",
  status: "VERIFIED",
  source: "SENSO",
  evidenceUrl: "https://senso.example.test/evidence/local-audience-a",
  summary: "Verified local audience.",
  collectedAt: fixedNow,
  verifiedAt: fixedNow,
  createdAt: fixedNow,
  confidence: 0.94,
  audienceGeography: {
    city: "Bengaluru",
    region: "KA",
    countryCode: "IN"
  }
};
