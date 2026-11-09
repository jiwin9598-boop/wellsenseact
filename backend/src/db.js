// src/db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PATH = process.env.VERCEL ? '/tmp/wellsense.db' : '/data/wellsense.db';
const DB_PATH = process.env.DB_FILE || DEFAULT_DB_PATH;
let db = null;

export async function initDb(customPath = null) {
  let filePath = customPath || DB_PATH;

  // Ensure directory exists if not an in-memory database
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

  // Bootstrap first admin if users table is empty and env credentials provided
  const countRow = await db.get('SELECT COUNT(*) as cnt FROM users');
  if (countRow.cnt === 0) {
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    if (adminUser && adminPass) {
      const salt = crypto.randomBytes(16);
      const passwordHash = crypto.scryptSync(adminPass, salt, 64);
      const now = Date.now();
      await db.run(
        'INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)',
        adminUser,
        passwordHash,
        salt,
        now
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
  if (db) {
    await db.close();
    db = null;
  }
}
