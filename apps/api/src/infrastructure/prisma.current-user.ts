import type { PrismaClient } from '@rental/database';
import type { CurrentUserRepository } from '../access/current-user.service.js';
import { PrismaAccessRepository } from './prisma.repositories.js';

export class PrismaCurrentUserRepository implements CurrentUserRepository {
  constructor(private readonly db: PrismaClient) {}
  async find(userId: string) {
    const user = await this.db.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          where: { status: 'ACTIVE', organization: { status: 'ACTIVE' } },
          select: {
            organizationId: true,
            organization: { select: { name: true } },
          },
        },
      },
    });
    if (!user) return null;
    const repository = new PrismaAccessRepository(this.db);
    const organizations = await Promise.all(
      user.memberships.map(async (membership) => ({
        name: membership.organization.name,
        access: await repository.findTenantAccess(
          user.id,
          membership.organizationId,
        ),
      })),
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      organizations,
      platformPermissions:
        (await repository.findPlatformPermissions(user.id)) ?? [],
    };
  }
}
