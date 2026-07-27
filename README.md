# B&B Tally Board — Field Ops

Mobile field app for logging human interventions on automated railway systems.

**Free hosting + free storage via GitHub only.**

## How storage works

| Layer | Purpose |
|-------|---------|
| **This phone** | localStorage — works offline |
| **GitHub repo** | Shared file `data/tallies.json` — all crews see the same tallies |

Connect once: **⋯ menu → GitHub Sync Settings**

## 1. Enable GitHub Pages (free site)

1. Open https://github.com/cotyc-bbrailtech/BB-tally  
2. **Settings → Pages**  
3. Source: **Deploy from a branch**  
4. Branch: `main` / folder: `/ (root)`  
5. Save  

Site URL: **https://cotyc-bbrailtech.github.io/BB-tally/**

## 2. Create a token (once)

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**  
2. **Generate**  
   - Repository access: only **BB-tally**  
   - Permissions → **Contents: Read and write**  
3. Copy the token  

## 3. Connect the app on each phone

1. Open the Pages URL on the phone  
2. Tap **⋯** → **Profile & Sync Settings**  
3. Enter your name and pick a device profile (see below)
4. If this device should sync to the shared repo, also enter:
   - Owner: `cotyc-bbrailtech`  
   - Repo: `BB-tally`  
   - Token: *(paste)*  
   - Path: `data/tallies.json`  
   (leave all three blank to keep the device local-only)
5. **Save**

Badge shows **GitHub saved** when sync is working.

Token stays only on that phone (not committed to the repo). Prefer a **private** repo.

## Device profiles

Every device is one of three profiles (a UI-level convenience, not real security — there's no backend to enforce anything against):

| Profile | Import / Clear / Export-JSON |
|---------|-------------------------------|
| **Admin** | Visible and functional |
| **Field Ops** | Not shown at all — only Export to Excel and the Insights export remain |
| **Demo** | Shown, but inert (a "not available" toast instead of running) |

Devices that haven't set a profile yet default to **Demo** — safe out of the box, nothing destructive can happen until someone deliberately sets a device to Admin or Field Ops.

Switching a device **to** Admin requires a shared PIN, hardcoded as `ADMIN_PIN` near the top of `index.html`'s `<script>` block. Change it there before/after launch — it's a plain constant in the page source, so treat it as a deterrent against casual switching, not a real secret.

Whoever's name + profile last saved a given day's entry shows up in the History tab, the printed report, and both exports ("Logged By").

## Local file

Open `index.html` in a browser, or:

```bash
python3 -m http.server 8080
```

## Styling (Tailwind CSS)

Tailwind is compiled ahead of time into `assets/tailwind.css` and committed — the
page just links that file, no CDN script and no build step at load time.

If you add or change any Tailwind classes in `index.html`, rebuild before committing:

```bash
npm install        # once, installs Tailwind CSS + its CLI as dev dependencies
npm run build:css  # regenerates assets/tailwind.css from index.html's classes
```

`npm run watch:css` rebuilds automatically while you edit.

## Files that matter

- `index.html` — the app  
- `assets/tailwind.css` — generated CSS, rebuild with `npm run build:css` after changing classes (see above)
- `src/input.css` — Tailwind's build input (just an `@import "tailwindcss";`)
- `data/tallies.json` — shared tallies, synced directly to this repo via the GitHub Contents API (created on first save)  

## License

Internal — B&B Railway Solutions / Field Ops.
