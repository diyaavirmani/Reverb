import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as activateOrder } from "../src/app/api/reach/orders/[orderId]/activate/route";
import { POST as checkout } from "../src/app/api/reach/checkout/route";
import { POST as deliverOrder } from "../src/app/api/reach/orders/[orderId]/deliver/route";
import { GET as getOrder } from "../src/app/api/reach/orders/[orderId]/route";
import { GET as getPackages } from "../src/app/api/reach/packages/route";
import { GET as getQuote } from "../src/app/api/reach/quote/route";
import { LocalFixtureRepository } from "../src/lib/repositories";
import {
  ReachActivationResultSchema,
  ReachCheckoutResultSchema,
  ReachDeliveryResultSchema,
  ReachOrderDetailsSchema,
  ReachPackageSchema,
  ReachQuoteSchema,
  type ReachCheckoutRequest
} from "../src/schemas";

const fixtureSourceDir = join(process.cwd(), "fixtures", "data");
const originalUseFixtures = process.env.USE_FIXTURES;
const originalFixtureDataDir = process.env.REACH_FIXTURE_DATA_DIR;
const originalCurrentTime = process.env.REACH_CURRENT_TIME;

const checkoutRequest: ReachCheckoutRequest = {
  campaignId: "campaign_demo_friday",
  packageId: "package_local_dining_boost",
  approvedMerchantId: "merchant_reach_local_dining",
  approvedAmountPaise: 480000,
  idempotencyKey: "idem_reach_checkout_success",
  paymentAuthorisationReference: "fixture_prava_auth_completed"
};

describe("Reverb Reach Exchange API", () => {
  let temporaryRoot: string;
  let dataDir: string;
  let repository: LocalFixtureRepository;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-reach-fixtures-"));
    dataDir = join(temporaryRoot, "data");
    await cp(fixtureSourceDir, dataDir, { recursive: true });
    repository = new LocalFixtureRepository(dataDir);
    process.env.USE_FIXTURES = "true";
    process.env.REACH_FIXTURE_DATA_DIR = dataDir;
    process.env.REACH_CURRENT_TIME = "2026-08-02T00:00:00.000Z";
  });

  afterEach(async () => {
    restoreEnv();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("lists Reach packages from repository-backed fixture packages", async () => {
    const response = await getPackages();
    const json = await response.json();
    const packages = ReachPackageSchema.array().parse(json.packages);

    expect(response.status).toBe(200);
    expect(packages).toHaveLength(3);
    expect(packages[0]).toMatchObject({
      merchantName: "Reverb Reach Exchange",
      packageId: "package_local_dining_boost"
    });
  });

  it("creates a merchant order for a valid checkout", async () => {
    const response = await checkout(jsonRequest("/api/reach/checkout", checkoutRequest));
    const json = await response.json();
    const result = ReachCheckoutResultSchema.parse(json);

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      campaignId: checkoutRequest.campaignId,
      packageId: checkoutRequest.packageId,
      merchantId: checkoutRequest.approvedMerchantId,
      merchantName: "Reverb Reach Exchange",
      amountPaise: checkoutRequest.approvedAmountPaise,
      status: "CREATED",
      duplicate: false
    });
    expect(result.orderId).toMatch(/^reach_order_/);

    await expect(repository.getMerchantOrder(result.orderId)).resolves.toMatchObject({
      id: result.orderId,
      status: "CREATED",
      amountPaise: 480000
    });
  });

  it("returns the original order for duplicate checkout idempotency", async () => {
    const firstResponse = await checkout(jsonRequest("/api/reach/checkout", checkoutRequest));
    const first = ReachCheckoutResultSchema.parse(await firstResponse.json());

    const duplicateResponse = await checkout(jsonRequest("/api/reach/checkout", checkoutRequest));
    const duplicate = ReachCheckoutResultSchema.parse(await duplicateResponse.json());

    expect(duplicateResponse.status).toBe(200);
    expect(duplicate.orderId).toBe(first.orderId);
    expect(duplicate.externalMerchantOrderId).toBe(first.externalMerchantOrderId);
    expect(duplicate.duplicate).toBe(true);
  });

  it("exposes the controlled price-change package and rejects stale approved prices", async () => {
    const quoteResponse = await getQuote(
      new Request("http://localhost/api/reach/quote?packageId=package_neighborhood_food_blast")
    );
    const quote = ReachQuoteSchema.parse(await quoteResponse.json());

    expect(quoteResponse.status).toBe(200);
    expect(quote).toMatchObject({
      packageId: "package_neighborhood_food_blast",
      livePricePaise: 550000,
      priceChangedFromPaise: 300000
    });

    const response = await checkout(
      jsonRequest("/api/reach/checkout", {
        ...checkoutRequest,
        packageId: "package_neighborhood_food_blast",
        approvedMerchantId: "merchant_reach_neighborhood_food",
        approvedAmountPaise: 300000,
        idempotencyKey: "idem_reach_price_change"
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({ code: "PRICE_CHANGED" });
  });

  it("rejects unavailable packages before creating an order", async () => {
    const response = await checkout(
      jsonRequest("/api/reach/checkout", {
        ...checkoutRequest,
        packageId: "package_premium_weekend_push",
        approvedMerchantId: "merchant_reach_premium_weekend",
        approvedAmountPaise: 540000,
        idempotencyKey: "idem_reach_unavailable"
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(repository.getMerchantOrder("idem_reach_unavailable")).resolves.toBeNull();
  });

  it("delivers approved creative and activates only after delivery", async () => {
    const checkoutResponse = await checkout(jsonRequest("/api/reach/checkout", checkoutRequest));
    const checkoutResult = ReachCheckoutResultSchema.parse(await checkoutResponse.json());
    const context = { params: { orderId: checkoutResult.orderId } };

    const earlyActivationResponse = await activateOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/activate`, {
        idempotencyKey: "idem_reach_early_activation"
      }),
      context
    );
    expect(earlyActivationResponse.status).toBe(409);
    await expect(earlyActivationResponse.json()).resolves.toMatchObject({ code: "DELIVERY_REQUIRED" });

    const deliveryResponse = await deliverOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/deliver`, {
        approvedCreative: "Friday tables are open at The Quiet Cup.",
        campaignBrief: "Promote the Friday 7-9 PM slot with 12 unused seats and a 15% max discount.",
        idempotencyKey: "idem_reach_delivery_success"
      }),
      context
    );
    const delivery = ReachDeliveryResultSchema.parse(await deliveryResponse.json());

    expect(deliveryResponse.status).toBe(200);
    expect(delivery.order.order.status).toBe("BRIEF_DELIVERED");
    await expect(repository.getCampaignAsset(delivery.creativeAssetId)).resolves.toMatchObject({
      content: "Friday tables are open at The Quiet Cup."
    });
    await expect(repository.getCampaignAsset(delivery.briefAssetId)).resolves.toMatchObject({
      content: "Promote the Friday 7-9 PM slot with 12 unused seats and a 15% max discount."
    });

    const activationResponse = await activateOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/activate`, {
        idempotencyKey: "idem_reach_activation_success"
      }),
      context
    );
    const activation = ReachActivationResultSchema.parse(await activationResponse.json());

    expect(activationResponse.status).toBe(200);
    expect(activation.order.order.status).toBe("ACTIVE");
    expect(activation.publicActivationUrl).toContain(checkoutResult.externalMerchantOrderId);

    const orderResponse = await getOrder(
      new Request(`http://localhost/api/reach/orders/${checkoutResult.orderId}`),
      context
    );
    const order = ReachOrderDetailsSchema.parse(await orderResponse.json());

    expect(orderResponse.status).toBe(200);
    expect(order).toMatchObject({
      delivered: true,
      activated: true,
      publicActivationUrl: activation.publicActivationUrl
    });
  });

  it("returns the original delivery result for an identical idempotent retry", async () => {
    const checkoutResponse = await checkout(
      jsonRequest("/api/reach/checkout", {
        ...checkoutRequest,
        idempotencyKey: "idem_delivery_retry_checkout"
      })
    );
    const checkoutResult = ReachCheckoutResultSchema.parse(await checkoutResponse.json());
    const context = { params: { orderId: checkoutResult.orderId } };
    const deliveryRequest = {
      approvedCreative: "Identical approved creative.",
      campaignBrief: "Identical campaign brief.",
      idempotencyKey: "idem_reach_delivery_retry"
    };

    const firstResponse = await deliverOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/deliver`, deliveryRequest),
      context
    );
    const first = ReachDeliveryResultSchema.parse(await firstResponse.json());
    const retryResponse = await deliverOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/deliver`, deliveryRequest),
      context
    );
    const retry = ReachDeliveryResultSchema.parse(await retryResponse.json());

    expect(retryResponse.status).toBe(200);
    expect(retry).toEqual(first);
    const deliveryEvents = (
      await repository.listAuditEvents({ entityType: "MERCHANT_ORDER", entityId: checkoutResult.orderId })
    ).filter((event) => event.eventType === "REACH_ORDER_DELIVERED");
    expect(deliveryEvents).toHaveLength(1);
  });

  it("rejects a delivery idempotency key reused with different payload", async () => {
    const checkoutResponse = await checkout(
      jsonRequest("/api/reach/checkout", {
        ...checkoutRequest,
        idempotencyKey: "idem_delivery_conflict_checkout"
      })
    );
    const checkoutResult = ReachCheckoutResultSchema.parse(await checkoutResponse.json());
    const context = { params: { orderId: checkoutResult.orderId } };
    const idempotencyKey = "idem_reach_delivery_conflict";

    await deliverOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/deliver`, {
        approvedCreative: "Original creative.",
        campaignBrief: "Original brief.",
        idempotencyKey
      }),
      context
    );
    const conflictResponse = await deliverOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/deliver`, {
        approvedCreative: "Changed creative.",
        campaignBrief: "Original brief.",
        idempotencyKey
      }),
      context
    );

    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const deliveryEvents = (
      await repository.listAuditEvents({ entityType: "MERCHANT_ORDER", entityId: checkoutResult.orderId })
    ).filter((event) => event.eventType === "REACH_ORDER_DELIVERED");
    expect(deliveryEvents).toHaveLength(1);
  });

  it("returns the original activation result without another commercial state change", async () => {
    const checkoutResponse = await checkout(
      jsonRequest("/api/reach/checkout", {
        ...checkoutRequest,
        idempotencyKey: "idem_activation_retry_checkout"
      })
    );
    const checkoutResult = ReachCheckoutResultSchema.parse(await checkoutResponse.json());
    const context = { params: { orderId: checkoutResult.orderId } };
    await deliverOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/deliver`, {
        approvedCreative: "Activation retry creative.",
        campaignBrief: "Activation retry brief.",
        idempotencyKey: "idem_activation_retry_delivery"
      }),
      context
    );
    const activationRequest = { idempotencyKey: "idem_reach_activation_retry" };

    const firstResponse = await activateOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/activate`, activationRequest),
      context
    );
    const first = ReachActivationResultSchema.parse(await firstResponse.json());
    const retryResponse = await activateOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/activate`, activationRequest),
      context
    );
    const retry = ReachActivationResultSchema.parse(await retryResponse.json());

    expect(retryResponse.status).toBe(200);
    expect(retry).toEqual(first);
    const activationEvents = (
      await repository.listAuditEvents({ entityType: "MERCHANT_ORDER", entityId: checkoutResult.orderId })
    ).filter((event) => event.eventType === "REACH_ORDER_ACTIVATED");
    expect(activationEvents).toHaveLength(1);
  });

  it("rejects an activation idempotency key reused for a different order", async () => {
    const firstCheckoutResponse = await checkout(
      jsonRequest("/api/reach/checkout", {
        ...checkoutRequest,
        idempotencyKey: "idem_activation_conflict_checkout_one"
      })
    );
    const secondCheckoutResponse = await checkout(
      jsonRequest("/api/reach/checkout", {
        ...checkoutRequest,
        idempotencyKey: "idem_activation_conflict_checkout_two"
      })
    );
    const firstOrder = ReachCheckoutResultSchema.parse(await firstCheckoutResponse.json());
    const secondOrder = ReachCheckoutResultSchema.parse(await secondCheckoutResponse.json());
    const firstContext = { params: { orderId: firstOrder.orderId } };
    const secondContext = { params: { orderId: secondOrder.orderId } };

    await deliverOrder(
      jsonRequest(`/api/reach/orders/${firstOrder.orderId}/deliver`, {
        approvedCreative: "First order creative.",
        campaignBrief: "First order brief.",
        idempotencyKey: "idem_activation_conflict_delivery_one"
      }),
      firstContext
    );
    await deliverOrder(
      jsonRequest(`/api/reach/orders/${secondOrder.orderId}/deliver`, {
        approvedCreative: "Second order creative.",
        campaignBrief: "Second order brief.",
        idempotencyKey: "idem_activation_conflict_delivery_two"
      }),
      secondContext
    );
    const reusedKey = "idem_reach_activation_conflict";
    await activateOrder(
      jsonRequest(`/api/reach/orders/${firstOrder.orderId}/activate`, {
        idempotencyKey: reusedKey
      }),
      firstContext
    );
    const conflictResponse = await activateOrder(
      jsonRequest(`/api/reach/orders/${secondOrder.orderId}/activate`, {
        idempotencyKey: reusedKey
      }),
      secondContext
    );

    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(repository.getMerchantOrder(secondOrder.orderId)).resolves.toMatchObject({
      status: "BRIEF_DELIVERED"
    });
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function restoreEnv(): void {
  if (originalUseFixtures === undefined) {
    delete process.env.USE_FIXTURES;
  } else {
    process.env.USE_FIXTURES = originalUseFixtures;
  }

  if (originalFixtureDataDir === undefined) {
    delete process.env.REACH_FIXTURE_DATA_DIR;
  } else {
    process.env.REACH_FIXTURE_DATA_DIR = originalFixtureDataDir;
  }

  if (originalCurrentTime === undefined) {
    delete process.env.REACH_CURRENT_TIME;
  } else {
    process.env.REACH_CURRENT_TIME = originalCurrentTime;
  }
}
