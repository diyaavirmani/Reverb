import {
  FixtureLinqAdapter,
  FixtureN8nStorageAdapter,
  FixtureOpenAIAdapter,
  FixturePravaAdapter,
  FixtureSensoAdapter
} from "./fixtures";
import {
  LiveLinqAdapter,
  LiveN8nStorageAdapter,
  LiveOpenAIAdapter,
  LivePravaAdapter,
  LiveSensoAdapter
} from "./live";
import { loadRuntimeConfig, type RuntimeConfig } from "./runtime-config";
import type {
  IntegrationAdapters,
  LinqAdapter,
  N8nStorageAdapter,
  OpenAIAdapter,
  PravaAdapter,
  SensoAdapter
} from "./types";

export function createIntegrationAdapters(config = loadRuntimeConfig()): IntegrationAdapters {
  return {
    openai: createOpenAIAdapter(config),
    senso: createSensoAdapter(config),
    linq: createLinqAdapter(config),
    prava: createPravaAdapter(config),
    n8nStorage: createN8nStorageAdapter(config)
  };
}

export function createOpenAIAdapter(config = loadRuntimeConfig()): OpenAIAdapter {
  if (config.useFixtures) {
    return new FixtureOpenAIAdapter();
  }

  return new LiveOpenAIAdapter(config.integrations.openai);
}

export function createSensoAdapter(config = loadRuntimeConfig()): SensoAdapter {
  if (config.useFixtures) {
    return new FixtureSensoAdapter();
  }

  return new LiveSensoAdapter(config.integrations.senso);
}

export function createLinqAdapter(config = loadRuntimeConfig()): LinqAdapter {
  if (config.useFixtures) {
    return new FixtureLinqAdapter();
  }

  return new LiveLinqAdapter(config.integrations.linq);
}

export function createPravaAdapter(config = loadRuntimeConfig()): PravaAdapter {
  if (config.useFixtures) {
    return new FixturePravaAdapter();
  }

  return new LivePravaAdapter(config.integrations.prava);
}

export function createN8nStorageAdapter(config = loadRuntimeConfig()): N8nStorageAdapter {
  if (config.useFixtures) {
    return new FixtureN8nStorageAdapter();
  }

  return new LiveN8nStorageAdapter(config.integrations.n8nStorage);
}
