'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  machineCreateSchema,
  machinePatchSchema,
  machineServiceStateSchema,
} from '@rental/validation';
import type { MachineView } from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
export const machineTextFields = [
  'fleetNumber',
  'manufacturer',
  'model',
  'category',
  'serialNumber',
] as const;
export const measurementFields = [
  'workingHeightM',
  'platformHeightM',
  'platformCapacityKg',
  'machineWeightKg',
  'overallLengthM',
  'overallWidthM',
  'stowedHeightM',
] as const;
export const specificationTextFields = [
  'driveType',
  'powerSource',
  'batteryType',
] as const;
export function MachineForm({
  row,
  branches,
  locale,
  canEditCost,
  canViewCost,
  allBranches,
  busy,
  onSave,
  onCancel,
}: {
  row: MachineView | null;
  branches: { id: string; name: string }[];
  locale: Locale;
  canEditCost: boolean;
  canViewCost: boolean;
  allBranches: boolean;
  busy: boolean;
  onSave: (value: unknown) => Promise<void>;
  onCancel: () => void;
}) {
  const [invalid, setInvalid] = useState<string[]>([]);
  const t = (k: TranslationKey) => translate(locale, k);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      str = (key: string) => String(data.get(key) ?? '').trim();
    const input: Record<string, unknown> = {};
    for (const key of machineTextFields)
      input[key] = str(key) || (key === 'serialNumber' ? null : '');
    input['modelYear'] = str('modelYear') ? Number(str('modelYear')) : null;
    for (const key of ['acquisitionDate', 'ownershipType', 'branchId', 'notes'])
      input[key] = str(key) || null;
    input['serviceState'] = str('serviceState');
    if (canEditCost) {
      input['acquisitionCost'] = str('acquisitionCost') || null;
      input['currency'] = str('currency') || null;
    }
    const specifications: Record<string, unknown> = {};
    for (const key of measurementFields)
      if (str(key)) specifications[key] = Number(str(key));
    for (const key of specificationTextFields)
      if (str(key)) specifications[key] = str(key);
    input['specifications'] = specifications;
    // Defaults stay server-side; users without financial write access do not submit hidden money fields.
    const result = (row ? machinePatchSchema : machineCreateSchema).safeParse(
      input,
    );
    if (!result.success) {
      setInvalid(
        result.error.issues.map((issue) => String(issue.path[0] ?? '')),
      );
      return;
    }
    setInvalid([]);
    await onSave(input);
  }
  const field = (name: (typeof machineTextFields)[number]) => (
    <label key={name}>
      {t(`machines.${name}`)}
      {name !== 'serialNumber' ? ' *' : ''}
      <input
        name={name}
        required={name !== 'serialNumber'}
        maxLength={name === 'fleetNumber' ? 100 : 200}
        defaultValue={row?.[name] ?? ''}
        aria-invalid={invalid.includes(name)}
      />
    </label>
  );
  return (
    <form onSubmit={submit} className="machine-form">
      <fieldset disabled={busy}>
        <legend>{t(row ? 'machines.edit' : 'machines.create')}</legend>
        {invalid.length > 0 && <p role="alert">{t('machines.invalid')}</p>}
        <div className="machine-grid">
          {machineTextFields.map(field)}
          <label>
            {t('machines.modelYear')}
            <input
              name="modelYear"
              type="number"
              min="1"
              max="9999"
              step="1"
              defaultValue={row?.modelYear ?? ''}
            />
          </label>
          <label>
            {t('machines.branchId')}
            <select
              name="branchId"
              defaultValue={row?.branchId ?? ''}
              required={!allBranches}
            >
              {allBranches && <option value="">{t('machines.none')}</option>}
              {row?.branchId &&
                !branches.some((branch) => branch.id === row.branchId) && (
                  <option value={row.branchId} disabled>
                    {row.branchName}
                  </option>
                )}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('machines.serviceState')}
            <select
              name="serviceState"
              defaultValue={row?.serviceState ?? 'NORMAL'}
            >
              {machineServiceStateSchema.options.map((s) => (
                <option key={s} value={s}>
                  {t(`machines.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('machines.ownershipType')}
            <select
              name="ownershipType"
              defaultValue={row?.ownershipType ?? ''}
            >
              <option value="">—</option>
              {(['OWNED', 'LEASED', 'THIRD_PARTY'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`machines.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('machines.acquisitionDate')}
            <input
              type="date"
              name="acquisitionDate"
              defaultValue={row?.acquisitionDate ?? ''}
            />
          </label>
          {canEditCost && (
            <>
              <label>
                {t('machines.acquisitionCost')}
                <input
                  name="acquisitionCost"
                  inputMode="decimal"
                  defaultValue={canViewCost ? (row?.acquisitionCost ?? '') : ''}
                  aria-invalid={invalid.includes('acquisitionCost')}
                />
              </label>
              <label>
                {t('machines.currency')}
                <input
                  name="currency"
                  maxLength={3}
                  defaultValue={canViewCost ? (row?.currency ?? '') : ''}
                  aria-invalid={invalid.includes('currency')}
                />
              </label>
            </>
          )}
        </div>
        <p>{t('machines.branchHint')}</p>
        <h3>{t('machines.specs')}</h3>
        <p>{t('machines.specHint')}</p>
        <div className="machine-grid">
          {measurementFields.map((k) => (
            <label key={k}>
              {t(`machines.${k}`)}
              <input
                name={k}
                type="number"
                step="any"
                min="0"
                defaultValue={row?.specifications[k] ?? ''}
                aria-invalid={invalid.includes('specifications')}
              />
            </label>
          ))}
          {specificationTextFields.map((k) => (
            <label key={k}>
              {t(`machines.${k}`)}
              <input
                name={k}
                maxLength={100}
                defaultValue={row?.specifications[k] ?? ''}
              />
            </label>
          ))}
        </div>
        <label>
          {t('machines.notes')}
          <textarea
            name="notes"
            maxLength={5000}
            defaultValue={row?.notes ?? ''}
          />
        </label>
        <div className="machine-actions">
          <button type="submit">{t('machines.save')}</button>
          <button type="button" onClick={onCancel}>
            {t('machines.cancel')}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
