import { redactSensitiveObject, type RedactedValue } from "../security/redaction";
import type { IntegrationName } from "./types";

export type IntegrationErrorParams = {
  integration: IntegrationName | "runtimeConfig";
  operation: string;
  safeMessage: string;
  statusCode?: number;
  retryable?: boolean;
  cause?: unknown;
};

export class IntegrationError extends Error {
  readonly integration: IntegrationErrorParams["integration"];
  readonly operation: string;
  readonly safeMessage: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  override readonly cause?: RedactedValue;

  constructor({
    integration,
    operation,
    safeMessage,
    statusCode,
    retryable = false,
    cause
  }: IntegrationErrorParams) {
    super(safeMessage);
    this.name = "IntegrationError";
    this.integration = integration;
    this.operation = operation;
    this.safeMessage = safeMessage;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.cause = sanitizeCause(cause);
  }
}

function sanitizeCause(cause: unknown): RedactedValue | undefined {
  if (cause === undefined) {
    return undefined;
  }

  if (cause instanceof Error) {
    return {
      name: cause.name
    };
  }

  return redactSensitiveObject(cause);
}
