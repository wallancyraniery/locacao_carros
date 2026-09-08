export type SupabaseDevelopmentLaunch = {
  executable: string;
  arguments: string[];
  environment: Record<string, string | undefined>;
};

export declare function createSupabaseDevelopmentLaunch(
  parentEnvironment: Record<string, string | undefined>,
  runtimeEnvironment: Record<string, string>,
  forwardedArguments?: string[],
): SupabaseDevelopmentLaunch;

export declare class SupabaseDevelopmentLauncherError extends Error {}

export declare function loadPrivateRuntimeEnvironment(file?: string): Record<string, string>;
