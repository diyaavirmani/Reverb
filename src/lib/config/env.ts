import { z } from "zod";

const requiredProductionKeys = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "USE_FIXTURES",
  "APP_ENV",
  "APP_URL"
] as const;

const envSchema = z
  .object({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    USE_FIXTURES: z.enum(["true", "false"]).optional(),
    APP_ENV: z.string().optional(),
    APP_URL: z.string().url().optional(),
    NODE_ENV: z.string().optional(),
    REVERB_AUTH_TEST_BYPASS: z.string().optional(),
    VITEST: z.string().optional()
  })
  .passthrough();

export type ReverbEnvironment = z.infer<typeof envSchema>;

export class EnvironmentValidationError extends Error {
  constructor(readonly missingKeys: string[]) {
    super(`Missing required production environment variables: ${missingKeys.join(", ")}`);
    this.name = "EnvironmentValidationError";
  }
}

export function validateReverbEnvironment(env: NodeJS.ProcessEnv = process.env): ReverbEnvironment {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    throw new EnvironmentValidationError(parsed.error.issues.map((issue) => issue.path.join(".")));
  }

  if (parsed.data.NODE_ENV === "production") {
    const missingKeys = requiredProductionKeys.filter((key) => isBlank(parsed.data[key]));

    if (missingKeys.length > 0) {
      throw new EnvironmentValidationError([...missingKeys]);
    }

    if (parsed.data.REVERB_AUTH_TEST_BYPASS === "true" || parsed.data.VITEST === "true") {
      throw new EnvironmentValidationError(["REVERB_AUTH_TEST_BYPASS/VITEST must not be set in production"]);
    }
  }

  return parsed.data;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}
