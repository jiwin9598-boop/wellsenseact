// src/server.js
import http from 'http';
import { router } from './router.js';
import { initDb } from './db.js';
import { initWebPush } from './alerts.js';

const PORT = process.env.PORT || 3000;

/**
 * Create HTTP server instance configured with the application router.
 * Exported for testing (e.g. supertest).
 */
export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch (err) {
      console.error('Unhandled server error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  });
}

/**
 * Initialize database and push notification keys, then start listening.
 */
export async function start(port = PORT) {
  await initDb();
  await initWebPush();

  const server = createServer();
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`WellSense server listening on port ${port}`);
      resolve(server);
    });
  });
}

// Automatically start if executed as main entrypoint
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  process.argv[1].endsWith('server')
);

if (isMainModule && process.env.NODE_ENV !== 'test') {
  start();
}
