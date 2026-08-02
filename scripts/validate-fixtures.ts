import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { z, type ZodType } from "zod";

import {
  AuditEventSchema,
  CampaignAssetSchema,
  CampaignCreativeSchema,
  CampaignIntentSchema,
  CampaignOptionSchema,
  CampaignSchema,
  DecisionExplanationSchema,
  LinqSendMessageResultSchema,
  MerchantOrderSchema,
  OpenAIQualityReviewSchema,
  PravaCreateSessionResultSchema,
  PravaPaymentResultSchema,
  PravaReportCheckoutOutcomeResultSchema,
  PromotionPackageSchema,
  PromotionProviderSchema,
  ReservationSchema,
  SensoProviderVerificationSchema,
  SpotSchema,
  TransactionSchema
} from "../src/schemas";

const requiredFixtureDirectories = [
  "fixtures/data",
  "fixtures/openai",
  "fixtures/senso",
  "fixtures/prava",
  "fixtures/linq"
] as const;

const linqWebhookFixtureSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    conversation: z.object({ id: z.string().min(1) }).strict(),
    message: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        text: z.string()
      })
      .strict()
  })
  .strict();

type FixtureSchemaSpec = {
  schema: ZodType;
  recordCount: (value: unknown) => number;
};

export type FixtureValidationResult = {
  issues: string[];
  report: string[];
  filesValidated: number;
};

const arraySpec = (schema: ZodType): FixtureSchemaSpec => ({
  schema: z.array(schema),
  recordCount: (value) => (Array.isArray(value) ? value.length : 0)
});

const objectSpec = (schema: ZodType): FixtureSchemaSpec => ({
  schema,
  recordCount: () => 1
});

const exactFixtureSchemas = new Map<string, FixtureSchemaSpec>([
  ["fixtures/data/spots.json", arraySpec(SpotSchema)],
  ["fixtures/data/providers.json", arraySpec(PromotionProviderSchema)],
  ["fixtures/data/promotion-packages.json", arraySpec(PromotionPackageSchema)],
  ["fixtures/data/campaigns.json", arraySpec(CampaignSchema)],
  ["fixtures/data/campaign-options.json", arraySpec(CampaignOptionSchema)],
  ["fixtures/data/campaign-assets.json", arraySpec(CampaignAssetSchema)],
  ["fixtures/data/transactions.json", arraySpec(TransactionSchema)],
  ["fixtures/data/merchant-orders.json", arraySpec(MerchantOrderSchema)],
  ["fixtures/data/reservations.json", arraySpec(ReservationSchema)],
  ["fixtures/data/audit-events.json", arraySpec(AuditEventSchema)],
  ["fixtures/openai/campaign-intent.json", objectSpec(CampaignIntentSchema)],
  ["fixtures/openai/decision-explanation.json", objectSpec(DecisionExplanationSchema)],
  ["fixtures/openai/campaign-creative.json", objectSpec(CampaignCreativeSchema)],
  ["fixtures/openai/quality-review.json", objectSpec(OpenAIQualityReviewSchema)],
  ["fixtures/prava/session-awaiting-user.json", objectSpec(PravaCreateSessionResultSchema)],
  ["fixtures/prava/report-completed.json", objectSpec(PravaReportCheckoutOutcomeResultSchema)],
  ["fixtures/prava/report-failed.json", objectSpec(PravaReportCheckoutOutcomeResultSchema)],
  ["fixtures/linq/webhook-event.json", objectSpec(linqWebhookFixtureSchema)],
  ["fixtures/linq/send-message-result.json", objectSpec(LinqSendMessageResultSchema)]
]);

export function validateJsonFixtures(rootDirectory = process.cwd()): FixtureValidationResult {
  const issues: string[] = [];
  const directoryCounts = new Map<string, { files: number; records: number }>();
  let filesValidated = 0;

  for (const fixtureDirectory of requiredFixtureDirectories) {
    const absoluteDirectory = resolve(rootDirectory, fixtureDirectory);
    const counts = { files: 0, records: 0 };
    directoryCounts.set(fixtureDirectory, counts);

    if (!existsSync(absoluteDirectory)) {
      issues.push(`${fixtureDirectory}: missing directory`);
      continue;
    }

    const jsonFiles = listJsonFiles(absoluteDirectory);

    for (const absoluteFile of jsonFiles) {
      const fixturePath = normalizePath(relative(rootDirectory, absoluteFile));
      counts.files += 1;
      filesValidated += 1;
      const spec = schemaForFixture(fixturePath);

      if (spec === null) {
        issues.push(`${fixturePath}: no fixture schema is configured`);
        continue;
      }

      let rawValue: unknown;
      try {
        rawValue = JSON.parse(readFileSync(absoluteFile, "utf8").replace(/^\uFEFF/, ""));
      } catch {
        issues.push(`${fixturePath}: malformed JSON`);
        continue;
      }

      findDuplicateIds(rawValue, fixturePath, issues);
      const parsed = spec.schema.safeParse(rawValue);

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const issuePath = issue.path.length === 0 ? "fixture" : issue.path.join(".");
          issues.push(`${fixturePath}: ${issuePath} ${issue.message}`);
        }
        continue;
      }

      counts.records += spec.recordCount(parsed.data);
    }
  }

  const report = requiredFixtureDirectories.map((directory) => {
    const counts = directoryCounts.get(directory) ?? { files: 0, records: 0 };
    return `- ${directory}: ${counts.files} file${counts.files === 1 ? "" : "s"}, ${counts.records} record${counts.records === 1 ? "" : "s"}`;
  });

  return { issues, report, filesValidated };
}

function schemaForFixture(fixturePath: string): FixtureSchemaSpec | null {
  const exact = exactFixtureSchemas.get(fixturePath);
  if (exact !== undefined) return exact;
  if (/^fixtures\/senso\/[^/]+\.json$/.test(fixturePath)) {
    return objectSpec(SensoProviderVerificationSchema);
  }
  if (/^fixtures\/prava\/result-[^/]+\.json$/.test(fixturePath)) {
    return objectSpec(PravaPaymentResultSchema);
  }
  return null;
}

function listJsonFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(absolutePath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function findDuplicateIds(value: unknown, fixturePath: string, issues: string[], path = "fixture"): void {
  if (Array.isArray(value)) {
    const seenIds = new Set<string>();

    value.forEach((item, index) => {
      if (isRecord(item) && typeof item.id === "string" && item.id.trim() !== "") {
        if (seenIds.has(item.id)) {
          issues.push(`${fixturePath}: ${path} duplicate id ${item.id}`);
        }
        seenIds.add(item.id);
      }
      findDuplicateIds(item, fixturePath, issues, `${path}.${index}`);
    });
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      findDuplicateIds(child, fixturePath, issues, `${path}.${key}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function runCli(): void {
  const result = validateJsonFixtures();

  if (result.issues.length > 0) {
    console.error("JSON fixture validation failed:");
    result.issues.forEach((issue) => console.error(`- ${issue}`));
    process.exitCode = 1;
    return;
  }

  console.log(`JSON fixtures are valid (${result.filesValidated} files).`);
  result.report.forEach((line) => console.log(line));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli();
}