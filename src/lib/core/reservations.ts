import { randomUUID } from "node:crypto";

import type { StorageRepository } from "../repositories";
import {
  AuditEventSchema,
  CampaignPerformanceReportSchema,
  ReservationSchema,
  ReservationSubmissionResultSchema,
  ReservationSubmissionSchema,
  type Campaign,
  type CampaignPerformanceReport,
  type Reservation,
  type ReservationSubmission,
  type ReservationSubmissionResult
} from "../../schemas";

const demoReservationLabel = "TEST RESERVATION - NOT A REAL CUSTOMER";

export type ReservationClock = () => Date;

export class ReservationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

export class ReservationService {
  constructor(
    private readonly repository: StorageRepository,
    private readonly clock: ReservationClock = () => new Date()
  ) {}

  async createReservation(input: ReservationSubmission): Promise<ReservationSubmissionResult> {
    const request = ReservationSubmissionSchema.parse(input);
    const campaign = await this.requireCampaign(request.campaignId);

    if (campaign.status !== "ACTIVE") {
      throw new ReservationError(
        "CAMPAIGN_NOT_ACTIVE",
        "Reservations can only be tracked for active campaigns.",
        409
      );
    }

    this.assertReservationTimeInSlot(request.reservationTime, campaign);

    const existingReservations = await this.repository.listReservations(campaign.id);
    const duplicateSubmission = existingReservations.some(
      (reservation) => reservation.source === request.trackingCode
    );

    if (duplicateSubmission) {
      throw new ReservationError(
        "DUPLICATE_TRACKING_SUBMISSION",
        "This tracking code has already submitted a reservation.",
        409
      );
    }

    const alreadyReservedCapacity = existingReservations
      .filter(
        (reservation) => reservation.status === "BOOKED" || reservation.status === "COMPLETED"
      )
      .reduce((total, reservation) => total + reservation.seatCount, 0);

    if (alreadyReservedCapacity + request.partySize > campaign.unusedCapacity) {
      throw new ReservationError(
        "CAPACITY_EXCEEDED",
        "Reservation would exceed the campaign unused capacity.",
        409
      );
    }

    const reservation = ReservationSchema.parse({
      id: `reservation_${randomUUID()}`,
      campaignId: campaign.id,
      activationId: request.trackingCode,
      spotId: campaign.spotId,
      source: request.trackingCode,
      customerReference: request.isDemoBooking
        ? `${demoReservationLabel}: ${request.customerName} (${request.customerContact})`
        : `${request.customerName} (${request.customerContact})`,
      seatCount: request.partySize,
      reservationAt: request.reservationTime,
      attributedAt: this.nowIso(),
      status: "BOOKED",
      isTest: request.isDemoBooking,
      testLabel: request.isDemoBooking ? demoReservationLabel : null
    });

    const savedReservation = await this.repository.saveReservation(reservation);
    await this.repository.appendAuditEvent(
      AuditEventSchema.parse({
        id: `audit_${randomUUID()}`,
        entityType: "RESERVATION",
        entityId: savedReservation.id,
        eventType: "RESERVATION_TRACKED",
        actorType: "SYSTEM",
        occurredAt: this.nowIso(),
        idempotencyKey: request.trackingCode,
        previousState: null,
        nextState: savedReservation.status,
        metadata: {
          campaignId: campaign.id,
          spotId: campaign.spotId,
          trackingCode: request.trackingCode,
          partySize: request.partySize,
          isDemoBooking: request.isDemoBooking,
          testLabel: savedReservation.testLabel
        }
      })
    );

    return ReservationSubmissionResultSchema.parse({ reservation: savedReservation });
  }

  async getCampaignPerformance(campaignId: string): Promise<CampaignPerformanceReport> {
    const performance = await this.repository.getCampaignPerformance(campaignId);

    if (performance === null) {
      throw new ReservationError(
        "CAMPAIGN_NOT_FOUND",
        "Campaign performance was not found.",
        404
      );
    }

    return CampaignPerformanceReportSchema.parse(performance);
  }

  private async requireCampaign(campaignId: string): Promise<Campaign> {
    const campaign = await this.repository.getCampaign(campaignId);

    if (campaign === null) {
      throw new ReservationError("CAMPAIGN_NOT_FOUND", "Campaign was not found.", 404);
    }

    return campaign;
  }

  private assertReservationTimeInSlot(reservationTime: string, campaign: Campaign): void {
    const reservationMs = Date.parse(reservationTime);
    const startMs = Date.parse(campaign.slotStartAt);
    const endMs = Date.parse(campaign.slotEndAt);

    if (reservationMs < startMs || reservationMs > endMs) {
      throw new ReservationError(
        "RESERVATION_OUTSIDE_SLOT",
        "Reservation time must belong to the campaign slot.",
        409
      );
    }
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }
}