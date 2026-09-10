import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { closeSync, constants, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";

const projectRef = "avglmahriseqpoysdmom";
const roleName = "lead_intake_runtime";
const outputFile = ".env.supabase.runtime.local";

function stop(reason) {
  console.error(`Provisionamento recusado: ${reason}. Nenhum segredo foi exibido.`);
  process.exit(1);
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    stop("é obrigatório executar em um terminal interativo");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      error ? reject(error) : resolve(value);
    };
    const onData = (character) => {
      if (character === "\u0003") return finish(new Error("entrada cancelada"));
      if (character === "\r" || character === "\n") return finish();
      if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
      else if (/^[\x20-\x7e]+$/.test(character)) value += character;
    };
    process.stdin.on("data", onData);
  });
}

function scramVerifier(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", saltedPassword).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey}:${serverKey}`;
}

function safeConnectionReason(error) {
  const code = typeof error === "object" && error !== null && typeof error.code === "string"
    && /^[A-Z0-9_]{2,20}$/.test(error.code) ? error.code : undefined;
  return `falha remota${code ? ` (${code})` : ""}`;
}

if (process.argv.length !== 3) stop("informe somente o caminho do certificado CA oficial");
let descriptor;
let sql;
let password = "";
let confirmation = "";
try {
  const ca = readFileSync(process.argv[2], { encoding: "utf8", flag: constants.O_RDONLY | constants.O_NOFOLLOW }).trim();
  if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(ca)) stop("certificado CA inválido");
  const migration = parseEnv(readFileSync(".env.supabase.local", "utf8"));
  if (migration.SUPABASE_PROJECT_REF !== projectRef
    || migration.SUPABASE_REMOTE_MIGRATION_CONFIRMATION !== `locacao_carros:${projectRef}`) {
    stop("configuração administrativa não corresponde ao projeto autorizado");
  }
  const adminUrl = new URL(migration.SUPABASE_MIGRATION_DATABASE_URL);
  if (decodeURIComponent(adminUrl.username) !== `postgres.${projectRef}`
    || adminUrl.port !== "5432" || !adminUrl.hostname.includes("sa-east-1")
    || !adminUrl.hostname.endsWith(".pooler.supabase.com")) {
    stop("endpoint administrativo não corresponde ao Session Pooler autorizado");
  }

  password = await readHidden("Senha exclusiva da role runtime: ");
  confirmation = await readHidden("Confirme a senha: ");
  if (password !== confirmation) stop("as entradas não coincidem");
  if (!/^[\x20-\x7e]{32,128}$/.test(password)) stop("use de 32 a 128 caracteres ASCII imprimíveis");

  const runtimeUrl = new URL(adminUrl.href);
  runtimeUrl.username = `${roleName}.${projectRef}`;
  runtimeUrl.password = password;
  runtimeUrl.port = "6543";
  runtimeUrl.search = "?sslmode=verify-full";
  const contents = [
    "DATABASE_RUNTIME_PROVIDER=supabase",
    `SUPABASE_RUNTIME_PROJECT_REF=${projectRef}`,
    `SUPABASE_RUNTIME_DATABASE_URL=${runtimeUrl.href}`,
    `SUPABASE_RUNTIME_SSL_CA_BASE64=${Buffer.from(`${ca}\n`, "utf8").toString("base64")}`,
    `SUPABASE_RUNTIME_CONFIRMATION=locacao_carros:${projectRef}:${roleName}`,
    "",
  ].join("\n");
  descriptor = openSync(outputFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  writeSync(descriptor, contents, undefined, "utf8");
  fsyncSync(descriptor);
  closeSync(descriptor);
  descriptor = undefined;

  const verifier = scramVerifier(password);
  password = "";
  confirmation = "";
  sql = postgres({
    host: adminUrl.hostname,
    port: Number(adminUrl.port),
    database: decodeURIComponent(adminUrl.pathname.slice(1)),
    username: decodeURIComponent(adminUrl.username),
    password: decodeURIComponent(adminUrl.password),
    max: 1,
    prepare: false,
    ssl: { ca: `${ca}\n`, rejectUnauthorized: true, servername: adminUrl.hostname },
    connection: { application_name: "locacao_runtime_provisioner", statement_timeout: 15_000, lock_timeout: 5_000 },
  });
  await sql.begin(async (transaction) => {
    const [identity] = await transaction`SELECT current_user = 'postgres' AS user_ok,
      current_database() = 'postgres' AS database_ok`;
    if (!identity?.user_ok || !identity.database_ok) throw Object.assign(new Error(), { code: "PROJECT_IDENTITY" });
    const history = await transaction`SELECT hash, created_at::text
      FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    if (history.length !== 5
      || history[3].hash !== "ac2397324260a6026cc07a7b7b4e359c29b454db27f6e8bf3ee4d3e505e64011"
      || history[3].created_at !== "1788489284810"
      || history[4].hash !== "2ced7529b1df7ceca8ef6f638856c0854d7faf51cc6e5b9e658b5c33b03d8581"
      || history[4].created_at !== "1788985384855") {
      throw Object.assign(new Error(), { code: "MIGRATION_STATE" });
    }
    const [role] = await transaction`SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
      rolinherit, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = ${roleName}`;
    if (!role || role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole
      || role.rolinherit || role.rolreplication || role.rolbypassrls) throw Object.assign(new Error(), { code: "ROLE_STATE" });
    const memberships = await transaction`SELECT granted.rolname AS granted_role,
      member.rolname AS member, grantor.rolname AS grantor, membership.admin_option,
      membership.inherit_option, membership.set_option
      FROM pg_auth_members membership
      JOIN pg_roles granted ON granted.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles grantor ON grantor.oid = membership.grantor
      WHERE granted.rolname = ${roleName} OR member.rolname = ${roleName}`;
    const exact = memberships.length === 1 && memberships[0].granted_role === roleName
      && memberships[0].member === "postgres" && memberships[0].grantor === "supabase_admin"
      && memberships[0].admin_option === true && memberships[0].inherit_option === false
      && memberships[0].set_option === false;
    if (!exact) throw Object.assign(new Error(), { code: "MEMBERSHIP_STATE" });
    const owned = await transaction`SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass
      AND refobjid = ${roleName}::regrole AND deptype = 'o'`;
    if (owned.length) throw Object.assign(new Error(), { code: "OWNERSHIP_STATE" });
    await transaction.unsafe(`ALTER ROLE ${roleName} PASSWORD '${verifier}'`);
    await transaction.unsafe(`ALTER ROLE ${roleName} LOGIN`);
  });
  console.log("Credencial runtime armazenada com modo 0600 e LOGIN habilitado. Execute o diagnóstico dedicado.");
} catch (error) {
  password = "";
  confirmation = "";
  if (descriptor !== undefined) { closeSync(descriptor); descriptor = undefined; }
  const reason = error?.message === "entrada cancelada" ? "entrada cancelada" : safeConnectionReason(error);
  console.error(`Provisionamento recusado: ${reason}. Nenhum segredo foi exibido.`);
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 2 }).catch(() => undefined);
}
