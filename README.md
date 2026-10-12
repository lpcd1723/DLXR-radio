# DLXR // IADT Radio Web

Interactive WebGL music visualizer & live radio web player for **DLXR / IADT College Radio**, backed by AzuraCast.

For long-term technical architecture, database logging specifications, admin panel plans, and real-time chat/video scaling, see the [**Technical Roadmap (`ROADMAP.md`)**](ROADMAP.md).

---

## ✨ Features

- **Live Audio Streaming**: High-fidelity audio stream proxied directly from the station's AzuraCast backend (`/stream`).
- **Interactive WebGL Visualizer**: Butterchurn (Milkdrop 2 WebGL port) reactive music visualizer with smooth crossfades and dynamic theme adaptation (`Space` or click to cycle presets, `F` for fullscreen).
- **Real-Time Live Chatroom (`/ws/chat`)**:
  - Custom listener handles with localStorage persistence.
  - **Handle Accent Color Picker**: 10 selectable neon and pastel swatches (`#6DA871`, `#66999E`, `#3B82F6`, `#8F72D5`, `#00ff66`, `#00e5ff`, `#ff9100`, `#ffff00`, `#ff007f`, `#f0f0f0`) synced across messages and active roster.
  - **Interactive Listener Roster**: Live active listener counter and popover list showing handles and custom color accents.
  - **Safe URL Auto-Linkification**: Automatically converts `https://` URLs in chat into safe, clickable external links.
  - **In-Chat Commands**: `/request <song>`, `/np`, `/listeners`, `/clear`, and dynamic `/help`.
  - **Broadcaster Verification & Moderation**: Authenticate with `/auth <passkey>` to unlock the metallic gold `[ADMIN]` badge, customizable badge title `/title <name>`, `/clearall` (wipes chat for all listeners), and `/mute <handle> [minutes]`.
- **Backend Admin Dashboard (`/admin`)**:
  - Secure passkey login via `/api/admin/auth`.
  - Live broadcast telemetry (unique listener counts, stream health, track info, server uptime, Node memory RSS/heap).
  - Searchable bug reports & listener feedback viewer with device/OS parsing and explicit log clearing.
  - Chat moderation suite with live message preview, active mute tracking with live countdowns, and instant chat purge.
- **Mobile & iOS Dynamic Island Integration**:
  - Native Web `MediaSession` API support pushing live track title, artist, show name, and multi-res proxied artwork (`/api/art`) directly to the **iOS Dynamic Island**, **Lock Screen Player**, **Control Center**, and **Apple Watch**.
  - Hardware & headphone play/pause/stop action handlers.
  - Mobile bottom-sheet floating drawer layout (`80dvh`, swipeable top navbar, safe-area inset padding).
  - Touch-optimized volume slider with 100% default initialization.
- **Continuous 60 FPS Scrubber Engine**: High-precision local time calibration that glides smoothly across track duration without polling jumps or crossfade stutters.
- **Retro Terminal UI**: CRT scanlines, dot-grid overlays, draggable floating windows for Chat, Video, and Bug Reporting, with clean `DARK` / `LIGHT` theme switching.
- **Persistent Data Storage**: Host-mounted `/srv/college-radio-demo/data` volume preventing bug report loss across Docker container rebuilds.

---

## 🐞 Bug Reporting & Persistence

- **Listener Submission**: Accessible via the `BUG` button in the top navigation bar. Form captures issue category (*Audio Stream*, *Visualizer*, *Track Info*, *UI & Controls*, *Other*), description, device user agent, and timestamp.
- **Backend Storage (`POST /api/report`)**: Appends structured JSON lines to `/app/data/reports.log`.
- **Admin Management**: View, filter, and clear reports directly from the `/admin` dashboard.
- **Persistence**: Mounted to `./data:/app/data` to ensure zero data loss during container updates.

---

## 🛠️ Quickstart (Local Development)

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- Access to AzuraCast instance (default: `192.168.0.53`)

### 2. Install & Configure
```bash
# Install dependencies
npm install

# (Optional) Copy environment template
cp .env.example .env
```

### 3. Start Development Server
```bash
# Run server with live hot-reloading on file changes
npm run dev
```
Open **`http://localhost:8080`** in your browser.

---

## 📁 Project Structure

```
college-radio-demo/
├── .env.example          # Environment variables reference
├── .gitignore            # Git ignore rules
├── Dockerfile            # Production Docker image definition
├── docker-compose.yml    # Homelab container orchestration with data volume
├── package.json          # Node scripts and dependencies
├── server.js             # Thin Express entrypoint & modular service mounter
├── src/                  # Core microservices & routes
│   ├── routes/
│   │   └── stream.js     # Audio proxy, nowplaying caching & album art proxy
│   └── chat/
│       └── chat-server.js# WebSocket chatroom, presence roster & moderation engine
├── modules/              # Optional private services (admin, curation - gitignored)
├── data/                 # Persistent storage (reports.log, curation_state.json - gitignored)
├── test/                 # Automated test suites
│   ├── test-chat.js      # WebSocket chat & admin suite test runner
│   └── test-listeners.js # Synthetic listener load testing script
├── CONTRIBUTING.md       # Contribution guidelines & PR review workflow
├── ROADMAP.md            # Technical architecture & feature roadmap
└── public/               # Frontend static assets
    ├── index.html        # Main web player interface
    ├── style.css         # UI styling, tokens, animations & scanlines
    ├── app.js            # Visualizer, audio player & chat engine
    ├── assets/           # Station logos, favicons & touch icons
    └── js/               # Butterchurn WebGL visualizer runtime & presets
```

---

## 🚀 Production Deployment (Docker Compose)

Deploy anywhere (VPS, server, or container):

```bash
# Build and run in background with persistent volume mounts
docker compose up -d --build

# View container logs
docker compose logs -f
```

---

## 🧪 Automated Testing & Diagnostics

### 1. WebSocket Live Chat & Admin Suite Test
Verifies multi-client WebSocket connections, nick updates, color swatches, admin authentication, `/title` updates, `/mute`, `/clearall`, and command suppression:

```bash
npm test
```

### 2. Synthetic Listener Testing
Simulate concurrent listener spikes to verify proxy load and listener metric reconciliation:

```bash
# Test local server
npm run test:listeners

# Test remote target
TEST_HOST=https://iadt-radio.online npm run test:listeners
```

---

## 🤝 Contributing

We welcome pull requests! All PRs must go through review by `@lpcd1723` before merging. See [**`CONTRIBUTING.md`**](CONTRIBUTING.md) for local development setup, branching guidelines, and our PR checklist.

---

## 🎧 Music Curation Deck & Auto-Intake Engine

A dedicated station curation suite is accessible at **`/admin/curate`** (protected by broadcaster passkey `DJ_KEY`):

### 1. Fast Audition Deck (`/admin/curate`)
- **Smart Auto-Seek**: Starts preview playback at **30% into each song** to immediately audition vocals/melody past intro silence.
- **One-Key Desktop Controls**:
  - `→` / `K` / `Enter`: **KEEP** (Approved for broadcast) $\to$ auto-advances.
  - `←` / `X` / `Backspace`: **CUT** (Excluded from broadcast) $\to$ auto-advances.
  - `Space`: Pause / Resume preview.
  - `1`, `2`, `3`: Jump to 25%, 50%, 75% of track duration.
  - `Z` / `U`: **Undo** previous decision.
  - `A`: **Ban Entire Artist** (instantly cuts all tracks and blacklists future downloads).
  - `S`: Skip without deciding.
- **Mobile Touch / Couch Mode**: Full touch drag support—swipe right to Keep, swipe left to Cut with visual angle tilt and stamp feedback.
- **Instant Eviction**: Cutting a track or banning an artist instantly removes it from AzuraCast Playlist 1 and evicts it from the live upcoming playout queue.

### 2. Dual-Path Auto-Intake Engine
- **Server Downloads (Soulseek / `slskd` / Samba)**: Runs an automated background sweep every 5 minutes on CT 102. Newly scanned files are enrolled into Playlist 1 (`default`) automatically, or quarantined to Playlist 3 (`banned`) if matching blacklisted artists.
- **Mac Downloads (`music-add.sh` $\to$ `execute_send.py`)**: Post-sync webhook automatically triggers immediate intake upon upload (~2s).

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Web server listening port | `8080` |
| `AZURACAST_HOST` | Hostname/IP of AzuraCast server | `192.168.0.53` |
| `STATION_SHORTCODE` | Station slug on AzuraCast | `iadt_radio` |
| `AZURACAST_API_KEY` | Split token API key for AzuraCast REST API | Generated token |
| `DJ_KEY` | Broadcaster admin passkey | `dlxr2026` |
| `DATA_DIR` | Persistent data directory | `/app/data` |

---

## 🗺️ Architectural Roadmap

Detailed plans for future phases are documented in [**`ROADMAP.md`**](ROADMAP.md):
- **Live Video Ingest & Stream**: WebRTC / LL-HLS video feed for DJ sets and live studio cameras.
- **Weekly Timetable & Schedule**: Interactive show calendar with automated timezone conversion.
- **On-Demand Show Archives**: Audio on demand (AOD) with waveform scrubbers and tracklist cue sheets.
- **PWA & Offline Shell**: Installable desktop & mobile app with standalone caching.
