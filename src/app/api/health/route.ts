import { NextResponse } from "next/server";
import { access } from "node:fs/promises";
import { join } from "node:path";

import { getSharedFixtureDataDir } from "../../../lib/repositories/shared-fixture-store";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    fixtureMode: process.env.USE_FIXTURES !== "false",
    clerkKeysPresent: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    fixtureStoreReadable: await isFixtureStoreReadable()
  };
  const healthy = checks.fixtureMode && checks.clerkKeysPresent && checks.fixtureStoreReadable;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "error",
      checks
    },
    { status: healthy ? 200 : 503 }
  );
}

async function isFixtureStoreReadable(): Promise<boolean> {
  try {
    const dataDir = await getSharedFixtureDataDir();
    await access(join(dataDir, "campaigns.json"));
    return true;
  } catch {
    return false;
  }
}
