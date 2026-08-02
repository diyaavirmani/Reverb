import { z } from "zod";

import { IntegrationError } from "./errors";

const envSchema = z
  .object({
    USE_FIXTURES: z.enum(["true", "false"]).default("true"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_INTENT_MODEL: z.string().optional(),
    OPENAI_DECISION_MODEL: z.string().optional(),
    OPENAI_CREATIVE_MODEL: z.string().optional(),
    OPENAI_QUALITY_REVIEW_MODEL: z.string().optional(),
    SENSO_API_BASE_URL: z.string().url().optional(),
    SENSO_API_KEY: z.string().optional(),
    SENSO_VERIFY_PROVIDER_URL: z.string().url().optional(),
    LINQ_API_BASE_URL: z.string().url().optional(),
    LINQ_API_KEY: z.string().optional(),
    PRAVA_API_BASE_URL: z.string().url().optional(),
    PRAVA_API_KEY: z.string().optional(),
    PRAVA_CREATE_SESSION_ENDPOINT_TEMPLATE: z.string().optional(),
    PRAVA_RESULT_ENDPOINT_TEMPLATE: z.string().optional(),
    PRAVA_REPORT_CHECKOUT_ENDPOINT_TEMPLATE: z.string().optional(),
    N8N_API_BASE_URL: z.string().url().optional(),
    N8N_API_KEY: z.string().optional()
  })
  .strip();

type ParsedEnv = z.infer<typeof envSchema>;
type RuntimeEnv = Record<string, string | undefined>;

export type FixtureRuntimeConfig = {
  useFixtures: true;
  mode: "fixture";
};

export type LiveRuntimeConfig = {
  useFixtures: false;
  mode: "live";
  integrations: {
    openai: {
      apiKey: string;
      models: {
        intent: string;
        decision: string;
        creative: string;
        qualityReview: string;
      };
    };
    senso: {
      baseUrl: string;
      apiKey: string;
      verifyProviderUrl: string;
    };
    linq: {
      baseUrl: string;
      apiKey?: string;
    };
    prava: {
      baseUrl: string;
      apiKey: string;
      createSessionEndpointTemplate: string;
      resultEndpointTemplate: string;
      reportCheckoutEndpointTemplate: string;
    };
    n8nStorage: {
      baseUrl: string;
      apiKey: string;
    };
  };
};

export type RuntimeConfig = FixtureRuntimeConfig | LiveRuntimeConfig;

const liveRequiredKeys = [
  "OPENAI_API_KEY",
  "OPENAI_INTENT_MODEL",
  "OPENAI_DECISION_MODEL",
  "OPENAI_CREATIVE_MODEL",
  "OPENAI_QUALITY_REVIEW_MODEL",
  "SENSO_API_BASE_URL",
  "SENSO_API_KEY",
  "SENSO_VERIFY_PROVIDER_URL",
  "LINQ_API_BASE_URL",
  "PRAVA_API_BASE_URL",
  "PRAVA_API_KEY",
  "PRAVA_CREATE_SESSION_ENDPOINT_TEMPLATE",
  "PRAVA_RESULT_ENDPOINT_TEMPLATE",
  "PRAVA_REPORT_CHECKOUT_ENDPOINT_TEMPLATE",
  "N8N_API_BASE_URL",
  "N8N_API_KEY"
] as const satisfies readonly (keyof ParsedEnv)[];

export function loadRuntimeConfig(env: RuntimeEnv = process.env): RuntimeConfig {
  const parsedEnv = envSchema.safeParse(env);

  if (!parsedEnv.success) {
    throw new IntegrationError({
      integration: "runtimeConfig",
      operation: "loadRuntimeConfig",
      safeMessage: "Runtime configuration is invalid.",
      retryable: false,
      cause: {
        issues: parsedEnv.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    });
  }

  if (parsedEnv.data.USE_FIXTURES === "true") {
    return {
      useFixtures: true,
      mode: "fixture"
    };
  }

  const missingKeys = liveRequiredKeys.filter((key) => isBlank(parsedEnv.data[key]));

  if (missingKeys.length > 0) {
    throw new IntegrationError({
      integration: "runtimeConfig",
      operation: "loadRuntimeConfig",
      safeMessage: `Live mode missing required configuration: ${missingKeys.join(", ")}`,
      retryable: false,
      cause: {
        missingKeys
      }
    });
  }

  return {
    useFixtures: false,
    mode: "live",
    integrations: {
      openai: {
        apiKey: requireLiveValue(parsedEnv.data, "OPENAI_API_KEY"),
        models: {
          intent: requireLiveValue(parsedEnv.data, "OPENAI_INTENT_MODEL"),
          decision: requireLiveValue(parsedEnv.data, "OPENAI_DECISION_MODEL"),
          creative: requireLiveValue(parsedEnv.data, "OPENAI_CREATIVE_MODEL"),
          qualityReview: requireLiveValue(parsedEnv.data, "OPENAI_QUALITY_REVIEW_MODEL")
        }
      },
      senso: {
        baseUrl: requireLiveValue(parsedEnv.data, "SENSO_API_BASE_URL"),
        apiKey: requireLiveValue(parsedEnv.data, "SENSO_API_KEY"),
        verifyProviderUrl: requireLiveValue(parsedEnv.data, "SENSO_VERIFY_PROVIDER_URL")
      },
      linq: {
        baseUrl: requireLiveValue(parsedEnv.data, "LINQ_API_BASE_URL"),
        apiKey: blankToUndefined(parsedEnv.data.LINQ_API_KEY)
      },
      prava: {
        baseUrl: requireLiveValue(parsedEnv.data, "PRAVA_API_BASE_URL"),
        apiKey: requireLiveValue(parsedEnv.data, "PRAVA_API_KEY"),
        createSessionEndpointTemplate: requireLiveValue(
          parsedEnv.data,
          "PRAVA_CREATE_SESSION_ENDPOINT_TEMPLATE"
        ),
        resultEndpointTemplate: requireLiveValue(parsedEnv.data, "PRAVA_RESULT_ENDPOINT_TEMPLATE"),
        reportCheckoutEndpointTemplate: requireLiveValue(
          parsedEnv.data,
          "PRAVA_REPORT_CHECKOUT_ENDPOINT_TEMPLATE"
        )
      },
      n8nStorage: {
        baseUrl: requireLiveValue(parsedEnv.data, "N8N_API_BASE_URL"),
        apiKey: requireLiveValue(parsedEnv.data, "N8N_API_KEY")
      }
    }
  };
}

function requireLiveValue(env: ParsedEnv, key: (typeof liveRequiredKeys)[number]): string {
  const value = env[key];

  if (isBlank(value)) {
    throw new IntegrationError({
      integration: "runtimeConfig",
      operation: "loadRuntimeConfig",
      safeMessage: `Live mode missing required configuration: ${key}`,
      retryable: false,
      cause: {
        missingKeys: [key]
      }
    });
  }

  return value;
}

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === "";
}

function blankToUndefined(value: string | undefined): string | undefined {
  return isBlank(value) ? undefined : value;
}
