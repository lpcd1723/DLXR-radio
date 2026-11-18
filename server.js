const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Core service modules
const { registerStreamRoutes } = require('./src/routes/stream');
const { createChatServer } = require('./src/chat/chat-server');

// Optional modular microservices (can be gitignored / toggled independently)
let registerAdminRoutes = null;
try {
  ({ registerAdminRoutes } = require('./modules/admin'));
} catch (e) {
  console.log('[Server] Admin module not loaded or disabled');
}

let createCurationEngine = null;
try {
  ({ createCurationEngine } = require('./modules/curate'));
} catch (e) {
  console.log('[Server] Curation module not loaded or disabled');
}

const app = express();
const PORT = process.env.PORT || 8080;
const AZURACAST_HOST = process.env.AZURACAST_HOST || '192.168.0.53';
const STATION_SHORTCODE = process.env.STATION_SHORTCODE || 'iadt_radio';
const AZURACAST_API_KEY = process.env.AZURACAST_API_KEY || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DJ_PASSKEY = process.env.DJ_KEY;
if (!DJ_PASSKEY) {
  console.error('DJ_KEY is not set. Refusing to start (no default admin key).');
  process.exit(1);
}

// The one place an admin/DJ key is checked. 10 wrong tries from an IP lock it
// out for 10 minutes, so the key can't be brute-forced.
const authFails = new Map(); // ip -> { n, since }
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
function isAdminKey(key, ip) {
  const f = authFails.get(ip);
  const fresh = f && Date.now() - f.since < 10 * 60 * 1000;
  if (fresh && f.n >= 10) return false;
  const a = Buffer.from(String(key || '')), b = Buffer.from(DJ_PASSKEY);
  const ok = a.length === b.length && require('crypto').timingSafeEqual(a, b);
  if (ok) authFails.delete(ip);
  else {
    if (authFails.size > 5000) authFails.clear();
    authFails.set(ip, fresh ? { n: f.n + 1, since: f.since } : { n: 1, since: Date.now() });
  }
  return ok;
}

// Allow self-signed certs for internal LAN AzuraCast connection
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Serve static frontend assets with no-cache headers for instant updates
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body parser for JSON requests
app.use(express.json());

// Ensure persistent data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function getReportsFilePath() {
  const fileInDataDir = path.join(DATA_DIR, 'reports.log');
  const fileInRoot = path.join(__dirname, 'reports.log');
  if (fs.existsSync(fileInDataDir)) return fileInDataDir;
  if (fs.existsSync(fileInRoot) && DATA_DIR === path.join(__dirname, 'data')) return fileInRoot;
  return fileInDataDir;
}

// ─── HTTP SERVER & WEBSOCKET INITIALIZATION ───────────────────────
const server = http.createServer(app);

// Initialize WebSocket Chat Server
const chatService = createChatServer({
  server,
  httpsAgent,
  AZURACAST_HOST,
  STATION_SHORTCODE,
  isAdminKey
});

// Initialize Audio Streaming & Metadata Caching Proxy Routes
registerStreamRoutes(app, {
  AZURACAST_HOST,
  STATION_SHORTCODE,
  httpsAgent,
  wss: chatService.wss
});

// Bug report endpoint (public listener feedback)
// Public, so capped: 5 reports per IP per hour, short fields, and the log file
// stops growing at 5MB (it lives on the home server's shared disk).
const reportTimes = new Map(); // ip -> [timestamps]
app.post('/api/report', (req, res) => {
  const ip = clientIp(req);
  const recent = (reportTimes.get(ip) || []).filter(t => Date.now() - t < 3600 * 1000);
  if (recent.length >= 5) return res.status(429).json({ status: 'error', message: 'Too many reports, try again later.' });
  if (reportTimes.size > 5000) reportTimes.clear();
  reportTimes.set(ip, [...recent, Date.now()]);
  const { category, description, userAgent } = req.body || {};
  const report = {
    category: String(category || 'General').slice(0, 40),
    description: String(description || '').slice(0, 2000),
    userAgent: String(userAgent || req.headers['user-agent'] || '').slice(0, 300),
    timestamp: new Date().toISOString(),
    ip
  };
  const reportsFile = getReportsFilePath();
  let size = 0;
  try { size = fs.statSync(reportsFile).size; } catch (e) {}
  if (size < 5 * 1024 * 1024) {
    fs.promises.appendFile(reportsFile, JSON.stringify(report) + '\n')
      .catch(err => console.error('Failed to log report:', err.message));
  }
  console.log('[BUG REPORT]', report.category);
  res.json({ status: 'ok', message: 'Report submitted successfully. Thank you!' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', station: STATION_SHORTCODE, timestamp: new Date().toISOString() });
});

// Admin Authentication Middleware
// Key comes from the x-admin-key header, or the HttpOnly cookie set at login
// (so <audio>/<img> requests never need the key in a URL).
function checkAdminAuth(req, res, next) {
  const cookie = /(?:^|;\s*)dlxr_admin=([^;]+)/.exec(req.headers.cookie || '');
  const key = req.headers['x-admin-key'] || (cookie && decodeURIComponent(cookie[1])) || req.body?.key;
  if (isAdminKey(key, clientIp(req))) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: invalid admin key' });
}

// Register Admin Microservice (if present)
if (typeof registerAdminRoutes === 'function') {
  registerAdminRoutes(app, {
    checkAdminAuth,
    isAdminKey,
    clientIp,
    STATION_SHORTCODE,
    DATA_DIR,
    wss: chatService.wss,
    chatHistory: chatService.chatHistory,
    mutedSessions: chatService.mutedSessions,
    getOnlineRoster: chatService.getOnlineRoster,
    broadcast: chatService.broadcast
  });
}

// Register Curation & Auto-Intake Microservice (if present)
if (typeof createCurationEngine === 'function') {
  createCurationEngine({
    app,
    httpsAgent,
    checkAdminAuth,
    AZURACAST_HOST,
    STATION_SHORTCODE,
    AZURACAST_API_KEY,
    DATA_DIR
  });
}

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Radio Visualizer Frontend server running on http://0.0.0.0:${PORT}`);
});
