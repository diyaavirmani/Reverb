import "server-only";

import { clerkClient, currentUser } from "@clerk/nextjs/server";

import { parseReverbProfile, type ReverbVenueProfile } from "./profile";

const profileMetadataKey = "reverbProfile";

export async function getReverbProfile(userId: string): Promise<ReverbVenueProfile | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return parseReverbProfile(user.privateMetadata[profileMetadataKey]);
}

export async function getCurrentReverbContext(userId: string) {
  const [profile, user] = await Promise.all([getReverbProfile(userId), currentUser()]);
  return {
    profile,
    user: user
      ? {
          id: user.id,
          firstName: user.firstName,
          fullName: user.fullName,
          imageUrl: user.imageUrl,
          email: user.primaryEmailAddress?.emailAddress ?? null
        }
      : null
  };
}

export async function saveReverbProfile(userId: string, profile: ReverbVenueProfile) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...user.privateMetadata,
      [profileMetadataKey]: profile
    }
  });
  return profile;
}
