import { pgEnum } from 'drizzle-orm/pg-core';
import {
  CONTRACT_STATUSES,
  ERROR_SEVERITIES,
  GEOFENCE_TYPES,
  MACHINE_STATUSES,
  MAINTENANCE_TYPES,
  MEMBERSHIP_ROLES,
  PAYMENT_STATUSES,
  RATE_TYPES,
} from '@rental/shared';

export const machineStatus = pgEnum('machine_status', MACHINE_STATUSES);
export const membershipRole = pgEnum('membership_role', MEMBERSHIP_ROLES);
export const errorSeverity = pgEnum('error_severity', ERROR_SEVERITIES);
export const contractStatus = pgEnum('contract_status', CONTRACT_STATUSES);
export const rateType = pgEnum('rate_type', RATE_TYPES);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const maintenanceType = pgEnum('maintenance_type', MAINTENANCE_TYPES);
export const geofenceType = pgEnum('geofence_type', GEOFENCE_TYPES);
export const inspectionType = pgEnum('inspection_type', ['checkout', 'checkin']);
