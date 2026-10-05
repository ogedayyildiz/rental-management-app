import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DbErrorFilter } from './common/db-error.filter.js';
import { config } from './config.js';

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api');
app.enableCors({ origin: config.corsOrigins });
app.useGlobalFilters(new DbErrorFilter(app.get(HttpAdapterHost).httpAdapter));
app.enableShutdownHooks();
await app.listen(config.port);
console.log(`API listening on http://localhost:${config.port}/api`);
