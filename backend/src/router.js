// src/router.js
import { parse } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { handleHealth } from './health.js';
import {
  handleLogin,
  handleLogout,
  getCsrfToken,
  handleMe,
  handleChangePassword,
  handleSignOutOther,
  handleTotpSetup,
  handleTotpVerify
} from './auth.js';
import { handleAddConsole, handleIngest } from './console.js';
import {
  handleListConsoles,
  handleGetReadings,
  handleGetAlerts,
  handleCheckAlert,
  handleExportCsv
} from './reading_routes.js';
import { handleAlertsSse } from './sse_routes.js';
import { handleSubscribe, handleGetVapidKey } from './push_routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../../frontend/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json'
};

/**
 * Serve static production assets or fallback to index.html for SPA routes.
 */
function serveStaticFile(req, res, pathname) {
  // Prevent directory traversal
  const safeSuffix = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(DIST_DIR, safeSuffix);

  // If requesting a directory or root, point to index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // If specific file exists, serve it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const stream = fs.createReadStream(filePath);
    return stream.pipe(res);
  }

  // Fallback to index.html for client-side routing
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const stream = fs.createReadStream(indexPath);
    return stream.pipe(res);
  }

  // Frontend build not yet available
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Frontend assets not found' }));
}

/**
 * Main application router
 */
export async function router(req, res) {
  const parsed = parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method.toUpperCase();

  // Enforce security headers on ALL responses
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:;"
  );

  // Health check
  if (pathname === '/healthz' && method === 'GET') {
    return handleHealth(req, res);
  }

  // Authentication & session management
  if (pathname === '/api/login' && method === 'POST') {
    return handleLogin(req, res);
  }
  if (pathname === '/api/logout' && method === 'POST') {
    return handleLogout(req, res);
  }
  if (pathname === '/api/csrf-token' && method === 'GET') {
    return getCsrfToken(req, res);
  }
  if (pathname === '/api/me' && method === 'GET') {
    return handleMe(req, res);
  }
  if (pathname === '/api/settings/password' && method === 'POST') {
    return handleChangePassword(req, res);
  }
  if (pathname === '/api/settings/totp/setup' && method === 'POST') {
    return handleTotpSetup(req, res);
  }
  if (pathname === '/api/settings/totp/verify' && method === 'POST') {
    return handleTotpVerify(req, res);
  }
  if (pathname === '/api/sessions/other' && method === 'DELETE') {
    return handleSignOutOther(req, res);
  }

  // Console management & ingestion
  if (pathname === '/api/consoles' && method === 'POST') {
    return handleAddConsole(req, res);
  }
  if (pathname === '/api/consoles' && method === 'GET') {
    return handleListConsoles(req, res);
  }
  if (pathname === '/api/ingest' && method === 'POST') {
    return handleIngest(req, res);
  }

  // Readings & exports
  if (pathname === '/api/readings/export' && method === 'GET') {
    return handleExportCsv(req, res);
  }
  if (pathname === '/api/readings' && method === 'GET') {
    return handleGetReadings(req, res);
  }

  // Alerts & notifications
  if (pathname === '/api/alerts/stream' && method === 'GET') {
    return handleAlertsSse(req, res);
  }
  if (pathname.match(/^\/api\/alerts\/\d+\/check$/) && method === 'POST') {
    return handleCheckAlert(req, res);
  }
  if (pathname === '/api/alerts' && method === 'GET') {
    return handleGetAlerts(req, res);
  }

  // Push notifications
  if (pathname === '/api/push/subscribe' && method === 'POST') {
    return handleSubscribe(req, res);
  }
  if (pathname === '/api/push/vapid-key' && method === 'GET') {
    return handleGetVapidKey(req, res);
  }

  // API 404 handler
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }

  // Static files and SPA fallback for non-API routes
  if (method === 'GET' || method === 'HEAD') {
    return serveStaticFile(req, res, pathname);
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}
