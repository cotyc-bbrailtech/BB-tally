// Sends a weekly "Insights (7 day)" email — same numbers as the in-app Insights
// screen with the 7-day range selected. Reads data/tallies.json directly, so it
// doesn't need a browser or a live server; it mirrors renderInsights() in
// index.html (range = 7, reason filter = 'all').
//
// Required env vars:
//   GMAIL_USER          - the Gmail address to send from
//   GMAIL_APP_PASSWORD  - a Gmail App Password (not the regular account password)
//   EMAIL_TO            - recipient address, or comma-separated list of addresses
//
// Usage:
//   node scripts/weekly-insights-email.mjs           # sends the real email
//   node scripts/weekly-insights-email.mjs --dry-run  # prints the HTML, sends nothing

import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const RANGE_DAYS = 7;
const DATA_PATH = path.join(process.cwd(), 'data', 'tallies.json');
const REASON_REGISTRY_FIELD = '_reasonRegistry'; // sibling key in tallies.json, never a real date-keyed entry

const CATEGORY_META = {
  robotic: { label: 'Robotic', color: '#0ea5e9' },
  tieplate: { label: 'Tie Plate', color: '#f59e0b' },
  truck: { label: 'Truck', color: '#ef4444' },
};

function loadData() {
  if (!fs.existsSync(DATA_PATH)) return {};
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

// Mirrors getFilteredDates() in index.html for a numeric range. Explicitly excludes
// REASON_REGISTRY_FIELD — index.html's currentData never contains it (mergeStores()
// strips it out at merge time before it ever reaches currentData), but this script
// reads the raw wire-format JSON directly, where it IS present as a top-level sibling
// key. Without this filter it would pass the date-range check ('_reasonRegistry' sorts
// after any date string) and get counted as an extra day in every email.
function getFilteredKeys(data, rangeDays) {
  const allKeys = Object.keys(data)
    .filter((k) => k !== REASON_REGISTRY_FIELD)
    .sort();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return allKeys.filter((k) => k.split('|')[0] >= cutoffStr);
}

// Mirrors renderInsights() in index.html.
function computeInsights(data, rangeDays) {
  const keys = getFilteredKeys(data, rangeDays);
  if (keys.length === 0) return { empty: true };

  let totalRobotic = 0;
  let totalTieplate = 0;
  let totalTruck = 0;
  const reasonCounts = {}; // reasonText -> { count, category }

  keys.forEach((k) => {
    const e = data[k];
    // Demo-profile entries live in their own isolated local store in the app and should
    // never appear in real field data/analytics — skip defensively in case one ever
    // lingers in the shared file (e.g. from a device that hasn't synced the isolation
    // fix yet).
    if (e.loggedBy && e.loggedBy.profile === 'demo') return;

    totalRobotic += e.tallies?.robotic || 0;
    totalTieplate += e.tallies?.tieplate || 0;
    totalTruck += e.tallies?.truck || 0;

    if (e.reasons) {
      ['robotic', 'tieplate', 'truck'].forEach((cat) => {
        (e.reasons[cat] || []).forEach((r) => {
          if (!r) return;
          if (!reasonCounts[r]) reasonCounts[r] = { count: 0, category: cat };
          reasonCounts[r].count += 1;
        });
      });
    }
  });

  const grandTotal = totalRobotic + totalTieplate + totalTruck;
  const avg = keys.length > 0 ? (grandTotal / keys.length).toFixed(1) : '0';

  const cats = [
    { key: 'robotic', name: CATEGORY_META.robotic.label, count: totalRobotic },
    { key: 'tieplate', name: CATEGORY_META.tieplate.label, count: totalTieplate },
    { key: 'truck', name: CATEGORY_META.truck.label, count: totalTruck },
  ].sort((a, b) => b.count - a.count);

  const maxCat = Math.max(totalRobotic, totalTieplate, totalTruck, 1);
  const catBreakdown = ['robotic', 'tieplate', 'truck'].map((key) => {
    const val = { robotic: totalRobotic, tieplate: totalTieplate, truck: totalTruck }[key];
    const pct = grandTotal > 0 ? Math.round((val / grandTotal) * 100) : 0;
    const barPct = Math.round((val / maxCat) * 100);
    return { key, label: CATEGORY_META[key].label, color: CATEGORY_META[key].color, val, pct, barPct };
  });

  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12);
  const maxReasonCount = topReasons.length > 0 ? topReasons[0][1].count : 1;

  return {
    empty: false,
    days: keys.length,
    grandTotal,
    avg,
    topCategory: cats[0].count > 0 ? cats[0] : null,
    catBreakdown,
    topReasons,
    maxReasonCount,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmailHtml(insights, rangeDays) {
  const rangeLabel = `Last ${rangeDays} days`;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  if (insights.empty) {
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#0f172a;margin:0 0 4px;">B&amp;B Tally — Weekly Insights</h2>
        <div style="color:#64748b;font-size:13px;margin-bottom:20px;">${rangeLabel} · as of ${today}</div>
        <div style="color:#94a3b8;text-align:center;padding:32px 0;">No tallies logged in this range.</div>
      </div>`;
  }

  const statCard = (label, value) => `
    <td style="padding:12px 8px;text-align:center;background:#f8fafc;border-radius:12px;">
      <div style="color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;">${label}</div>
      <div style="color:#0f172a;font-size:28px;font-weight:800;margin-top:4px;">${value}</div>
    </td>`;

  const statsRow = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin:16px 0;">
      <tr>
        ${statCard('Days Logged', insights.days)}
        ${statCard('Total Interventions', insights.grandTotal)}
        ${statCard('Avg / Day', insights.avg)}
      </tr>
    </table>`;

  const topCatHtml = insights.topCategory
    ? `<div style="margin:4px 0 20px;padding:12px 14px;background:#f8fafc;border-radius:12px;">
        <div style="color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;">Top Category</div>
        <div style="color:#0f172a;font-size:18px;font-weight:700;margin-top:2px;">${insights.topCategory.name}
          <span style="color:#64748b;font-size:13px;font-weight:400;">— ${insights.topCategory.count} interventions</span>
        </div>
      </div>`
    : '';

  const breakdownRows = insights.catBreakdown
    .map(
      (c) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#0f172a;margin-bottom:4px;">
          <span style="font-weight:600;">${c.label}</span>
          <span><strong>${c.val}</strong> <span style="color:#94a3b8;">${c.pct ? c.pct + '%' : ''}</span></span>
        </div>
        <div style="height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${c.barPct}%;background:${c.color};"></div>
        </div>
      </div>`
    )
    .join('');

  const reasonsHtml =
    insights.topReasons.length === 0
      ? `<div style="color:#94a3b8;font-size:13px;padding:8px 0;">No reasons logged in this range.</div>`
      : insights.topReasons
          .map(([text, info]) => {
            const pct = Math.round((info.count / insights.maxReasonCount) * 100);
            const color = CATEGORY_META[info.category]?.color || '#94a3b8';
            const short = text.length > 70 ? text.slice(0, 67) + '…' : text;
            return `
            <div style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;font-size:13px;color:#1e293b;margin-bottom:3px;">
                <span style="max-width:420px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(short)}</span>
                <strong style="margin-left:8px;">${info.count}</strong>
              </div>
              <div style="height:5px;background:#f1f5f9;border-radius:999px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${color};"></div>
              </div>
            </div>`;
          })
          .join('');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 4px;">B&amp;B Tally — Weekly Insights</h2>
      <div style="color:#64748b;font-size:13px;margin-bottom:8px;">${rangeLabel} · as of ${today}</div>
      ${statsRow}
      ${topCatHtml}
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;color:#64748b;margin:20px 0 8px;">Category Breakdown</div>
      ${breakdownRows}
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;color:#64748b;margin:20px 0 8px;">Top Reasons</div>
      ${reasonsHtml}
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
        Auto-generated weekly from data/tallies.json. Full detail: https://cotyc-bbrailtech.github.io/BB-tally/
      </div>
    </div>`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const data = loadData();
  const insights = computeInsights(data, RANGE_DAYS);
  const html = renderEmailHtml(insights, RANGE_DAYS);

  if (dryRun) {
    console.log(html);
    return;
  }

  const { GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_TO } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !EMAIL_TO) {
    throw new Error('Missing required env vars: GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_TO');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const subjectTotal = insights.empty ? 'no activity' : `${insights.grandTotal} interventions`;

  await transporter.sendMail({
    from: GMAIL_USER,
    to: EMAIL_TO,
    subject: `B&B Tally — Weekly Insights (${subjectTotal})`,
    html,
  });

  console.log('Weekly insights email sent to', EMAIL_TO);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
