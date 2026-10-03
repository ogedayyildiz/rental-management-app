# Architecture & Design Decisions

GPS tracking + rental management platform. Web app for desktop, React Native app for mobile.

## 1. Product decisions

| Topic | Decision |
|---|---|
| Customers | First our own rental company, later sold as **multi-tenant SaaS** |
| Scale | 100 – 10,000 machines per tenant, telemetry **every 60 s** per machine |
| Telemetry transport | **MQTT** primarily; REST polling / webhooks must also be pluggable |
| Users | **Internal staff only** (no customer portal) |
| Invoicing | **Out of scope.** We store contracts and track payments (expected vs received). Invoicing will be a separate module/integration later |

## 2. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (end to end) |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (React), Tailwind CSS, shadcn/ui, TanStack Query |
| Mobile | React Native with Expo |
| Maps | MapLibre GL (web + mobile), MapTiler / OSM tiles |
| Charts | Apache ECharts |
| API | NestJS (REST + WebSocket gateway) |
| Validation | Zod (shared between server and clients) |
| DB | PostgreSQL + PostGIS + TimescaleDB |
| ORM | Drizzle |
| Cache / jobs / streams | Redis, BullMQ, Redis Streams |
| MQTT client | mqtt.js (broker: provider-hosted, or EMQX if we host it) |
| Auth | Better Auth (self-hosted, org/role support) |
| Notifications | Expo Push, email via Resend / AWS SES |
| Files | S3-compatible storage (contracts, photos, service docs) |
| Testing | Vitest, Playwright |
| Infra | Docker, GitHub Actions CI |

## 3. System overview

```
 GPS hardware ──► Provider MQTT broker / REST API
                          │
                          ▼
              ┌───────────────────────┐
              │  Ingestion service     │  provider adapters (MQTT / REST poll / webhook)
              │  - normalize payload   │  → common TelemetryPoint format
              │  - map device→machine  │
              └──────────┬────────────┘
                         ▼
                   Redis Stream  (buffer, absorbs bursts & DB downtime)
                         │
          ┌──────────────┼──────────────────┐
          ▼              ▼                  ▼
   DB writer        State updater       Alert evaluator
  (batch COPY      (machine_state,     (error codes, low SoC,
  → hypertable)     live map push)      geofence, overdue)
                         │                  │
                         ▼                  ▼
                 WebSocket gateway    Notifications (push / email)
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
       Web (Next.js)            Mobile (Expo)
            ▲                         ▲
            └──────── REST API (NestJS) ┘
                         │
                PostgreSQL + PostGIS + TimescaleDB
```

The ingestion service runs as its **own process** so it can scale independently of the API.

### Load estimate

| Machines | Messages / s | Rows / day | Raw size / day (~150 B/row, before compression) |
|---|---|---|---|
| 100 | 1.7 | 144 k | ~22 MB |
| 10,000 | 167 | 14.4 M | ~2.2 GB |
| 50,000 (several SaaS tenants) | 833 | 72 M | ~11 GB |

TimescaleDB compression (typically 10–20×) plus the retention policy below keeps this manageable on a single well-sized Postgres instance for a long time.

### Telemetry storage strategy

- `telemetry` **hypertable**, partitioned by time, chunk = 1 day, compressed after 7 days.
- **Retention:** raw 1-minute data kept 90 days (configurable per plan).
- **Continuous aggregates:** hourly and daily rollups (distance, operating hours, min/avg SoC, error counts) kept indefinitely, so reports and charts read from these instead of the raw table.
- **`machine_state`** table (1 row per machine) holds the latest position/SoC/status, so the live map never scans the hypertable. It is also cached in Redis.

### Provider adapter interface

```ts
interface TelemetryProvider {
  id: string;                                   // e.g. "acme-gps"
  start(onPoint: (p: TelemetryPoint) => void): Promise<void>;
  stop(): Promise<void>;
}

interface TelemetryPoint {
  deviceExternalId: string;
  recordedAt: Date;
  lat?: number; lon?: number; speedKmh?: number; heading?: number;
  batterySoc?: number;            // %
  engineHours?: number;
  ignition?: boolean;
  errorCodes?: string[];
  raw: unknown;                   // original payload, kept for debugging
}
```

Adapters: `MqttProvider`, `RestPollingProvider`, `WebhookProvider`. Swapping or adding a hardware vendor means writing one adapter.

## 4. Multi-tenancy

Built in from day one, even though tenant #1 is our own company. Adding it later would mean rewriting most of the app.

- Every business table has `organization_id`.
- PostgreSQL **Row-Level Security** enforces isolation. The API sets `app.current_org` per request, so a missed `WHERE` clause cannot leak data.
- Roles per membership: `owner`, `admin`, `fleet_manager`, `technician`, `finance`, `viewer`.
- A separate platform super-admin role for the SaaS operator.

## 5. Data model (first draft)

### Core / tenancy
- **organizations**: id, name, plan, timezone, currency, settings
- **users**: id, name, email, phone
- **memberships**: user_id, organization_id, role
- **depots**: id, org, name, address, location (PostGIS point)

### Fleet
- **machine_models**: id, org, manufacturer, model, category (excavator, scissor lift, generator…), specs (jsonb)
- **machines**: id, org, model_id, name / fleet number, serial_no, year, purchase_date, purchase_price, home_depot_id, status (`available` · `reserved` · `rented` · `maintenance` · `out_of_service` · `retired`), engine_hours_offset, notes
- **gps_devices**: id, org, provider, external_id, machine_id (nullable), installed_at, active
- **machine_state**: machine_id (PK), last_seen_at, location, speed, soc, engine_hours, ignition, active_error_count, online (bool)
- **telemetry** *(hypertable)*: time, org, machine_id, location, speed, heading, soc, engine_hours, ignition, raw (jsonb)
- **geofences**: id, org, name, polygon, type (depot, customer site, restricted)

### Errors
- **error_code_catalog**: provider, code, description, severity (`info` · `warning` · `critical`), recommended action
- **error_events**: id, org, machine_id, code, severity, started_at, cleared_at, acknowledged_by, acknowledged_at, note

### Rentals
- **customers**: id, org, company_name, tax_no, address, contacts (jsonb), notes
- **rental_contracts**: id, org, customer_id, contract_no, status (`draft` · `reserved` · `active` · `completed` · `cancelled`), start_date, planned_end_date, actual_end_date, site_address, site_location, terms, total_amount, document_file_id
- **rental_items**: id, contract_id, machine_id, rate_type (`hourly` · `daily` · `weekly` · `monthly`), rate, start_at, end_at, start_engine_hours, end_engine_hours, delivery_fee, amount
- **payments**: id, org, contract_id, amount, due_date, received_at, method, status (`expected` · `received` · `overdue` · `written_off`), reference, note
- **checkin_checkout_reports**: rental_item_id, type (out/in), engine_hours, soc, fuel, photos, damage_notes, signed_by

### Maintenance
- **maintenance_plans**: id, org, machine_id or model_id, name (e.g. "250 h service"), interval_hours, interval_days, warn_before_hours, warn_before_days, last_done_at, last_done_hours
- **maintenance_records**: id, org, machine_id, plan_id (nullable), type (`scheduled` · `repair` · `inspection`), performed_at, engine_hours, cost, technician_id, notes, attachments
- Due-date logic: a plan is due when **either** the hours or the days threshold is reached, whichever comes first.

### Cross-cutting
- **alert_rules**: org, type (low_soc, error_severity, geofence_exit, maintenance_due, rental_overdue, offline), params, recipients
- **notifications**: id, org, user_id, type, payload, read_at
- **files**: id, org, s3_key, mime, owner_type, owner_id
- **audit_log**: org, user_id, action, entity, entity_id, diff, at

## 6. Key metrics per machine

| Metric | Source |
|---|---|
| Availability (now) | `machines.status`, derived from active rental items and open maintenance, not set by hand |
| Utilization % | rented days ÷ available days (calendar), and engine hours ÷ rented hours (actual usage) |
| Error frequency | error_events per 100 engine hours and per month, by severity |
| Revenue earned | Σ rental_items.amount for the machine |
| Revenue collected | payments received, allocated pro rata to the contract's items |
| Outstanding | earned − collected |
| Maintenance cost | Σ maintenance_records.cost |
| Net contribution / ROI | (collected − maintenance cost) ÷ purchase_price |
| Next service due | from maintenance_plans + current engine hours |

## 7. Repository layout (planned)

```
apps/
  api/          NestJS REST + WebSocket gateway
  ingestion/    telemetry ingestion workers
  web/          Next.js dashboard
  mobile/       Expo app
packages/
  shared/       Zod schemas, types, enums
  db/           Drizzle schema, migrations, seed
  api-client/   typed client used by web + mobile
  ui/           shared web UI components
infra/
  docker-compose.yml   postgres+timescale+postgis, redis, emqx (local dev)
docs/
```

## 8. Open questions

- Final telemetry transport and payload format from the hardware provider (sample MQTT topics and payloads needed).
- Does the provider host the MQTT broker, or do devices publish to ours?
- Error code list per machine brand from the provider.
- Default currency and locales (TR / EN?).
- Raw telemetry retention per SaaS plan.
