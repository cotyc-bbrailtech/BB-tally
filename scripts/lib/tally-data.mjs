// Shared data-loading helpers for the scheduled report scripts
// (weekly-insights-email.mjs, downtime-report.mjs). Reads data/tallies.json
// directly, so it doesn't need a browser or a live server.

import fs from 'node:fs';
import path from 'node:path';

export const DATA_PATH = path.join(process.cwd(), 'data', 'tallies.json');
export const REASON_REGISTRY_FIELD = '_reasonRegistry'; // sibling key in tallies.json, never a real date-keyed entry

export const CATEGORY_META = {
  robotic: { label: 'Robotic', longLabel: 'Robotic System', color: '#0ea5e9' },
  tieplate: { label: 'Tie Plate', longLabel: 'Tie Plate Setter', color: '#f59e0b' },
  truck: { label: 'Truck', longLabel: 'Truck Malfunction', color: '#ef4444' },
};

export function loadData() {
  if (!fs.existsSync(DATA_PATH)) return {};
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

// All real entries, all-time — excludes the reason-registry sibling key (present in the raw
// wire-format JSON this script reads directly, but never in the app's own in-memory currentData
// — see mergeStores() in index.html) and defensively excludes any demo-profile entry (Demo data
// lives in its own isolated local store in the app and should never appear in real analytics;
// this guards against one lingering in the shared file from a device that hasn't synced the
// isolation fix yet).
export function getAllKeys(data) {
  return Object.keys(data)
    .filter((k) => k !== REASON_REGISTRY_FIELD)
    .filter((k) => !(data[k].loggedBy && data[k].loggedBy.profile === 'demo'))
    .sort();
}

// The first date (inclusive) a rolling `rangeDays`-day window covers, ending today. Exposed
// separately so callers can display the exact boundary they filtered by, rather than
// recomputing (and risking drift from) the same cutoff math independently.
export function getCutoffDateStr(rangeDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  return cutoff.toISOString().split('T')[0];
}

// Mirrors getFilteredDates() in index.html for a numeric rolling-window range (compares the
// date portion explicitly, so it works regardless of how many further `|`-separated segments a
// key has).
export function getFilteredKeys(data, rangeDays) {
  const cutoffStr = getCutoffDateStr(rangeDays);
  return getAllKeys(data).filter((k) => k.split('|')[0] >= cutoffStr);
}
