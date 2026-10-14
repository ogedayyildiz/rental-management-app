import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createDatabase } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import { IdentityVerifier } from './access/contracts.js';
import {
  AccessService,
  AuthenticationService,
} from './access/access.service.js';
import { AccessGuard, SafeErrorFilter } from './access/access.http.js';
import {
  PrismaAccessRepository,
  PrismaFoundationUnitOfWork,
} from './infrastructure/prisma.repositories.js';
import { BranchService } from './branches/branch.service.js';
import { BranchController } from './branches/branch.controller.js';

export const DATABASE = Symbol('database');
class DatabaseLifecycle {
  constructor(private readonly database: PrismaClient) {}
  async onModuleDestroy(): Promise<void> {
    await this.database.$disconnect();
  }
}
class UnconfiguredIdentityVerifier extends IdentityVerifier {
  override async verify(): Promise<null> {
    return null;
  }
}

@Module({
  controllers: [BranchController],
  providers: [
    {
      provide: DATABASE,
      useFactory: () => createDatabase(process.env['DATABASE_URL']),
    },
    {
      provide: DatabaseLifecycle,
      inject: [DATABASE],
      useFactory: (db: PrismaClient) => new DatabaseLifecycle(db),
    },
    { provide: IdentityVerifier, useClass: UnconfiguredIdentityVerifier },
    {
      provide: PrismaAccessRepository,
      inject: [DATABASE],
      useFactory: (db: PrismaClient) => new PrismaAccessRepository(db),
    },
    {
      provide: AccessService,
      inject: [PrismaAccessRepository],
      useFactory: (repo: PrismaAccessRepository) => new AccessService(repo),
    },
    {
      provide: AuthenticationService,
      inject: [IdentityVerifier, PrismaAccessRepository],
      useFactory: (verifier: IdentityVerifier, repo: PrismaAccessRepository) =>
        new AuthenticationService(verifier, repo),
    },
    {
      provide: BranchService,
      inject: [DATABASE],
      useFactory: (db: PrismaClient) =>
        new BranchService(new PrismaFoundationUnitOfWork(db)),
    },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: SafeErrorFilter },
  ],
})
export class FoundationModule {}
