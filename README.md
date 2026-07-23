# B&B Tally Board — Field Ops

Mobile field app for logging human interventions on automated railway systems.

**Free hosting + free storage via GitHub only — no Render.**

## How storage works

| Layer | Purpose |
|-------|---------|
| **This phone** | localStorage — works offline |
| **GitHub repo** | Shared file `data/tallies.json` — all crews see the same tallies |

Connect once: **⋯ menu → GitHub Sync Settings**

## 1. Enable GitHub Pages (free site)

1. Open https://github.com/cotycoots-tech/bb-tally-board  
2. **Settings → Pages**  
3. Source: **Deploy from a branch**  
4. Branch: `main` / folder: `/ (root)`  
5. Save  

Site URL: **https://cotycoots-tech.github.io/bb-tally-board/**

## 2. Create a token (once)

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**  
2. **Generate**  
   - Repository access: only **bb-tally-board**  
   - Permissions → **Contents: Read and write**  
3. Copy the token  

## 3. Connect the app on each phone

1. Open the Pages URL on the phone  
2. Tap **⋯** → **GitHub Sync Settings**  
3. Enter:
   - Owner: `cotycoots-tech`  
   - Repo: `bb-tally-board`  
   - Token: *(paste)*  
   - Path: `data/tallies.json`  
4. **Save & Connect**  

Badge shows **GitHub saved** when sync is working.

Token stays only on that phone (not committed to the repo). Prefer a **private** repo.

## Local file

Open `index.html` in a browser, or:

```bash
python3 -m http.server 8080
```

## Files that matter

- `index.html` — the app  
- `data/tallies.json` — live shared tallies (updated by the app via API)  

## License

Internal — B&B Railway Solutions / Field Ops.
