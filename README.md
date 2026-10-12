# DLXR // IADT Radio Web

[![CI](https://github.com/lpcd1723/college-radio-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/lpcd1723/college-radio-demo/actions/workflows/ci.yml)

WebGL music visualizer and live web player for DLXR / IADT College Radio, backed by AzuraCast.

---

## Features

- **Audio Streaming**: Live audio stream proxied directly from the station AzuraCast instance (`/stream`).
- **WebGL Visualizer**: Butterchurn (Milkdrop 2 WebGL port) music visualizer (`Space` or click canvas to cycle presets, `F` for fullscreen).
- **Live Chat (`/ws/chat`)**:
  - Persistent handles and 10 accent color swatches.
  - Active listener roster and counter.
  - Automatic linkification for external URLs.
  - Commands: `/request <song>`, `/np`, `/listeners`, `/clear`, and `/help`.
  - Broadcaster verification: `/auth <passkey>` to unlock badge title, `/title <name>`, `/clearall`, and `/mute <handle> [minutes]`.
- **Mobile & MediaSession**:
  - Web `MediaSession` integration for iOS Lock Screen, Dynamic Island, and Android player notifications.
  - Mobile bottom-sheet layout with safe-area inset support.
- **Diagnostics & Bug Reports**: Form submission at `/api/report` appending structured feedback to `data/reports.log`.

---

## Quickstart (Local Development)

### 1. Prerequisites
- Node.js (v18+)
- Access to station AzuraCast host or proxy

### 2. Install & Configure
```bash
git clone https://github.com/lpcd1723/college-radio-demo.git
cd college-radio-demo

npm install
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```
Open `http://localhost:8080` in your browser.

---

## Project Structure

```
college-radio-demo/
├── .env.example          # Environment variables reference
├── .gitignore            # Git ignore rules
├── Dockerfile            # Production container build
├── docker-compose.yml    # Container orchestration with data volume
├── package.json          # Node scripts and dependencies
├── server.js             # Thin Express entrypoint & modular service mounter
├── src/                  # Core services & routes
│   ├── routes/
│   │   └── stream.js     # Audio proxy, nowplaying caching & album art proxy
│   └── chat/
│       └── chat-server.js# WebSocket chatroom, presence roster & moderation engine
├── data/                 # Persistent storage (reports.log - gitignored)
├── test/                 # Automated test suites
│   ├── test-chat.js      # WebSocket chat & moderation test runner
│   └── test-listeners.js # Listener load testing script
├── CONTRIBUTING.md       # Contribution guidelines & PR review workflow
└── public/               # Frontend static assets
    ├── index.html        # Main web player interface
    ├── style.css         # UI styling, tokens, animations & scanlines
    ├── app.js            # Visualizer, audio player & chat engine
    ├── assets/           # Station logos, favicons & touch icons
    └── js/               # Butterchurn WebGL visualizer runtime & presets
```

---

## Production Deployment (Docker Compose)

```bash
# Build and run container
docker compose up -d --build

# View container logs
docker compose logs -f
```

---

## Testing

```bash
# Run syntax lint
npm run lint

# Run WebSocket & chat integration test
npm test
```

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Web server listening port | `8080` |
| `AZURACAST_HOST` | Hostname/IP of AzuraCast server | `192.168.0.53` |
| `STATION_SHORTCODE` | Station slug on AzuraCast | `iadt_radio` |
| `DJ_KEY` | Broadcaster moderation passkey | `dlxr2026` |
| `DATA_DIR` | Persistent data directory | `/app/data` |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch conventions, local testing, and pull request guidelines. All PRs are reviewed before merging into `main`.
