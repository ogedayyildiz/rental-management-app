import { Module } from '@nestjs/common';
import { RentalsController } from './rentals.controller.js';
import { RentalsService } from './rentals.service.js';

@Module({ controllers: [RentalsController], providers: [RentalsService] })
export class RentalsModule {}
