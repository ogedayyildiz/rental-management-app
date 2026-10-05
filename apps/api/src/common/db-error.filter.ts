import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/** Friendly messages for constraint violations the UI can hit. */
const MESSAGES: Record<string, string> = {
  machines_org_serial_uq: 'A machine with this serial number already exists.',
  gps_devices_provider_external_uq: 'This GPS device ID is already registered to a machine.',
  gps_devices_active_machine_uq: 'This machine already has an active GPS device.',
  rental_contracts_org_no_uq: 'That contract number is already used. Please try again.',
  rental_items_no_overlap: 'One of the machines is already booked for these dates.',
};

interface PgError {
  code?: string;
  constraint_name?: string;
}

/**
 * Turns unique (23505) and exclusion (23P01) violations into 409 responses
 * instead of 500s. Everything else goes to Nest's default handling.
 */
@Catch()
export class DbErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const pg = (exception as { cause?: PgError })?.cause;
    if (pg?.code === '23505' || pg?.code === '23P01') {
      const message = (pg.constraint_name && MESSAGES[pg.constraint_name]) ?? 'This conflicts with existing data.';
      return super.catch(new ConflictException(message), host);
    }
    super.catch(exception, host);
  }
}
