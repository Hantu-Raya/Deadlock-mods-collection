#!/usr/bin/env node
'use strict';
// Deadlock console.log scanner for the HP Colors v3 lanes (v3, QOLLOCK, ShowRank).
//
//   node hp_colors_rewrite_v3/tools/logscan.js                 find game/citadel/console.log and summarize it
//   --file <console.log>               read this log instead of discovering the install
//   --installed-steam-inf <steam.inf>  the install to read (same flag and discovery as build.js/doctor.js)
//   --since-boot                       only the latest game session in the file
//   --only errors|hpv3|timing          one section (errors also lists warnings on lane files)
//   --all-warnings                     list stock/other-mod warnings too, not only their count
//   --json                             the report as JSON
//   --follow                           summarize, then tail the log and print new errors/[HPV3] lines
//
// The game writes console.log only when launched with -condebug. Formats follow panorama.dll (research/
// dll-tooling-findings.md): the Panorama, PanoramaScript and VScript channels, `***** Parsing %s on %s%s:  %s`
// with a `(line)` or `(line,col)` location, the three JS exception forms and the selector diagnostics.
// Reported: Parsing error, FATAL, Uncaught, JS exception blocks and Panorama CSS/layout problems, grouped and counted, each mapped to the lane source
// (hp_colors_v3_renderer.vjs_c -> hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_renderer.js) with the
// line found by the quoted code or selector where the log has one; the [HPV3] debug lines (boot/lifecycle,
// save/store, timing; see the // HPV3_DEBUG statements and tools/stage-scripts.js); the game version, the
// mounted addon paks, and which build the installed citadel/addons/pak02_dir.vpk is (sha256 against every
// project's .build/{release,debug}/pak02_dir.vpk, read-only) or 'unknown build'.
// Exit 1 when errors are found (the console check AGENTS.md requires after CSS changes), 2 on usage errors or
// a missing log, else 0.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const cli = require('./lib/cli');
const { REPO, LANES: PROJECT_LANES, PROJECT_NAMES, projectConfig, stagePaths, repoPaths } = require('./lib/projects');
const { discoverDeadlock } = require('./lib/toolchain');
const { readClientVersion, readPinVersion } = require('./lib/pin');

const USAGE = 'Usage: node hp_colors_rewrite_v3/tools/logscan.js [--file <console.log> | --installed-steam-inf <steam.inf>] [--since-boot] [--only errors|hpv3|timing] [--all-warnings] [--json] [--follow]';
const ONLY = ['errors', 'hpv3', 'timing'];
// Mapping roots in preference order; a pak02 identified as a variant build moves its lane first.
const LANES = [
  ...PROJECT_NAMES.map(key => ({ key, dir: PROJECT_LANES[key].dir })),
  // Upstream folders a lane reads (LANES.inputDirs): 'showrank_barebones' maps to the key 'showrank-barebones'.
  ...PROJECT_NAMES.flatMap(key => PROJECT_LANES[key].inputDirs.map(dir => ({ key: dir.replace(/_/g, '-'), dir }))),
];
const ERROR_KINDS = ['fatal', 'parse-error', 'js-exception', 'uncaught', 'panorama-error'];
const WARNING_KINDS = ['parse-warning', 'layout-warning', 'vscript-error'];
const LABEL = {
  fatal: 'FATAL', 'parse-error': 'Parsing error', 'js-exception': 'JS exception', uncaught: 'Uncaught',
  'panorama-error': 'Panorama error', 'parse-warning': 'Parsing warning', 'layout-warning': 'Layout warning', 'vscript-error': 'VScript error',
};

// ---------------------------------------------------------------------------------------------------
// Arguments.
// ---------------------------------------------------------------------------------------------------
const ARGS = {
  defaults: { file: null, steamInf: null, sinceBoot: false, follow: false, json: false, only: null, allWarnings: false, help: false },
  options: {
    '--file': { key: 'file', value: true },
    '--installed-steam-inf': { key: 'steamInf', value: true },
    '--since-boot': { key: 'sinceBoot' },
    '--follow': { key: 'follow' },
    '--json': { key: 'json' },
    '--all-warnings': { key: 'allWarnings' },
    '--only': { key: 'only', value: true, convert: raw => {
      const only = raw.toLowerCase();
      if (!ONLY.includes(only)) throw new Error('--only must be ' + ONLY.join('|') + '. ' + USAGE);
      return only;
    } },
    ...cli.HELP,
  },
  dashGuard: true,
  messages: { missing: name => name + ' needs a value. ' + USAGE, unknown: arg => 'Unknown argument \'' + arg + '\'. ' + USAGE },
};

function parseArgs(argv) {
  const opts = cli.parse(argv, ARGS);
  if (opts.follow && opts.json) throw new Error('--follow and --json cannot be combined. ' + USAGE);
  return opts;
}

// ---------------------------------------------------------------------------------------------------
// Finding console.log: --file, else the Deadlock install from lib/toolchain.js discoverDeadlock (the same
// order build.js and doctor.js use: --installed-steam-inf, HPV3_STEAM_INF / HPV3_DEADLOCK_DIR, the Steam
// libraries, a drive scan); the log is game/citadel/console.log beside its steam.inf.
// ---------------------------------------------------------------------------------------------------
function defaultDeps() {
  return {
    fs, env: process.env, platform: process.platform, spawnSync: childProcess.spawnSync,
    log: line => console.log(line), error: line => console.error(line),
  };
}

function discoverInstall(opts, deps) {
  try { return discoverDeadlock({ flag: opts.steamInf || null, fs: deps.fs, env: deps.env || {}, spawnSync: deps.spawnSync, platform: deps.platform }); }
  catch (error) { return { steamInf: null, source: 'none', tried: ['(discovery failed: ' + error.message + ')'] }; }
}

function findConsoleLog(opts, deps = defaultDeps(), install = null) {
  const fsx = deps.fs;
  if (opts.file) {
    const file = path.resolve(opts.file);
    return fsx.existsSync(file) ? { file, how: '--file', tried: [file] } : { file: null, how: null, tried: [file] };
  }
  const found = install || discoverInstall(opts, deps);
  if (!found.steamInf) return { file: null, how: null, tried: found.tried.map(inf => path.join(path.dirname(inf), 'console.log')), install: found };
  const file = path.join(path.dirname(found.steamInf), 'console.log');
  return fsx.existsSync(file) ? { file: path.resolve(file), how: found.source, tried: [file], install: found } : { file: null, how: null, tried: [file], install: found };
}

// ---------------------------------------------------------------------------------------------------
// Parsing. One streaming parser for whole files and --follow: push() each line, flush() at the end. A
// "JS Exception!" line opens a block of untimestamped lines (source, line:N, col:M, >> code, Uncaught ...,
// stack frames) that the next timestamped line closes.
// ---------------------------------------------------------------------------------------------------
const TIMESTAMP = /^(\d\d\/\d\d \d\d:\d\d:\d\d) (.*)$/;

class LogParser {
  constructor(onEntry) {
    this.onEntry = onEntry;
    this.lineNo = 0;
    this.session = 0;
    this.block = null;
    this.afterShutdown = false;
    this.spans = {}; // session -> { from, to } timestamps
  }

  emit(entry) { this.onEntry({ session: this.session, ...entry }); }

  startSession(time) {
    this.session++;
    this.afterShutdown = false;
    this.emit({ kind: 'session', line: this.lineNo, time });
  }

  push(raw) {
    this.lineNo++;
    let text = String(raw).replace(/\r$/, '');
    const bom = text.charCodeAt(0) === 0xfeff;
    if (bom) text = text.slice(1);
    const match = TIMESTAMP.exec(text);
    const time = match ? match[1] : null;
    if (this.session === 0 || bom || (this.afterShutdown && match)) {
      this.closeBlock();
      this.startSession(time);
    }
    if (time) {
      const span = this.spans[this.session] || (this.spans[this.session] = { from: time, to: time });
      span.to = time;
    }
    if (this.block) {
      if (!match) { this.block.lines.push(text); return; }
      this.closeBlock();
    }
    const body = match ? match[2] : text;
    this.classify(body, time, !!match);
  }

  flush() { this.closeBlock(); }

  closeBlock() {
    if (!this.block) return;
    const block = this.block;
    this.block = null;
    this.emit(parseExceptionBlock(block));
  }

  classify(body, time, stamped) {
    // Continuation lines (e.g. the `\nJS(...)` form) carry no timestamp: use the last one seen.
    if (time) this.lastTime = time;
    const at = { line: this.lineNo, time: time || this.lastTime || null };
    // Logging channels panorama.dll registers (tier0 LoggingSystem_RegisterLoggingChannel): Panorama,
    // PanoramaScript and VScript; they print as a "[<channel>] " prefix.
    const channelMatch = /^\[(Panorama|PanoramaScript|VScript)\] /.exec(body);
    const channel = channelMatch ? channelMatch[1] : null;
    const text = channelMatch ? body.slice(channelMatch[0].length) : body;
    let m;
    if (/JS Exception!/.test(text)) { this.block = { ...at, channel, header: text, lines: [] }; return; }
    // `\nJS(%s:%d:%d)\n%s\n%s\n`: the location line, then two text lines.
    if ((m = /^JS\((.+):(\d+):(\d+)\)\s*$/.exec(text.trim()))) { this.block = { ...at, channel, header: text, preset: { source: m[1], sourceLine: Number(m[2]), column: Number(m[3]) }, lines: [] }; return; }
    if (body.includes('ShutdownSource2Logging')) this.afterShutdown = true;
    if ((m = /\[HPV3\] ?(.*)$/.exec(body))) { this.emit({ kind: 'hpv3', ...at, channel, message: m[1].trim() }); return; }
    if ((m = /FATAL ERROR:?\s*(.*)$/.exec(body)) || (m = /\bFATAL\b:?\s*(.*)$/.exec(body))) { this.emit({ kind: 'fatal', ...at, channel, message: m[1].trim() || body.trim() }); return; }
    // `***** Parsing %s on %s%s:  %s`: error|warning, file, location `(line)` or `(line,col)`, message.
    if ((m = /^\*{5} Parsing (error|warning) on (.+?)(?:\((\d+)(?:,\s*(\d+))?\))?:(?:\s+(.*))?$/.exec(text))) {
      this.emit({ kind: m[1] === 'error' ? 'parse-error' : 'parse-warning', ...at, channel, source: m[2].trim(), sourceLine: m[3] ? Number(m[3]) : null, column: m[4] ? Number(m[4]) : null, message: (m[5] || '').trim() || 'Parsing ' + m[1] });
      return;
    }
    if ((m = /^(Invalid content (?:width|height).*?this panel "([^"]*?) @ ([^"]+)".*)$/.exec(text))) {
      this.emit({ kind: 'layout-warning', ...at, channel, source: m[3].trim(), panel: m[2], message: m[1].replace(/\s*\(reverting.*$/i, '').trim() });
      return;
    }
    if ((m = /^\*{4} Panel (\S+) (has .*)$/.exec(text))) { this.emit({ kind: 'layout-warning', ...at, channel, source: null, panel: m[1], message: 'Panel ' + m[1] + ' ' + m[2].trim() }); return; }
    if ((m = /^\*{4} ((?:Failed to parse|Ignoring) panel property .*)$/.exec(text))) { this.emit({ kind: 'layout-warning', ...at, channel, source: null, panel: null, message: m[1].trim() }); return; }
    // Selector failures outside a "Parsing error" line still break the sheet that carries them.
    if (/^(?:Failed to parse selector\b|Selector exceeds temp buffer size\b)/.test(text)) { this.emit({ kind: 'panorama-error', ...at, channel, message: text.trim() }); return; }
    if (channel === 'Panorama' && /\b(error|failed|unable|cannot|could not)\b/i.test(text)) { this.emit({ kind: 'panorama-error', ...at, channel, message: text.trim() }); return; }
    if (channel === 'VScript' && /\b(error|failed|exception)\b/i.test(text)) { this.emit({ kind: 'vscript-error', ...at, channel, message: text.trim() }); return; }
    if ((m = /(?:^|\s)Uncaught\s+(.*)$/.exec(text))) { this.emit({ kind: 'uncaught', ...at, channel, message: m[1].trim() }); return; }
    if (!stamped) return;
    if ((m = /GC Connection established for server version (\d+)/.exec(body))) { this.emit({ kind: 'version', ...at, version: Number(m[1]) }); return; }
    if ((m = /\[Client\] Build: (\d+) \(revision (\d+)\)/.exec(body))) { this.emit({ kind: 'build', ...at, build: Number(m[1]), revision: m[2] }); return; }
    if ((m = /\[Filesystem\] (\w+)\s+"([^"]+)"/.exec(body))) {
      const pak = /[\\/]addons[\\/](pak\d+)(?:_dir)?\.vpk$/i.exec(m[2]);
      if (pak) this.emit({ kind: 'mount', ...at, pathId: m[1], pak: pak[1].toLowerCase(), path: m[2] });
    }
  }
}

// The three engine forms (panorama.dll fn 0xb23ec / 0xb2d9a):
//   JS Exception! *** Skipping rest of script *** \n\n<source>\nline:N, col:M\n\n>> <code>\n   at <fn>\n(<file>:N:M)
//   JS Exception!!\n\n(undefined:0) - <message>
//   \nJS(<file>:N:M)\n<text>\n<text>
function parseExceptionBlock(block) {
  const preset = block.preset || {};
  const entry = { kind: 'js-exception', line: block.line, time: block.time, channel: block.channel || null, source: preset.source || null, sourceLine: preset.sourceLine || null, column: preset.column || null, code: null, message: null, frames: [] };
  let fn = null;
  const texts = [];
  for (const raw of block.lines) {
    const text = raw.trim();
    let m;
    if (!text) continue;
    if ((m = /^\((.*?):(\d+)\) - (.*)$/.exec(text))) {
      if (m[1] && m[1] !== 'undefined' && !entry.source) entry.source = m[1];
      if (Number(m[2]) > 0 && !entry.sourceLine) entry.sourceLine = Number(m[2]);
      entry.message = m[3].replace(/^Uncaught\s+/, '').trim();
      continue;
    }
    if ((m = /^line:\s*(\d+),\s*col:\s*(\d+)/.exec(text))) { entry.sourceLine = Number(m[1]); entry.column = Number(m[2]); continue; }
    if ((m = /^>>\s?(.*)$/.exec(raw.trimStart()))) { entry.code = m[1].trim(); continue; }
    if ((m = /^Uncaught\s+(.*)$/.exec(text))) { entry.message = m[1].trim(); continue; }
    if ((m = /^at\s+(.*)$/.exec(text))) { fn = m[1].trim(); continue; }
    if ((m = /^\(?(.+?):(\d+):(\d+)\)?$/.exec(text)) && entry.source !== null) { entry.frames.push({ fn, file: m[1], line: Number(m[2]), column: Number(m[3]) }); fn = null; continue; }
    if (block.preset) { texts.push(text); continue; }
    if (entry.source === null) { entry.source = text; continue; }
    if (!entry.message) entry.message = text;
  }
  if (block.preset && texts.length) {
    // JS(...) form: the error text and the offending source line, in either order.
    const error = texts.find(text => /^(?:Uncaught\s+)?\w*(?:Error|Exception)\b/.test(text));
    if (!entry.message) entry.message = (error || texts[0]).replace(/^Uncaught\s+/, '');
    const code = texts.find(text => text !== (error || texts[0]));
    if (code && !entry.code) entry.code = code;
  }
  if (!entry.message) entry.message = 'JS exception (no message)';
  return entry;
}

function parseText(text) {
  const entries = [];
  const parser = new LogParser(entry => entries.push(entry));
  const lines = String(text).split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const line of lines) parser.push(line);
  parser.flush();
  return { entries, lines: parser.lineNo, sessions: parser.session, spans: parser.spans };
}

// ---------------------------------------------------------------------------------------------------
// Source mapping: compiled asset names -> lane sources, and the line by the quoted code or selector.
// ---------------------------------------------------------------------------------------------------
function assetPath(name) {
  if (!name) return null;
  let n = String(name).trim().replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
  n = n.replace(/^file:\/\/\{resources\}\//, 'panorama/').replace(/^(?:file:\/\/\/?|s2r:\/\/)/, '').replace(/^\/+/, '');
  if (/^(?:scripts|styles|layout|images)\//.test(n)) n = 'panorama/' + n;
  if (!/^panorama\/.+\.\w+$/.test(n)) return null;
  return n.replace(/\.v(js|css|xml|svg)_c$/, '.$1');
}

function createMapper({ root = REPO, prefer = null, fsx = fs } = {}) {
  const lanes = prefer ? [...LANES.filter(lane => lane.key === prefer), ...LANES.filter(lane => lane.key !== prefer)] : LANES;
  const texts = new Map();
  const read = rel => {
    if (!texts.has(rel)) {
      let lines = null;
      try { lines = fsx.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/); } catch { /* absent */ }
      // Logged handler code is entity-decoded; compare layouts the same way (line numbers are unchanged).
      if (lines && rel.endsWith('.xml')) lines = lines.map(line => line.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      texts.set(rel, lines);
    }
    return texts.get(rel);
  };
  const styleFiles = () => {
    const out = [];
    for (const lane of lanes) {
      const dir = path.join(root, lane.dir, 'panorama', 'styles');
      try { for (const name of fsx.readdirSync(dir).sort()) if (name.endsWith('.css')) out.push(lane.dir + '/panorama/styles/' + name); } catch { /* lane absent */ }
    }
    return out;
  };
  const layoutFiles = () => {
    const out = [];
    for (const lane of lanes) {
      const dir = path.join(root, lane.dir, 'panorama', 'layout');
      try { for (const name of fsx.readdirSync(dir).sort()) if (name.endsWith('.xml')) out.push(lane.dir + '/panorama/layout/' + name); } catch { /* lane absent */ }
    }
    return out;
  };

  function file(name) {
    const asset = assetPath(name);
    if (!asset) return null;
    const hits = lanes.filter(lane => read(lane.dir + '/' + asset)).map(lane => ({ lane: lane.key, file: lane.dir + '/' + asset }));
    if (!hits.length) return null;
    return { asset, file: hits[0].file, lane: hits[0].lane, alsoIn: hits.slice(1).map(hit => hit.lane) };
  }

  // The line in `rel` nearest `near` whose text contains `needle` (or matches the regex).
  function find(rel, needle, near = null) {
    const lines = read(rel);
    if (!lines || !needle) return null;
    const test = needle instanceof RegExp ? line => needle.test(line) : line => line.includes(needle);
    const hits = [];
    lines.forEach((line, index) => { if (test(line)) hits.push(index + 1); });
    if (!hits.length) return null;
    if (near == null) return hits[0];
    return hits.reduce((best, line) => Math.abs(line - near) < Math.abs(best - near) ? line : best, hits[0]);
  }

  function lineCount(rel) { const lines = read(rel); return lines ? lines.length : 0; }

  // Map one entry: { file, line, how } or null. `how`: code (quoted code found), text (selector/property
  // found), reported (the compiled line; debug builds keep source lines), file (no line).
  function locate(entry) {
    if (entry.kind === 'js-exception' || entry.kind === 'uncaught') {
      const mapped = file(entry.source) || (entry.frames || []).map(frame => file(frame.file)).find(Boolean) || null;
      if (mapped) {
        const reported = entry.sourceLine || ((entry.frames || []).find(frame => file(frame.file) && file(frame.file).file === mapped.file) || {}).line || null;
        const byCode = entry.code ? find(mapped.file, entry.code, reported) : null;
        if (byCode) return { ...mapped, line: byCode, how: byCode === reported ? 'code' : 'code (moved from ' + reported + ')' };
        if (reported && reported <= lineCount(mapped.file)) return { ...mapped, line: reported, how: entry.code ? 'reported (code not in source: release/minified build or stale source)' : 'reported' };
        return { ...mapped, line: null, how: 'file' };
      }
      // Inline XML handlers (CitadelHudEscapeMenu_EscapeMenu_oncancel): find the quoted code or the panel id.
      if (entry.source && !assetPath(entry.source)) {
        // <PanelType>_<id>_<event>: the quoted code first, then the id with that event, then the panel type.
        const handler = /^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(on[a-z]+)$/.exec(entry.source);
        const tries = [];
        if (entry.code) tries.push(['code', entry.code.slice(0, 80)]);
        if (handler) {
          tries.push(['panel id', new RegExp('id="' + handler[2] + '"[^>]*\\b' + handler[3] + '=|\\b' + handler[3] + '=[^>]*id="' + handler[2] + '"')]);
          tries.push(['panel type', new RegExp('<' + handler[1] + '\\b[^>]*\\b' + handler[3] + '=')]);
        }
        for (const [how, needle] of tries) {
          const hits = layoutFiles().map(rel => [rel, find(rel, needle)]).filter(([, line]) => line);
          if (!hits.length) continue;
          const [rel, line] = hits[0];
          const lane = LANES.find(item => rel.startsWith(item.dir + '/'));
          const alsoIn = hits.slice(1).filter(([other]) => other.endsWith(rel.slice(lane.dir.length))).map(([other]) => LANES.find(item => other.startsWith(item.dir + '/')).key);
          return { asset: rel.slice(lane.dir.length + 1), file: rel, lane: lane.key, alsoIn, line, how };
        }
      }
      return null;
    }
    if (entry.kind === 'fatal' || entry.kind === 'panorama-error') {
      const named = /'([^']+\.(?:xml|css|js|v\w+_c))'/.exec(entry.message) || /(\S+\.(?:xml|css|js|vxml_c|vcss_c|vjs_c))\b/.exec(entry.message);
      const mapped = named ? file(named[1]) : null;
      if (mapped) return { ...mapped, line: null, how: 'file' };
      // A selector failure that names no sheet: the lane stylesheet holding that selector.
      const needle = cssNeedle(entry.message);
      if (!needle) return null;
      for (const rel of styleFiles()) {
        const line = find(rel, needle);
        if (!line) continue;
        const lane = LANES.find(item => rel.startsWith(item.dir + '/'));
        return { asset: rel.slice(lane.dir.length + 1), file: rel, lane: lane.key, alsoIn: [], line, how: 'selector text' };
      }
      return null;
    }
    // "**** Panel <id> has fill-parent-flow ..." names no file: a lane layout declaring that id owns it.
    if (entry.kind === 'layout-warning' && !entry.source && entry.panel) {
      const id = new RegExp('\\bid="' + escapeRegex(entry.panel) + '"');
      for (const rel of layoutFiles()) {
        const line = find(rel, id);
        if (!line) continue;
        const lane = LANES.find(item => rel.startsWith(item.dir + '/'));
        return { asset: rel.slice(lane.dir.length + 1), file: rel, lane: lane.key, alsoIn: [], line, how: 'panel id' };
      }
      return null;
    }
    const mapped = file(entry.source);
    if (!mapped) return null;
    const needle = cssNeedle(entry.message) || includeNeedle(entry.message);
    const line = needle ? find(mapped.file, needle) : null;
    if (line) return { ...mapped, line, how: 'text' };
    // `(line)` from compiled sheets is usually 1 (unknown); `(line,col)` is a real position.
    if (entry.sourceLine && (entry.sourceLine > 1 || entry.column != null) && entry.sourceLine <= lineCount(mapped.file)) return { ...mapped, line: entry.sourceLine, how: 'reported' };
    return { ...mapped, line: null, how: 'file' };
  }

  return { file, find, locate, assetPath };
}

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What to search for in a stylesheet: compiled sheets report line 1, so the selector or declaration finds it.
function cssNeedle(message) {
  let m;
  // panorama.dll stylefile diagnostics. `Failed to parse selector` carries no text: no needle (the reported
  // line is used); `Unsupported combinator in selector: %c` names one character, too little to search for.
  if ((m = /(?:Error parsing style selector|Unknown panel type in style selector|Failed to parse selector|Selector exceeds temp buffer size|Found no selectors|Error parsing @keyframe selector):\s*(.+)$/.exec(message))) {
    const selector = m[1].trim().split(',')[0].trim();
    return selector.length > 60 ? selector.slice(0, 60) : selector;
  }
  if ((m = /Invalid value for property '([\w-]+)':\s*(.+)$/.exec(message))) return new RegExp('(?:^|[\\s;{])' + escapeRegex(m[1]) + '\\s*:\\s*' + escapeRegex(m[2].trim()).replace(/\\ /g, '\\s+').replace(/ /g, '\\s+'));
  if ((m = /Invalid property name:\s*([\w-]+)/.exec(message))) return new RegExp('(?:^|[\\s;{])' + escapeRegex(m[1]) + '\\s*:');
  if ((m = /Trying to apply missing animation:\s*(\S+)/.exec(message))) return m[1];
  if ((m = /Found unsupported CSS at-rule:\s*@?([\w-]+)/.exec(message))) return new RegExp('@' + escapeRegex(m[1]) + '\\b');
  return null;
}

function includeNeedle(message) {
  const m = /Failed to add include for file:\s*(\S+)/.exec(message);
  if (!m) return null;
  const base = m[1].replace(/\\/g, '/').split('/').pop().replace(/\.v?(js|css|xml)(?:_c)?$/, '');
  return new RegExp(escapeRegex(base) + '\\.v?(?:js|css|xml)(?:_c)?\\b');
}

// ---------------------------------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------------------------------
const HPV3_PROBLEM = /\b(failed|refused|unavailable|UNAVAILABLE|CONFLICT|race|pending|missing|dropped|could not|inactive|ignored)\b/;

function hpv3Category(message) {
  if (/^(?:menu|renderer) boot\b/.test(message)) return 'boot';
  if (/^(?:renderer timing|stamina cost)\b/.test(message) || /\bms=\d/.test(message)) return 'timing';
  if (/^(?:store|save)\b/.test(message) || /^colorblind (?:save|command)\b/.test(message)) return 'store';
  if (/^(?:lifecycle|hero|route|tiers|rules matched|identity)\b/.test(message)) return 'lifecycle';
  return 'diagnostic';
}

function stats(values) {
  const list = values.filter(value => Number.isFinite(value));
  if (!list.length) return null;
  const sum = list.reduce((a, b) => a + b, 0);
  const round = value => Math.round(value * 1000) / 1000;
  return { count: list.length, min: round(Math.min(...list)), avg: round(sum / list.length), max: round(Math.max(...list)) };
}

function timingSummary(lines) {
  const renderer = [], stamina = [], other = new Map();
  for (const line of lines) {
    let m;
    if ((m = /^renderer timing ticks=(\d+) ms=(\d+(?:\.\d+)?) paints=(\d+) state=(\S+)/.exec(line.message))) {
      renderer.push({ ticks: Number(m[1]), ms: Number(m[2]), paints: Number(m[3]), state: m[4] });
    } else if ((m = /^stamina cost (.+) (\S+) reads\/s=([\d.]+) skipped\/s=([\d.]+) ticks\/s=([\d.]+) paints=(\d+) ms=(\d+(?:\.\d+)?)/.exec(line.message))) {
      stamina.push({ hero: m[1], side: m[2], reads: Number(m[3]), skipped: Number(m[4]), ticksPerSecond: Number(m[5]), paints: Number(m[6]), ms: Number(m[7]) });
    } else if ((m = /\bms=(\d+(?:\.\d+)?)/.exec(line.message))) {
      const key = line.message.split(/\s+/).filter(word => !word.includes('=')).slice(0, 2).join(' ');
      if (!other.has(key)) other.set(key, []);
      other.get(key).push(Number(m[1]));
    }
  }
  const out = {};
  if (renderer.length) {
    const states = {};
    for (const window of renderer) states[window.state] = (states[window.state] || 0) + 1;
    out.renderer = {
      windows: renderer.length,
      ticks: stats(renderer.map(window => window.ticks)),
      ms: stats(renderer.map(window => window.ms)),
      msPerTick: stats(renderer.filter(window => window.ticks > 0).map(window => window.ms / window.ticks)),
      paints: Math.max(...renderer.map(window => window.paints)),
      states,
    };
  }
  if (stamina.length) {
    out.stamina = {
      lines: stamina.length,
      ms: stats(stamina.map(item => item.ms)),
      ticksPerSecond: stats(stamina.map(item => item.ticksPerSecond)),
      readsPerSecond: stats(stamina.map(item => item.reads)),
      sides: [...new Set(stamina.map(item => item.side))],
    };
  }
  if (other.size) out.other = Object.fromEntries([...other].map(([key, values]) => [key, stats(values)]));
  return out;
}

function groupBy(entries, keyOf) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (!groups.has(key)) groups.set(key, { ...entry, count: 0, firstTime: entry.time, lastTime: entry.time, firstLine: entry.line, lines: [] });
    const group = groups.get(key);
    group.count++;
    group.lastTime = entry.time || group.lastTime;
    if (group.lines.length < 5) group.lines.push(entry.line);
  }
  return [...groups.values()];
}

function sha256File(fsx, file) { return crypto.createHash('sha256').update(fsx.readFileSync(file)).digest('hex'); }

// Read-only: the installed citadel/addons/pak02_dir.vpk against every project's .build/{release,debug}/pak02_dir.vpk.
// Returns null without an install; match null means 'unknown build'.
function identifyPak02(addonsDir, { root = REPO, fsx = fs } = {}) {
  if (!addonsDir) return null;
  const installed = path.join(addonsDir, 'pak02_dir.vpk');
  if (!fsx.existsSync(installed)) return { file: installed, present: false, sha256: null, match: null };
  const sha = sha256File(fsx, installed);
  const stat = fsx.statSync(installed);
  const candidates = [];
  for (const project of PROJECT_NAMES) {
    for (const mode of ['release', 'debug']) {
      const built = stagePaths(projectConfig(project, root), mode).vpk;
      let builtStat = null;
      try { builtStat = fsx.statSync(built); } catch { continue; }
      const entry = { project, mode, file: path.relative(root, built).replace(/\\/g, '/'), mtimeMs: builtStat.mtimeMs };
      candidates.push(entry);
      try { if (builtStat.size === stat.size && sha256File(fsx, built) === sha) return { file: installed, present: true, sha256: sha, mtimeMs: stat.mtimeMs, match: entry, compared: candidates.length }; } catch { /* unreadable */ }
    }
  }
  return { file: installed, present: true, sha256: sha, mtimeMs: stat.mtimeMs, match: null, compared: candidates.length };
}

function describePak02(pak) {
  if (!pak) return 'installed pak02: no Deadlock install found';
  if (!pak.present) return 'installed pak02: none (' + pak.file + ')';
  return 'installed pak02: ' + pak.sha256.slice(0, 8) + ' = ' + (pak.match ? pak.match.project + ' ' + pak.match.mode + ' build (' + pak.match.file + ')' : 'unknown build (matches none of ' + pak.compared + ' built pak02 files)');
}

function readPin(root = REPO, fsx = fs) {
  return readPinVersion(repoPaths(root).pin, fsx);
}

// `addons`: the installed game's citadel/addons folder for the pak02 check (null: no install found).
function buildReport(parsed, { sinceBoot = false, file = null, root = REPO, fsx = fs, addons = null } = {}) {
  const lastSession = parsed.sessions;
  const entries = sinceBoot ? parsed.entries.filter(entry => entry.session === lastSession) : parsed.entries;
  const sessions = parsed.entries.filter(entry => entry.kind === 'session');
  const pak02 = identifyPak02(addons, { root, fsx });
  const mapper = createMapper({ root, prefer: pak02 && pak02.match ? pak02.match.project : null, fsx });

  for (const entry of entries) if (ERROR_KINDS.includes(entry.kind) || WARNING_KINDS.includes(entry.kind)) entry.mapped = mapper.locate(entry);
  const keyOf = entry => [entry.kind, entry.mapped ? entry.mapped.file + ':' + entry.mapped.line : entry.source || '', entry.message, entry.code || ''].join('|');
  const errors = groupBy(entries.filter(entry => ERROR_KINDS.includes(entry.kind)), keyOf);
  const warnings = groupBy(entries.filter(entry => WARNING_KINDS.includes(entry.kind)), keyOf);

  const hpv3 = entries.filter(entry => entry.kind === 'hpv3').map(entry => ({ ...entry, category: hpv3Category(entry.message), problem: HPV3_PROBLEM.test(entry.message) }));
  const sequence = [];
  for (const entry of hpv3.filter(item => item.category === 'boot' || item.category === 'lifecycle')) {
    const last = sequence[sequence.length - 1];
    if (last && last.message === entry.message) { last.count++; last.lastTime = entry.time; } else sequence.push({ time: entry.time, line: entry.line, message: entry.message, count: 1, lastTime: entry.time });
  }
  const storeEvents = hpv3.filter(entry => entry.category === 'store');
  const storeKinds = {};
  for (const entry of storeEvents) {
    const key = entry.message.replace(/\s+(?:at|from|to)\s+\S+.*$/, '').replace(/:.*$/, '').split(/\s+/).slice(0, 3).join(' ');
    storeKinds[key] = (storeKinds[key] || 0) + 1;
  }
  const diagnostics = {};
  for (const entry of hpv3.filter(item => item.category === 'diagnostic' && !item.problem)) {
    const key = entry.message.split(/\s+/).filter(word => !/[=:]/.test(word)).slice(0, 2).join(' ');
    diagnostics[key] = (diagnostics[key] || 0) + 1;
  }

  const versions = [...new Set(entries.filter(entry => entry.kind === 'version').map(entry => entry.version))];
  const builds = [...new Set(entries.filter(entry => entry.kind === 'build').map(entry => entry.build))];
  const revisions = [...new Set(entries.filter(entry => entry.kind === 'build').map(entry => entry.revision))];
  const mounts = [...new Set(entries.filter(entry => entry.kind === 'mount' && /^GAME$/i.test(entry.pathId)).map(entry => entry.pak))].sort();
  let steamInfVersion = null;
  if (file) {
    try { steamInfVersion = readClientVersion(fsx.readFileSync(path.join(path.dirname(file), 'steam.inf'), 'utf8')); } catch { /* not an install */ }
  }
  const spans = parsed.spans || {};
  const first = spans[sinceBoot ? lastSession : 1] || {}, last = spans[lastSession] || {};

  return {
    file, lines: parsed.lines, sessions: parsed.sessions, sinceBoot,
    window: { from: first.from || null, to: last.to || null },
    game: { version: versions.length ? versions[versions.length - 1] : null, versions, steamInf: steamInfVersion, pin: readPin(root, fsx), builds, revisions },
    paks: { mounted: mounts, pak02 },
    errors, warnings,
    ownWarnings: warnings.filter(group => group.mapped),
    vscript: warnings.filter(group => group.kind === 'vscript-error' && !group.mapped),
    foreignWarnings: warnings.filter(group => !group.mapped && group.kind !== 'vscript-error').reduce((sum, group) => sum + group.count, 0),
    hpv3: {
      lines: hpv3.length,
      sequence,
      store: { count: storeEvents.length, kinds: storeKinds, last: storeEvents.slice(-8).map(entry => ({ time: entry.time, line: entry.line, message: entry.message })) },
      problems: groupBy(hpv3.filter(entry => entry.problem), entry => entry.message.replace(/\d+/g, '#')),
      diagnostics,
      timing: timingSummary(hpv3.filter(entry => entry.category === 'timing')),
    },
    errorCount: errors.reduce((sum, group) => sum + group.count, 0),
  };
}

// ---------------------------------------------------------------------------------------------------
// Text output.
// ---------------------------------------------------------------------------------------------------
const clip = (text, max = 160) => { const one = String(text).replace(/\s+/g, ' ').trim(); return one.length > max ? one.slice(0, max - 1) + '…' : one; };
const fmtStats = (s, unit = '') => s ? 'min ' + s.min + unit + ' avg ' + s.avg + unit + ' max ' + s.max + unit : 'n/a';

function where(group) {
  if (group.mapped) return group.mapped.file + (group.mapped.line ? ':' + group.mapped.line : '') + (group.mapped.alsoIn && group.mapped.alsoIn.length ? ' (also ' + group.mapped.alsoIn.join(', ') + ')' : '');
  return group.source ? String(group.source).replace(/\\/g, '/') + (group.sourceLine ? '(' + group.sourceLine + ')' : '') + ' (not a lane file)' : '(no file)';
}

function formatGroup(group) {
  const out = ['  ' + String(group.count).padStart(3) + 'x ' + LABEL[group.kind].padEnd(15) + ' ' + where(group)];
  out.push('       ' + clip(group.message) + '  [log line ' + group.firstLine + (group.firstTime ? ', ' + group.firstTime : '') + ']');
  if (group.kind === 'js-exception') {
    const compiled = (group.source || '(no source in the log)') + (group.sourceLine ? ' line ' + group.sourceLine + (group.column ? ':' + group.column : '') : '');
    out.push('       compiled: ' + clip(compiled, 120) + (group.mapped ? '  (line by ' + group.mapped.how + ')' : ''));
    if (group.code) out.push('       >> ' + clip(group.code, 140));
  } else if (group.mapped && group.mapped.how && group.mapped.how !== 'file') out.push('       (line by ' + group.mapped.how + ')');
  return out;
}

function formatReport(report, { only = null, allWarnings = false } = {}) {
  const out = [];
  const show = section => !only || only === section;
  out.push('console.log: ' + (report.file || '(input)') + ' (' + report.lines + ' lines, ' + report.sessions + ' session' + (report.sessions === 1 ? '' : 's') + (report.sinceBoot ? ', latest session only' : '') + (report.window.from ? ', ' + report.window.from + ' .. ' + report.window.to : '') + ')');
  const game = report.game;
  const version = game.version != null ? 'game version ' + game.version + ' (GC)' : 'game version not in log';
  const inf = game.steamInf != null ? ', steam.inf ' + game.steamInf : '';
  const pin = game.pin != null ? ', v3 pin ' + game.pin + ((game.version || game.steamInf) && (game.version || game.steamInf) !== game.pin ? ' (differs)' : '') : '';
  out.push(version + inf + pin + (game.revisions.length ? ', source revision ' + game.revisions.join('/') : '') + (game.builds.length ? ', client builds ' + game.builds.join('/') : ''));
  const paks = report.paks;
  let pakLine = 'addon paks mounted: ' + (paks.mounted.length ? paks.mounted.join(' ') : 'none in log');
  out.push(pakLine);
  out.push(describePak02(paks.pak02));

  if (show('errors')) {
    out.push('');
    if (report.errors.length) {
      out.push('ERRORS: ' + report.errorCount + ' line' + (report.errorCount === 1 ? '' : 's') + ' in ' + report.errors.length + ' group' + (report.errors.length === 1 ? '' : 's'));
      for (const group of report.errors) out.push(...formatGroup(group));
    } else out.push('ERRORS: none (no Parsing error, FATAL, Uncaught or JS exception)');
    const own = report.ownWarnings;
    if (own.length) {
      out.push('WARNINGS on lane files: ' + own.reduce((sum, group) => sum + group.count, 0));
      for (const group of own) out.push(...formatGroup(group));
    }
    if (report.vscript.length) {
      out.push('VScript channel errors: ' + report.vscript.reduce((sum, group) => sum + group.count, 0) + ' (listed, not counted as console errors)');
      for (const group of report.vscript) out.push('  ' + String(group.count).padStart(3) + 'x ' + clip(group.message, 140) + '  [log line ' + group.firstLine + (group.firstTime ? ', ' + group.firstTime : '') + ']');
    }
    if (report.foreignWarnings) {
      out.push('stock/other-mod warnings: ' + report.foreignWarnings + ' (not lane files' + (allWarnings ? '' : '; --all-warnings lists them') + ')');
      if (allWarnings) for (const group of report.warnings.filter(item => !item.mapped && item.kind !== 'vscript-error')) out.push('  ' + String(group.count).padStart(3) + 'x ' + where(group) + ': ' + clip(group.message, 120));
    }
  }

  const h = report.hpv3;
  if (show('hpv3')) {
    out.push('');
    if (!h.lines) out.push('HPV3: no [HPV3] lines (a release build logs nothing; install a debug build to see boot/save/timing lines)');
    else {
      out.push('HPV3: ' + h.lines + ' debug line' + (h.lines === 1 ? '' : 's'));
      if (h.sequence.length) {
        out.push('  boot/lifecycle (' + h.sequence.length + '):');
        const list = h.sequence.length > 24 ? [...h.sequence.slice(0, 8), null, ...h.sequence.slice(-14)] : h.sequence;
        for (const item of list) out.push(item ? '    ' + (item.time || '') + ' ' + clip(item.message, 120) + (item.count > 1 ? ' (x' + item.count + ' to ' + item.lastTime + ')' : '') : '    …');
      }
      if (h.store.count) {
        out.push('  save/store: ' + h.store.count + ' event' + (h.store.count === 1 ? '' : 's') + ' (' + Object.entries(h.store.kinds).map(([key, n]) => key + ' ' + n).join(', ') + ')');
        for (const item of h.store.last) out.push('    ' + (item.time || '') + ' ' + clip(item.message, 120));
      }
      if (h.problems.length) {
        out.push('  problems: ' + h.problems.reduce((sum, group) => sum + group.count, 0));
        for (const group of h.problems) out.push('    ' + String(group.count).padStart(3) + 'x ' + clip(group.message, 140) + '  [first ' + (group.firstTime || 'line ' + group.firstLine) + ']');
      }
      const diag = Object.entries(h.diagnostics);
      if (diag.length) out.push('  diagnostics: ' + diag.map(([key, n]) => key + ' ' + n).join(', '));
    }
  }
  if (show('timing') || show('hpv3')) {
    const t = h.timing;
    if (t.renderer || t.stamina || t.other) {
      if (only === 'timing') out.push('');
      out.push('  timing:');
      if (t.renderer) {
        out.push('    renderer timing: ' + t.renderer.windows + ' windows (5 s); ticks/window ' + fmtStats(t.renderer.ticks) + '; ms/window ' + fmtStats(t.renderer.ms));
        out.push('      ms/tick ' + fmtStats(t.renderer.msPerTick) + '; full paints ' + t.renderer.paints + '; states ' + Object.entries(t.renderer.states).map(([key, n]) => key + ' ' + n).join(', '));
      }
      if (t.stamina) out.push('    stamina cost: ' + t.stamina.lines + ' lines (10 s, ' + t.stamina.sides.join('/') + '); ms ' + fmtStats(t.stamina.ms) + '; ticks/s ' + fmtStats(t.stamina.ticksPerSecond) + '; reads/s ' + fmtStats(t.stamina.readsPerSecond));
      if (t.other) for (const [key, s] of Object.entries(t.other)) out.push('    ' + key + ': ' + s.count + ' lines; ms ' + fmtStats(s));
    } else if (only === 'timing') out.push('', 'timing: no [HPV3] timing lines (renderer timing / stamina cost come from debug builds only)');
  }
  out.push('');
  const failing = report.errors.length && (!only || only === 'errors');
  out.push('result: ' + (report.errors.length ? report.errors.length + ' error group' + (report.errors.length === 1 ? '' : 's') + (failing ? ' -> exit 1' : ' (not checked with --only ' + only + ')') : 'console clean'));
  return out.join('\n');
}

function jsonReport(report) { return JSON.stringify(report, null, 2); }

// ---------------------------------------------------------------------------------------------------
// --follow: poll the file, parse appended lines, print errors and [HPV3] lines as they arrive.
// ---------------------------------------------------------------------------------------------------
function followLine(entry, mapper, only) {
  const isError = ERROR_KINDS.includes(entry.kind);
  if (entry.kind === 'session') return only ? null : '--- new game session (log line ' + entry.line + ') ---';
  if (isError && (!only || only === 'errors')) {
    const mapped = mapper.locate(entry);
    return (entry.time || '') + ' ' + LABEL[entry.kind] + ' ' + (mapped ? mapped.file + (mapped.line ? ':' + mapped.line : '') : entry.source || '') + ' ' + clip(entry.message, 140);
  }
  if (entry.kind === 'parse-warning' || entry.kind === 'layout-warning' || entry.kind === 'vscript-error') {
    if (only && only !== 'errors') return null;
    if (entry.kind === 'vscript-error') return (entry.time || '') + ' VScript error ' + clip(entry.message, 140);
    const mapped = mapper.locate(entry);
    return mapped ? (entry.time || '') + ' ' + LABEL[entry.kind] + ' ' + mapped.file + (mapped.line ? ':' + mapped.line : '') + ' ' + clip(entry.message, 120) : null;
  }
  if (entry.kind === 'hpv3') {
    const category = hpv3Category(entry.message);
    if (only === 'errors' || (only === 'timing' && category !== 'timing')) return null;
    return (entry.time || '') + ' [HPV3] ' + clip(entry.message, 180);
  }
  return null;
}

function follow(file, opts, deps, startOffset) {
  const mapper = createMapper({});
  let offset = startOffset, partial = '', errors = 0, idle = null;
  const parser = new LogParser(entry => {
    if (ERROR_KINDS.includes(entry.kind)) errors++;
    const line = followLine(entry, mapper, opts.only);
    if (line) deps.log(line);
  });
  parser.session = 1;
  deps.log('following ' + file + ' (Ctrl+C stops)');
  const tick = () => {
    let size;
    try { size = deps.fs.statSync(file).size; } catch { return; }
    if (size < offset) { deps.log('--- log truncated (game restarted) ---'); offset = 0; partial = ''; }
    if (size === offset) return;
    const fd = deps.fs.openSync(file, 'r');
    const buffer = Buffer.alloc(size - offset);
    deps.fs.readSync(fd, buffer, 0, buffer.length, offset);
    deps.fs.closeSync(fd);
    offset = size;
    const lines = (partial + buffer.toString('utf8')).split('\n');
    partial = lines.pop();
    for (const line of lines) parser.push(line);
    clearTimeout(idle);
    // An exception block has no terminator; close it once the log goes quiet.
    idle = setTimeout(() => parser.flush(), 1000);
  };
  const timer = setInterval(tick, 500);
  return new Promise(resolve => {
    process.once('SIGINT', () => {
      clearInterval(timer);
      parser.flush();
      deps.log('stopped; ' + errors + ' error line' + (errors === 1 ? '' : 's') + ' while following');
      resolve(errors ? 1 : 0);
    });
  });
}

// ---------------------------------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------------------------------
async function main(argv = process.argv.slice(2), deps = defaultDeps()) {
  let opts;
  try { opts = parseArgs(argv); } catch (error) { deps.error('logscan.js: ' + error.message); return 2; }
  if (opts.help) { deps.log(cli.helpText(__filename, 3, 24)); return 0; }
  const install = discoverInstall(opts, deps);
  const found = findConsoleLog(opts, deps, install);
  if (!found.file) {
    deps.error('logscan.js: no console.log found. Tried:\n' + found.tried.map(file => '  ' + file).join('\n') +
      '\nLaunch Deadlock with -condebug (it writes game/citadel/console.log), or pass --file <console.log> / --installed-steam-inf <steam.inf>.');
    return 2;
  }
  const text = deps.fs.readFileSync(found.file, 'utf8');
  // The pak02 check reads the discovered install's addons folder (also for --file: it describes the game).
  const addons = install.steamInf ? path.join(path.dirname(install.steamInf), 'addons') : null;
  const report = buildReport(parseText(text), { sinceBoot: opts.sinceBoot, file: found.file, fsx: deps.fs, addons });
  if (opts.json) deps.log(jsonReport({ ...report, found: found.how, install: { steamInf: install.steamInf, source: install.source } }));
  else deps.log(formatReport(report, opts));
  const code = report.errors.length && (!opts.only || opts.only === 'errors') ? 1 : 0;
  if (opts.follow) {
    const followed = await follow(found.file, opts, deps, Buffer.byteLength(text, 'utf8'));
    return Math.max(code, followed);
  }
  return code;
}

module.exports = {
  USAGE, LANES, ERROR_KINDS, WARNING_KINDS, parseArgs, discoverInstall, findConsoleLog, describePak02, LogParser, parseText, parseExceptionBlock,
  assetPath, createMapper, cssNeedle, hpv3Category, timingSummary, identifyPak02, buildReport, formatReport, followLine, main,
};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.stack || error.message); process.exitCode = 2; });
}
