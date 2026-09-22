# IADT Radio Web

Interactive WebGL music visualizer & live radio web player for **IADT Radio**, backed by AzuraCast.

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
├── server.js             # Express proxy server for stream & AzuraCast API
└── public/               # Frontend static assets
    ├── index.html        # Main web player interface
    ├── style.css         # Retro UI styling & responsiveness
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
