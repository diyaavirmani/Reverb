import type {
  AuditEvent,
  Campaign,
  CampaignAsset,
  CampaignOption,
  CampaignPerformanceReport,
  MerchantOrder,
  PromotionPackage,
  PromotionProvider,
  Reservation,
  Spot,
  Transaction
} from "../../schemas";

export type AuditEventFilters = {
  entityType?: AuditEvent["entityType"];
  entityId?: string;
};

export type CampaignPerformance = CampaignPerformanceReport;

export interface StorageRepository {
  getSpot(id: string): Promise<Spot | null>;
  listSpots(): Promise<Spot[]>;
  createCampaign(campaign: Campaign): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  updateCampaign(campaign: Campaign): Promise<Campaign>;
  listProviders(): Promise<PromotionProvider[]>;
  getProvider(id: string): Promise<PromotionProvider | null>;
  listPromotionPackages(providerId?: string): Promise<PromotionPackage[]>;
  getPromotionPackage(id: string): Promise<PromotionPackage | null>;
  saveCampaignOptions(campaignId: string, options: CampaignOption[]): Promise<CampaignOption[]>;
  getCampaignOptions(campaignId: string): Promise<CampaignOption[]>;
  saveCampaignAsset(asset: CampaignAsset): Promise<CampaignAsset>;
  getCampaignAsset(id: string): Promise<CampaignAsset | null>;
  saveTransaction(transaction: Transaction): Promise<Transaction>;
  getTransaction(id: string): Promise<Transaction | null>;
  saveMerchantOrder(order: MerchantOrder): Promise<MerchantOrder>;
  getMerchantOrder(id: string): Promise<MerchantOrder | null>;
  saveReservation(reservation: Reservation): Promise<Reservation>;
  listReservations(campaignId?: string): Promise<Reservation[]>;
  appendAuditEvent(event: AuditEvent): Promise<AuditEvent>;
  listAuditEvents(filters?: AuditEventFilters): Promise<AuditEvent[]>;
  getCampaignPerformance(campaignId: string): Promise<CampaignPerformance | null>;
}