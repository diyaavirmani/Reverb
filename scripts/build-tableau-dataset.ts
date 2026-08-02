import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { stringify } from "csv-stringify/sync";
import type { ZodType } from "zod";

import {
  AuditEventSchema,
  CampaignOptionSchema,
  CampaignSchema,
  MerchantOrderSchema,
  PromotionPackageSchema,
  PromotionProviderSchema,
  ReservationSchema,
  SensoProviderVerificationSchema,
  SpotSchema,
  TransactionSchema,
  type AuditEvent,
  type Campaign,
  type CampaignOption,
  type MerchantOrder,
  type PromotionPackage,
  type PromotionProvider,
  type Reservation,
  type SensoProviderVerification,
  type Spot,
  type Transaction
} from "../src/schemas";

type DatasetPaths = {
  dataDirectory?: string;
  sensoDirectory?: string;
  outputDirectory?: string;
};

type BusinessRecords = {
  spots: Spot[];
  campaigns: Campaign[];
  providers: PromotionProvider[];
  packages: PromotionPackage[];
  options: CampaignOption[];
  transactions: Transaction[];
  orders: MerchantOrder[];
  reservations: Reservation[];
  auditEvents: AuditEvent[];
  evidence: Map<string, SensoProviderVerification>;
};

const funnelStages = [
  ["Campaign created", ["CAMPAIGN_CREATED_FROM_INTENT"]],
  ["Provider verification", ["PROVIDER_VERIFICATION_STARTED"]],
  ["Options ready", ["CAMPAIGN_OPTIONS_READY"]],
  ["Provider selected", ["CAMPAIGN_OPTION_SELECTED"]],
  ["Creative generated", ["CAMPAIGN_CREATIVE_GENERATED"]],
  ["Quality approved", ["QUALITY_REVIEW_PASSED"]],
  ["Owner approved", ["OWNER_APPROVED_CAMPAIGN"]],
  ["Prava authorized", ["PRAVA_PAYMENT_AUTHORIZED"]],
  ["Merchant order created", ["MERCHANT_ORDER_CREATED", "REACH_CHECKOUT_COMPLETED"]],
  ["Promotion active", ["PROMOTION_ACTIVATED"]],
  ["Reservation attributed", ["RESERVATION_TRACKED"]],
  ["Campaign completed", ["CAMPAIGN_COMPLETED"]]
] as const;

export async function buildTableauDataset(paths: DatasetPaths = {}): Promise<{
  campaignRows: number;
  providerRows: number;
  paymentRows: number;
  funnelRows: number;
}> {
  const dataDirectory = path.resolve(paths.dataDirectory ?? "fixtures/data");
  const sensoDirectory = path.resolve(paths.sensoDirectory ?? "fixtures/senso");
  const outputDirectory = path.resolve(paths.outputDirectory ?? "tableau");
  const records = await loadBusinessRecords(dataDirectory, sensoDirectory);

  const campaignRows = buildCampaignPerformance(records);
  const providerRows = buildProviderPerformance(records);
  const paymentRows = buildPaymentTrust(records);
  const funnelRows = buildConversionFunnel(records);

  await mkdir(outputDirectory, { recursive: true });
  await writeCsv(outputDirectory, "campaign_performance.csv", campaignRows, [
    "campaign_id",
    "spot_name",
    "slot",
    "initial_unused_capacity",
    "target_reservations",
    "confirmed_reservations",
    "confirmed_guests",
    "capacity_recovery_percent",
    "promotion_spend_paise",
    "expected_cpa_min_paise",
    "expected_cpa_max_paise",
    "actual_cpa_paise",
    "estimated_revenue_recovered_paise",
    "campaign_status"
  ]);
  await writeCsv(outputDirectory, "provider_performance.csv", providerRows, [
    "provider",
    "package",
    "evidence_confidence",
    "local_audience_percent",
    "campaign_count",
    "spend_paise",
    "reservations",
    "average_cpa_paise",
    "activation_success_rate"
  ]);
  await writeCsv(outputDirectory, "payment_trust.csv", paymentRows, [
    "campaign_id",
    "maximum_budget_paise",
    "approved_amount_paise",
    "charged_amount_paise",
    "remaining_budget_paise",
    "prava_status",
    "merchant_order_id",
    "price_change_blocked",
    "duplicate_attempt_blocked"
  ]);
  await writeCsv(outputDirectory, "conversion_funnel.csv", funnelRows, [
    "stage",
    "count",
    "stage_order"
  ]);

  return {
    campaignRows: campaignRows.length,
    providerRows: providerRows.length,
    paymentRows: paymentRows.length,
    funnelRows: funnelRows.length
  };
}

function buildCampaignPerformance(records: BusinessRecords): Array<Record<string, unknown>> {
  const spotById = new Map(records.spots.map((spot) => [spot.id, spot]));

  return records.campaigns.map((campaign) => {
    const spot = required(spotById.get(campaign.spotId), `Spot ${campaign.spotId}`);
    const transaction = records.transactions.find((item) => item.campaignId === campaign.id);
    const selectedPackage = selectedPackageForCampaign(campaign.id, transaction, records);
    const evidence = selectedPackage
      ? records.evidence.get(evidenceKey(selectedPackage.providerId, selectedPackage.id))
      : undefined;
    const confirmed = confirmedRealReservations(records.reservations, campaign.id);
    const confirmedGuests = confirmed.reduce((sum, reservation) => sum + reservation.seatCount, 0);
    const spendPaise = chargedAmount(transaction, records.orders);
    const expectedRange = expectedCpaRange(selectedPackage, evidence);

    return {
      campaign_id: campaign.id,
      spot_name: spot.name,
      slot: `${campaign.slotStartAt} - ${campaign.slotEndAt}`,
      initial_unused_capacity: campaign.unusedCapacity,
      target_reservations: campaign.targetReservations,
      confirmed_reservations: confirmed.length,
      confirmed_guests: confirmedGuests,
      capacity_recovery_percent: roundPercent(confirmedGuests, campaign.unusedCapacity),
      promotion_spend_paise: spendPaise,
      expected_cpa_min_paise: expectedRange.minimum,
      expected_cpa_max_paise: expectedRange.maximum,
      actual_cpa_paise: confirmed.length === 0 ? "" : ceilDivide(spendPaise, confirmed.length),
      estimated_revenue_recovered_paise: confirmedGuests * spot.averageBookingValuePaise,
      campaign_status: campaign.status
    };
  });
}

function buildProviderPerformance(records: BusinessRecords): Array<Record<string, unknown>> {
  const providerById = new Map(records.providers.map((provider) => [provider.id, provider]));

  return records.packages.map((promotionPackage) => {
    const provider = required(
      providerById.get(promotionPackage.providerId),
      `Provider ${promotionPackage.providerId}`
    );
    const campaignIds = records.transactions
      .filter((transaction) => transaction.packageId === promotionPackage.id)
      .map((transaction) => transaction.campaignId);
    const campaignIdSet = new Set(campaignIds);
    const transactions = records.transactions.filter((item) => campaignIdSet.has(item.campaignId));
    const spendPaise = transactions.reduce(
      (sum, transaction) => sum + chargedAmount(transaction, records.orders),
      0
    );
    const reservations = records.reservations.filter(
      (reservation) =>
        campaignIdSet.has(reservation.campaignId) &&
        !reservation.isTest &&
        isConfirmed(reservation)
    ).length;
    const activatedCampaigns = new Set(
      records.orders
        .filter(
          (order) =>
            order.status === "ACTIVE" &&
            transactions.some((transaction) => transaction.merchantOrderId === order.id)
        )
        .map((order) =>
          transactions.find((transaction) => transaction.merchantOrderId === order.id)?.campaignId
        )
        .filter((campaignId): campaignId is string => campaignId !== undefined)
    ).size;
    const evidence = records.evidence.get(evidenceKey(provider.id, promotionPackage.id));

    return {
      provider: provider.name,
      package: promotionPackage.title,
      evidence_confidence: evidence?.evidenceConfidence ?? 0,
      local_audience_percent: evidence?.localAudiencePercent ?? 0,
      campaign_count: campaignIdSet.size,
      spend_paise: spendPaise,
      reservations,
      average_cpa_paise: reservations === 0 ? "" : ceilDivide(spendPaise, reservations),
      activation_success_rate:
        campaignIdSet.size === 0 ? 0 : roundPercent(activatedCampaigns, campaignIdSet.size)
    };
  });
}

function buildPaymentTrust(records: BusinessRecords): Array<Record<string, unknown>> {
  const campaignById = new Map(records.campaigns.map((campaign) => [campaign.id, campaign]));

  return records.transactions.map((transaction) => {
    const campaign = required(
      campaignById.get(transaction.campaignId),
      `Campaign ${transaction.campaignId}`
    );
    const chargedAmountPaise = chargedAmount(transaction, records.orders);
    const campaignEvents = records.auditEvents.filter(
      (event) =>
        event.entityId === campaign.id || event.metadata.campaignId === campaign.id
    );

    return {
      campaign_id: campaign.id,
      maximum_budget_paise: campaign.maxBudgetPaise,
      approved_amount_paise: transaction.amountPaise,
      charged_amount_paise: chargedAmountPaise,
      remaining_budget_paise: Math.max(0, campaign.maxBudgetPaise - chargedAmountPaise),
      prava_status: transaction.status,
      merchant_order_id: transaction.merchantOrderId ?? "",
      price_change_blocked: hasAuditSignal(campaignEvents, ["PRICE_CHANGED"]),
      duplicate_attempt_blocked: hasAuditSignal(campaignEvents, [
        "DUPLICATE_CHECKOUT_BLOCKED",
        "CHECKOUT_ALREADY_ATTEMPTED"
      ])
    };
  });
}

function buildConversionFunnel(records: BusinessRecords): Array<Record<string, unknown>> {
  const eventsByCampaign = new Map<string, Set<string>>();

  for (const campaign of records.campaigns) {
    eventsByCampaign.set(campaign.id, new Set(["CAMPAIGN_CREATED_FROM_INTENT"]));
  }
  for (const event of records.auditEvents) {
    const campaignId = campaignIdForEvent(event, records);
    if (campaignId === null) continue;
    const events = eventsByCampaign.get(campaignId) ?? new Set<string>();
    events.add(event.eventType);
    eventsByCampaign.set(campaignId, events);
  }

  return funnelStages.map(([stage, eventTypes], index) => ({
    stage,
    count: [...eventsByCampaign.values()].filter((events) =>
      eventTypes.some((eventType) => events.has(eventType))
    ).length,
    stage_order: index + 1
  }));
}

async function loadBusinessRecords(
  dataDirectory: string,
  sensoDirectory: string
): Promise<BusinessRecords> {
  const [spots, campaigns, providers, packages, options, transactions, orders, reservations, auditEvents] =
    await Promise.all([
      readArray(dataDirectory, "spots.json", SpotSchema),
      readArray(dataDirectory, "campaigns.json", CampaignSchema),
      readArray(dataDirectory, "providers.json", PromotionProviderSchema),
      readArray(dataDirectory, "promotion-packages.json", PromotionPackageSchema),
      readArray(dataDirectory, "campaign-options.json", CampaignOptionSchema),
      readArray(dataDirectory, "transactions.json", TransactionSchema),
      readArray(dataDirectory, "merchant-orders.json", MerchantOrderSchema),
      readArray(dataDirectory, "reservations.json", ReservationSchema),
      readArray(dataDirectory, "audit-events.json", AuditEventSchema)
    ]);
  const evidence = new Map<string, SensoProviderVerification>();
  const evidenceFiles = [
    ["provider_reach_local_dining", "package_local_dining_boost", "provider-a-local-dining.json"],
    ["provider_reach_neighborhood_food", "package_neighborhood_food_blast", "provider-b-weak-geography.json"],
    ["provider_reach_premium_weekend", "package_premium_weekend_push", "provider-c-late-or-cpa.json"]
  ] as const;

  for (const [providerId, packageId, fileName] of evidenceFiles) {
    const value = await readJson(path.join(sensoDirectory, fileName));
    evidence.set(evidenceKey(providerId, packageId), SensoProviderVerificationSchema.parse(value));
  }

  return { spots, campaigns, providers, packages, options, transactions, orders, reservations, auditEvents, evidence };
}

async function readArray<T>(directory: string, fileName: string, schema: ZodType<T>): Promise<T[]> {
  const value = await readJson(path.join(directory, fileName));
  if (!Array.isArray(value)) throw new Error(`${fileName} must contain a JSON array.`);
  return value.map((record) => schema.parse(record));
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as unknown;
}

async function writeCsv(
  outputDirectory: string,
  fileName: string,
  rows: Array<Record<string, unknown>>,
  columns: string[]
): Promise<void> {
  const csv = stringify(rows, { header: true, columns, record_delimiter: "unix" });
  await writeFile(path.join(outputDirectory, fileName), csv, "utf8");
}

function selectedPackageForCampaign(
  campaignId: string,
  transaction: Transaction | undefined,
  records: BusinessRecords
): PromotionPackage | undefined {
  const packageId =
    transaction?.packageId ??
    records.options
      .filter((option) => option.campaignId === campaignId && option.passesDeterministicChecks)
      .sort((left, right) => right.score - left.score || left.packageId.localeCompare(right.packageId))[0]
      ?.packageId;
  return records.packages.find((promotionPackage) => promotionPackage.id === packageId);
}

function expectedCpaRange(
  promotionPackage: PromotionPackage | undefined,
  evidence: SensoProviderVerification | undefined
): { minimum: number | string; maximum: number | string } {
  if (!promotionPackage) return { minimum: "", maximum: "" };
  if (!evidence || evidence.historicalBookingMin <= 0 || evidence.historicalBookingMax <= 0) {
    return {
      minimum: promotionPackage.expectedCpaPaise,
      maximum: promotionPackage.expectedCpaPaise
    };
  }
  return {
    minimum: ceilDivide(promotionPackage.pricePaise, evidence.historicalBookingMax),
    maximum: ceilDivide(promotionPackage.pricePaise, evidence.historicalBookingMin)
  };
}

function confirmedRealReservations(reservations: Reservation[], campaignId: string): Reservation[] {
  return reservations.filter(
    (reservation) =>
      reservation.campaignId === campaignId && !reservation.isTest && isConfirmed(reservation)
  );
}

function isConfirmed(reservation: Reservation): boolean {
  return reservation.status === "BOOKED" || reservation.status === "COMPLETED";
}

function chargedAmount(transaction: Transaction | undefined, orders: MerchantOrder[]): number {
  if (!transaction?.merchantOrderId) return 0;
  return orders.find((order) => order.id === transaction.merchantOrderId)?.amountPaise ?? 0;
}

function campaignIdForEvent(event: AuditEvent, records: BusinessRecords): string | null {
  if (event.entityType === "CAMPAIGN") return event.entityId;
  if (typeof event.metadata.campaignId === "string") return event.metadata.campaignId;
  const transaction = records.transactions.find((item) => item.id === event.entityId);
  return transaction?.campaignId ?? null;
}

function hasAuditSignal(events: AuditEvent[], signals: string[]): boolean {
  return events.some(
    (event) =>
      signals.includes(event.eventType) ||
      signals.includes(String(event.metadata.code ?? event.metadata.rejectionCode ?? ""))
  );
}

function evidenceKey(providerId: string, packageId: string): string {
  return `${providerId}:${packageId}`;
}

function ceilDivide(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("CPA calculation requires safe non-negative integer paise and a positive count.");
  }
  return numerator === 0 ? 0 : Math.floor((numerator - 1) / denominator) + 1;
}

function roundPercent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 100;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing from fixture records.`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await buildTableauDataset();
  console.log(
    `Tableau datasets built: ${result.campaignRows} campaigns, ${result.providerRows} provider packages, ${result.paymentRows} payment rows, ${result.funnelRows} funnel stages.`
  );
}
