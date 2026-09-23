---
name: vault-context
description: Reads and loads all Obsidian ProjectVault context for the DLXR College Radio project, Homelab infrastructure, Proxmox CT 102, AzuraCast streaming backend, Cloudflare named tunnels, and Butterchurn WebGL visualizer architecture. Activate this skill whenever the user asks for vault context, homelab info, radio architecture, or full project background.
---

# Project & Homelab Vault Context Guide

This skill directs the agent to locate, load, and reference the comprehensive architecture notes stored in the local Obsidian **`ProjectVault`** at `/Users/lperez/projects/ProjectVault`.

---

## 1. Primary Vault Documents to Read

When working on this project or handling infrastructure tasks, use `view_file` to read the relevant source notes in the vault:

| Project Area | Vault File Location | Key Context / Topics |
| :--- | :--- | :--- |
| **College Radio Station** | [`/Users/lperez/projects/ProjectVault/30 - Projects/College Radio Station/College Radio Station.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/College%20Radio%20Station/College%20Radio%20Station.md) | High-level station vision, legal/licensing (PPI Tariff 77 / IMRO LOEL), AzuraCast playout, DJ harbor inputs, booth hardware (Pi + travel router), Cloudflare named tunnel ingress. |
| **Radio Frontend** | [`/Users/lperez/projects/ProjectVault/30 - Projects/Radio Frontend/Radio Frontend.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Radio%20Frontend/Radio%20Frontend.md) | Butterchurn WebGL MilkDrop visualizer, Express stream & API proxy, WebSocket chat engine, color theme suite, retro brutalist UI, local dev setup, and deploy workflows. |
| **Home Server (Homelab)** | [`/Users/lperez/projects/ProjectVault/30 - Projects/Home Server/Home Server.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Home%20Server/Home%20Server.md) | Proxmox VE 9.2.5 on Firebat T8 Plus (Intel N100, 16GB RAM, dual 1GbE NICs), CT 102 LXC container (`192.168.0.53`), Docker storage driver (`fuse-overlayfs`), bind mounts, and Cloudflare named tunnel routing. |
| **Radio Sequencing Engine** | [`/Users/lperez/projects/ProjectVault/30 - Projects/Radio Sequencing Engine/Radio Sequencing Engine.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Radio%20Sequencing%20Engine/Radio%20Sequencing%20Engine.md) | Offline simulation lab (`~/projects/radio-sequencer`), mood/energy curve modeling, harmonic key mixing, BPM ramp detection, and transition algorithms. |
| **Homelab Telegram Bots** | [`/Users/lperez/projects/ProjectVault/30 - Projects/Home Server/Homelab Telegram Bots.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Home%20Server/Homelab%20Telegram%20Bots.md) | Container heartbeat telemetry, Proxmox metric notifications, alert rules, and automated status polling. |

---

## 2. Infrastructure & Network Topology Cheat Sheet

```mermaid
flowchart TD
    subgraph WAN [Public Internet & Listeners]
        Listener[Listener Browser / Mobile] -->|HTTPS :443| Domain[iadt-radio.online]
        Domain --> CF[Cloudflare Named Tunnel: radio-tunnel]
    end

    subgraph Firebat [Homelab Host: Firebat T8 Plus - Proxmox VE 9.2.5]
        subgraph CT102 [CT 102 'radio' - Debian 13 LXC @ 192.168.0.53]
            CF -->|Port 3030:8080| FrontendDocker[Docker: radio-visualizer<br/>Node Express Proxy + WebSocket Chat]
            FrontendDocker -->|Proxy /stream & /api| AzuraCast[AzuraCast Docker Stack<br/>Liquidsoap + Icecast Playout]
            HostMusic[/srv/media/music<br/>82GB Flac/MP3 Library] -.->|Read-Only Bind Mount| AzuraCast
        end
    end
```

### Key Addresses & Ports
- **Public URL**: `https://iadt-radio.online`
- **Admin & Telemetry**: `https://iadt-radio.online/admin`
- **Proxmox LXC Host**: `192.168.0.53` (CT 102 `radio`)
- **AzuraCast Web / Admin**: `https://192.168.0.53:80` / `https://192.168.0.53:443`
- **Frontend App Port**: `3030` (mapped to container port `8080`)
- **Persistent Storage**: `/srv/college-radio-demo/data` (mounted to container `/app/data` for bug reports log `reports.log`)
- **Music Storage**: `/srv/media/music` (read-only bind mount into AzuraCast)

---

## 3. Local Development & Deployment Commands

Run these inside the project repository at `/Users/lperez/projects/college-radio-demo`:

```bash
# Run local dev server with hot-reloading
npm run dev

# Run chat & admin command test suite
npm run test:chat

# Run listener count virtual simulation
npm run test:listeners

# Deploy to Homelab (SSH to 192.168.0.53, docker build, restart container)
npm run deploy
```

---

## 4. Operational Runbook

1. **When reviewing radio or frontend code:**
   - Always verify changes against [`public/index.html`](file:///Users/lperez/projects/college-radio-demo/public/index.html), [`public/style.css`](file:///Users/lperez/projects/college-radio-demo/public/style.css), [`public/app.js`](file:///Users/lperez/projects/college-radio-demo/public/app.js), and [`server.js`](file:///Users/lperez/projects/college-radio-demo/server.js).
   - Ensure the color palette maintains soft sage/mint (`#6DA871`) for cards, neon green (`#00cc55`) for buttons, and cyan blue (`#00bbdd`) for info text.
   - Run `npm run test:chat` prior to deploying.

2. **When inspecting backend stream/AzuraCast health:**
   - Stream endpoint: `https://iadt-radio.online/stream`
   - Now Playing API: `https://iadt-radio.online/api/nowplaying/1`
   - Health check: `https://iadt-radio.online/health`
