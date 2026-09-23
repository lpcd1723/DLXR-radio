# DLXR // IADT College Radio & Homelab Project Guidelines

This file is automatically loaded by Antigravity / Gemini on session startup.

## Obsidian Vault Context
The complete project documentation and operational architecture are maintained in the local Obsidian **`ProjectVault`** at `/Users/lperez/projects/ProjectVault`:

- **Station & Radio Stream Architecture**: [`/Users/lperez/projects/ProjectVault/30 - Projects/College Radio Station/College Radio Station.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/College%20Radio%20Station/College%20Radio%20Station.md)
- **Web Frontend & Visualizer**: [`/Users/lperez/projects/ProjectVault/30 - Projects/Radio Frontend/Radio Frontend.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Radio%20Frontend/Radio%20Frontend.md)
- **Homelab Host & Proxmox**: [`/Users/lperez/projects/ProjectVault/30 - Projects/Home Server/Home Server.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Home%20Server/Home%20Server.md)
- **Radio Sequencing Lab**: [`/Users/lperez/projects/ProjectVault/30 - Projects/Radio Sequencing Engine/Radio Sequencing Engine.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Radio%20Sequencing%20Engine/Radio%20Sequencing%20Engine.md)
- **Homelab Telemetry & Bots**: [`/Users/lperez/projects/ProjectVault/30 - Projects/Home Server/Homelab Telegram Bots.md`](file:///Users/lperez/projects/ProjectVault/30%20-%20Projects/Home%20Server/Homelab%20Telegram%20Bots.md)

Whenever you are asked to review project context, design new features, or troubleshoot infrastructure, read the corresponding notes in the Obsidian vault first.

## Quick Infrastructure Reference
- **Live URL**: `https://iadt-radio.online`
- **Admin Dashboard**: `https://iadt-radio.online/admin`
- **Homelab Host**: Firebat T8 Plus (Intel N100, Proxmox VE 9.2.5)
- **Radio LXC Container**: CT 102 (`192.168.0.53`)
- **AzuraCast Backend**: `https://192.168.0.53` (runs in Docker on CT 102)
- **Frontend Container**: `radio-visualizer` (port `3030:8080`)
- **Public Ingress**: Named Cloudflare Tunnel (`radio-tunnel`) routing `iadt-radio.online` to `192.168.0.53:3030`
- **Music Storage**: `/srv/media/music` bind-mounted read-only into AzuraCast

## Development & Deployment Commands
- `npm run dev` — Run local server with hot reloading (`http://localhost:8080`)
- `npm run test:chat` — Run WebSocket chat test suite
- `npm run deploy` — Push changes to CT 102 (`root@192.168.0.53`) and restart Docker container
