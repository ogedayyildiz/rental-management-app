import type { PrismaClient } from './index.js';

/** Runtime accounts cannot edit this operator-owned environment binding. */
export async function assertDeploymentDatabase(
  db: Pick<PrismaClient, '$queryRaw'>,
  environment: string,
  deploymentId: string,
): Promise<void> {
  const identity = await db.$queryRaw<
    { environment: string; deploymentId: string }[]
  >`
    SELECT environment, "deploymentId" FROM "DeploymentIdentity" WHERE id = 1`;
  const privileges = await db.$queryRaw<{ unsafe: boolean }[]>`
    SELECT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication
      OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
      OR pg_has_role(current_user, (SELECT datdba FROM pg_database WHERE datname = current_database()), 'MEMBER')
      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND pg_has_role(current_user, c.relowner, 'MEMBER'))
      OR has_schema_privilege(current_user, 'public', 'CREATE')
      OR has_table_privilege(current_user, '"AuditEvent"', 'UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege(current_user, '"DeploymentIdentity"', 'INSERT,UPDATE,DELETE,TRUNCATE')
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = '"AuditEvent"'::regclass
        AND tgname IN ('audit_event_no_change', 'audit_event_no_truncate') AND tgenabled = 'O') <> 2
    ) AS unsafe FROM pg_roles r WHERE r.rolname = current_user`;
  if (
    identity.length !== 1 ||
    identity[0]?.environment !== environment ||
    identity[0]?.deploymentId !== deploymentId ||
    privileges.length !== 1 ||
    privileges[0]?.unsafe !== false
  )
    throw new Error('Deployment database safety check failed');
}
