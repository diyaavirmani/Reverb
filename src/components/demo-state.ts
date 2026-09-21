import { isValidDemoDate } from "./demo-date";

export const demoSnapshotStorageKey = "reverb-demo-snapshot-v1";
export const demoCampaignDraftStorageKey = "reverb-demo-campaign";

export type DemoLifecycleState = {
  mode: string;
  runId?: string;
  campaignId: string;
  finalStatus: string;
  outcome?: string;
  selectedOptionId: string | null;
  selectedPackageId: string | null;
  eligibleOptionCount: number;
  rejectedOptionCount: number;
  qualityStatus: string;
  ownerApprovalStatus: string;
  paymentSessionStatus: string;
  transactionStatus: string;
  merchantOrderId: string | null;
  activationStatus: string;
  publicActivationUrl: string | null;
  reservationId: string | null;
  isDemoBooking: boolean;
  performance: {
    confirmedReservationCount: number;
    confirmedGuestCount: number;
    remainingCapacity: number;
    capacityRecoveryPercent: number;
    actualCostPerReservationPaise: number | null;
    estimatedRevenueRecoveredPaise: number;
  };
  auditEventCount: number;
  options?: DemoLifecycleOption[];
  executionTrace?: DemoExecutionTraceEvent[];
  policyChecks?: DemoPolicyCheck[];
};

export type DemoLifecycleOption = {
  id: string;
  packageId: string;
  score: number;
  totalCostPaise: number;
  expectedReservations: number;
  expectedCpaPaise: number;
  discountBps: number;
  eligible: boolean;
  deterministicChecks: {
    budget: boolean;
    deadline: boolean;
    price: boolean;
    merchant: boolean;
    discount: boolean;
    cpa: boolean;
  };
  rejectionReasons: string[];
};

export type DemoExecutionTraceEvent = {
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

export type DemoPolicyCheck = {
  key: string;
  label: string;
  status: "PASS" | "FAIL" | "WAITING";
  detail: string;
};

export type DemoCampaignDraft = {
  spot: string;
  location?: string;
  businessType?: string;
  brandTone?: string;
  audience?: string;
  campaignContext?: "REGULAR_DAY" | "FESTIVAL" | "EVENT" | "TREND_LED" | "CUSTOM";
  campaignContextDetail?: string;
  offer?: string;
  unusedCapacity: number;
  date: string;
  startTime: string;
  endTime: string;
  targetReservations: number;
  maximumBudgetPaise: number;
  maximumDiscountPercent: number;
  maximumCpaPaise: number;
};

export type AddedDemoReservation = {
  id: string;
  time: string;
  partySize: number;
  revenuePaise: number;
};

export type DemoSnapshot = {
  version: 1;
  campaign: DemoCampaignDraft;
  lifecycle: DemoLifecycleState;
  stage: "discovery" | "creative" | "approval" | "results";
  creativeCaption: string;
  approved: boolean;
  addedReservations: AddedDemoReservation[];
};

export function parseDemoSnapshot(value: string | null): DemoSnapshot | null {
  if (value === null) return null;

  try {
    const parsed = JSON.parse(value) as Partial<DemoSnapshot>;
    if (
      parsed.version !== 1 ||
      !parsed.campaign ||
      !parsed.lifecycle ||
      typeof parsed.lifecycle.campaignId !== "string" ||
      typeof parsed.creativeCaption !== "string" ||
      typeof parsed.approved !== "boolean" ||
      !Array.isArray(parsed.addedReservations)
    ) {
      return null;
    }
    return parsed as DemoSnapshot;
  } catch {
    return null;
  }
}

export function parseDemoCampaignDraft(value: string | null): DemoCampaignDraft | null {
  if (value === null) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return isDemoCampaignDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadDemoSnapshot(): DemoSnapshot | null {
  return parseDemoSnapshot(window.localStorage.getItem(demoSnapshotStorageKey));
}

export function loadDemoCampaignDraft(): DemoCampaignDraft | null {
  const snapshot = loadDemoSnapshot();
  if (snapshot && isDemoCampaignDraft(snapshot.campaign)) return snapshot.campaign;
  return parseDemoCampaignDraft(window.localStorage.getItem(demoCampaignDraftStorageKey));
}

export function persistDemoSnapshot(snapshot: DemoSnapshot) {
  window.localStorage.setItem(demoSnapshotStorageKey, JSON.stringify(snapshot));
  window.localStorage.setItem(demoCampaignDraftStorageKey, JSON.stringify(snapshot.campaign));
  window.localStorage.setItem("reverb-demo-lifecycle", JSON.stringify(snapshot.lifecycle));
}

export function persistDemoCampaignDate(date: string, fallback: DemoCampaignDraft): DemoCampaignDraft {
  if (!isValidDemoDate(date)) throw new Error("Campaign date must use YYYY-MM-DD format.");

  const snapshot = loadDemoSnapshot();
  const stored = snapshot?.campaign ?? parseDemoCampaignDraft(window.localStorage.getItem(demoCampaignDraftStorageKey));
  const campaign = { ...(stored ?? fallback), date };

  if (snapshot) {
    persistDemoSnapshot({ ...snapshot, campaign });
  } else {
    window.localStorage.setItem(demoCampaignDraftStorageKey, JSON.stringify(campaign));
  }

  return campaign;
}

export function updateDemoSnapshot(update: (current: DemoSnapshot) => DemoSnapshot): DemoSnapshot | null {
  const current = loadDemoSnapshot();
  if (!current) return null;
  const next = update(current);
  persistDemoSnapshot(next);
  return next;
}

export function isCompletedLifecycle(value: unknown): value is DemoLifecycleState {
  if (!value || typeof value !== "object") return false;
  const lifecycle = value as Partial<DemoLifecycleState>;
  return (
    typeof lifecycle.campaignId === "string" &&
    lifecycle.finalStatus === "ACTIVE" &&
    lifecycle.ownerApprovalStatus === "APPROVED" &&
    lifecycle.transactionStatus === "COMPLETED" &&
    lifecycle.activationStatus === "ACTIVE" &&
    typeof lifecycle.merchantOrderId === "string" &&
    typeof lifecycle.reservationId === "string"
  );
}

export function isPreparedLifecycle(value: unknown): value is DemoLifecycleState {
  if (!value || typeof value !== "object") return false;
  const lifecycle = value as Partial<DemoLifecycleState>;
  return (
    typeof lifecycle.campaignId === "string" &&
    lifecycle.finalStatus === "AWAITING_OWNER_APPROVAL" &&
    lifecycle.ownerApprovalStatus === "PENDING" &&
    lifecycle.qualityStatus === "PASSED" &&
    Array.isArray(lifecycle.executionTrace) &&
    Array.isArray(lifecycle.policyChecks)
  );
}

export function isNoEligibleLifecycle(value: unknown): value is DemoLifecycleState {
  if (!value || typeof value !== "object") return false;
  const lifecycle = value as Partial<DemoLifecycleState>;
  return (
    typeof lifecycle.campaignId === "string" &&
    lifecycle.finalStatus === "REJECTED_BY_POLICY" &&
    lifecycle.outcome === "NO_ELIGIBLE_PACKAGE" &&
    lifecycle.selectedOptionId === null &&
    lifecycle.selectedPackageId === null &&
    Array.isArray(lifecycle.options)
  );
}

function isDemoCampaignDraft(value: unknown): value is DemoCampaignDraft {
  if (!value || typeof value !== "object") return false;
  const campaign = value as Partial<DemoCampaignDraft>;

  return (
    typeof campaign.spot === "string" &&
    typeof campaign.date === "string" &&
    isValidDemoDate(campaign.date) &&
    typeof campaign.startTime === "string" &&
    typeof campaign.endTime === "string" &&
    Number.isFinite(campaign.unusedCapacity) &&
    Number.isFinite(campaign.targetReservations) &&
    Number.isFinite(campaign.maximumBudgetPaise) &&
    Number.isFinite(campaign.maximumDiscountPercent) &&
    Number.isFinite(campaign.maximumCpaPaise)
  );
}
