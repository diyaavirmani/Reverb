import { LocalFixtureRepository } from "./local-fixture-repository";
import type { StorageRepository } from "./storage-repository";

type RepositoryFactoryOptions = {
  env?: {
    USE_FIXTURES?: string;
  };
  fixtureDataDir?: string;
};

export function createStorageRepository(
  options: RepositoryFactoryOptions = {}
): StorageRepository {
  const env = options.env ?? process.env;

  if (env.USE_FIXTURES === "true") {
    return new LocalFixtureRepository(options.fixtureDataDir);
  }

  throw new Error("live repository not configured");
}

