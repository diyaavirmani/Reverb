import { redactText } from "./redaction-checks";

export function logSafe(message: string): void {
  console.log(redactText(message));
}

export function logSuiteSummary(name: string, status: string, detail: string): void {
  logSafe(`${name}: ${status} - ${detail}`);
}
