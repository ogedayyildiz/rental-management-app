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
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopping = true;
    child.kill(signal);
    timer = setTimeout(() => child.kill('SIGKILL'), 25000);
    timer.unref();
  });
child.once('exit', (code, signal) => {
  clearTimeout(timer);
  process.exitCode = code ?? (stopping && signal !== 'SIGKILL' ? 0 : 1);
});
child.once('error', () => {
  console.error('{"event":"process_start_failed"}');
  process.exitCode = 1;
});
