import { Module } from '@nestjs/common';
import { MachinesController } from './machines.controller.js';
import { MachinesService } from './machines.service.js';

@Module({
  controllers: [MachinesController],
  providers: [MachinesService],
})
export class MachinesModule {}
