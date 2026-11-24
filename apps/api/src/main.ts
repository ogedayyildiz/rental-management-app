import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  readServiceEnvironment,
  validateDeployment,
  hardenedDeployment,
} from '@rental/config';
import { AppModule } from './app.module.js';
import { DATABASE } from './foundation.module.js';
import { databaseReady } from './operations.http.js';
import type { Server } from 'node:http';

async function bootstrap(): Promise<void> {
  validateDeployment(process.env, 'api');
  const { host, port } = readServiceEnvironment(process.env, 'API_PORT', 3001);
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  app.enableShutdownHooks();
  try {
    await app.init();
    if (hardenedDeployment(process.env)) await databaseReady(app.get(DATABASE));
    const server = app.getHttpServer() as Server;
    server.requestTimeout = 30000;
    server.headersTimeout = 15000;
    await app.listen(port, host);
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch(() => {
  console.error(JSON.stringify({ event: 'startup_failed', service: 'api' }));
  process.exitCode = 1;
});
