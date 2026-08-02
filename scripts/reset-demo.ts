import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const mutableFixtureFiles = [
  "campaigns.json",
  "campaign-options.json",
  "campaign-assets.json",
  "transactions.json",
  "merchant-orders.json",
  "reservations.json",
  "audit-events.json"
] as const;

const dataDirectory = path.resolve("fixtures/data");

for (const fileName of mutableFixtureFiles) {
  const target = path.join(dataDirectory, fileName);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, "[]\n", "utf8");
  await rename(temporary, target);
}

console.log(
  `Demo reset complete: cleared ${mutableFixtureFiles.length} mutable fixture files; preserved Spot, providers, packages, and evidence.`
);
