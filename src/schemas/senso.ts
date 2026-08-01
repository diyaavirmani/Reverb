import { z } from "zod";

import { PaiseSchema, UtcDateTimeStringSchema, VerificationStatusSchema } from "./domain";

const nonEmptyStringSchema = z.string().min(1);
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const confidenceSchema = z.number().min(0).max(1);
const percentSchema = z.number().min(0).max(100);

export const SensoCampaignContextSchema = z
  .object({
    campaignId: nonEmptyStringSchema,
    spotId: nonEmptyStringSchema,
    spotName: nonEmptyStringSchema.optional(),
    category: z.enum(["CAFE", "RESTAURANT", "SALON", "STUDIO", "OTHER"]).optional(),
    city: nonEmptyStringSchema,
    region: z.string().optional(),
    countryCode: z.string().length(2),
    slotStartAt: UtcDateTimeStringSchema,
    slotEndAt: UtcDateTimeStringSchema,
    maximumBudgetPaise: PaiseSchema.optional(),
    maximumExpectedCpaPaise: PaiseSchema.optional()
  })
  .strict()
  .refine((context) => context.slotEndAt > context.slotStartAt, {
    message: "slotEndAt must be after slotStartAt",
    path: ["slotEndAt"]
  });

export type SensoCampaignContext = z.infer<typeof SensoCampaignContextSchema>;

export const SensoSourceReferenceSchema = z
  .object({
    id: nonEmptyStringSchema,
    label: nonEmptyStringSchema,
    url: z.string().url().optional(),
    observedAt: UtcDateTimeStringSchema.optional()
  })
  .strict();

export type SensoSourceReference = z.infer<typeof SensoSourceReferenceSchema>;

export const SensoProviderVerificationSchema = z
  .object({
    verificationStatus: VerificationStatusSchema,
    evidenceConfidence: confidenceSchema,
    localAudiencePercent: percentSchema,
    historicalBookingMin: nonNegativeIntegerSchema,
    historicalBookingMax: nonNegativeIntegerSchema,
    verifiedPricePaise: PaiseSchema.nullable(),
    verifiedDeliverable: nonEmptyStringSchema.nullable(),
    verifiedPublicationDeadline: UtcDateTimeStringSchema.nullable(),
    cancellationPolicy: nonEmptyStringSchema.nullable(),
    sourceReferences: z.array(SensoSourceReferenceSchema),
    warnings: z.array(nonEmptyStringSchema)
  })
  .strict()
  .superRefine((verification, context) => {
    if (verification.historicalBookingMax < verification.historicalBookingMin) {
      context.addIssue({
        code: "custom",
        path: ["historicalBookingMax"],
        message: "historicalBookingMax must be greater than or equal to historicalBookingMin"
      });
    }

    if (verification.sourceReferences.length === 0) {
      if (verification.verificationStatus !== "UNVERIFIED") {
        context.addIssue({
          code: "custom",
          path: ["verificationStatus"],
          message: "verificationStatus must be UNVERIFIED when no evidence is present"
        });
      }

      if (verification.evidenceConfidence !== 0) {
        context.addIssue({
          code: "custom",
          path: ["evidenceConfidence"],
          message: "evidenceConfidence must be 0 when no evidence is present"
        });
      }
    }
  });

export type SensoProviderVerification = z.infer<typeof SensoProviderVerificationSchema>;
