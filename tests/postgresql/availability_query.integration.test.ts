import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseTestDatabaseEnvironment } from "@/config/test_database_environment";

describe("consulta booleana de disponibilidade no PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  const demoOrg = "10000000-0000-4000-8000-000000000001";
  const otherOrg = crypto.randomUUID();
  const mainVehicle = crypto.randomUUID();
  const otherVehicle = crypto.randomUUID();
  const foreignVehicle = crypto.randomUUID();
  let createdDemoOrg = false;
  const createdLeadIds: string[] = [];

  const check = (vehicleId: string, pickup = "2027-05-10", end = "2027-05-15") =>
    sql`select availability_private.is_demo_vehicle_available(
      ${vehicleId}::uuid, ${pickup}::date, ${end}::date
    ) as available`;

  const block = (kind: string, pickup = "2027-05-10", end = "2027-05-15", vehicle = mainVehicle) =>
    sql`insert into vehicle_schedule_blocks (organization_id, vehicle_id, kind, pickup_date, return_date)
      values (${demoOrg}, ${vehicle}, ${kind}, ${pickup}::date, ${end}::date) returning id`;

  beforeAll(async () => {
    const { testDatabaseUrl } = parseTestDatabaseEnvironment(process.env);
    sql = postgres(testDatabaseUrl, { max: 1 });
    const [demo] = await sql`select 1 from organizations where id = ${demoOrg}`;
    if (!demo) {
      await sql`insert into organizations (id, name, slug) values (${demoOrg}, 'Demo sintética', ${`availability_${crypto.randomUUID()}`})`;
      createdDemoOrg = true;
    }
    await sql`insert into organizations (id, name, slug) values (${otherOrg}, 'Outra locadora sintética', ${`availability_${otherOrg}`})`;
    await sql`insert into vehicles (id, organization_id, brand, model, year, color, weekly_price_cents, status, operational_status, is_demo) values
      (${mainVehicle}, ${demoOrg}, 'Marca', 'Principal', 2024, 'Prata', 70000, 'available', 'active', true),
      (${otherVehicle}, ${demoOrg}, 'Marca', 'Outro', 2024, 'Prata', 70000, 'available', 'active', true),
      (${foreignVehicle}, ${otherOrg}, 'Marca', 'Externo', 2024, 'Prata', 70000, 'available', 'active', true)`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`reset role`;
    await sql.begin(async (tx) => {
      await tx`delete from notification_outbox
        where reservation_request_id in (
          select id from reservation_requests
          where vehicle_id in (${mainVehicle}, ${otherVehicle})
        )`;
      await tx`delete from vehicle_schedule_blocks
        where vehicle_id in (${mainVehicle}, ${otherVehicle})`;
      await tx`delete from reservation_requests
        where vehicle_id in (${mainVehicle}, ${otherVehicle})`;
      if (createdLeadIds.length > 0) {
        await tx`delete from rental_leads where id = any(${createdLeadIds}::uuid[])`;
      }
      await tx`delete from vehicles
        where id in (${mainVehicle}, ${otherVehicle}, ${foreignVehicle})`;
      await tx`delete from organizations where id = ${otherOrg}`;
      if (createdDemoOrg) {
        await tx`delete from organizations where id = ${demoOrg}`;
      }
    });
    await sql.end();
  });

  it("aceita veículo ativo sem bloco e recusa estado estrutural ou legado incompatível", async () => {
    expect(await check(mainVehicle)).toEqual([{ available: true }]);
    await sql`update vehicles set operational_status = 'inactive' where id = ${mainVehicle}`;
    expect(await check(mainVehicle)).toEqual([{ available: false }]);
    await sql`update vehicles set operational_status = 'active', status = 'inactive' where id = ${mainVehicle}`;
    expect(await check(mainVehicle)).toEqual([{ available: false }]);
    await sql`update vehicles set status = 'available' where id = ${mainVehicle}`;
  });

  it("recusa datas inválidas e intervalos vazios sem exceção", async () => {
    expect(await check(mainVehicle, "2027-05-15", "2027-05-15")).toEqual([{ available: false }]);
    expect(await check(mainVehicle, "2027-05-16", "2027-05-15")).toEqual([{ available: false }]);
    expect(await sql`select availability_private.is_demo_vehicle_available(
      ${mainVehicle}::uuid,
      '-infinity'::date,
      '2027-05-15'::date
    ) as available`).toEqual([{ available: false }]);
  });

  it.each(["reservation", "maintenance", "preparation", "manual"])("bloco ativo %s sobreposto impede disponibilidade", async (kind) => {
    let reservationId: string | undefined;
    let leadId: string | undefined;
    if (kind === "reservation") {
      leadId = crypto.randomUUID();
      createdLeadIds.push(leadId);
      await sql`insert into rental_leads (id, operation_id, organization_id, full_name, phone, city, has_definitive_license)
        values (${leadId}, ${crypto.randomUUID()}, ${demoOrg}, 'Pessoa sintética', '000000000', 'Cidade', true)`;
      const [reservation] = await sql`insert into reservation_requests (organization_id, vehicle_id, lead_id, pickup_date, return_date)
        values (${demoOrg}, ${mainVehicle}, ${leadId}, '2027-05-10', '2027-05-15') returning id`;

      if (!reservation?.id) {
        throw new Error("Reserva sintética não foi criada");
      }

      reservationId = String(reservation.id);
      await sql`update reservation_requests
        set status = 'approved', decided_by = ${crypto.randomUUID()}
        where id = ${reservationId}`;
    } else {
      await block(kind);
    }
    expect(await check(mainVehicle, "2027-05-11", "2027-05-14")).toEqual([{ available: false }]);
    expect(await check(mainVehicle, "2027-05-05", "2027-05-10")).toEqual([{ available: true }]);
    expect(await check(mainVehicle, "2027-05-15", "2027-05-20")).toEqual([{ available: true }]);
    expect(await check(otherVehicle)).toEqual([{ available: true }]);
    if (reservationId && leadId) {
      await sql`update reservation_requests set status = 'cancelled', cancelled_by = ${crypto.randomUUID()} where id = ${reservationId}`;
      expect(await check(mainVehicle)).toEqual([{ available: true }]);
      await sql.begin(async (tx) => {
        await tx`delete from notification_outbox where reservation_request_id = ${reservationId}`;
        await tx`delete from vehicle_schedule_blocks where reservation_request_id = ${reservationId}`;
        await tx`delete from reservation_requests where id = ${reservationId}`;
        await tx`delete from rental_leads where id = ${leadId}`;
      });
    } else {
      await sql`update vehicle_schedule_blocks set status = 'released', released_at = now() where vehicle_id = ${mainVehicle} and kind = ${kind}`;
      expect(await check(mainVehicle)).toEqual([{ available: true }]);
      await sql`delete from vehicle_schedule_blocks where vehicle_id = ${mainVehicle} and kind = ${kind}`;
    }
  });

  it("não revela disponibilidade de veículo pertencente a outra organização", async () => {
    expect(await check(foreignVehicle)).toEqual([{ available: false }]);
    expect(await check(crypto.randomUUID())).toEqual([{ available: false }]);
  });

  it("runtime executa apenas o boolean e não lê a agenda diretamente", async () => {
    await sql`set role lead_intake_runtime`;
    try {
      expect(await check(mainVehicle)).toEqual([{ available: true }]);
      expect(await check(foreignVehicle)).toEqual([{ available: false }]);
      await expect(sql`select id from vehicle_schedule_blocks`).rejects.toMatchObject({ code: "42501" });
      await expect(sql`select id from reservation_requests`).rejects.toMatchObject({ code: "42501" });
      const [grants] = await sql`select has_table_privilege(current_user, 'public.vehicle_schedule_blocks', 'SELECT') as agenda,
        has_function_privilege(current_user, 'availability_private.is_demo_vehicle_available(uuid,date,date)', 'EXECUTE') as execute`;
      expect(grants).toEqual({ agenda: false, execute: true });
    } finally {
      await sql`reset role`;
    }
  });

  it.each(["anon", "authenticated"])("%s não executa a função", async (role) => {
    await sql.unsafe(`set role ${role}`);
    try {
      await expect(check(mainVehicle)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await sql`reset role`;
    }
  });
});
