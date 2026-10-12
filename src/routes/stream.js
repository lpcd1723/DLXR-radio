const https = require('https');

function registerStreamRoutes(app, options) {
  const {
    AZURACAST_HOST,
    STATION_SHORTCODE,
    httpsAgent,
    wss
  } = options;

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

  // Now Playing API proxy endpoint with in-memory caching
  let cachedNowPlaying = null;
  let cachedNowPlayingTime = 0;
  const CACHE_TTL_MS = 2500; // 2.5s cache prevents thundering herd to AzuraCast

  app.get('/api/nowplaying', (req, res) => {
    const now = Date.now();
    if (cachedNowPlaying && (now - cachedNowPlayingTime < CACHE_TTL_MS)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, max-age=0');
      res.setHeader('X-Cache', 'HIT');
      return res.send(cachedNowPlaying);
    }

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
          res.setHeader('X-Cache', 'MISS');
          
          // Remove all traces of internal IP / host across the entire payload
          const sanitizedData = JSON.stringify(json).replace(new RegExp(`https?://${AZURACAST_HOST}`, 'g'), '');
          cachedNowPlaying = sanitizedData;
          cachedNowPlayingTime = now;
          res.send(sanitizedData);
        } catch (err) {
          res.status(500).json({ error: 'Failed to parse nowplaying data' });
        }
      });
    });

    proxyReq.on('error', (err) => {
      console.error('Nowplaying proxy error:', err.message);
      if (cachedNowPlaying) {
        // Fallback to cached payload on transient network hiccup
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'STALE');
        return res.send(cachedNowPlaying);
      }
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

  return {
    getActiveStreamClients: () => activeStreamClients
  };
}

module.exports = { registerStreamRoutes };
