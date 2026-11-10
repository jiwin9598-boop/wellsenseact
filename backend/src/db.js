// src/db.js
// PostgreSQL is used when DATABASE_URL is present (Vercel/Neon).
// SQLite remains available for local development and the existing test suite.
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { Pool } from 'pg';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PATH = process.env.VERCEL ? '/tmp/wellsense.db' : '/data/wellsense.db';
const DB_PATH = process.env.DB_FILE || DEFAULT_DB_PATH;
let db = null;
let pool = null;
let dbMode = null;

const POSTGRES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash BYTEA NOT NULL,
    salt BYTEA NOT NULL,
    totp_encrypted BYTEA,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL,
    csrf_token TEXT NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS consoles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS readings (
    id SERIAL PRIMARY KEY,
    console_id INTEGER NOT NULL REFERENCES consoles(id) ON DELETE CASCADE,
    ph DOUBLE PRECISION NOT NULL,
    turbidity DOUBLE PRECISION NOT NULL,
    tds DOUBLE PRECISION NOT NULL,
    temperature DOUBLE PRECISION NOT NULL,
    battery DOUBLE PRECISION NOT NULL,
    ts DOUBLE PRECISION NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS console_stats (
    console_id INTEGER PRIMARY KEY REFERENCES consoles(id) ON DELETE CASCADE,
    ema_ph DOUBLE PRECISION,
    ema_turbidity DOUBLE PRECISION,
    ema_tds DOUBLE PRECISION,
    ema_temp DOUBLE PRECISION,
    reading_count INTEGER DEFAULT 0,
    last_alert_ts DOUBLE PRECISION,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    console_id INTEGER NOT NULL REFERENCES consoles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    triggered_at DOUBLE PRECISION NOT NULL,
    checked INTEGER DEFAULT 0,
    created_at DOUBLE PRECISION NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    console_id INTEGER NOT NULL REFERENCES consoles(id) ON DELETE CASCADE,
    sub_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS failed_logins (
    id SERIAL PRIMARY KEY,
    username TEXT,
    ip TEXT,
    attempts INTEGER DEFAULT 1,
    lock_until DOUBLE PRECISION
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_readings_console_ts ON readings(console_id, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_alerts_console_triggered ON alerts(console_id, triggered_at DESC);
`;

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createPostgresAdapter(connectionPool) {
  return {
    async get(sql, ...params) {
      const result = await connectionPool.query(toPostgresPlaceholders(sql), params);
      return result.rows[0];
    },
    async all(sql, ...params) {
      const result = await connectionPool.query(toPostgresPlaceholders(sql), params);
      return result.rows;
    },
    async run(sql, ...params) {
      let query = toPostgresPlaceholders(sql);
      const insert = query.match(/^\s*INSERT\s+INTO\s+([a-z_]+)/i);
      // The SQLite code uses result.lastID for new consoles and alerts.
      // console_stats has console_id as its primary key and does not need lastID.
      if (insert && insert[1].toLowerCase() !== 'console_stats' && !/\bRETURNING\b/i.test(query)) {
        query = `${query.trim().replace(/;$/, '')} RETURNING id`;
      }
      const result = await connectionPool.query(query, params);
      return {
        lastID: result.rows?.[0]?.id,
        changes: result.rowCount
      };
    }
  };
}

export async function initDb(customPath = null) {
  // An explicit custom path keeps tests isolated on their in-memory SQLite DB.
  // On Vercel, fail clearly rather than silently using ephemeral SQLite storage.
  const usePostgres = Boolean(process.env.DATABASE_URL) && !customPath;
  if (process.env.VERCEL && !process.env.DATABASE_URL && !customPath) {
    throw new Error('DATABASE_URL is required on Vercel. Connect the Neon database in project environment variables.');
  }

  if (usePostgres) {
    if (!pool) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000
      });
      pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err));
    }

    await pool.query(POSTGRES_SCHEMA);
    db = createPostgresAdapter(pool);
    dbMode = 'postgres';

    const countRow = await db.get('SELECT COUNT(*) AS cnt FROM users');
    if (Number(countRow.cnt) === 0) {
      const adminUser = process.env.ADMIN_USER;
      const adminPass = process.env.ADMIN_PASS;
      if (adminUser && adminPass) {
        const salt = crypto.randomBytes(16);
        const passwordHash = crypto.scryptSync(adminPass, salt, 64);
        await db.run(
          'INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)',
          adminUser,
          passwordHash,
          salt,
          Date.now()
        );
        console.log(`Bootstrap: Created initial admin user '${adminUser}'`);
      } else {
        console.log('No users found in database and ADMIN_USER / ADMIN_PASS not set.');
      }
    }

    return db;
  }

  let filePath = customPath || DB_PATH;
  if (filePath !== ':memory:') {
    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.warn(`Could not create directory for database at ${dir}:`, err.message);
      }
    }
  }

  db = await open({
    filename: filePath,
    driver: sqlite3.Database
  });
  dbMode = 'sqlite';

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash BLOB NOT NULL,
      salt BLOB NOT NULL,
      totp_encrypted BLOB,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash BLOB NOT NULL,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consoles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      console_id INTEGER NOT NULL REFERENCES consoles(id) ON DELETE CASCADE,
      ph REAL NOT NULL,
      turbidity REAL NOT NULL,
      tds REAL NOT NULL,
      temperature REAL NOT NULL,
      battery REAL NOT NULL,
      ts INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS console_stats (
      console_id INTEGER PRIMARY KEY REFERENCES consoles(id) ON DELETE CASCADE,
      ema_ph REAL,
      ema_turbidity REAL,
      ema_tds REAL,
      ema_temp REAL,
      reading_count INTEGER DEFAULT 0,
      last_alert_ts INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      console_id INTEGER NOT NULL REFERENCES consoles(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      triggered_at INTEGER NOT NULL,
      checked INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      console_id INTEGER NOT NULL REFERENCES consoles(id) ON DELETE CASCADE,
      sub_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS failed_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      ip TEXT,
      attempts INTEGER DEFAULT 1,
      lock_until INTEGER
    );
  `);

  const countRow = await db.get('SELECT COUNT(*) as cnt FROM users');
  if (countRow.cnt === 0) {
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    if (adminUser && adminPass) {
      const salt = crypto.randomBytes(16);
      const passwordHash = crypto.scryptSync(adminPass, salt, 64);
      await db.run(
        'INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)',
        adminUser,
        passwordHash,
        salt,
        Date.now()
      );
      console.log(`Bootstrap: Created initial admin user '${adminUser}'`);
    } else {
      console.log('No users found in database and ADMIN_USER / ADMIN_PASS not set.');
    }
  }

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export async function closeDb() {
  if (dbMode === 'postgres' && pool) {
    await pool.end();
    pool = null;
  } else if (dbMode === 'sqlite' && db) {
    await db.close();
  }
  db = null;
  dbMode = null;
}
