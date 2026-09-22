const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

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
  
  const proxyReq = https.get(streamUrl, { agent: httpsAgent }, (proxyRes) => {
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

        // Accurately resolve and enrich listener metrics
        const acListeners = json?.listeners?.current ?? json?.listeners?.total ?? json?.station?.mounts?.[0]?.listeners?.current ?? 0;
        const totalListeners = Math.max(acListeners, activeStreamClients);

        if (!json.listeners) json.listeners = {};
        json.listeners.current = totalListeners;
        json.listeners.proxy_clients = activeStreamClients;
        json.listeners.total = Math.max(json.listeners.total || 0, totalListeners);

        res.setHeader('Content-Type', 'application/json');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Radio Visualizer Frontend server running on http://0.0.0.0:${PORT}`);
});
