'use strict';

// ShowRank Barebones diagnostics: instruments the staged host template (never the source tree)
// and summarizes [SRBDIAG] console lines. Usage:
//   node scripts/showrank-barebones-diag.js instrument <staged showrank_barebones.js>
//   node scripts/showrank-barebones-diag.js report <console.log> [--json]

const fs = require('node:fs');

const TAG = '[SRBDIAG] v1 ';
const KINDS = ['card', 'page', 'topbar', 'escape'];
const MAX_LINE = 900;

// Panel-free on purpose: no IsValid/GetParent/Find* calls, so VM work budgets and live
// engine traffic stay identical. Clock is Date.now (ms resolution); sub-ms callbacks read 0.
const PRELUDE = String.raw`
    var __srbdNames = __SRBD_NAMES__;
    // Quoted keys: this table is read with a runtime string, so ADVANCED must not rename them.
    var __srbdKind = ({
        "CitadelProfileCard": "card",
        "CitadelProfilePage": "page",
        "CitadelHudTopBarPlayer": "topbar",
        "CitadelHudEscapeMenu": "escape"
    })[String(($.GetContextPanel() || {}).paneltype || "")] || "";
    var __srbdId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    var __srbdBootStart = Date.now();
    var __srbdSeq = 0;
    var __srbdFrom = __srbdBootStart;
    var __srbdPending = 0;
    var __srbdLive = {};
    var __srbdHandles = {};
    var __srbdToken = 0;
    var __srbdDepth = 0;
    var __srbdActive = false;
    var __srbdNext = "";
    var __srbdCounts;
    var __srbdCallbacks;
    var __srbdSpans;
    var __srbdSchedule = $.Schedule;
    var __srbdCancel = $.CancelScheduled;
    var __srbdCreatePanel = $.CreatePanel;
    var __srbdDispatch = $.DispatchEvent;
    function __srbdReset() {
        var index;
        __srbdCounts = [];
        for (index = 0; index < __srbdNames.length; index += 1) {
            __srbdCounts.push(0);
        }
        __srbdCallbacks = {};
        __srbdSpans = {};
        __srbdActive = false;
    }
    __srbdReset();
    function __srbdHit(index) {
        __srbdCounts[index] += 1;
    }
    function __srbdRow(label) {
        var keys = Object.keys(__srbdCallbacks);
        if (!__srbdCallbacks[label] && keys.length >= 16) {
            label = "<other>";
        }
        return __srbdCallbacks[label] || (__srbdCallbacks[label] = [label, 0, 0, 0, 0]);
    }
    function __srbdTimed(label, fn, receiver, args) {
        var start = Date.now();
        var ms;
        var row;
        __srbdDepth += 1;
        try {
            return fn.apply(receiver, args);
        } finally {
            __srbdDepth -= 1;
            ms = Math.max(0, Date.now() - start);
            row = __srbdRow(label);
            row[1] += 1;
            row[2] += ms;
            row[3] = Math.max(row[3], ms);
            if (ms >= 4) {
                row[4] += 1;
            }
            __srbdActive = true;
            if (!__srbdDepth) {
                __srbdMaybeReport();
            }
        }
    }
    // Times one ShowRank statement inside a callback; the enclosing callback total still includes it.
    // Row: [name, n, total ms, max ms, >=1 ms].
    function __srbdSpan(name, fn) {
        var start = Date.now();
        var ms;
        var row;
        try {
            return fn();
        } finally {
            ms = Math.max(0, Date.now() - start);
            row = __srbdSpans[name] || (__srbdSpans[name] = [name, 0, 0, 0, 0]);
            row[1] += 1;
            row[2] += ms;
            row[3] = Math.max(row[3], ms);
            if (ms >= 1) {
                row[4] += 1;
            }
        }
    }
    if (__srbdKind && typeof __srbdSchedule === "function") {
        $.Schedule = function (delay, fn) {
            var label = (__srbdNext || "unattributed") + "@" + String(delay).slice(0, 6);
            var token = ++__srbdToken;
            var handle;
            __srbdNext = "";
            __srbdLive[token] = true;
            __srbdPending += 1;
            handle = __srbdSchedule.call($, delay, function () {
                if (__srbdLive[token]) {
                    delete __srbdLive[token];
                    __srbdPending -= 1;
                }
                return __srbdTimed(label, fn, this, arguments);
            });
            __srbdHandles[String(handle)] = token;
            return handle;
        };
        if (typeof __srbdCancel === "function") {
            $.CancelScheduled = function (handle) {
                var token = __srbdHandles[String(handle)];
                if (token && __srbdLive[token]) {
                    delete __srbdLive[token];
                    __srbdPending -= 1;
                }
                return __srbdCancel.apply($, arguments);
            };
        }
        if (typeof __srbdCreatePanel === "function") {
            $.CreatePanel = function () {
                __srbdHit(__srbdNames.length - 2);
                return __srbdCreatePanel.apply($, arguments);
            };
        }
        if (typeof __srbdDispatch === "function") {
            $.DispatchEvent = function () {
                __srbdHit(__srbdNames.length - 1);
                return __srbdDispatch.apply($, arguments);
            };
        }
    }
    function __srbdWrap(name, fn) {
        return typeof fn === "function" ? function () {
            return __srbdTimed("on:" + name, fn, this, arguments);
        } : fn;
    }
    function __srbdMaybeReport() {
        var now = Date.now();
        var record;
        var fn = [];
        var cb = [];
        var index;
        var line;
        var other;
        var sp;
        var snapshot;
        if (!__srbdKind || !__srbdActive || now - __srbdFrom < (__srbdPending > 0 ? 60000 : 10000)) {
            return;
        }
        for (index = 0; index < __srbdCounts.length - 2; index += 1) {
            if (__srbdCounts[index]) {
                fn.push([__srbdNames[index], __srbdCounts[index]]);
            }
        }
        fn.sort(function (a, b) { return b[1] - a[1]; });
        for (index in __srbdCallbacks) {
            cb.push(__srbdCallbacks[index]);
        }
        cb.sort(function (a, b) { return b[2] - a[2] || b[1] - a[1]; });
        record = {"k": __srbdKind, "id": __srbdId, "seq": ++__srbdSeq, "from": __srbdFrom, "to": now,
            "pending": __srbdPending, "cb": cb, "fn": fn.slice(0, 16), "fnTotal": fn.length,
            "eng": [__srbdCounts[__srbdNames.length - 2], __srbdCounts[__srbdNames.length - 1]], "cut": 0};
        snapshot = typeof missingShared !== "undefined" ? missingShared : null;
        if (snapshot && snapshot.missingLeaderRoot === root) {
            record["ms"] = [snapshot.missingRecords ? snapshot.missingRecords.length : -1,
                snapshot.missingRunning ? 1 : 0, Number(snapshot.missingChecks) || 0];
        }
        sp = [];
        for (index in __srbdSpans) {
            sp.push(__srbdSpans[index]);
        }
        if (sp.length) {
            record["sp"] = sp;
        }
        line = TAG_TEXT + JSON.stringify(record);
        while (line.length > MAX_LINE) {
            record["cut"] += 1;
            if (record["fn"].length > 6) {
                record["fn"].pop();
            } else if (record["cb"].length > 3) {
                other = record["cb"].pop();
                if (record["cb"][0][0] !== "<other>") {
                    record["cb"].unshift(["<other>", 0, 0, 0, 0]);
                }
                record["cb"][0][1] += other[1];
                record["cb"][0][2] += other[2];
                record["cb"][0][3] = Math.max(record["cb"][0][3], other[3]);
                record["cb"][0][4] += other[4];
            } else if (record["fn"].length > 2) {
                record["fn"].pop();
            } else {
                break;
            }
            line = TAG_TEXT + JSON.stringify(record);
        }
        __srbdReset();
        __srbdFrom = now;
        try {
            $.Msg(line);
        } catch (ignore) {
        }
    }
    function __srbdBoot() {
        var row;
        var ms = Math.max(0, Date.now() - __srbdBootStart);
        if (!__srbdKind) {
            return;
        }
        row = __srbdRow("boot");
        row[1] += 1;
        row[2] += ms;
        row[3] = Math.max(row[3], ms);
        if (ms >= 4) {
            row[4] += 1;
        }
        __srbdActive = true;
        if (root && typeof root.ShowRankBarebonesRefresh === "function") {
            root.ShowRankBarebonesRefresh = __srbdWrap("Refresh", root.ShowRankBarebonesRefresh);
            root.ShowRankBarebonesOpenStatlocker = __srbdWrap("OpenStatlocker", root.ShowRankBarebonesOpenStatlocker);
            root.ShowRankBarebonesOpenPlayerProfile = __srbdWrap("OpenPlayerProfile", root.ShowRankBarebonesOpenPlayerProfile);
            root.ShowRankBarebonesCopyAccount = __srbdWrap("CopyAccount", root.ShowRankBarebonesCopyAccount);
        }
        if (typeof $.ShowRankBarebonesEscapeOpen === "function") {
            $.ShowRankBarebonesEscapeOpen = __srbdWrap("EscapeOpen", $.ShowRankBarebonesEscapeOpen);
            $.ShowRankBarebonesEscapeOut = __srbdWrap("EscapeOut", $.ShowRankBarebonesEscapeOut);
        }
    }
`;

function instrumentHostRuntime(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const names = [];
  const out = [];
  let current = 'dispatch';
  let scheduleSites = 0;
  for (const line of lines) {
    const declaration = /^    function ([A-Za-z_$][\w$]*)\(.*\) \{$/.exec(line);
    if (declaration) {
      current = declaration[1];
      out.push(line, `        __srbdHit(${names.length});`);
      names.push(current);
      continue;
    }
    if (line === '    }') current = 'dispatch';
    const site = /^(\s+)(schedule|scheduleEscape)\(/.exec(line);
    if (site) {
      scheduleSites += 1;
      out.push(`${site[1]}__srbdNext = __srbdNext || ${JSON.stringify(current)};`);
    }
    out.push(line);
  }
  const allSites = (source.match(/\b(?:schedule|scheduleEscape)\(/g) || []).length -
    (source.match(/function (?:schedule|scheduleEscape)\(/g) || []).length;
  if (scheduleSites !== allSites || scheduleSites === 0) {
    throw new Error(`diag: instrumented ${scheduleSites} of ${allSites} schedule call sites; every site must be a line-start statement`);
  }
  for (const required of ['schedule', 'isValid', 'findChild', 'findByClass', 'refreshMissingSession', 'startEscapePass']) {
    if (!names.includes(required)) throw new Error(`diag: host function not found for instrumentation: ${required}`);
  }
  if (!source.includes('var missingShared = getState(root);')) {
    throw new Error('diag: missing-session snapshot anchor not found');
  }
  names.push('$CreatePanel', '$DispatchEvent');

  let text = out.join(eol);
  // Split the per-row Escape cost: the native activation dispatch versus the profile-card scans around it.
  const spans = [
    ['activate', '$.DispatchEvent("Activated", record.mainContents, "mouse");', 1],
    ['cardScan', 'scanRecords(documentRoot, PROFILE_CARD_CLASS, buildProfileRecord)', 2],
  ];
  for (const [name, statement, expected] of spans) {
    const found = text.split(statement).length - 1;
    if (found !== expected) throw new Error(`diag: expected ${expected} ${name} anchor(s), found ${found}`);
    const call = statement.replace(/;$/, '');
    text = text.split(statement).join(`__srbdSpan(${JSON.stringify(name)}, function () { return ${call}; })${statement.endsWith(';') ? ';' : ''}`);
  }
  const strict = `    "use strict";${eol}`;
  if (text.indexOf(strict) < 0) throw new Error('diag: "use strict" anchor not found');
  const prelude = PRELUDE
    .replace('__SRBD_NAMES__', JSON.stringify(names))
    .replace(/TAG_TEXT/g, JSON.stringify(TAG))
    .replace(/MAX_LINE/g, String(MAX_LINE))
    .split('\n').join(eol);
  text = text.replace(strict, strict + prelude.replace(/^\r?\n/, '') + eol);
  const tail = `${eol}}${eol}());`;
  const end = text.lastIndexOf(tail);
  if (end < 0) throw new Error('diag: IIFE tail anchor not found');
  text = `${text.slice(0, end)}${eol}    __srbdBoot();${text.slice(end)}`;
  return { source: text, functions: names.length - 2, scheduleSites };
}

const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function validRecord(r) {
  return r && KINDS.includes(r.k) && typeof r.id === 'string' && Number.isInteger(r.seq) && r.seq >= 1 &&
    finite(r.from) && finite(r.to) && r.to >= r.from && finite(r.pending) && finite(r.cut) &&
    Array.isArray(r.cb) && r.cb.every((row) => Array.isArray(row) && row.length === 5 &&
      typeof row[0] === 'string' && row.slice(1).every(finite)) &&
    Array.isArray(r.fn) && r.fn.every((row) => Array.isArray(row) && row.length === 2 &&
      typeof row[0] === 'string' && finite(row[1])) &&
    Array.isArray(r.eng) && r.eng.length === 2 && r.eng.every(finite) &&
    (r.ms === undefined || (Array.isArray(r.ms) && r.ms.length === 3)) &&
    (r.sp === undefined || (Array.isArray(r.sp) && r.sp.every((row) => Array.isArray(row) && row.length === 5 &&
      typeof row[0] === 'string' && row.slice(1).every(finite))));
}

function parseLog(raw) {
  const records = [];
  const problems = [];
  String(raw).split(/\r?\n/).forEach((line, index) => {
    const at = line.indexOf(TAG);
    if (at < 0) return;
    try {
      const record = JSON.parse(line.slice(at + TAG.length).trim());
      if (validRecord(record)) records.push(record);
      else problems.push(`line ${index + 1}: invalid SRBDIAG record`);
    } catch {
      problems.push(`line ${index + 1}: truncated SRBDIAG record`);
    }
  });
  return { records, problems };
}

function summarize(records) {
  const kinds = {};
  for (const r of records) {
    const k = kinds[r.k] || (kinds[r.k] = { reports: 0, contexts: new Set(), seconds: 0, cut: 0, cb: {}, fn: {}, sp: {}, eng: [0, 0], ms: null });
    k.reports += 1;
    k.contexts.add(r.id);
    k.seconds += (r.to - r.from) / 1000;
    k.cut += r.cut;
    for (const [label, n, ms, max, slow] of r.cb) {
      const row = k.cb[label] || (k.cb[label] = { n: 0, ms: 0, max: 0, slow: 0 });
      row.n += n; row.ms += ms; row.max = Math.max(row.max, max); row.slow += slow;
    }
    for (const [name, n, ms, max, overOne] of r.sp || []) {
      const row = k.sp[name] || (k.sp[name] = { n: 0, ms: 0, max: 0, overOne: 0 });
      row.n += n; row.ms += ms; row.max = Math.max(row.max, max); row.overOne += overOne;
    }
    for (const [name, n] of r.fn) k.fn[name] = (k.fn[name] || 0) + n;
    k.eng[0] += r.eng[0]; k.eng[1] += r.eng[1];
    if (r.ms) k.ms = r.ms;
  }
  return Object.fromEntries(Object.entries(kinds).map(([kind, k]) => [kind, {
    reports: k.reports,
    contexts: k.contexts.size,
    contextSeconds: Math.round(k.seconds),
    truncatedReports: k.cut,
    lastMissingSnapshot: k.ms,
    createPanel: k.eng[0],
    dispatchEvent: k.eng[1],
    callbacks: Object.entries(k.cb).map(([label, row]) => ({ label, ...row, avgMs: row.n ? +(row.ms / row.n).toFixed(3) : 0 }))
      .sort((a, b) => b.ms - a.ms || b.n - a.n),
    spans: Object.entries(k.sp).map(([name, row]) => ({ name, ...row, avgMs: row.n ? +(row.ms / row.n).toFixed(3) : 0 }))
      .sort((a, b) => b.ms - a.ms),
    functions: Object.entries(k.fn).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
  }]));
}

function markdown(summary, problems) {
  const out = ['# ShowRank Barebones diagnostics', ''];
  for (const [kind, k] of Object.entries(summary)) {
    out.push(`## ${kind}: ${k.reports} reports, ${k.contexts} contexts, ${k.contextSeconds} context-seconds`);
    if (k.lastMissingSnapshot) out.push(`Last missing-session snapshot [records, running, checks]: ${JSON.stringify(k.lastMissingSnapshot)}`);
    out.push(`Engine calls: $.CreatePanel ${k.createPanel}, $.DispatchEvent ${k.dispatchEvent}`);
    out.push('', '| callback | n | total ms | avg ms | max ms | >=4 ms |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const row of k.callbacks.slice(0, 20)) out.push(`| ${row.label} | ${row.n} | ${row.ms} | ${row.avgMs} | ${row.max} | ${row.slow} |`);
    if (k.spans.length) {
      out.push('', 'Spans inside callbacks (already included in the callback totals):', '',
        '| span | n | total ms | avg ms | max ms | >=1 ms |', '| --- | ---: | ---: | ---: | ---: | ---: |');
      for (const row of k.spans) out.push(`| ${row.name} | ${row.n} | ${row.ms} | ${row.avgMs} | ${row.max} | ${row.overOne} |`);
    }
    out.push('', '| function | calls | per context-minute |', '| --- | ---: | ---: |');
    for (const row of k.functions.slice(0, 20)) {
      out.push(`| ${row.name} | ${row.n} | ${k.contextSeconds ? (row.n * 60 / k.contextSeconds).toFixed(1) : '-'} |`);
    }
    out.push('');
  }
  if (problems.length) out.push('## Problems', ...problems.map((p) => `- ${p}`));
  if (!Object.keys(summary).length) out.push('No [SRBDIAG] records found.');
  return out.join('\n');
}

function main(args) {
  const [command, file, flag] = args;
  if (command === 'instrument' && file) {
    const result = instrumentHostRuntime(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, result.source);
    console.log(`SRBDIAG instrumented ${result.functions} functions and ${result.scheduleSites} schedule sites`);
    return 0;
  }
  if (command === 'report' && file) {
    const { records, problems } = parseLog(fs.readFileSync(file, 'utf8'));
    const summary = summarize(records);
    console.log(flag === '--json' ? JSON.stringify({ records: records.length, summary, problems }, null, 2) : markdown(summary, problems));
    return records.length ? 0 : 1;
  }
  console.error('usage: showrank-barebones-diag.js instrument <runtime.js> | report <console.log> [--json]');
  return 2;
}

module.exports = { instrumentHostRuntime, parseLog, summarize, markdown, TAG, MAX_LINE };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
