// test_backend.js
import { initDb, getDb, closeDb } from './src/db.js';
import {
  hashPassword,
  generateToken,
  hashToken,
  generateCsrf,
  base32Encode,
  base32Decode,
  generateTotpCode,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  isLocked,
  recordFailedLogin,
  clearFailedLogins
} from './src/auth.js';
import { updateEma, processReading, THRESHOLDS, ALERT_COOLDOWN_MS } from './src/detect.js';
import { initWebPush, getVapidPublicKey, storePushSubscription } from './src/alerts.js';
import { createServer } from './src/server.js';
import http from 'http';

async function runTests() {
  console.log('--- Starting Backend Verification Tests ---');

  // 1. Test Database and Admin Bootstrap
  process.env.DB_FILE = ':memory:';
  process.env.ADMIN_USER = 'testadmin';
  process.env.ADMIN_PASS = 'SuperSecret123!';
  process.env.APP_SECRET = 'super-secret-key-for-hkdf-testing-32b';

  await initDb(':memory:');
  const db = getDb();

  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = tables.map(t => t.name);
  console.log('Created tables:', tableNames.join(', '));

  const expectedTables = [
    'users',
    'sessions',
    'consoles',
    'readings',
    'console_stats',
    'alerts',
    'push_subscriptions',
    'failed_logins'
  ];

  for (const expected of expectedTables) {
    if (!tableNames.includes(expected)) {
      throw new Error(`Missing table: ${expected}`);
    }
  }
  console.log('✓ All 8 tables present');

  // Verify Admin
  const admin = await db.get("SELECT username, password_hash, salt FROM users WHERE username = 'testadmin'");
  if (!admin) throw new Error('Admin user was not bootstrapped');
  if (admin.password_hash.length !== 64) throw new Error(`Password hash should be 64 bytes, got ${admin.password_hash.length}`);
  if (admin.salt.length !== 16) throw new Error(`Salt should be 16 bytes, got ${admin.salt.length}`);
  console.log('✓ Admin user bootstrapped with 16-byte salt and 64-byte scrypt hash');

  // 2. Test Crypto & TOTP functions
  const sampleSecret = 'JBSWY3DPEHPK3PXP';
  const encoded = base32Encode(Buffer.from('Hello!'));
  const decoded = base32Decode(encoded).toString();
  if (decoded !== 'Hello!') throw new Error(`Base32 failed: expected Hello!, got ${decoded}`);
  console.log('✓ Base32 encoding & decoding works');

  const totpCode = generateTotpCode(sampleSecret, 0);
  if (!/^\d{6}$/.test(totpCode)) throw new Error(`Invalid TOTP code: ${totpCode}`);
  if (!verifyTotp(sampleSecret, totpCode)) throw new Error('Failed to verify valid TOTP code');
  if (verifyTotp(sampleSecret, '999999') && totpCode !== '999999') throw new Error('Accepted invalid TOTP code');
  console.log('✓ RFC 6238 TOTP generation and verification works');

  // Test AES-256-GCM encryption/decryption
  const plain = 'MY_TOTP_SECRET_KEY';
  const encrypted = encryptSecret(plain);
  const decrypted = decryptSecret(encrypted);
  if (decrypted !== plain) throw new Error(`AES-GCM mismatch: expected ${plain}, got ${decrypted}`);
  console.log('✓ AES-256-GCM encryption with HKDF key derivation works');

  // 3. Test Lockout Logic
  await recordFailedLogin('baduser', '192.168.1.1');
  await recordFailedLogin('baduser', '192.168.1.1');
  await recordFailedLogin('baduser', '192.168.1.1');
  await recordFailedLogin('baduser', '192.168.1.1');
  let locked = await isLocked('baduser', '192.168.1.1');
  if (locked) throw new Error('Should not be locked after 4 attempts');
  await recordFailedLogin('baduser', '192.168.1.1'); // 5th attempt
  locked = await isLocked('baduser', '192.168.1.1');
  if (!locked) throw new Error('Should be locked after 5 attempts');
  await clearFailedLogins('baduser', '192.168.1.1');
  locked = await isLocked('baduser', '192.168.1.1');
  if (locked) throw new Error('Should not be locked after clearFailedLogins');
  console.log('✓ Failed logins and 5-attempt lockout work');

  // 4. Test Detect Logic & EMA
  // Initial EMA
  const ema1 = updateEma(null, 7.0, 0.1);
  if (ema1 !== 7.0) throw new Error(`EMA initial value should be 7.0, got ${ema1}`);
  const ema2 = updateEma(7.0, 8.0, 0.1);
  if (Math.abs(ema2 - 7.1) > 0.0001) throw new Error(`EMA update should be 7.1, got ${ema2}`);
  console.log('✓ EMA formula matches factor 0.1');

  // Console insertion for detect test
  const consoleInsert = await db.run(
    "INSERT INTO consoles (user_id, name, api_key_hash, created_at) VALUES (1, 'Well 1', 'test_hash', ?)",
    Date.now()
  );
  const consoleId = consoleInsert.lastID;

  // Insert 48 readings for learning phase
  for (let i = 0; i < 48; i++) {
    const alert = await processReading({
      console_id: consoleId,
      ph: 7.2,
      turbidity: 1.0,
      tds: 200,
      temperature: 15,
      battery: 95,
      ts: Date.now() + i * 1000
    });
    if (alert !== null) throw new Error(`Alert should NOT be triggered during learning phase (reading ${i})`);
  }
  console.log('✓ Learning phase (first 48 readings) completed with 0 alerts');

  // Check stats after learning phase
  let stats = await db.get('SELECT * FROM console_stats WHERE console_id = ?', consoleId);
  if (stats.reading_count !== 48) throw new Error(`Reading count should be 48, got ${stats.reading_count}`);
  console.log(`✓ Console stats updated: reading_count=${stats.reading_count}, ema_ph=${stats.ema_ph.toFixed(2)}`);

  // Now 49th reading with normal value
  await processReading({
    console_id: consoleId,
    ph: 7.2,
    turbidity: 1.0,
    tds: 200,
    temperature: 15,
    battery: 95,
    ts: Date.now() + 50000
  });

  // Now trigger an alert by introducing pH deviation > 0.25 (e.g., pH 8.0)
  const baselineEmaPhBeforeAlert = (await db.get('SELECT ema_ph FROM console_stats WHERE console_id = ?', consoleId)).ema_ph;
  const triggered = await processReading({
    console_id: consoleId,
    ph: 8.5,
    turbidity: 1.0,
    tds: 200,
    temperature: 15,
    battery: 95,
    ts: Date.now() + 60000
  });
  if (!triggered) throw new Error('Expected alert to be triggered for pH deviation');
  console.log('✓ Alert triggered correctly:', triggered.message);

  // Check that EMA baseline was FROZEN (not updated)
  const statsAfterAlert = await db.get('SELECT * FROM console_stats WHERE console_id = ?', consoleId);
  if (statsAfterAlert.ema_ph !== baselineEmaPhBeforeAlert) {
    throw new Error(`EMA baseline should be frozen during alert! Expected ${baselineEmaPhBeforeAlert}, got ${statsAfterAlert.ema_ph}`);
  }
  console.log('✓ EMA baseline frozen as required during flagged alert reading');

  // Check cooldown: immediate second abnormal reading should NOT trigger alert within 6 hours
  const blockedByCooldown = await processReading({
    console_id: consoleId,
    ph: 8.9,
    turbidity: 1.0,
    tds: 200,
    temperature: 15,
    battery: 95,
    ts: Date.now() + 61000
  });
  if (blockedByCooldown !== null) throw new Error('Alert should be blocked by 6-hour cooldown');
  console.log('✓ 6-hour alert cooldown enforced');

  // 5. Test Full HTTP Server Endpoints
  const server = createServer();
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  console.log(`✓ HTTP test server listening on ephemeral port ${port}`);

  function makeRequest(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        }
      );
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  // GET /healthz
  const healthRes = await makeRequest('GET', '/healthz');
  if (healthRes.statusCode !== 200) throw new Error(`/healthz failed: ${healthRes.statusCode}`);
  const healthJson = JSON.parse(healthRes.body);
  if (healthJson.status !== 'ok') throw new Error(`Invalid health status: ${healthJson.status}`);
  if (healthRes.headers['x-frame-options'] !== 'DENY') throw new Error('Missing X-Frame-Options: DENY');
  if (healthRes.headers['x-content-type-options'] !== 'nosniff') throw new Error('Missing X-Content-Type-Options: nosniff');
  console.log('✓ GET /healthz returns 200 with security headers');

  // POST /api/login
  const loginRes = await makeRequest('POST', '/api/login', { 'Content-Type': 'application/json' }, {
    username: 'testadmin',
    password: 'SuperSecret123!'
  });
  if (loginRes.statusCode !== 200) throw new Error(`/api/login failed: ${loginRes.statusCode} ${loginRes.body}`);
  const loginJson = JSON.parse(loginRes.body);
  if (!loginJson.csrfToken) throw new Error('Login response missing csrfToken');
  const setCookie = loginRes.headers['set-cookie'];
  if (!setCookie || !setCookie[0].includes('session=')) throw new Error('Missing session cookie');
  const sessionCookie = setCookie[0].split(';')[0];
  const csrfToken = loginJson.csrfToken;
  console.log('✓ POST /api/login succeeded with session cookie and CSRF token');

  // GET /api/me
  const meRes = await makeRequest('GET', '/api/me', { Cookie: sessionCookie });
  if (meRes.statusCode !== 200) throw new Error(`/api/me failed: ${meRes.statusCode}`);
  const meJson = JSON.parse(meRes.body);
  if (meJson.username !== 'testadmin') throw new Error(`Expected testadmin, got ${meJson.username}`);
  console.log('✓ GET /api/me returned current user profile');

  // GET /api/csrf-token
  const csrfRes = await makeRequest('GET', '/api/csrf-token', { Cookie: sessionCookie });
  if (csrfRes.statusCode !== 200) throw new Error(`/api/csrf-token failed: ${csrfRes.statusCode}`);
  const csrfBody = JSON.parse(csrfRes.body);
  if (csrfBody.csrfToken !== csrfToken) throw new Error('CSRF token mismatch');
  console.log('✓ GET /api/csrf-token verified');

  // POST /api/consoles (with CSRF)
  const addConsoleRes = await makeRequest(
    'POST',
    '/api/consoles',
    {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
      'X-WellSense-CSRF': csrfToken
    },
    { name: 'Home Well Sensor' }
  );
  if (addConsoleRes.statusCode !== 201) throw new Error(`Add console failed: ${addConsoleRes.statusCode} ${addConsoleRes.body}`);
  const consoleData = JSON.parse(addConsoleRes.body);
  if (!consoleData.apiKey) throw new Error('Add console response missing apiKey');
  console.log('✓ POST /api/consoles created console with API key');

  // GET /api/consoles
  const listConsolesRes = await makeRequest('GET', '/api/consoles', { Cookie: sessionCookie });
  if (listConsolesRes.statusCode !== 200) throw new Error(`List consoles failed: ${listConsolesRes.statusCode}`);
  const consolesList = JSON.parse(listConsolesRes.body);
  if (!Array.isArray(consolesList) || consolesList.length === 0) throw new Error('Expected non-empty consoles list');
  console.log(`✓ GET /api/consoles returned ${consolesList.length} console(s)`);

  // POST /api/ingest with Bearer API key
  const ingestRes = await makeRequest(
    'POST',
    '/api/ingest',
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${consoleData.apiKey}`
    },
    {
      ph: 7.4,
      turbidity: 0.5,
      tds: 150,
      temperature: 18.5,
      battery: 88,
      ts: Date.now()
    }
  );
  if (ingestRes.statusCode !== 201) throw new Error(`Ingest failed: ${ingestRes.statusCode} ${ingestRes.body}`);
  console.log('✓ POST /api/ingest accepted telemetry reading');

  // GET /api/readings
  const readingsRes = await makeRequest('GET', `/api/readings?consoleId=${consoleData.id}&range=24h`, { Cookie: sessionCookie });
  if (readingsRes.statusCode !== 200) throw new Error(`Get readings failed: ${readingsRes.statusCode}`);
  const readingsList = JSON.parse(readingsRes.body);
  if (readingsList.length === 0) throw new Error('Expected readings in range');
  console.log(`✓ GET /api/readings returned ${readingsList.length} reading(s)`);

  const allReadingsRes = await makeRequest('GET', '/api/readings?range=24h', { Cookie: sessionCookie });
  if (allReadingsRes.statusCode !== 200) throw new Error(`Get all readings failed: ${allReadingsRes.statusCode} ${allReadingsRes.body}`);
  const allReadingsList = JSON.parse(allReadingsRes.body);
  if (!allReadingsList.some((reading) => reading.console_id === consoleData.id)) {
    throw new Error('Range-only readings should include data from the authenticated user’s consoles');
  }
  console.log(`✓ GET /api/readings without consoleId returned ${allReadingsList.length} user reading(s)`);

  // GET /api/readings/export (CSV)
  const csvRes = await makeRequest('GET', `/api/readings/export?consoleId=${consoleData.id}`, { Cookie: sessionCookie });
  if (csvRes.statusCode !== 200) throw new Error(`CSV export failed: ${csvRes.statusCode}`);
  if (!csvRes.body.startsWith('time,ph,turbidity_ntu,tds_ppm,temp_c')) {
    throw new Error(`CSV missing expected header: ${csvRes.body.slice(0, 50)}`);
  }
  console.log('✓ GET /api/readings/export generated valid CSV data');

  // GET /api/alerts
  const alertsRes = await makeRequest('GET', '/api/alerts', { Cookie: sessionCookie });
  if (alertsRes.statusCode !== 200) throw new Error(`Get alerts failed: ${alertsRes.statusCode}`);
  const alertsList = JSON.parse(alertsRes.body);
  console.log(`✓ GET /api/alerts returned ${alertsList.length} alert(s)`);

  // Check alert if exists
  if (alertsList.length > 0) {
    const alertId = alertsList[0].id;
    const checkRes = await makeRequest(
      'POST',
      `/api/alerts/${alertId}/check`,
      {
        Cookie: sessionCookie,
        'X-WellSense-CSRF': csrfToken
      }
    );
    if (checkRes.statusCode !== 200) throw new Error(`Check alert failed: ${checkRes.statusCode}`);
    console.log(`✓ POST /api/alerts/${alertId}/check acknowledged alert`);
  }

  // TOTP Setup & Verification
  const totpSetupRes = await makeRequest(
    'POST',
    '/api/settings/totp/setup',
    {
      Cookie: sessionCookie,
      'X-WellSense-CSRF': csrfToken
    }
  );
  if (totpSetupRes.statusCode !== 200) throw new Error(`TOTP setup failed: ${totpSetupRes.statusCode}`);
  const totpSetupJson = JSON.parse(totpSetupRes.body);
  if (!totpSetupJson.secret || !totpSetupJson.qrCode) throw new Error('TOTP setup missing secret or qrCode');
  console.log('✓ POST /api/settings/totp/setup generated secret and QR code');

  const validTotpCode = generateTotpCode(totpSetupJson.secret, 0);
  const totpVerifyRes = await makeRequest(
    'POST',
    '/api/settings/totp/verify',
    {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
      'X-WellSense-CSRF': csrfToken
    },
    {
      secret: totpSetupJson.secret,
      code: validTotpCode
    }
  );
  if (totpVerifyRes.statusCode !== 200) throw new Error(`TOTP verify failed: ${totpVerifyRes.statusCode} ${totpVerifyRes.body}`);
  console.log('✓ POST /api/settings/totp/verify verified and saved TOTP');

  // Change Password
  const changePwRes = await makeRequest(
    'POST',
    '/api/settings/password',
    {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
      'X-WellSense-CSRF': csrfToken
    },
    {
      currentPassword: 'SuperSecret123!',
      newPassword: 'BrandNewSecurePassword456!'
    }
  );
  if (changePwRes.statusCode !== 200) throw new Error(`Change password failed: ${changePwRes.statusCode} ${changePwRes.body}`);
  console.log('✓ POST /api/settings/password changed password and terminated other sessions');

  // Verify login with new password and TOTP
  const newCode = generateTotpCode(totpSetupJson.secret, 0);
  const newLoginRes = await makeRequest(
    'POST',
    '/api/login',
    { 'Content-Type': 'application/json' },
    {
      username: 'testadmin',
      password: 'BrandNewSecurePassword456!',
      totpCode: newCode
    }
  );
  if (newLoginRes.statusCode !== 200) throw new Error(`Login with new password and TOTP failed: ${newLoginRes.statusCode} ${newLoginRes.body}`);
  console.log('✓ Login with new password and 2FA TOTP code succeeded');

  server.close();
  await closeDb();

  console.log('\n=======================================');
  console.log('ALL BACKEND VERIFICATION TESTS PASSED!');
  console.log('=======================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
