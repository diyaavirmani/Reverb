import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateJsonFixtures } from "../scripts/validate-fixtures";

const sourceFixtures = join(process.cwd(), "fixtures");

describe("JSON fixture validation", () => {
  let temporaryRoot: string;
  let fixtureRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "reverb-fixture-validation-"));
    fixtureRoot = join(temporaryRoot, "fixtures");
    await cp(sourceFixtures, fixtureRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("rejects malformed JSON", async () => {
    await writeFile(join(fixtureRoot, "openai", "campaign-intent.json"), "{ malformed", "utf8");

    const result = validateJsonFixtures(temporaryRoot);

    expect(result.issues).toContain(
      "fixtures/openai/campaign-intent.json: malformed JSON"
    );
  });

  it("rejects a schema-invalid fixture", async () => {
    await writeFile(
      join(fixtureRoot, "openai", "campaign-intent.json"),
      JSON.stringify({ unusedCapacity: -1 }),
      "utf8"
    );

    const result = validateJsonFixtures(temporaryRoot);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fixtures/openai/campaign-intent.json"),
        expect.stringContaining("targetReservations")
      ])
    );
  });

  it("rejects duplicate IDs in record arrays", async () => {
    const spotsPath = join(fixtureRoot, "data", "spots.json");
    const spots = JSON.parse(await readFile(spotsPath, "utf8")) as unknown[];
    await writeFile(spotsPath, JSON.stringify([...spots, spots[0]]), "utf8");

    const result = validateJsonFixtures(temporaryRoot);

    expect(result.issues).toContain(
      "fixtures/data/spots.json: fixture duplicate id spot_quiet_cup_cafe"
    );
  });
});
