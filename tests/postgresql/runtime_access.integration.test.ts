import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const demoOrganizationId = "10000000-0000-4000-8000-000000000001";
const runId = crypto.randomUUID();
const otherOrganizationId = crypto.randomUUID();
const availableVehicleId = crypto.randomUUID();
const unavailableVehicleId = crypto.randomUUID();
const nonDemoVehicleId = crypto.randomUUID();
const otherOrganizationVehicleId = crypto.randomUUID();
const acceptedLeadId = crypto.randomUUID();
const returningLeadId = crypto.randomUUID();
const attemptedLeadIds = Array.from({ length: 6 }, () => crypto.randomUUID());
const broadAttemptIds = Array.from({ length: 4 }, () => crypto.randomUUID());
const roleSuffix = runId.replaceAll("-", "").slice(0, 12);
const auxiliaryRoles = [`rt_parent_${roleSuffix}`, `rt_grand_${roleSuffix}`, `rt_child_${roleSuffix}`];
const temporaryPolicyName = "runtime_test_permissive_broad_access";

describe("contrato de acesso do runtime", () => {
  let sql: ReturnType<typeof postgres>;
  let demoOrganizationCreated = false;
  const rolesCreatedByTest: string[] = [];

  async function asRuntime<T>(operation: () => Promise<T>): Promise<T> {
    await sql`set role lead_intake_runtime`;
    try { return await operation(); } finally { await sql`reset role`; }
  }

  async function dropTemporaryPolicies() {
    await sql.unsafe(`drop policy if exists ${temporaryPolicyName} on organizations`);
    await sql.unsafe(`drop policy if exists ${temporaryPolicyName} on vehicles`);
    await sql.unsafe(`drop policy if exists ${temporaryPolicyName} on rental_leads`);
  }

  async function cleanupAuxiliaryRoles() {
    const [parent, grandparent, child] = auxiliaryRoles;
    await sql.unsafe(`revoke ${parent} from lead_intake_runtime`).catch(() => undefined);
    await sql.unsafe(`revoke ${grandparent} from ${parent}`).catch(() => undefined);
    await sql.unsafe(`revoke lead_intake_runtime from ${child}`).catch(() => undefined);
    for (const role of [child, parent, grandparent]) await sql.unsafe(`drop role if exists ${role}`);
  }

  beforeAll(async () => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
    for (const role of ["anon", "authenticated"]) {
      const [existing] = await sql`select exists(select 1 from pg_roles where rolname = ${role}) as exists`;
      if (!existing.exists) {
        await sql.unsafe(`create role ${role} nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls`);
        rolesCreatedByTest.push(role);
      }
    }
    const [demo] = await sql`select exists(select 1 from organizations where id = ${demoOrganizationId}) as exists`;
    if (!demo.exists) {
      await sql`insert into organizations (id, name, slug) values (${demoOrganizationId}, 'Organização demonstrativa', ${`runtime_demo_${runId}`})`;
      demoOrganizationCreated = true;
    }
    await sql`insert into organizations (id, name, slug) values (${otherOrganizationId}, 'Organização isolada de teste', ${`runtime_other_${runId}`})`;
    await sql`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status, is_demo) values
      (${availableVehicleId}, ${demoOrganizationId}, 'Marca', 'Disponível', 2024, 'Prata', 70000, 'available', true),
      (${unavailableVehicleId}, ${demoOrganizationId}, 'Marca', 'Indisponível', 2024, 'Prata', 70000, 'rented', true),
      (${nonDemoVehicleId}, ${demoOrganizationId}, 'Marca', 'Não demonstrativo', 2024, 'Prata', 70000, 'available', false),
      (${otherOrganizationVehicleId}, ${otherOrganizationId}, 'Marca', 'Outra organização', 2024, 'Prata', 70000, 'available', true)`;
  });

  afterAll(async () => {
    if (!sql) return;
    const errors: unknown[] = [];
    const attempt = async (operation: () => Promise<unknown>) => {
      try { await operation(); } catch (error) { errors.push(error); }
    };
    await attempt(() => sql`reset role`);
    await attempt(dropTemporaryPolicies);
    await attempt(cleanupAuxiliaryRoles);
    await attempt(() => sql`delete from rental_leads where id = any(${[acceptedLeadId, returningLeadId, ...attemptedLeadIds, ...broadAttemptIds]}::uuid[])`);
    await attempt(() => sql`delete from vehicles where id in (${availableVehicleId}, ${unavailableVehicleId}, ${nonDemoVehicleId}, ${otherOrganizationVehicleId})`);
    await attempt(() => sql`delete from organizations where id = ${otherOrganizationId}`);
    if (demoOrganizationCreated) await attempt(() => sql`delete from organizations where id = ${demoOrganizationId}`);
    for (const role of rolesCreatedByTest.reverse()) await attempt(() => sql.unsafe(`drop role ${role}`));
    await sql.end();
    if (errors.length) throw new AggregateError(errors, "Falha ao limpar fixtures isoladas do teste de runtime");
  });

  it("declara a role sem login, atributos elevados, bypass ou ownership", async () => {
    const [role] = await sql`select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls from pg_roles where rolname = 'lead_intake_runtime'`;
    expect(role).toEqual({ rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolreplication: false, rolbypassrls: false });
    expect(await sql`select relname from pg_class where relnamespace = 'public'::regnamespace and relowner = 'lead_intake_runtime'::regrole`).toHaveLength(0);
  });

  it("não possui memberships diretos ou indiretos em nenhuma direção", async () => {
    expect(await sql`select 1 from pg_auth_members where member = 'lead_intake_runtime'::regrole or roleid = 'lead_intake_runtime'::regrole`).toHaveLength(0);
    expect(await sql`with recursive
      parents(roleid) as (
        select roleid from pg_auth_members where member = 'lead_intake_runtime'::regrole
        union select membership.roleid from pg_auth_members membership inner join parents on membership.member = parents.roleid
      ),
      members(member) as (
        select member from pg_auth_members where roleid = 'lead_intake_runtime'::regrole
        union select membership.member from pg_auth_members membership inner join members on membership.roleid = members.member
      )
      select roleid from parents union all select member from members`).toHaveLength(0);
  });

  it("falha fechada diante de memberships diretos e indiretos sem alteração parcial", async () => {
    const [parent, grandparent, child] = auxiliaryRoles;
    try {
      for (const role of auxiliaryRoles) await sql.unsafe(`create role ${role} nologin`);
      await sql.unsafe(`grant ${parent} to lead_intake_runtime`);
      await sql.unsafe(`grant ${grandparent} to ${parent}`);
      await sql.unsafe(`grant lead_intake_runtime to ${child}`);
      const before = await sql`select rolcanlogin, rolinherit from pg_roles where rolname = 'lead_intake_runtime'`;
      const migration = readFileSync("drizzle/0003_runtime_lead_intake_access.sql", "utf8").replaceAll("--> statement-breakpoint", "");
      await expect(sql.unsafe(migration).simple()).rejects.toThrow(/memberships inesperados/);
      expect(await sql`select rolcanlogin, rolinherit from pg_roles where rolname = 'lead_intake_runtime'`).toEqual(before);
      expect(await sql`select 1 from pg_auth_members where member = 'lead_intake_runtime'::regrole or roleid = 'lead_intake_runtime'::regrole`).toHaveLength(2);
      expect(await sql`with recursive parents(roleid) as (
        select roleid from pg_auth_members where member = 'lead_intake_runtime'::regrole
        union select membership.roleid from pg_auth_members membership inner join parents on membership.member = parents.roleid
      ) select roleid from parents where roleid = ${grandparent}::regrole`).toHaveLength(1);
    } finally { await cleanupAuxiliaryRoles(); }
  });

  it("concede somente os privilégios efetivos previstos", async () => {
    const [schema] = await sql`select has_schema_privilege('lead_intake_runtime', 'public', 'USAGE') as usage, has_schema_privilege('lead_intake_runtime', 'public', 'CREATE') as create`;
    expect(schema).toEqual({ usage: true, create: false });
    const privileges = await sql`select table_name,
      has_table_privilege('lead_intake_runtime', format('public.%I', table_name), 'SELECT') as select,
      has_table_privilege('lead_intake_runtime', format('public.%I', table_name), 'INSERT') as insert,
      has_table_privilege('lead_intake_runtime', format('public.%I', table_name), 'UPDATE') as update,
      has_table_privilege('lead_intake_runtime', format('public.%I', table_name), 'DELETE') as delete,
      has_table_privilege('lead_intake_runtime', format('public.%I', table_name), 'TRUNCATE') as truncate,
      has_table_privilege('lead_intake_runtime', format('public.%I', table_name), 'REFERENCES') as references
      from (values ('organizations'), ('vehicles'), ('rental_leads'), ('lead_status_history')) as project_tables(table_name) order by table_name`;
    expect(privileges).toEqual(privileges.map(({ table_name }) => ({ table_name, select: false, insert: false, update: false, delete: false, truncate: false, references: false })));

    const allowed = [
      ["organizations", "id", "SELECT"],
      ...["id", "organization_id", "status", "is_demo"].map((column) => ["vehicles", column, "SELECT"]),
      ...["id", "organization_id", "vehicle_id", "full_name", "phone", "email", "city", "has_definitive_license", "usage_purpose", "has_ear", "driver_platform", "preferred_contact_time", "status"].map((column) => ["rental_leads", column, "INSERT"]),
    ];
    for (const [table, column, privilege] of allowed) {
      const [result] = await sql`select has_column_privilege('lead_intake_runtime', ${`public.${table}`}, ${column}, ${privilege}) as allowed`;
      expect(result.allowed, `${table}.${column} ${privilege}`).toBe(true);
    }
    for (const [table, column] of [["organizations", "name"], ["organizations", "slug"], ["vehicles", "brand"], ["vehicles", "model"], ["vehicles", "version"], ["rental_leads", "id"], ["lead_status_history", "id"]]) {
      const [result] = await sql`select has_column_privilege('lead_intake_runtime', ${`public.${table}`}, ${column}, 'SELECT') as allowed`;
      expect(result.allowed, `${table}.${column} SELECT`).toBe(false);
    }
    expect(await sql`select 1 from information_schema.table_privileges where grantee = 'PUBLIC' and table_schema = 'public' and table_name in ('organizations', 'vehicles', 'rental_leads', 'lead_status_history')`).toHaveLength(0);
    const sequences = await sql`select sequence_schema, sequence_name from information_schema.sequences where sequence_schema = 'public'`;
    for (const sequence of sequences) {
      const [result] = await sql`select has_sequence_privilege('lead_intake_runtime', ${`${sequence.sequence_schema}.${sequence.sequence_name}`}, 'USAGE,SELECT,UPDATE') as allowed`;
      expect(result.allowed).toBe(false);
    }
  });

  it("mantém todas as policies aplicáveis explícitas, permissivas e restritivas", async () => {
    const policies = await sql`select tablename, policyname, permissive, cmd, roles from pg_policies where schemaname = 'public' and roles && array['lead_intake_runtime', 'public']::name[] order by tablename, policyname`;
    expect(policies).toEqual([
      { tablename: "organizations", policyname: "lead_intake_runtime_enable_demo_organization_select", permissive: "PERMISSIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
      { tablename: "organizations", policyname: "lead_intake_runtime_guard_demo_organization_select", permissive: "RESTRICTIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
      { tablename: "rental_leads", policyname: "lead_intake_runtime_enable_new_demo_lead_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["lead_intake_runtime"] },
      { tablename: "rental_leads", policyname: "lead_intake_runtime_guard_new_demo_lead_insert", permissive: "RESTRICTIVE", cmd: "INSERT", roles: ["lead_intake_runtime"] },
      { tablename: "vehicles", policyname: "lead_intake_runtime_enable_available_demo_vehicle_select", permissive: "PERMISSIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
      { tablename: "vehicles", policyname: "lead_intake_runtime_guard_available_demo_vehicle_select", permissive: "RESTRICTIVE", cmd: "SELECT", roles: ["lead_intake_runtime"] },
    ]);
  });

  it("consulta somente a organização e o veículo demonstrativo disponível", async () => {
    const result = await asRuntime(() => sql`select v.id, v.organization_id from vehicles v inner join organizations o on o.id = v.organization_id where v.id in (${availableVehicleId}, ${unavailableVehicleId}, ${nonDemoVehicleId}, ${otherOrganizationVehicleId}) order by v.id`);
    expect(result).toEqual([{ id: availableVehicleId, organization_id: demoOrganizationId }]);
  });

  it("cria um lead new com UUID definido pelo servidor sem RETURNING", async () => {
    await asRuntime(() => sql`insert into rental_leads (id, organization_id, vehicle_id, full_name, phone, email, city, has_definitive_license, usage_purpose, has_ear, driver_platform, preferred_contact_time, status) values (${acceptedLeadId}, ${demoOrganizationId}, ${availableVehicleId}, 'Pessoa Runtime', '(12) 99999-9999', ${`runtime_${runId}@example.test`}, 'Cidade', true, 'professional_app', true, null, null, 'new')`);
    expect(await sql`select id, status from rental_leads where id = ${acceptedLeadId}`).toEqual([{ id: acceptedLeadId, status: "new" }]);
  });

  it("rejeita INSERT RETURNING sem persistir a tentativa", async () => {
    await asRuntime(() => expect(sql`insert into rental_leads (id, organization_id, vehicle_id, full_name, phone, city, has_definitive_license, status) values (${returningLeadId}, ${demoOrganizationId}, ${availableVehicleId}, 'Pessoa Runtime', '(12) 99999-9999', 'Cidade', true, 'new') returning id`).rejects.toThrow());
    expect(await sql`select id from rental_leads where id = ${returningLeadId}`).toHaveLength(0);
  });

  it("nega leitura, PII, alteração, exclusão, truncate, references e histórico", async () => {
    await asRuntime(async () => {
      await expect(sql`select id, full_name, phone, email from rental_leads`).rejects.toThrow();
      await expect(sql`select id from lead_status_history`).rejects.toThrow();
      await expect(sql`select name from organizations`).rejects.toThrow();
      await expect(sql`select brand from vehicles`).rejects.toThrow();
      await expect(sql`update rental_leads set status = 'contacted' where id = ${acceptedLeadId}`).rejects.toThrow();
      await expect(sql`delete from rental_leads where id = ${acceptedLeadId}`).rejects.toThrow();
      const [effective] = await sql`select has_table_privilege(current_user, 'public.rental_leads', 'TRUNCATE') as truncate, has_table_privilege(current_user, 'public.rental_leads', 'REFERENCES') as references`;
      expect(effective).toEqual({ truncate: false, references: false });
    });
  });

  it("nega organização, status e veículos incompatíveis", async () => {
    const cases = [
      [attemptedLeadIds[0], otherOrganizationId, otherOrganizationVehicleId, "new"],
      [attemptedLeadIds[1], demoOrganizationId, availableVehicleId, "approved"],
      [attemptedLeadIds[2], demoOrganizationId, unavailableVehicleId, "new"],
      [attemptedLeadIds[3], demoOrganizationId, nonDemoVehicleId, "new"],
      [attemptedLeadIds[4], demoOrganizationId, null, "new"],
      [attemptedLeadIds[5], demoOrganizationId, crypto.randomUUID(), "new"],
    ] as const;
    await asRuntime(async () => {
      for (const [id, organizationId, vehicleId, status] of cases) {
        await expect(sql`insert into rental_leads (id, organization_id, vehicle_id, full_name, phone, city, has_definitive_license, status) values (${id}, ${organizationId}, ${vehicleId}, 'Pessoa', '(12) 99999-9999', 'Cidade', true, ${status})`).rejects.toThrow();
      }
    });
  });

  it("guardas restritivas resistem a policies permissivas amplas futuras", async () => {
    try {
      await sql.unsafe(`create policy ${temporaryPolicyName} on organizations as permissive for select to public using (true)`);
      await sql.unsafe(`create policy ${temporaryPolicyName} on vehicles as permissive for select to public using (true)`);
      await sql.unsafe(`create policy ${temporaryPolicyName} on rental_leads as permissive for insert to public with check (true)`);
      await asRuntime(async () => {
        expect(await sql`select id from organizations where id = ${otherOrganizationId}`).toHaveLength(0);
        expect(await sql`select id from vehicles where id in (${unavailableVehicleId}, ${nonDemoVehicleId}, ${otherOrganizationVehicleId})`).toHaveLength(0);
        await expect(sql`insert into rental_leads (id, organization_id, vehicle_id, full_name, phone, city, has_definitive_license, status) values (${broadAttemptIds[0]}, ${demoOrganizationId}, ${unavailableVehicleId}, 'Pessoa', '(12) 99999-9999', 'Cidade', true, 'new')`).rejects.toThrow();
        await expect(sql`insert into rental_leads (id, organization_id, vehicle_id, full_name, phone, city, has_definitive_license, status) values (${broadAttemptIds[1]}, ${demoOrganizationId}, ${nonDemoVehicleId}, 'Pessoa', '(12) 99999-9999', 'Cidade', true, 'new')`).rejects.toThrow();
        await expect(sql`insert into rental_leads (id, organization_id, vehicle_id, full_name, phone, city, has_definitive_license, status) values (${broadAttemptIds[2]}, ${otherOrganizationId}, ${otherOrganizationVehicleId}, 'Pessoa', '(12) 99999-9999', 'Cidade', true, 'new')`).rejects.toThrow();
        await expect(sql`insert into rental_leads (id, organization_id, vehicle_id, full_name, phone, city, has_definitive_license, status) values (${broadAttemptIds[3]}, ${demoOrganizationId}, ${availableVehicleId}, 'Pessoa', '(12) 99999-9999', 'Cidade', true, 'approved')`).rejects.toThrow();
      });
    } finally { await dropTemporaryPolicies(); }
  });

  it("não altera organizations ou vehicles", async () => {
    await asRuntime(async () => {
      await expect(sql`update organizations set name = 'Alterada' where id = ${demoOrganizationId}`).rejects.toThrow();
      await expect(sql`update vehicles set status = 'rented' where id = ${availableVehicleId}`).rejects.toThrow();
    });
  });

  it("mantém anon e authenticated sem acesso", async () => {
    for (const role of ["anon", "authenticated"]) {
      await sql.unsafe(`set role ${role}`);
      try {
        await expect(sql`select id from organizations`).rejects.toThrow();
        await expect(sql`select id from vehicles`).rejects.toThrow();
        await expect(sql`insert into rental_leads (id, organization_id, full_name, phone, city, has_definitive_license, status) values (${crypto.randomUUID()}, ${demoOrganizationId}, 'Pessoa', '(12) 99999-9999', 'Cidade', true, 'new')`).rejects.toThrow();
      } finally { await sql`reset role`; }
    }
  });
});
