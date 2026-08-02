import { z } from "zod";

import {
  CampaignStatusSchema,
  PaiseSchema,
  ReservationSchema,
  UtcDateTimeStringSchema
} from "./domain";

const nonEmptyStringSchema = z.string().min(1);
const positiveIntegerSchema = z.number().int().positive();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const ReservationSubmissionSchema = z
  .object({
    campaignId: nonEmptyStringSchema,
    customerName: nonEmptyStringSchema,
    customerContact: nonEmptyStringSchema,
    partySize: positiveIntegerSchema,
    reservationTime: UtcDateTimeStringSchema,
    trackingCode: nonEmptyStringSchema,
    isDemoBooking: z.boolean()
  })
  .strict();

export type ReservationSubmission = z.infer<typeof ReservationSubmissionSchema>;

export const ReservationSubmissionResultSchema = z
  .object({
    reservation: ReservationSchema
  })
  .strict();

export type ReservationSubmissionResult = z.infer<typeof ReservationSubmissionResultSchema>;

export const CampaignPerformanceReportSchema = z
  .object({
    initialUnusedCapacity: positiveIntegerSchema,
    targetReservations: positiveIntegerSchema,
    confirmedReservationCount: nonNegativeIntegerSchema,
    confirmedGuestCount: nonNegativeIntegerSchema,
    capacityRecoveryPercent: z.number().min(0).max(100),
    remainingCapacity: nonNegativeIntegerSchema,
    promotionSpendPaise: PaiseSchema,
    actualCostPerReservationPaise: PaiseSchema.nullable(),
    estimatedRevenueRecoveredPaise: PaiseSchema,
    campaignStatus: CampaignStatusSchema
  })
  .strict();

export type CampaignPerformanceReport = z.infer<typeof CampaignPerformanceReportSchema>;