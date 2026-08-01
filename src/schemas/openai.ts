import { z } from "zod";

import { PaiseSchema, UtcDateTimeStringSchema } from "./domain";

const nonEmptyStringSchema = z.string().min(1);
const percentageSchema = z.number().int().min(0).max(100);
const scoreSchema = z.number().int().min(0).max(100);

export const CampaignIntentSchema = z
  .object({
    unusedCapacity: z.number().int().nonnegative(),
    targetReservations: z.number().int().positive(),
    maximumBudgetPaise: PaiseSchema,
    maximumDiscountPercent: percentageSchema,
    maximumExpectedCpaPaise: PaiseSchema,
    startTime: UtcDateTimeStringSchema,
    endTime: UtcDateTimeStringSchema,
    missingFields: z.array(nonEmptyStringSchema)
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.endTime) <= Date.parse(value.startTime)) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "endTime must be after startTime"
      });
    }
  });

export type CampaignIntent = z.infer<typeof CampaignIntentSchema>;

export const DecisionRejectedAlternativeSchema = z
  .object({
    packageId: nonEmptyStringSchema,
    providerId: nonEmptyStringSchema.optional(),
    reasons: z.array(nonEmptyStringSchema).min(1)
  })
  .strict();

export type DecisionRejectedAlternative = z.infer<typeof DecisionRejectedAlternativeSchema>;

export const DecisionExplanationSchema = z
  .object({
    summary: nonEmptyStringSchema,
    selectedReasons: z.array(nonEmptyStringSchema).min(1),
    rejectedAlternatives: z.array(DecisionRejectedAlternativeSchema),
    riskDisclosure: nonEmptyStringSchema
  })
  .strict();

export type DecisionExplanation = z.infer<typeof DecisionExplanationSchema>;

export const CampaignCreativeSchema = z
  .object({
    headline: nonEmptyStringSchema,
    caption: nonEmptyStringSchema,
    offerText: nonEmptyStringSchema,
    callToAction: nonEmptyStringSchema,
    providerBrief: nonEmptyStringSchema,
    imagePrompt: nonEmptyStringSchema
  })
  .strict();

export type CampaignCreative = z.infer<typeof CampaignCreativeSchema>;

export const OpenAIQualityReviewSchema = z
  .object({
    approved: z.boolean(),
    brandToneScore: scoreSchema,
    clarityScore: scoreSchema,
    unsupportedClaims: z.array(nonEmptyStringSchema),
    issues: z.array(nonEmptyStringSchema),
    revisionInstructions: z.array(nonEmptyStringSchema)
  })
  .strict();

export type OpenAIQualityReview = z.infer<typeof OpenAIQualityReviewSchema>;
