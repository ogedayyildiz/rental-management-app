// Coalesce the shell and domain workspace reads. Authorization is always rechecked by the API.
let pending: Promise<Response> | undefined;
let loadedAt = 0;
export function invalidateAccount() {
  pending = undefined;
  loadedAt = 0;
}
export async function accountResponse(): Promise<Response> {
  if (!pending || Date.now() - loadedAt > 15000) {
    loadedAt = Date.now();
    pending = fetch('/api/backend/me', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) invalidateAccount();
        return r;
      })
      .catch((e) => {
        invalidateAccount();
        throw e;
      });
  }
  return (await pending).clone();
}
