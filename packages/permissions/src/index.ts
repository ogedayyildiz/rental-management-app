export const tenantPermissions = [
  'organization.manage',
  'users.manage',
  'roles.manage',
  'branches.manage',
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
