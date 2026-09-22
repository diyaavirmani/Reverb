import "server-only";

import { clerkClient, currentUser } from "@clerk/nextjs/server";

import { parseReverbProfile, type ReverbVenueProfile } from "./profile";

const profileMetadataKey = "reverbProfile";
export const clerkMetadataMaxBytes = 8 * 1024;
export const clerkMetadataSafeBytes = 7 * 1024;
const encoder = new TextEncoder();

export class ClerkMetadataSizeError extends Error {
  constructor(readonly sizeBytes: number) {
    super("Venue profile metadata is too large to store safely.");
    this.name = "ClerkMetadataSizeError";
  }
}

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
  const profileForMetadata = prepareProfileForClerkMetadata(profile);
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...user.privateMetadata,
      [profileMetadataKey]: profileForMetadata
    }
  });
  return profileForMetadata;
}

export function prepareProfileForClerkMetadata(profile: ReverbVenueProfile): ReverbVenueProfile {
  if (jsonByteSize(profile) <= clerkMetadataSafeBytes) return profile;

  const trimmedProfile: ReverbVenueProfile = {
    ...profile,
    analysis: {
      ...profile.analysis,
      sourceStatuses: [],
      facts: [],
      inferences: []
    }
  };
  const trimmedSize = jsonByteSize(trimmedProfile);

  if (trimmedSize > clerkMetadataSafeBytes) {
    throw new ClerkMetadataSizeError(trimmedSize);
  }

  return trimmedProfile;
}

export function jsonByteSize(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
