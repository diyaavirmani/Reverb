"use client";

import { UserButton, useUser } from "@clerk/nextjs";

import { resolveReverbRole } from "../lib/auth/roles";

type AuthenticatedAccountProps = {
  placement: "header" | "sidebar";
  venue: string;
};

export function AuthenticatedAccount({ placement, venue }: AuthenticatedAccountProps) {
  const { isLoaded, user } = useUser();
  const displayName = isLoaded && user
    ? user.fullName ?? user.firstName ?? user.primaryEmailAddress?.emailAddress ?? "Reverb account"
    : "Reverb account";
  const role = resolveReverbRole(user?.publicMetadata) ?? "OWNER";

  return (
    <div className={placement === "sidebar" ? "sidebar-account" : "account-menu"} aria-label="Authenticated account">
      <UserButton />
      <span>
        <strong>{displayName}</strong>
        <small>{venue} &middot; {formatRole(role)}</small>
      </span>
    </div>
  );
}

function formatRole(role: "OWNER" | "MANAGER") {
  return role === "OWNER" ? "Owner" : "Manager";
}