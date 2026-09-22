# DLXR // IADT Radio Web

Interactive WebGL music visualizer & live radio web player for **DLXR / IADT College Radio**, backed by AzuraCast.

For long-term technical architecture, database logging specifications, admin panel plans, and real-time chat/video scaling, see the [**Technical Roadmap (`ROADMAP.md`)**](ROADMAP.md).

---

## ✨ Features

- **Live Audio Streaming**: High-fidelity audio stream proxied directly from the station's AzuraCast backend (`/stream`).
- **Interactive WebGL Visualizer**: Butterchurn (Milkdrop 2 WebGL port) reactive music visualizer with smooth crossfades and dynamic theme adaptation.
- **Continuous 60 FPS Scrubber Engine**: High-precision local time calibration that glides seamlessly across track duration without polling jumps or crossfade stutters, holding cleanly at track ends until new broadcasts begin.
- **Accurate Listener Tracking**: Prioritizes de-duplicated unique listener counts (`listeners.unique`) to eliminate HTML5/Web Audio dual-socket counts.
- **Dynamic Track Metadata & Album Art**: Real-time track information and cover art updates queried via the AzuraCast Now Playing API (`/api/nowplaying`) tracked with unique playback IDs (`sh_id`).
- **Retro Terminal UI**: Custom scanlines, dot-grid overlays, draggable floating windows for Chat, Video, and Bug Reporting, with quick theme switching (`DARK` / `LIGHT`).
- **Integrated Bug Reporting System**: Built-in modal allowing listeners to submit feedback and issue reports directly from the player interface (`POST /api/report`).

---

## 🐞 Bug Reporting System

The application features a built-in telemetry and bug reporting pipeline:

- **Frontend Interface**: Accessible via the `BUG` button in the top navigation bar or toolbar. Listeners can choose an issue category (*Audio Stream*, *Visualizer*, *Track Info*, *UI & Controls*, *Other*) and submit descriptions.
- **Backend Ingestion (`POST /api/report`)**:
  - Accepts JSON payloads containing `category`, `description`, `userAgent`, and `timestamp`.
  - Captures listener IP address and server timestamps.
- **Structured File Logging**:
  - Each report is appended as a single JSON line to `reports.log` (located at `/app/reports.log` inside Docker containers, or `./reports.log` locally).
  - Reports are simultaneously output to stdout for Docker log shippers (e.g., Loki / Promtail).
- **Future Database & Admin Triage**: See the [Roadmap](ROADMAP.md#1-centralized-logging--telemetry-system) for the planned SQLite/PostgreSQL database migration and `/admin` triage dashboard.

---

## 🛠️ Quickstart (Local Development)

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- Access to your local LAN or AzuraCast instance (default: `192.168.0.53`)

### 2. Install & Configure
```bash
# Install dependencies
npm install

# (Optional) Copy environment template if you need custom hosts/ports
cp .env.example .env
```

### 3. Start Development Server
```bash
# Run server with live hot-reloading on file changes
npm run dev
```
Open **`http://localhost:8080`** in your browser. Any change you save in `public/` or `server.js` will immediately update.

---

## 📁 Project Structure

```
college-radio-demo/
├── .env.example          # Environment variables reference
├── .gitignore            # Git ignore rules
├── Dockerfile            # Production Docker image definition
├── docker-compose.yml    # Homelab container orchestration
├── package.json          # Node scripts and dependencies
├── server.js             # Express proxy server, API endpoints & bug logger
├── reports.log           # Generated structured bug report log file
├── ROADMAP.md            # Technical architecture, telemetry & feature roadmap
└── public/               # Frontend static assets
    ├── index.html        # Main web player interface & modal templates
    ├── style.css         # Retro UI styling, themes & scanline shaders
    ├── app.js            # Visualizer (Butterchurn) & player logic
    └── js/               # Butterchurn visualizer runtime & presets
```

---

## 🚀 Homelab Deployment

### Option A: Direct Docker Compose on Homelab
1. Push your changes to Git:
   ```bash
   git add .
   git commit -m "Your update description"
   git push origin main
   ```
2. On your homelab server:
   ```bash
   git pull origin main
   docker compose up -d --build
   ```

### Option B: Local Docker Testing
To test the production container locally:
```bash
npm run docker:build
npm run docker:up
npm run docker:logs
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Web server listening port | `8080` |
| `AZURACAST_HOST` | Hostname/IP of AzuraCast server | `192.168.0.53` |
| `STATION_SHORTCODE` | Station slug on AzuraCast | `iadt_radio` |

---

## 🗺️ Architectural Roadmap

Detailed plans for the next phases of development are documented in [**`ROADMAP.md`**](ROADMAP.md):
- **Centralized Logging & Telemetry**: SQLite/PostgreSQL storage, audio dropout beacons, Grafana/Loki integration.
- **Admin Dashboard (`/admin`)**: Cloudflare Zero Trust auth, bug triage center, live listener analytics, chat moderation tools.
- **Chat & Video Scaling**: WebSockets / SSE with Redis Pub/Sub, WebRTC / LL-HLS video streaming pipeline.
- **UI & Content Expansion**: Full weekly show schedule, on-demand show archives with waveform scrubbers, PWA offline support.
