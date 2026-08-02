import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import {
  AuditEventSchema,
  CampaignAssetSchema,
  CampaignOptionSchema,
  CampaignSchema,
  MerchantOrderSchema,
  PromotionPackageSchema,
  PromotionProviderSchema,
  ReservationSchema,
  SpotSchema,
  TransactionSchema,
  type AuditEvent,
  type Campaign,
  type CampaignAsset,
  type CampaignOption,
  type MerchantOrder,
  type PromotionPackage,
  type PromotionProvider,
  type Reservation,
  type Spot,
  type Transaction
} from "../../schemas";
import type {
  AuditEventFilters,
  CampaignPerformance,
  StorageRepository
} from "./storage-repository";

const fixtureFiles = {
  spots: "spots.json",
  campaigns: "campaigns.json",
  providers: "providers.json",
  promotionPackages: "promotion-packages.json",
  campaignOptions: "campaign-options.json",
  campaignAssets: "campaign-assets.json",
  transactions: "transactions.json",
  merchantOrders: "merchant-orders.json",
  reservations: "reservations.json",
  auditEvents: "audit-events.json"
} as const;

type FixtureFile = (typeof fixtureFiles)[keyof typeof fixtureFiles];

function uniqueRecordArraySchema<T extends { id: string }>(
  schema: z.ZodType<T>,
  label: string
): z.ZodType<T[]> {
  return z.array(schema).superRefine((records, context) => {
    const seenIds = new Set<string>();

    records.forEach((record, index) => {
      if (seenIds.has(record.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate ${label} id: ${record.id}`,
          path: [index, "id"]
        });
      }

      seenIds.add(record.id);
    });
  });
}

const fileSchemas = {
  [fixtureFiles.spots]: uniqueRecordArraySchema(SpotSchema, "spot"),
  [fixtureFiles.campaigns]: uniqueRecordArraySchema(CampaignSchema, "campaign"),
  [fixtureFiles.providers]: uniqueRecordArraySchema(PromotionProviderSchema, "provider"),
  [fixtureFiles.promotionPackages]: uniqueRecordArraySchema(
    PromotionPackageSchema,
    "promotion package"
  ),
  [fixtureFiles.campaignOptions]: uniqueRecordArraySchema(CampaignOptionSchema, "campaign option"),
  [fixtureFiles.campaignAssets]: uniqueRecordArraySchema(CampaignAssetSchema, "campaign asset"),
  [fixtureFiles.transactions]: uniqueRecordArraySchema(TransactionSchema, "transaction"),
  [fixtureFiles.merchantOrders]: uniqueRecordArraySchema(MerchantOrderSchema, "merchant order"),
  [fixtureFiles.reservations]: uniqueRecordArraySchema(ReservationSchema, "reservation"),
  [fixtureFiles.auditEvents]: uniqueRecordArraySchema(AuditEventSchema, "audit event")
} satisfies Record<FixtureFile, z.ZodType<unknown[]>>;

function replaceById<T extends { id: string }>(records: T[], record: T): T[] {
  const index = records.findIndex((existingRecord) => existingRecord.id === record.id);

  if (index === -1) {
    return [...records, record];
  }

  return records.map((existingRecord) => (existingRecord.id === record.id ? record : existingRecord));
}

function requireNoDuplicateId<T extends { id: string }>(
  records: T[],
  id: string,
  label: string
): void {
  if (records.some((record) => record.id === id)) {
    throw new Error(`Duplicate ${label} id: ${id}`);
  }
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

export class LocalFixtureRepository implements StorageRepository {
  constructor(private readonly dataDir = join(process.cwd(), "fixtures", "data")) {}

  async getSpot(id: string): Promise<Spot | null> {
    return this.findById<Spot>(fixtureFiles.spots, id);
  }

  async listSpots(): Promise<Spot[]> {
    return this.readRecords<Spot>(fixtureFiles.spots);
  }

  async createCampaign(campaign: Campaign): Promise<Campaign> {
    const parsedCampaign = CampaignSchema.parse(campaign);
    const campaigns = await this.readRecords<Campaign>(fixtureFiles.campaigns);

    requireNoDuplicateId(campaigns, parsedCampaign.id, "campaign");

    await this.writeRecords(fixtureFiles.campaigns, [...campaigns, parsedCampaign]);
    return parsedCampaign;
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return this.findById<Campaign>(fixtureFiles.campaigns, id);
  }

  async updateCampaign(campaign: Campaign): Promise<Campaign> {
    const parsedCampaign = CampaignSchema.parse(campaign);
    const campaigns = await this.readRecords<Campaign>(fixtureFiles.campaigns);

    if (!campaigns.some((existingCampaign) => existingCampaign.id === parsedCampaign.id)) {
      throw new Error(`Campaign not found: ${parsedCampaign.id}`);
    }

    await this.writeRecords(fixtureFiles.campaigns, replaceById(campaigns, parsedCampaign));
    return parsedCampaign;
  }

  async listProviders(): Promise<PromotionProvider[]> {
    return this.readRecords<PromotionProvider>(fixtureFiles.providers);
  }

  async getProvider(id: string): Promise<PromotionProvider | null> {
    return this.findById<PromotionProvider>(fixtureFiles.providers, id);
  }

  async listPromotionPackages(providerId?: string): Promise<PromotionPackage[]> {
    const packages = await this.readRecords<PromotionPackage>(fixtureFiles.promotionPackages);

    if (!providerId) {
      return packages;
    }

    return packages.filter((promotionPackage) => promotionPackage.providerId === providerId);
  }

  async getPromotionPackage(id: string): Promise<PromotionPackage | null> {
    return this.findById<PromotionPackage>(fixtureFiles.promotionPackages, id);
  }

  async saveCampaignOptions(
    campaignId: string,
    options: CampaignOption[]
  ): Promise<CampaignOption[]> {
    const parsedOptions = z.array(CampaignOptionSchema).parse(options);

    if (parsedOptions.some((option) => option.campaignId !== campaignId)) {
      throw new Error(`Campaign option campaignId must match campaign: ${campaignId}`);
    }

    const existingOptions = await this.readRecords<CampaignOption>(fixtureFiles.campaignOptions);
    const retainedOptions = existingOptions.filter((option) => option.campaignId !== campaignId);

    await this.writeRecords(fixtureFiles.campaignOptions, [...retainedOptions, ...parsedOptions]);
    return parsedOptions;
  }

  async getCampaignOptions(campaignId: string): Promise<CampaignOption[]> {
    const options = await this.readRecords<CampaignOption>(fixtureFiles.campaignOptions);
    return options.filter((option) => option.campaignId === campaignId);
  }

  async saveCampaignAsset(asset: CampaignAsset): Promise<CampaignAsset> {
    const parsedAsset = CampaignAssetSchema.parse(asset);
    const assets = await this.readRecords<CampaignAsset>(fixtureFiles.campaignAssets);

    await this.writeRecords(fixtureFiles.campaignAssets, replaceById(assets, parsedAsset));
    return parsedAsset;
  }

  async getCampaignAsset(id: string): Promise<CampaignAsset | null> {
    return this.findById<CampaignAsset>(fixtureFiles.campaignAssets, id);
  }

  async saveTransaction(transaction: Transaction): Promise<Transaction> {
    const parsedTransaction = TransactionSchema.parse(transaction);
    const transactions = await this.readRecords<Transaction>(fixtureFiles.transactions);

    await this.writeRecords(fixtureFiles.transactions, replaceById(transactions, parsedTransaction));
    return parsedTransaction;
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    return this.findById<Transaction>(fixtureFiles.transactions, id);
  }

  async saveMerchantOrder(order: MerchantOrder): Promise<MerchantOrder> {
    const parsedOrder = MerchantOrderSchema.parse(order);
    const orders = await this.readRecords<MerchantOrder>(fixtureFiles.merchantOrders);

    await this.writeRecords(fixtureFiles.merchantOrders, replaceById(orders, parsedOrder));
    return parsedOrder;
  }

  async getMerchantOrder(id: string): Promise<MerchantOrder | null> {
    return this.findById<MerchantOrder>(fixtureFiles.merchantOrders, id);
  }

  async saveReservation(reservation: Reservation): Promise<Reservation> {
    const parsedReservation = ReservationSchema.parse(reservation);
    const reservations = await this.readRecords<Reservation>(fixtureFiles.reservations);

    await this.writeRecords(fixtureFiles.reservations, replaceById(reservations, parsedReservation));
    return parsedReservation;
  }

  async listReservations(campaignId?: string): Promise<Reservation[]> {
    const reservations = await this.readRecords<Reservation>(fixtureFiles.reservations);

    if (!campaignId) {
      return reservations;
    }

    return reservations.filter((reservation) => reservation.campaignId === campaignId);
  }

  async appendAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    const parsedEvent = AuditEventSchema.parse(event);
    const auditEvents = await this.readRecords<AuditEvent>(fixtureFiles.auditEvents);

    requireNoDuplicateId(auditEvents, parsedEvent.id, "audit event");

    await this.writeRecords(fixtureFiles.auditEvents, [...auditEvents, parsedEvent]);
    return parsedEvent;
  }

  async listAuditEvents(filters?: AuditEventFilters): Promise<AuditEvent[]> {
    const auditEvents = await this.readRecords<AuditEvent>(fixtureFiles.auditEvents);

    return auditEvents.filter((auditEvent) => {
      if (filters?.entityType && auditEvent.entityType !== filters.entityType) {
        return false;
      }

      if (filters?.entityId && auditEvent.entityId !== filters.entityId) {
        return false;
      }

      return true;
    });
  }

  async getCampaignPerformance(campaignId: string): Promise<CampaignPerformance | null> {
    const campaign = await this.getCampaign(campaignId);

    if (!campaign) {
      return null;
    }

    const spot = await this.getSpot(campaign.spotId);

    if (!spot) {
      return null;
    }

    const [transactions, reservations] = await Promise.all([
      this.readRecords<Transaction>(fixtureFiles.transactions),
      this.listReservations(campaignId)
    ]);

    const confirmedReservations = reservations.filter(
      (reservation) =>
        !reservation.isTest &&
        (reservation.status === "BOOKED" || reservation.status === "COMPLETED")
    );
    const confirmedReservationCount = confirmedReservations.length;
    const confirmedGuestCount = confirmedReservations.reduce(
      (total, reservation) => total + reservation.seatCount,
      0
    );
    const promotionSpendPaise = transactions
      .filter((transaction) => transaction.campaignId === campaignId)
      .filter(
        (transaction) =>
          transaction.status === "COMPLETED" && transaction.merchantOrderId !== null
      )
      .reduce((total, transaction) => total + transaction.amountPaise, 0);
    const remainingCapacity = Math.max(0, campaign.unusedCapacity - confirmedGuestCount);
    const capacityRecoveryPercent = roundPercent(
      (confirmedGuestCount / campaign.unusedCapacity) * 100
    );

    return {
      initialUnusedCapacity: campaign.unusedCapacity,
      targetReservations: campaign.targetReservations,
      confirmedReservationCount,
      confirmedGuestCount,
      capacityRecoveryPercent,
      remainingCapacity,
      promotionSpendPaise,
      actualCostPerReservationPaise:
        confirmedReservationCount === 0
          ? null
          : Math.round(promotionSpendPaise / confirmedReservationCount),
      estimatedRevenueRecoveredPaise: confirmedGuestCount * spot.averageBookingValuePaise,
      campaignStatus: campaign.status
    };
  }

  private async findById<T extends { id: string }>(
    fileName: FixtureFile,
    id: string
  ): Promise<T | null> {
    const records = await this.readRecords<T>(fileName);
    return records.find((record) => record.id === id) ?? null;
  }

  private async readRecords<T>(fileName: FixtureFile): Promise<T[]> {
    const filePath = this.filePath(fileName);
    const rawFile = await readFile(filePath, "utf8");
    const parsedJson: unknown = JSON.parse(rawFile);

    return fileSchemas[fileName].parse(parsedJson) as T[];
  }

  private async writeRecords<T>(fileName: FixtureFile, records: T[]): Promise<void> {
    const schema = fileSchemas[fileName];
    const validatedRecords = schema.parse(records);
    const filePath = this.filePath(fileName);
    const temporaryFilePath = `${filePath}.${uuidv4()}.tmp`;

    await mkdir(this.dataDir, { recursive: true });

    try {
      await writeFile(temporaryFilePath, `${JSON.stringify(validatedRecords, null, 2)}\n`, "utf8");

      const temporaryFile = await readFile(temporaryFilePath, "utf8");
      schema.parse(JSON.parse(temporaryFile));

      await rename(temporaryFilePath, filePath);
    } catch (error) {
      await unlink(temporaryFilePath).catch(() => undefined);
      throw error;
    }
  }

  private filePath(fileName: FixtureFile): string {
    return join(this.dataDir, fileName);
  }
}

