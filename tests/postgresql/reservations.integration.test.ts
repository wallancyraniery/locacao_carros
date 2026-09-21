import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

const tables = ["reservation_requests", "vehicle_schedule_blocks", "waitlist_entries", "notification_outbox"];
const actor = crypto.randomUUID();

describe("Reservas e disponibilidade: invariantes PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  let concurrent: ReturnType<typeof postgres>;
  let observer: ReturnType<typeof postgres>;
  let orgs: string[], vehicles: string[], leads: string[];

  beforeAll(() => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
    concurrent = postgres(testDatabaseUrl, { max: 1 });
    observer = postgres(testDatabaseUrl, { max: 1 });
  });
  beforeEach(async () => {
    orgs = [crypto.randomUUID(), crypto.randomUUID()];
    vehicles = [crypto.randomUUID(), crypto.randomUUID()];
    leads = [crypto.randomUUID(), crypto.randomUUID()];
    for (let i = 0; i < 2; i++) {
      await sql`insert into organizations (id, name, slug) values (${orgs[i]}, 'Locadora sintética', ${`reservation_${orgs[i]}`})`;
      await sql`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status, operational_status)
        values (${vehicles[i]}, ${orgs[i]}, 'Marca sintética', 'Modelo', 2024, 'Prata', 70000, 'available', 'active')`;
      await sql`insert into rental_leads (id, operation_id, organization_id, full_name, phone, city, has_definitive_license)
        values (${leads[i]}, ${crypto.randomUUID()}, ${orgs[i]}, 'Pessoa sintética', '000000000', 'Cidade sintética', true)`;
    }
  });
  afterEach(async () => {
    await sql`reset role`;
    await sql.begin(async (tx) => {
      await tx`delete from notification_outbox where organization_id = any(${orgs}::uuid[])`;
      await tx`delete from vehicle_schedule_blocks where organization_id = any(${orgs}::uuid[])`;
      await tx`delete from reservation_requests where organization_id = any(${orgs}::uuid[])`;
      await tx`delete from waitlist_entries where organization_id = any(${orgs}::uuid[])`;
      await tx`delete from rental_leads where organization_id = any(${orgs}::uuid[])`;
      await tx`delete from vehicles where organization_id = any(${orgs}::uuid[])`;
      await tx`delete from organizations where id = any(${orgs}::uuid[])`;
    });
  });
  afterAll(async () => { await Promise.all([sql?.end(), concurrent?.end(), observer?.end()]); });

  async function request(pickup = "2027-01-10", end = "2027-01-15", tenant = 0) {
    const [row] = await sql`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${orgs[tenant]}, ${vehicles[tenant]}, ${leads[tenant]}, ${pickup}::text::date, ${end}::text::date) returning id`;
    return row.id as string;
  }
  async function approve(id: string) {
    await sql`update reservation_requests set status = 'approved', decided_by = ${actor}, decision_reason = 'Análise sintética concluída' where id = ${id}`;
  }
  async function cancel(id: string) {
    await sql`update reservation_requests set status = 'cancelled', cancelled_by = ${actor} where id = ${id}`;
  }
  async function block(pickup: string, end: string, kind = "manual", tenant = 0) {
    const [row] = await sql`insert into vehicle_schedule_blocks (organization_id, vehicle_id, kind, pickup_date, return_date)
      values (${orgs[tenant]}, ${vehicles[tenant]}, ${kind}, ${pickup}::text::date, ${end}::text::date) returning id`;
    return row.id as string;
  }
  async function activeBlocks() {
    return sql`select id from vehicle_schedule_blocks where organization_id = ${orgs[0]} and status = 'active'`;
  }
  async function waitUntilBlocked(applicationName: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [activity] = await observer`select wait_event_type from pg_stat_activity where application_name = ${applicationName}`;
      if (activity?.wait_event_type === "Lock") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Transação ${applicationName} não aguardou lock`);
  }

  it.each(["reservation_requests", "vehicle_schedule_blocks", "waitlist_entries"])("%s exige intervalo finito e estritamente positivo", async (table) => {
    const insert = (pickup: string, end: string) => {
      if (table === "reservation_requests") return request(pickup, end);
      if (table === "vehicle_schedule_blocks") return block(pickup, end);
      return sql`insert into waitlist_entries (organization_id, vehicle_id, lead_id, pickup_date, return_date)
        values (${orgs[0]}, ${vehicles[0]}, ${leads[0]}, ${pickup}::text::date, ${end}::text::date)`;
    };
    await insert("2027-01-10", "2027-01-11");
    for (const [pickup, end] of [["2027-02-10", "2027-02-10"], ["2027-02-11", "2027-02-10"], ["2027-02-10", "infinity"], ["-infinity", "2027-02-10"]]) {
      await expect(insert(pickup, end)).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|22000)$/) });
    }
  });

  it("cria solicitação e um único evento requested pending atomicamente", async () => {
    const id = await request();
    expect(await sql`select event_type, status, attempts from notification_outbox where reservation_request_id = ${id}`)
      .toEqual([{ event_type: "reservation.requested", status: "pending", attempts: 0 }]);
    await expect(sql`insert into notification_outbox (organization_id, reservation_request_id, event_type)
      values (${orgs[0]}, ${id}, 'reservation.requested')`).rejects.toMatchObject({ code: "23505" });
    await expect(sql`insert into reservation_requests (id, organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${id}, ${orgs[0]}, ${vehicles[0]}, ${leads[0]}, '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23505" });
    expect(await sql`select id from notification_outbox where reservation_request_id = ${id}`).toHaveLength(1);
    expect(await activeBlocks()).toHaveLength(0);
  });

  it("falha ao persistir requested desfaz o INSERT inteiro da solicitação", async () => {
    const id = crypto.randomUUID();
    const rollback = new Error("rollback synthetic constraint");
    await expect(sql.begin(async (tx) => {
      await tx`alter table notification_outbox add constraint test_requested_outbox_failure check (event_type <> 'reservation.requested') not valid`;
      await expect(tx.savepoint(async (sp) => {
        await sp`insert into reservation_requests (id, organization_id, vehicle_id, lead_id, pickup_date, return_date)
          values (${id}, ${orgs[0]}, ${vehicles[0]}, ${leads[0]}, '2027-01-10', '2027-01-15')`;
      })).rejects.toMatchObject({ code: "23514", constraint_name: "test_requested_outbox_failure" });
      expect(await tx`select id from reservation_requests where id = ${id}`).toHaveLength(0);
      expect(await tx`select id from notification_outbox where reservation_request_id = ${id}`).toHaveLength(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it("permite solicitações pendentes e lista de espera sobrepostas sem bloquear", async () => {
    await request(); await request();
    await sql`insert into waitlist_entries (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[0]}, ${leads[0]}, '2027-01-10', '2027-01-15')`;
    expect(await activeBlocks()).toHaveLength(0);
    expect(await sql`select event_type from notification_outbox where organization_id = ${orgs[0]}`).toEqual([{ event_type: "reservation.requested" }, { event_type: "reservation.requested" }]);
    await block("2027-01-10", "2027-01-15");
    await request(); // An existing block does not prohibit requesting a human decision.
  });

  it("aprova atomicamente e rejeita outra aprovação sobreposta sem efeitos parciais", async () => {
    const first = await request(), second = await request();
    await approve(first);
    await expect(approve(second)).rejects.toMatchObject({ code: "23P01", constraint_name: "vehicle_schedule_blocks_no_active_overlap" });
    const [state] = await sql`select status, decided_at, decided_by from reservation_requests where id = ${second}`;
    expect(state).toEqual({ status: "requested", decided_at: null, decided_by: null });
    expect(await activeBlocks()).toHaveLength(1);
    expect(await sql`select id from notification_outbox where reservation_request_id = ${second} and event_type = 'reservation.approved'`).toHaveLength(0);
    await approve(first); // Same-state retry does not create another block/event.
    expect(await sql`select id from notification_outbox where reservation_request_id = ${first} and event_type = 'reservation.approved'`).toHaveLength(1);
  });

  it("recusa aprovação quando o veículo está estruturalmente inativo", async () => {
    const id = await request();
    await sql`update vehicles set operational_status = 'inactive' where id = ${vehicles[0]}`;
    await expect(approve(id)).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("reservation_vehicle_not_active") });
    expect(await sql`select status from reservation_requests where id = ${id}`).toEqual([{ status: "requested" }]);
    expect(await activeBlocks()).toHaveLength(0);
    expect(await sql`select id from notification_outbox where reservation_request_id = ${id} and event_type = 'reservation.approved'`).toHaveLength(0);
  });

  it("aprovação e cancelamento preservam operational_status", async () => {
    const id = await request();
    await approve(id);
    expect(await sql`select operational_status from vehicles where id = ${vehicles[0]}`).toEqual([{ operational_status: "active" }]);
    await cancel(id);
    expect(await sql`select operational_status from vehicles where id = ${vehicles[0]}`).toEqual([{ operational_status: "active" }]);
  });

  it.each(["maintenance", "preparation", "manual"])("bloqueio %s também impede aprovação e outro bloco sobreposto", async (kind) => {
    await block("2027-01-10", "2027-01-15", kind);
    await expect(approve(await request())).rejects.toMatchObject({ code: "23P01" });
    await expect(block("2027-01-14", "2027-01-17")).rejects.toMatchObject({ code: "23P01" });
  });

  it("permite intervalos adjacentes nos dois limites de [pickup, return)", async () => {
    await approve(await request());
    await approve(await request("2027-01-15", "2027-01-20"));
    await block("2027-01-05", "2027-01-10");
    expect(await activeBlocks()).toHaveLength(3);
  });

  it("não conflita entre veículos de organizações diferentes", async () => {
    await approve(await request());
    await approve(await request("2027-01-10", "2027-01-15", 1));
    const rows = await sql`select organization_id, vehicle_id from vehicle_schedule_blocks where organization_id = any(${orgs}::uuid[]) order by organization_id`;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.vehicle_id).toBe(vehicles[orgs.indexOf(row.organization_id)]);
  });

  it("recusa veículo e lead de outra locadora em todas as referências novas", async () => {
    await expect(sql`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[1]}, ${leads[0]}, '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23503" });
    await expect(sql`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[0]}, ${leads[1]}, '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23503" });
    await expect(sql`insert into vehicle_schedule_blocks (organization_id, vehicle_id, kind, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[1]}, 'manual', '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23503" });
    for (const [vehicle, lead] of [[vehicles[1], leads[0]], [vehicles[0], leads[1]]]) {
      await expect(sql`insert into waitlist_entries (organization_id, vehicle_id, lead_id, pickup_date, return_date)
        values (${orgs[0]}, ${vehicle}, ${lead}, '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23503" });
    }
    const other = await request("2027-01-10", "2027-01-15", 1);
    await expect(sql`insert into notification_outbox (organization_id, reservation_request_id, event_type)
      values (${orgs[0]}, ${other}, 'reservation.approved')`).rejects.toMatchObject({ code: "23503" });
    await expect(sql`insert into vehicle_schedule_blocks (organization_id, vehicle_id, reservation_request_id, kind, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[0]}, ${other}, 'reservation', '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23503" });
  });

  it("cancelamento preserva decisão e histórico, libera somente seu bloco e não reserva para a fila", async () => {
    const first = await request();
    await approve(first);
    await block("2027-02-01", "2027-02-05", "maintenance");
    await sql`insert into waitlist_entries (organization_id, vehicle_id, lead_id, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[0]}, ${leads[0]}, '2027-01-10', '2027-01-15')`;
    await cancel(first);
    const [row] = await sql`select r.status, r.decided_by, r.cancelled_by, b.status as block_status, b.released_at
      from reservation_requests r join vehicle_schedule_blocks b on b.reservation_request_id = r.id where r.id = ${first}`;
    expect(row).toMatchObject({ status: "cancelled", decided_by: actor, cancelled_by: actor, block_status: "released", released_at: expect.any(Date) });
    expect(await activeBlocks()).toHaveLength(1);
    expect(await sql`select status from waitlist_entries where organization_id = ${orgs[0]}`).toEqual([{ status: "waiting" }]);
    await approve(await request());
    expect(await activeBlocks()).toHaveLength(2);
    await expect(approve(first)).rejects.toMatchObject({ code: "23514" });
  });

  it("libera bloqueio manual e impede reativação do histórico", async () => {
    const id = await block("2027-01-10", "2027-01-15");
    await sql`update vehicle_schedule_blocks set status = 'released', released_at = now() where id = ${id}`;
    await approve(await request());
    await expect(sql`update vehicle_schedule_blocks set status = 'active', released_at = null where id = ${id}`).rejects.toMatchObject({ code: "23514" });
  });

  it("impede apagar o bloco released enquanto a reserva cancelada histórica existe", async () => {
    const id = await request(); await approve(id); await cancel(id);
    const before = await sql`select id, status, released_at from vehicle_schedule_blocks where reservation_request_id = ${id}`;
    await expect(sql`delete from vehicle_schedule_blocks where reservation_request_id = ${id}`).rejects.toMatchObject({ code: "23514" });
    expect(await sql`select id, status, released_at from vehicle_schedule_blocks where reservation_request_id = ${id}`).toEqual(before);
    expect(before[0].status).toBe("released");
  });

  it("cancelar duas vezes preserva bloco, released_at e um único evento de cancelamento", async () => {
    const id = await request(); await approve(id); await cancel(id);
    const before = await sql`select id, status, released_at::text from vehicle_schedule_blocks where reservation_request_id = ${id}`;
    // Different transaction_timestamp on the second call; compare the exact stored value.
    await cancel(id);
    expect(await sql`select status from reservation_requests where id = ${id}`).toEqual([{ status: "cancelled" }]);
    expect(await sql`select id, status, released_at::text from vehicle_schedule_blocks where reservation_request_id = ${id}`).toEqual(before);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ status: "released", released_at: expect.any(String) });
    expect(await sql`select id from notification_outbox where reservation_request_id = ${id} and event_type = 'reservation.cancelled'`).toHaveLength(1);
  });

  it("rejeição e cancelamento pendente não criam agenda; estados finais não reabrem", async () => {
    const rejected = await request(), cancelled = await request();
    await expect(sql`update reservation_requests set status = 'rejected', decided_by = ${actor} where id = ${rejected}`).rejects.toMatchObject({ code: "23514" });
    await sql`update reservation_requests set status = 'rejected', decided_by = ${actor}, decision_reason = 'Motivo sintético' where id = ${rejected}`;
    await cancel(cancelled);
    expect(await activeBlocks()).toHaveLength(0);
    await expect(approve(rejected)).rejects.toMatchObject({ code: "23514" });
    await expect(sql`update reservation_requests set status = 'requested' where id = ${cancelled}`).rejects.toMatchObject({ code: "23514" });
  });

  it("não permite aprovar sem autor nem inserir uma reserva já aprovada", async () => {
    const id = await request();
    await expect(sql`update reservation_requests set status = 'approved' where id = ${id}`).rejects.toMatchObject({ code: "23514" });
    await expect(sql`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date, status, decided_by, decided_at)
      values (${orgs[0]}, ${vehicles[0]}, ${leads[0]}, '2027-01-10', '2027-01-15', 'approved', ${actor}, now())`).rejects.toMatchObject({ code: "23514" });
  });

  it("escrita direta não separa uma reserva aprovada de sua agenda", async () => {
    const id = await request(); await approve(id);
    await expect(sql`update vehicle_schedule_blocks set status = 'released', released_at = now() where reservation_request_id = ${id}`).rejects.toMatchObject({ code: "23514" });
    await expect(sql`delete from vehicle_schedule_blocks where reservation_request_id = ${id}`).rejects.toMatchObject({ code: "23514" });
    await expect(sql`update reservation_requests set return_date = '2027-01-16' where id = ${id}`).rejects.toMatchObject({ code: "23514" });
    await expect(sql`update vehicle_schedule_blocks set pickup_date = '2027-01-11' where reservation_request_id = ${id}`).rejects.toMatchObject({ code: "23514" });
    expect(await activeBlocks()).toHaveLength(1);
  });

  it("recusa bloco de reserva solicitado ou com veículo/período divergente", async () => {
    const id = await request();
    await expect(sql`insert into vehicle_schedule_blocks (organization_id, vehicle_id, reservation_request_id, kind, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[0]}, ${id}, 'reservation', '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23514" });
    await approve(id); await cancel(id);
    await expect(sql.begin(async (tx) => {
      await tx`delete from vehicle_schedule_blocks where reservation_request_id = ${id}`;
      await tx`insert into vehicle_schedule_blocks (organization_id, vehicle_id, reservation_request_id, kind, pickup_date, return_date, status, released_at)
        values (${orgs[0]}, ${vehicles[0]}, ${id}, 'reservation', '2027-01-11', '2027-01-15', 'released', now())`;
    })).rejects.toMatchObject({ code: "23514" });
    const alternative = crypto.randomUUID();
    await sql`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status, operational_status)
      values (${alternative}, ${orgs[0]}, 'Marca sintética', 'Alternativo', 2024, 'Prata', 70000, 'available', 'active')`;
    await expect(sql.begin(async (tx) => {
      await tx`delete from vehicle_schedule_blocks where reservation_request_id = ${id}`;
      await tx`insert into vehicle_schedule_blocks (organization_id, vehicle_id, reservation_request_id, kind, pickup_date, return_date, status, released_at)
        values (${orgs[0]}, ${alternative}, ${id}, 'reservation', '2027-01-10', '2027-01-15', 'released', now())`;
    })).rejects.toMatchObject({ code: "23514" });
  });

  it("outbox permite falha e retry após commit sem invalidar reserva ou duplicar evento", async () => {
    const id = await request(); await approve(id);
    await sql`update notification_outbox set status = 'processing', locked_at = now(), attempts = attempts + 1 where reservation_request_id = ${id} and event_type = 'reservation.approved'`;
    await sql`update notification_outbox set status = 'failed', locked_at = null, last_error_code = 'provider_unavailable', available_at = now() + interval '5 minutes' where reservation_request_id = ${id} and event_type = 'reservation.approved'`;
    expect(await sql`select status from reservation_requests where id = ${id}`).toEqual([{ status: "approved" }]);
    expect(await activeBlocks()).toHaveLength(1);
    await sql`update notification_outbox set status = 'processing', locked_at = now(), attempts = attempts + 1 where reservation_request_id = ${id} and event_type = 'reservation.approved'`;
    await sql`update notification_outbox set status = 'sent', locked_at = null, sent_at = now(), last_error_code = null where reservation_request_id = ${id} and event_type = 'reservation.approved'`;
    expect(await sql`select status, attempts from notification_outbox where reservation_request_id = ${id} and event_type = 'reservation.approved'`).toEqual([{ status: "sent", attempts: 2 }]);
    await expect(sql`insert into notification_outbox (organization_id, reservation_request_id, event_type)
      values (${orgs[0]}, ${id}, 'reservation.approved')`).rejects.toMatchObject({ code: "23505" });
    await expect(sql`update notification_outbox set last_error_code = 'raw provider response' where reservation_request_id = ${id} and event_type = 'reservation.approved'`).rejects.toMatchObject({ code: "23514" });
  });

  it("rollback da transação desfaz aprovação, agenda e outbox juntos", async () => {
    const id = await request();
    const rollback = new Error("synthetic rollback");
    await expect(sql.begin(async (tx) => {
      await tx`update reservation_requests set status = 'approved', decided_by = ${actor} where id = ${id}`;
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await sql`select status from reservation_requests where id = ${id}`).toEqual([{ status: "requested" }]);
    expect(await activeBlocks()).toHaveLength(0);
    expect(await sql`select event_type from notification_outbox where reservation_request_id = ${id}`).toEqual([{ event_type: "reservation.requested" }]);
  });

  it("lista de espera exige veículo OU preferência e não cria reserva automaticamente", async () => {
    await sql`insert into waitlist_entries (organization_id, vehicle_preference, lead_id, pickup_date, return_date)
      values (${orgs[0]}, 'Hatch compacto', ${leads[0]}, '2027-01-10', '2027-01-15')`;
    await expect(sql`insert into waitlist_entries (organization_id, lead_id, pickup_date, return_date)
      values (${orgs[0]}, ${leads[0]}, '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23514" });
    await expect(sql`insert into waitlist_entries (organization_id, vehicle_id, vehicle_preference, lead_id, pickup_date, return_date)
      values (${orgs[0]}, ${vehicles[0]}, 'Hatch', ${leads[0]}, '2027-01-10', '2027-01-15')`).rejects.toMatchObject({ code: "23514" });
    expect(await sql`select id from reservation_requests where organization_id = ${orgs[0]}`).toHaveLength(0);
  });

  it("duas transações concorrentes não aprovam o mesmo veículo/período", async () => {
    const ids = [await request(), await request()];
    let arrived = 0;
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => { openGate = resolve; });
    const run = (client: typeof sql, id: string) => client.begin(async (tx) => {
      await tx`set local statement_timeout = '4s'`;
      await tx`select id from reservation_requests where id = ${id} for update`;
      if (++arrived === 2) openGate();
      await gate;
      await tx`update reservation_requests set status = 'approved', decided_by = ${actor} where id = ${id}`;
    });
    const results = await Promise.allSettled([run(sql, ids[0]), run(concurrent, ids[1])]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: "23P01" });
    expect(await activeBlocks()).toHaveLength(1);
    expect(await sql`select id from notification_outbox where organization_id = ${orgs[0]} and event_type = 'reservation.approved'`).toHaveLength(1);
  }, 10000);

  it("serializa aprovação e inativação pela ordem do lock do veículo", async () => {
    const rejectedId = await request();
    let releaseInactivation!: () => void;
    const holdInactivation = new Promise<void>((resolve) => { releaseInactivation = resolve; });
    let inactivationLocked!: () => void;
    const inactivationReady = new Promise<void>((resolve) => { inactivationLocked = resolve; });
    const inactivationFirst = sql.begin(async (tx) => {
      await tx`update vehicles set operational_status = 'inactive' where id = ${vehicles[0]}`;
      inactivationLocked();
      await holdInactivation;
    });
    await inactivationReady;
    const blockedApprovalName = `approval_wait_${crypto.randomUUID()}`;
    const approvalAfterInactivation = concurrent.begin(async (tx) => {
      await tx`select set_config('application_name', ${blockedApprovalName}, true)`;
      await tx`set local statement_timeout = '4s'`;
      await tx`update reservation_requests set status = 'approved', decided_by = ${actor} where id = ${rejectedId}`;
    });
    try {
      await waitUntilBlocked(blockedApprovalName);
    } finally {
      releaseInactivation();
    }
    await inactivationFirst;
    await expect(approvalAfterInactivation).rejects.toMatchObject({ code: "23514" });
    expect(await sql`select status from reservation_requests where id = ${rejectedId}`).toEqual([{ status: "requested" }]);

    await sql`update vehicles set operational_status = 'active' where id = ${vehicles[0]}`;
    const approvedId = await request("2027-02-01", "2027-02-05");
    let releaseApproval!: () => void;
    const holdApproval = new Promise<void>((resolve) => { releaseApproval = resolve; });
    let approvalLocked!: () => void;
    const approvalReady = new Promise<void>((resolve) => { approvalLocked = resolve; });
    const approvalFirst = sql.begin(async (tx) => {
      await tx`update reservation_requests set status = 'approved', decided_by = ${actor} where id = ${approvedId}`;
      approvalLocked();
      await holdApproval;
    });
    await approvalReady;
    const blockedInactivationName = `inactivation_wait_${crypto.randomUUID()}`;
    const inactivationAfterApproval = concurrent.begin(async (tx) => {
      await tx`select set_config('application_name', ${blockedInactivationName}, true)`;
      await tx`set local statement_timeout = '4s'`;
      await tx`update vehicles set operational_status = 'inactive' where id = ${vehicles[0]}`;
    });
    try {
      await waitUntilBlocked(blockedInactivationName);
    } finally {
      releaseApproval();
    }
    await Promise.all([approvalFirst, inactivationAfterApproval]);
    expect(await sql`select status from reservation_requests where id = ${approvedId}`).toEqual([{ status: "approved" }]);
    expect(await sql`select operational_status from vehicles where id = ${vehicles[0]}`).toEqual([{ operational_status: "inactive" }]);
    expect(await sql`select status from vehicle_schedule_blocks where reservation_request_id = ${approvedId}`).toEqual([{ status: "active" }]);
  }, 10000);

  it.each(["approved", "cancelled"])("duas tentativas concorrentes de %s sobre a mesma solicitação não duplicam efeitos", async (status) => {
    const id = await request();
    if (status === "cancelled") await approve(id);
    let arrived = 0;
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => { openGate = resolve; });
    const run = (client: typeof sql) => client.begin(async (tx) => {
      await tx`set local statement_timeout = '4s'`;
      // Synchronize before UPDATE: locking the same row before the gate would deadlock the test.
      if (++arrived === 2) openGate();
      await gate;
      if (status === "approved") {
        await tx`update reservation_requests set status = 'approved', decided_by = ${actor} where id = ${id}`;
      } else {
        await tx`update reservation_requests set status = 'cancelled', cancelled_by = ${actor} where id = ${id}`;
      }
    });
    const results = await Promise.allSettled([run(sql), run(concurrent)]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await sql`select status from reservation_requests where id = ${id}`).toEqual([{ status }]);
    expect(await sql`select status from vehicle_schedule_blocks where reservation_request_id = ${id}`)
      .toEqual([{ status: status === "approved" ? "active" : "released" }]);
    expect(await sql`select id from notification_outbox where reservation_request_id = ${id} and event_type = ${`reservation.${status}`}`).toHaveLength(1);
  }, 10000);

  it("RLS habilitado e nenhum grant novo para roles públicas, autenticadas ou intake", async () => {
    const rows = await sql`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any(${tables})`;
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
    for (const role of ["anon", "authenticated", "lead_intake_runtime"]) {
      await sql.unsafe(`set role ${role}`);
      try {
        for (const table of tables) {
          await expect(sql`select id from ${sql(table)}`).rejects.toMatchObject({ code: "42501" });
          for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
            const [row] = await sql`select has_table_privilege(current_user, ${`public.${table}`}, ${privilege}) as allowed`;
            expect(row.allowed).toBe(false);
          }
        }
        const functions = await sql`select p.proname, p.prosecdef, has_function_privilege(current_user, p.oid, 'EXECUTE') as allowed
          from pg_proc p where p.proname = any(${["reservation_request_guard", "reservation_request_effects", "vehicle_schedule_block_guard", "reservation_schedule_consistency", "reservation_auxiliary_update_guard"]})`;
        expect(functions).toHaveLength(5);
        expect(functions.every((f) => !f.allowed && !f.prosecdef)).toBe(true);
      } finally { await sql`reset role`; }
    }
  });

  it("RLS fecha ambas organizações mesmo com grant de leitura acidental", async () => {
    await approve(await request());
    await approve(await request("2027-01-10", "2027-01-15", 1));
    const rollback = new Error("rollback temporary grants");
    await expect(sql.begin(async (tx) => {
      for (const table of tables) await tx`grant select on ${tx(table)} to authenticated`;
      await tx`set local role authenticated`;
      for (const table of tables) expect(await tx`select id from ${tx(table)}`).toHaveLength(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
