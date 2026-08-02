import { randomUUID } from "node:crypto";

import { hashPayload } from "../security/signatures";
import type { StorageRepository } from "../repositories";
import {
  AuditEventSchema,
  CampaignAssetSchema,
  MerchantOrderSchema,
  ReachActivateRequestSchema,
  ReachActivationResultSchema,
  ReachCheckoutRequestSchema,
  ReachCheckoutResultSchema,
  ReachDeliverRequestSchema,
  ReachDeliveryResultSchema,
  ReachOrderDetailsSchema,
  ReachPackageSchema,
  ReachQuoteSchema,
  type AuditEvent,
  type CampaignAsset,
  type MerchantOrder,
  type PromotionPackage,
  type ReachActivationResult,
  type ReachCheckoutRequest,
  type ReachCheckoutResult,
  type ReachDeliveryResult,
  type ReachOrderDetails,
  type ReachPackage,
  type ReachQuote
} from "../../schemas";

const reachMerchantName = "Reverb Reach Exchange";
const reachActivationBaseUrl = "https://reach.reverb-fill.test/activations";

const packageControls: Record<
  string,
  {
    available: boolean;
    livePricePaise?: number;
    livePackageId?: string;
  }
> = {
  package_local_dining_boost: {
    available: true
  },
  package_neighborhood_food_blast: {
    available: true,
    livePricePaise: 550000
  },
  package_premium_weekend_push: {
    available: false
  }
};

export type ReachExchangeClock = () => Date;

export class ReachExchangeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "ReachExchangeError";
  }
}

export class ReachExchangeService {
  constructor(
    private readonly repository: StorageRepository,
    private readonly clock: ReachExchangeClock = () => new Date()
  ) {}

  async listPackages(): Promise<ReachPackage[]> {
    const packages = await this.repository.listPromotionPackages();
    return packages.map((promotionPackage) => this.toReachPackage(promotionPackage));
  }

  async getQuote(packageId: string): Promise<ReachQuote> {
    const promotionPackage = await this.requirePromotionPackage(packageId);
    return this.toQuote(promotionPackage);
  }

  async checkout(input: ReachCheckoutRequest): Promise<ReachCheckoutResult> {
    const request = ReachCheckoutRequestSchema.parse(input);
    // The Prava authorization is a one-time credential. It is validated at the
    // boundary but deliberately excluded from all durable idempotency data.
    const requestHash = hashPayload({
      campaignId: request.campaignId,
      packageId: request.packageId,
      approvedMerchantId: request.approvedMerchantId,
      approvedAmountPaise: request.approvedAmountPaise,
      idempotencyKey: request.idempotencyKey
    });
    const existingOrder = await this.findOrderByIdempotencyKey(request.idempotencyKey, requestHash);

    if (existingOrder !== null) {
      const existingDetails = await this.getOrderDetails(existingOrder.id);
      return ReachCheckoutResultSchema.parse({
        orderId: existingOrder.id,
        externalMerchantOrderId: existingOrder.externalMerchantOrderId,
        campaignId: existingDetails.campaignId,
        packageId: existingDetails.packageId,
        merchantId: existingDetails.merchantId,
        merchantName: existingDetails.merchantName,
        amountPaise: existingOrder.amountPaise,
        currency: existingOrder.currency,
        status: existingOrder.status,
        idempotencyKey: request.idempotencyKey,
        duplicate: true
      });
    }

    const promotionPackage = await this.requirePromotionPackage(request.packageId);
    const quote = this.toQuote(promotionPackage);

    if (!quote.available) {
      throw new ReachExchangeError(
        "PROVIDER_UNAVAILABLE",
        "Reach package is unavailable.",
        409
      );
    }

    if (promotionPackage.merchantId !== request.approvedMerchantId) {
      throw new ReachExchangeError("MERCHANT_CHANGED", "Approved merchant does not match live merchant.", 409);
    }

    if (quote.packageId !== request.packageId) {
      throw new ReachExchangeError("PACKAGE_CHANGED", "Approved package does not match live package.", 409);
    }

    if (quote.livePricePaise !== request.approvedAmountPaise) {
      throw new ReachExchangeError("PRICE_CHANGED", "Approved amount does not match live package price.", 409);
    }

    if (Date.parse(quote.publicationDeadlineAt) <= this.clock().getTime()) {
      throw new ReachExchangeError(
        "PUBLICATION_DEADLINE_EXPIRED",
        "Reach package publication deadline has expired.",
        409
      );
    }

    const now = this.nowIso();
    const orderId = `reach_order_${randomUUID()}`;
    const externalMerchantOrderId = `reach_external_${randomUUID()}`;
    const order = MerchantOrderSchema.parse({
      id: orderId,
      transactionId: `reach_transaction_${request.campaignId}`,
      providerId: promotionPackage.providerId,
      externalMerchantOrderId,
      status: "CREATED",
      currency: "INR",
      amountPaise: quote.livePricePaise,
      scheduledStartAt: promotionPackage.validFrom,
      scheduledEndAt: promotionPackage.validUntil,
      paidAt: now,
      createdAt: now,
      updatedAt: now
    });

    await this.repository.saveMerchantOrder(order);
    await this.repository.appendAuditEvent(
      this.auditEvent({
        entityId: order.id,
        eventType: "REACH_CHECKOUT_COMPLETED",
        idempotencyKey: request.idempotencyKey,
        previousState: null,
        nextState: order.status,
        metadata: {
          campaignId: request.campaignId,
          packageId: promotionPackage.id,
          merchantId: promotionPackage.merchantId,
          merchantName: reachMerchantName,
          requestHash,
          orderId: order.id,
                    externalMerchantOrderId: order.externalMerchantOrderId
        }
      })
    );

    return ReachCheckoutResultSchema.parse({
      orderId: order.id,
      externalMerchantOrderId: order.externalMerchantOrderId,
      campaignId: request.campaignId,
      packageId: promotionPackage.id,
      merchantId: promotionPackage.merchantId,
      merchantName: reachMerchantName,
      amountPaise: order.amountPaise,
      currency: order.currency,
      status: order.status,
      idempotencyKey: request.idempotencyKey,
      duplicate: false
    });
  }

  async getOrderDetails(orderId: string): Promise<ReachOrderDetails> {
    const order = await this.requireMerchantOrder(orderId);
    const events = await this.orderEvents(orderId);
    return this.toOrderDetails(order, events);
  }

  async deliver(orderId: string, input: unknown): Promise<ReachDeliveryResult> {
    const request = ReachDeliverRequestSchema.parse(input);
    const requestHash = hashPayload({
      orderId,
      approvedCreative: request.approvedCreative,
      campaignBrief: request.campaignBrief
    });
    const existingEvent = await this.findIdempotentOperation(
      "REACH_ORDER_DELIVERED",
      request.idempotencyKey,
      requestHash
    );

    if (existingEvent !== null) {
      const storedResult = ReachDeliveryResultSchema.safeParse(existingEvent.metadata.deliveryResult);
      if (!storedResult.success) {
        throw new ReachExchangeError(
          "IDEMPOTENCY_RESULT_MISSING",
          "Idempotent Reach delivery record is missing its original result.",
          500
        );
      }
      return storedResult.data;
    }

    const order = await this.requireMerchantOrder(orderId);

    if (order.status !== "CREATED" && order.status !== "BRIEF_DELIVERED") {
      throw new ReachExchangeError(
        "ORDER_NOT_DELIVERABLE",
        "Reach order can only be delivered before activation.",
        409
      );
    }

    const details = await this.getOrderDetails(orderId);
    const now = this.nowIso();
    const creativeAssetId = `reach_asset_${orderId}_creative`;
    const briefAssetId = `reach_asset_${orderId}_brief`;
    const assets: CampaignAsset[] = [
      CampaignAssetSchema.parse({
        id: creativeAssetId,
        campaignId: details.campaignId,
        optionId: details.packageId,
        type: "PROMOTION_COPY",
        content: request.approvedCreative,
        generatedBy: "OPENAI",
        model: "reach-sandbox-approved-creative",
        requiresOwnerApproval: true,
        createdAt: now
      }),
      CampaignAssetSchema.parse({
        id: briefAssetId,
        campaignId: details.campaignId,
        optionId: details.packageId,
        type: "OWNER_SUMMARY",
        content: request.campaignBrief,
        generatedBy: "OPENAI",
        model: "reach-sandbox-campaign-brief",
        requiresOwnerApproval: true,
        createdAt: now
      })
    ];

    for (const asset of assets) {
      await this.repository.saveCampaignAsset(asset);
    }

    const updatedOrder = MerchantOrderSchema.parse({
      ...order,
      status: "BRIEF_DELIVERED",
      updatedAt: now
    });
    const result = ReachDeliveryResultSchema.parse({
      order: {
        ...details,
        order: updatedOrder,
        delivered: true,
        creativeAssetId,
        briefAssetId
      },
      creativeAssetId,
      briefAssetId
    });

    await this.repository.saveMerchantOrder(updatedOrder);
    await this.repository.appendAuditEvent(
      this.auditEvent({
        entityId: order.id,
        eventType: "REACH_ORDER_DELIVERED",
        idempotencyKey: request.idempotencyKey,
        previousState: order.status,
        nextState: updatedOrder.status,
        metadata: {
          campaignId: details.campaignId,
          packageId: details.packageId,
          merchantId: details.merchantId,
          merchantName: reachMerchantName,
          creativeAssetId,
          briefAssetId,
          requestHash,
          deliveryResult: result
        }
      })
    );

    return result;
  }

  async activate(orderId: string, input: unknown): Promise<ReachActivationResult> {
    const request = ReachActivateRequestSchema.parse(input);
    const requestHash = hashPayload({ orderId });
    const existingEvent = await this.findIdempotentOperation(
      "REACH_ORDER_ACTIVATED",
      request.idempotencyKey,
      requestHash
    );

    if (existingEvent !== null) {
      const storedResult = ReachActivationResultSchema.safeParse(
        existingEvent.metadata.activationResult
      );
      if (!storedResult.success) {
        throw new ReachExchangeError(
          "IDEMPOTENCY_RESULT_MISSING",
          "Idempotent Reach activation record is missing its original result.",
          500
        );
      }
      return storedResult.data;
    }

    const order = await this.requireMerchantOrder(orderId);

    if (order.status === "CREATED") {
      throw new ReachExchangeError(
        "DELIVERY_REQUIRED",
        "Reach order must be delivered before activation.",
        409
      );
    }

    if (order.status !== "BRIEF_DELIVERED" && order.status !== "ACTIVE") {
      throw new ReachExchangeError("ORDER_NOT_ACTIVATABLE", "Reach order cannot be activated.", 409);
    }

    const publicActivationUrl = `${reachActivationBaseUrl}/${encodeURIComponent(
      order.externalMerchantOrderId
    )}`;

    if (order.status === "ACTIVE") {
      return ReachActivationResultSchema.parse({
        order: await this.getOrderDetails(order.id),
        publicActivationUrl
      });
    }

    const details = await this.getOrderDetails(order.id);
    const now = this.nowIso();
    const updatedOrder = MerchantOrderSchema.parse({
      ...order,
      status: "ACTIVE",
      updatedAt: now
    });
    const result = ReachActivationResultSchema.parse({
      order: {
        ...details,
        order: updatedOrder,
        activated: true,
        publicActivationUrl
      },
      publicActivationUrl
    });

    await this.repository.saveMerchantOrder(updatedOrder);
    await this.repository.appendAuditEvent(
      this.auditEvent({
        entityId: order.id,
        eventType: "REACH_ORDER_ACTIVATED",
        idempotencyKey: request.idempotencyKey,
        previousState: order.status,
        nextState: updatedOrder.status,
        metadata: {
          campaignId: details.campaignId,
          packageId: details.packageId,
          merchantId: details.merchantId,
          merchantName: reachMerchantName,
          publicActivationUrl,
          requestHash,
          activationResult: result
        }
      })
    );

    return result;
  }
  private toReachPackage(promotionPackage: PromotionPackage): ReachPackage {
    const quote = this.toQuote(promotionPackage);

    return ReachPackageSchema.parse({
      packageId: quote.packageId,
      providerId: promotionPackage.providerId,
      merchantId: promotionPackage.merchantId,
      merchantName: reachMerchantName,
      packageName: promotionPackage.title,
      description: promotionPackage.description,
      currency: promotionPackage.currency,
      catalogPricePaise: promotionPackage.pricePaise,
      livePricePaise: quote.livePricePaise,
      expectedReservations: promotionPackage.expectedReservations,
      expectedCpaPaise: promotionPackage.expectedCpaPaise,
      discountBps: promotionPackage.discountBps,
      publicationDeadlineAt: promotionPackage.bookingDeadlineAt,
      validFrom: promotionPackage.validFrom,
      validUntil: promotionPackage.validUntil,
      available: quote.available,
      priceChangedFromPaise: quote.priceChangedFromPaise
    });
  }

  private toQuote(promotionPackage: PromotionPackage): ReachQuote {
    const control = packageControls[promotionPackage.id] ?? { available: true };
    const livePackageId = control.livePackageId ?? promotionPackage.id;
    const livePricePaise = control.livePricePaise ?? promotionPackage.pricePaise;

    return ReachQuoteSchema.parse({
      packageId: livePackageId,
      merchantId: promotionPackage.merchantId,
      merchantName: reachMerchantName,
      currency: promotionPackage.currency,
      livePricePaise,
      available: control.available,
      publicationDeadlineAt: promotionPackage.bookingDeadlineAt,
      priceChangedFromPaise:
        livePricePaise === promotionPackage.pricePaise ? null : promotionPackage.pricePaise
    });
  }

  private async requirePromotionPackage(packageId: string): Promise<PromotionPackage> {
    const promotionPackage = await this.repository.getPromotionPackage(packageId);

    if (promotionPackage === null) {
      throw new ReachExchangeError("PACKAGE_NOT_FOUND", "Reach package was not found.", 404);
    }

    return promotionPackage;
  }

  private async requireMerchantOrder(orderId: string): Promise<MerchantOrder> {
    const order = await this.repository.getMerchantOrder(orderId);

    if (order === null) {
      throw new ReachExchangeError("ORDER_NOT_FOUND", "Reach order was not found.", 404);
    }

    return order;
  }

  private async findOrderByIdempotencyKey(
    idempotencyKey: string,
    requestHash: string
  ): Promise<MerchantOrder | null> {
    const events = await this.repository.listAuditEvents({ entityType: "MERCHANT_ORDER" });
    const existingEvent = events.find(
      (event) =>
        event.eventType === "REACH_CHECKOUT_COMPLETED" && event.idempotencyKey === idempotencyKey
    );

    if (existingEvent === undefined) {
      return null;
    }

    if (existingEvent.metadata.requestHash !== requestHash) {
      throw new ReachExchangeError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key was already used for a different Reach checkout request.",
        409
      );
    }

    const orderId = stringMetadata(existingEvent.metadata.orderId);

    if (orderId === null) {
      throw new ReachExchangeError(
        "IDEMPOTENCY_ORDER_MISSING",
        "Idempotent Reach checkout record is missing its order reference.",
        500
      );
    }

    return this.requireMerchantOrder(orderId);
  }

  private async findIdempotentOperation(
    eventType: "REACH_ORDER_DELIVERED" | "REACH_ORDER_ACTIVATED",
    idempotencyKey: string,
    requestHash: string
  ): Promise<AuditEvent | null> {
    const events = await this.repository.listAuditEvents({ entityType: "MERCHANT_ORDER" });
    const existingEvent = events.find(
      (event) => event.eventType === eventType && event.idempotencyKey === idempotencyKey
    );

    if (existingEvent === undefined) {
      return null;
    }

    if (existingEvent.metadata.requestHash !== requestHash) {
      throw new ReachExchangeError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key was already used for a different Reach operation payload.",
        409
      );
    }

    return existingEvent;
  }
  private async orderEvents(orderId: string): Promise<AuditEvent[]> {
    return this.repository.listAuditEvents({ entityType: "MERCHANT_ORDER", entityId: orderId });
  }

  private toOrderDetails(order: MerchantOrder, events: AuditEvent[]): ReachOrderDetails {
    const checkoutEvent = events.find((event) => event.eventType === "REACH_CHECKOUT_COMPLETED");
    const deliveryEvent = events.findLast((event) => event.eventType === "REACH_ORDER_DELIVERED");
    const activationEvent = events.findLast((event) => event.eventType === "REACH_ORDER_ACTIVATED");

    if (checkoutEvent === undefined) {
      throw new ReachExchangeError(
        "ORDER_METADATA_MISSING",
        "Reach order is missing checkout metadata.",
        500
      );
    }

    return ReachOrderDetailsSchema.parse({
      order,
      campaignId: requiredStringMetadata(checkoutEvent.metadata.campaignId, "campaignId"),
      packageId: requiredStringMetadata(checkoutEvent.metadata.packageId, "packageId"),
      merchantId: requiredStringMetadata(checkoutEvent.metadata.merchantId, "merchantId"),
      merchantName: stringMetadata(checkoutEvent.metadata.merchantName) ?? reachMerchantName,
      delivered: deliveryEvent !== undefined,
      activated: activationEvent !== undefined || order.status === "ACTIVE",
      creativeAssetId: stringMetadata(deliveryEvent?.metadata.creativeAssetId),
      briefAssetId: stringMetadata(deliveryEvent?.metadata.briefAssetId),
      publicActivationUrl: stringMetadata(activationEvent?.metadata.publicActivationUrl)
    });
  }

  private auditEvent(input: {
    entityId: string;
    eventType: string;
    idempotencyKey?: string;
    previousState: string | null;
    nextState: string | null;
    metadata: Record<string, unknown>;
  }): AuditEvent {
    return AuditEventSchema.parse({
      id: `audit_${randomUUID()}`,
      entityType: "MERCHANT_ORDER",
      entityId: input.entityId,
      eventType: input.eventType,
      actorType: "PROVIDER",
      actorId: "reverb_reach_exchange",
      occurredAt: this.nowIso(),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      previousState: input.previousState,
      nextState: input.nextState,
      metadata: input.metadata
    });
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }
}

function stringMetadata(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function requiredStringMetadata(value: unknown, label: string): string {
  const stringValue = stringMetadata(value);

  if (stringValue === null) {
    throw new ReachExchangeError(
      "ORDER_METADATA_MISSING",
      `Reach order is missing ${label} metadata.`,
      500
    );
  }

  return stringValue;
}

