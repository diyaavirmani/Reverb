import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { IntegrationAdapters } from "../src/lib/adapters";
import {
  FixtureLinqAdapter,
  FixtureN8nStorageAdapter,
  FixtureOpenAIAdapter,
  FixturePravaAdapter,
  FixtureSensoAdapter
} from "../src/lib/adapters/fixtures";
import { CampaignService } from "../src/lib/core/campaign-service";
import { ReachExchangeService } from "../src/lib/core/reach-exchange";
import { LocalFixtureRepository } from "../src/lib/repositories";
import { buildTableauDataset } from "./build-tableau-dataset";

const requiredEnvironmentVariables = [
  "USE_FIXTURES",
  "APP_URL",
  "APP_ENV",
  "APP_SECRET",
  "N8N_INTERNAL_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_IMAGE_MODEL",
  "SENSO_API_KEY",
  "SENSO_API_BASE",
  "SENSO_PROVIDER_FOLDER_ID",
  "LINQ_API_KEY",
  "LINQ_API_BASE",
  "LINQ_FROM_NUMBER",
  "LINQ_WEBHOOK_URL",
  "LINQ_WEBHOOK_SECRET",
  "NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY",
  "PRAVA_SECRET_KEY",
  "PRAVA_API_BASE",
  "PRAVA_INTEGRATION_TYPE",
  "PRAVA_CURRENCY",
  "N8N_BASE_URL",
  "N8N_INTAKE_WEBHOOK_URL",
  "N8N_STORAGE_WEBHOOK_URL",
  "N8N_CAMPAIGN_WEBHOOK_URL",
  "N8N_REPORT_WEBHOOK_URL",
  "DEMO_SPOT_ID",
  "DEMO_OWNER_EMAIL",
  "DEMO_TIMEZONE"
] as const;

const requiredWorkflows = [
  "01-check-processed-event.json",
  "02-create-audit-event.json",
  "03-conversation-state.json",
  "04-payment-lock.json",
  "05-storage-gateway.json",
  "10-campaign-intake.json",
  "11-provider-discovery.json",
  "12-creative-quality.json",
  "13-prava-transaction.json",
  "14-promotion-activation.json",
  "15-reservation-performance.json",
  "16-campaign-reporting.json"
] as const;

runNpm("validate:fixtures");
runNpm("validate:n8n");
await verifyEnvironmentDocumentation();
await verifyWorkflowsExist();
await verifyDeterministicDemo();
await verifyTrackedFilesContainNoSecrets();
const tableau = await buildTableauDataset();
runNpm("test");

console.log(
  `Demo readiness verified: fixtures, environment contract, ${requiredWorkflows.length} workflows, deterministic package outcomes, price-change control, tracked-file secret scan, tests, and Tableau generation (${tableau.providerRows} provider rows).`
);

async function verifyEnvironmentDocumentation(): Promise<void> {
  const envExample = await readFile(path.resolve(".env.example"), "utf8");
  const documented = new Set(
    [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1])
  );
  const missing = requiredEnvironmentVariables.filter((name) => !documented.has(name));
  if (missing.length > 0) {
    throw new Error(`.env.example is missing required variables: ${missing.join(", ")}`);
  }
}

async function verifyWorkflowsExist(): Promise<void> {
  await Promise.all(
    requiredWorkflows.map((fileName) => readFile(path.join("n8n", "workflows", fileName), "utf8"))
  );
}

async function verifyDeterministicDemo(): Promise<void> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "reverb-demo-readiness-"));
  const dataDirectory = path.join(temporaryRoot, "data");
  try {
    await cp(path.resolve("fixtures/data"), dataDirectory, { recursive: true });
    const repository = new LocalFixtureRepository(dataDirectory);
    const adapters: IntegrationAdapters = {
      openai: new FixtureOpenAIAdapter(),
      senso: new FixtureSensoAdapter(),
      linq: new FixtureLinqAdapter(),
      prava: new FixturePravaAdapter(),
      n8nStorage: new FixtureN8nStorageAdapter()
    };
    const service = new CampaignService(repository, adapters, () => new Date("2026-08-01T00:00:00.000Z"));
    const campaign = await service.createCampaignFromIntent({
      spotId: "spot_quiet_cup_cafe",
      requestedByOwnerId: "owner_demo_readiness",
      ownerMessage:
        "Fill Friday 7-9 PM with 12 unused seats, target 6 reservations, maximum budget Rs 5,000, maximum discount 15%, and maximum CPA Rs 850."
    });
    const discovery = await service.discoverOptions(campaign.id);
    const eligible = discovery.options.filter((option) => option.passesDeterministicChecks);
    if (eligible.length !== 1 || eligible[0]?.packageId !== "package_local_dining_boost") {
      throw new Error("The expected Local Dining Boost package is not the sole eligible winner.");
    }
    const evidenceRejected = discovery.options.find(
      (option) => option.packageId === "package_neighborhood_food_blast"
    );
    if (
      !evidenceRejected ||
      !evidenceRejected.rejectionReasons.includes(
        "Provider evidence confidence is below the configured threshold."
      ) ||
      !evidenceRejected.rejectionReasons.includes(
        "Provider audience geography does not match the Spot."
      )
    ) {
      throw new Error("The weak-evidence package did not fail for the expected reasons.");
    }
    const commercialRejected = discovery.options.find(
      (option) => option.packageId === "package_premium_weekend_push"
    );
    if (
      !commercialRejected ||
      !commercialRejected.rejectionReasons.includes(
        "Promotion package price exceeds the campaign budget."
      ) ||
      !commercialRejected.rejectionReasons.includes(
        "Worst-case expected CPA exceeds the campaign limit."
      )
    ) {
      throw new Error("The premium package did not fail budget and CPA controls.");
    }

    const quote = await new ReachExchangeService(repository, () => new Date("2026-08-01T00:00:00.000Z"))
      .getQuote("package_neighborhood_food_blast");
    if (quote.livePricePaise !== 550000 || quote.priceChangedFromPaise !== 300000) {
      throw new Error("The controlled 300000-to-550000 paise price-change scenario is missing.");
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function verifyTrackedFilesContainNoSecrets(): Promise<void> {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" }
  );
  const files = output.split("\0").filter(Boolean);
  const secretPatterns = [
    /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/,
    /\bpk_live_[A-Za-z0-9_-]{16,}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /^(?:OPENAI_API_KEY|SENSO_API_KEY|LINQ_API_KEY|PRAVA_SECRET_KEY|APP_SECRET|N8N_INTERNAL_SECRET)[ \t]*=[ \t]*[^\s#]+/m
  ];
  const findings: string[] = [];

  for (const fileName of files) {
    let contents: string;
    try {
      contents = await readFile(fileName, "utf8");
    } catch {
      continue;
    }
    if (contents.includes("\0")) continue;
    if (secretPatterns.some((pattern) => pattern.test(contents))) findings.push(fileName);
  }

  if (findings.length > 0) {
    throw new Error(`Potential secret values found in tracked files: ${findings.join(", ")}`);
  }
}

function runNpm(script: string): void {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `npm run ${script}`]
    : ["run", script];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm run ${script} failed with exit code ${result.status}.`);
}
