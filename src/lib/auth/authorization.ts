import "server-only";

import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { hasReverbPermission, resolveReverbRole, type ReverbPermission } from "./roles";
import { getReverbProfile } from "../venue/clerk-profile";
import { isApprovedReverbProfile } from "../venue/profile";

export async function requireReverbPermission(permission: ReverbPermission) {
  const session = await auth.protect();
  const role = resolveReverbRole(session.sessionClaims?.metadata);

  if (!role || !hasReverbPermission(role, permission)) notFound();

  return { userId: session.userId, role };
}

export async function requireApprovedReverbPermission(permission: ReverbPermission) {
  const access = await requireReverbPermission(permission);
  const profile = await getReverbProfile(access.userId);
  if (!isApprovedReverbProfile(profile)) redirect("/onboarding");
  return { ...access, profile };
}
