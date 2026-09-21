import { rmSync } from "node:fs";
import { access, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Campaign } from "../../schemas";

const sharedFixturePrefix = "reverb-demo-fixtures-";
const fixtureRecordLimit = 200;
const fixtureFiles = {
  campaigns: "campaigns.json",
  campaignOptions: "campaign-options.json",
  campaignAssets: "campaign-assets.json",
  transactions: "transactions.json",
  merchantOrders: "merchant-orders.json",
  reservations: "reservations.json",
  auditEvents: "audit-events.json"
} as const;

declare global {
  var __reverbFixtureDir: Promise<string> | undefined;
  var __reverbFixtureCleanupRegistered: boolean | undefined;
}

export async function getSharedFixtureDataDir(): Promise<string> {
  const configuredDataDir = process.env.REVERB_FIXTURE_DATA_DIR ?? process.env.REACH_FIXTURE_DATA_DIR;

  if (configuredDataDir) {
    return configuredDataDir;
  }

  if (globalThis.__reverbFixtureDir) {
    const existingDir = await globalThis.__reverbFixtureDir;

    try {
      await access(existingDir);
      await pruneFixtureCampaigns(existingDir);
      return existingDir;
    } catch {
      globalThis.__reverbFixtureDir = undefined;
    }
  }

  globalThis.__reverbFixtureDir = createSharedFixtureDataDir();
  return globalThis.__reverbFixtureDir;
}

export async function pruneFixtureCampaigns(
  dataDir: string,
  maxCampaigns = fixtureRecordLimit
): Promise<void> {
  const campaigns = await readJsonArray<Campaign>(dataDir, fixtureFiles.campaigns);

  if (campaigns.length <= maxCampaigns) {
    return;
  }

  const sortedCampaigns = [...campaigns].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  );
  const prunedCampaigns = sortedCampaigns.slice(0, campaigns.length - maxCampaigns);
  const prunedCampaignIds = new Set(prunedCampaigns.map((campaign) => campaign.id));

  await writeJsonArray(
    dataDir,
    fixtureFiles.campaigns,
    campaigns.filter((campaign) => !prunedCampaignIds.has(campaign.id))
  );

  await pruneByCampaignId(dataDir, fixtureFiles.campaignOptions, prunedCampaignIds);
  await pruneByCampaignId(dataDir, fixtureFiles.campaignAssets, prunedCampaignIds);
  const removedTransactions = await pruneByCampaignId(
    dataDir,
    fixtureFiles.transactions,
    prunedCampaignIds
  );
  await pruneByCampaignId(dataDir, fixtureFiles.reservations, prunedCampaignIds);

  const removedTransactionIds = new Set(
    removedTransactions
      .map((transaction) => field(transaction, "id"))
      .filter((id): id is string => typeof id === "string")
  );
  const removedOrderIds = await pruneMerchantOrders(dataDir, removedTransactionIds);
  await pruneAuditEvents(dataDir, prunedCampaignIds, removedTransactionIds, removedOrderIds);
}

async function createSharedFixtureDataDir(): Promise<string> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), sharedFixturePrefix));
  const temporaryDataDir = join(temporaryRoot, "data");

  await cp(join(process.cwd(), "fixtures", "data"), temporaryDataDir, { recursive: true });
  await pruneFixtureCampaigns(temporaryDataDir);
  registerCleanup(temporaryRoot);
  return temporaryDataDir;
}

function registerCleanup(temporaryRoot: string): void {
  if (globalThis.__reverbFixtureCleanupRegistered) {
    return;
  }

  globalThis.__reverbFixtureCleanupRegistered = true;
  process.once("exit", () => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });
}

async function pruneByCampaignId(
  dataDir: string,
  fileName: string,
  campaignIds: Set<string>
): Promise<Record<string, unknown>[]> {
  const records = await readJsonArray<Record<string, unknown>>(dataDir, fileName);
  const removed = records.filter((record) => {
    const campaignId = field(record, "campaignId");
    return typeof campaignId === "string" && campaignIds.has(campaignId);
  });

  if (removed.length > 0) {
    await writeJsonArray(
      dataDir,
      fileName,
      records.filter((record) => !removed.includes(record))
    );
  }

  return removed;
}

async function pruneMerchantOrders(
  dataDir: string,
  transactionIds: Set<string>
): Promise<Set<string>> {
  const orders = await readJsonArray<Record<string, unknown>>(dataDir, fixtureFiles.merchantOrders);
  const removedOrderIds = new Set<string>();
  const retainedOrders = orders.filter((order) => {
    const transactionId = field(order, "transactionId");
    const removeOrder = typeof transactionId === "string" && transactionIds.has(transactionId);

    if (removeOrder) {
      const orderId = field(order, "id");
      if (typeof orderId === "string") {
        removedOrderIds.add(orderId);
      }
    }

    return !removeOrder;
  });

  if (retainedOrders.length !== orders.length) {
    await writeJsonArray(dataDir, fixtureFiles.merchantOrders, retainedOrders);
  }

  return removedOrderIds;
}

async function pruneAuditEvents(
  dataDir: string,
  campaignIds: Set<string>,
  transactionIds: Set<string>,
  orderIds: Set<string>
): Promise<void> {
  const events = await readJsonArray<Record<string, unknown>>(dataDir, fixtureFiles.auditEvents);
  const retainedEvents = events.filter((event) => {
    const entityId = field(event, "entityId");
    const metadata = field(event, "metadata");
    const metadataCampaignId =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? field(metadata as Record<string, unknown>, "campaignId")
        : undefined;

    return !(
      (typeof entityId === "string" &&
        (campaignIds.has(entityId) || transactionIds.has(entityId) || orderIds.has(entityId))) ||
      (typeof metadataCampaignId === "string" && campaignIds.has(metadataCampaignId))
    );
  });

  if (retainedEvents.length !== events.length) {
    await writeJsonArray(dataDir, fixtureFiles.auditEvents, retainedEvents);
  }
}

function field(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

async function readJsonArray<T>(dataDir: string, fileName: string): Promise<T[]> {
  const raw = await readFile(join(dataDir, fileName), "utf8");
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

async function writeJsonArray<T>(dataDir: string, fileName: string, records: T[]): Promise<void> {
  await writeFile(join(dataDir, fileName), `${JSON.stringify(records, null, 2)}\n`, "utf8");
}
