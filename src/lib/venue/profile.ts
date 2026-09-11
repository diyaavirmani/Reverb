import { z } from "zod";

export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
] as const;

export const businessTypes = [
  "Cafe",
  "Restaurant",
  "Bar",
  "Bakery",
  "Cloud Kitchen",
  "Bistro",
  "Other"
] as const;

export const approvalModes = [
  "DRAFT_ONLY",
  "ALWAYS_APPROVE",
  "APPROVED_RECURRING_RULES"
] as const;

export const channelNames = [
  "Instagram",
  "Facebook",
  "Google Business",
  "WhatsApp",
  "Email",
  "Other"
] as const;

export const brandTones = [
  "Casual",
  "Premium",
  "Playful",
  "Gen Z",
  "Family-friendly",
  "Minimal"
] as const;

const dateTimeString = z.string().datetime({ offset: true }).or(z.string().datetime());
const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]).optional();
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const quietSlotSchema = z.object({
  day: z.enum(weekdays),
  startTime: z.string().regex(timePattern),
  endTime: z.string().regex(timePattern),
  estimatedUnusedSeats: z.number().int().min(1).max(10000)
}).refine((slot) => slot.startTime < slot.endTime, {
  message: "Quiet-slot end time must be after its start time.",
  path: ["endTime"]
});

export const venueAnalysisSchema = z.object({
  lastAnalyzedAt: dateTimeString.optional(),
  sourceUrls: z.array(z.string().url().max(500)).max(8).default([]),
  sourceStatuses: z.array(z.object({
    url: z.string().url().max(500),
    status: z.enum(["analyzed", "reference_only", "unavailable"]),
    detail: z.string().max(240)
  })).max(8).default([]),
  facts: z.array(z.string().min(1).max(500)).max(24).default([]),
  inferences: z.array(z.string().min(1).max(500)).max(16).default([]),
  pageTitle: z.string().max(240).optional(),
  metaDescription: z.string().max(500).optional(),
  openGraphImage: z.string().url().max(500).optional()
});

export const reverbVenueProfileSchema = z.object({
  version: z.literal(1).default(1),
  onboardingComplete: z.boolean().default(false),
  briefApproved: z.boolean().default(false),
  venue: z.object({
    name: z.string().trim().min(2).max(120),
    businessType: z.enum(businessTypes),
    city: z.string().trim().min(2).max(100),
    address: z.string().trim().min(2).max(240),
    timezone: z.string().trim().min(1).max(80).default("Asia/Kolkata"),
    capacity: z.number().int().min(1).max(10000),
    phone: z.string().trim().max(40).optional(),
    websiteUrl: optionalUrl,
    googleBusinessUrl: optionalUrl,
    bookingUrl: optionalUrl,
    instagramUrl: optionalUrl,
    facebookUrl: optionalUrl,
    otherUrl: optionalUrl
  }),
  operations: z.object({
    openingDays: z.array(z.enum(weekdays)).min(1).max(7),
    openingHours: z.object({
      startTime: z.string().regex(timePattern),
      endTime: z.string().regex(timePattern)
    }).refine((hours) => hours.startTime < hours.endTime, {
      message: "Closing time must be after opening time.",
      path: ["endTime"]
    }),
    quietSlots: z.array(quietSlotSchema).min(1).max(14)
  }),
  campaignDefaults: z.object({
    maxBudgetPaise: z.number().int().min(100).max(100_000_000),
    maxDiscountPct: z.number().min(0).max(100),
    maxCpaPaise: z.number().int().min(100).max(10_000_000),
    approvalMode: z.enum(approvalModes).default("ALWAYS_APPROVE"),
    preferredChannels: z.array(z.enum(channelNames)).max(channelNames.length).default([])
  }),
  brand: z.object({
    summary: z.string().max(1000).default(""),
    cuisineOrOffering: z.string().max(500).default(""),
    audience: z.string().max(500).default(""),
    vibe: z.string().max(300).default(""),
    pricePosition: z.string().max(160).default(""),
    keywords: z.array(z.string().min(1).max(80)).max(16).default([]),
    tone: z.enum(brandTones).default("Casual")
  }),
  analysis: venueAnalysisSchema.default({
    sourceUrls: [],
    sourceStatuses: [],
    facts: [],
    inferences: []
  })
});

export type ReverbVenueProfile = z.infer<typeof reverbVenueProfileSchema>;
export type ReverbWeekday = (typeof weekdays)[number];
export type ReverbChannel = (typeof channelNames)[number];

export const emptyReverbProfile: ReverbVenueProfile = {
  version: 1,
  onboardingComplete: false,
  briefApproved: false,
  venue: {
    name: "",
    businessType: "Cafe",
    city: "",
    address: "",
    timezone: "Asia/Kolkata",
    capacity: 40,
    phone: "",
    websiteUrl: "",
    googleBusinessUrl: "",
    bookingUrl: "",
    instagramUrl: "",
    facebookUrl: "",
    otherUrl: ""
  },
  operations: {
    openingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    openingHours: { startTime: "09:00", endTime: "22:00" },
    quietSlots: [{ day: "Friday", startTime: "19:00", endTime: "21:00", estimatedUnusedSeats: 12 }]
  },
  campaignDefaults: {
    maxBudgetPaise: 500000,
    maxDiscountPct: 15,
    maxCpaPaise: 85000,
    approvalMode: "ALWAYS_APPROVE",
    preferredChannels: ["Instagram"]
  },
  brand: {
    summary: "",
    cuisineOrOffering: "",
    audience: "",
    vibe: "",
    pricePosition: "",
    keywords: [],
    tone: "Casual"
  },
  analysis: {
    sourceUrls: [],
    sourceStatuses: [],
    facts: [],
    inferences: []
  }
};

export function parseReverbProfile(value: unknown): ReverbVenueProfile | null {
  const parsed = reverbVenueProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isApprovedReverbProfile(profile: ReverbVenueProfile | null): profile is ReverbVenueProfile {
  return profile?.onboardingComplete === true && profile.briefApproved === true;
}

export function weekdayToIndex(day: ReverbWeekday): number {
  return (weekdays.indexOf(day) + 1) % 7;
}

export function approvalModeLabel(mode: ReverbVenueProfile["campaignDefaults"]["approvalMode"]): string {
  if (mode === "DRAFT_ONLY") return "Draft campaigns only";
  if (mode === "APPROVED_RECURRING_RULES") return "Allow approved recurring campaign rules";
  return "Prepare campaigns, always ask before launch";
}
