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
        
        // Rewrite art URLs to relative paths through our proxy
        if (json?.now_playing?.song?.art) {
          const originalArt = json.now_playing.song.art;
          const match = originalArt.match(/\/api\/station\/[^/]+\/art\/[^/]+/);
          if (match) {
            json.now_playing.song.art = match[0];
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
        res.json(json);
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

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── REAL-TIME CHAT WEBSOCKET SERVER ───────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const HANDLE_COLORS = [
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
function isRateLimited(ip) {
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

function broadcast(data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastPresence() {
  broadcast({
    type: 'presence',
    online: wss.clients.size
  });
}

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  let userHandle = `anon_${Math.floor(100 + Math.random() * 900)}`;
  let userColor = getHandleColor(userHandle);

  // Send initial state & recent chat history to new connection
  ws.send(JSON.stringify({
    type: 'init',
    defaultHandle: userHandle,
    userColor: userColor,
    online: wss.clients.size,
    history: chatHistory
  }));

  // Notify everyone of updated online listener count in chat
  broadcastPresence();

  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());

      if (data.type === 'set_handle') {
        let newHandle = String(data.handle || '').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
        if (!newHandle) return;
        if (newHandle.length > 18) newHandle = newHandle.substring(0, 18);
        userHandle = newHandle;
        userColor = getHandleColor(userHandle);
        ws.send(JSON.stringify({
          type: 'handle_updated',
          handle: userHandle,
          userColor: userColor
        }));
        return;
      }

      if (data.type === 'message') {
        if (isRateLimited(ip)) {
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
            userColor = getHandleColor(userHandle);
          }
        }

        // Handle Interactive Chat Commands
        if (rawText.startsWith('/')) {
          const cmd = rawText.toLowerCase().trim();
          if (cmd === '/np' || cmd === '/track' || cmd === '/song') {
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
          if (cmd === '/listeners' || cmd === '/stats') {
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
          if (cmd === '/help') {
            ws.send(JSON.stringify({
              type: 'message',
              message: {
                id: `bot_${Date.now()}`,
                user: 'BOT // RADIO',
                userColor: '#00cc55',
                text: sanitizeMessage('Commands: /np (Current track info), /listeners (Listener stats), /clear (Clear chat view), /help (Commands)'),
                timestamp: new Date().toISOString()
              }
            }));
            return;
          }
        }

        const msgObj = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          user: userHandle,
          userColor: userColor,
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

