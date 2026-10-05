# Fleet & Rentals

GPS tracking and rental management for construction and industrial equipment rental companies. It has a web dashboard for the office and a mobile app for the field, both fed by live telemetry from the machines' GPS hardware.

Design decisions, the data model and the scaling plan are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's in the repo

```
apps/
  api/          NestJS REST API + Socket.IO live feed
  ingestion/    Telemetry ingestion: MQTT → Redis Stream → TimescaleDB
  simulator/    Fake GPS fleet that publishes MQTT (development only)
  web/          Next.js dashboard (live map, machines, maintenance)
  mobile/       Expo / React Native app (machine list and details)
packages/
  shared/       Types, Zod schemas, enums and business rules used everywhere
  db/           Drizzle schema, SQL migrations, seed script
infra/
  docker-compose.yml   PostgreSQL + TimescaleDB + PostGIS, Redis, Mosquitto (MQTT)
```

## Running it locally

Requirements: **Node 22+**, **pnpm 10+** (`corepack enable`), **Docker**.

```bash
pnpm install
cp .env.example .env    # Windows PowerShell: copy .env.example .env

pnpm infra:up        # Postgres/Timescale/PostGIS, Redis, MQTT broker
pnpm db:migrate      # create tables, hypertable, row-level security
pnpm db:seed         # demo company: 50 machines, customers, contracts, maintenance plans

pnpm dev             # API :4000, ingestion, web :3000 (watch mode)
pnpm simulate        # in a second terminal: 50 fake GPS devices start reporting
```

Then open http://localhost:3000. Machines appear on the live map within a few seconds and move as the simulator publishes.

**Mobile:** `cd apps/mobile && pnpm start`, then open the app in Expo Go or a development build. On a real phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local` to your computer's LAN address (for example `http://192.168.1.20:4000`).

### Useful commands

| Command | What it does |
|---|---|
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test` | Run across all packages (Turborepo) |
| `pnpm db:generate` | Generate a migration after changing `packages/db/src/schema` |
| `pnpm db:seed` | Reset the demo company's data |
| `pnpm infra:down` | Stop the containers (data is kept in a Docker volume) |
| `SIM_DEVICE_COUNT=500 SIM_INTERVAL_MS=1000 pnpm simulate` | Heavier load (run `db:seed` with the same count first) |

### API endpoints

All routes live under `/api`. Until authentication is added, requests act as the demo company (`DEV_ORG_ID`). In development you can switch company with an `x-organization-id` header.

| Route | |
|---|---|
| `GET /health` | Database and Redis check |
| `GET /dashboard/summary` | Fleet counts, utilization, active errors, maintenance and payment totals |
| `GET /machines` · `POST /machines` | List with live state · create |
| `GET /machines/:id` | Details, current rental, revenue, maintenance cost, error counts |
| `GET /machines/:id/telemetry?from&to&limit` | Raw readings (last 24 h by default) |
| `GET /machines/:id/errors` | Error history |
| `GET /maintenance/plans?status&machineId` | Plans with due status (`ok`, `due_soon`, `overdue`) |
| Socket.IO namespace `/live` | `machine:state` events with each new reading |

## Status

**Working now**
- End-to-end telemetry: simulator → MQTT → ingestion → TimescaleDB, then out to live map updates over WebSocket.
- Multi-tenant database with row-level security, verified in CI.
- Error events open and close automatically from the codes the device reports.
- Maintenance due status by engine hours or calendar days, whichever comes first.
- Revenue per machine, outstanding and collected payments.
- Web dashboard, live map, machine list and detail, maintenance list.
- Mobile machine list and detail with live updates.

**Next up**
- Authentication and user roles (the API currently trusts `DEV_ORG_ID`; production refuses all requests until auth exists).
- Create and edit screens for machines, customers, contracts and payments; record maintenance; check-out and check-in inspections with photos.
- Alert rules and push and email notifications.
- Adapter for the real GPS provider once its API and MQTT details are known (`apps/ingestion/src/providers`).
- Reports: utilization over time and error frequency per machine (the `telemetry_hourly` rollup is already in place).
