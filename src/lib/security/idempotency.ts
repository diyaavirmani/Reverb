import { hashPayload } from "./signatures";

export type PaymentAttemptStatus = "ACQUIRED" | "ATTEMPTED" | "COMPLETED" | "FAILED";

export type PaymentAttemptState = {
  campaignId: string;
  sessionId: string;
  status: PaymentAttemptStatus;
  acquiredAt: string;
  attemptedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
};

export interface PaymentAttemptGuard {
  acquire(campaignId: string, sessionId: string): Promise<PaymentAttemptState>;
  markAttempted(campaignId: string, sessionId: string): Promise<PaymentAttemptState>;
  markCompleted(campaignId: string, sessionId: string): Promise<PaymentAttemptState>;
  markFailed(
    campaignId: string,
    sessionId: string,
    reason?: string
  ): Promise<PaymentAttemptState>;
  getState(campaignId: string): Promise<PaymentAttemptState | null>;
}

export function generateIdempotencyKey(
  scope: string,
  entityId: string,
  operation: string
): string {
  const digest = hashPayload({
    entityId,
    operation,
    scope
  });

  return `idem_${digest.slice(0, 48)}`;
}

export class InMemoryPaymentAttemptGuard implements PaymentAttemptGuard {
  private readonly states = new Map<string, PaymentAttemptState>();

  async acquire(campaignId: string, sessionId: string): Promise<PaymentAttemptState> {
    const existingState = this.states.get(campaignId);

    if (!existingState) {
      const state: PaymentAttemptState = {
        campaignId,
        sessionId,
        status: "ACQUIRED",
        acquiredAt: now(),
        attemptedAt: null,
        completedAt: null,
        failedAt: null,
        failureReason: null
      };

      this.states.set(campaignId, state);
      return { ...state };
    }

    if (existingState.status === "ACQUIRED") {
      throw new Error(`Payment attempt already acquired for campaign: ${campaignId}`);
    }

    throw new Error(`Checkout attempt already recorded for campaign: ${campaignId}`);
  }

  async markAttempted(campaignId: string, sessionId: string): Promise<PaymentAttemptState> {
    const existingState = this.requireState(campaignId, sessionId);

    if (existingState.status !== "ACQUIRED") {
      throw new Error(`Checkout attempt already recorded for campaign: ${campaignId}`);
    }

    return this.updateState(campaignId, {
      ...existingState,
      status: "ATTEMPTED",
      attemptedAt: now()
    });
  }

  async markCompleted(campaignId: string, sessionId: string): Promise<PaymentAttemptState> {
    const existingState = this.requireState(campaignId, sessionId);

    if (existingState.status === "COMPLETED") {
      return { ...existingState };
    }

    if (existingState.status !== "ATTEMPTED") {
      throw new Error(`Checkout attempt must be marked attempted before completion: ${campaignId}`);
    }

    return this.updateState(campaignId, {
      ...existingState,
      status: "COMPLETED",
      completedAt: now()
    });
  }

  async markFailed(
    campaignId: string,
    sessionId: string,
    reason = "unknown"
  ): Promise<PaymentAttemptState> {
    const existingState = this.requireState(campaignId, sessionId);

    if (existingState.status === "FAILED") {
      return { ...existingState };
    }

    if (existingState.status !== "ATTEMPTED") {
      throw new Error(`Checkout attempt must be marked attempted before failure: ${campaignId}`);
    }

    return this.updateState(campaignId, {
      ...existingState,
      status: "FAILED",
      failedAt: now(),
      failureReason: reason
    });
  }

  async getState(campaignId: string): Promise<PaymentAttemptState | null> {
    const state = this.states.get(campaignId);
    return state ? { ...state } : null;
  }

  private requireState(campaignId: string, sessionId: string): PaymentAttemptState {
    const existingState = this.states.get(campaignId);

    if (!existingState) {
      throw new Error(`Payment attempt not acquired for campaign: ${campaignId}`);
    }

    if (existingState.sessionId !== sessionId) {
      throw new Error(`Payment attempt session mismatch for campaign: ${campaignId}`);
    }

    return existingState;
  }

  private updateState(campaignId: string, state: PaymentAttemptState): PaymentAttemptState {
    this.states.set(campaignId, state);
    return { ...state };
  }
}

function now(): string {
  return new Date().toISOString();
}
