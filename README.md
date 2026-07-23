# B&B Tally Board — Field Ops

Mobile-first web app for field crews to log human interventions on automated railway tie-plate systems.

**Repo:** https://github.com/cotycoots-tech/bb-tally-board

## Features

- **Daily tally entry** — Robotic System, Tie Plate Setter, Truck Malfunction
- **Reason picker** (bottom sheet) with icons + persistent custom reasons
- **Unit selector** — Raiv-T1 / T-53, Raiv-T2 / T-57, Raiv-T3 / T-51
- **History** with search, delete, Excel export
- **Analytics dashboard** — date ranges, KPIs, trends, top reasons
- **Print report** for paper records
- Offline-capable (data in browser `localStorage`)

## Important: full app file

The complete `index.html` (~108 KB) needs to be on the repo root for the live site to work.

### Upload the full app (one-time)

1. Download the full `index.html` from your project folder (`artifacts/tallyboard/index.html`).
2. On GitHub: open this repo → **Add file** → **Upload files**
3. Drop `index.html` (replace the placeholder) and commit to `main`.

Or from a machine with git:

```bash
git clone https://github.com/cotycoots-tech/bb-tally-board.git
cd bb-tally-board
# copy your full index.html into this folder (overwrite the placeholder)
git add index.html
git commit -m "Add full Tally Board app"
git push
```

## Deploy to Render (recommended)

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Static Site**
2. Connect the GitHub account and select **bb-tally-board**
3. Settings:
   - **Name:** `bb-tally-board` (or any name)
   - **Branch:** `main`
   - **Build Command:** *(leave empty)*
   - **Publish Directory:** `.`
4. Click **Create Static Site**

Render will give you a URL like `https://bb-tally-board.onrender.com`.

You can also use **Blueprint** with the included `render.yaml`.

## Deploy to GitHub Pages

1. Repo **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/ (root)`
4. Save

Site URL: `https://cotycoots-tech.github.io/bb-tally-board/`

## Local testing

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open the URL on your phone to test the mobile UI.

## Data & backup

- All tallies stay in the device browser (`localStorage`)
- Use **History → Export to Excel** for a spreadsheet (Daily Summary + Reasons Log)
- Use **Export JSON** for a full backup you can import on another device

## Tech

- Single-file HTML/JS app
- Tailwind CSS, Chart.js, SheetJS, Font Awesome (CDN)

## License

Internal use — B&B Railway Solutions / Field Ops.
