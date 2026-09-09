export type DevelopmentSeedEnvironment = { databaseUrl: string };

export class DevelopmentSeedEnvironmentError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function parseDevelopmentSeedEnvironment(
  environment: Record<string, string | undefined>,
): DevelopmentSeedEnvironment;
