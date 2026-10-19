'use strict';

// Summarizes the ShowRank barebones diagnostics probe ([SRB-P] lines in console.log).
// Usage: node scripts/showrank-barebones-probe-report.js [consoleLogPath] [--out <file.md>]

const fs = require('node:fs');
const path = require('node:path');

const TAG = '[SRB-P]';
const DEFAULT_LOG = 'G:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\console.log';
const TOP_DELAYS = 8;
const TOP_FUNCTIONS = 10;
const TOP_EVENTS = 15;

function parseArgs(argv) {
  const args = { log: DEFAULT_LOG, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i] || null;
    else if (a.startsWith('--out=')) args.out = a.slice(6);
    else if (a === '-h' || a === '--help') args.help = true;
    else args.log = a;
  }
  return args;
}

const number = s => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);

// "-" is an empty map; otherwise "name:count,name:count". Returns null when malformed.
function parseMap(value) {
  const map = new Map();
  if (value === '-') return map;
  if (!value) return null;
  for (const item of value.split(',')) {
    const at = item.lastIndexOf(':');
    if (at <= 0) return null;
    const count = number(item.slice(at + 1));
    if (!Number.isFinite(count) || count < 0) return null;
    const name = item.slice(0, at);
    map.set(name, (map.get(name) || 0) + count);
  }
  return map;
}

// Returns { kind: 'window'|'boot', ctx, ... } or null when the line is malformed.
function parseLine(line) {
  const rest = line.slice(line.indexOf(TAG) + TAG.length).trim();
  const fields = new Map();
  const flags = new Set();
  for (const token of rest.split(/\s+/)) {
    if (!token) continue;
    const eq = token.indexOf('=');
    if (eq < 0) flags.add(token);
    else if (eq === 0) return null;
    else fields.set(token.slice(0, eq), token.slice(eq + 1));
  }
  if (fields.get('v') !== '1') return null;
  const ctx = fields.get('ctx');
  if (!ctx) return null;
  const seq = number(fields.get('seq') || '');
  if (!Number.isInteger(seq) || seq < 0) return null;
  if (flags.has('boot')) return { kind: 'boot', ctx, seq };

  const win = number(fields.get('win') || '');
  const sch = number(fields.get('sch') || '');
  const cb = number(fields.get('cb') || '');
  const ms = number(fields.get('ms') || '');
  const t = fields.has('t') ? number(fields.get('t')) : 0;
  if (![win, sch, cb, ms, t].every(Number.isFinite) || win <= 0 || sch < 0 || cb < 0 || ms < 0) return null;
  const by = parseMap(fields.get('by'));
  const ev = parseMap(fields.get('ev'));
  const n = parseMap(fields.get('n'));
  if (!by || !ev || !n) return null;
  return { kind: 'window', ctx, seq, t, win, sch, cb, ms, by, ev, n };
}

function addMap(target, source) {
  for (const [k, v] of source) target.set(k, (target.get(k) || 0) + v);
}

function emptyStats() {
  return { windows: 0, boots: 0, win: 0, sch: 0, cb: 0, ms: 0, by: new Map(), ev: new Map(), n: new Map() };
}

function addWindow(stats, r) {
  stats.windows++;
  stats.win += r.win;
  stats.sch += r.sch;
  stats.cb += r.cb;
  stats.ms += r.ms;
  addMap(stats.by, r.by);
  addMap(stats.ev, r.ev);
  addMap(stats.n, r.n);
}

function analyze(text) {
  const byCtx = new Map();
  const byType = new Map();
  let malformed = 0;
  let total = 0;
  const get = (map, key) => {
    if (!map.has(key)) map.set(key, emptyStats());
    return map.get(key);
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(TAG)) continue;
    total++;
    let record = null;
    try { record = parseLine(line); } catch (e) { record = null; }
    if (!record) { malformed++; continue; }
    const colon = record.ctx.indexOf(':');
    const type = colon < 0 ? record.ctx : record.ctx.slice(0, colon);
    const ctxStats = get(byCtx, record.ctx);
    const typeStats = get(byType, type);
    if (record.kind === 'boot') { ctxStats.boots++; typeStats.boots++; continue; }
    addWindow(ctxStats, record);
    addWindow(typeStats, record);
  }
  return { byCtx, byType, malformed, total };
}

const cell = s => String(s).replace(/\|/g, '\\|');
const fixed = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const perMin = (count, win) => (win > 0 ? (count / (win / 60000)) : NaN);
const top = (map, limit) => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);

function table(headers, rows) {
  const out = [`| ${headers.map(cell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) out.push(`| ${row.map(cell).join(' | ')} |`);
  return out;
}

function summaryRow(label, s) {
  return [
    label, s.boots, s.windows, fixed(s.win / 1000), s.cb, fixed(perMin(s.cb, s.win)),
    fixed(perMin(s.ms, s.win)), fixed(perMin(s.sch, s.win)),
  ];
}

const SUMMARY_HEADERS = ['Context', 'Boots', 'Windows', 'Seconds', 'Callbacks', 'Callbacks/min', 'Callback ms/min', 'Scheduled/min'];

function rateTable(title, nameHeader, map, win, limit) {
  const rows = top(map, limit).map(([name, count]) => [name, count, fixed(perMin(count, win))]);
  if (!rows.length) return [`**${title}:** none`, ''];
  return [`**${title}**`, '', ...table([nameHeader, 'Total', 'Per minute'], rows), ''];
}

function render(result, source) {
  const lines = ['# ShowRank barebones probe report', '', `Source: \`${source}\``, ''];
  lines.push(`Probe lines: ${result.total}, parsed: ${result.total - result.malformed}, malformed: ${result.malformed}`, '');
  if (!result.byCtx.size) {
    lines.push('No `[SRB-P] v=1` lines found. Install the diagnostics build, play, then rerun.', '');
    return lines.join('\n');
  }
  lines.push('Rates divide by the summed window length (`win`, ms), not wall-clock time. The probe reports lazily, so idle gaps are not counted.', '');
  lines.push('## Whole session by panel type', '');
  const types = [...result.byType].sort((a, b) => a[0].localeCompare(b[0]));
  lines.push(...table(SUMMARY_HEADERS.map((h, i) => (i === 0 ? 'Panel type' : h)), types.map(([k, s]) => summaryRow(k, s))), '');
  lines.push('## Per context', '');
  for (const [ctx, s] of [...result.byCtx].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`### ${ctx}`, '');
    lines.push(...table(SUMMARY_HEADERS, [summaryRow(ctx, s)]), '');
    if (!s.windows) { lines.push('No report windows, boot line only.', ''); continue; }
    lines.push(...rateTable('Top callback delays (seconds)', 'Delay', s.by, s.win, TOP_DELAYS));
    lines.push(...rateTable('Top counted functions', 'Function', s.n, s.win, TOP_FUNCTIONS));
    lines.push(...rateTable('DispatchEvent names', 'Event', s.ev, s.win, TOP_EVENTS));
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('node scripts/showrank-barebones-probe-report.js [consoleLogPath] [--out <file.md>]\n');
    return 0;
  }
  let text;
  try {
    text = fs.readFileSync(args.log, 'utf8');
  } catch (e) {
    process.stderr.write(`Cannot read ${args.log}: ${e.message}\n`);
    return 1;
  }
  const report = render(analyze(text), args.log) + '\n';
  process.stdout.write(report);
  if (args.out) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
      fs.writeFileSync(args.out, report, 'utf8');
    } catch (e) {
      process.stderr.write(`Cannot write ${args.out}: ${e.message}\n`);
      return 1;
    }
  }
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { parseLine, analyze, render };
