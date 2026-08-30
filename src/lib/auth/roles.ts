export const reverbRoles = ["OWNER", "MANAGER"] as const;

export type ReverbRole = (typeof reverbRoles)[number];

export type ReverbPermission =
  | "dashboard:read"
  | "campaign:create"
  | "campaign:review"
  | "campaign:approve"
  | "reservations:read"
  | "analytics:read"
  | "venue:manage";

const rolePermissions: Record<ReverbRole, ReadonlySet<ReverbPermission>> = {
  OWNER: new Set([
    "dashboard:read",
    "campaign:create",
    "campaign:review",
    "campaign:approve",
    "reservations:read",
    "analytics:read",
    "venue:manage"
  ]),
  MANAGER: new Set([
    "dashboard:read",
    "campaign:create",
    "campaign:review",
    "reservations:read",
    "analytics:read"
  ])
};

export function resolveReverbRole(metadata: unknown): ReverbRole | null {
  if (!isRecord(metadata) || metadata.role === undefined || metadata.role === null) return "OWNER";
  return metadata.role === "OWNER" || metadata.role === "MANAGER" ? metadata.role : null;
}

export function hasReverbPermission(role: ReverbRole, permission: ReverbPermission) {
  return rolePermissions[role].has(permission);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
