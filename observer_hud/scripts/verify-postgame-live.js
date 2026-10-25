#!/usr/bin/env node
// E2E check of a live post-game scan: reads the newest [NS] data lines from Deadlock's console.log
// and compares them with the deadlock-api metadata of the same match. Writes the comparison to
// observer_hud/live/<match>[-<label>]-verify.json and exits non-zero on any mismatch.
//   node observer_hud/scripts/verify-postgame-live.js <metadata.json> [console.log] [label]
// label names the build that ran (e.g. pak10); "-" keeps the default console.log.
"use strict";
const fs = require("fs");
const path = require("path");

const [metaPath, logArg, label = ""] = process.argv.slice(2);
const logPath = logArg && logArg !== "-" ? logArg : "G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/console.log";
if (!metaPath) { console.error("usage: verify-postgame-live.js <metadata.json> [console.log|-] [label]"); process.exit(2); }
const metaRaw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const meta = metaRaw.match_info || metaRaw;
const lines = fs.readFileSync(logPath, "latin1").split(/\r?\n/);

// Newest "[NS] data <kind> begin N" block followed by its N "[NS] data <kind> + <json>" lines.
function latest(kind) {
  const begin = `[NS] data ${kind} begin `;
  const item = `[NS] data ${kind} + `;
  for (let i = lines.length - 1; i >= 0; i--) {
    const at = lines[i].indexOf(begin);
    if (at < 0) continue;
    const count = Number(lines[i].slice(at + begin.length));
    const out = [];
    for (let j = i + 1; j < lines.length && out.length < count; j++) {
      const k = lines[j].indexOf(item);
      if (k >= 0) out.push(JSON.parse(lines[j].slice(k + item.length)));
    }
    if (out.length !== count) throw new Error(`"${kind}" block has ${out.length} of ${count} items`);
    return out;
  }
  throw new Error(`no "[NS] data ${kind}" block in ${logPath}`);
}

const failures = [];
const fail = (msg) => failures.push(msg);
const report = { match: meta.match_id, build: label || undefined, log: logPath, checks: {} };

// rows: exact values per hero against the metadata players (team index = metadata team).
const teams = latest("rows");
const players = new Map(meta.players.map((p) => [p.hero_id, p]));
let rowChecks = 0;
teams.forEach((team, t) => {
  let sum = 0;
  for (const r of team.rows) {
    const p = players.get(r.hero);
    if (!p) { fail(`hero ${r.hero} not in metadata`); continue; }
    if (p.team !== t) fail(`hero ${r.hero} on team ${t + 1}, metadata team ${p.team}`);
    for (const [k, mk] of [["souls", "net_worth"], ["kills", "kills"], ["deaths", "deaths"], ["assists", "assists"]]) {
      if (r[k] !== p[mk]) fail(`hero ${r.hero} ${k} ${r[k]} != ${p[mk]}`);
      rowChecks++;
    }
    // MVP / Key Player marks (stock MVP_Rank1..3) against the metadata's mvp_rank (0 = none).
    const rank = p.mvp_rank > 0 && p.mvp_rank <= 3 ? p.mvp_rank : 0;
    if ((r.mvp || 0) !== rank) fail(`hero ${r.hero} mvp ${r.mvp} != metadata mvp_rank ${p.mvp_rank}`);
    rowChecks++;
    sum += r.souls;
  }
  if (team.totals.souls !== sum) fail(`team ${t + 1} totals ${team.totals.souls} != row sum ${sum}`);
});
report.checks.rows = rowChecks;

// series: increasing time, ends at the exact team totals.
const series = latest("series");
for (let i = 1; i < series.length; i++) if (series[i].t <= series[i - 1].t) fail(`series time not increasing at ${i}`);
const last = series[series.length - 1];
if (series.length < 30) fail(`only ${series.length} lead points`);
// The graph's last column can differ from the totals rows by a few souls (live, demo 121685912: 1).
const near = (x, y) => Math.abs(x - y) <= Math.max(50, 0.005 * y);
if (!last || !near(last.a, teams[0].totals.souls) || !near(last.b, teams[1].totals.souls)) fail(`series end ${JSON.stringify(last)} != totals`);
if (last && Math.abs(last.t - meta.duration_s) > 1) fail(`series end ${last.t}s != duration ${meta.duration_s}s`);
report.checks.series = series.length;

// souls by source: every player, shares near 100 %, rows sum to the total.
const souls = latest("souls");
const heroes = new Set(teams.flatMap((t) => t.rows.map((r) => r.hero)));
for (const s of souls) {
  heroes.delete(s.hero);
  const pct = s.rows.reduce((a, r) => a + r.pct, 0);
  const val = s.rows.reduce((a, r) => a + r.value, 0);
  if (pct < 96 || pct > 104) fail(`hero ${s.hero} shares sum to ${pct}%`);
  if (s.total !== null && Math.abs(val - s.total) > 2) fail(`hero ${s.hero} rows ${val} != total ${s.total}`);
}
if (heroes.size) fail(`souls missing for heroes ${[...heroes].join(",")}`);
report.checks.souls = souls.length;

// objectives: each scanned event matches a destroyed objective of the owner team within 1 s.
const events = latest("events");
const objectives = meta.objectives.filter((o) => o.destroyed_time_s > 0).map((o) => ({ ...o, used: false }));
for (const e of events) {
  const o = objectives.find((x) => !x.used && x.team === e.owner - 1 && Math.abs(x.destroyed_time_s - e.t) <= 1);
  if (!o) fail(`event ${JSON.stringify(e)} matches no destroyed objective`);
  else o.used = true;
}
report.checks.events = events.length;
report.uncovered = objectives.filter((o) => !o.used).map((o) => ({ team: o.team, id: o.team_objective_id, t: o.destroyed_time_s }));
report.failures = failures;

const outDir = path.join(__dirname, "..", "live");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${meta.match_id}${label ? `-${label}` : ""}-verify.json`);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`rows ${rowChecks} values, ${series.length} lead points, ${souls.length} souls, ${events.length} objectives (${report.uncovered.length} not scannable)`);
console.log(failures.length ? `FAIL\n  ${failures.join("\n  ")}` : "PASS");
console.log(`report -> ${out}`);
process.exit(failures.length ? 1 : 0);
