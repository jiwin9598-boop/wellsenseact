// src/console.js
import crypto from 'crypto';
import { getDb } from './db.js';
import { requireAuth, parseJsonBody } from './auth.js';
import { processReading } from './detect.js';

export { parseJsonBody };

/**
 * Generate a 256-bit API key and its SHA-256 hex hash
 */
export function generateApiKey() {
  const key = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, hash };
}

/**
 * POST /api/consoles
 * Add a new console for the authenticated user. Returns the API key only once.
 */
export async function handleAddConsole(req, res) {
  const session = await requireAuth(req, res, true);
  if (!session) return;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
  }

  const { name } = body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Console name is required' }));
  }

  const trimmedName = name.trim();
  const { key, hash } = generateApiKey();
  const now = Date.now();
  const db = getDb();

  const result = await db.run(
    'INSERT INTO consoles (user_id, name, api_key_hash, created_at) VALUES (?, ?, ?, ?)',
    session.userId,
    trimmedName,
    hash,
    now
  );

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    id: result.lastID,
    name: trimmedName,
    apiKey: key
  }));
}

/**
 * POST /api/ingest
 * Ingest telemetry reading from a sensor console via Bearer token auth.
 */
export async function handleIngest(req, res) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing or malformed Authorization header' }));
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing bearer token' }));
  }

  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  const db = getDb();
  const consoleRow = await db.get('SELECT id, name, user_id FROM consoles WHERE api_key_hash = ?', keyHash);

  if (!consoleRow) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid API key' }));
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (err) {
    res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
  }

  const ph = payload.ph;
  const turb = payload.turbidity !== undefined ? payload.turbidity : payload.turb;
  const tds = payload.tds;
  const temp = payload.temperature !== undefined ? payload.temperature : payload.temp;
  const battery = payload.battery;
  const ts = payload.ts;

  // Validate sensor value ranges
  const isValidPh = typeof ph === 'number' && !isNaN(ph) && ph >= 0 && ph <= 14;
  const isValidTurb = typeof turb === 'number' && !isNaN(turb) && turb >= 0 && turb <= 500;
  const isValidTds = typeof tds === 'number' && !isNaN(tds) && tds >= 0 && tds <= 2000;
  const isValidTemp = typeof temp === 'number' && !isNaN(temp) && temp >= -30 && temp <= 80;
  const isValidBattery = typeof battery === 'number' && !isNaN(battery) && battery >= 0 && battery <= 100;

  if (!isValidPh || !isValidTurb || !isValidTds || !isValidTemp || !isValidBattery) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'Invalid sensor readings. Expected ph (0-14), turb (0-500), tds (0-2000), temp (-30 to 80), battery (0-100).'
    }));
  }

  // Validate timestamp: allow up to 7 days in the past, or default to current time
  const now = Date.now();
  const providedTs = (typeof ts === 'number' && !isNaN(ts) && ts > 0) ? ts : now;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fiveMinutesInFuture = now + 5 * 60 * 1000;

  if (providedTs < sevenDaysAgo || providedTs > fiveMinutesInFuture) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'Timestamp out of range. Readings may only be up to 7 days in the past.'
    }));
  }

  await db.run(
    `INSERT INTO readings (console_id, ph, turbidity, tds, temperature, battery, ts, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    consoleRow.id,
    ph,
    turb,
    tds,
    temp,
    battery,
    providedTs,
    now
  );

  // Run anomaly detection pipeline
  await processReading({
    console_id: consoleRow.id,
    ph,
    turbidity: turb,
    tds,
    temperature: temp,
    battery,
    ts: providedTs
  });

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}
