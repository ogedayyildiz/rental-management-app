# Hosting provider comparison — first staging deployment

Reviewed: **2026-11-25**. Status: **comparison only; no provider selected or deployment authorized**.
This finalizes `.e2e/28-HOSTING-PROVIDER-DECISION.draft.md` against the merged repository.
It is a procurement framework, not a new architecture decision. The
[deployment plan](27-STAGING-DEPLOYMENT-PLAN.md) owns the release sequence, Auth0 checklist
and configuration inventory; [production readiness](26-STAGING-PRODUCTION-READINESS.md)
owns runtime safeguards, migrations, backups and smoke procedures.

## 1. Merged baseline and working policy

[PR #1](https://github.com/ogedayyildiz/rental-management-app/pull/1) is merged.
Local `main` was fast-forwarded to `origin/main` at
**`586b4eb5e1bfcc1e54254c1c3223d1c4b21dedcc`**, with a clean working tree before
creating `codex/hosting-decision`. The verified feature tip
`5558dee6d5f6b4cb95d499320fd601e07b50bfdf` is a parent of that merge; its complete
application tree and deployment documents are reachable from main.

The actual merged commit's hosted
[Workspace verification run 45622106607](https://github.com/ogedayyildiz/rental-management-app/actions/runs/45622106607)
passed: **199 unit/integration tests, 57 Playwright scenarios**, lint, strict TypeScript,
formatting, full build and the production-container/deployment verification job,
including its PostgreSQL/TimescaleDB backup/restore checks. This is merge-SHA evidence,
not the old feature-branch result. The first container-job attempt failed at the
browser's initial dashboard navigation after readiness/artifact checks. One diagnostic
retry of that job passed on the **unchanged SHA**; the failure did not recur and its
exact browser error was not retained by the existing sanitized logger. Do not describe
it as a confirmed application defect or a code fix. No test was weakened or skipped.

Keep `main` as the stable baseline. New work follows:

```text
main → new codex/* branch → changes → checks → push → PR → CI → normal merge
```

Do not work directly on main, discard local changes or rewrite shared history. Branch
protection remains intentionally deferred by the owner; this supersedes the earlier
recommendation to configure it immediately in docs/27. That document's pre-merge
integration section is a historical inspection record; this section records completion.

## 2. Hosting requirements from the deployed artifacts

The first environment serves UM Kiralama pilot testing, a few users, a small fleet,
development verification and later controlled simulator/hardware experiments. It is
not a high-availability fleet deployment. A **single Linux VM remains technically
sufficient**, subject to an actual staging load/restore drill and the gates below.

### Compute and operating system

| Requirement        | Initial target and acceptance                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU                | **2 x86-64 vCPUs**. Shared CPU is acceptable for the pilot if measured throttling is tolerable. The tested container target is Linux amd64; ARM needs separate verification.                                                                                |
| Memory             | **4 GiB RAM** planning target; confirm advertised GB/GiB units and actual guest memory. Web is capped at 768 MiB and API at 1,024 MiB. Budget about 1.5 GiB for PostgreSQL and 128–256 MiB for currently idle Redis, leaving constrained OS/proxy headroom. |
| VM control         | Root/sudo, SSH keys, persistent volumes, supported namespaces/cgroups and Docker networking. Shared web hosting or a restricted application panel is not equivalent.                                                                                        |
| Host               | Maintained x86-64 Linux with Docker Engine and the Compose plugin. Ubuntu 24.04 LTS is a suitable evaluation baseline, not a required host brand/version.                                                                                                   |
| Builds             | Build immutable commit-labelled images in CI, then transfer/pull them. Do not budget this small VM to run a concurrent CI build or `pnpm dev`.                                                                                                              |
| Optional processes | Leave the `idle-services` profile off initially: worker has no job consumer and telemetry has no production ingress listener. Migrator runs once before application startup.                                                                                |
| Growth             | Resize capability, disk expansion and export/recovery access. 4 vCPU / 8 GiB is a later option if measurements justify it, not an initial requirement.                                                                                                      |

Source artifacts: `infrastructure/deployment/Dockerfile`, `compose.yaml`,
`apps/worker/src/main.ts` and `apps/telemetry/src/main.ts`. PostgreSQL/Redis are not
currently memory-capped/tuned to this budget; validate settings on the selected host.
These budgets do not establish a supported fleet size or simultaneous export capacity.
Use Docker's [supported hosts](https://docs.docker.com/engine/install/) and
[Ubuntu prerequisites](https://docs.docker.com/engine/install/ubuntu/) when selecting an OS.

### Storage, encryption and growth

Plan **approximately 80 GiB of persistent SSD**, on root or a documented root-plus-data
layout, with encrypted off-server backup capacity additional. An advertised 80 GB is
about 74.5 GiB: record the actual usable capacity and headroom. That unit difference
alone does not justify automatically buying a larger VM/disk for this small pilot.
Additional storage is necessary only if the accepted capacity/growth/encryption layout
requires it. NVMe is useful but not mandatory; SSD with reliable persistence is enough.

Budget roughly 15–20 GiB for OS/current and rollback images/release archives, 20–30 GiB
for initial database allocation, plus WAL, temporary data, Redis and backup scratch.
Aim to retain at least 20% free headroom. These are planning allocations, not measured
usage. Keep builds off-host and define retention for obsolete images/local dumps.

Require an operable **encryption-at-rest plan** covering root/configuration, database
storage, snapshots and backups. Provider-managed or operator-managed encryption can
qualify, but key recovery, unattended restart/unlock, rescue and restoration must work.
NVMe, RAID, TLS and Docker volumes do not themselves prove encryption. No verified
root-disk encryption claim is made for any shortlisted product below.

Telemetry has no automatic retention/deletion policy. Measure event/evidence/index
bytes × devices × events/day × retained days, adding WAL and current/fault/history
storage. Do not delete history to fit a cheap disk. Current PDF/XLSX exports are in
memory and streamed through Web; application `/tmp` is ephemeral and capped at 64 MiB.
**No application object-storage bucket or persistent upload directory is required today.**

### Database and Redis

- Use the tested `timescale/timescaledb:2.30.0-pg17` image: **PostgreSQL 17 + TimescaleDB
  in the same cluster/application database**, with **`btree_gist`**. Current FK/migration
  design is not a configuration for two unrelated databases.
- Persistent storage must survive VM/container restart and support reliable fsync.
  Preserve migrator/owner versus restricted runtime roles, immutable audit protections,
  constraints and deployment binding. A host's preinstalled PostgreSQL version does
  not matter when running the container.
- A managed PostgreSQL alternative must prove compatible extensions, role/grant
  privileges and Timescale restore behavior. A generic managed PostgreSQL offer is
  not evidence of compatibility; the initial comparison uses self-managed containers.
- Redis remains **private**, AOF-enabled and `noeviction`. Initially allow roughly
  128–256 MiB RAM and 1 GiB disk. No production job/session/cache consumer currently
  uses it; PostgreSQL remains authoritative. Future queues need their own durability
  and replay verification.

### Network, TLS and public surfaces

```text
Browser → HTTPS :443 → NGINX → private Web :3000 → private API :3001
                                                     ↓
                                  private PostgreSQL/TimescaleDB :5432
                                  private Redis :6379
```

| Requirement    | First staging criterion                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DNS            | One application hostname: `https://<staging-app-domain>`. The Next.js server-side bridge means **no separate public API hostname is needed**.                                                                                                                                  |
| IPv4           | Stable public IPv4, or a verified IPv4-capable edge. Confirm restart/resize/reassignment behavior and any address charge. A floating/failover IP is not required for a single VM.                                                                                              |
| IPv6           | Optional; publish no AAAA until routing, Docker binding, firewall and HTTPS work end-to-end. Current NGINX has no explicit IPv6 listener. An IPv6-only offer needs extra carrier/dependency validation.                                                                        |
| Inbound        | Public TCP 443; SSH 22 restricted to the approved operator/deployment path. Port 80 only if a separately configured ACME challenge/redirect requires it.                                                                                                                       |
| Private        | PostgreSQL 5432, Redis 6379, Web 3000, API 3001, optional telemetry/worker health 3002/3003 and the one-shot migration process. Never expose Docker's socket/API.                                                                                                              |
| Outbound       | Auth0 HTTPS/discovery/JWKS/token/userinfo, DNS, clock synchronization, OS/images/artifact updates, approved backup destination and future monitoring. No mail-server requirement.                                                                                              |
| Transfer       | No measured minimum Mbps/monthly quota is established. Quote included transfer, billing direction, limits and overage; estimate UI/export traffic plus image transfers, nightly backup bytes and restore drills. Dedicated high-bandwidth service is not required by the code. |
| Future ingress | Confirm that approved HTTPS or a separate raw TCP port can be enabled later. Record connection/packet limits. Do not publish any new ingress now.                                                                                                                              |

Keep existing **NGINX**, TLS 1.2/1.3, explicit trusted origin/host rules, security
headers and rate limits. Caddy/Traefik are not required. Let's Encrypt PEM certificates
are compatible, but Compose does not automate issuance/renewal. DNS-01 is one option;
HTTP-01 needs port 80 and a challenge handler not currently present. Plan renewal,
reload and expiry monitoring. See [ACME challenge requirements](https://letsencrypt.org/docs/challenge-types/).

Use provider firewall and correct host/Docker forwarding rules; published container
ports can [bypass UFW rules](https://docs.docker.com/engine/network/packet-filtering-firewalls/).
Keep DB/Redis ports unpublished and verify externally after an authorized deployment.
SSH uses keys and approved sources/VPN with protected recovery-console access.

### Backups and recovery acceptance

Require encrypted **off-server** PostgreSQL/TimescaleDB backups, separate credentials
and recoverable keys. Confirm the actual site/failure domain: a second VM folder/disk
is not off-server, and a same-provider snapshot is not automatically an independent
off-site database backup. Proposed retention remains **7 daily / 4 weekly / 12 monthly**
copies, subject to approval. Daily-only exposes up to 24 hours of loss; PITR/WAL and
tighter objectives require an explicit operational choice.

Price storage from compressed dump size × retained copies plus WAL if enabled and
recovery headroom; include download/restore charges. The tested restore uses a new
isolated compatible database, Timescale pre/post-restore hooks, business/telemetry
records and AuditEvent protections. A provider backup is accepted only after restoring
its actual off-server copy. Hosted disposable restore success does not verify a future
provider's encrypted backup, recovery time or production-scale recovery.

## 3. Provider shortlist and quote worksheet

No winner is selected. Catalogue observations below were rechecked against official
pages on **2026-11-25**; product availability and quotes must be reconfirmed before
purchase. **Pending** means not established, not free/included. Docker/Timescale fit
and operational advantages are project-specific judgments, not provider certification.

### Product, region and capacity

| Field               | Radore                                                                             | Hetzner                                                                                      | DigitalOcean                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Country/region      | Türkiye candidate; confirm ordered VM location                                     | EU: Germany or Finland; select exact location                                                | EU: Frankfurt FRA1 or Amsterdam AMS3; confirm product capacity                               |
| Facility            | Official facility page identifies İstanbul/Levent; confirm VM and backup placement | Falkenstein, Nuremberg or Helsinki; region capacity must be checked                          | Confirm selected region and backup placement; do not infer physical site from IP geolocation |
| VM product          | Cloud Server **Disk-Advance**                                                      | Cloud **CPX22**, shared AMD                                                                  | Basic Droplet, **Regular CPU**                                                               |
| 2 CPU / 4 GiB       | Listed 2 Core / 4 GB RAM; guest units and stock pending                            | Listed 2 vCPU / 4 GB RAM; guest units and stock pending                                      | Listed 2 vCPU / 4 GiB RAM; region stock pending                                              |
| CPU architecture    | Require explicit x86-64 confirmation; catalogue does not settle it                 | AMD x86-64 candidate; do not substitute ARM CAX                                              | Require x86-64 Linux image/guest confirmation for ordered Regular plan                       |
| Included disk       | 200 GB NVMe SSD                                                                    | 80 GB NVMe SSD                                                                               | 80 GiB SSD; Regular is not a promise of NVMe                                                 |
| Required extra disk | None indicated by capacity alone; encryption/layout may affect quote               | None automatically; verify usable capacity/headroom before adding a volume or tier           | None indicated by capacity alone; encryption/layout may affect quote                         |
| Base monthly price  | **USD 17 excluding VAT**, catalogue only                                           | **Pending live selected-region quote**; rendered catalogue did not provide a reliable amount | **USD 24**, catalogue base only; tax and extras pending                                      |

Sources: [Radore product](https://radore.com/services/cloud-server),
[Radore facility](https://radore.com/data-center),
[Hetzner product](https://www.hetzner.com/cloud/regular-performance/),
[Hetzner locations](https://docs.hetzner.com/cloud/general/locations/),
[DigitalOcean product](https://www.digitalocean.com/pricing/droplets),
[DigitalOcean regions](https://docs.digitalocean.com/platform/regional-availability/).
The rendered Hetzner catalogue displayed availability warnings; it does not prove
stock in any selected region. London is not an EU location.

### Network, protection and operating fit

| Field                              | Radore                                                                                       | Hetzner                                                                                                      | DigitalOcean                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Public/static IPv4                 | Inclusion, persistence/reassignment and cost pending                                         | Primary IPv4 available, separately billed; current quote pending                                             | Public Droplet IP; optional Reserved IP within a data center. Confirm applicable charges and lifecycle |
| Included traffic                   | Cloud-plan allowance pending; do not reuse dedicated-server figures                          | EU catalogue advertises at least 20 TB; confirm chosen plan                                                  | Selected Basic catalogue lists 4,000 GiB; confirm accounting                                           |
| Overage model                      | Direction, unit, cap/throttle and price pending                                              | Exact billed direction/unit/rate pending; do not infer rate from ambiguous rendered pricing text             | Exact billed direction/unit/rate and backup/restore treatment pending                                  |
| Backup/snapshot options            | Backup service offered; exact cloud snapshot coverage/retention pending                      | Daily server backups and manual snapshots; attached volumes are **not included** in server backups/snapshots | Droplet backups and volume snapshots; quote coverage, schedule and retention separately                |
| Encryption at rest                 | Root/data/snapshot coverage and key custody pending                                          | Root/data/snapshot coverage and key custody pending                                                          | Volumes and volume snapshots documented encrypted; **root disk remains unverified**                    |
| Off-site backup                    | Separate-site Radore backup quote or independent destination; location/access/export pending | Independent encrypted logical backup target; provider object storage is optional, not selected               | Independent encrypted logical backup target; Spaces is optional, not selected                          |
| Linux/Docker                       | Confirm full VM, root/sudo, supported kernel and persistent storage                          | Standard Linux VM is a plausible Compose target; verify actual release                                       | Linux VM is a plausible Compose target; verify actual release                                          |
| TimescaleDB                        | Self-hosted image fits **if** VM/kernel/storage gates pass                                   | Self-hosted image fits; no managed-DB assumption                                                             | Self-hosted image fits; no managed-DB assumption                                                       |
| SLA                                | Product SLA, credits, exclusions and support response pending                                | Product SLA, credits and exclusions pending                                                                  | Product SLA, credits and exclusions pending                                                            |
| Operational complexity             | Operator owns OS, TLS, DB, patches and restore unless separately contracted                  | Same self-managed responsibilities                                                                           | Same self-managed responsibilities                                                                     |
| Migration portability              | Portable Compose/images/logical dumps; confirm export/recovery access                        | Portable Compose/images/logical dumps; snapshot format is not the portability boundary                       | Portable Compose/images/logical dumps; snapshot format is not the portability boundary                 |
| Advantages (judgment)              | Türkiye facility candidate and larger listed disk; local support/routing worth evaluating    | EU region choices and documented VM/network controls                                                         | Explicit 2/4/80 GiB bundle and documented EU/network/storage options                                   |
| Disadvantages/gates (judgment)     | More quote details unresolved; proximity does not guarantee lower latency                    | Quote/stock and root encryption unresolved; shared-CPU variability; independent DB backup still needed       | Root encryption and complete bill unresolved; shared-CPU variability; DB operations still ours         |
| **Complete expected monthly cost** | **Pending itemized quote**                                                                   | **Pending itemized quote**                                                                                   | **Pending itemized quote**                                                                             |

Sources: [Radore backups](https://radore.com/services/backup),
[Hetzner IPv4 pricing model](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/),
[Hetzner backup/snapshot limits](https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/),
[DigitalOcean Reserved IPs](https://docs.digitalocean.com/products/networking/reserved-ips/details/features/),
[DigitalOcean backups](https://docs.digitalocean.com/products/backups/),
[DigitalOcean volume encryption/snapshots](https://docs.digitalocean.com/products/snapshots/how-to/snapshot-volumes/).
Snapshot consistency is not a substitute for application-aware database backup/restore.

Obtain each complete monthly estimate using the same assumptions:

```text
VM + IPv4 + any extra disk/encryption operations
+ snapshots + encrypted off-server backup storage/requests
+ transfer/overage/restore traffic + monitoring + support/operations
+ allocated domain/DNS charges + applicable taxes
```

Record currency, billing interval, commitment, region, quote date, recurring versus
one-off costs and cancellation/export charges. Do not mix tax-inclusive/exclusive
quotes or convert currencies from memory. Base prices above are **not total bills**.
Auth0 entitlement/cost is a separate application dependency common to the comparison;
confirm the staging MFA/identity plan independently. No price ranking is defensible
until the worksheet is complete.

## 4. Türkiye versus EU portability

There is **no technical application requirement forcing Türkiye or EU hosting**.
Region selection does not change business rules, tenant authorization or canonical
telemetry. It changes infrastructure configuration and operational data flows.

| Area                | Practical consideration                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users in Türkiye    | Measure HTTPS latency and errors from actual office/mobile ISPs to candidates; physical proximity alone does not prove routing quality.                                                  |
| Database            | Keep app/DB co-located initially. Business PII, GPS, device/tenant links and backups share one database today; conceptual domain separation is not physical separation or anonymization. |
| Auth0               | Identity-provider tenant/account region remains separate. A Türkiye VM does not relocate Auth0; follow the separate staging-tenant checklist in docs/27.                                 |
| Backups/logs        | Choose physical storage, replication, collector and support-access locations independently; verify key recovery and retention.                                                           |
| Operational support | Compare support language/hours, incident response, recovery access and responsibility for patching/TLS/DB operations.                                                                    |
| GPS/telemetry       | Measure carrier-to-ingress latency/reconnect behavior. GPS coordinates themselves do not require a server in Türkiye; linked location data still requires a data-handling review.        |
| Future providers    | Ruptela proprietary protocol and Xtellio cloud/API remain separate adapters; protocol/account region and routing must be verified with real provider access.                             |
| SIM808              | Actual Turkish carrier/APN/2G connectivity and firmware TLS/DNS behavior matter more than an assumed country restriction. No carrier availability claim is made here.                    |

The current bundled map assets do not require selecting a hosted tile provider.
There is **no legal/KVKK conclusion** here: actual data, provider contracts, support
access and cross-border processing need separate review. Do not equate VM country
with the location of Auth0, backups, monitoring or future provider clouds.

## 5. Future SIM808 proof-of-concept

The merged architecture can support this later flow:

```text
SIM808 → Turkish SIM → GPRS → Internet → authenticated public telemetry ingress
→ trusted device/tenant binding → canonical ingestion application
→ TimescaleDB/current read model → authorized Machine telemetry UI
```

**Topology-compatible does not mean ingress-ready.** The telemetry process currently
serves health/idle readiness only. No production device listener or device credential
provisioning is implemented. The development simulator rejects `NODE_ENV=production`
and non-loopback DB hosts; staging correctly uses production mode. Do not bypass that
guard. Live synthetic staging updates need a separately authorized secured adapter or
staging-safe runner through the same ingestion application, not direct table writes.

Before the experiment, resolve:

1. Public telemetry hostname and selected protocol/port/firewall path. No public API,
   PostgreSQL or Redis access is needed.
2. Device authentication/provisioning/rotation. A device ID or IMEI alone is not
   authentication; tenant/device binding is server-side and Machine resolution uses
   installation history at `recordedAt`.
3. Versioned packet contract: event identity, `recordedAt`, latitude/longitude, GPS
   speed, units, absent values and later canonical CAN-derived values. Payloads must
   not choose arbitrary organization/Machine IDs.
4. Ingress adapter and SIM808 modem/host-controller client, buffering, retries/backoff
   and timestamp handling. Do not assume the modem supplies or decodes the CAN bus.
5. Exact firmware TLS/certificate/SNI/clock compatibility with the TLS 1.2/1.3 edge.
   Test it; do not weaken the application TLS policy for old hardware. Any secure
   gateway or different hardware needs an explicit later decision.
6. Carrier/APN, 2G/GPRS coverage, DNS, outbound Internet and NAT/reconnect tests. The
   proposed device originates traffic; a public/static SIM IP is not intrinsically
   required, but actual carrier restrictions must be checked.
7. Payload limits, per-device rate limiting, replay/idempotency protection, malformed
   input handling, out-of-order behavior and provenance through the canonical boundary.
8. An actual end-to-end hardware demonstration and bounded traffic/storage measurements.
   Simulator/fixture success does not verify hardware, carrier, TLS or production ingress.

No SIM808-specific code, new broker, geofencing or remote-command behavior is introduced.

## 6. Qualification gates and remaining decisions

No evidence currently disqualifies **an entire provider** among Radore, Hetzner and
DigitalOcean. None is fully qualified yet. Reject/defer a particular offer if it lacks
supported Linux/amd64 Docker control, adequate usable memory/persistent storage,
operable encryption/restore, private DB/Redis, controlled HTTPS/SSH/egress or usable
off-server backups. Managed PostgreSQL without required extensions/privileges rules
out that managed product, not necessarily the provider's self-hosted VM. ARM-only,
ephemeral or rigid HTTP-only hosting is not a drop-in match for the current deployment
and future separately authorized TCP ingress.

The single-VM **2 vCPU / 4 GiB / approximately 80 GiB SSD** target remains unchanged.
It has one failure domain: host failure stops the pilot until recovery. No cluster,
dedicated telemetry host or paid object-upload service is justified yet.

Before selecting a provider, obtain/decide:

- Region and acceptable database/backup/log/Auth0 data locations; measured user/carrier latency.
- Exact product, stock, x86-64 guest/RAM/disk details and complete itemized monthly quote.
- Root/data encryption, key/reboot recovery, growth and snapshot coverage.
- Backup destination, retention, acceptable data loss/recovery time and responsible restore operator.
- App domain, DNS/TLS renewal, stable IPv4 and restricted SSH/deployment access.
- OS/patching, monitoring, support ownership and separately configured staging Auth0/accounts.
- Later simulator/ingress scope and real modem/carrier evidence before hardware integration.

This document selects no provider and authorizes no purchase, DNS/Auth0 change or
public deployment. Application business behavior is unchanged.
