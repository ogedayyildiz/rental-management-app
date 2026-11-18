import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DeviceService } from '../apps/api/dist/devices/device.service.js';
import {
  fixtureAdapter,
  ingest,
  simulatedFrame,
} from '../apps/telemetry/dist/ingestion.js';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';
export async function telemetryCases(suite, db, fixture) {
  await suite.test(
    'telemetry: scoped adapter identity, duplicate/conflicting events, late readings, fault chronology, bounded history and transactional audit',
    async () => {
      const t = await fixture(),
        org = t.organization.id,
        b = await fixture();
      const actor = { principal: t.principal, requestId: randomUUID() },
        devices = new DeviceService(db);
      const grants = [
        'machines.create',
        'device.read',
        'device.manage',
        'device.assign',
        'device.remove',
        'telemetry.read',
        'fault.read',
      ];
      await db.rolePermission.createMany({
        data: grants.map((permissionKey) => ({
          organizationId: org,
          roleId: t.role.id,
          permissionKey,
        })),
      });
      const machine = await new MachineService(
        new PrismaMachineUnitOfWork(db),
      ).create(
        t.principal,
        org,
        {
          manufacturer: 'Test',
          model: 'Lift',
          category: 'Access',
          fleetNumber: 'Telemetry',
        },
        randomUUID(),
      );
      const dev = await devices.save(actor, org, null, {
        provider: 'test',
        providerDeviceId: 'A',
      });
      await assert.rejects(
        devices.transition(
          { ...actor, requestId: 'invalid' },
          org,
          dev.id,
          'install',
          { machineId: machine.id },
        ),
      );
      assert.equal(
        await db.deviceInstallation.count({
          where: { trackingDeviceId: dev.id },
        }),
        0,
      );
      await devices.transition(actor, org, dev.id, 'install', {
        machineId: machine.id,
      });
      const start = Date.now() + 1,
        time = (step) => new Date(start + step * 1000);
      const client = fixtureAdapter('simulator'),
        binding = { provider: 'test', organizationId: org, externalId: 'A' };
      const emit = (frame, source = binding) =>
        ingest(db, source, client, frame, time(5));
      const first = simulatedFrame(0, time(0)),
        later = simulatedFrame(2, time(2)),
        delayed = simulatedFrame(1, time(1));
      await assert.rejects(emit({ ...first, machineId: machine.id }));
      await assert.rejects(emit({ ...first, signals: { batterySoc: 101 } }));
      await assert.rejects(
        emit(first, { ...binding, organizationId: b.organization.id }),
        /Unknown source/,
      );
      await assert.rejects(
        emit({ ...first, recordedAt: new Date(0).toISOString() }),
        /No installation/,
      );
      assert.equal((await emit(first)).change.active, true);
      assert.equal((await emit(first)).duplicate, true);
      await assert.rejects(
        emit({ ...first, signals: { batterySoc: 33 } }),
        /Conflicting event/,
      );
      assert.equal((await emit(later)).change.active, false);
      await emit(delayed);
      let current = await devices.machine(actor, org, machine.id);
      assert.equal(
        current.signals.find((x) => x.signal === 'batterySoc').value,
        88,
      );
      assert.deepEqual(current.faults, []);
      const recurrence = simulatedFrame(0, time(3));
      await emit(recurrence);
      current = await devices.machine(actor, org, machine.id);
      assert.equal(current.faults[0].occurrences, 2);
      const aux = await devices.save(actor, org, null, {
        provider: 'test',
        providerDeviceId: 'B',
        priorities: { batterySoc: 90 },
      });
      await devices.transition(actor, org, aux.id, 'install', {
        machineId: machine.id,
      });
      const auxAt = new Date(Math.max(Date.now() + 1, time(4).getTime()));
      const auxFrame = {
        ...simulatedFrame(1, auxAt),
        signals: { batterySoc: 25 },
      };
      const auxEmit = (f) =>
        ingest(
          db,
          { ...binding, externalId: 'B' },
          client,
          f,
          new Date(Date.parse(f.recordedAt) + 10),
        );
      await auxEmit({ ...auxFrame, healthy: false });
      current = await devices.machine(actor, org, machine.id);
      assert.equal(
        current.signals.find((x) => x.signal === 'batterySoc').device,
        dev.id,
      );
      await auxEmit({
        ...auxFrame,
        eventId: 'healthy',
        recordedAt: new Date(auxAt.getTime() + 1).toISOString(),
      });
      current = await devices.machine(actor, org, machine.id);
      assert.equal(
        current.signals.find((x) => x.signal === 'batterySoc').value,
        25,
      );
      assert.equal(
        current.signals.find((x) => x.signal === 'location').device,
        dev.id,
      );
      const query = {
        from: time(0).toISOString(),
        to: time(3).toISOString(),
        signals: 'batterySoc',
        limit: '2',
      };
      const history = await devices.machine(actor, org, machine.id, query);
      assert.deepEqual(
        history.map((x) => x.value),
        [88, 74],
      );
      await assert.rejects(
        devices.machine(actor, org, machine.id, {
          ...query,
          to: new Date(start + 32 * 86400000).toISOString(),
        }),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(devices.detail(actor, b.organization.id, dev.id), {
        code: 'ACCESS_DENIED',
      });
      const [hypertable] =
        await db.$queryRaw`SELECT count(*)::int count FROM timescaledb_information.hypertables WHERE hypertable_name='telemetry_measurement'`;
      assert.equal(hypertable.count, 1);
    },
  );
}
