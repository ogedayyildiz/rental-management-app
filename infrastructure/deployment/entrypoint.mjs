import { spawn } from 'node:child_process';
// Images cannot be turned into ordinary development/E2E servers by changing environment switches.
if (
  !['staging', 'production'].includes(process.env.DEPLOYMENT_ENV) ||
  process.env.NODE_ENV !== 'production' ||
  Object.keys(process.env).some(
    (key) => key.startsWith('RENTAL_E2E') && process.env[key],
  )
) {
  console.error('{"event":"invalid_deployment_environment"}');
  process.exit(1);
}
const child = spawn(process.execPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true,
});
let timer;
let stopSignal;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopSignal = signal;
    child.kill(signal);
    timer = setTimeout(() => child.kill('SIGKILL'), 25000);
    timer.unref();
  });
child.once('exit', (code, signal) => {
  clearTimeout(timer);
  // Next finishes its cleanup with 128 + the signal number; Nest can re-emit the signal.
  // Normalize only the requested graceful exit. Errors and forced SIGKILL remain failures.
  const expectedCode = stopSignal === 'SIGTERM' ? 143 : 130;
  const orderly =
    stopSignal &&
    (code === 0 ||
      code === expectedCode ||
      (code === null && signal === stopSignal));
  process.exitCode = orderly ? 0 : (code ?? 1);
});
child.once('error', () => {
  console.error('{"event":"process_start_failed"}');
  process.exitCode = 1;
});
