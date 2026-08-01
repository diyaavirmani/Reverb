const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEY_PARTS = [
  "card",
  "cvv",
  "token",
  "secret",
  "authorization",
  "credential",
  "expiry",
  "pan",
  "password"
] as const;

export type RedactedValue =
  | string
  | number
  | boolean
  | null
  | RedactedValue[]
  | { [key: string]: RedactedValue };

export type HeaderValue = string | string[] | undefined;

export function redactSensitiveObject(value: unknown): RedactedValue {
  if (value === null || typeof value !== "object") {
    return value as RedactedValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveObject(item));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      isSensitiveKey(key) ? REDACTED_VALUE : redactSensitiveObject(entryValue)
    ])
  );
}

export function redactSensitiveHeaders(
  headers: Headers | Record<string, HeaderValue>
): Record<string, string | string[]> {
  if (headers instanceof Headers) {
    return Object.fromEntries(
      Array.from(headers.entries()).map(([key, value]) => [
        key,
        isSensitiveKey(key) ? REDACTED_VALUE : value
      ])
    );
  }

  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (value === undefined) {
        return [];
      }

      return [[key, isSensitiveKey(key) ? REDACTED_VALUE : value]];
    })
  );
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((sensitiveKeyPart) =>
    normalizedKey.includes(sensitiveKeyPart)
  );
}
