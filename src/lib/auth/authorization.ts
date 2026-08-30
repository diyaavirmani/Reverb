import "server-only";

import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { hasReverbPermission, resolveReverbRole, type ReverbPermission } from "./roles";

export async function requireReverbPermission(permission: ReverbPermission) {
  const session = await auth.protect();
  const role = resolveReverbRole(session.sessionClaims?.metadata);

  if (!role || !hasReverbPermission(role, permission)) notFound();

  return { userId: session.userId, role };
}
