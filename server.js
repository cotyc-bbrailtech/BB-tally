/**
 * B&B Tally Board — API + static host
 * Stores all daily tallies in data/tallies.json (shared across every device).
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tallies.json');

// Ensure data directory + file exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}', 'utf8');

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ---------- helpers ----------
function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error('readStore error', e);
    return {};
  }
}

function writeStore(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- API ----------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'bb-tally-board', time: new Date().toISOString() });
});

/** Get all tallies */
app.get('/api/tallies', (_req, res) => {
  res.json(readStore());
});

/** Get one day */
app.get('/api/tallies/:date', (req, res) => {
  const store = readStore();
  const entry = store[req.params.date];
  if (!entry) return res.status(404).json({ error: 'not found' });
  res.json(entry);
});

/** Upsert one day (full entry object) */
app.put('/api/tallies/:date', (req, res) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const store = readStore();
  store[date] = {
    ...req.body,
    last_updated: new Date().toISOString()
  };
  writeStore(store);
  res.json({ ok: true, date, entry: store[date] });
});

/** Replace entire store (bulk sync / import) */
app.put('/api/tallies', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'body must be an object keyed by date' });
  }
  writeStore(req.body);
  res.json({ ok: true, days: Object.keys(req.body).length });
});

/** Delete one day */
app.delete('/api/tallies/:date', (req, res) => {
  const store = readStore();
  if (!store[req.params.date]) return res.status(404).json({ error: 'not found' });
  delete store[req.params.date];
  writeStore(store);
  res.json({ ok: true });
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`B&B Tally Board listening on :${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
