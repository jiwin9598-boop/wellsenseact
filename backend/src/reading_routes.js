// src/reading_routes.js
import { getDb } from './db.js';
import { getSession, requireAuth } from './auth.js';

/**
 * Convert range duration string into milliseconds.
 */
function rangeToMs(range) {
  switch (range) {
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

/**
 * GET /api/consoles
 * List all consoles belonging to the authenticated user with last seen timestamp and battery level.
 */
export async function handleListConsoles(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthenticated' }));
  }

  const db = getDb();
  const rows = await db.all(
    `SELECT c.id, c.name, c.created_at,
            (SELECT MAX(ts) FROM readings r WHERE r.console_id = c.id) AS last_seen,
            (SELECT battery FROM readings r WHERE r.console_id = c.id ORDER BY ts DESC, id DESC LIMIT 1) AS battery
     FROM consoles c
     WHERE c.user_id = ?
     ORDER BY c.created_at ASC`,
    session.userId
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
}

/**
 * GET /api/readings?consoleId=...&range=24h|7d|30d
 * Get historical readings for a console within a specified time range.
 */
export async function handleGetReadings(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthenticated' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const consoleIdParam = url.searchParams.get('consoleId');
  const consoleId = Number(consoleIdParam);
  const range = url.searchParams.get('range') || '24h';

  if (consoleIdParam && (!Number.isInteger(consoleId) || consoleId <= 0)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Valid consoleId is required' }));
  }

  const db = getDb();
  if (consoleIdParam) {
    const consoleRow = await db.get(
      'SELECT id FROM consoles WHERE id = ? AND user_id = ?',
      consoleId,
      session.userId
    );

    if (!consoleRow) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }
  }

  const now = Date.now();
  const start = now - rangeToMs(range);

  const rows = consoleIdParam
    ? await db.all(
      `SELECT id, console_id, ph, turbidity, tds, temperature, battery, ts, created_at
       FROM readings
       WHERE console_id = ? AND ts BETWEEN ? AND ?
       ORDER BY ts ASC`,
      consoleId,
      start,
      now
    )
    : await db.all(
      `SELECT id, console_id, ph, turbidity, tds, temperature, battery, ts, created_at
       FROM readings
       WHERE ts BETWEEN ? AND ?
         AND console_id IN (SELECT id FROM consoles WHERE user_id = ?)
       ORDER BY ts ASC`,
      start,
      now,
      session.userId
    );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
}

/**
 * GET /api/alerts
 * List recent alerts for all consoles owned by the authenticated user (limit 50).
 */
export async function handleGetAlerts(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthenticated' }));
  }

  const db = getDb();
  const rows = await db.all(
    `SELECT a.id, a.console_id, c.name AS console_name, a.message, a.triggered_at, a.checked, a.created_at
     FROM alerts a
     JOIN consoles c ON a.console_id = c.id
     WHERE c.user_id = ?
     ORDER BY a.triggered_at DESC
     LIMIT 50`,
    session.userId
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
}

/**
 * POST /api/alerts/:id/check
 * Mark an alert as acknowledged / checked.
 */
export async function handleCheckAlert(req, res) {
  const session = await requireAuth(req, res, true);
  if (!session) return;

  const url = new URL(req.url, 'http://localhost');
  const match = url.pathname.match(/^\/api\/alerts\/(\d+)\/check$/);
  const alertId = match ? Number(match[1]) : null;

  if (!alertId || isNaN(alertId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid alert ID' }));
  }

  const db = getDb();
  const alert = await db.get(
    `SELECT a.id
     FROM alerts a
     JOIN consoles c ON a.console_id = c.id
     WHERE a.id = ? AND c.user_id = ?`,
    alertId,
    session.userId
  );

  if (!alert) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Alert not found or access denied' }));
  }

  await db.run('UPDATE alerts SET checked = 1 WHERE id = ?', alertId);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

/**
 * GET /api/readings/export?consoleId=...&range=24h|7d|30d|all
 * Export readings as CSV: time,ph,turbidity_ntu,tds_ppm,temp_c
 */
export async function handleExportCsv(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthenticated' }));
  }

  const url = new URL(req.url, 'http://localhost');
  const consoleIdParam = url.searchParams.get('consoleId');
  const consoleId = Number(consoleIdParam);
  const range = url.searchParams.get('range');

  if (!consoleIdParam || isNaN(consoleId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Valid consoleId is required' }));
  }

  const db = getDb();
  const consoleRow = await db.get(
    'SELECT id, name FROM consoles WHERE id = ? AND user_id = ?',
    consoleId,
    session.userId
  );

  if (!consoleRow) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Forbidden' }));
  }

  let readings;
  if (range && range !== 'all') {
    const start = Date.now() - rangeToMs(range);
    readings = await db.all(
      `SELECT ph, turbidity, tds, temperature, ts
       FROM readings
       WHERE console_id = ? AND ts >= ?
       ORDER BY ts ASC`,
      consoleId,
      start
    );
  } else {
    readings = await db.all(
      `SELECT ph, turbidity, tds, temperature, ts
       FROM readings
       WHERE console_id = ?
       ORDER BY ts ASC`,
      consoleId
    );
  }

  const header = 'time,ph,turbidity_ntu,tds_ppm,temp_c\r\n';
  const rows = readings.map(r => {
    const timeIso = new Date(r.ts).toISOString();
    return `${timeIso},${r.ph},${r.turbidity},${r.tds},${r.temperature}`;
  }).join('\r\n');

  const csvContent = header + rows;

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="readings-console-${consoleId}.csv"`
  });
  res.end(csvContent);
}
