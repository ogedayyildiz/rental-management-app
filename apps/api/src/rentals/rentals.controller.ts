import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  CONTRACT_STATUSES,
  offerInputSchema,
  paymentInputSchema,
  receivePaymentSchema,
  type ContractStatus,
  type OfferInput,
  type PaymentInput,
  type ReceivePaymentInput,
} from '@rental/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrgId } from '../tenant/tenant.js';
import { RentalsService } from './rentals.service.js';

const statusQuery = z.enum(CONTRACT_STATUSES).optional();

@Controller()
export class RentalsController {
  constructor(private readonly rentals: RentalsService) {}

  @Get('rentals')
  list(@OrgId() orgId: string, @Query('status', new ZodPipe(statusQuery)) status?: ContractStatus) {
    return this.rentals.list(orgId, status);
  }

  @Get('rentals/:id')
  get(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentals.get(orgId, id);
  }

  /** Creates an offer (status "draft"). */
  @Post('rentals')
  create(@OrgId() orgId: string, @Body(new ZodPipe(offerInputSchema)) body: OfferInput) {
    return this.rentals.createOffer(orgId, body);
  }

  @Put('rentals/:id')
  update(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(offerInputSchema)) body: OfferInput,
  ) {
    return this.rentals.updateOffer(orgId, id, body);
  }

  @Post('rentals/:id/confirm')
  confirm(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentals.confirm(orgId, id);
  }

  @Post('rentals/:id/start')
  start(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentals.start(orgId, id);
  }

  @Post('rentals/:id/complete')
  complete(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentals.complete(orgId, id);
  }

  @Post('rentals/:id/cancel')
  cancel(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rentals.cancel(orgId, id);
  }

  @Post('rentals/:id/payments')
  addPayment(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(paymentInputSchema)) body: PaymentInput,
  ) {
    return this.rentals.addPayment(orgId, id, body);
  }

  @Post('payments/:id/receive')
  receive(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(receivePaymentSchema)) body: ReceivePaymentInput,
  ) {
    return this.rentals.receivePayment(orgId, id, body);
  }
}
