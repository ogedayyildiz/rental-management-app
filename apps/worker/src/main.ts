import { createServer } from 'node:http';
import { readServiceEnvironment } from '@rental/config';

const { host, port } = readServiceEnvironment(process.env, 'WORKER_PORT', 3003);

// Liveness only: ingestion/job processing is intentionally not implemented.
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'worker' }));
    return;
  }
  response.writeHead(404);
  response.end();
});

server.on('error', () => {
  console.error(JSON.stringify({ event: 'server_failed', service: 'worker' }));
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.info(JSON.stringify({ event: 'listening', service: 'worker', port }));
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
