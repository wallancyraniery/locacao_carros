import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const runtimeEnvironmentFile = ".env.supabase.runtime.local";
const expectedProjectRef = "avglmahriseqpoysdmom";
const requiredRuntimeEnvironmentKeys = [
  "DATABASE_RUNTIME_PROVIDER",
  "SUPABASE_RUNTIME_PROJECT_REF",
  "SUPABASE_RUNTIME_DATABASE_URL",
  "SUPABASE_RUNTIME_SSL_CA_BASE64",
  "SUPABASE_RUNTIME_CONFIRMATION",
];
const runtimeEnvironmentKeys = [
  "DATABASE_RUNTIME_PROVIDER",
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "SUPABASE_RUNTIME_PROJECT_REF",
  "SUPABASE_RUNTIME_DATABASE_URL",
  "SUPABASE_RUNTIME_SSL_CA_BASE64",
  "SUPABASE_RUNTIME_CONFIRMATION",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_MIGRATION_DATABASE_URL",
  "SUPABASE_REMOTE_MIGRATION_CONFIRMATION",
  "NODE_OPTIONS",
];
const forbiddenChildEnvironmentKeys = [
  "MIGRATION_DATABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_MIGRATION_DATABASE_URL",
  "SUPABASE_REMOTE_MIGRATION_CONFIRMATION",
  "NODE_OPTIONS",
];

export class SupabaseDevelopmentLauncherError extends Error {
  constructor(reason) {
    super(`Inicialização Supabase recusada: ${reason}. Nenhum segredo foi exibido.`);
    this.name = "SupabaseDevelopmentLauncherError";
  }
}

export function loadPrivateRuntimeEnvironment(file = runtimeEnvironmentFile) {
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
      throw new SupabaseDevelopmentLauncherError("arquivo de runtime deve ser regular e possuir modo privado");
    }
    return parseEnv(readFileSync(descriptor, "utf8"));
  } catch (error) {
    if (error instanceof SupabaseDevelopmentLauncherError) throw error;
    throw new SupabaseDevelopmentLauncherError("arquivo de runtime ausente ou inválido");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function createSupabaseDevelopmentLaunch(parentEnvironment, runtimeEnvironment, forwardedArguments = []) {
  if (requiredRuntimeEnvironmentKeys.some((key) => typeof runtimeEnvironment[key] !== "string"
    || runtimeEnvironment[key].trim().length === 0)
    || runtimeEnvironment.DATABASE_RUNTIME_PROVIDER !== "supabase"
    || runtimeEnvironment.SUPABASE_RUNTIME_PROJECT_REF !== expectedProjectRef
    || runtimeEnvironment.SUPABASE_RUNTIME_CONFIRMATION !== `locacao_carros:${expectedProjectRef}:lead_intake_runtime`) {
    throw new SupabaseDevelopmentLauncherError("configuração dedicada de runtime ausente ou divergente");
  }
  const environment = { ...parentEnvironment };
  for (const key of runtimeEnvironmentKeys) delete environment[key];
  Object.assign(environment, runtimeEnvironment);
  for (const key of forbiddenChildEnvironmentKeys) delete environment[key];
  const nextBinary = resolve("node_modules/next/dist/bin/next");
  return {
    executable: nextBinary,
    arguments: ["dev", ...forwardedArguments],
    environment,
  };
}

function refuse(error) {
  const message = error instanceof SupabaseDevelopmentLauncherError
    ? error.message
    : new SupabaseDevelopmentLauncherError("não foi possível iniciar o Next").message;
  console.error(message);
  process.exitCode = 1;
}

function run() {
  let launch;
  try {
    const runtimeEnvironment = loadPrivateRuntimeEnvironment();
    launch = createSupabaseDevelopmentLaunch(process.env, runtimeEnvironment, process.argv.slice(2));
  } catch (error) {
    refuse(error);
    return;
  }

  const child = spawn(launch.executable, launch.arguments, {
    cwd: process.cwd(),
    env: launch.environment,
    stdio: "inherit",
  });
  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const onInterrupt = () => forwardSignal("SIGINT");
  const onTerminate = () => forwardSignal("SIGTERM");
  const cleanup = () => {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  child.once("error", (error) => {
    cleanup();
    refuse(error);
  });
  child.once("exit", (code, signal) => {
    cleanup();
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) run();
