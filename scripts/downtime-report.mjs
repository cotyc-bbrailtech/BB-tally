// Builds and emails a daily "RAIV — Downtime Report" Excel workbook:
//   - "Report" sheet: Key Metrics, Events by Unit, Top 10 Failure Reasons,
//     Safety & Quality Flags, and a Daily Events by Unit table — all scoped
//     to a rolling window (RANGE_DAYS), mirroring the in-app Insights numbers
//     plus a new per-unit breakdown that doesn't exist anywhere in the app.
//   - "Daily Summary" / "Reasons Log" sheets: the exact same columns as the
//     in-app exportAllDataToExcel() in index.html, all-time (not windowed).
// Reads data/tallies.json directly, so it doesn't need a browser or a live
// server.
//
// Note on charts: the attached reference report has embedded bar charts.
// exceljs (the library used here) has no chart-writing support, and the one
// chart-focused alternative (xlsx-chart) is niche and would need an awkward
// two-library merge. Instead, the Events columns use Excel's native Data Bar
// conditional formatting for an in-cell bar visual, and the Daily Events by
// Unit table ships as plain data with a note that it can be turned into a
// chart with Insert > Chart in a couple of clicks.
//
// Required env vars:
//   GMAIL_USER          - the Gmail address to send from
//   GMAIL_APP_PASSWORD  - a Gmail App Password (not the regular account password)
//   EMAIL_TO            - recipient address, or comma-separated list of addresses
//
// Usage:
//   node scripts/downtime-report.mjs           # sends the real email
//   node scripts/downtime-report.mjs --dry-run  # writes ./downtime-report-dryrun.xlsx, sends nothing

import fs from 'node:fs';
import ExcelJS from 'exceljs';
import nodemailer from 'nodemailer';
import { loadData, getAllKeys, getFilteredKeys, getCutoffDateStr, CATEGORY_META } from './lib/tally-data.mjs';

const RANGE_DAYS = 30;
const CATEGORIES = ['robotic', 'tieplate', 'truck'];

const DAILY_SUMMARY_COLUMNS = [
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Unit', key: 'unit', width: 18 },
  { header: 'Robotic System', key: 'robotic', width: 14 },
  { header: 'Tie Plate Setter', key: 'tieplate', width: 15 },
  { header: 'Truck Malfunction', key: 'truck', width: 16 },
  { header: 'Total', key: 'total', width: 8 },
  { header: 'Notes - Robotic', key: 'notesRobotic', width: 30 },
  { header: 'Notes - Tie Plate', key: 'notesTieplate', width: 30 },
  { header: 'Notes - Truck', key: 'notesTruck', width: 30 },
  { header: 'Unique / Other locations?', key: 'unique', width: 30 },
  { header: 'Unsafe?', key: 'unsafe', width: 30 },
  { header: 'New objects for robot?', key: 'newObjects', width: 30 },
  { header: 'Logged By (Name)', key: 'loggedByName', width: 16 },
  { header: 'Logged By (Profile)', key: 'loggedByProfile', width: 14 },
  { header: 'Last Updated', key: 'lastUpdated', width: 22 },
];

const REASONS_LOG_COLUMNS = [
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Unit', key: 'unit', width: 18 },
  { header: 'Category', key: 'category', width: 18 },
  { header: 'Reason', key: 'reason', width: 50 },
];

const PROFILE_LABELS = { admin: 'Admin', fieldops: 'Field Ops', demo: 'Demo', developer: 'Developer' };

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

// All the aggregation for the "Report" sheet, scoped to the rolling window. Every input field
// read here (tallies, reasons, unit, comments) matches exactly how index.html itself reads them
// (see recomputeDerivedTallyFields()/exportAllDataToExcel() there) — nothing new is invented.
function computeReport(data) {
  const windowKeys = getFilteredKeys(data, RANGE_DAYS);
  const windowStart = getCutoffDateStr(RANGE_DAYS);
  const windowEnd = new Date().toISOString().split('T')[0];

  const totalsByCategory = { robotic: 0, tieplate: 0, truck: 0 };
  const unitTotals = new Map(); // unit -> { robotic, tieplate, truck, total }
  const reasonCounts = new Map(); // reasonText -> { count, category }
  const safetyFlags = { unsafe: 0, newObjects: 0, unique: 0 };
  const dailyByUnit = new Map(); // dateStr -> Map(unit -> total)
  const unitsSeen = new Set();

  windowKeys.forEach((k) => {
    const e = data[k];
    const dateStr = k.split('|')[0];
    const unit = e.unit || '(unassigned unit)';
    unitsSeen.add(unit);

    if (!unitTotals.has(unit)) unitTotals.set(unit, { robotic: 0, tieplate: 0, truck: 0, total: 0 });
    const unitRow = unitTotals.get(unit);

    let entryTotal = 0;
    CATEGORIES.forEach((cat) => {
      const n = e.tallies?.[cat] || 0;
      totalsByCategory[cat] += n;
      unitRow[cat] += n;
      entryTotal += n;
    });
    unitRow.total += entryTotal;

    if (!dailyByUnit.has(dateStr)) dailyByUnit.set(dateStr, new Map());
    const dayRow = dailyByUnit.get(dateStr);
    dayRow.set(unit, (dayRow.get(unit) || 0) + entryTotal);

    if (e.reasons) {
      CATEGORIES.forEach((cat) => {
        (e.reasons[cat] || []).forEach((r) => {
          if (!r) return;
          if (!reasonCounts.has(r)) reasonCounts.set(r, { count: 0, category: cat });
          reasonCounts.get(r).count += 1;
        });
      });
    }

    if (e.comments?.unsafe) safetyFlags.unsafe += 1;
    if (e.comments?.new) safetyFlags.newObjects += 1;
    if (e.comments?.unique) safetyFlags.unique += 1;
  });

  const grandTotal = totalsByCategory.robotic + totalsByCategory.tieplate + totalsByCategory.truck;
  const daysLogged = windowKeys.length;
  const avgPerDay = daysLogged > 0 ? Math.round((grandTotal / daysLogged) * 10) / 10 : 0;

  const unitRows = Array.from(unitTotals.entries())
    .map(([unit, t]) => ({ unit, ...t, pct: pct(t.total, grandTotal) }))
    .sort((a, b) => b.total - a.total);
  const busiestUnit = unitRows.length > 0 ? unitRows[0].unit : null;

  const reasonRows = Array.from(reasonCounts.entries())
    .map(([reason, info]) => ({ reason, ...info, pct: pct(info.count, grandTotal) }))
    .sort((a, b) => b.count - a.count);
  const topReason = reasonRows.length > 0 ? reasonRows[0].reason : null;
  const top10 = reasonRows.slice(0, 10);
  const top10Subtotal = top10.reduce((sum, r) => sum + r.count, 0);

  const unitList = Array.from(unitsSeen).sort();
  const dailyRows = Array.from(dailyByUnit.keys())
    .sort()
    .map((dateStr) => {
      const dayRow = dailyByUnit.get(dateStr);
      const row = { date: dateStr };
      let total = 0;
      unitList.forEach((u) => {
        const v = dayRow.get(u) || 0;
        row[u] = v;
        total += v;
      });
      row.total = total;
      return row;
    });

  return {
    windowStart,
    windowEnd,
    grandTotal,
    daysLogged,
    avgPerDay,
    unitsTracked: unitRows.length,
    busiestUnit,
    topReason,
    unitRows,
    reasonRows,
    top10,
    top10Subtotal,
    unitList,
    dailyRows,
    safetyFlags,
  };
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  row.alignment = { vertical: 'middle' };
}

function addDataBar(worksheet, ref) {
  worksheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'dataBar',
        cfvo: [
          { type: 'min' },
          { type: 'max' },
        ],
        color: { argb: 'FF638EC6' },
        priority: 1,
      },
    ],
  });
}

function buildReportSheet(workbook, report) {
  const ws = workbook.addWorksheet('Report');
  ws.columns = [{ width: 42 }, { width: 16 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }];
  let r = 1;

  ws.getCell(`A${r}`).value = 'RAIV — Downtime Report';
  ws.getCell(`A${r}`).font = { bold: true, size: 16 };
  r += 1;
  ws.getCell(`A${r}`).value = `Reporting period: ${report.windowStart} through ${report.windowEnd} (rolling ${RANGE_DAYS}-day window)`;
  ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF64748B' } };
  r += 1;
  ws.getCell(`A${r}`).value = 'Source: data/tallies.json — Daily Summary & Reasons Log sheets (all-time) are on the sheets below.';
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };
  r += 2;

  // KEY METRICS
  ws.getCell(`A${r}`).value = 'KEY METRICS';
  styleHeaderRow(ws.getRow(r));
  ws.mergeCells(`A${r}:F${r}`);
  r += 1;
  const metricLabels = ['Total events', 'Days logged', 'Avg events / day', 'Units tracked', 'Busiest unit', 'Top reason'];
  const metricValues = [
    report.grandTotal,
    report.daysLogged,
    report.avgPerDay,
    report.unitsTracked,
    report.busiestUnit || '—',
    report.topReason || '—',
  ];
  metricLabels.forEach((label, i) => {
    ws.getCell(r, i + 1).value = label;
    ws.getCell(r, i + 1).font = { size: 9, color: { argb: 'FF64748B' } };
  });
  r += 1;
  metricValues.forEach((val, i) => {
    ws.getCell(r, i + 1).value = val;
    ws.getCell(r, i + 1).font = { bold: true };
  });
  r += 2;

  // EVENTS BY UNIT
  ws.getCell(`A${r}`).value = 'EVENTS BY UNIT';
  styleHeaderRow(ws.getRow(r));
  ws.mergeCells(`A${r}:F${r}`);
  r += 1;
  const unitHeaderRow = r;
  ['Unit', 'Events', '% of total', 'Robotic System', 'Tie Plate Setter', 'Truck Malfunction'].forEach((h, i) => {
    ws.getCell(r, i + 1).value = h;
  });
  ws.getRow(r).font = { bold: true };
  r += 1;
  const unitFirstDataRow = r;
  report.unitRows.forEach((row) => {
    ws.getCell(r, 1).value = row.unit;
    ws.getCell(r, 2).value = row.total;
    ws.getCell(r, 3).value = `${row.pct.toFixed(1)}%`;
    ws.getCell(r, 4).value = row.robotic;
    ws.getCell(r, 5).value = row.tieplate;
    ws.getCell(r, 6).value = row.truck;
    r += 1;
  });
  const unitLastDataRow = r - 1;
  ws.getCell(r, 1).value = 'Total';
  ws.getCell(r, 2).value = report.grandTotal;
  ws.getCell(r, 3).value = '100.0%';
  CATEGORIES.forEach((cat, i) => {
    ws.getCell(r, 4 + i).value = report.unitRows.reduce((s, u) => s + u[cat], 0);
  });
  ws.getRow(r).font = { bold: true };
  ws.getRow(r).border = { top: { style: 'thin' } };
  if (unitLastDataRow >= unitFirstDataRow) addDataBar(ws, `B${unitFirstDataRow}:B${unitLastDataRow}`);
  r += 2;

  // TOP 10 FAILURE REASONS
  ws.getCell(`A${r}`).value = 'TOP 10 FAILURE REASONS';
  styleHeaderRow(ws.getRow(r));
  ws.mergeCells(`A${r}:F${r}`);
  r += 1;
  ['Rank', 'Reason', 'Events', '% of total'].forEach((h, i) => {
    ws.getCell(r, i + 1).value = h;
  });
  ws.getRow(r).font = { bold: true };
  r += 1;
  const reasonsFirstDataRow = r;
  report.top10.forEach((row, i) => {
    ws.getCell(r, 1).value = i + 1;
    ws.getCell(r, 2).value = row.reason;
    ws.getCell(r, 3).value = row.count;
    ws.getCell(r, 4).value = `${row.pct.toFixed(1)}%`;
    r += 1;
  });
  const reasonsLastDataRow = r - 1;
  if (report.top10.length > 0) {
    ws.getCell(r, 2).value = 'Top 10 subtotal';
    ws.getCell(r, 3).value = report.top10Subtotal;
    ws.getCell(r, 4).value = `${pct(report.top10Subtotal, report.grandTotal).toFixed(1)}%`;
    ws.getRow(r).font = { bold: true };
    ws.getRow(r).border = { top: { style: 'thin' } };
    if (reasonsLastDataRow >= reasonsFirstDataRow) addDataBar(ws, `C${reasonsFirstDataRow}:C${reasonsLastDataRow}`);
  } else {
    ws.getCell(r, 1).value = 'No reasons logged in this window.';
  }
  r += 2;

  // SAFETY & QUALITY FLAGS
  ws.getCell(`A${r}`).value = 'SAFETY & QUALITY FLAGS (from Daily Summary comments)';
  styleHeaderRow(ws.getRow(r));
  ws.mergeCells(`A${r}:F${r}`);
  r += 1;
  ['Flag type', 'Entries reported'].forEach((h, i) => {
    ws.getCell(r, i + 1).value = h;
  });
  ws.getRow(r).font = { bold: true };
  r += 1;
  [
    ['Unsafe condition reported', report.safetyFlags.unsafe],
    ['New object encountered by robot', report.safetyFlags.newObjects],
    ['Unique / other location noted', report.safetyFlags.unique],
  ].forEach(([label, count]) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = count;
    r += 1;
  });
  r += 1;

  // DAILY EVENTS BY UNIT
  ws.getCell(`A${r}`).value = 'DAILY EVENTS BY UNIT';
  styleHeaderRow(ws.getRow(r));
  ws.mergeCells(`A${r}:F${r}`);
  r += 1;
  ws.getCell(`A${r}`).value = 'Data only (see note above about embedded charts) — select this table and Insert > Chart if you want a visual.';
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };
  r += 1;
  const dailyHeader = ['Date', ...report.unitList, 'Total'];
  dailyHeader.forEach((h, i) => {
    ws.getCell(r, i + 1).value = h;
  });
  ws.getRow(r).font = { bold: true };
  r += 1;
  report.dailyRows.forEach((row) => {
    ws.getCell(r, 1).value = row.date;
    report.unitList.forEach((u, i) => {
      ws.getCell(r, i + 2).value = row[u] || 0;
    });
    ws.getCell(r, report.unitList.length + 2).value = row.total;
    r += 1;
  });

  return ws;
}

function buildDailySummarySheet(workbook, data) {
  const ws = workbook.addWorksheet('Daily Summary');
  ws.columns = DAILY_SUMMARY_COLUMNS;
  styleHeaderRow(ws.getRow(1));

  getAllKeys(data).forEach((k) => {
    const e = data[k];
    const robotic = e.tallies?.robotic || 0;
    const tieplate = e.tallies?.tieplate || 0;
    const truck = e.tallies?.truck || 0;
    ws.addRow({
      date: k.split('|')[0],
      unit: e.unit || '',
      robotic,
      tieplate,
      truck,
      total: robotic + tieplate + truck,
      notesRobotic: e.notes?.robotic || '',
      notesTieplate: e.notes?.tieplate || '',
      notesTruck: e.notes?.truck || '',
      unique: e.comments?.unique || '',
      unsafe: e.comments?.unsafe || '',
      newObjects: e.comments?.new || '',
      loggedByName: e.loggedBy?.name || '',
      loggedByProfile: e.loggedBy ? (PROFILE_LABELS[e.loggedBy.profile] || e.loggedBy.profile || '') : '',
      lastUpdated: e.last_updated || '',
    });
  });

  return ws;
}

function buildReasonsLogSheet(workbook, data) {
  const ws = workbook.addWorksheet('Reasons Log');
  ws.columns = REASONS_LOG_COLUMNS;
  styleHeaderRow(ws.getRow(1));

  getAllKeys(data).forEach((k) => {
    const e = data[k];
    if (!e.reasons) return;
    CATEGORIES.forEach((cat) => {
      (e.reasons[cat] || []).forEach((reason) => {
        if (!reason) return;
        ws.addRow({
          date: k.split('|')[0],
          unit: e.unit || '',
          category: CATEGORY_META[cat].longLabel,
          reason,
        });
      });
    });
  });

  return ws;
}

async function buildWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BB-Tally automated report';
  workbook.created = new Date();

  const report = computeReport(data);
  buildReportSheet(workbook, report);
  buildDailySummarySheet(workbook, data);
  buildReasonsLogSheet(workbook, data);

  return { workbook, report };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const data = loadData();
  const { workbook, report } = await buildWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();

  const todayStr = new Date().toISOString().split('T')[0];
  const filename = `downtime-report-${todayStr}.xlsx`;

  if (dryRun) {
    fs.writeFileSync('downtime-report-dryrun.xlsx', buffer);
    console.log('Wrote downtime-report-dryrun.xlsx —', report.grandTotal, 'events,', report.daysLogged, 'entries in the window.');
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

  await transporter.sendMail({
    from: GMAIL_USER,
    to: EMAIL_TO,
    subject: `RAIV Downtime Report — ${todayStr} (${report.grandTotal} events)`,
    text: `Attached: the downtime report for ${report.windowStart} through ${report.windowEnd}.\n\nTotal events: ${report.grandTotal}\nBusiest unit: ${report.busiestUnit || '—'}\nTop reason: ${report.topReason || '—'}`,
    attachments: [{ filename, content: buffer }],
  });

  console.log('Daily downtime report sent to', EMAIL_TO);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
