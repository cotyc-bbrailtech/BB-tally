# B&B Tally Board — Field Ops

Mobile-first web app for field crews to log human interventions on automated railway tie-plate systems.

**Repo:** https://github.com/cotycoots-tech/bb-tally-board

## Storage (daily tallies are saved)

Tallies are stored in **two places**:

1. **Device (localStorage)** — works offline on each phone
2. **Cloud (server)** — when deployed as a Web Service, every device shares the same data file

The top of the app shows **Cloud saved** or **Device only**.

## Deploy to Render (Web Service)

Use a **Web Service** (not Static Site) so the API can store tallies.

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Connect repo **bb-tally-board**
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add a **Persistent Disk** (important so data survives restarts):
   - Name: `tally-data`
   - Mount path: `/opt/render/project/src/data`
   - Size: 1 GB
5. Deploy

Live URL example: `https://bb-tally-board.onrender.com`

> Free instances sleep when idle; first load after sleep can take ~30 seconds.

## Project layout

```
package.json / server.js   → API + host
public/index.html          → the app UI
data/tallies.json          → stored tallies (created at runtime)
```

## Local run

```bash
npm install
npm start
# open http://localhost:3000
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/tallies` | All days |
| PUT | `/api/tallies/:date` | Save one day |
| DELETE | `/api/tallies/:date` | Delete one day |

## License

Internal use — B&B Railway Solutions / Field Ops.
