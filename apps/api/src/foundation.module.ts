import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createDatabase } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import {
  IdentityVerifier,
  InvitationIdentityVerifier,
} from './access/contracts.js';
import { readAuth0Environment } from '@rental/config';
import { Auth0IdentityVerifier } from './authentication/auth0.verifier.js';
import { OnboardingService } from './onboarding/onboarding.service.js';
import { OnboardingController } from './onboarding/onboarding.controller.js';
import { PrismaOnboardingUnitOfWork } from './infrastructure/prisma.onboarding.js';
import { CurrentUserService } from './access/current-user.service.js';
import { PrismaCurrentUserRepository } from './infrastructure/prisma.current-user.js';
import { CurrentUserController } from './access/current-user.controller.js';
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

@Module({
  controllers: [BranchController, OnboardingController, CurrentUserController],
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
    {
      provide: IdentityVerifier,
      useFactory: () =>
        new Auth0IdentityVerifier(readAuth0Environment(process.env)),
    },
    { provide: InvitationIdentityVerifier, useExisting: IdentityVerifier },
    {
      provide: OnboardingService,
      inject: [DATABASE, InvitationIdentityVerifier],
      useFactory: (db: PrismaClient, verifier: InvitationIdentityVerifier) =>
        new OnboardingService(new PrismaOnboardingUnitOfWork(db), verifier),
    },
    {
      provide: CurrentUserService,
      inject: [DATABASE],
      useFactory: (db: PrismaClient) =>
        new CurrentUserService(new PrismaCurrentUserRepository(db)),
    },
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
