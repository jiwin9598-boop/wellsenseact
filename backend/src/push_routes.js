// src/push_routes.js
import { getDb } from './db.js';
import { requireAuth, parseJsonBody } from './auth.js';
import { storePushSubscription, getVapidPublicKey } from './alerts.js';

/**
 * POST /api/push/subscribe
 * Register a Web Push subscription for a user's console.
 */
export async function handleSubscribe(req, res) {
  const session = await requireAuth(req, res, true);
  if (!session) return;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
  }

  const { consoleId, subscription } = body;
  if (!consoleId || !subscription) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'consoleId and subscription are required' }));
  }

  const db = getDb();
  const consoleRow = await db.get(
    'SELECT id FROM consoles WHERE id = ? AND user_id = ?',
    consoleId,
    session.userId
  );

  if (!consoleRow) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'You do not have access to this console' }));
  }

  await storePushSubscription(consoleId, subscription);

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

/**
 * GET /api/push/vapid-key
 * Return the VAPID public key for Web Push subscription setup.
 */
export async function handleGetVapidKey(req, res) {
  const publicKey = getVapidPublicKey();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ publicKey }));
}
