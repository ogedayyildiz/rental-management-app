# @rental/database

Backend-only Prisma schema, migrations, and controlled database access.

Contains the identity, organization, access, branch and audit persistence foundation.
It must only be imported by backend code. Generated Prisma code is ignored and
rebuilt by `generate`, `build` and `typecheck`.

From the repository root:

```sh
pnpm db:migrate
pnpm db:seed
```

`db:migrate` applies committed migrations without resetting data. `db:migrate:dev`
is for authoring future migrations against development databases only; inspect
generated SQL before committing. Never use schema push or reset for deployment.
Prisma's URL comes from the root `.env` or `DATABASE_URL`. Runtime connections
use the PostgreSQL adapter. Generation and builds do not require a running DB.

Migrations also contain SQL constraints and append-only audit triggers that Prisma
cannot express. Preserve them when evolving the schema. This phase creates no
Timescale hypertables; the existing extension remains installed.

The idempotent seed inserts only the essential tenant/platform permission catalog.
It does not create users, organizations, memberships, roles or default credentials.

See [foundation implementation notes](../../docs/12-FOUNDATION-IMPLEMENTATION.md).
