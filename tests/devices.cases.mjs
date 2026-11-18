import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolveDeviceInstallation } from '../packages/database/dist/index.js';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';

export async function deviceCases(suite, db, fixture) {
  await suite.test(
    'tracking devices: tenant boundaries, concurrent installation, multiple sources and recorded-time history',
    async () => {
      const a = await fixture(),
        b = await fixture();
      const org = a.organization.id,
        other = b.organization.id;
      const service = new MachineService(new PrismaMachineUnitOfWork(db));
      async function machine(t) {
        await db.rolePermission.createMany({
          data: [
            {
              organizationId: t.organization.id,
              roleId: t.role.id,
              permissionKey: 'machines.create',
            },
          ],
          skipDuplicates: true,
        });
        return service.create(
          t.principal,
          t.organization.id,
          {
            fleetNumber: randomUUID(),
            manufacturer: 'Test',
            model: 'Lift',
            category: 'Access',
          },
          randomUUID(),
        );
      }
      const first = await machine(a),
        second = await machine(a),
        foreign = await machine(b);
      const device = (organizationId, providerDeviceId) =>
        db.trackingDevice.create({
          data: { organizationId, provider: 'example', providerDeviceId },
        });
      const d = await device(org, 'unit-1'),
        aux = await device(org, 'unit-2'),
        outside = await device(other, 'unit-1');
      const start = new Date('2026-01-01Z'),
        move = new Date('2026-02-01Z');
      const install = (
        trackingDeviceId,
        machineId,
        installedAt = start,
        removedAt = null,
      ) =>
        db.deviceInstallation.create({
          data: {
            organizationId: org,
            trackingDeviceId,
            machineId,
            installedAt,
            removedAt,
          },
        });
      await assert.rejects(install(outside.id, first.id), { code: 'P2003' });
      await assert.rejects(install(d.id, foreign.id), { code: 'P2003' });
      const concurrent = await Promise.allSettled([
        install(d.id, first.id),
        install(d.id, first.id),
      ]);
      assert.equal(
        concurrent.filter((x) => x.status === 'fulfilled').length,
        1,
      );
      const row = concurrent.find((x) => x.status === 'fulfilled').value;
      await install(aux.id, first.id);
      await db.deviceInstallation.update({
        where: { id: row.id },
        data: { removedAt: move },
      });
      await assert.rejects(install(d.id, second.id, start, move));
      await assert.rejects(
        db.deviceInstallation.delete({ where: { id: row.id } }),
      );
      await assert.rejects(
        db.deviceInstallation.update({
          where: { id: row.id },
          data: { removedAt: null },
        }),
      );
      await install(d.id, second.id, move);
      const resolve = (tenant, when) =>
        resolveDeviceInstallation(db, tenant, d.id, when);
      assert.equal((await resolve(org, start)).machineId, first.id);
      assert.equal((await resolve(org, move)).machineId, second.id);
      assert.equal(await resolve(other, start), null);
      assert.equal(await resolve(org, new Date(start.getTime() - 1)), null);
      assert.equal(
        await resolveDeviceInstallation(db, org, randomUUID(), start),
        null,
      );
    },
  );
}
