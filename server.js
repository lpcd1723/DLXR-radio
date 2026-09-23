const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;
const AZURACAST_HOST = process.env.AZURACAST_HOST || '192.168.0.53';
const STATION_SHORTCODE = process.env.STATION_SHORTCODE || 'iadt_radio';

// Allow self-signed certs for internal LAN AzuraCast connection
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Serve static files with no-cache to prevent stale browser & proxy caches
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

let activeStreamClients = 0;

// Stream proxy endpoint
app.get('/stream', (req, res) => {
  activeStreamClients++;
  const streamUrl = `https://${AZURACAST_HOST}/listen/${STATION_SHORTCODE}/radio.mp3`;
  const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || 'DLXR Radio Client';
  
  const proxyReq = https.get(streamUrl, {
    agent: httpsAgent,
    headers: {
      'X-Forwarded-For': clientIp,
      'User-Agent': userAgent
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, {
      'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Connection': 'keep-alive'
    });

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Stream proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Radio stream unavailable');
    }
  });

  req.on('close', () => {
    activeStreamClients = Math.max(0, activeStreamClients - 1);
    proxyReq.destroy();
  });
});

// Now Playing API proxy endpoint with relative art URL rewrite
app.get('/api/nowplaying', (req, res) => {
  const apiUrl = `https://${AZURACAST_HOST}/api/nowplaying/${STATION_SHORTCODE}`;

  const proxyReq = https.get(apiUrl, { agent: httpsAgent }, (proxyRes) => {
    proxyRes.setEncoding('utf8');
    let data = '';
    proxyRes.on('data', (chunk) => {
      data += chunk;
    });
    proxyRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        
        // Helper to rewrite internal URLs to public relative proxy paths
        const scrubArtUrl = (artUrl) => {
          if (typeof artUrl !== 'string') return '';
          const match = artUrl.match(/\/api\/station\/[^/]+\/art\/[^/]+/);
          return match ? match[0] : artUrl;
        };

        if (json?.now_playing?.song?.art) {
          json.now_playing.song.art = scrubArtUrl(json.now_playing.song.art);
        }
        if (json?.playing_next?.song?.art) {
          json.playing_next.song.art = scrubArtUrl(json.playing_next.song.art);
        }
        if (Array.isArray(json?.song_history)) {
          json.song_history.forEach(item => {
            if (item?.song?.art) {
              item.song.art = scrubArtUrl(item.song.art);
            }
          });
        }
        if (json?.station) {
          json.station.listen_url = '/stream';
          json.station.public_player_url = '/';
          if (Array.isArray(json.station.mounts)) {
            json.station.mounts.forEach(m => {
              m.url = '/stream';
            });
          }
        }

        // Accurately resolve listener metrics using real active platform clients
        const realOnlineCount = Math.max(wss && wss.clients ? wss.clients.size : 0, 1);

        if (!json.listeners) json.listeners = {};
        json.listeners.unique = realOnlineCount;
        json.listeners.current = realOnlineCount;
        json.listeners.proxy_clients = activeStreamClients;
        json.listeners.total = realOnlineCount;

        global.latestNowPlaying = {
          title: json?.now_playing?.song?.title || json?.now_playing?.song?.text || 'IADT Radio Stream',
          artist: json?.now_playing?.song?.artist || 'IADT Radio',
          show: json?.live?.is_live ? (json.live.streamer_name || 'LIVE') : 'AUTODJ 24/7',
          listeners: realOnlineCount
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, max-age=0');
        
        // Remove all traces of internal IP / host across the entire payload
        const sanitizedData = JSON.stringify(json).replace(new RegExp(`https?://${AZURACAST_HOST}`, 'g'), '');
        res.send(sanitizedData);
      } catch (err) {
        res.status(500).json({ error: 'Failed to parse nowplaying data' });
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('Nowplaying proxy error:', err.message);
    res.status(502).json({ error: 'AzuraCast unreachable' });
  });
});

// Album Art proxy endpoint
app.get('/api/station/:stationId/art/:artPath', (req, res) => {
  const { stationId, artPath } = req.params;
  const artUrl = `https://${AZURACAST_HOST}/api/station/${stationId}/art/${artPath}`;

  const proxyReq = https.get(artUrl, { agent: httpsAgent }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, {
      'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Art proxy error:', err.message);
    res.status(404).send('Art not found');
  });
});

// Body parser for JSON requests
app.use(express.json());

// Bug report endpoint
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
    const reportsFile = path.join(__dirname, 'reports.log');
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

// Admin Dashboard SPA route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin Authentication Middleware
function checkAdminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key || req.body?.key;
  if (key === DJ_PASSKEY) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: invalid admin key' });
}

// Admin Auth endpoint
app.post('/api/admin/auth', (req, res) => {
  const key = req.body?.key || req.headers['x-admin-key'];
  if (key === DJ_PASSKEY) {
    return res.json({ success: true, station: STATION_SHORTCODE });
  }
  return res.status(401).json({ error: 'Invalid broadcaster passkey' });
});

// Admin Stats & Telemetry endpoint
app.get('/api/admin/stats', checkAdminAuth, (req, res) => {
  const mem = process.memoryUsage();
  const activeMutes = [];
  const now = Date.now();
  for (const [key, unMuteTime] of mutedSessions.entries()) {
    if (unMuteTime > now) {
      activeMutes.push({
        handle: key,
        remainingMinutes: Math.ceil((unMuteTime - now) / 60000)
      });
    }
  }

  res.json({
    station: {
      shortcode: STATION_SHORTCODE,
      hostScrubbed: 'iadt-radio-station'
    },
    telemetry: {
      listeners: global.latestNowPlaying?.listeners ?? 1,
      isLive: global.latestNowPlaying?.show !== 'AUTODJ 24/7'
    },
    nowPlaying: global.latestNowPlaying || {
      title: 'IADT Radio Stream',
      artist: 'IADT',
      show: 'AUTODJ 24/7'
    },
    server: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024))
      }
    },
    chat: {
      onlineCount: wss.clients.size,
      roster: getOnlineRoster(),
      history: chatHistory.slice(-50),
      activeMutes: activeMutes
    }
  });
});

// Admin Bug Reports endpoint
app.get('/api/admin/reports', checkAdminAuth, (req, res) => {
  try {
    const reportsFile = path.join(__dirname, 'reports.log');
    if (!fs.existsSync(reportsFile)) {
      return res.json({ reports: [] });
    }
    const lines = fs.readFileSync(reportsFile, 'utf8').split('\n').filter(Boolean);
    const reports = lines.map((line, idx) => {
      try {
        const parsed = JSON.parse(line);
        return { id: `rep_${idx}`, ...parsed };
      } catch (e) {
        return null;
      }
    }).filter(Boolean).reverse();
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read reports log' });
  }
});

// Admin Clear Chat endpoint
app.post('/api/admin/chat/clear', checkAdminAuth, (req, res) => {
  chatHistory.length = 0;
  broadcast({ type: 'chat_cleared' });
  broadcast({
    type: 'message',
    message: {
      id: `sys_${Date.now()}`,
      user: 'SYSTEM',
      userColor: '#ff2277',
      text: '⚠️ Chat history was cleared from admin dashboard.',
      timestamp: new Date().toISOString()
    }
  });
  res.json({ success: true });
});

// Admin Mute User endpoint
app.post('/api/admin/chat/mute', checkAdminAuth, (req, res) => {
  const { handle, minutes } = req.body;
  const targetHandle = String(handle || '').trim().replace(/^@/, '');
  const mins = parseInt(minutes, 10) || 5;
  if (!targetHandle) return res.status(400).json({ error: 'Handle required' });

  const unMuteTime = Date.now() + (mins * 60 * 1000);
  mutedSessions.set(targetHandle.toLowerCase(), unMuteTime);
  for (const client of wss.clients) {
    if (client.userHandle && client.userHandle.toLowerCase() === targetHandle.toLowerCase()) {
      if (client.sessionId) mutedSessions.set(client.sessionId, unMuteTime);
      client.send(JSON.stringify({
        type: 'message',
        message: {
          id: `bot_${Date.now()}`,
          user: 'BOT // RADIO',
          userColor: '#ff2277',
          text: `[!] You have been muted by an admin for ${mins} minute(s).`,
          timestamp: new Date().toISOString()
        }
      }));
    }
  }
  res.json({ success: true, mutedUntil: unMuteTime });
});

// Admin Unmute User endpoint
app.post('/api/admin/chat/unmute', checkAdminAuth, (req, res) => {
  const { handle } = req.body;
  const targetHandle = String(handle || '').trim().replace(/^@/, '');
  if (!targetHandle) return res.status(400).json({ error: 'Handle required' });

  mutedSessions.delete(targetHandle.toLowerCase());
  for (const client of wss.clients) {
    if (client.userHandle && client.userHandle.toLowerCase() === targetHandle.toLowerCase()) {
      if (client.sessionId) mutedSessions.delete(client.sessionId);
      client.send(JSON.stringify({
        type: 'message',
        message: {
          id: `bot_${Date.now()}`,
          user: 'BOT // RADIO',
          userColor: '#00cc55',
          text: '✓ Your chat mute has been lifted.',
          timestamp: new Date().toISOString()
        }
      }));
    }
  }
  res.json({ success: true });
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── REAL-TIME CHAT WEBSOCKET SERVER ───────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const HANDLE_COLORS = [
  '#6DA871', // sage green
  '#66999E', // slate teal
  '#8F72D5', // lavender violet
  '#00cc55', // neon green
  '#00bbdd', // neon cyan
  '#ff4477', // hot pink
  '#ffaa00', // gold
  '#a855f7', // purple
  '#ff5522', // orange
  '#3b82f6', // electric blue
  '#10b981', // emerald
  '#f43f5e', // rose
  '#06b6d4'  // teal
];

function getHandleColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % HANDLE_COLORS.length;
  return HANDLE_COLORS[idx];
}

function sanitizeMessage(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

const MAX_HISTORY = 100;
const chatHistory = [];

const ipRateLimits = new Map();
function isRateLimited(ip, isDJ) {
  if (isDJ) return false;
  const now = Date.now();
  const windowMs = 5000;
  const maxMessages = 5;
  const timestamps = ipRateLimits.get(ip) || [];
  const valid = timestamps.filter(t => now - t < windowMs);
  if (valid.length >= maxMessages) {
    return true;
  }
  valid.push(now);
  ipRateLimits.set(ip, valid);
  return false;
}

const mutedSessions = new Map();
function isMuted(sessionId, handle) {
  const now = Date.now();
  if (sessionId && mutedSessions.has(sessionId)) {
    if (now < mutedSessions.get(sessionId)) return true;
    mutedSessions.delete(sessionId);
  }
  if (handle && mutedSessions.has(handle.toLowerCase())) {
    if (now < mutedSessions.get(handle.toLowerCase())) return true;
    mutedSessions.delete(handle.toLowerCase());
  }
  return false;
}

function broadcast(data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

const DJ_PASSKEY = process.env.DJ_KEY || 'dlxr2026';

function getOnlineRoster() {
  const list = [];
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      list.push({
        handle: client.userHandle || 'anon',
        color: client.userColor || '#00cc55',
        isDJ: client.isDJ || false,
        badge: client.isDJ ? (client.badge || 'ADMIN') : null
      });
    }
  }
  return list;
}

function broadcastPresence() {
  const roster = getOnlineRoster();
  broadcast({
    type: 'presence',
    online: wss.clients.size,
    roster: roster
  });
}

async function searchAndQueueRequest(ws, query) {
  try {
    const apiUrl = `https://${AZURACAST_HOST}/api/station/${STATION_SHORTCODE}/requests`;
    const res = await new Promise((resolve, reject) => {
      const req = https.get(apiUrl, { agent: httpsAgent }, (r) => {
        let d = '';
        r.on('data', chunk => d += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
    });

    if (!Array.isArray(res) || res.length === 0) {
      ws.send(JSON.stringify({
        type: 'message',
        message: {
          id: `bot_${Date.now()}`,
          user: 'BOT // RADIO',
          userColor: '#00cc55',
          text: `[!] Song requests are currently unavailable on this station.`,
          timestamp: new Date().toISOString()
        }
      }));
      return;
    }

    const q = query.toLowerCase().trim();
    const matches = res.filter(item => {
      const text = (item.song?.text || `${item.song?.artist} ${item.song?.title}`).toLowerCase();
      return text.includes(q);
    });

    if (matches.length === 0) {
      ws.send(JSON.stringify({
        type: 'message',
        message: {
          id: `bot_${Date.now()}`,
          user: 'BOT // RADIO',
          userColor: '#00cc55',
          text: `No tracks matching "${query}" found in station library.`,
          timestamp: new Date().toISOString()
        }
      }));
      return;
    }

    if (matches.length === 1) {
      await submitTrackRequest(ws, matches[0]);
      return;
    }

    // Multiple matches (up to 5)
    const topMatches = matches.slice(0, 5);
    ws.pendingRequests = topMatches;

    const listStr = topMatches.map((m, idx) => `${idx + 1}. ${m.song?.artist || 'Unknown'} — ${m.song?.title || 'Unknown'}`).join('\n');
    ws.send(JSON.stringify({
      type: 'message',
      message: {
        id: `bot_${Date.now()}`,
        user: 'BOT // RADIO',
        userColor: '#00cc55',
        text: `Found multiple matches:\n${listStr}\nType /request 1 to /request ${topMatches.length} to queue.`,
        timestamp: new Date().toISOString()
      }
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'message',
      message: {
        id: `bot_${Date.now()}`,
        user: 'BOT // RADIO',
        userColor: '#00cc55',
        text: `[!] Failed to search library: ${err.message}`,
        timestamp: new Date().toISOString()
      }
    }));
  }
}

const sessionRequestCooldowns = new Map();
const REQUEST_COOLDOWN_MS = 60 * 1000; // 60s per individual session

function getVirtualIp(sessionId, clientIp) {
  const seed = `${clientIp || '127.0.0.1'}_${sessionId || 'default'}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const o1 = 10;
  const o2 = (Math.abs(hash) >> 16) & 255;
  const o3 = (Math.abs(hash) >> 8) & 255;
  const o4 = Math.max(1, Math.abs(hash) & 254);
  return `${o1}.${o2}.${o3}.${o4}`;
}

function checkSessionRequestLimit(sessionId, isDJ) {
  if (isDJ) return { allowed: true };
  const now = Date.now();
  const lastTime = sessionRequestCooldowns.get(sessionId) || 0;
  const elapsed = now - lastTime;
  if (elapsed < REQUEST_COOLDOWN_MS) {
    const remainingSec = Math.ceil((REQUEST_COOLDOWN_MS - elapsed) / 1000);
    return { allowed: false, remainingSec };
  }
  return { allowed: true };
}

function recordSessionRequest(sessionId) {
  if (!sessionId) return;
  sessionRequestCooldowns.set(sessionId, Date.now());
  if (sessionRequestCooldowns.size > 2000) {
    const cutoff = Date.now() - 3600000;
    for (const [k, v] of sessionRequestCooldowns) {
      if (v < cutoff) sessionRequestCooldowns.delete(k);
    }
  }
}

async function submitTrackRequest(ws, trackItem) {
  const sessionId = ws.sessionId || ws.userHandle || 'anon';
  const cooldownCheck = checkSessionRequestLimit(sessionId, ws.isDJ);

  if (!cooldownCheck.allowed) {
    ws.send(JSON.stringify({
      type: 'message',
      message: {
        id: `bot_${Date.now()}`,
        user: 'BOT // RADIO',
        userColor: '#00cc55',
        text: `[!] Please wait ${cooldownCheck.remainingSec}s before requesting another track.`,
        timestamp: new Date().toISOString()
      }
    }));
    return;
  }

  const reqId = trackItem.request_id;
  const trackName = `${trackItem.song?.artist || 'Unknown'} — ${trackItem.song?.title || 'Unknown'}`;
  const postUrl = `https://${AZURACAST_HOST}/api/station/${STATION_SHORTCODE}/request/${reqId}`;
  const virtualIp = getVirtualIp(sessionId, ws.clientIp);

  try {
    const postRes = await new Promise((resolve, reject) => {
      const req = https.request(postUrl, {
        method: 'POST',
        agent: httpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': virtualIp,
          'X-Real-IP': virtualIp,
          'CF-Connecting-IP': virtualIp
        }
      }, (r) => {
        let d = '';
        r.on('data', chunk => d += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { resolve({ success: true }); }
        });
      });
      req.on('error', reject);
      req.end();
    });

    if (postRes && postRes.success === false) {
      ws.send(JSON.stringify({
        type: 'message',
        message: {
          id: `bot_${Date.now()}`,
          user: 'BOT // RADIO',
          userColor: '#00cc55',
          text: `[!] Could not queue "${trackName}": ${postRes.message || 'Request limit reached'}`,
          timestamp: new Date().toISOString()
        }
      }));
      return;
    }

    recordSessionRequest(sessionId);

    const announceMsg = {
      id: `bot_${Date.now()}`,
      user: 'BOT // RADIO',
      userColor: '#00cc55',
      text: `🎵 Request Queued: ${trackName} (AutoDJ will play this soon).`,
      timestamp: new Date().toISOString()
    };
    chatHistory.push(announceMsg);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
    broadcast({
      type: 'message',
      message: announceMsg
    });
    ws.pendingRequests = null;
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'message',
      message: {
        id: `bot_${Date.now()}`,
        user: 'BOT // RADIO',
        userColor: '#00cc55',
        text: `[!] Error submitting request: ${err.message}`,
        timestamp: new Date().toISOString()
      }
    }));
  }
}

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.isDJ = false;
  ws.badge = null;
  ws.pendingRequests = null;
  ws.on('pong', heartbeat);

  const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  let userHandle = `anon_${Math.floor(100 + Math.random() * 900)}`;
  let userColor = getHandleColor(userHandle);
  ws.clientIp = ip;
  ws.userHandle = userHandle;
  ws.userColor = userColor;

  // Send initial state & recent chat history to new connection
  ws.send(JSON.stringify({
    type: 'init',
    defaultHandle: userHandle,
    userColor: userColor,
    online: wss.clients.size,
    roster: getOnlineRoster(),
    history: chatHistory
  }));

  // Notify everyone of updated online listener count & roster in chat
  broadcastPresence();

  ws.on('message', async (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());

      if (data.type === 'auth_dj') {
        const key = String(data.key || '').trim();
        if (key === DJ_PASSKEY) {
          ws.isDJ = true;
          if (!ws.badge) ws.badge = 'ADMIN';
          ws.send(JSON.stringify({
            type: 'auth_success',
            isDJ: true,
            badge: ws.badge
          }));
          ws.send(JSON.stringify({
            type: 'message',
            message: {
              id: `bot_${Date.now()}`,
              user: 'BOT // RADIO',
              userColor: '#00cc55',
              text: `✓ Verified as Admin / Broadcaster. Active badge: [${ws.badge}]. (Type /title <name> to customize your badge at any time).`,
              timestamp: new Date().toISOString()
            }
          }));
          broadcastPresence();
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Authentication failed: invalid passkey.'
          }));
        }
        return;
      }

      if (data.sessionId) {
        ws.sessionId = String(data.sessionId).slice(0, 40);
      }

      if (data.type === 'set_color') {
        const color = String(data.color || '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(color)) {
          userColor = color;
          ws.userColor = userColor;
          ws.send(JSON.stringify({
            type: 'color_updated',
            userColor: userColor
          }));
          broadcastPresence();
        }
        return;
      }

      if (data.type === 'set_handle') {
        let newHandle = String(data.handle || '').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
        if (!newHandle) return;
        if (newHandle.length > 18) newHandle = newHandle.substring(0, 18);
        userHandle = newHandle;
        if (data.color && /^#[0-9a-fA-F]{6}$/.test(data.color)) {
          userColor = data.color;
        } else {
          userColor = getHandleColor(userHandle);
        }
        ws.userHandle = userHandle;
        ws.userColor = userColor;
        ws.send(JSON.stringify({
          type: 'handle_updated',
          handle: userHandle,
          userColor: userColor
        }));
        broadcastPresence();
        return;
      }

      if (data.type === 'message') {
        if (isMuted(ws.sessionId, userHandle)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'You are currently muted from chat by an admin.'
          }));
          return;
        }

        if (isRateLimited(ip, ws.isDJ)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Cooldown: please wait a few seconds before sending again.'
          }));
          return;
        }

        const rawText = String(data.text || '').trim();
        if (!rawText) return;
        if (rawText.length > 280) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Message too long (max 280 characters)'
          }));
          return;
        }

        if (data.handle) {
          let customHandle = String(data.handle).trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
          if (customHandle && customHandle.length <= 18) {
            userHandle = customHandle;
            if (data.color && /^#[0-9a-fA-F]{6}$/.test(data.color)) {
              userColor = data.color;
            } else if (!ws.userColor || ws.userColor === getHandleColor(ws.userHandle)) {
              userColor = getHandleColor(userHandle);
            }
            ws.userHandle = userHandle;
            ws.userColor = userColor;
          }
        }

        // FAIL-SAFE COMMAND INTERCEPTION: Never broadcast any command starting with /
        if (rawText.startsWith('/')) {
          const parts = rawText.slice(1).trim().split(/\s+/);
          const cmd = parts[0].toLowerCase();
          const args = parts.slice(1).join(' ');

          // Admin / Broadcaster Authentication: /auth <key> or /dj <key> or /login <key>
          if (cmd === 'auth' || cmd === 'dj' || cmd === 'login' || cmd === 'pass' || cmd === 'ath' || cmd === 'aut') {
            if (args === DJ_PASSKEY) {
              ws.isDJ = true;
              if (!ws.badge) ws.badge = 'ADMIN';
              ws.send(JSON.stringify({
                type: 'auth_success',
                isDJ: true,
                badge: ws.badge
              }));
              ws.send(JSON.stringify({
                type: 'message',
                message: {
                  id: `bot_${Date.now()}`,
                  user: 'BOT // RADIO',
                  userColor: '#00cc55',
                  text: `✓ Verified as Admin / Broadcaster. Active badge: [${ws.badge}]. (Type /title <name> to customize your badge at any time).`,
                  timestamp: new Date().toISOString()
                }
              }));
              broadcastPresence();
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication failed: invalid passkey.'
              }));
            }
            return;
          }

          // Custom badge title command: /title <name> or /badge <name>
          if (cmd === 'title' || cmd === 'badge' || cmd === 'role') {
            if (!ws.isDJ) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Admin access required. Authenticate first with /auth <passkey>.'
              }));
              return;
            }

            if (!args) {
              ws.send(JSON.stringify({
                type: 'message',
                message: {
                  id: `bot_${Date.now()}`,
                  user: 'BOT // RADIO',
                  userColor: '#00cc55',
                  text: `Active badge: [${ws.badge || 'ADMIN'}]. Type /title <name> to change it (e.g. /title TOP DAWG, /title HOST).`,
                  timestamp: new Date().toISOString()
                }
              }));
              return;
            }

            let cleanTitle = args.trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '').slice(0, 14).toUpperCase();
            if (!cleanTitle) cleanTitle = 'ADMIN';
            ws.badge = cleanTitle;

            ws.send(JSON.stringify({
              type: 'message',
              message: {
                id: `bot_${Date.now()}`,
                user: 'BOT // RADIO',
                userColor: '#00cc55',
                text: `✓ Badge updated to: [${ws.badge}]`,
                timestamp: new Date().toISOString()
              }
            }));
            broadcastPresence();
            return;
          }

          // Admin Clear All Chat: /clearall or /wipe or /clearchat
          if (cmd === 'clearall' || cmd === 'wipe' || cmd === 'clearchat') {
            if (!ws.isDJ) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Admin access required.'
              }));
              return;
            }

            chatHistory.length = 0;
            broadcast({
              type: 'chat_cleared'
            });
            broadcast({
              type: 'message',
              message: {
                id: `sys_${Date.now()}`,
                user: 'SYSTEM',
                userColor: '#ff2277',
                text: '⚠️ Chat history was cleared by an admin.',
                timestamp: new Date().toISOString()
              }
            });
            return;
          }

          // Admin Mute User: /mute <handle> [minutes]
          if (cmd === 'mute') {
            if (!ws.isDJ) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Admin access required.'
              }));
              return;
            }

            const targetParts = args.split(/\s+/);
            const targetHandle = targetParts[0]?.replace(/^@/, '');
            const minutes = parseInt(targetParts[1], 10) || 5;

            if (!targetHandle) {
              ws.send(JSON.stringify({
                type: 'message',
                message: {
                  id: `bot_${Date.now()}`,
                  user: 'BOT // RADIO',
                  userColor: '#00cc55',
                  text: 'Usage: /mute <handle> [minutes] (e.g. /mute troll 10)',
                  timestamp: new Date().toISOString()
                }
              }));
              return;
            }

            const unMuteTime = Date.now() + (minutes * 60 * 1000);
            mutedSessions.set(targetHandle.toLowerCase(), unMuteTime);

            for (const client of wss.clients) {
              if (client.userHandle && client.userHandle.toLowerCase() === targetHandle.toLowerCase()) {
                if (client.sessionId) mutedSessions.set(client.sessionId, unMuteTime);
                client.send(JSON.stringify({
                  type: 'message',
                  message: {
                    id: `bot_${Date.now()}`,
                    user: 'BOT // RADIO',
                    userColor: '#ff2277',
                    text: `[!] You have been muted by an admin for ${minutes} minute(s).`,
                    timestamp: new Date().toISOString()
                  }
                }));
              }
            }

            ws.send(JSON.stringify({
              type: 'message',
              message: {
                id: `bot_${Date.now()}`,
                user: 'BOT // RADIO',
                userColor: '#00cc55',
                text: `✓ Muted @${targetHandle} for ${minutes} minute(s).`,
                timestamp: new Date().toISOString()
              }
            }));
            return;
          }

          // Admin Unmute User: /unmute <handle>
          if (cmd === 'unmute') {
            if (!ws.isDJ) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Admin access required.'
              }));
              return;
            }

            const targetHandle = args.split(/\s+/)[0]?.replace(/^@/, '');
            if (!targetHandle) {
              ws.send(JSON.stringify({
                type: 'message',
                message: {
                  id: `bot_${Date.now()}`,
                  user: 'BOT // RADIO',
                  userColor: '#00cc55',
                  text: 'Usage: /unmute <handle>',
                  timestamp: new Date().toISOString()
                }
              }));
              return;
            }

            mutedSessions.delete(targetHandle.toLowerCase());

            for (const client of wss.clients) {
              if (client.userHandle && client.userHandle.toLowerCase() === targetHandle.toLowerCase()) {
                if (client.sessionId) mutedSessions.delete(client.sessionId);
                client.send(JSON.stringify({
                  type: 'message',
                  message: {
                    id: `bot_${Date.now()}`,
                    user: 'BOT // RADIO',
                    userColor: '#00cc55',
                    text: '✓ Your chat mute has been lifted.',
                    timestamp: new Date().toISOString()
                  }
                }));
              }
            }

            ws.send(JSON.stringify({
              type: 'message',
              message: {
                id: `bot_${Date.now()}`,
                user: 'BOT // RADIO',
                userColor: '#00cc55',
                text: `✓ Unmuted @${targetHandle}.`,
                timestamp: new Date().toISOString()
              }
            }));
            return;
          }

          // Song request command: /request <query>
          if (cmd === 'request' || cmd === 'req') {
            if (!args) {
              ws.send(JSON.stringify({
                type: 'message',
                message: {
                  id: `bot_${Date.now()}`,
                  user: 'BOT // RADIO',
                  userColor: '#00cc55',
                  text: 'Usage: /request <song title or artist> (e.g. /request aphex twin)',
                  timestamp: new Date().toISOString()
                }
              }));
              return;
            }

            // Check if user is picking a number from pending multiple matches
            const numChoice = parseInt(args, 10);
            if (!isNaN(numChoice) && ws.pendingRequests && Array.isArray(ws.pendingRequests)) {
              const selected = ws.pendingRequests[numChoice - 1];
              if (selected) {
                await submitTrackRequest(ws, selected);
                return;
              }
            }

            await searchAndQueueRequest(ws, args);
            return;
          }

          if (cmd === 'np' || cmd === 'track' || cmd === 'song') {
            const np = global.latestNowPlaying;
            const npText = np 
              ? `🎵 Now Playing: ${np.artist} — ${np.title} [${np.show}]`
              : `🎵 Now Playing: IADT Radio Live Stream`;
            ws.send(JSON.stringify({
              type: 'message',
              message: {
                id: `bot_${Date.now()}`,
                user: 'BOT // RADIO',
                userColor: '#00cc55',
                text: sanitizeMessage(npText),
                timestamp: new Date().toISOString()
              }
            }));
            return;
          }

          if (cmd === 'listeners' || cmd === 'stats') {
            const np = global.latestNowPlaying;
            const statsText = `🎧 Station Listeners: ${np?.listeners ?? '1'} | Chat Online: ${wss.clients.size}`;
            ws.send(JSON.stringify({
              type: 'message',
              message: {
                id: `bot_${Date.now()}`,
                user: 'BOT // RADIO',
                userColor: '#00cc55',
                text: sanitizeMessage(statsText),
                timestamp: new Date().toISOString()
              }
            }));
            return;
          }

          if (cmd === 'help' || cmd === 'adminhelp' || cmd === 'ahelp') {
            let helpText = 'Commands:\n• /request <song> — Request a track from library\n• /np — Current song & show\n• /listeners — Active listener stats\n• /clear — Clear your chat window\n• /help — List commands';
            if (ws.isDJ) {
              helpText += '\n\nAdmin Commands:\n• /title <name> — Customize your badge title\n• /clearall — Wipe chat history for everyone\n• /mute <user> [mins] — Mute a disruptive listener\n• /unmute <user> — Unmute a listener';
            }
            ws.send(JSON.stringify({
              type: 'message',
              message: {
                id: `bot_${Date.now()}`,
                user: 'BOT // RADIO',
                userColor: '#00cc55',
                text: sanitizeMessage(helpText),
                timestamp: new Date().toISOString()
              }
            }));
            return;
          }

          // Unrecognized command: fail-safe private response
          ws.send(JSON.stringify({
            type: 'message',
            message: {
              id: `bot_${Date.now()}`,
              user: 'BOT // RADIO',
              userColor: '#00cc55',
              text: `Unrecognized command "/${cmd}". Type /help to see available commands.`,
              timestamp: new Date().toISOString()
            }
          }));
          return;
        }

        const msgObj = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          user: userHandle,
          userColor: userColor,
          isDJ: ws.isDJ || false,
          badge: ws.isDJ ? (ws.badge || 'ADMIN') : null,
          text: sanitizeMessage(rawText),
          timestamp: new Date().toISOString()
        };

        chatHistory.push(msgObj);
        if (chatHistory.length > MAX_HISTORY) {
          chatHistory.shift();
        }

        broadcast({
          type: 'message',
          message: msgObj
        });
      }
    } catch (err) {
      console.error('WS message parse error:', err.message);
    }
  });

  ws.on('close', () => {
    broadcastPresence();
  });

  ws.on('error', (err) => {
    console.error('WS client error:', err.message);
  });
});

// Periodic ping interval to clean dead connections
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// HTTP Upgrade handler for WebSocket path /ws/chat
server.on('upgrade', (request, socket, head) => {
  try {
    const { pathname } = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (pathname === '/ws/chat') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  } catch (e) {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Radio Visualizer Frontend server running on http://0.0.0.0:${PORT}`);
});

