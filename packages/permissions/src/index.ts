export const tenantPermissions = [
  'organization.manage',
  'users.manage',
  'roles.manage',
  'branches.manage',
  'customers.read',
  'customers.create',
  'customers.update',
  'customers.archive',
  'machines.read',
  'machines.create',
  'machines.update',
  'machines.archive',
  'finance.acquisition_cost.view',
  'finance.acquisition_cost.edit',
] as const;
export const platformPermissions = [
  'platform.organization.read',
  'platform.organization.create',
  'platform.system.read',
] as const;
export type TenantPermission = (typeof tenantPermissions)[number];
export type PlatformPermission = (typeof platformPermissions)[number];

export function hasPermission(
  granted: readonly string[],
  required: string,
): boolean {
  return granted.includes(required);
}
