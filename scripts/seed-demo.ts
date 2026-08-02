import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PromotionPackageSchema,
  PromotionProviderSchema,
  SpotSchema
} from "../src/schemas";

const timestamp = "2026-08-01T00:00:00.000Z";
const dataDirectory = path.resolve("fixtures/data");

const spots = SpotSchema.array().parse([
  {
    id: "spot_quiet_cup_cafe",
    ownerId: "owner_diya_demo",
    name: "Quiet Cup Cafe",
    category: "CAFE",
    averageBookingValuePaise: 125000,
    timezone: "Asia/Kolkata",
    address: {
      line1: "12 Market Road",
      city: "Bengaluru",
      region: "KA",
      postalCode: "560001",
      countryCode: "IN"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  }
]);

const providers = PromotionProviderSchema.array().parse([
  {
    id: "provider_reach_local_dining",
    name: "Reach Exchange Local Dining Boost",
    merchantId: "merchant_reach_local_dining",
    adapter: "REACH_EXCHANGE",
    verificationStatus: "VERIFIED",
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  },
  {
    id: "provider_reach_neighborhood_food",
    name: "Reach Exchange Neighborhood Food Blast",
    merchantId: "merchant_reach_neighborhood_food",
    adapter: "REACH_EXCHANGE",
    verificationStatus: "UNVERIFIED",
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  },
  {
    id: "provider_reach_premium_weekend",
    name: "Reach Exchange Premium Weekend Push",
    merchantId: "merchant_reach_premium_weekend",
    adapter: "REACH_EXCHANGE",
    verificationStatus: "VERIFIED",
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  }
]);

const packages = PromotionPackageSchema.array().parse([
  {
    id: "package_local_dining_boost",
    providerId: "provider_reach_local_dining",
    merchantId: "merchant_reach_local_dining",
    providerSku: "reach_local_dining_boost",
    title: "Local Dining Boost",
    description: "Verified local distribution for Friday dinner.",
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
    createdAt: timestamp,
    updatedAt: timestamp
  },
  {
    id: "package_neighborhood_food_blast",
    providerId: "provider_reach_neighborhood_food",
    merchantId: "merchant_reach_neighborhood_food",
    providerSku: "reach_neighborhood_food_blast",
    title: "Neighborhood Food Blast",
    description: "Lower-cost package without acceptable Senso evidence.",
    currency: "INR",
    pricePaise: 300000,
    expectedReservations: 5,
    expectedCpaPaise: 60000,
    discountBps: 1000,
    bookingDeadlineAt: "2026-08-07T13:00:00.000Z",
    validFrom: "2026-08-07T13:30:00.000Z",
    validUntil: "2026-08-07T15:30:00.000Z",
    verificationStatus: "UNVERIFIED",
    evidenceIds: ["evidence_neighborhood_food_blast"],
    createdAt: timestamp,
    updatedAt: timestamp
  },
  {
    id: "package_premium_weekend_push",
    providerId: "provider_reach_premium_weekend",
    merchantId: "merchant_reach_premium_weekend",
    providerSku: "reach_premium_weekend_push",
    title: "Premium Weekend Push",
    description: "Verified package that exceeds budget and expected CPA constraints.",
    currency: "INR",
    pricePaise: 540000,
    expectedReservations: 6,
    expectedCpaPaise: 90000,
    discountBps: 1500,
    bookingDeadlineAt: "2026-08-07T13:00:00.000Z",
    validFrom: "2026-08-07T13:30:00.000Z",
    validUntil: "2026-08-07T15:30:00.000Z",
    verificationStatus: "VERIFIED",
    evidenceIds: ["evidence_premium_weekend_push"],
    createdAt: timestamp,
    updatedAt: timestamp
  }
]);

await Promise.all([
  writeJsonAtomic("spots.json", spots),
  writeJsonAtomic("providers.json", providers),
  writeJsonAtomic("promotion-packages.json", packages)
]);

console.log("Demo seed complete: 1 Spot, 3 providers, and 3 promotion packages prepared.");

async function writeJsonAtomic(fileName: string, value: unknown): Promise<void> {
  const target = path.join(dataDirectory, fileName);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}
