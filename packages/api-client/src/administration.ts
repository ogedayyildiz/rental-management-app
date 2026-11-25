import {
  organizationSettingsViewSchema,
  adminRoleSchema,
  adminMemberSchema,
  adminBranchSchema,
  adminRolePageSchema,
  adminMemberPageSchema,
  adminBranchPageSchema,
  adminInvitationPageSchema,
  adminAuditPageSchema,
  adminPermissionsSchema,
  issuedInvitationSchema,
} from '@rental/validation';
export function administrationEndpointAllowed(method: string, path: string) {
  const id = '[0-9a-f-]{36}',
    base = '^organizations/' + id + '/';
  const routes: Record<string, string> = {
    GET:
      '(?:settings|permissions|roles|memberships(?:/' +
      id +
      ')?|branches(?:/' +
      id +
      ')?|invitations|audit)',
    POST: '(?:roles|branches)',
    PATCH:
      '(?:settings|roles/' +
      id +
      '|memberships/' +
      id +
      '|branches/' +
      id +
      ')',
  };
  return !!routes[method] && new RegExp(base + routes[method] + '$').test(path);
}
export class AdministrationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function createAdministrationClient(
  baseUrl: string,
  transport: typeof fetch = fetch,
) {
  async function call<T>(
    org: string,
    path: string,
    schema: { parse(v: unknown): T },
    method = 'GET',
    body?: unknown,
  ) {
    const r = await transport(
      `${baseUrl}/organizations/${encodeURIComponent(org)}/${path}`,
      {
        method,
        cache: 'no-store',
        ...(body === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
      },
    );
    const value: unknown = await r.json();
    if (!r.ok) {
      const code =
        value &&
        typeof value === 'object' &&
        'code' in value &&
        typeof value.code === 'string'
          ? value.code
          : 'INTERNAL_ERROR';
      throw new AdministrationError(code);
    }
    return schema.parse(value);
  }
  const ok = { parse: () => true };
  return {
    organization: (o: string) =>
      call(o, 'settings', organizationSettingsViewSchema),
    updateOrganization: (o: string, b: unknown) =>
      call(o, 'settings', organizationSettingsViewSchema, 'PATCH', b),
    permissions: (o: string) => call(o, 'permissions', adminPermissionsSchema),
    roles: (o: string, q = new URLSearchParams()) =>
      call(o, 'roles?' + q, adminRolePageSchema),
    saveRole: (o: string, id: string | null, b: unknown) =>
      call(
        o,
        'roles' + (id ? '/' + id : ''),
        adminRoleSchema,
        id ? 'PATCH' : 'POST',
        b,
      ),
    members: (o: string, q = new URLSearchParams()) =>
      call(o, 'memberships?' + q, adminMemberPageSchema),
    updateMember: (o: string, id: string, b: unknown) =>
      call(o, 'memberships/' + id, adminMemberSchema, 'PATCH', b),
    branches: (o: string, q = new URLSearchParams()) =>
      call(o, 'branches?' + q, adminBranchPageSchema),
    saveBranch: (o: string, id: string | null, b: unknown) =>
      call(
        o,
        'branches' + (id ? '/' + id : ''),
        adminBranchSchema,
        id ? 'PATCH' : 'POST',
        b,
      ),
    invitations: (o: string, q = new URLSearchParams()) =>
      call(o, 'invitations?' + q, adminInvitationPageSchema),
    invite: (o: string, b: unknown) =>
      call(o, 'invitations', issuedInvitationSchema, 'POST', b),
    revoke: (o: string, id: string) =>
      call(o, 'invitations/' + id + '/revoke', ok, 'POST', {}),
    audit: (o: string, q = new URLSearchParams()) =>
      call(o, 'audit?' + q, adminAuditPageSchema),
  };
}
