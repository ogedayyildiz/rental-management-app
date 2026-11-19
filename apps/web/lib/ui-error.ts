import type { TranslationKey } from '@rental/i18n';
export function safeErrorKey(
  error: unknown,
  fallback: TranslationKey,
): TranslationKey {
  if (!error || typeof error !== 'object') return 'ops.networkError';
  const status = 'status' in error ? error.status : undefined;
  const code = 'code' in error ? error.code : undefined;
  if (status === 401 || code === 'UNAUTHENTICATED') return 'ops.sessionError';
  if (status === 403 || code === 'ACCESS_DENIED') return 'ops.denied';
  if (status === 404 || code === 'NOT_FOUND') return 'ops.recordUnavailable';
  if (code === 'INVALID_TRANSITION') return 'ops.invalidTransition';
  if (code === 'MACHINE_INELIGIBLE') return 'rentals.ineligible';
  if (code === 'RENTAL_CONFLICT') return 'rentals.conflict';
  if (status === 400 || code === 'INVALID_INPUT') return 'ops.validation';
  if ((status === 409 && !code) || code === 'CONFLICT') return 'ops.conflict';
  return fallback;
}
