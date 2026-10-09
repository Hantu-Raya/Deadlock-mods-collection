'use strict';

const fs = require('node:fs');

const ROWS = ['FrameTotal', 'PanoramaUI', 'Javascript'];
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const text = (s, max = 80) => typeof s === 'string' && s.length > 0 && s.length <= max;
const timestamp = line => (line.match(/^\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/) || [null])[0];
function percentiles(line) {
  return Object.fromEntries([...line.matchAll(/\b(P\d+):([\d.]+)/g)].map(m => [m[1], Number(m[2])]));
}
function validRecord(r) {
  return r && text(r.id, 64) && ['world', 'topbar', 'menu', 'relay', 'unknown'].includes(r.kind) &&
    finite(r.created) && finite(r.seq) && Number.isInteger(r.seq) && r.seq >= 1 &&
    finite(r.from) && finite(r.to) && r.from >= r.created && r.to > r.from &&
    r.clock === 'Date.now-ms' && finite(r.uo) && finite(r.cut) &&
    Array.isArray(r.c) && r.c.length <= 9 && r.c.every(row => Array.isArray(row) &&
      row.length === 5 && text(row[0]) && row.slice(1).every(finite)) &&
    Array.isArray(r.m) && r.m.length <= 6 && r.m.every(row => Array.isArray(row) &&
      row.length === 4 && ['rx', 'tx'].includes(row[0]) && text(row[1], 64) && row.slice(2).every(finite)) &&
    Array.isArray(r.u) && r.u.length <= 8 && r.u.every(finite) &&
    Array.isArray(r.h) && r.h.length === 10 && r.h.every(finite) &&
    (r.t === undefined || ['hero', 'unit'].includes(r.t));
}

function aggregate(records, missing) {
  const buckets = new Map(), seen = new Set(), sequences = new Map();
  for (const r of records) {
    const key = `${r.id}:${r.seq}`;
    if (seen.has(key)) { missing.push(`Duplicate diagnostic record ${key} ignored.`); continue; }
    seen.add(key);
    const previous = sequences.get(r.id);
    if ((previous === undefined && r.seq > 1) || (previous !== undefined && r.seq !== previous + 1)) {
      missing.push(`Context ${r.id}: missing/out-of-order report sequence before ${r.seq} (rolling log or stopped context).`);
    }
    sequences.set(r.id, r.seq);
    if (r.uo) missing.push(`Context ${r.id} seq ${r.seq}: ultimate at values sampled; ${r.uo} unretained observations/values. Delivery counts are lower bounds.`);
    if (r.cut) missing.push(`Context ${r.id} seq ${r.seq}: line-size compaction (${r.cut}); owner/message detail aggregated under <other>.`);
    const minute = Math.floor(r.to / 60000);
    if (!buckets.has(minute)) buckets.set(minute, { minute, contexts: new Map(), callbacks: new Map(),
      messages: new Map(), ultimate: new Map(), phases: Array(10).fill(0), worldScanners: new Set(), reports: 0,
      world: new Map() });
    const b = buckets.get(minute), seconds = (r.to - r.from) / 1000;
    b.reports += 1;
    b.contexts.set(r.id, r.kind);
    for (const [owner, count, totalMs, maxMs, spikes] of r.c) {
      if (!b.callbacks.has(owner)) b.callbacks.set(owner, { owner, count: 0, perSecond: 0, totalMs: 0,
        msPerSecond: 0, maxMs: 0, spikes: 0 });
      const row = b.callbacks.get(owner);
      row.count += count; row.perSecond += count / seconds; row.totalMs += totalMs;
      row.msPerSecond += totalMs / seconds; row.maxMs = Math.max(row.maxMs, maxMs); row.spikes += spikes;
    }
    for (const [direction, magic, count, bytes] of r.m) {
      const key = `${direction}:${magic}`;
      if (!b.messages.has(key)) b.messages.set(key, { direction, magic, count: 0, perSecond: 0, bytes: 0, bytesPerSecond: 0 });
      const row = b.messages.get(key);
      row.count += count; row.perSecond += count / seconds; row.bytes += bytes; row.bytesPerSecond += bytes / seconds;
    }
    for (const at of r.u) {
      if (!b.ultimate.has(at)) b.ultimate.set(at, new Set());
      b.ultimate.get(at).add(r.id);
    }
    if (r.kind === 'world') {
      r.h.forEach((count, i) => { b.phases[i] += count; });
      if (r.h.some(n => n > 0)) b.worldScanners.add(r.id);
      // A context that ran any paint or probe callback owns visible work; the rest only scan.
      const painting = r.c.some(([owner, count]) => count > 0 && /^world:(paint|probe)@/.test(owner));
      const ms = r.c.reduce((n, row) => n + row[2], 0);
      const calls = r.c.reduce((n, row) => n + row[1], 0);
      b.world.set(r.id, { t: r.t || 'unknown', painting, msPerSecond: ms / seconds, perSecond: calls / seconds });
    }
  }
  return [...buckets.values()].sort((a, b) => a.minute - b.minute).map(b => {
    const contexts = { world: 0, topbar: 0, menu: 0, relay: 0, unknown: 0 };
    for (const kind of b.contexts.values()) contexts[kind] += 1;
    const scans = b.phases.reduce((a, n) => a + n, 0);
    const phaseLockScore = scans ? Math.max(...b.phases) / scans : null;
    const census = { hero: 0, unit: 0, unknown: 0,
      painting: { contexts: 0, perSecond: 0, msPerSecond: 0 }, scanOnly: { contexts: 0, perSecond: 0, msPerSecond: 0 } };
    for (const w of b.world.values()) {
      census[w.t] += 1;
      const group = w.painting ? census.painting : census.scanOnly;
      group.contexts += 1; group.perSecond += w.perSecond; group.msPerSecond += w.msPerSecond;
    }
    return { minute: b.minute, timestamp: new Date(b.minute * 60000).toISOString(), reports: b.reports,
      liveContexts: contexts, callbacks: [...b.callbacks.values()], messages: [...b.messages.values()],
      ultimateDeliveries: [...b.ultimate.entries()].map(([at, ids]) => ({ at, contexts: ids.size })),
      scanPhaseHistogram: b.phases, phaseLockScore,
      phaseLocked: phaseLockScore === null || b.worldScanners.size < 2 ? null : phaseLockScore >= 0.8,
      worldCensus: census };
  });
}

function parseLog(raw, label = null) {
  const performance = [], records = [], missing = [];
  let current = null, network = null, direction = null, orphan = false;
  const lines = String(raw).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes('[HPV2DIAG]')) {
      const match = line.match(/\[HPV2DIAG\] v1 (\{.*\})\s*$/);
      try {
        const record = match && JSON.parse(match[1]);
        if (!validRecord(record)) throw new Error('invalid schema');
        records.push(record);
      } catch { missing.push(`Line ${index + 1}: malformed/truncated or unsupported HPV2DIAG record ignored.`); }
    }
    if (/\[VProf\].*-- Performance report --/.test(line)) {
      current = { timestamp: timestamp(line), frames: null, intervals: null, rows: {}, network: null, missing: [] };
      performance.push(current); network = null; direction = null;
      continue;
    }
    const row = line.match(/\[VProf\]\s+(FrameTotal|PanoramaUI|Javascript)\s+([\d.]+(?:\s+[\d.]+){9})\s*$/);
    if (row) {
      if (!current) { orphan = true; continue; }
      const n = row[2].trim().split(/\s+/).map(Number);
      current.rows[row[1]] = { avg: n[0], p99: n[1], activeN: n[2], activeAvg: n[3], activeP99: n[4],
        max1sP50: n[5], max1sP95: n[6], max1sActiveN: n[7], max1sActiveP50: n[8], max1sActiveP95: n[9] };
    } else if (/\[VProf\]\s+(FrameTotal|PanoramaUI|Javascript)\b/.test(line)) {
      missing.push(`Line ${index + 1}: truncated VProf row.`);
      if (!current) orphan = true;
    }
    const summary = line.match(/\[VProf\] Summary of (\d+) frames and (\d+) 1-second intervals/);
    if (summary && current) { current.frames = Number(summary[1]); current.intervals = Number(summary[2]); }
    if (line.includes('Source2 engine networking summary.')) {
      if (!current) { orphan = true; network = null; continue; }
      const seconds = line.match(/summary\.\s+(\d+) seconds/);
      network = { timestamp: timestamp(line), seconds: seconds ? Number(seconds[1]) : null,
        ping: null, upstream: {}, downstream: {}, complete: false };
      current.network = network; direction = null;
    }
    if (network) {
      if (/\bUPSTREAM\b/.test(line)) direction = 'upstream';
      if (/\bDOWNSTREAM\b/.test(line)) direction = 'downstream';
      if (/Network ping \(ms\)/.test(line)) network.ping = percentiles(line);
      if (direction) {
        const d = network[direction];
        if (/Jitter \(ms\)/.test(line)) d.jitter = percentiles(line);
        if (/Jitter, 1-sec max \(ms\)/.test(line)) d.jitter1sMax = percentiles(line);
        if (/Corrected\/smoothed/.test(line)) {
          const corrected = line.match(/:\s*(\d+)/), late = line.match(/(\d+) \([\d.]+%\) late/);
          if (corrected) d.corrected = Number(corrected[1]);
          if (late) d.correctedLate = Number(late[1]);
        }
        if (/\bMissed\./.test(line)) {
          const nonNetwork = line.match(/(\d+) \([\d.]+%\) non-network/);
          const late = line.match(/(\d+) \([\d.]+%\) late/);
          if (nonNetwork) d.missedNonNetwork = Number(nonNetwork[1]);
          if (late) d.missedLate = Number(late[1]);
        }
      }
    } else if (!current && /\[Client\].*(UPSTREAM|DOWNSTREAM|Network ping|non-network)/.test(line)) orphan = true;
    if (/\[VProf\] VProfLite stopped\./.test(line)) {
      if (network) network.complete = true;
      network = null; direction = null; current = null;
    }
  }
  if (orphan) missing.push('Orphan VProf/network rows: log may begin mid-block (rolling/truncated).');
  if (!performance.length) missing.push('No VProf Performance report blocks found.');
  if (!records.length) missing.push('No HPV2DIAG lines found.');
  for (const p of performance) {
    if (p.frames === null) p.missing.push('VProf frame/interval summary');
    if (!p.timestamp) p.missing.push('VProf timestamp');
    for (const name of ROWS) if (!p.rows[name]) p.missing.push(`${name} row`);
    if (!p.network) p.missing.push('networking summary');
    else {
      if (!p.network.complete) p.missing.push('networking summary end marker (possibly truncated)');
      if (!p.network.ping || !['P5', 'P50', 'P95'].every(k => finite(p.network.ping[k]))) p.missing.push('network ping P5/P50/P95');
      for (const d of ['upstream', 'downstream']) {
        for (const k of ['jitter', 'jitter1sMax', 'missedNonNetwork', 'missedLate', 'corrected', 'correctedLate']) {
          if (p.network[d][k] === undefined) p.missing.push(`${d} ${k}`);
        }
      }
    }
    if (p.missing.length) missing.push(`${p.timestamp || 'Untimestamped block'}: missing ${p.missing.join(', ')}.`);
  }
  const minutes = aggregate(records, missing);
  return { version: 1, label, performance, diagnosticRecords: records.length, minutes, missing,
    notes: [
      'Minute buckets use report-end time (UTC); each record summarizes its preceding ~60 s, not exact per-event minute attribution.',
      'Live contexts means distinct contexts reporting in that minute, not a census; destroyed/silent contexts and lost rolling-log lines are unknown.',
      'Date.now has integer-ms resolution. Callback and synchronous dispatch timing can overlap; do not sum them as frame cost.',
      'Ultimate deliveries count distinct reporting contexts per sampled at, not the number of listener invocations; use rx message counts for listener fan-out.',
      'Phase lock is >=80% of observed world scan callbacks in one 100 ms bucket, with at least two scanning contexts; unknown is null.',
    ] };
}

function markdown(report) {
  const value = n => n === undefined || n === null ? 'missing' : typeof n === 'number' ? String(Math.round(n * 1000) / 1000) : String(n);
  const out = ['| Timestamp | VProf row | Avg ms | P99 ms | 1s max P50 | 1s max P95 | Active N |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |'];
  for (const p of report.performance) {
    for (const name of ROWS) {
      const r = p.rows[name] || {};
      out.push(`| ${p.timestamp || 'missing'} | ${name} | ${value(r.avg)} | ${value(r.p99)} | ${value(r.max1sP50)} | ${value(r.max1sP95)} | ${value(r.activeN)} |`);
    }
  }
  out.push('', '| Timestamp | Direction | Ping P5/P50/P95 ms | Jitter P50/P99 ms | 1s jitter P50/P95 | Missed non-net / late | Corrected / late |',
    '| --- | --- | --- | --- | --- | --- | --- |');
  for (const p of report.performance) {
    const n = p.network || {};
    for (const direction of ['upstream', 'downstream']) {
      const d = n[direction] || {}, ping = n.ping || {}, jitter = d.jitter || {}, max = d.jitter1sMax || {};
      out.push(`| ${n.timestamp || p.timestamp || 'missing'} | ${direction} | ${['P5', 'P50', 'P95'].map(k => value(ping[k])).join('/')} | ${value(jitter.P50)}/${value(jitter.P99)} | ${value(max.P50)}/${value(max.P95)} | ${value(d.missedNonNetwork)} / ${value(d.missedLate)} | ${value(d.corrected)} / ${value(d.correctedLate)} |`);
    }
  }
  if (report.minutes.length) {
    out.push('', '| Report-end minute (UTC) | Contexts W/T/M/R/? | Callbacks/s | Spikes >=4ms | Messages/s rx/tx | Bytes rx/tx | Phase score |',
      '| --- | --- | ---: | ---: | --- | --- | ---: |');
    for (const m of report.minutes) {
      const sum = (rows, field) => rows.reduce((n, r) => n + r[field], 0);
      const rx = m.messages.filter(r => r.direction === 'rx'), tx = m.messages.filter(r => r.direction === 'tx');
      out.push(`| ${m.timestamp} | ${Object.values(m.liveContexts).join('/')} | ${value(sum(m.callbacks, 'perSecond'))} | ${sum(m.callbacks, 'spikes')} | ${value(sum(rx, 'perSecond'))}/${value(sum(tx, 'perSecond'))} | ${sum(rx, 'bytes')}/${sum(tx, 'bytes')} | ${value(m.phaseLockScore)} |`);
    }
    out.push('', '| Report-end minute (UTC) | World hero/unit | Painting / scan-only contexts | Painting calls/s, ms/s | Scan-only calls/s, ms/s | Quiet probes/s | Full paints/s |',
      '| --- | --- | --- | --- | --- | ---: | ---: |');
    for (const m of report.minutes) {
      const c = m.worldCensus, rate = re => m.callbacks.filter(r => re.test(r.owner)).reduce((n, r) => n + r.perSecond, 0);
      out.push(`| ${m.timestamp} | ${c.hero}/${c.unit}${c.unknown ? ` (+${c.unknown} untagged)` : ''} | ${c.painting.contexts} / ${c.scanOnly.contexts} | ${value(c.painting.perSecond)}, ${value(c.painting.msPerSecond)} | ${value(c.scanOnly.perSecond)}, ${value(c.scanOnly.msPerSecond)} | ${value(rate(/^world:probe@/))} | ${value(rate(/^world:paint@/))} |`);
    }
  }
  if (report.missing.length) out.push('', 'Missing / limits:', ...report.missing.map(s => `- ${s}`));
  out.push('', ...report.notes.map(s => `- ${s}`));
  return out.join('\n');
}

function main(args) {
  const file = args.shift();
  if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/hpv2-diag-report.js <console.log> [--json out.json] [--label NAME]');
  let json = null, label = null;
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!['--json', '--label'].includes(flag) || !value || value.startsWith('--')) throw new Error(`Invalid option: ${flag}`);
    if (flag === '--json') json = value; else label = value;
  }
  const report = parseLog(fs.readFileSync(file, 'utf8'), label);
  if (json) {
    // Never overwrite the input capture with generated JSON.
    const path = require('node:path');
    if (path.resolve(json).toLowerCase() === path.resolve(file).toLowerCase()) throw new Error('--json must not overwrite the input log');
    fs.writeFileSync(json, JSON.stringify(report, null, 2) + '\n');
  } else console.log(JSON.stringify(report, null, 2));
  console.log(markdown(report));
}

module.exports = { parseLog, markdown };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
