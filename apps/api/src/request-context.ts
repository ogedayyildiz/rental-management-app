import { randomUUID } from 'node:crypto';
const correlation = new WeakMap<object, string>();
export function requestId(request: object): string {
  let id = correlation.get(request);
  if (!id) {
    id = randomUUID();
    correlation.set(request, id);
  }
  return id;
}
