import type { Prisma } from './generated/prisma/client.js';

// Internal data access only. The caller supplies a trusted tenant and provisioned device ID.
export function resolveDeviceInstallation(
  db: Pick<Prisma.TransactionClient, 'deviceInstallation'>,
  organizationId: string,
  trackingDeviceId: string,
  recordedAt: Date,
) {
  if (!Number.isFinite(recordedAt.getTime()))
    throw new Error('Invalid recordedAt');
  return db.deviceInstallation.findFirst({
    where: {
      organizationId,
      trackingDeviceId,
      installedAt: { lte: recordedAt },
      OR: [{ removedAt: null }, { removedAt: { gt: recordedAt } }],
    },
    select: {
      id: true,
      machineId: true,
      organizationId: true,
      trackingDeviceId: true,
    },
  });
}
