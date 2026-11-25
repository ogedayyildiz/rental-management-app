'use client';
import { useEffect, useState } from 'react';
import {
  createMaintenanceClient,
  createMachineClient,
} from '@rental/api-client';
import {
  maintenancePlanSchema,
  maintenanceTypeSchema,
} from '@rental/validation';
import type { MachineView, WorkOrderView } from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
const api = createMaintenanceClient('/api/backend');
const machinesApi = createMachineClient('/api/backend');
type Plan = Awaited<ReturnType<typeof api.plans>>[number];
export function MaintenancePlans({
  org,
  locale,
  canCreate,
  onCreated,
  revision,
  initialMachine = '',
  canManage = false,
  canBrowseMachines = false,
}: {
  org: string;
  locale: Locale;
  canCreate: boolean;
  onCreated: (row: WorkOrderView) => Promise<void>;
  revision: string | undefined;
  initialMachine?: string;
  canManage?: boolean;
  canBrowseMachines?: boolean;
}) {
  const [plans, setPlans] = useState<Plan[]>([]),
    [machines, setMachines] = useState<MachineView[]>([]),
    [machineId, setMachineId] = useState(initialMachine),
    [schedules, setSchedules] = useState<
      Awaited<ReturnType<typeof api.schedules>>
    >([]),
    [edit, setEdit] = useState<Plan | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const t = (key: TranslationKey) => translate(locale, key);
  async function refresh() {
    setPlans(await api.plans(org));
    if (machineId) setSchedules(await api.schedules(org, machineId));
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(false);
    try {
      await work();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api.plans(org),
      canBrowseMachines
        ? machinesApi.list(
            org,
            new URLSearchParams({ limit: '100', lifecycleState: 'ACTIVE' }),
          )
        : Promise.resolve({ items: [] }),
    ])
      .then(([p, m]) => {
        if (alive) {
          setPlans(p);
          setMachines(m.items);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [org, canBrowseMachines]);
  useEffect(() => {
    let alive = true;
    if (machineId)
      void api
        .schedules(org, machineId)
        .then((value) => {
          if (alive) setSchedules(value);
        })
        .catch(() => {
          if (alive) setError(true);
        });
    return () => {
      alive = false;
    };
  }, [org, machineId, revision]);
  const opts = (values: readonly string[]) =>
    values.map((value) => (
      <option key={value} value={value}>
        {t(('maintenance.' + value) as TranslationKey)}
      </option>
    ));
  return (
    <section className="rental-panel" aria-label={t('maintenance.plans')}>
      <h2>{t('maintenance.plans')}</h2>
      {error && <p role="alert">{t('maintenance.error')}</p>}
      <fieldset disabled={busy}>
        <label>
          {t('rentals.machines')}
          <select
            value={machineId}
            onChange={(e) => {
              const id = e.target.value;
              setMachineId(id);
              setSchedules([]);
              if (id)
                void run(async () =>
                  setSchedules(await api.schedules(org, id)),
                );
            }}
          >
            <option value="">{t('rentals.choose')}</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fleetNumber} · {m.manufacturer} {m.model}
              </option>
            ))}
          </select>
        </label>
        {machineId && canManage && (
          <form
            aria-label={t('maintenance.planAssign')}
            className="rental-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api.saveSchedule(org, {
                  machineId,
                  planId: f.get('planId'),
                  nextDueAt: new Date(
                    String(f.get('nextDueAt')) + 'Z',
                  ).toISOString(),
                });
                await refresh();
              });
            }}
          >
            <label>
              {t('maintenance.plans')}
              <select name="planId" required>
                {plans
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('maintenance.nextDue')}
              <input type="datetime-local" name="nextDueAt" required />
            </label>
            <button>{t('maintenance.planAssign')}</button>
          </form>
        )}
        {schedules.map((s) => {
          const plan = plans.find((p) => p.id === s.planId);
          return (
            <article key={s.id} aria-label={s.planName}>
              <p>
                {s.planName} · <time dateTime={s.nextDueAt}>{s.nextDueAt}</time>{' '}
                ·{' '}
                {t(
                  s.active && plan?.active
                    ? 'maintenance.planActive'
                    : 'maintenance.planInactive',
                )}
              </p>
              {canManage && plan?.active && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await api.saveSchedule(org, {
                        machineId: s.machineId,
                        planId: s.planId,
                        nextDueAt: s.nextDueAt,
                        active: !s.active,
                      });
                      await refresh();
                    })
                  }
                >
                  {t(
                    s.active ? 'maintenance.unassign' : 'maintenance.reassign',
                  )}
                </button>
              )}
              {canCreate && s.active && plan?.active && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const machine = machines.find(
                        (m) => m.id === s.machineId,
                      );
                      if (!machine) throw Error();
                      await onCreated(
                        await api.create(org, {
                          machineId: s.machineId,
                          branchId: machine.branchId,
                          machinePlanId: s.id,
                          title: plan.name,
                          type: plan.type,
                          description: plan.description,
                          impact: plan.impact,
                          dueAt: s.nextDueAt,
                          checklist: plan.checklist,
                        }),
                      );
                    })
                  }
                >
                  {t('maintenance.planCreateWork')}
                </button>
              )}
            </article>
          );
        })}
        {plans.map((p) => (
          <article key={p.id} aria-label={p.name}>
            <p>{p.name}</p>
            <p>
              {p.interval}{' '}
              {t(('maintenance.' + p.intervalUnit) as TranslationKey)} ·{' '}
              {t(('maintenance.' + p.intervalBasis) as TranslationKey)} ·{' '}
              {t(
                p.active
                  ? 'maintenance.planActive'
                  : 'maintenance.planInactive',
              )}
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setEdit(p);
                  setVersion((v) => v + 1);
                }}
              >
                {t('maintenance.planEdit')}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    await api.savePlan(
                      org,
                      maintenancePlanSchema
                        .strip()
                        .parse({ ...p, active: !p.active }),
                      p.id,
                    );
                    await refresh();
                  })
                }
              >
                {t(
                  p.active
                    ? 'maintenance.planDeactivate'
                    : 'maintenance.planActivate',
                )}
              </button>
            )}
          </article>
        ))}
        {canManage && (
          <form
            key={version}
            aria-label={t('maintenance.calendarPlan')}
            className="rental-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api.savePlan(
                  org,
                  maintenancePlanSchema.strip().parse({
                    ...edit,
                    ...Object.fromEntries(f),
                    interval: Number(f.get('interval')),
                    checklist: String(f.get('checklist') ?? '')
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }),
                  edit?.id,
                );
                setEdit(null);
                setVersion((v) => v + 1);
                await refresh();
              });
            }}
          >
            <label>
              {t('maintenance.planName')}
              <input name="name" defaultValue={edit?.name ?? ''} required />
            </label>
            <label>
              {t('maintenance.type')}
              <select name="type" defaultValue={edit?.type ?? 'PREVENTIVE'}>
                {opts(maintenanceTypeSchema.options)}
              </select>
            </label>
            <label>
              {t('maintenance.interval')}
              <input
                name="interval"
                type="number"
                min="1"
                defaultValue={edit?.interval ?? ''}
                required
              />
            </label>
            <label>
              {t('maintenance.intervalUnit')}
              <select
                name="intervalUnit"
                defaultValue={edit?.intervalUnit ?? 'DAYS'}
              >
                {opts(['DAYS', 'MONTHS'])}
              </select>
            </label>
            <label>
              {t('maintenance.intervalBasis')}
              <select
                name="intervalBasis"
                defaultValue={edit?.intervalBasis ?? 'COMPLETION'}
              >
                {opts(['COMPLETION', 'SCHEDULED'])}
              </select>
            </label>
            <label>
              {t('maintenance.checklist')}
              <textarea
                name="checklist"
                defaultValue={edit?.checklist.join('\n') ?? ''}
              />
            </label>
            <button>{t('customers.save')}</button>
            {edit && (
              <button
                type="button"
                onClick={() => {
                  setEdit(null);
                  setVersion((v) => v + 1);
                }}
              >
                {t('rentals.cancel')}
              </button>
            )}
          </form>
        )}
      </fieldset>
    </section>
  );
}
