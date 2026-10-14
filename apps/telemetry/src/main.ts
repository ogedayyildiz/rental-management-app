import { createServer } from 'node:http';
import { readServiceEnvironment } from '@rental/config';

const { host, port } = readServiceEnvironment(
  process.env,
  'TELEMETRY_PORT',
  3002,
);

// Liveness only: ingestion/job processing is intentionally not implemented.
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'telemetry' }));
    return;
  }
  response.writeHead(404);
  response.end();
});

server.on('error', () => {
  console.error(
    JSON.stringify({ event: 'server_failed', service: 'telemetry' }),
  );
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.info(
    JSON.stringify({ event: 'listening', service: 'telemetry', port }),
  );
});

function shutdown(): void {
  server.close();
  server.closeIdleConnections();
  const deadline = setTimeout(() => {
    server.closeAllConnections();
  }, 5000);
  deadline.unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
