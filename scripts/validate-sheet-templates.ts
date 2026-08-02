import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
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
  TransactionSchema
} from "../src/schemas";

type CsvRow = Record<string, string>;

type ParseContext = {
  sheetName: string;
  rowNumber: number;
  issues: string[];
};

type SheetSpec = {
  sheetName: string;
  fileName: string;
  requiredColumns: readonly string[];
  schema: z.ZodType;
  idColumn: string;
  moneyColumns: readonly string[];
  mapRow: (row: CsvRow, context: ParseContext) => unknown;
};

const sheetsDir = join(process.cwd(), "fixtures", "sheets");

const spotColumns = [
  "id",
  "ownerId",
  "name",
  "category",
  "averageBookingValuePaise",
  "timezone",
  "addressLine1",
  "addressLine2",
  "addressCity",
  "addressRegion",
  "addressPostalCode",
  "addressCountryCode",
  "createdAt",
  "updatedAt"
] as const;

const campaignColumns = [
  "id",
  "spotId",
  "requestedByOwnerId",
  "status",
  "requestSummary",
  "slotStartAt",
  "slotEndAt",
  "unusedCapacity",
  "targetReservations",
  "maxBudgetPaise",
  "maxDiscountBps",
  "maxExpectedCpaPaise",
  "createdAt",
  "updatedAt"
] as const;

const providerColumns = [
  "id",
  "name",
  "merchantId",
  "adapter",
  "verificationStatus",
  "isActive",
  "createdAt",
  "updatedAt"
] as const;

const promotionPackageColumns = [
  "id",
  "providerId",
  "merchantId",
  "providerSku",
  "title",
  "description",
  "currency",
  "pricePaise",
  "expectedReservations",
  "expectedCpaPaise",
  "discountBps",
  "bookingDeadlineAt",
  "validFrom",
  "validUntil",
  "verificationStatus",
  "evidenceIds",
  "createdAt",
  "updatedAt"
] as const;

const campaignOptionColumns = [
  "id",
  "campaignId",
  "packageId",
  "evidenceIds",
  "score",
  "totalCostPaise",
  "expectedReservations",
  "expectedCpaPaise",
  "discountBps",
  "deterministicBudget",
  "deterministicDeadline",
  "deterministicPrice",
  "deterministicMerchant",
  "deterministicDiscount",
  "deterministicCpa",
  "passesDeterministicChecks",
  "rejectionReasons",
  "generatedSummary",
  "createdAt"
] as const;

const campaignAssetColumns = [
  "id",
  "campaignId",
  "optionId",
  "type",
  "content",
  "generatedBy",
  "model",
  "requiresOwnerApproval",
  "createdAt"
] as const;

const transactionColumns = [
  "id",
  "campaignId",
  "ownerApprovalId",
  "providerId",
  "packageId",
  "status",
  "currency",
  "amountPaise",
  "idempotencyKey",
  "pravaAuthorizationId",
  "checkoutAttemptedAt",
  "merchantOrderId",
  "createdAt",
  "updatedAt"
] as const;

const merchantOrderColumns = [
  "id",
  "transactionId",
  "providerId",
  "externalMerchantOrderId",
  "status",
  "currency",
  "amountPaise",
  "scheduledStartAt",
  "scheduledEndAt",
  "paidAt",
  "createdAt",
  "updatedAt"
] as const;

const reservationColumns = [
  "id",
  "campaignId",
  "activationId",
  "spotId",
  "source",
  "customerReference",
  "seatCount",
  "reservationAt",
  "attributedAt",
  "status",
  "isTest",
  "testLabel"
] as const;

const auditLogColumns = [
  "id",
  "entityType",
  "entityId",
  "eventType",
  "actorType",
  "actorId",
  "occurredAt",
  "idempotencyKey",
  "previousState",
  "nextState",
  "metadata"
] as const;

const sheetSpecs: SheetSpec[] = [
  {
    sheetName: "Spots",
    fileName: "Spots.csv",
    requiredColumns: spotColumns,
    schema: SpotSchema,
    idColumn: "id",
    moneyColumns: ["averageBookingValuePaise"],
    mapRow: (row, context) => ({
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      category: row.category,
      averageBookingValuePaise: parseIntegerPaise(row, "averageBookingValuePaise", context),
      timezone: row.timezone,
      address: {
        line1: row.addressLine1,
        line2: emptyToUndefined(row.addressLine2),
        city: row.addressCity,
        region: emptyToUndefined(row.addressRegion),
        postalCode: emptyToUndefined(row.addressPostalCode),
        countryCode: row.addressCountryCode
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  },
  {
    sheetName: "Campaigns",
    fileName: "Campaigns.csv",
    requiredColumns: campaignColumns,
    schema: CampaignSchema,
    idColumn: "id",
    moneyColumns: ["maxBudgetPaise", "maxExpectedCpaPaise"],
    mapRow: (row, context) => ({
      id: row.id,
      spotId: row.spotId,
      requestedByOwnerId: row.requestedByOwnerId,
      status: row.status,
      requestSummary: row.requestSummary,
      slotStartAt: row.slotStartAt,
      slotEndAt: row.slotEndAt,
      unusedCapacity: parseInteger(row, "unusedCapacity", context),
      targetReservations: parseInteger(row, "targetReservations", context),
      maxBudgetPaise: parseIntegerPaise(row, "maxBudgetPaise", context),
      maxDiscountBps: parseInteger(row, "maxDiscountBps", context),
      maxExpectedCpaPaise: parseIntegerPaise(row, "maxExpectedCpaPaise", context),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  },
  {
    sheetName: "Providers",
    fileName: "Providers.csv",
    requiredColumns: providerColumns,
    schema: PromotionProviderSchema,
    idColumn: "id",
    moneyColumns: [],
    mapRow: (row, context) => ({
      id: row.id,
      name: row.name,
      merchantId: row.merchantId,
      adapter: row.adapter,
      verificationStatus: row.verificationStatus,
      isActive: parseBoolean(row, "isActive", context),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  },
  {
    sheetName: "Promotion_Packages",
    fileName: "Promotion_Packages.csv",
    requiredColumns: promotionPackageColumns,
    schema: PromotionPackageSchema,
    idColumn: "id",
    moneyColumns: ["pricePaise", "expectedCpaPaise"],
    mapRow: (row, context) => ({
      id: row.id,
      providerId: row.providerId,
      merchantId: row.merchantId,
      providerSku: row.providerSku,
      title: row.title,
      description: row.description,
      currency: row.currency,
      pricePaise: parseIntegerPaise(row, "pricePaise", context),
      expectedReservations: parseInteger(row, "expectedReservations", context),
      expectedCpaPaise: parseIntegerPaise(row, "expectedCpaPaise", context),
      discountBps: parseInteger(row, "discountBps", context),
      bookingDeadlineAt: row.bookingDeadlineAt,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      verificationStatus: row.verificationStatus,
      evidenceIds: parseList(row.evidenceIds),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  },
  {
    sheetName: "Campaign_Options",
    fileName: "Campaign_Options.csv",
    requiredColumns: campaignOptionColumns,
    schema: CampaignOptionSchema,
    idColumn: "id",
    moneyColumns: ["totalCostPaise", "expectedCpaPaise"],
    mapRow: (row, context) => ({
      id: row.id,
      campaignId: row.campaignId,
      packageId: row.packageId,
      evidenceIds: parseList(row.evidenceIds),
      score: parseInteger(row, "score", context),
      totalCostPaise: parseIntegerPaise(row, "totalCostPaise", context),
      expectedReservations: parseInteger(row, "expectedReservations", context),
      expectedCpaPaise: parseIntegerPaise(row, "expectedCpaPaise", context),
      discountBps: parseInteger(row, "discountBps", context),
      deterministicChecks: {
        budget: parseBoolean(row, "deterministicBudget", context),
        deadline: parseBoolean(row, "deterministicDeadline", context),
        price: parseBoolean(row, "deterministicPrice", context),
        merchant: parseBoolean(row, "deterministicMerchant", context),
        discount: parseBoolean(row, "deterministicDiscount", context),
        cpa: parseBoolean(row, "deterministicCpa", context)
      },
      passesDeterministicChecks: parseBoolean(row, "passesDeterministicChecks", context),
      rejectionReasons: parseList(row.rejectionReasons),
      generatedSummary: emptyToUndefined(row.generatedSummary),
      createdAt: row.createdAt
    })
  },
  {
    sheetName: "Campaign_Assets",
    fileName: "Campaign_Assets.csv",
    requiredColumns: campaignAssetColumns,
    schema: CampaignAssetSchema,
    idColumn: "id",
    moneyColumns: [],
    mapRow: (row, context) => ({
      id: row.id,
      campaignId: row.campaignId,
      optionId: row.optionId,
      type: row.type,
      content: row.content,
      generatedBy: row.generatedBy,
      model: row.model,
      requiresOwnerApproval: parseBoolean(row, "requiresOwnerApproval", context),
      createdAt: row.createdAt
    })
  },
  {
    sheetName: "Transactions",
    fileName: "Transactions.csv",
    requiredColumns: transactionColumns,
    schema: TransactionSchema,
    idColumn: "id",
    moneyColumns: ["amountPaise"],
    mapRow: (row, context) => ({
      id: row.id,
      campaignId: row.campaignId,
      ownerApprovalId: row.ownerApprovalId,
      providerId: row.providerId,
      packageId: row.packageId,
      status: row.status,
      currency: row.currency,
      amountPaise: parseIntegerPaise(row, "amountPaise", context),
      idempotencyKey: row.idempotencyKey,
      pravaAuthorizationId: emptyToNull(row.pravaAuthorizationId),
      checkoutAttemptedAt: emptyToNull(row.checkoutAttemptedAt),
      merchantOrderId: emptyToNull(row.merchantOrderId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  },
  {
    sheetName: "Merchant_Orders",
    fileName: "Merchant_Orders.csv",
    requiredColumns: merchantOrderColumns,
    schema: MerchantOrderSchema,
    idColumn: "id",
    moneyColumns: ["amountPaise"],
    mapRow: (row, context) => ({
      id: row.id,
      transactionId: row.transactionId,
      providerId: row.providerId,
      externalMerchantOrderId: row.externalMerchantOrderId,
      status: row.status,
      currency: row.currency,
      amountPaise: parseIntegerPaise(row, "amountPaise", context),
      scheduledStartAt: row.scheduledStartAt,
      scheduledEndAt: row.scheduledEndAt,
      paidAt: emptyToNull(row.paidAt),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  },
  {
    sheetName: "Reservations",
    fileName: "Reservations.csv",
    requiredColumns: reservationColumns,
    schema: ReservationSchema,
    idColumn: "id",
    moneyColumns: [],
    mapRow: (row, context) => ({
      id: row.id,
      campaignId: row.campaignId,
      activationId: row.activationId,
      spotId: row.spotId,
      source: row.source,
      customerReference: row.customerReference,
      seatCount: parseInteger(row, "seatCount", context),
      reservationAt: row.reservationAt,
      attributedAt: row.attributedAt,
      status: row.status,
      isTest: parseBoolean(row, "isTest", context),
      testLabel: emptyToNull(row.testLabel)
    })
  },
  {
    sheetName: "Audit_Log",
    fileName: "Audit_Log.csv",
    requiredColumns: auditLogColumns,
    schema: AuditEventSchema,
    idColumn: "id",
    moneyColumns: [],
    mapRow: (row, context) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      eventType: row.eventType,
      actorType: row.actorType,
      actorId: emptyToUndefined(row.actorId),
      occurredAt: row.occurredAt,
      idempotencyKey: emptyToUndefined(row.idempotencyKey),
      previousState: emptyToNull(row.previousState),
      nextState: emptyToNull(row.nextState),
      metadata: parseMetadata(row.metadata, context)
    })
  }
];

const issues: string[] = [];
const report: string[] = [];

for (const spec of sheetSpecs) {
  validateSheet(spec, issues, report);
}

if (issues.length > 0) {
  console.error("Sheet template validation failed:");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log("Sheet templates are valid.");
report.forEach((line) => console.log(line));

function validateSheet(spec: SheetSpec, issues: string[], report: string[]): void {
  const filePath = join(sheetsDir, spec.fileName);

  if (!existsSync(filePath)) {
    issues.push(`${spec.fileName}: missing file`);
    return;
  }

  const { headers, rows } = readCsv(filePath);
  const headerSet = new Set(headers);
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  const missingColumns = spec.requiredColumns.filter((column) => !headerSet.has(column));

  duplicateHeaders.forEach((header) => {
    issues.push(`${spec.fileName}: duplicate column ${header}`);
  });

  if (missingColumns.length > 0) {
    issues.push(`${spec.fileName}: missing required columns ${missingColumns.join(", ")}`);
  }

  const seenIds = new Set<string>();
  let validRows = 0;

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const id = row[spec.idColumn];

    if (id) {
      if (seenIds.has(id)) {
        issues.push(`${spec.fileName} row ${rowNumber}: duplicate id ${id}`);
      }

      seenIds.add(id);
    }

    spec.moneyColumns.forEach((column) => {
      if (!/^\d+$/.test(row[column] ?? "")) {
        issues.push(
          `${spec.fileName} row ${rowNumber}: ${column} must be integer paise with no rupee decimals or symbols`
        );
      }
    });

    const context: ParseContext = {
      sheetName: spec.fileName,
      rowNumber,
      issues
    };
    const mappedRow = spec.mapRow(row, context);
    const parsed = spec.schema.safeParse(mappedRow);

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "row";
        issues.push(`${spec.fileName} row ${rowNumber}: ${path} ${issue.message}`);
      });
      return;
    }

    validRows += 1;
  });

  report.push(`- ${spec.fileName}: ${validRows} populated row${validRows === 1 ? "" : "s"}`);
}

function readCsv(filePath: string): { headers: string[]; rows: CsvRow[] } {
  const rawFile = readFileSync(filePath, "utf8");
  const records = parse(rawFile, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
    trim: true
  }) as string[][];

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0].map((header) => header.trim());
  const rows = records.slice(1).flatMap((record) => {
    const values = record.map((value) => value.trim());

    if (values.every((value) => value === "")) {
      return [];
    }

    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    );

    return [row];
  });

  return { headers, rows };
}

function parseInteger(row: CsvRow, column: string, context: ParseContext): number {
  const value = row[column] ?? "";

  if (!/^\d+$/.test(value)) {
    context.issues.push(`${context.sheetName} row ${context.rowNumber}: ${column} must be an integer`);
    return 0;
  }

  return Number(value);
}

function parseIntegerPaise(row: CsvRow, column: string, context: ParseContext): number {
  const value = row[column] ?? "";

  if (!/^\d+$/.test(value)) {
    context.issues.push(
      `${context.sheetName} row ${context.rowNumber}: ${column} must be integer paise`
    );
    return 0;
  }

  return Number(value);
}

function parseBoolean(row: CsvRow, column: string, context: ParseContext): boolean {
  const value = (row[column] ?? "").toLowerCase();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  context.issues.push(`${context.sheetName} row ${context.rowNumber}: ${column} must be true or false`);
  return false;
}

function parseList(value: string): string[] {
  if (value.trim() === "") {
    return [];
  }

  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMetadata(value: string, context: ParseContext): Record<string, unknown> {
  if (value.trim() === "") {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to the concise validation issue below.
  }

  context.issues.push(`${context.sheetName} row ${context.rowNumber}: metadata must be a JSON object`);
  return {};
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function emptyToUndefined(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}
