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
      new Request(`http://localhost/api/reach/orders/${checkoutResult.orderId}/activate`, { method: "POST" }),
      context
    );
    expect(earlyActivationResponse.status).toBe(409);
    await expect(earlyActivationResponse.json()).resolves.toMatchObject({ code: "DELIVERY_REQUIRED" });

    const deliveryResponse = await deliverOrder(
      jsonRequest(`/api/reach/orders/${checkoutResult.orderId}/deliver`, {
        approvedCreative: "Friday tables are open at The Quiet Cup.",
        campaignBrief: "Promote the Friday 7-9 PM slot with 12 unused seats and a 15% max discount."
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
      new Request(`http://localhost/api/reach/orders/${checkoutResult.orderId}/activate`, { method: "POST" }),
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
