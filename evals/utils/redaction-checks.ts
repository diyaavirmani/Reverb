import { readFile } from "node:fs/promises";

const forbiddenReportPatterns = [
  /Authorization:\s*Bearer/i,
  /paymentAuthorisationReference/i,
  /card/i,
  /cvv/i,
  /OPENAI_API_KEY\s*=\s*\S+/i,
  /PRAVA_SECRET_KEY\s*=\s*\S+/i,
  /SENSO_API_KEY\s*=\s*\S+/i,
  /LINQ_API_KEY\s*=\s*\S+/i,
  /LINQ_WEBHOOK_SECRET\s*=\s*\S+/i,
  /N8N_INTERNAL_SECRET\s*=\s*\S+/i
];

const secretLikeValuePatterns = [
  /sk_(?:test|live)_[A-Za-z0-9_-]+/g,
  /pk_(?:test|live)_[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi
];

export function redactText(value: string): string {
  return secretLikeValuePatterns.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value
  );
}

export function containsForbiddenReportContent(value: string): boolean {
  return forbiddenReportPatterns.some((pattern) => pattern.test(value));
}

export async function fileContainsForbiddenContent(path: string): Promise<boolean> {
  const raw = await readFile(path, "utf8");
  return containsForbiddenReportContent(raw);
}
