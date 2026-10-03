import { Controller, Get, Inject } from '@nestjs/common';
import type { Database } from '@rental/db';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { DB, REDIS } from '../db/db.module.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    await this.redis.ping();
    return { status: 'ok' };
  }
}
