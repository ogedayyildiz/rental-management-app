import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { config } from './config.js';

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.enableCors({ origin: config.corsOrigins });
app.enableShutdownHooks();
await app.listen(config.port);
console.log(`API listening on http://localhost:${config.port}/api`);
