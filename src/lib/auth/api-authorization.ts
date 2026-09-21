import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { hasReverbPermission, resolveReverbRole, type ReverbPermission } from "./roles";

export async function requireReverbApiPermission(permission: ReverbPermission) {
  assertNoProductionAuthBypass();

  if (process.env.NODE_ENV === "test") {
    return null;
  }

  const session = await auth();

  if (!session.userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const role = resolveReverbRole(session.sessionClaims?.metadata);

  if (!role || !hasReverbPermission(role, permission)) {
    return NextResponse.json({ error: "You do not have permission for this action." }, { status: 403 });
  }

  return { userId: session.userId, role };
}

function assertNoProductionAuthBypass(): void {
  if (process.env.NODE_ENV === "production" && process.env.REVERB_AUTH_TEST_BYPASS === "true") {
    throw new Error("REVERB_AUTH_TEST_BYPASS must not be enabled in production.");
  }
}
