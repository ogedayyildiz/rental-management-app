/**
 * Resets and fills the demo organization. Safe to rerun.
 * Runs as the admin role (bypasses RLS).
 */
import {
  DEMO_ORG_ID,
  SIMULATOR_PROVIDER,
  demoDeviceId,
  demoInitialEngineHours,
  seededRandom,
} from '@rental/shared';
import { sql } from 'drizzle-orm';
import { createDb } from '../client.js';
import * as s from '../schema/index.js';

const url = process.env.DATABASE_URL_ADMIN;
if (!url) throw new Error('DATABASE_URL_ADMIN is not set (see .env.example)');
const machineCount = Number(process.env.SIM_DEVICE_COUNT ?? 50);

const rand = seededRandom(42);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const { db, client } = createDb(url, { max: 1 });

await db.transaction(async (tx) => {
  // --- reset -------------------------------------------------------------
  await tx.execute(sql`delete from telemetry where organization_id = ${DEMO_ORG_ID}`);
  await tx.delete(s.organizations).where(sql`id = ${DEMO_ORG_ID}`);
  await tx.delete(s.users).where(sql`email like '%@demo.example.com'`);

  // --- tenancy -----------------------------------------------------------
  await tx.insert(s.organizations).values({
    id: DEMO_ORG_ID,
    name: 'Demo Rental Co.',
    slug: 'demo',
  });
  const users = await tx
    .insert(s.users)
    .values([
      { name: 'Owner', email: 'owner@demo.example.com' },
      { name: 'Fleet Manager', email: 'fleet@demo.example.com' },
      { name: 'Technician', email: 'tech@demo.example.com' },
      { name: 'Finance', email: 'finance@demo.example.com' },
    ])
    .returning();
  const roles = ['owner', 'fleet_manager', 'technician', 'finance'] as const;
  await tx
    .insert(s.memberships)
    .values(users.map((u, i) => ({ organizationId: DEMO_ORG_ID, userId: u.id, role: roles[i]! })));
  const technician = users[2]!;

  // --- depots & models ---------------------------------------------------
  const depots = await tx
    .insert(s.depots)
    .values([
      { organizationId: DEMO_ORG_ID, name: 'Tuzla Depot', location: { lon: 29.3, lat: 40.82 } },
      { organizationId: DEMO_ORG_ID, name: 'Hadımköy Depot', location: { lon: 28.62, lat: 41.1 } },
    ])
    .returning();

  const models = await tx
    .insert(s.machineModels)
    .values([
      { manufacturer: 'JLG', model: '1930ES', category: 'scissor_lift' },
      { manufacturer: 'Genie', model: 'Z-45 XC', category: 'boom_lift' },
      { manufacturer: 'Caterpillar', model: '301.7 CR', category: 'mini_excavator' },
      { manufacturer: 'Bobcat', model: 'S70', category: 'skid_steer' },
      { manufacturer: 'Atlas Copco', model: 'QAS 60', category: 'generator' },
      { manufacturer: 'Toyota', model: '8FBE15', category: 'forklift' },
    ].map((m) => ({ ...m, organizationId: DEMO_ORG_ID })))
    .returning();

  // --- machines & GPS devices -------------------------------------------
  const prefix: Record<string, string> = {
    scissor_lift: 'SL', boom_lift: 'BL', mini_excavator: 'EX',
    skid_steer: 'SS', generator: 'GN', forklift: 'FL',
  };
  const machines = await tx
    .insert(s.machines)
    .values(
      Array.from({ length: machineCount }, (_, i) => {
        const model = models[i % models.length]!;
        const purchase = daysAgo(200 + Math.floor(rand() * 1500));
        return {
          organizationId: DEMO_ORG_ID,
          modelId: model.id,
          name: `${prefix[model.category]}-${String(i + 1).padStart(3, '0')}`,
          serialNo: `${model.manufacturer.slice(0, 3).toUpperCase()}${100000 + i * 7919}`,
          year: purchase.getFullYear(),
          purchaseDate: isoDate(purchase),
          purchasePrice: String(Math.round(400_000 + rand() * 2_600_000)),
          homeDepotId: depots[i % depots.length]!.id,
        };
      }),
    )
    .returning();

  await tx.insert(s.gpsDevices).values(
    machines.map((m, i) => ({
      organizationId: DEMO_ORG_ID,
      provider: SIMULATOR_PROVIDER,
      externalId: demoDeviceId(i),
      machineId: m.id,
      installedAt: daysAgo(180),
    })),
  );

  // --- error code catalog -----------------------------------------------
  await tx.insert(s.errorCodeCatalog).values(
    [
      { code: 'I001', description: 'Service reminder from controller', severity: 'info' as const },
      { code: 'E101', description: 'Low hydraulic pressure', severity: 'warning' as const },
      { code: 'E202', description: 'Battery over-temperature', severity: 'critical' as const },
      { code: 'E305', description: 'Tilt alarm', severity: 'critical' as const },
      { code: 'E410', description: 'Platform overload', severity: 'warning' as const },
    ].map((e) => ({ ...e, organizationId: DEMO_ORG_ID, provider: SIMULATOR_PROVIDER })),
  );

  // --- customers, contracts, payments -----------------------------------
  const customers = await tx
    .insert(s.customers)
    .values(
      ['Marmara Yapı A.Ş.', 'Boğaziçi İnşaat Ltd.', 'Anadolu Altyapı A.Ş.', 'Ege Enerji Ltd.', 'Kuzey Lojistik A.Ş.'].map(
        (companyName) => ({ organizationId: DEMO_ORG_ID, companyName }),
      ),
    )
    .returning();

  const dailyRate: Record<string, number> = {
    scissor_lift: 1500, boom_lift: 3500, mini_excavator: 4000,
    skid_steer: 3000, generator: 2000, forklift: 1800,
  };
  const modelById = new Map(models.map((m) => [m.id, m]));
  const pool = [...machines];
  let contractSeq = 1;

  // Completed contracts in the past (paid), then active ones (payment expected).
  for (const active of [false, false, false, false, true, true, true, true, true, true]) {
    const customer = pick(customers);
    const start = daysAgo(active ? 1 + Math.floor(rand() * 25) : 40 + Math.floor(rand() * 120));
    const days = 7 + Math.floor(rand() * 21);
    const end = new Date(start.getTime() + days * 86_400_000);
    const itemCount = 1 + Math.floor(rand() * 4);
    // Active rentals take machines out of the pool; past ones may reuse any machine.
    const chosen = active
      ? pool.splice(0, itemCount)
      : Array.from({ length: itemCount }, () => pick(machines)).filter(
          (m, idx, arr) => arr.indexOf(m) === idx,
        );
    if (chosen.length === 0) break;

    const items = chosen.map((m) => {
      const rate = dailyRate[modelById.get(m.modelId)!.category]!;
      return { machine: m, rate, amount: rate * days };
    });
    const total = items.reduce((sum, it) => sum + it.amount, 0);

    const [contract] = await tx
      .insert(s.rentalContracts)
      .values({
        organizationId: DEMO_ORG_ID,
        customerId: customer.id,
        contractNo: `RC-${new Date().getFullYear()}-${String(contractSeq++).padStart(4, '0')}`,
        status: active ? 'active' : 'completed',
        startDate: isoDate(start),
        plannedEndDate: isoDate(end),
        actualEndDate: active ? null : isoDate(end),
        siteAddress: `${customer.companyName} site`,
        totalAmount: String(total),
        createdBy: users[1]!.id,
      })
      .returning();

    await tx.insert(s.rentalItems).values(
      items.map((it) => ({
        organizationId: DEMO_ORG_ID,
        contractId: contract!.id,
        machineId: it.machine.id,
        rateType: 'daily' as const,
        rate: String(it.rate),
        startAt: start,
        endAt: active ? null : end,
        amount: String(it.amount),
      })),
    );

    await tx.insert(s.payments).values({
      organizationId: DEMO_ORG_ID,
      contractId: contract!.id,
      amount: String(total),
      dueDate: isoDate(new Date(end.getTime() + 30 * 86_400_000)),
      status: active ? 'expected' : 'received',
      receivedAt: active ? null : new Date(end.getTime() + 20 * 86_400_000),
      method: active ? null : 'bank_transfer',
    });

    if (active) {
      for (const it of items) {
        await tx.update(s.machines).set({ status: 'rented' }).where(sql`id = ${it.machine.id}`);
      }
    }
  }

  // Two machines in the workshop.
  for (const m of pool.slice(0, 2)) {
    await tx.update(s.machines).set({ status: 'maintenance' }).where(sql`id = ${m.id}`);
  }

  // --- maintenance -------------------------------------------------------
  for (const [i, m] of machines.entries()) {
    const hoursNow = demoInitialEngineHours(i);
    const [hoursPlan] = await tx
      .insert(s.maintenancePlans)
      .values([
        {
          organizationId: DEMO_ORG_ID,
          machineId: m.id,
          name: '250 h service',
          intervalHours: 250,
          warnBeforeHours: 25,
          baselineDate: m.purchaseDate!,
          baselineHours: 0,
        },
        {
          organizationId: DEMO_ORG_ID,
          machineId: m.id,
          name: 'Annual inspection',
          intervalDays: 365,
          warnBeforeDays: 30,
          // Last inspection somewhere in the past year (a few fall due soon)
          baselineDate: isoDate(daysAgo(Math.floor(rand() * 350))),
        },
      ])
      .returning();

    // Last 250 h service: usually on time, sometimes overdue.
    const lastServiceHours = Math.floor(hoursNow / 250) * 250 - (rand() < 0.15 ? 250 : 0);
    if (lastServiceHours > 0) {
      await tx.insert(s.maintenanceRecords).values({
        organizationId: DEMO_ORG_ID,
        machineId: m.id,
        planId: hoursPlan!.id,
        type: 'scheduled',
        performedAt: daysAgo(10 + Math.floor(rand() * 60)),
        engineHours: lastServiceHours,
        cost: String(Math.round(2500 + rand() * 7500)),
        technicianId: technician.id,
      });
    }
  }
});

console.log(`Seeded demo organization ${DEMO_ORG_ID} with ${machineCount} machines.`);
await client.end();
