'use client';
import { CurrencySelect } from '../currency-select';
import { useEffect, useState, type ReactNode } from 'react';
import { translate, type Locale, type TranslationKey } from '@rental/i18n';
import {
  createAdministrationClient,
  AdministrationError,
} from '@rental/api-client';
import {
  organizationSettingsUpdateSchema,
  adminRoleInputSchema,
  adminRoleUpdateSchema,
  adminMemberUpdateSchema,
  adminBranchCreateSchema,
  branchUpdateSchema,
  invitationCreateSchema,
  adminQuerySchema,
  type AdminRole,
  type AdminMember,
  type AdminBranch,
  type AdminInvitation,
  type AdminAudit,
  type OrganizationSettings,
} from '@rental/validation';
import type { Context } from './workspace';
const api = createAdministrationClient('/api/backend');
type Row = AdminRole | AdminMember | AdminBranch | AdminInvitation | AdminAudit;
type Catalog = Awaited<ReturnType<typeof api.permissions>>;
export function SettingsPanel({
  section,
  context,
  locale,
  refreshContext,
}: {
  section: string;
  context: Context;
  locale: Locale;
  refreshContext: () => void;
}) {
  const org = context.access!.organizationId,
    t = (key: string) => translate(locale, ('admin.' + key) as TranslationKey),
    can = (p: string) => context.access!.permissions.includes(p);
  const mayManageRoles = can('roles.manage'),
    mayManageBranches = can('branches.manage');
  const [rows, Rows] = useState<Row[]>([]),
    [next, Next] = useState<string | null>(null),
    [trail, Trail] = useState<string[]>([]),
    [query, Q] = useState(new URLSearchParams()),
    [revision, Revision] = useState(0),
    [busy, B] = useState(true),
    [error, E] = useState(''),
    [saved, S] = useState(false),
    [editing, Edit] = useState<Row | 'new' | null>(null),
    [settings, Settings] = useState<OrganizationSettings | null>(null),
    [roles, Roles] = useState<AdminRole[]>([]),
    [branches, Branches] = useState<AdminBranch[]>([]),
    [catalog, Catalog] = useState<Catalog>([]),
    [issued, Issued] = useState<{ token: string; expiresAt: string } | null>(
      null,
    ),
    [revoke, Revoke] = useState<string | null>(null);
  function fail(e: unknown) {
    E(
      e instanceof AdministrationError
        ? ({
            ADMIN_LOCKOUT: 'lockout',
            ROLE_IN_USE: 'roleInUse',
            CONFLICT: 'conflict',
            ACCESS_DENIED: 'denied',
            INVALID_INPUT: 'invalid',
          }[e.code] ?? 'error')
        : 'error',
    );
  }
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (section === 'organization') {
          const r = await api.organization(org);
          if (live) Settings(r);
        } else {
          const loader =
            section === 'roles'
              ? api.roles
              : section === 'users'
                ? api.members
                : section === 'branches'
                  ? api.branches
                  : section === 'invitations'
                    ? api.invitations
                    : api.audit;
          const r = await loader(org, query);
          if (live) {
            Rows(r.items);
            Next(r.nextCursor);
          }
        }
      } catch (e) {
        if (live) fail(e);
      } finally {
        if (live) B(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [section, org, query, revision]);
  useEffect(() => {
    let live = true;
    async function all<T extends { id: string }>(
      load: (
        o: string,
        q: URLSearchParams,
      ) => Promise<{ items: T[]; nextCursor: string | null }>,
    ) {
      const result: T[] = [];
      let cursor: string | null = null;
      do {
        const q = new URLSearchParams({ limit: '100' });
        if (cursor) q.set('cursor', cursor);
        const p = await load(org, q);
        result.push(...p.items);
        cursor = p.nextCursor;
      } while (cursor && live);
      return result;
    }
    void (async () => {
      try {
        if (mayManageRoles && ['users', 'invitations'].includes(section)) {
          const v = await all(api.roles);
          if (live) Roles(v);
        }
        if (mayManageBranches && ['users', 'invitations'].includes(section)) {
          const v = await all(api.branches);
          if (live) Branches(v);
        }
        if (section === 'roles') {
          const v = await api.permissions(org);
          if (live) Catalog(v);
        }
      } catch (e) {
        if (live) fail(e);
      }
    })();
    return () => {
      live = false;
    };
  }, [org, section, revision, mayManageRoles, mayManageBranches]);
  const date = (v: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: settings?.timezone ?? 'UTC',
    }).format(new Date(v));
  async function mutation(fn: () => Promise<unknown>, accessChange = false) {
    E('');
    S(false);
    B(true);
    try {
      await fn();
      Edit(null);
      Revoke(null);
      S(true);
      Revision((n) => n + 1);
      if (accessChange) refreshContext();
    } catch (e) {
      fail(e);
      B(false);
    }
  }
  function changeQuery(q: URLSearchParams, history: string[] = []) {
    B(true);
    E('');
    Edit(null);
    Issued(null);
    Rows([]);
    Trail(history);
    Q(q);
  }
  return (
    <section>
      <h2>{t(section)}</h2>
      {error && <p role="alert">{t(error)}</p>}
      {saved && <p role="status">{t('saved')}</p>}
      {busy && <p role="status">{t('loading')}</p>}
      {section === 'organization' && settings && (
        <OrganizationForm
          key={settings.updatedAt}
          value={settings}
          locale={locale}
          t={t}
          busy={busy}
          save={(b) => mutation(() => api.updateOrganization(org, b), true)}
        />
      )}
      {section !== 'organization' && (
        <>
          <form
            className="customer-panel customer-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const q = new URLSearchParams();
              for (const [k, v] of d) {
                if (typeof v === 'string' && v) {
                  if (k === 'from' || k === 'to')
                    q.set(k, new Date(v + 'Z').toISOString());
                  else q.set(k, v);
                }
              }
              if (!adminQuerySchema.safeParse(Object.fromEntries(q)).success) {
                E('invalid');
                return;
              }
              changeQuery(q);
            }}
          >
            {section !== 'audit' ? (
              <label>
                {t('search')}
                <input name="q" type="search" />
              </label>
            ) : (
              <>
                {['from', 'to', 'actor', 'action', 'targetType', 'domain'].map(
                  (k) =>
                    k === 'domain' ? (
                      <label key={k}>
                        {t(k)}
                        <select name={k}>
                          <option value="">{t('all')}</option>
                          {[
                            'ADMINISTRATION',
                            'CUSTOMERS',
                            'MACHINES',
                            'RENTALS',
                            'MAINTENANCE',
                            'TELEMETRY',
                          ].map((d) => (
                            <option key={d} value={d}>
                              {t(d)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label key={k}>
                        {t(k)}
                        <input
                          name={k === 'actor' ? 'actorId' : k}
                          type={
                            ['from', 'to'].includes(k)
                              ? 'datetime-local'
                              : 'text'
                          }
                        />
                      </label>
                    ),
                )}
              </>
            )}
            {['users', 'invitations'].includes(section) && (
              <label>
                {t('status')}
                <select name="status">
                  <option value="">{t('all')}</option>
                  {(section === 'users'
                    ? ['ACTIVE', 'INACTIVE']
                    : ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']
                  ).map((s) => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" disabled={busy}>
              {t('search')}
            </button>
          </form>
          <div className="customer-actions">
            {section === 'roles' && (
              <button onClick={() => Edit('new')}>{t('newRole')}</button>
            )}
            {section === 'branches' &&
              context.access?.branchScope === 'ALL_BRANCHES' && (
                <button onClick={() => Edit('new')}>{t('newBranch')}</button>
              )}
            {section === 'invitations' && can('roles.manage') && (
              <button
                onClick={() => {
                  Issued(null);
                  Edit('new');
                }}
              >
                {t('invite')}
              </button>
            )}
          </div>
          {section === 'branches' && (
            <p className="customer-hint">{t('branchHint')}</p>
          )}
          {section === 'audit' && (
            <p className="customer-hint">{t('auditHint')}</p>
          )}
          <div className="customer-table">
            <table>
              <thead>
                <tr>
                  {(section === 'audit'
                    ? ['timestamp', 'actor', 'action', 'target', 'changes']
                    : section === 'invitations'
                      ? ['email', 'status', 'scope', 'expires', 'action']
                      : section === 'users'
                        ? ['name', 'email', 'status', 'scope', 'action']
                        : ['name', 'status', 'roleMembers', 'action']
                  ).map((k) => (
                    <th key={k}>{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {'actorType' in row ? (
                      <>
                        <td>{date(row.timestamp)}</td>
                        <td>{row.actorName ?? t('system')}</td>
                        <td>{row.action}</td>
                        <td>
                          {row.targetType} · {row.targetId}
                        </td>
                        <td>{row.changes.join(', ')}</td>
                      </>
                    ) : 'expiresAt' in row ? (
                      <>
                        <td>{row.email}</td>
                        <td>{t(row.status)}</td>
                        <td>{t(row.branchScope)}</td>
                        <td>{date(row.expiresAt)}</td>
                        <td>
                          {row.status === 'PENDING' && (
                            <button onClick={() => Revoke(row.id)}>
                              {t('revoke')}
                            </button>
                          )}
                        </td>
                      </>
                    ) : 'userId' in row ? (
                      <>
                        <td>{row.name}</td>
                        <td>{row.email}</td>
                        <td>{t(row.status)}</td>
                        <td>{t(row.branchScope)}</td>
                        <td>
                          <button onClick={() => Edit(row)}>{t('edit')}</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{row.name}</td>
                        <td>
                          {t(
                            ('enabled' in row ? row.enabled : row.active)
                              ? 'ACTIVE'
                              : 'INACTIVE',
                          )}
                        </td>
                        <td>{row.memberCount ?? 0}</td>
                        <td>
                          <button onClick={() => Edit(row)}>{t('edit')}</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && !rows.length && <p>{t('noRows')}</p>}
          </div>
          <div className="customer-actions">
            <button
              disabled={!trail.length || busy}
              onClick={() => {
                const history = [...trail],
                  previous = history.pop()!;
                const q = new URLSearchParams(query);
                if (previous) q.set('cursor', previous);
                else q.delete('cursor');
                changeQuery(q, history);
              }}
            >
              {t('previous')}
            </button>
            <button
              disabled={!next || busy}
              onClick={() => {
                const q = new URLSearchParams(query);
                q.set('cursor', next!);
                changeQuery(q, [...trail, query.get('cursor') ?? '']);
              }}
            >
              {t('next')}
            </button>
          </div>
        </>
      )}
      {revoke && (
        <form
          className="customer-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void mutation(() => api.revoke(org, revoke));
          }}
        >
          <Confirmation t={t} />
          <button disabled={busy}>{t('revoke')}</button>
          <button type="button" onClick={() => Revoke(null)}>
            {t('cancel')}
          </button>
        </form>
      )}
      {editing && (
        <Editor
          key={typeof editing === 'string' ? editing : editing.id}
          section={section}
          row={editing === 'new' ? null : editing}
          roles={roles}
          branches={branches}
          catalog={catalog}
          t={t}
          canEdit={section !== 'users' || can('roles.manage')}
          busy={busy}
          close={() => Edit(null)}
          submit={(b) =>
            mutation(
              async () => {
                const id = editing === 'new' ? null : editing.id;
                if (section === 'roles') return api.saveRole(org, id, b);
                if (section === 'branches') return api.saveBranch(org, id, b);
                if (section === 'users') return api.updateMember(org, id!, b);
                const r = await api.invite(org, b);
                Issued(r);
              },
              section === 'users' || section === 'roles',
            )
          }
        />
      )}
      {issued && (
        <section className="customer-panel">
          <p>{t('delivery')}</p>
          <label>
            {t('token')}
            <input
              type="password"
              autoComplete="off"
              readOnly
              value={issued.token}
            />
          </label>
          <p>
            {t('expires')}: {date(issued.expiresAt)}
          </p>
          <button onClick={() => Issued(null)}>{t('cancel')}</button>
        </section>
      )}
    </section>
  );
}
type T = (key: string) => string;
function Confirmation({ t }: { t: T }) {
  return (
    <label className="settings-check settings-confirm">
      <input type="checkbox" required />
      {t('confirm')}
    </label>
  );
}
function OrganizationForm({
  locale,
  value,
  t,
  busy,
  save,
}: {
  value: OrganizationSettings;
  locale: Locale;
  t: T;
  busy: boolean;
  save: (b: unknown) => Promise<void>;
}) {
  const [invalid, I] = useState(false);
  return (
    <form
      className="customer-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget),
          body = organizationSettingsUpdateSchema.safeParse({
            ...Object.fromEntries(d),
            legalName: d.get('legalName') || null,
            country: d.get('country') || null,
            version: value.updatedAt,
          });
        I(!body.success);
        if (body.success) void save(body.data);
      }}
    >
      <div className="customer-fields">
        {(['name', 'legalName', 'country', 'timezone'] as const).map((k) => (
          <label key={k}>
            {t(k)}
            <input
              name={k}
              defaultValue={value[k] ?? ''}
              required={k === 'name' || k === 'timezone'}
            />
          </label>
        ))}
        <label>
          {t('currency')}
          <CurrencySelect
            locale={locale}
            name="defaultCurrency"
            defaultValue={value.defaultCurrency}
            required
          />
        </label>
        <label>
          {t('language')}
          <select name="defaultLanguage" defaultValue={value.defaultLanguage}>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </label>
      </div>
      {invalid && <p role="alert">{t('invalid')}</p>}
      <button disabled={busy}>{t('save')}</button>
    </form>
  );
}
function Editor({
  section,
  row,
  roles,
  branches,
  catalog,
  t,
  canEdit,
  busy,
  close,
  submit,
}: {
  section: string;
  row: Row | null;
  roles: AdminRole[];
  branches: AdminBranch[];
  catalog: Catalog;
  t: T;
  canEdit: boolean;
  busy: boolean;
  close: () => void;
  submit: (b: unknown) => Promise<void>;
}) {
  const role = row && 'permissions' in row ? row : null,
    member = row && 'userId' in row ? row : null,
    branch = row && 'active' in row ? row : null;
  const [keys, K] = useState<string[]>(role?.permissions ?? []),
    [roleIds, R] = useState<string[]>(member?.roleIds ?? []),
    [branchIds, B] = useState<string[]>(member?.branchIds ?? []),
    [scope, S] = useState(member?.branchScope ?? 'SELECTED_BRANCHES'),
    [invalid, I] = useState(false);
  const toggle = (values: string[], key: string, set: (v: string[]) => void) =>
    set(
      values.includes(key) ? values.filter((x) => x !== key) : [...values, key],
    );
  let fields: ReactNode;
  if (section === 'roles')
    fields = (
      <>
        <label>
          {t('name')}
          <input
            name="name"
            defaultValue={role?.name ?? ''}
            required
            maxLength={200}
          />
        </label>
        {role && (
          <>
            <label className="settings-check">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={role.enabled}
              />
              {t('enabled')}
            </label>
            <p>
              {t('template')}: {role.templateKey ?? '—'} · {t('roleMembers')}:{' '}
              {role.memberCount} · {t('pendingInvites')}:{' '}
              {role.pendingInvitationCount}
            </p>
          </>
        )}
        <p className="customer-hint">{t('ceiling')}</p>
        <fieldset>
          <legend>{t('permissionSelection')}</legend>
          <div className="settings-permissions">
            {[...new Set(catalog.map((x) => x.group))].map((group) => (
              <fieldset key={group}>
                <legend>
                  {
                    t(
                      'permission.' +
                        catalog.find((x) => x.group === group)!.key,
                    ).split(' — ')[0]
                  }
                </legend>
                {catalog
                  .filter((x) => x.group === group)
                  .map((p) => (
                    <label className="settings-check" key={p.key}>
                      <input
                        type="checkbox"
                        value={p.key}
                        checked={keys.includes(p.key)}
                        disabled={!p.grantable}
                        onChange={() => toggle(keys, p.key, K)}
                      />
                      <span>
                        {t('permission.' + p.key)}
                        <small>{p.key}</small>
                        {p.sensitive && <small>{t('financial')}</small>}
                      </span>
                    </label>
                  ))}
              </fieldset>
            ))}
          </div>
        </fieldset>
      </>
    );
  else if (section === 'branches')
    fields = (
      <>
        <label>
          {t('name')}
          <input
            name="name"
            defaultValue={branch?.name ?? ''}
            required
            maxLength={200}
          />
        </label>
        {branch && (
          <>
            <label className="settings-check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={branch.active}
              />
              {t('enabled')}
            </label>
            <p>
              {t('assignedMembers')}: {branch.memberCount ?? 0}
            </p>
          </>
        )}
      </>
    );
  else
    fields = (
      <>
        {member ? (
          <>
            <h3>{member.name}</h3>
            <p>{member.email}</p>
            <p>
              {t('userState')}: {t(member.userStatus)}
            </p>
            <p>
              {t('membershipId')}: {member.id}
            </p>
            <p>
              {t('userId')}: {member.userId}
            </p>
            <label>
              {t('status')}
              <select name="status" defaultValue={member.status}>
                <option value="ACTIVE">{t('ACTIVE')}</option>
                <option value="INACTIVE">{t('INACTIVE')}</option>
              </select>
            </label>
          </>
        ) : (
          <label>
            {t('email')}
            <input name="email" type="email" required />
          </label>
        )}
        <fieldset>
          <legend>{t('assignedRoles')}</legend>
          {roles
            .filter((r) => r.enabled || roleIds.includes(r.id))
            .map((r) => (
              <label className="settings-check" key={r.id}>
                <input
                  type="checkbox"
                  checked={roleIds.includes(r.id)}
                  onChange={() => toggle(roleIds, r.id, R)}
                />
                {r.name}
              </label>
            ))}
          {member && !roles.length && <p>{member.roleIds.join(', ')}</p>}
        </fieldset>
        <label>
          {t('scope')}
          <select
            value={scope}
            onChange={(e) => {
              S(e.target.value as typeof scope);
              if (e.target.value === 'ALL_BRANCHES') B([]);
            }}
          >
            <option value="ALL_BRANCHES">{t('ALL_BRANCHES')}</option>
            <option value="SELECTED_BRANCHES">{t('SELECTED_BRANCHES')}</option>
          </select>
        </label>
        {scope === 'SELECTED_BRANCHES' && (
          <fieldset>
            <legend>{t('branches')}</legend>
            {branches
              .filter((b) => b.active || branchIds.includes(b.id))
              .map((b) => (
                <label className="settings-check" key={b.id}>
                  <input
                    type="checkbox"
                    checked={branchIds.includes(b.id)}
                    onChange={() => toggle(branchIds, b.id, B)}
                  />
                  {b.name}
                  {!b.active && ` (${t('INACTIVE')})`}
                </label>
              ))}
            {!branchIds.length && <p role="status">{t('emptyScope')}</p>}
          </fieldset>
        )}
      </>
    );
  return (
    <form
      className="customer-panel"
      aria-label={t(section)}
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        let raw: unknown,
          schema: {
            safeParse(
              v: unknown,
            ): { success: true; data: unknown } | { success: false };
          };
        if (section === 'roles') {
          raw = {
            name: d.get('name'),
            permissions: keys,
            ...(role
              ? { enabled: d.has('enabled'), version: role.updatedAt }
              : {}),
          };
          schema = role ? adminRoleUpdateSchema : adminRoleInputSchema;
        } else if (section === 'branches') {
          raw = {
            name: d.get('name'),
            ...(branch ? { active: d.has('active') } : {}),
          };
          schema = branch ? branchUpdateSchema : adminBranchCreateSchema;
        } else {
          raw = {
            roleIds,
            branchScope: scope,
            branchIds,
            ...(member
              ? { status: d.get('status'), version: member.updatedAt }
              : { email: d.get('email') }),
          };
          schema = member ? adminMemberUpdateSchema : invitationCreateSchema;
        }
        const result = schema.safeParse(raw);
        I(!result.success);
        if (result.success) void submit(result.data);
      }}
    >
      <fieldset disabled={busy || !canEdit}>
        {fields}
        {invalid && <p role="alert">{t('invalid')}</p>}
        {row && <Confirmation t={t} />}
        <button type="submit">{t(row ? 'save' : 'create')}</button>
      </fieldset>
      <button type="button" onClick={close}>
        {t('cancel')}
      </button>
    </form>
  );
}
