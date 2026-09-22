# 🗺️ DLXR // IADT College Radio — Technical Roadmap & Architecture

This document outlines the architectural vision, technical specifications, and progressive implementation milestones for the **DLXR / IADT College Radio** web platform.

---

## 📑 Table of Contents
1. [Architecture Overview](#-architecture-overview)
2. [1. Centralized Logging & Telemetry System](#1-centralized-logging--telemetry-system)
3. [2. Admin & Moderation Dashboard (`/admin`)](#2-admin--moderation-dashboard-admin)
4. [3. Real-Time Chat & Video Scaling Architecture](#3-real-time-chat--video-scaling-architecture)
5. [4. Upcoming UI/UX & Content Features](#4-upcoming-uiux--content-features)
6. [5. Delivery Milestones & Phasing](#5-delivery-milestones--phasing)

---

## 🏗 Architecture Overview

```
                          ┌────────────────────────┐
                          │   Cloudflare / Edge    │
                          │ (Zero Trust / WAF / SSL│
                          └───────────┬────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │   Node.js Express App   │
                         │    (iadt_radio_web)     │
                         └──┬───────────┬────────┬─┘
                            │           │        │
           ┌────────────────┘           │        └────────────────┐
           ▼                            ▼                         ▼
┌────────────────────┐      ┌───────────────────────┐   ┌───────────────────┐
│   AzuraCast Core   │      │  SQLite / PostgreSQL  │   │ Grafana + Loki /  │
│ (Audio Stream API) │      │ (Reports, Audit, Chat)│   │ Prometheus Metrics│
└────────────────────┘      └───────────────────────┘   └───────────────────┘
```

---

## 1. Centralized Logging & Telemetry System

### 1.1 Current Baseline
- Client-side bug reporting via `POST /api/report`.
- Server appends structured JSON entries to flat log file `reports.log` (located at `/app/reports.log` inside containers) and outputs to stdout.

### 1.2 Target Architecture: Structured Database Storage
Transition from flat-file logging to a resilient, queryable database store:
- **Storage Engine Options**:
  - **Embedded / Local**: SQLite via `better-sqlite3` or `libsql` for single-node homelab deployments.
  - **Relational / Scalable**: PostgreSQL (via Prisma or Drizzle ORM) for multi-container and high-concurrency environments.
- **Log Data Models**:
  - `bug_reports`: Category, description, timestamp, user agent, client IP, resolution status (`OPEN`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`), assigned admin, triage notes.
  - `stream_telemetry`: Client audio buffer health, playback stall events, dropout duration, listener bandwidth stats, audio format / codec data.
  - `client_errors`: Unhandled WebGL visualizer errors (Butterchurn canvas crashes, shader compile failures), audio context state failures, API timeout events.
  - `admin_audit_logs`: Record all admin actions (status changes, IP bans, chat deletions, configuration changes).

### 1.3 Telemetry & Observability Pipeline
- **Stream Diagnostics & Heartbeat**:
  - Background daemon pinging AzuraCast `/api/nowplaying` and `/api/status` every 15 seconds.
  - Continuous measurement of stream availability, bitrate consistency, and Icecast mount point response latency.
- **Client Quality of Experience (QoE) Telemetry**:
  - Lightweight beaconing (`navigator.sendBeacon` on buffer underflow or stall events) to capture playback interruptions without disrupting client performance.
  - Visualizer FPS tracking to identify client hardware performance bottlenecks.
- **Log Aggregation & Monitoring Integration**:
  - **Self-Hosted Stack**: Promtail / Vector shipping server logs and Docker stdout directly to **Grafana Loki**; **Prometheus** metrics scraped via `/metrics` (Prometheus client) visualized on Grafana dashboards.
  - **Cloud / Managed Alternative**: OpenTelemetry collector or lightweight exporter to Logtail/Better Stack or Axiom.

---

## 2. Admin & Moderation Dashboard (`/admin`)

A unified operational cockpit accessible at `/admin` to manage station health, listener reports, chat moderation, and live broadcasts.

### 2.1 Secure Authentication & Access Control
- **Authentication Strategies**:
  - **Cloudflare Zero Trust (Recommended for Homelab/Production)**: Protect `/admin` and `/api/admin/*` behind Cloudflare Access with email OTP / Google Workspace SSO, verifying `Cf-Access-Jwt-Assertion` headers at the Express layer.
  - **Session & JWT Fallback**: Standalone Argon2id password hashing + HTTP-only encrypted session cookies for offline/local environments.
  - **Role-Based Access Control (RBAC)**:
    - `DJ`: View schedule, read track requests, view live listener count.
    - `MODERATOR`: Chat moderation queue, flag resolution, temporary user mutes.
    - `ADMIN`: Full access to bug triage, telemetry analytics, IP ban manager, system configuration, and log exports.

### 2.2 Bug Report Triage Dashboard
- Real-time tabular interface with instant search and multi-criteria filters (Category: *Audio*, *Visualizer*, *Track Info*, *UI*, *Other*; Status: *Open*, *In Progress*, *Resolved*).
- Detail modal showing full user-agent parsing (Browser, OS, Screen resolution), error traces, and timestamp.
- Quick triage actions: Mark resolved, add internal moderator note, or export filtered reports to CSV/JSON.

### 2.3 Live Stream Diagnostics & Listener Analytics
- **Live Stats Panel**: Real-time listener count, peak concurrent listeners today, total streaming hours, and geo-distribution (via Cloudflare/AzuraCast IP headers).
- **Health Indicators**: Icecast stream uptime counter, buffer dropout frequency, AzuraCast API latency, and fallback audio status.

### 2.4 Chat Moderation & Community Safety Queue
- Live stream of all incoming chat messages with instant one-click actions:
  - 🗑️ **Delete Message** (broadcasts tombstone event to all clients).
  - ⏱️ **Timeout User** (5m / 1h / 24h mute).
  - 🚫 **Ban Fingerprint / IP** (blocks further message dispatch).
- Automated regex and blocklist keyword filter to automatically quarantine toxic messages into a review queue.
- Searchable moderation audit history.

### 2.5 Video Broadcast Control Panel
- Visual indicator of current WebRTC / HLS video ingest stream status.
- Live stream key management & preview player.
- Emergency alert banner toggle (push broadcast notification across all listening web clients).

---

## 3. Real-Time Chat & Video Scaling Architecture

```
                               ┌────────────────────────┐
                               │     Web Clients        │
                               └───────▲────────▲───────┘
                                       │        │
                   WebSocket / SSE     │        │ WebRTC / HLS
                   (Chat & Metadata)   │        │ (Live Video)
                                       │        │
                               ┌───────┴────────┴───────┐
                               │   Express WS Server    │
                               │   (Socket.io / ws)     │
                               └───────────┬────────────┘
                                           │
                               ┌───────────┴────────────┐
                               │  Redis Pub/Sub & Cache │
                               │(Horizontal Multi-Node) │
                               └────────────────────────┘
```

### 3.1 Interactive Chat Architecture
- **Transport**: WebSockets (`ws` or `Socket.io`) with automatic fallback to Server-Sent Events (SSE) + HTTP POST for restrictive networks.
- **Horizontal Scaling**: Redis Pub/Sub adapter to allow horizontal node scaling across multiple container instances.
- **Message Durability**:
  - Ephemeral chat cache in Redis (last 50 messages retained for instantaneous initial client load).
  - Asynchronous batch flushing into PostgreSQL/SQLite for compliance, moderation logs, and search.
- **Rate Limiting & Anti-Spam**:
  - Client-side cooldown timers + server-side sliding-window rate limit (e.g., max 3 messages per 5 seconds per IP).
  - Nickname collision management and profanity filtering.

### 3.2 Live Video Stream Scaling (Studio Cam & DJ Sets)
- **Ingest**: OBS / Studio hardware streaming via RTMP or WHIP (WebRTC HTTP Ingestion Protocol).
- **Transcoding & Media Server**:
  - **Self-Hosted**: MediaMTX (formerly rtsp-simple-server) or OvenMediaEngine running alongside the radio stack.
  - **Cloud Alternative**: Cloudflare Stream / AWS IVS for zero-infrastructure global distribution.
- **Egress & Playback**:
  - Ultra-low-latency WebRTC (WHEP) for live DJ interaction (<500ms latency).
  - Low-Latency HLS (LL-HLS via `hls.js`) fallback for maximum device compatibility on mobile browsers.
  - Automatic synchronization: If video is offline, the web player gracefully collapses the video panel into audio-only visualizer mode.

---

## 4. Upcoming UI/UX & Content Features

### 4.1 Full Show Schedule & Timetable
- Interactive weekly calendar grid showing live DJ shows, prerecorded sets, and automated playlists.
- Show cards with DJ bios, genre tags, cover art, and social links.
- "Notify Me" feature with browser Web Push notifications before favourite shows go live.
- Automated timezone detection and conversion for international listeners.

### 4.2 Show Archive & On-Demand Playback (AOD / Podcasts)
- On-demand archive of past recordings with integrated audio waveform scrubbers.
- Tracklist cue sheet integration: Jump directly to individual songs played during archived sets.
- RSS podcast feed generator for syndication to Apple Podcasts / Spotify.

### 4.3 Web Player & Visualizer Enhancements
- **Audio Scrobbling**: Optional Last.fm / ListenBrainz scrobbling integration.
- **Audio Recording**: Client-side recording button to save snippets directly to MP3/WAV.
- **Visualizer Expansions**: User preset selector for Butterchurn, custom shader upload support, and audio-reactive 3D scenes (Three.js / WebGPU).
- **Responsive Retro Skins**: Expand beyond `DARK` and `LIGHT` to include `CYBERPUNK`, `TERMINAL-GREEN`, `AMIGA`, and `WINAMP-CLASSIC` themes.

### 4.4 Accessibility & Mobile Experience
- Full Progressive Web App (PWA) manifest with offline caching and standalone installation.
- Native `MediaSession` API integration (lock screen controls, album artwork, previous/next track metadata).
- Comprehensive keyboard navigation shortcuts (Space to toggle play/visuals, `M` to mute, `T` to cycle themes).
- High-contrast ARIA accessibility compliance for screen readers.

---

## 5. Delivery Milestones & Phasing

| Phase | Milestone | Key Deliverables | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Foundation & MVP** | Express proxy server, AzuraCast live audio stream, Butterchurn visualizer, now-playing metadata, basic theme toggle, flat-file bug reports. | ✅ **Complete** |
| **Phase 2** | **Telemetry & Admin Triage** | Database-backed report storage (SQLite/Postgres), `/admin` dashboard with Cloudflare Zero Trust / JWT auth, bug report triage workflow, stream health heartbeat. | 🔄 **In Progress** |
| **Phase 3** | **Interactive Community** | WebSocket real-time chat room, moderation queue (mutes, bans, message deletion), user rate limiting, Redis pub/sub integration. | ⏳ **Planned** |
| **Phase 4** | **Rich Content & Media** | Live video stream integration (MediaMTX / LL-HLS), full weekly show schedule, show archive with waveform scrubbing, DJ profile system. | ⏳ **Planned** |
| **Phase 5** | **Platform Polish & PWA** | PWA offline support, MediaSession lockscreen integration, Grafana/Loki observability dashboards, expanded retro skin pack. | ⏳ **Planned** |

---

*DLXR // IADT Radio is maintained by the IADT Student Broadcasting Society.*
