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
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    child.kill(signal);
    timer = setTimeout(() => child.kill('SIGKILL'), 25000);
    timer.unref();
  });
child.once('exit', (code) => {
  clearTimeout(timer);
  process.exitCode = code ?? 1;
});
child.once('error', () => {
  console.error('{"event":"process_start_failed"}');
  process.exitCode = 1;
});
