import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readServiceEnvironment } from '@rental/config';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const { host, port } = readServiceEnvironment(process.env, 'API_PORT', 3001);
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  app.enableShutdownHooks();
  await app.listen(port, host);
}

void bootstrap().catch(() => {
  console.error(JSON.stringify({ event: 'startup_failed', service: 'api' }));
  process.exitCode = 1;
});
