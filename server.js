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
const DJ_PASSKEY = process.env.DJ_KEY || 'dlxr2026';

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
  DJ_PASSKEY
});

// Initialize Audio Streaming & Metadata Caching Proxy Routes
registerStreamRoutes(app, {
  AZURACAST_HOST,
  STATION_SHORTCODE,
  httpsAgent,
  wss: chatService.wss
});

// Bug report endpoint (public listener feedback)
app.post('/api/report', (req, res) => {
  const { category, description, userAgent, timestamp } = req.body || {};
  const report = {
    category: category || 'General',
    description: description || '',
    userAgent: userAgent || req.headers['user-agent'] || '',
    timestamp: timestamp || new Date().toISOString(),
    ip: req.ip || req.connection?.remoteAddress
  };
  console.log('[BUG REPORT]', JSON.stringify(report));
  try {
    const reportsFile = getReportsFilePath();
    fs.appendFileSync(reportsFile, JSON.stringify(report) + '\n');
  } catch (err) {
    console.error('Failed to log report:', err.message);
  }
  res.json({ status: 'ok', message: 'Report submitted successfully. Thank you!' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', station: STATION_SHORTCODE, timestamp: new Date().toISOString() });
});

// Admin Authentication Middleware
function checkAdminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key || req.body?.key;
  if (key === DJ_PASSKEY) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: invalid admin key' });
}

// Register Admin Microservice (if present)
if (typeof registerAdminRoutes === 'function') {
  registerAdminRoutes(app, {
    checkAdminAuth,
    DJ_PASSKEY,
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
