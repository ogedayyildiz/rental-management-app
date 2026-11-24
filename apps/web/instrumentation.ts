export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateWebEnvironment } = await import('@rental/config');
    validateWebEnvironment(process.env);
  }
}
// Export only coarse diagnostics. Exception messages/URLs may contain tokens or personal data.
export function onRequestError() {
  console.error(JSON.stringify({ event: 'request_failed', service: 'web' }));
}
