// src/alerts.js
import EventEmitter from 'events';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';

export const alertEmitter = new EventEmitter();
// Allow multiple concurrent SSE listeners without warnings
alertEmitter.setMaxListeners(200);

let vapidPublicKey = null;
let vapidPrivateKey = null;

/**
 * Initialize Web Push with VAPID keys loaded from disk or freshly generated.
 */
export async function initWebPush() {
  const privPath = process.env.VAPID_PRIVATE_KEY_FILE || '/data/vapid_private.key';
  const pubPath = process.env.VAPID_PUBLIC_KEY_FILE || '/data/vapid_public.key';

  try {
    if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
      vapidPrivateKey = fs.readFileSync(privPath, 'utf8').trim();
      vapidPublicKey = fs.readFileSync(pubPath, 'utf8').trim();
    } else {
      const generated = webpush.generateVAPIDKeys();
      vapidPublicKey = generated.publicKey;
      vapidPrivateKey = generated.privateKey;

      try {
        const privDir = path.dirname(path.resolve(privPath));
        if (!fs.existsSync(privDir)) fs.mkdirSync(privDir, { recursive: true });
        fs.writeFileSync(privPath, vapidPrivateKey, 'utf8');

        const pubDir = path.dirname(path.resolve(pubPath));
        if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
        fs.writeFileSync(pubPath, vapidPublicKey, 'utf8');
      } catch (writeErr) {
        console.warn(`Could not save VAPID keys to ${privPath}:`, writeErr.message);
      }
    }
  } catch (err) {
    console.warn('Could not read VAPID key files, generating in-memory:', err.message);
    const generated = webpush.generateVAPIDKeys();
    vapidPublicKey = generated.publicKey;
    vapidPrivateKey = generated.privateKey;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@wellsense.local',
    vapidPublicKey,
    vapidPrivateKey
  );
}

/**
 * Return the public VAPID key string.
 */
export function getVapidPublicKey() {
  return vapidPublicKey;
}

/**
 * Store a push subscription for a given console.
 */
export async function storePushSubscription(consoleId, subscription) {
  const db = getDb();
  const subStr = typeof subscription === 'string' ? subscription : JSON.stringify(subscription);

  const existing = await db.get(
    'SELECT id FROM push_subscriptions WHERE console_id = ? AND sub_json = ?',
    consoleId,
    subStr
  );

  if (!existing) {
    await db.run(
      'INSERT INTO push_subscriptions (console_id, sub_json) VALUES (?, ?)',
      consoleId,
      subStr
    );
  }
}

/**
 * Register an SSE client response stream with a 25s keep-alive heartbeat.
 */
export function registerSseClient(res, req = null) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(': connected\n\n');

  const onAlert = (alert) => {
    try {
      res.write(`data: ${JSON.stringify(alert)}\n\n`);
    } catch (e) {
      // Stream error handled in close
    }
  };

  alertEmitter.on('alert', onAlert);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (e) {
      cleanup();
    }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    alertEmitter.off('alert', onAlert);
  }

  res.on('close', cleanup);
  if (req) {
    req.on('close', cleanup);
  }
}

/**
 * Broadcast an alert to SSE clients, send web push notifications, and trigger optional SMS webhook.
 */
export async function triggerAlert(alert) {
  // 1. Broadcast via SSE
  alertEmitter.emit('alert', alert);

  // 2. Broadcast via Web Push
  const db = getDb();
  const subs = await db.all(
    'SELECT id, sub_json FROM push_subscriptions WHERE console_id = ?',
    alert.console_id
  );

  const pushPayload = JSON.stringify({
    title: 'WellSense Water Quality Alert',
    body: alert.message,
    consoleId: alert.console_id,
    triggeredAt: alert.triggered_at,
    url: '/'
  });

  for (const subRow of subs) {
    try {
      const sub = JSON.parse(subRow.sub_json);
      await webpush.sendNotification(sub, pushPayload);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Expired or invalid subscription
        await db.run('DELETE FROM push_subscriptions WHERE id = ?', subRow.id);
      } else {
        console.warn(`Web push error for subscription ${subRow.id}:`, err.message);
      }
    }
  }

  // 3. Optional SMS webhook POST
  if (process.env.SMS_WEBHOOK_URL) {
    try {
      await fetch(process.env.SMS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });
    } catch (err) {
      console.warn('SMS webhook dispatch failed:', err.message);
    }
  }
}
