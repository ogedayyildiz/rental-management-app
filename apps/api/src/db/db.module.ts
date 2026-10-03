import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb } from '@rental/db';
import { Redis } from 'ioredis';
import { config } from '../config.js';

/** Injection tokens */
export const DB = Symbol('DB');
export const PG_CLIENT = Symbol('PG_CLIENT');
export const REDIS = Symbol('REDIS');

const pg = createDb(config.databaseUrl);

@Global()
@Module({
  providers: [
    { provide: DB, useValue: pg.db },
    { provide: PG_CLIENT, useValue: pg.client },
    { provide: REDIS, useFactory: () => new Redis(config.redisUrl) },
  ],
  exports: [DB, REDIS],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
    await pg.client.end({ timeout: 5 });
  }
}
