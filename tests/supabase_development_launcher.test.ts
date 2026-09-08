import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseDevelopmentLaunch,
  loadPrivateRuntimeEnvironment,
  SupabaseDevelopmentLauncherError,
} from "../scripts/start_supabase_development.mjs";

const temporaryDirectories: string[] = [];
const expectedRuntimeEnvironment = {
  DATABASE_RUNTIME_PROVIDER: "supabase",
  SUPABASE_RUNTIME_PROJECT_REF: "avglmahriseqpoysdmom",
  SUPABASE_RUNTIME_DATABASE_URL: "valor_sintetico_carregado_do_arquivo",
  SUPABASE_RUNTIME_SSL_CA_BASE64: "certificado_sintetico",
  SUPABASE_RUNTIME_CONFIRMATION: "locacao_carros:avglmahriseqpoysdmom:lead_intake_runtime",
};

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "locacao-supabase-launcher-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("launcher de desenvolvimento Supabase", () => {
  it("carrega o ambiente dedicado diretamente no novo processo Node", () => {
    const runtimeEnvironment = {
      ...expectedRuntimeEnvironment,
      SUPABASE_MIGRATION_DATABASE_URL: "credencial_administrativa_indevida",
      NODE_OPTIONS: "--env-file=arquivo-indevido",
    };
    const launch = createSupabaseDevelopmentLaunch({
      PATH: "/bin",
      NODE_OPTIONS: "--env-file=arquivo-incorreto",
      DATABASE_RUNTIME_PROVIDER: "local",
      SUPABASE_RUNTIME_DATABASE_URL: "valor_que_nao_deve_ser_propagado",
    }, runtimeEnvironment, ["--hostname", "127.0.0.1"]);

    expect(launch.executable).toMatch(/node_modules\/next\/dist\/bin\/next$/);
    expect(launch.arguments.slice(-3)).toEqual(["dev", "--hostname", "127.0.0.1"]);
    expect(launch.arguments.every((argument) => !argument.includes("--env-file"))).toBe(true);
    expect(launch.environment).toEqual({
      PATH: "/bin",
      ...expectedRuntimeEnvironment,
    });
    expect(launch.environment.NODE_OPTIONS).toBeUndefined();
    expect(launch.environment.SUPABASE_MIGRATION_DATABASE_URL).toBeUndefined();
  });

  it.each(Object.keys(expectedRuntimeEnvironment))("recusa configuração sem %s, mesmo que herdada", (key) => {
    const runtimeEnvironment: Record<string, string> = { ...expectedRuntimeEnvironment };
    delete runtimeEnvironment[key];

    expect(() => createSupabaseDevelopmentLaunch(expectedRuntimeEnvironment, runtimeEnvironment))
      .toThrow(SupabaseDevelopmentLauncherError);
    runtimeEnvironment[key] = "   ";
    expect(() => createSupabaseDevelopmentLaunch(expectedRuntimeEnvironment, runtimeEnvironment))
      .toThrow(SupabaseDevelopmentLauncherError);
  });

  it.each([
    ["DATABASE_RUNTIME_PROVIDER", "local"],
    ["SUPABASE_RUNTIME_PROJECT_REF", "outro_projeto_sintetico"],
    ["SUPABASE_RUNTIME_CONFIRMATION", "confirmacao_sintetica_divergente"],
  ])("recusa %s divergente sem expor seu valor", (key, value) => {
    try {
      createSupabaseDevelopmentLaunch({}, { ...expectedRuntimeEnvironment, [key]: value });
      expect.fail("a configuração deveria ser recusada");
    } catch (error) {
      expect(error).toBeInstanceOf(SupabaseDevelopmentLauncherError);
      expect(String(error)).not.toContain(value);
      expect(String(error)).not.toContain(expectedRuntimeEnvironment.SUPABASE_RUNTIME_DATABASE_URL);
    }
  });

  it.each(["", "SUPABASE_RUNTIME_DATABASE_URL=segredo_sintetico\n"])(
    "recusa arquivo privado vazio ou incompleto antes de preparar o Next",
    (contents) => {
      const file = join(temporaryDirectory(), "runtime.env");
      writeFileSync(file, contents, { mode: 0o600 });

      expect(() => createSupabaseDevelopmentLaunch(expectedRuntimeEnvironment, loadPrivateRuntimeEnvironment(file)))
        .toThrow(SupabaseDevelopmentLauncherError);
    },
  );

  it("mantém o comando curto e não usa NODE_OPTIONS para propagar --env-file", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const source = readFileSync("scripts/start_supabase_development.mjs", "utf8");

    expect(packageJson.scripts["dev:supabase"]).toBe("node scripts/start_supabase_development.mjs");
    expect(source).toContain("spawn(");
    expect(source).toContain("stdio: \"inherit\"");
    expect(source).not.toContain("--env-file");
    expect(source).toContain("forbiddenChildEnvironmentKeys");
    expect(source).toContain('process.on("SIGINT"');
    expect(source).toContain('process.on("SIGTERM"');
    expect(source).toContain("process.exitCode = code");
  });

  it("lê um arquivo privado sem imprimir seus valores", () => {
    const directory = temporaryDirectory();
    const file = join(directory, "runtime.env");
    const secret = "segredo_sintetico_que_nao_pode_ser_impresso";
    writeFileSync(file, `DATABASE_RUNTIME_PROVIDER=supabase\nSUPABASE_RUNTIME_DATABASE_URL=${secret}\n`, { mode: 0o600 });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(loadPrivateRuntimeEnvironment(file)).toMatchObject({
      DATABASE_RUNTIME_PROVIDER: "supabase",
      SUPABASE_RUNTIME_DATABASE_URL: secret,
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("recusa arquivo ausente ou com permissões inseguras sem expor conteúdo", () => {
    const directory = temporaryDirectory();
    const missing = join(directory, "missing.env");
    const insecure = join(directory, "insecure.env");
    const secret = "segredo_sintetico_privado";
    writeFileSync(insecure, `SUPABASE_RUNTIME_DATABASE_URL=${secret}\n`, { mode: 0o600 });
    chmodSync(insecure, 0o644);

    for (const file of [missing, insecure]) {
      try {
        loadPrivateRuntimeEnvironment(file);
        expect.fail("o arquivo deveria ser recusado");
      } catch (error) {
        expect(error).toBeInstanceOf(SupabaseDevelopmentLauncherError);
        expect(String(error)).not.toContain(secret);
      }
    }
  });

  it("recusa diretório e link simbólico, mesmo com destino privado", () => {
    const directory = temporaryDirectory();
    const file = join(directory, "private.env");
    const link = join(directory, "runtime.env");
    writeFileSync(file, "SEGREDO=valor_sintetico\n", { mode: 0o600 });
    symlinkSync(file, link);

    expect(() => loadPrivateRuntimeEnvironment(directory)).toThrow(SupabaseDevelopmentLauncherError);
    expect(() => loadPrivateRuntimeEnvironment(link)).toThrow(SupabaseDevelopmentLauncherError);
  });
});
