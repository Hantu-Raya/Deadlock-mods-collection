#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_LOG_DIR = 'G:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\bin\\win64';
const DEFAULT_VPK = 'G:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\addons\\pak97_dir.vpk';

const args = process.argv.slice(2);
let explicitLogPath = '';
let sinceFile = fs.existsSync(DEFAULT_VPK) ? DEFAULT_VPK : '';
let waitSeconds = 0;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--wait') {
    waitSeconds = Math.max(0, Number(args[++i] || 0) || 0);
  } else if (arg === '--since-file') {
    sinceFile = args[++i] || '';
  } else if (arg === '--no-since') {
    sinceFile = '';
  } else if (!arg.startsWith('--')) {
    explicitLogPath = arg;
  }
}

function fail(message) {
  console.error(`[HERO SELECTOR LOG FAIL] ${message}`);
  process.exit(1);
}

function getMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (err) {
    return 0;
  }
}

function getCandidateLogs() {
  if (explicitLogPath) return [explicitLogPath];
  if (!fs.existsSync(DEFAULT_LOG_DIR)) return [];
  return fs.readdirSync(DEFAULT_LOG_DIR)
    .filter(name => /^W.*\.log$/i.test(name))
    .map(name => path.join(DEFAULT_LOG_DIR, name))
    .sort((a, b) => getMtime(b) - getMtime(a));
}

function scanLog(logPath) {
  const text = fs.readFileSync(logPath, 'utf8');
  const allLines = text.split(/\r?\n/);
  const lines = allLines.filter(line =>
    line.includes('[HP-COLORS][HERO-SELECTOR]') ||
    line.includes('[HP-COLORS][HERO-PRESET]')
  );
  const errorLines = allLines.filter(line =>
    /error|exception|script/i.test(line) &&
    /anita_ui_core|AnitaPresetHero|HP-COLORS|HERO-SELECTOR|HERO-PRESET/i.test(line)
  );
  return {
    logPath,
    lines,
    toggleLines: lines.filter(line => line.includes('event=toggle')),
    presetLines: lines.filter(line => line.includes('event=hero_changed') || line.includes('event=preset_apply')),
    errorLines
  };
}

function appendErrorHint(reason, errorLines) {
  if (!errorLines.length) return reason;
  return `${reason} Fresh selector-related error lines: ${errorLines.slice(-3).join(' | ')}`;
}

function readEvents() {
  const logs = getCandidateLogs();
  if (!logs.length) {
    return { ok: false, reason: explicitLogPath ? `Log not found: ${explicitLogPath}` : `No W*.log files found in ${DEFAULT_LOG_DIR}` };
  }

  const sinceMtime = sinceFile ? getMtime(sinceFile) : 0;
  if (sinceFile && !sinceMtime) {
    return { ok: false, reason: `Since-file not found: ${sinceFile}` };
  }

  const freshLogs = sinceMtime ? logs.filter(logPath => getMtime(logPath) >= sinceMtime) : logs;
  if (!freshLogs.length) {
    const newest = logs[0];
    return {
      ok: false,
      reason: `All W*.log files are older than ${sinceFile}; newest is ${newest}. Launch Deadlock after the latest pak97_dir.vpk deploy and click the hero selector.`
    };
  }

  const combined = {
    logPath: freshLogs[0],
    lines: [],
    toggleLines: [],
    presetLines: [],
    errorLines: []
  };
  for (const logPath of freshLogs) {
    const result = scanLog(logPath);
    combined.lines.push(...result.lines);
    combined.toggleLines.push(...result.toggleLines);
    combined.presetLines.push(...result.presetLines);
    combined.errorLines.push(...result.errorLines);
    if (result.lines.length) combined.logPath = logPath;
  }

  if (combined.toggleLines.length || combined.presetLines.length) {
    return { ok: true, ...combined };
  }

  if (combined.lines.length) {
    return { ok: false, reason: appendErrorHint(`Found ${combined.lines.length} hero event(s) in fresh W*.log files, but no selector toggle or preset apply/change event.`, combined.errorLines) };
  }
  return { ok: false, reason: appendErrorHint(`No [HP-COLORS][HERO-SELECTOR] or [HP-COLORS][HERO-PRESET] events found in fresh W*.log files.`, combined.errorLines) };
}

function pass(result) {
  console.log(`[HERO SELECTOR LOG PASS] fresh W*.log files`);
  console.log(`  toggle events: ${result.toggleLines.length}`);
  console.log(`  hero preset events: ${result.presetLines.length}`);
  console.log(`  last event: ${result.lines[result.lines.length - 1]}`);
}

async function main() {
  const deadline = Date.now() + waitSeconds * 1000;
  let lastReason = '';
  do {
    const result = readEvents();
    if (result.ok) {
      pass(result);
      return;
    }
    lastReason = result.reason;
    if (!waitSeconds || Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (true);
  fail(lastReason);
}

main().catch(err => fail(err && err.message ? err.message : String(err)));
