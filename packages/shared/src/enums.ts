export const MACHINE_STATUSES = [
  'available',
  'reserved',
  'rented',
  'maintenance',
  'out_of_service',
  'retired',
] as const;
export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export const MEMBERSHIP_ROLES = [
  'owner',
  'admin',
  'fleet_manager',
  'technician',
  'finance',
  'viewer',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ERROR_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const CONTRACT_STATUSES = ['draft', 'reserved', 'active', 'completed', 'cancelled'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const RATE_TYPES = ['hourly', 'daily', 'weekly', 'monthly'] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const PAYMENT_STATUSES = ['expected', 'received', 'overdue', 'written_off'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const MAINTENANCE_TYPES = ['scheduled', 'repair', 'inspection'] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export const GEOFENCE_TYPES = ['depot', 'customer_site', 'restricted'] as const;
export type GeofenceType = (typeof GEOFENCE_TYPES)[number];
