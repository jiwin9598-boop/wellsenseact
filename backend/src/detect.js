// src/detect.js
import { getDb } from './db.js';
import { triggerAlert } from './alerts.js';

export const THRESHOLDS = {
  ph: { dev: 0.25, jump: 0.15 },
  turbidity: { dev: 0.7, jump: 0.8 },
  tds: { dev: 22, jump: 10 }
};

export const LEARNING_READINGS_COUNT = 48;
export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Exponential Moving Average formula:
 * EMA_new = factor * value + (1 - factor) * EMA_old
 */
export function updateEma(oldVal, newVal, factor = 0.1) {
  if (oldVal === null || oldVal === undefined || isNaN(oldVal)) {
    return newVal;
  }
  return factor * newVal + (1 - factor) * oldVal;
}

/**
 * Process a sensor reading: calculate trend, detect abnormalities,
 * handle cooldown, freeze baseline during flagged anomalies,
 * and dispatch alerts when warranted.
 */
export async function processReading(reading) {
  const db = getDb();
  const { console_id, ph, turbidity, tds, temperature } = reading;
  const now = Date.now();

  // Retrieve or create console stats
  let stats = await db.get('SELECT * FROM console_stats WHERE console_id = ?', console_id);
  if (!stats) {
    await db.run(
      'INSERT INTO console_stats (console_id, reading_count, created_at) VALUES (?, 0, ?)',
      console_id,
      now
    );
    stats = {
      console_id,
      ema_ph: null,
      ema_turbidity: null,
      ema_tds: null,
      ema_temp: null,
      reading_count: 0,
      last_alert_ts: null
    };
  }

  const currentCount = stats.reading_count || 0;
  const newCount = currentCount + 1;
  const inLearningPhase = currentCount < LEARNING_READINGS_COUNT;

  let alertMessage = null;

  if (!inLearningPhase) {
    const lastAlert = stats.last_alert_ts || 0;
    const cooldownElapsed = (now - lastAlert) >= ALERT_COOLDOWN_MS;

    if (cooldownElapsed) {
      // Find previous reading for step jump calculation
      const prev = await db.get(
        'SELECT ph, turbidity, tds, temperature FROM readings WHERE console_id = ? ORDER BY ts DESC, id DESC LIMIT 1 OFFSET 1',
        console_id
      );

      const devPh = stats.ema_ph !== null ? Math.abs(ph - stats.ema_ph) : 0;
      const jumpPh = prev ? Math.abs(ph - prev.ph) : (stats.ema_ph !== null ? Math.abs(ph - stats.ema_ph) : 0);

      const devTurb = stats.ema_turbidity !== null ? Math.abs(turbidity - stats.ema_turbidity) : 0;
      const jumpTurb = prev ? Math.abs(turbidity - prev.turbidity) : (stats.ema_turbidity !== null ? Math.abs(turbidity - stats.ema_turbidity) : 0);

      const devTds = stats.ema_tds !== null ? Math.abs(tds - stats.ema_tds) : 0;
      const jumpTds = prev ? Math.abs(tds - prev.tds) : (stats.ema_tds !== null ? Math.abs(tds - stats.ema_tds) : 0);

      if (devTurb > THRESHOLDS.turbidity.dev || jumpTurb > THRESHOLDS.turbidity.jump) {
        alertMessage = 'Something changed: turbidity increased. Get the water tested properly.';
      } else if (devPh > THRESHOLDS.ph.dev || jumpPh > THRESHOLDS.ph.jump) {
        alertMessage = 'Something changed: pH shifted. Get the water tested properly.';
      } else if (devTds > THRESHOLDS.tds.dev || jumpTds > THRESHOLDS.tds.jump) {
        alertMessage = 'Something changed: dissolved minerals shifted. Get the water tested properly.';
      }
    }
  }

  if (alertMessage) {
    // When alert is triggered: DON'T update EMA (freeze baseline during flagged reading)
    await db.run(
      `UPDATE console_stats SET
         reading_count = ?,
         last_alert_ts = ?
       WHERE console_id = ?`,
      newCount,
      now,
      console_id
    );

    // Record alert in alerts table
    const result = await db.run(
      `INSERT INTO alerts (console_id, message, triggered_at, checked, created_at)
       VALUES (?, ?, ?, 0, ?)`,
      console_id,
      alertMessage,
      now,
      now
    );

    const alert = {
      id: result.lastID,
      console_id,
      message: alertMessage,
      triggered_at: now,
      checked: 0,
      created_at: now
    };

    await triggerAlert(alert);
    return alert;
  } else {
    // No alert triggered: update EMA normally
    const factor = 0.1;
    const newEmaPh = updateEma(stats.ema_ph, ph, factor);
    const newEmaTurb = updateEma(stats.ema_turbidity, turbidity, factor);
    const newEmaTds = updateEma(stats.ema_tds, tds, factor);
    const newEmaTemp = updateEma(stats.ema_temp, temperature, factor);

    await db.run(
      `UPDATE console_stats SET
         ema_ph = ?,
         ema_turbidity = ?,
         ema_tds = ?,
         ema_temp = ?,
         reading_count = ?
       WHERE console_id = ?`,
      newEmaPh,
      newEmaTurb,
      newEmaTds,
      newEmaTemp,
      newCount,
      console_id
    );

    return null;
  }
}
