import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";
import { reservationSubmissionRepository } from "@/modules/reservations/infrastructure/reservation_submission_repository.server";
import { submitReservationRequest } from "@/modules/reservations/application/submit_reservation_request.server";
import type { ReservationSubmission } from "@/modules/reservations/domain/reservation_submission_repository";

vi.mock("server-only", () => ({}));
const getDatabase = vi.hoisted(() => vi.fn());
vi.mock("@/modules/database/client.server", () => ({ getDatabase }));
const org = "10000000-0000-4000-8000-000000000001";
const otherOrg = crypto.randomUUID();
const signature = "reservation_submission_private.submit(uuid,uuid,date,date,text,text,text,text,boolean,text,boolean,text,text)";

describe("submissão atômica de lead + solicitação", () => {
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof postgres>;
  let concurrent: ReturnType<typeof postgres>;
  let vehicle: string;
  let input: ReservationSubmission;
  let createdOrg = false;
  const operations: string[] = [];
  const call = (client: ReturnType<typeof postgres> | postgres.TransactionSql, data = input) => client`
    select * from reservation_submission_private.submit(
      ${data.operationId}::uuid, ${data.vehicleId}::uuid, ${data.pickupDate}::date, ${data.returnDate}::date,
      ${data.fullName}::text, ${data.phone}::text, ${data.email}::text, ${data.city}::text,
      ${data.hasDefinitiveLicense}::boolean, ${data.usagePurpose}::text, ${data.hasEar}::boolean,
      ${data.driverPlatform}::text, ${data.preferredContactTime}::text)`;
  const counts = async (operationId = input.operationId) => {
    const [row] = await admin`select
      (select count(*)::int from rental_leads where operation_id = ${operationId}) as leads,
      (select count(*)::int from reservation_requests where operation_id = ${operationId}) as requests,
      (select count(*)::int from notification_outbox where event_type = 'reservation.requested'
        and reservation_request_id in (select id from reservation_requests where operation_id = ${operationId})) as events,
      (select count(*)::int from vehicle_schedule_blocks where reservation_request_id in
        (select id from reservation_requests where operation_id = ${operationId})) as blocks`;
    return row;
  };
  const empty = { leads: 0, requests: 0, events: 0, blocks: 0 };
  const complete = { leads: 1, requests: 1, events: 1, blocks: 0 };
  const block = (client: ReturnType<typeof postgres> | postgres.TransactionSql, pickup = input.pickupDate, end = input.returnDate) => client`
    insert into vehicle_schedule_blocks (organization_id, vehicle_id, kind, pickup_date, return_date)
      values (${org}, ${vehicle}, 'manual', ${pickup}::date, ${end}::date)`;

  beforeAll(async () => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    admin = postgres(testDatabaseUrl, { max: 2 });
    runtime = postgres(testDatabaseUrl, { max: 1, connection: { application_name: "reservation_submission_runtime_a" } });
    concurrent = postgres(testDatabaseUrl, { max: 1, connection: { application_name: "reservation_submission_runtime_b" } });
    await runtime`set role lead_intake_runtime`;
    await concurrent`set role lead_intake_runtime`;
    getDatabase.mockReturnValue(drizzle(runtime));
    const [existing] = await admin`select id from organizations where id = ${org}`;
    if (!existing) {
      await admin`insert into organizations (id, name, slug) values (${org}, 'Demo sintética', ${crypto.randomUUID()})`;
      createdOrg = true;
    }
    await admin`insert into organizations (id, name, slug) values (${otherOrg}, 'Outra sintética', ${crypto.randomUUID()})`;
  });
  beforeEach(async () => {
    vehicle = crypto.randomUUID();
    input = { operationId: crypto.randomUUID(), vehicleId: vehicle, pickupDate: "2028-05-10", returnDate: "2028-05-15",
      fullName: "Pessoa Sintética", phone: "11999999999", email: "submission@example.test", city: "Cidade Sintética",
      hasDefinitiveLicense: true, usagePurpose: "other", hasEar: null, driverPlatform: null, preferredContactTime: null };
    operations.push(input.operationId);
    await admin`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status, operational_status, is_demo)
      values (${vehicle}, ${org}, 'Marca', 'Sintético', 2024, 'Prata', 70000, 'available', 'active', true)`;
  });
  afterEach(async () => {
    await admin.begin(async (tx) => {
      await tx`delete from notification_outbox where reservation_request_id in (select id from reservation_requests where vehicle_id = ${vehicle})`;
      await tx`delete from vehicle_schedule_blocks where vehicle_id = ${vehicle}`;
      await tx`delete from reservation_requests where vehicle_id = ${vehicle}`;
      await tx`delete from rental_leads where operation_id = any(${operations}::uuid[])`;
      await tx`delete from vehicles where id = ${vehicle}`;
    });
  });
  afterAll(async () => {
    await admin`delete from organizations where id = ${otherOrg}`;
    if (createdOrg) await admin`delete from organizations where id = ${org}`;
    await Promise.all([admin.end(), runtime.end(), concurrent.end()]);
  });

  it("repository e caso de uso reais confirmam 1 lead / 1 requested / 1 evento / 0 blocos", async () => {
    const result = await submitReservationRequest(reservationSubmissionRepository, { verify: async () => true }, {
      ...input, email: input.email!, hasDefinitiveLicense: "yes", hasEar: "not_applicable", driverPlatform: "", preferredContactTime: "",
      turnstileToken: "synthetic", turnstileIdempotencyKey: crypto.randomUUID(), website: "",
      eligibilityAcknowledgement: "accepted", acknowledgement: "accepted",
    });
    expect(result.status).toBe("success");
    expect(await counts()).toEqual(complete);
    const [request] = await admin`select status, lead_id from reservation_requests where operation_id = ${input.operationId}`;
    expect(result).toMatchObject({ leadId: request.lead_id, requestStatus: request.status });
  });

  it.each([true, false])("restaura validação diferida na transação chamadora (reparar antes do commit: %s)", async (repair) => {
    let subsequentUpdateCompleted = false;
    const transaction = admin.begin("isolation level read committed", async (tx) => {
      await tx`set local role lead_intake_runtime`;
      const [receipt] = await call(tx);
      await tx`reset role`;

      // Subsequent administrative work may temporarily violate the deferred
      // invariant, provided it repairs the schedule before committing.
      await tx`update reservation_requests set status = 'approved', decided_by = ${crypto.randomUUID()}
        where id = ${receipt.reservation_request_id}`;
      await tx`delete from vehicle_schedule_blocks where reservation_request_id = ${receipt.reservation_request_id}`;
      await tx`update reservation_requests set request_notes = 'Ajuste sintético na mesma transação'
        where id = ${receipt.reservation_request_id}`;
      subsequentUpdateCompleted = true;

      if (repair) {
        await tx`insert into vehicle_schedule_blocks
          (organization_id, vehicle_id, reservation_request_id, kind, pickup_date, return_date)
          values (${org}, ${vehicle}, ${receipt.reservation_request_id}, 'reservation',
            ${input.pickupDate}::date, ${input.returnDate}::date)`;
      }
    });

    if (repair) await transaction;
    else await expect(transaction).rejects.toMatchObject({ code: "23514", message: "reservation_schedule_inconsistent" });
    expect(subsequentUpdateCompleted).toBe(true);
    expect(await counts()).toEqual(repair ? { ...complete, blocks: 1 } : empty);
  });

  it("retry sequencial preserva o recibo mesmo após inativação e aprovação", async () => {
    const [first] = await call(runtime);
    await admin`update reservation_requests set status = 'approved', decided_by = ${crypto.randomUUID()} where id = ${first.reservation_request_id}`;
    await admin`update vehicles set operational_status = 'inactive' where id = ${vehicle}`;
    expect(await call(runtime)).toEqual([first]);
    expect(await counts()).toEqual({ ...complete, blocks: 1 });
  });

  it("retry sequencial pending mantém exatamente 1/1/1", async () => {
    const first = await call(runtime);
    expect(await call(runtime)).toEqual(first);
    expect(await counts()).toEqual(complete);
  });

  it("retry concorrente com duas conexões mantém exatamente 1/1/1 e IDs iguais", async () => {
    const [first, second] = await Promise.all([call(runtime), call(concurrent)]);
    expect(second).toEqual(first);
    expect(await counts()).toEqual(complete);
  });

  it("reaproveita o ID real de lead previamente persistido pelo intake", async () => {
    const leadId = crypto.randomUUID();
    await admin`insert into rental_leads (id, operation_id, organization_id, vehicle_id, full_name, phone, email, city,
      has_definitive_license, usage_purpose) values (${leadId}, ${input.operationId}, ${org}, ${vehicle}, ${input.fullName},
      ${input.phone}, ${input.email}, ${input.city}, true, 'other')`;
    const [result] = await call(runtime);
    expect(result.lead_id).toBe(leadId);
    expect(await counts()).toEqual(complete);
  });

  it.each(["period", "vehicle", "lead"])("reutilização incompatível de operação (%s) falha sem alterar o original", async (kind) => {
    const first = await call(runtime);
    const changed = { ...input };
    if (kind === "period") changed.returnDate = "2028-05-16";
    if (kind === "lead") changed.phone = "11988888888";
    if (kind === "vehicle") {
      // An existing vehicle from the same org is required to test the identity conflict.
      const other = crypto.randomUUID();
      await admin`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status, operational_status, is_demo)
        values (${other}, ${org}, 'Marca', 'Outro', 2024, 'Prata', 70000, 'available', 'active', true)`;
      changed.vehicleId = other;
      try { await expect(call(runtime, changed)).rejects.toMatchObject({ code: "P1003" }); }
      finally { await admin`delete from vehicles where id = ${other}`; }
    } else {
      await expect(call(runtime, changed)).rejects.toMatchObject({ code: "P1003" });
    }
    expect(await call(runtime)).toEqual(first);
    expect(await counts()).toEqual(complete);
  });

  it("conflito concorrente de período confirma somente uma solicitação", async () => {
    const results = await Promise.allSettled([call(runtime), call(concurrent, { ...input, returnDate: "2028-05-16" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "P1003" } });
    expect(await counts()).toEqual(complete);
  });

  it("mudança após consulta de disponibilidade não deixa persistência parcial", async () => {
    expect(await runtime`select availability_private.is_demo_vehicle_available(${vehicle}::uuid, ${input.pickupDate}::date, ${input.returnDate}::date) as available`)
      .toEqual([{ available: true }]);
    await block(admin);
    expect(await reservationSubmissionRepository.submit(input)).toEqual({ status: "unavailable" });
    expect(await counts()).toEqual(empty);
  });

  it.each(["block", "inactive"])("observa %s confirmado enquanto submit aguarda o lock", async (kind) => {
    let pending!: Promise<unknown>;
    await admin.begin(async (tx) => {
      if (kind === "block") await block(tx);
      else await tx`update vehicles set operational_status = 'inactive' where id = ${vehicle}`;
      pending = Promise.resolve(call(runtime)).then(
        (value) => ({ value }), (error: unknown) => ({ error }),
      );
      await vi.waitFor(async () => {
        const [row] = await admin`select count(*)::int as count from pg_stat_activity
          where application_name = 'reservation_submission_runtime_a' and wait_event_type = 'Lock'`;
        expect(row.count).toBe(1);
      });
    });
    expect(await pending).toMatchObject({ error: { code: "P1002" } });
    expect(await counts()).toEqual(empty);
  });

  it("escritor de agenda espera submit que obteve o lock primeiro", async () => {
    let pending!: Promise<unknown>;
    await runtime.begin(async (tx) => {
      await tx`select * from reservation_submission_private.submit(
        ${input.operationId}::uuid, ${vehicle}::uuid, ${input.pickupDate}::date, ${input.returnDate}::date,
        ${input.fullName}, ${input.phone}, ${input.email}, ${input.city}, true, 'other', null, null, null)`;
      pending = Promise.resolve(block(admin)).then(
        (value) => ({ value }), (error: unknown) => ({ error }),
      );
      await vi.waitFor(async () => {
        const [row] = await admin`select count(*)::int as count from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
            and query like '%%insert into vehicle_schedule_blocks%%'`;
        expect(row.count).toBeGreaterThan(0);
      });
    });
    expect(await pending).toHaveProperty("value");
    expect(await counts()).toEqual(complete);
    // Pending submission is not allocation: a later block remains valid.
    expect(await admin`select id from vehicle_schedule_blocks where vehicle_id = ${vehicle}`).toHaveLength(1);
  });

  it("intervalos adjacentes são aceitos ([retirada, devolução))", async () => {
    await block(admin, "2028-05-05", "2028-05-10");
    await block(admin, "2028-05-15", "2028-05-20");
    expect(await reservationSubmissionRepository.submit(input)).toMatchObject({ status: "success" });
    expect(await counts()).toEqual(complete);
  });

  it.each(["inactive", "legacy", "non-demo", "other-org", "missing"])("veículo %s falha fechado sem novas linhas", async (kind) => {
    if (kind === "inactive") await admin`update vehicles set operational_status = 'inactive' where id = ${vehicle}`;
    if (kind === "legacy") await admin`update vehicles set status = 'rented' where id = ${vehicle}`;
    if (kind === "non-demo") await admin`update vehicles set is_demo = false where id = ${vehicle}`;
    if (kind === "other-org") await admin`update vehicles set organization_id = ${otherOrg} where id = ${vehicle}`;
    if (kind === "missing") input.vehicleId = crypto.randomUUID();
    await expect(call(runtime)).rejects.toMatchObject({ code: "P1002" });
    expect(await counts()).toEqual(empty);
  });

  it.each([["2028-05-15", "2028-05-15"], ["2028-05-16", "2028-05-15"], ["-infinity", "2028-05-15"], ["2028-05-10", "infinity"]])(
    "período inválido %s / %s falha no PostgreSQL", async (pickupDate, returnDate) => {
      await expect(call(runtime, { ...input, pickupDate, returnDate })).rejects.toMatchObject({ code: "P1001" });
      expect(await counts()).toEqual(empty);
    },
  );

  it.each(["reservation", "outbox", "missing-event"])("falha em %s reverte também o lead", async (stage) => {
    const table = stage === "reservation" ? "reservation_requests" : "notification_outbox";
    await admin.unsafe(`create function public.synthetic_submission_failure() returns trigger language plpgsql as $$
      begin ${stage === "missing-event" ? "return null;" : "raise exception 'synthetic_failure' using errcode = '23514';"} end; $$`);
    await admin.unsafe(`create trigger synthetic_submission_failure before insert on public.${table} for each row execute function public.synthetic_submission_failure()`);
    try {
      await expect(call(runtime)).rejects.toMatchObject({ code: stage === "missing-event" ? "P1004" : "23514" });
      expect(await counts()).toEqual(empty);
    } finally {
      await admin.unsafe(`drop trigger synthetic_submission_failure on public.${table}`);
      await admin`drop function public.synthetic_submission_failure()`;
    }
  });

  it("não impõe unicidade geral por lead", async () => {
    const [first] = await call(runtime);
    await admin`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${org}, ${vehicle}, ${first.lead_id}, '2028-06-01', '2028-06-05')`;
    expect(await admin`select id from reservation_requests where lead_id = ${first.lead_id}`).toHaveLength(2);
  });

  it("runtime só recebe EXECUTE e nenhuma leitura/escrita direta nas tabelas privadas", async () => {
    for (const table of ["reservation_requests", "vehicle_schedule_blocks", "notification_outbox", "waitlist_entries"]) {
      const [permissions] = await runtime`select has_table_privilege(current_user, ${`public.${table}`}, 'SELECT') as read,
        has_any_column_privilege(current_user, ${`public.${table}`}, 'INSERT') as write`;
      expect(permissions).toEqual({ read: false, write: false });
      await expect(runtime.unsafe(`select * from public.${table}`)).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.unsafe(`insert into public.${table} default values`)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(runtime`select * from rental_leads`).rejects.toMatchObject({ code: "42501" });
    const [fn] = await admin`select prosecdef, proconfig from pg_proc where oid = ${signature}::regprocedure`;
    expect(fn).toEqual({ prosecdef: true, proconfig: ['search_path=""'] });
    expect(await runtime`select has_function_privilege(current_user, ${signature}, 'EXECUTE') as allowed`).toEqual([{ allowed: true }]);
  });

  it.each(["anon", "authenticated"])("%s não executa a fronteira", async (role) => {
    await concurrent.unsafe(`set role ${role}`);
    try {
      expect(await admin`select has_function_privilege(${role}, ${signature}, 'EXECUTE') as allowed`).toEqual([{ allowed: false }]);
      await expect(call(concurrent)).rejects.toMatchObject({ code: "42501" });
    } finally { await concurrent`set role lead_intake_runtime`; }
  });
});
