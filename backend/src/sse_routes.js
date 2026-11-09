// src/sse_routes.js
import { getSession } from './auth.js';
import { registerSseClient } from './alerts.js';

/**
 * GET /api/alerts/stream
 * Server-Sent Events endpoint for real-time alert notifications.
 * Authenticated via session cookie only (no CSRF header required for GET).
 */
export async function handleAlertsSse(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthenticated' }));
  }

  registerSseClient(res, req);
}
