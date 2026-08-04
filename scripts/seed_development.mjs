import { readFile } from "node:fs/promises";
import postgres from "postgres";

const organizationId = "10000000-0000-4000-8000-000000000001";
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function safeDevelopmentUrl(environment) {
  if (!environment.DATABASE_URL || !environment.POSTGRES_DB) throw new Error("Configuração local de desenvolvimento incompleta.");
  let url;
  try { url = new URL(environment.DATABASE_URL); } catch { throw new Error("Configuração local de desenvolvimento inválida."); }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!localHosts.has(url.hostname.toLowerCase()) || databaseName !== environment.POSTGRES_DB) throw new Error("Seed recusado: o destino deve ser o banco PostgreSQL local configurado.");
  return url.href;
}

const vehicles = JSON.parse(await readFile(new URL("../src/modules/vehicles/data/demo_vehicles.json", import.meta.url), "utf8"));
const rentalTerms = JSON.parse(await readFile(new URL("../src/modules/rentals/data/rental_terms.json", import.meta.url), "utf8"));
const sql = postgres(safeDevelopmentUrl(process.env), { max: 1 });

try {
  await sql.begin(async (transaction) => {
    await transaction`insert into organizations (id, name, slug) values (${organizationId}, 'Locadora demonstrativa', 'locadora_demonstrativa') on conflict (id) do update set name = excluded.name, slug = excluded.slug, updated_at = now()`;
    for (const vehicle of vehicles) {
      await transaction`insert into vehicles (id, organization_id, brand, model, version, year, color, weekly_price_cents, status, is_demo) values (${vehicle.id}, ${organizationId}, ${vehicle.brand}, ${vehicle.model}, ${vehicle.version}, ${vehicle.year}, ${vehicle.color}, ${rentalTerms.weeklyRentalCents}, ${vehicle.status}, true) on conflict (id) do update set brand = excluded.brand, model = excluded.model, version = excluded.version, year = excluded.year, color = excluded.color, weekly_price_cents = excluded.weekly_price_cents, status = excluded.status, is_demo = true, updated_at = now() where vehicles.organization_id = excluded.organization_id and vehicles.is_demo = true`;
    }
  });
  console.log("Dados demonstrativos locais sincronizados com segurança.");
} catch {
  console.error("Não foi possível sincronizar os dados demonstrativos locais.");
  process.exitCode = 1;
} finally {
  await sql.end();
}
