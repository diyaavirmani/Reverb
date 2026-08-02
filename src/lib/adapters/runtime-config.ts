import { z } from "zod";

import { IntegrationError } from "./errors";

const optionalStringSchema = z.string().optional();
const optionalUrlSchema = z.union([z.literal(""), z.string().url()]).optional();
const optionalEmailSchema = z.union([z.literal(""), z.string().email()]).optional();

const envSchema = z
  .object({
    USE_FIXTURES: z.enum(["true", "false"]).default("true"),
    APP_URL: optionalUrlSchema,
    APP_ENV: optionalStringSchema,
    APP_SECRET: optionalStringSchema,
    N8N_INTERNAL_SECRET: optionalStringSchema,
    OPENAI_API_KEY: optionalStringSchema,
    OPENAI_MODEL: optionalStringSchema,
    OPENAI_IMAGE_MODEL: optionalStringSchema,
    SENSO_API_KEY: optionalStringSchema,
    SENSO_API_BASE: optionalUrlSchema,
    SENSO_PROVIDER_FOLDER_ID: optionalStringSchema,
    LINQ_API_KEY: optionalStringSchema,
    LINQ_API_BASE: optionalUrlSchema,
    LINQ_FROM_NUMBER: optionalStringSchema,
    LINQ_WEBHOOK_URL: optionalUrlSchema,
    LINQ_WEBHOOK_SECRET: optionalStringSchema,
    NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY: optionalStringSchema,
    PRAVA_SECRET_KEY: optionalStringSchema,
    PRAVA_API_BASE: optionalUrlSchema,
    PRAVA_INTEGRATION_TYPE: optionalStringSchema,
    PRAVA_CURRENCY: z.union([z.literal(""), z.literal("INR")]).optional(),
    N8N_BASE_URL: optionalUrlSchema,
    N8N_INTAKE_WEBHOOK_URL: optionalUrlSchema,
    N8N_STORAGE_WEBHOOK_URL: optionalUrlSchema,
    N8N_CAMPAIGN_WEBHOOK_URL: optionalUrlSchema,
    N8N_REPORT_WEBHOOK_URL: optionalUrlSchema,
    DEMO_SPOT_ID: optionalStringSchema,
    DEMO_OWNER_EMAIL: optionalEmailSchema,
    DEMO_TIMEZONE: optionalStringSchema
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
  runtime: {
    appUrl: string;
    appEnv: string;
    appSecret: string;
  };
  integrations: {
    openai: {
      apiKey: string;
      imageModel: string;
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
      providerFolderId: string;
      verifyProviderUrl: string;
    };
    linq: {
      baseUrl: string;
      apiKey: string;
      fromNumber: string;
      webhookUrl: string;
      webhookSecret: string;
      sendMessageUrl: string;
    };
    prava: {
      baseUrl: string;
      apiKey: string;
      publishableKey: string;
      integrationType: string;
      currency: "INR";
      createSessionEndpointTemplate: string;
      resultEndpointTemplate: string;
      reportCheckoutEndpointTemplate: string;
    };
    n8nStorage: {
      baseUrl: string;
      apiKey: string;
    };
  };
  n8n: {
    baseUrl: string;
    internalSecret: string;
    intakeWebhookUrl: string;
    storageWebhookUrl: string;
    campaignWebhookUrl: string;
    reportWebhookUrl: string;
  };
  demo: {
    spotId: string;
    ownerEmail: string;
    timezone: string;
  };
};

export type RuntimeConfig = FixtureRuntimeConfig | LiveRuntimeConfig;

const liveRequiredKeys = [
  "APP_URL",
  "APP_ENV",
  "APP_SECRET",
  "N8N_INTERNAL_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_IMAGE_MODEL",
  "SENSO_API_KEY",
  "SENSO_API_BASE",
  "SENSO_PROVIDER_FOLDER_ID",
  "LINQ_API_KEY",
  "LINQ_API_BASE",
  "LINQ_FROM_NUMBER",
  "LINQ_WEBHOOK_URL",
  "LINQ_WEBHOOK_SECRET",
  "NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY",
  "PRAVA_SECRET_KEY",
  "PRAVA_API_BASE",
  "PRAVA_INTEGRATION_TYPE",
  "PRAVA_CURRENCY",
  "N8N_BASE_URL",
  "N8N_INTAKE_WEBHOOK_URL",
  "N8N_STORAGE_WEBHOOK_URL",
  "N8N_CAMPAIGN_WEBHOOK_URL",
  "N8N_REPORT_WEBHOOK_URL",
  "DEMO_SPOT_ID",
  "DEMO_OWNER_EMAIL",
  "DEMO_TIMEZONE"
] as const satisfies readonly (keyof ParsedEnv)[];

export function loadRuntimeConfig(env: RuntimeEnv = process.env): RuntimeConfig {
  const parsedEnv = parseEnvironment(env, "loadRuntimeConfig", "Runtime configuration is invalid.");

  if (parsedEnv.USE_FIXTURES === "true") {
    return {
      useFixtures: true,
      mode: "fixture"
    };
  }

  const missingKeys = liveRequiredKeys.filter((key) => isBlank(parsedEnv[key]));

  if (missingKeys.length > 0) {
    throw new IntegrationError({
      integration: "runtimeConfig",
      operation: "loadRuntimeConfig",
      safeMessage: `Live mode missing required configuration: ${missingKeys.join(", ")}`,
      retryable: false,
      cause: { missingKeys }
    });
  }

  const appUrl = requireLiveValue(parsedEnv, "APP_URL");
  const appEnv = requireLiveValue(parsedEnv, "APP_ENV");
  const appSecret = requireLiveValue(parsedEnv, "APP_SECRET");
  const n8nInternalSecret = requireLiveValue(parsedEnv, "N8N_INTERNAL_SECRET");
  const openaiModel = requireLiveValue(parsedEnv, "OPENAI_MODEL");
  const sensoBaseUrl = requireLiveValue(parsedEnv, "SENSO_API_BASE");
  const linqBaseUrl = requireLiveValue(parsedEnv, "LINQ_API_BASE");
  const pravaBaseUrl = requireLiveValue(parsedEnv, "PRAVA_API_BASE");
  const n8nBaseUrl = requireLiveValue(parsedEnv, "N8N_BASE_URL");
  const pravaCurrency = requireLiveValue(parsedEnv, "PRAVA_CURRENCY");

  if (pravaCurrency !== "INR") {
    throw new IntegrationError({
      integration: "runtimeConfig",
      operation: "loadRuntimeConfig",
      safeMessage: "Runtime configuration is invalid.",
      retryable: false,
      cause: { issues: [{ path: "PRAVA_CURRENCY", message: "PRAVA_CURRENCY must be INR" }] }
    });
  }

  return {
    useFixtures: false,
    mode: "live",
    runtime: { appUrl, appEnv, appSecret },
    integrations: {
      openai: {
        apiKey: requireLiveValue(parsedEnv, "OPENAI_API_KEY"),
        imageModel: requireLiveValue(parsedEnv, "OPENAI_IMAGE_MODEL"),
        models: {
          intent: openaiModel,
          decision: openaiModel,
          creative: openaiModel,
          qualityReview: openaiModel
        }
      },
      senso: {
        baseUrl: sensoBaseUrl,
        apiKey: requireLiveValue(parsedEnv, "SENSO_API_KEY"),
        providerFolderId: requireLiveValue(parsedEnv, "SENSO_PROVIDER_FOLDER_ID"),
        verifyProviderUrl: sensoBaseUrl
      },
      linq: {
        baseUrl: linqBaseUrl,
        apiKey: requireLiveValue(parsedEnv, "LINQ_API_KEY"),
        fromNumber: requireLiveValue(parsedEnv, "LINQ_FROM_NUMBER"),
        webhookUrl: requireLiveValue(parsedEnv, "LINQ_WEBHOOK_URL"),
        webhookSecret: requireLiveValue(parsedEnv, "LINQ_WEBHOOK_SECRET"),
        sendMessageUrl: linqBaseUrl
      },
      prava: {
        baseUrl: pravaBaseUrl,
        apiKey: requireLiveValue(parsedEnv, "PRAVA_SECRET_KEY"),
        publishableKey: requireLiveValue(parsedEnv, "NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY"),
        integrationType: requireLiveValue(parsedEnv, "PRAVA_INTEGRATION_TYPE"),
        currency: pravaCurrency,
        createSessionEndpointTemplate: "",
        resultEndpointTemplate: "",
        reportCheckoutEndpointTemplate: ""
      },
      n8nStorage: {
        baseUrl: n8nBaseUrl,
        apiKey: n8nInternalSecret
      }
    },
    n8n: {
      baseUrl: n8nBaseUrl,
      internalSecret: n8nInternalSecret,
      intakeWebhookUrl: requireLiveValue(parsedEnv, "N8N_INTAKE_WEBHOOK_URL"),
      storageWebhookUrl: requireLiveValue(parsedEnv, "N8N_STORAGE_WEBHOOK_URL"),
      campaignWebhookUrl: requireLiveValue(parsedEnv, "N8N_CAMPAIGN_WEBHOOK_URL"),
      reportWebhookUrl: requireLiveValue(parsedEnv, "N8N_REPORT_WEBHOOK_URL")
    },
    demo: {
      spotId: requireLiveValue(parsedEnv, "DEMO_SPOT_ID"),
      ownerEmail: requireLiveValue(parsedEnv, "DEMO_OWNER_EMAIL"),
      timezone: requireLiveValue(parsedEnv, "DEMO_TIMEZONE")
    }
  };
}

export type LinqWebhookRuntimeConfig = {
  useFixtures: boolean;
  isProduction: boolean;
  nodeEnv: string | undefined;
  webhookSecret: string | undefined;
  n8nIntakeWebhookUrl: string | undefined;
  n8nInternalSecret: string | undefined;
};

export function loadLinqWebhookConfig(
  env: RuntimeEnv = process.env
): LinqWebhookRuntimeConfig {
  const parsedEnv = parseEnvironment(
    env,
    "loadLinqWebhookConfig",
    "Linq webhook configuration is invalid."
  );
  const appEnvironment = blankToUndefined(parsedEnv.APP_ENV) ?? env.NODE_ENV;

  return {
    useFixtures: parsedEnv.USE_FIXTURES === "true",
    isProduction: appEnvironment === "production",
    nodeEnv: appEnvironment,
    webhookSecret: blankToUndefined(parsedEnv.LINQ_WEBHOOK_SECRET),
    n8nIntakeWebhookUrl: blankToUndefined(parsedEnv.N8N_INTAKE_WEBHOOK_URL),
    n8nInternalSecret: blankToUndefined(parsedEnv.N8N_INTERNAL_SECRET)
  };
}

function parseEnvironment(
  env: RuntimeEnv,
  operation: "loadRuntimeConfig" | "loadLinqWebhookConfig",
  safeMessage: string
): ParsedEnv {
  const parsedEnv = envSchema.safeParse(env);

  if (!parsedEnv.success) {
    throw new IntegrationError({
      integration: "runtimeConfig",
      operation,
      safeMessage,
      retryable: false,
      cause: {
        issues: parsedEnv.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    });
  }

  return parsedEnv.data;
}

function requireLiveValue(env: ParsedEnv, key: (typeof liveRequiredKeys)[number]): string {
  const value = env[key];

  if (isBlank(value)) {
    throw new IntegrationError({
      integration: "runtimeConfig",
      operation: "loadRuntimeConfig",
      safeMessage: `Live mode missing required configuration: ${key}`,
      retryable: false,
      cause: { missingKeys: [key] }
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