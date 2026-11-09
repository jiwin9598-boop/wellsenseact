// src/auth.js
import { getDb } from './db.js';
import crypto from 'crypto';
import QRCode from 'qrcode';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 encoding for TOTP secrets
 */
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Base32 decoding for TOTP verification
 */
export function base32Decode(str) {
  const cleanStr = str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleanStr.length; i++) {
    const val = BASE32_CHARS.indexOf(cleanStr[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * RFC 6238 TOTP calculation (SHA1, 30s step, 6 digits)
 */
export function generateTotpCode(secretBase32, timeStepOffset = 0) {
  const key = base32Decode(secretBase32);
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30) + timeStepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(timeStep));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, '0');
}

/**
 * Verify TOTP code with +-1 step drift allowance
 */
export function verifyTotp(secretBase32, token) {
  if (!secretBase32 || !token) return false;
  const cleanToken = String(token).trim();
  for (let step = -1; step <= 1; step++) {
    if (generateTotpCode(secretBase32, step) === cleanToken) {
      return true;
    }
  }
  return false;
}

/**
 * Derive 32-byte AES key from APP_SECRET via HKDF
 */
function getEncryptionKey() {
  const appSecret = process.env.APP_SECRET || 'wellsense-default-secret-key-replace-in-env';
  return crypto.hkdfSync('sha256', appSecret, '', 'wellsense-totp-encryption', 32);
}

/**
 * Encrypt plain text using AES-256-GCM
 */
export function encryptSecret(plainText) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decrypt AES-256-GCM buffer to utf8 string
 */
export function decryptSecret(encryptedBuffer) {
  if (!encryptedBuffer || encryptedBuffer.length < 28) return null;
  try {
    const key = getEncryptionKey();
    const iv = encryptedBuffer.subarray(0, 12);
    const tag = encryptedBuffer.subarray(12, 28);
    const ciphertext = encryptedBuffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Failed to decrypt secret:', err.message);
    return null;
  }
}

/**
 * Safely parse JSON request body with byte size limit (defaults to 10KB)
 */
export function parseJsonBody(req, maxSize = 10240) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesRead = 0;
    req.on('data', chunk => {
      bytesRead += chunk.length;
      if (bytesRead > maxSize) {
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (e) {
        const err = new Error('Invalid JSON');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Hash password using scrypt with 16-byte salt and 64-byte key
 */
export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64);
}

/**
 * 256-bit random hex token
 */
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * SHA-256 hash of token
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest();
}

/**
 * 16-byte random hex CSRF token
 */
export function generateCsrf() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Set session cookie
 */
function setSessionCookie(res, token, maxAge = 43200) {
  const parts = [
    `session=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`
  ];
  if (process.env.COOKIE_SECURE === 'true') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Clear session cookie
 */
function clearSessionCookie(res) {
  const parts = [
    'session=',
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0'
  ];
  if (process.env.COOKIE_SECURE === 'true') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Insert new session row into database
 */
export async function createSession(userId) {
  const db = getDb();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const csrf = generateCsrf();
  const now = Date.now();
  const expiresAt = now + 43200 * 1000; // 12 hours (43200 seconds)

  await db.run(
    `INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    tokenHash,
    csrf,
    expiresAt,
    now
  );

  return { token, csrf };
}

/**
 * Retrieve session by parsing cookie and verifying token hash and expiry
 */
export async function getSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  const tokenHash = hashToken(token);
  const db = getDb();
  const row = await db.get(
    `SELECT id, user_id, csrf_token, expires_at FROM sessions WHERE token_hash = ?`,
    tokenHash
  );

  if (!row) return null;

  if (Date.now() > row.expires_at) {
    await db.run('DELETE FROM sessions WHERE id = ?', row.id);
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    csrf: row.csrf_token,
    token
  };
}

/**
 * Require valid session and optionally verify CSRF header for state-changing requests
 */
export async function requireAuth(req, res, requireCsrf = true) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthenticated' }));
    return null;
  }

  if (requireCsrf) {
    const csrfHeader = req.headers['x-wellsense-csrf'];
    if (!csrfHeader || csrfHeader !== session.csrf) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing CSRF token' }));
      return null;
    }
  }

  return session;
}

/**
 * Destroy current session and clear session cookie
 */
export async function destroySession(req, res) {
  const session = await getSession(req);
  if (session) {
    const db = getDb();
    await db.run('DELETE FROM sessions WHERE id = ?', session.id);
  }
  clearSessionCookie(res);
}

/**
 * GET /api/csrf-token
 */
export async function getCsrfToken(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthenticated' }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ csrfToken: session.csrf }));
}

/**
 * GET /api/me
 */
export async function handleMe(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthenticated' }));
  }

  const db = getDb();
  const user = await db.get(
    'SELECT username, totp_encrypted FROM users WHERE id = ?',
    session.userId
  );

  if (!user) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'User not found' }));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    username: user.username,
    hasTotp: Boolean(user.totp_encrypted)
  }));
}

/**
 * Record a failed login attempt; lock if 5 or more attempts for 15 minutes
 */
export async function recordFailedLogin(username, ip) {
  const db = getDb();
  const now = Date.now();
  const row = await db.get(
    `SELECT id, attempts, lock_until FROM failed_logins WHERE (username = ? AND username IS NOT NULL) OR ip = ?`,
    username,
    ip
  );

  if (row) {
    const attempts = row.attempts + 1;
    const lockUntil = attempts >= 5 ? now + 15 * 60 * 1000 : null;
    await db.run(
      `UPDATE failed_logins SET attempts = ?, lock_until = ? WHERE id = ?`,
      attempts,
      lockUntil,
      row.id
    );
  } else {
    await db.run(
      `INSERT INTO failed_logins (username, ip, attempts, lock_until) VALUES (?, ?, ?, ?)`,
      username || null,
      ip,
      1,
      null
    );
  }
}

/**
 * Clear failed login attempts on successful authentication
 */
export async function clearFailedLogins(username, ip) {
  const db = getDb();
  await db.run(
    `DELETE FROM failed_logins WHERE (username = ? AND username IS NOT NULL) OR ip = ?`,
    username,
    ip
  );
}

/**
 * Check if the account or IP address is currently locked out
 */
export async function isLocked(username, ip) {
  const db = getDb();
  const now = Date.now();
  const row = await db.get(
    `SELECT attempts, lock_until FROM failed_logins
     WHERE ((username = ? AND username IS NOT NULL) OR ip = ?) AND lock_until > ?`,
    username,
    ip,
    now
  );
  return Boolean(row);
}

/**
 * POST /api/login
 */
export async function handleLogin(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
  }

  const { username, password, totpCode } = body;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             req.socket.remoteAddress || '127.0.0.1';

  if (!username || !password) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Username and password are required' }));
  }

  if (await isLocked(username, ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.'
    }));
  }

  const db = getDb();
  const user = await db.get(
    'SELECT id, username, password_hash, salt, totp_encrypted FROM users WHERE username = ?',
    username
  );

  if (!user) {
    await recordFailedLogin(username, ip);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid username or password' }));
  }

  const calculatedHash = hashPassword(password, user.salt);
  if (!crypto.timingSafeEqual(calculatedHash, user.password_hash)) {
    await recordFailedLogin(username, ip);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid username or password' }));
  }

  // If user has TOTP enabled, verify the provided TOTP code
  if (user.totp_encrypted) {
    if (!totpCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: 'Authenticator code required',
        totpRequired: true
      }));
    }

    const secret = decryptSecret(user.totp_encrypted);
    if (!secret || !verifyTotp(secret, totpCode)) {
      await recordFailedLogin(username, ip);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid authenticator code' }));
    }
  }

  // Clear any failed logins upon successful authentication
  await clearFailedLogins(username, ip);

  const { token, csrf } = await createSession(user.id);
  setSessionCookie(res, token);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    csrfToken: csrf,
    username: user.username
  }));
}

/**
 * POST /api/logout
 */
export async function handleLogout(req, res) {
  await destroySession(req, res);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

/**
 * POST /api/settings/password
 */
export async function handleChangePassword(req, res) {
  const session = await requireAuth(req, res, true);
  if (!session) return;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
  }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Current password and new password are required' }));
  }

  if (typeof newPassword !== 'string' || newPassword.length < 10) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'New password must be at least 10 characters long' }));
  }

  const db = getDb();
  const user = await db.get(
    'SELECT password_hash, salt FROM users WHERE id = ?',
    session.userId
  );

  if (!user) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'User not found' }));
  }

  const currentHash = hashPassword(currentPassword, user.salt);
  if (!crypto.timingSafeEqual(currentHash, user.password_hash)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Current password is incorrect' }));
  }

  const newSalt = crypto.randomBytes(16);
  const newPasswordHash = hashPassword(newPassword, newSalt);

  await db.run(
    'UPDATE users SET password_hash = ?, salt = ? WHERE id = ?',
    newPasswordHash,
    newSalt,
    session.userId
  );

  // Terminate all OTHER active sessions
  await db.run(
    'DELETE FROM sessions WHERE user_id = ? AND id != ?',
    session.userId,
    session.id
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    message: 'Password changed successfully. All other sessions have been signed out.'
  }));
}

/**
 * DELETE /api/sessions/other
 */
export async function handleSignOutOther(req, res) {
  const session = await requireAuth(req, res, true);
  if (!session) return;

  const db = getDb();
  await db.run(
    'DELETE FROM sessions WHERE user_id = ? AND id != ?',
    session.userId,
    session.id
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    message: 'Signed out of all other sessions.'
  }));
}

/**
 * POST /api/settings/totp/setup
 */
export async function handleTotpSetup(req, res) {
  const session = await requireAuth(req, res, true);
  if (!session) return;

  const db = getDb();
  const user = await db.get('SELECT username FROM users WHERE id = ?', session.userId);
  if (!user) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'User not found' }));
  }

  // Generate 20-byte random secret encoded as Base32
  const secret = base32Encode(crypto.randomBytes(20));
  const otpauthUrl = `otpauth://totp/WellSense:${encodeURIComponent(user.username)}?secret=${secret}&issuer=WellSense&algorithm=SHA1&digits=6&period=30`;

  try {
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ secret, qrCode }));
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to generate QR code' }));
  }
}

/**
 * POST /api/settings/totp/verify
 */
export async function handleTotpVerify(req, res) {
  const session = await requireAuth(req, res, true);
  if (!session) return;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
  }

  const { secret, code } = body;
  if (!secret || !code) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Secret and verification code are required' }));
  }

  if (!verifyTotp(secret, code)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid verification code. Check your authenticator app.' }));
  }

  const encrypted = encryptSecret(secret);
  const db = getDb();
  await db.run(
    'UPDATE users SET totp_encrypted = ? WHERE id = ?',
    encrypted,
    session.userId
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    message: 'Two-factor authentication enabled successfully.'
  }));
}
